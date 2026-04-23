/**
 * Minimal VLQ decoder + sourcemap resolver.
 * Used to map compiled JS positions back to original source file/line.
 */

export interface ResolvedLocation {
  source: string  // original file path (relative or absolute)
  line: number    // 1-based
  column: number
}

// ─── VLQ / Base64 ────────────────────────────────────────────────────────────

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64Digit(ch: string): number {
  const idx = BASE64_CHARS.indexOf(ch)
  if (idx === -1) throw new Error(`Invalid base64 VLQ character: ${ch}`)
  return idx
}

/**
 * Decode a VLQ-encoded string into an array of integers.
 * Each integer uses base64 digits in groups of 5 bits (4 value + 1 continuation).
 * The LSB of the first group is the sign bit.
 */
function decodeVlq(encoded: string): number[] {
  const result: number[] = []
  let i = 0
  while (i < encoded.length) {
    let value = 0
    let shift = 0
    let digit: number
    do {
      if (i >= encoded.length) throw new Error('Unexpected end of VLQ string')
      digit = base64Digit(encoded[i]!)
      i++
      value |= (digit & 0x1f) << shift
      shift += 5
    } while (digit & 0x20)  // continuation bit

    // LSB is sign bit
    const negate = value & 1
    value >>= 1
    result.push(negate ? -value : value)
  }
  return result
}

// ─── Sourcemap types ──────────────────────────────────────────────────────────

interface RawSourcemap {
  version: number
  sources?: string[]
  sourceRoot?: string
  mappings?: string
  sourcesContent?: Array<string | null>
  names?: string[]
  // Index sourcemap (Turbopack uses this to combine per-module maps)
  sections?: Array<{
    offset: { line: number; column: number }
    map: RawSourcemap
  }>
}

interface MappingEntry {
  generatedLine: number    // 0-based
  generatedColumn: number  // 0-based
  sourceIndex: number
  originalLine: number     // 0-based
  originalColumn: number   // 0-based
}

/**
 * Parse the "mappings" field of a sourcemap into structured entries.
 * Only entries that have source info (4+ fields) are kept.
 */
function parseMappings(mappingsStr: string, sources: string[]): MappingEntry[] {
  const entries: MappingEntry[] = []

  let genLine = 0
  let sourceIndex = 0
  let originalLine = 0
  let originalColumn = 0

  const groups = mappingsStr.split(';')
  for (const group of groups) {
    let genColumn = 0
    const segments = group.split(',')
    for (const segment of segments) {
      if (!segment) continue
      const fields = decodeVlq(segment)
      genColumn += fields[0] ?? 0

      if (fields.length >= 4) {
        sourceIndex    += fields[1] ?? 0
        originalLine   += fields[2] ?? 0
        originalColumn += fields[3] ?? 0

        if (sourceIndex >= 0 && sourceIndex < sources.length) {
          entries.push({
            generatedLine: genLine,
            generatedColumn: genColumn,
            sourceIndex,
            originalLine,
            originalColumn,
          })
        }
      }
    }
    genLine++
  }

  return entries
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Given a sourcemap JSON string and a generated (compiled) position (0-based),
 * return the original source location (1-based line).
 */
/**
 * Resolve a position within a flat sourcemap (sources + mappings).
 */
function resolveInFlatMap(
  map: RawSourcemap,
  generatedLine: number,
  generatedColumn: number,
): ResolvedLocation | null {
  const sources = map.sources ?? []
  const mappings = map.mappings ?? ''
  if (!sources.length || !mappings) return null

  const entries = parseMappings(mappings, sources)

  // Find the best match: same line, largest column <= generatedColumn
  let best: MappingEntry | null = null
  for (const entry of entries) {
    if (entry.generatedLine !== generatedLine) continue
    if (entry.generatedColumn > generatedColumn) continue
    if (!best || entry.generatedColumn > best.generatedColumn) {
      best = entry
    }
  }

  if (!best) return null

  const rawSource = sources[best.sourceIndex] ?? ''
  const source = map.sourceRoot
    ? `${map.sourceRoot.replace(/\/$/, '')}/${rawSource}`
    : rawSource

  return {
    source,
    line: best.originalLine + 1,   // convert to 1-based
    column: best.originalColumn,
  }
}

export function resolveInSourcemap(
  mapJson: string,
  generatedLine: number,
  generatedColumn: number,
): ResolvedLocation | null {
  let map: RawSourcemap
  try {
    map = JSON.parse(mapJson) as RawSourcemap
  } catch {
    return null
  }

  // Index sourcemap (Turbopack): each section covers a range of generated lines.
  // Find the last section whose offset is <= the target line, then resolve within it.
  if (map.sections?.length) {
    // Sections are sorted by offset.line ascending
    let bestSection = map.sections[0]
    for (const section of map.sections) {
      if (section.offset.line > generatedLine) break
      bestSection = section
    }
    if (!bestSection) return null

    const localLine   = generatedLine   - bestSection.offset.line
    const localColumn = bestSection.offset.line === generatedLine
      ? generatedColumn - bestSection.offset.column
      : generatedColumn

    return resolveInFlatMap(bestSection.map, localLine, localColumn)
  }

  return resolveInFlatMap(map, generatedLine, generatedColumn)
}

/**
 * Fetch the sourcemap for a script URL and resolve a generated position to
 * the original source location.
 *
 * @param scriptUrl    - The URL of the compiled JS file
 * @param sourceMapURL - Value of the `//# sourceMappingURL=` comment
 * @param generatedLine   - 0-based line in the compiled output
 * @param generatedColumn - 0-based column in the compiled output
 */
export async function fetchAndResolveSourcemap(
  scriptUrl: string,
  sourceMapURL: string,
  generatedLine: number,
  generatedColumn: number,
): Promise<ResolvedLocation | null> {
  try {
    // Resolve the sourcemap URL relative to the script URL
    const mapUrl = sourceMapURL.startsWith('data:')
      ? sourceMapURL
      : new URL(sourceMapURL, scriptUrl).href

    let mapJson: string
    if (mapUrl.startsWith('data:')) {
      // Inline sourcemap: data:application/json;base64,<payload>
      const comma = mapUrl.indexOf(',')
      if (comma === -1) return null
      const payload = mapUrl.slice(comma + 1)
      const isBase64 = mapUrl.slice(0, comma).includes('base64')
      mapJson = isBase64 ? atob(payload) : decodeURIComponent(payload)
    } else {
      const resp = await fetch(mapUrl)
      if (!resp.ok) return null
      mapJson = await resp.text()
    }

    return resolveInSourcemap(mapJson, generatedLine, generatedColumn)
  } catch (err) {
    console.error('[DE sm] error:', err)
    return null
  }
}
