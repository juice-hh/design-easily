/**
 * Pure HTML template builders and shared utilities for InspectPanel.
 * Extracted to keep inspect-panel.ts under 500 lines.
 */

export function escapeHtmlStr(text: string): string {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}

export function colorToHexStr(color: string): string {
  const m = color.match(/\d+/g)
  if (!m || m.length < 3) return color
  return '#' + m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function buildPropRows(entries: Array<{ k: string; v: string; color?: string }>): string {
  return entries.map(({ k, v, color: c }) => `
    <div class="ip-prop">
      ${c ? `<div class="ip-prop-swatch" style="background:${c}"></div>` : ''}
      <span class="ip-prop-k">${k}</span>
      <span class="ip-prop-v">${escapeHtmlStr(v)}</span>
    </div>`).join('')
}

export function buildStyleEntries(
  computedStyles: Record<string, string>,
): Array<{ k: string; v: string; color?: string }> {
  const entries: Array<{ k: string; v: string; color?: string }> = []
  const bg = computedStyles['backgroundColor'] ?? ''
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') entries.push({ k: '背景', v: colorToHexStr(bg), color: bg })
  const radius = computedStyles['borderRadius']
  if (radius && radius !== '0px') entries.push({ k: '圆角', v: radius })
  const padding = computedStyles['padding']
  if (padding && padding !== '0px') entries.push({ k: '内距', v: padding })
  const shadow = computedStyles['boxShadow']
  if (shadow && shadow !== 'none') entries.push({ k: '阴影', v: shadow.slice(0, 20) + '…' })
  return entries
}

export function buildFontEntries(
  computedStyles: Record<string, string>,
): Array<{ k: string; v: string; color?: string }> {
  const entries: Array<{ k: string; v: string; color?: string }> = []
  const ff = computedStyles['fontFamily']
  if (ff) entries.push({ k: '字体', v: ff.split(',')[0].replace(/['"]/g, '').trim() })
  const fs = computedStyles['fontSize']
  if (fs) entries.push({ k: '字号', v: fs })
  const fw = computedStyles['fontWeight']
  if (fw) entries.push({ k: '字重', v: fw })
  const color = computedStyles['color'] ?? ''
  if (color) entries.push({ k: '颜色', v: colorToHexStr(color), color })
  return entries
}

// ─── State view HTML templates ────────────────────────────────────────────────

export function runningViewHtml(
  elementLabel: string,
  userMessage: string,
  status: 'analyzing' | 'editing',
  styles: string,
): string {
  const e = escapeHtmlStr
  return `
    <style>${styles}</style>
    <div class="panel">
      <div class="ip-task-header">
        <span class="ip-task-title">开发任务</span>
        <button class="ip-task-cancel" data-action="task-cancel">✕ 取消</button>
      </div>
      <div class="ip-task-snapshot">
        <div class="ip-task-elem">${e(elementLabel)}</div>
        <div class="ip-task-msg">${e(userMessage)}</div>
      </div>
      <div class="ip-task-status">
        <div class="ip-spinner"></div>
        <span>${status === 'editing' ? '修改文件中…' : '分析代码中…'}</span>
      </div>
    </div>`
}

export function successViewHtml(
  elementLabel: string,
  userMessage: string,
  summary: string,
  changedFiles: string[],
  styles: string,
): string {
  const e = escapeHtmlStr
  const filesHtml = changedFiles.length
    ? changedFiles.map((f) => {
        const short = f.split('/').slice(-2).join('/')
        return `<div class="ip-result-file" data-file="${e(f)}">📄 ${e(short)}</div>`
      }).join('')
    : ''
  return `
    <style>${styles}</style>
    <div class="panel">
      <div class="ip-task-header"><span class="ip-task-title">开发完成</span></div>
      <div class="ip-task-snapshot">
        <div class="ip-task-elem">${e(elementLabel)}</div>
        <div class="ip-task-msg">${e(userMessage)}</div>
      </div>
      <div class="ip-result-body">
        <div class="ip-result-icon">✅</div>
        <div class="ip-result-summary">${e(summary)}</div>
        ${filesHtml ? `<div class="ip-result-files">${filesHtml}</div>` : ''}
        <div class="ip-result-actions">
          <button class="ip-btn-sm ghost" data-action="resume-inspect">继续审查</button>
        </div>
      </div>
    </div>`
}

export function noChangesViewHtml(
  elementLabel: string,
  userMessage: string,
  summary: string,
  styles: string,
): string {
  const e = escapeHtmlStr
  return `
    <style>${styles}</style>
    <div class="panel">
      <div class="ip-task-header"><span class="ip-task-title">未修改文件</span></div>
      <div class="ip-task-snapshot">
        <div class="ip-task-elem">${e(elementLabel)}</div>
        <div class="ip-task-msg">${e(userMessage)}</div>
      </div>
      <div class="ip-result-body">
        <div class="ip-result-icon">⚠️</div>
        <div class="ip-result-summary">${e(summary)}</div>
        <div class="ip-result-actions">
          <button class="ip-btn-sm ghost" data-action="resume-inspect">继续审查</button>
        </div>
      </div>
    </div>`
}

export function errorViewHtml(
  elementLabel: string | null,
  userMessage: string | null,
  error: string,
  hasSnap: boolean,
  styles: string,
): string {
  const e = escapeHtmlStr
  const snapHtml = hasSnap && elementLabel && userMessage ? `
    <div class="ip-task-snapshot">
      <div class="ip-task-elem">${e(elementLabel)}</div>
      <div class="ip-task-msg">${e(userMessage)}</div>
    </div>` : ''
  return `
    <style>${styles}</style>
    <div class="panel">
      <div class="ip-task-header"><span class="ip-task-title">开发失败</span></div>
      ${snapHtml}
      <div class="ip-error-body">
        <div class="ip-error-icon">❌</div>
        <div class="ip-error-msg">${e(error)}</div>
        <div class="ip-error-actions">
          <button class="ip-btn-sm ghost" data-action="resume-inspect">返回</button>
          ${hasSnap ? `<button class="ip-btn-sm primary" data-action="retry">重试</button>` : ''}
        </div>
      </div>
    </div>`
}
