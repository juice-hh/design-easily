/** Design Easily — shared design tokens for Shadow DOM components. */

/** Primary accent color (purple). */
export const ACCENT = '#8B5CF6'

/** Accent hover / pressed state. */
export const ACCENT_HOVER = '#7C3AED'

/** Accent as RGB triplet for use in rgba(). */
export const ACCENT_RGB = '139, 92, 246'

/** Frosted glass panel background — semi-transparent dark. */
export const PANEL_BG = 'rgba(22, 22, 24, 0.72)'

/** Frosted glass toolbar background — slightly lighter. */
export const TOOLBAR_BG = 'rgba(22, 22, 24, 0.78)'

/**
 * Z-index stacking order for Design Easily overlay layers.
 * All values are near INT_MAX to sit above page content.
 * Must match server default port (server/src/config.ts PORT default).
 */
export const Z = {
  /** Edit mode multi-select preview overlay — below highlight. */
  EDIT_PREVIEW: 2147483639,
  /** Inspect/ruler hover highlight — bottom layer. */
  HIGHLIGHT: 2147483640,
  /** Edit mode selection overlay (border + handles). */
  EDIT_OVERLAY: 2147483641,
  /** Ruler overlay lines. */
  RULER: 2147483642,
  /** Comment mode hover highlight. */
  COMMENT_HIGHLIGHT: 2147483643,
  /** Comment bubble badge. */
  COMMENT_BUBBLE: 2147483644,
  /** Comment dialog / config panel. */
  DIALOG: 2147483645,
  /** Inspect info panel. */
  PANEL: 2147483646,
  /** Toolbar — top layer. */
  TOOLBAR: 2147483647,
} as const

/** Default WebSocket port — must match server/src/config.ts PORT default (3771). */
export const DEFAULT_WS_PORT = 3771
