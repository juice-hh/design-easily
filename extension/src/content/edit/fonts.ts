/**
 * Local font enumeration using the Local Font Access API (Chrome 103+).
 * Falls back to a curated list of common system fonts.
 */

const FALLBACK_FONTS = [
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana',
  'Tahoma', 'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Courier New',
  '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text',
  'Helvetica Neue', 'Hiragino Sans GB', 'PingFang SC', 'Microsoft YaHei',
  'Source Han Sans CN', 'Noto Sans CJK SC',
]

let cachedFonts: string[] | null = null

export async function getLocalFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts

  // Local Font Access API
  if ('queryLocalFonts' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fonts: any[] = await (window as any).queryLocalFonts()
      const families = [...new Set<string>(fonts.map((f) => f.family as string))].sort()
      cachedFonts = families
      return families
    } catch {
      // Permission denied or API unavailable, fall through
    }
  }

  cachedFonts = FALLBACK_FONTS
  return FALLBACK_FONTS
}
