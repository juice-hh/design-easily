/** CSS for InspectPanel Shadow DOM — imported by inspect-panel.ts */

import { ACCENT, ACCENT_HOVER, Z } from './tokens.js'

export const PANEL_STYLES = `
  :host {
    all: initial;
    position: fixed;
    top: 56px;
    right: 12px;
    z-index: ${Z.PANEL};
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
    width: 260px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .panel {
    background: rgba(28, 28, 30, 0.88);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset;
    overflow: hidden;
    color: rgba(255,255,255,0.9);
    font-size: 11px;
  }
  .ip-header {
    padding: 10px 12px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .ip-badge {
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.1); border-radius: 5px;
    padding: 3px 7px; font-size: 10px; font-weight: 600;
    color: rgba(255,255,255,0.7); margin-bottom: 7px;
  }
  .ip-name {
    font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 3px;
  }
  .ip-path {
    font-size: 10px; color: rgba(255,255,255,0.35);
    font-family: "SF Mono","Menlo",monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    cursor: pointer;
  }
  .ip-path:hover { color: #4DA3FF; }
  .ip-section {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .ip-sec-title {
    font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.3);
    text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 7px;
  }
  .ip-props { display: flex; flex-wrap: wrap; gap: 4px; }
  .ip-prop {
    display: flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.08); border-radius: 5px;
    padding: 3px 7px; font-size: 10px;
  }
  .ip-prop-k { color: rgba(255,255,255,0.35); }
  .ip-prop-v { color: rgba(255,255,255,0.85); font-variant-numeric: tabular-nums; font-weight: 500; }
  .ip-prop-swatch {
    width: 10px; height: 10px; border-radius: 2px;
    border: 0.5px solid rgba(255,255,255,0.15); flex-shrink: 0;
  }
  .ip-action-row {
    padding: 8px 12px; display: flex; gap: 6px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .ip-btn {
    flex: 1; height: 28px; border-radius: 6px;
    border: 1.5px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06);
    font-family: inherit; font-size: 11px; font-weight: 500;
    color: rgba(255,255,255,0.75); cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 4px;
    transition: background 0.12s;
  }
  .ip-btn:hover { background: rgba(255,255,255,0.1); }
  .ip-btn.dark {
    background: ${ACCENT}; border-color: transparent; color: white;
  }
  .ip-btn.dark:hover { background: ${ACCENT_HOVER}; }
  .ip-chat { padding: 8px 12px 12px; }
  .ip-chat-title {
    font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.3);
    text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 7px;
  }
  .ip-chat-msgs {
    max-height: 140px; overflow-y: auto; margin-bottom: 8px;
    display: flex; flex-direction: column; gap: 5px;
  }
  .msg { padding: 7px 9px; border-radius: 8px; font-size: 11px; line-height: 1.4; max-width: 92%; }
  .msg.user { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.9); align-self: flex-end; border-bottom-right-radius: 3px; }
  .msg.assistant { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.75); align-self: flex-start; border-bottom-left-radius: 3px; font-family: "SF Mono","Menlo",monospace; white-space: pre-wrap; word-break: break-word; }
  .msg.loading { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.3); align-self: flex-start; font-style: italic; }
  .ip-chat-input { display: flex; flex-direction: column; gap: 6px; }
  .ip-chat-btns { display: flex; gap: 6px; justify-content: flex-end; }
  .ip-btn-sm {
    padding: 5px 12px; border-radius: 6px; font-size: 11px; cursor: pointer;
    font-family: inherit; transition: opacity 0.12s;
  }
  .ip-btn-sm:hover { opacity: 0.82; }
  .ip-btn-sm.ghost {
    background: transparent; border: 1.5px solid rgba(255,255,255,0.15);
    color: rgba(255,255,255,0.45);
  }
  .ip-btn-sm.secondary {
    background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.85); border: none;
  }
  .ip-btn-sm.green { background: ${ACCENT}; color: white; border: none; }
  .ip-btn-sm.green:hover { opacity: 1; background: ${ACCENT_HOVER}; }
  .ip-btn-sm.primary { background: ${ACCENT}; color: white; border: none; }
  .ip-btn-sm:disabled { opacity: 0.35; cursor: not-allowed; }
  .ip-textarea {
    width: 100%; border-radius: 6px; border: 1.5px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.07); font-size: 11px; font-family: inherit;
    padding: 6px 8px; resize: none; color: rgba(255,255,255,0.9); height: 44px; outline: none;
    transition: border-color 0.15s; box-sizing: border-box;
  }
  .ip-textarea::placeholder { color: rgba(255,255,255,0.25); }
  .ip-textarea:focus { border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.1); }
  .ip-send {
    width: 28px; height: 28px; border-radius: 6px;
    background: ${ACCENT}; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: background 0.12s;
  }
  .ip-send:hover { background: ${ACCENT_HOVER}; }
  .ip-send:disabled { opacity: 0.3; cursor: not-allowed; }
  .source-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    cursor: pointer;
    border-top: 1px solid rgba(255,255,255,0.07);
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .source-row:hover {
    background: rgba(255,255,255,0.05);
  }
  .source-icon {
    font-size: 13px;
  }
  .source-info {
    flex: 1;
    overflow: hidden;
  }

  /* ── Task state styles ── */
  .ip-task-header {
    padding: 10px 12px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: space-between;
  }
  .ip-task-title {
    font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7);
    letter-spacing: 0.02em;
  }
  .ip-task-cancel {
    padding: 3px 9px; border-radius: 5px; font-size: 10px; cursor: pointer;
    font-family: inherit; background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.45);
    transition: all 0.12s;
  }
  .ip-task-cancel:hover { background: rgba(255,80,80,0.15); border-color: rgba(255,80,80,0.3); color: #FF6B6B; }
  .ip-task-snapshot {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .ip-task-elem {
    font-size: 10px; font-family: "SF Mono","Menlo",monospace;
    color: rgba(255,255,255,0.35); margin-bottom: 5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ip-task-msg {
    font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.45;
    word-break: break-word;
  }
  .ip-task-status {
    padding: 16px 12px;
    display: flex; align-items: center; gap: 10px;
    color: rgba(255,255,255,0.5); font-size: 12px;
  }
  .ip-spinner {
    width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;
    border: 2px solid rgba(255,255,255,0.12);
    border-top-color: rgba(255,255,255,0.55);
    animation: de-spin 0.8s linear infinite;
  }
  @keyframes de-spin { to { transform: rotate(360deg); } }

  .ip-result-body { padding: 12px; }
  .ip-result-icon { font-size: 18px; margin-bottom: 6px; }
  .ip-result-summary {
    font-size: 12px; color: rgba(255,255,255,0.75); line-height: 1.45;
    margin-bottom: 10px; word-break: break-word;
  }
  .ip-result-files { display: flex; flex-direction: column; gap: 3px; margin-bottom: 12px; }
  .ip-result-file {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; border-radius: 5px; cursor: pointer;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.07);
    transition: background 0.1s; text-decoration: none;
    font-size: 10px; font-family: "SF Mono","Menlo",monospace;
    color: rgba(255,255,255,0.6);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ip-result-file:hover { background: rgba(255,255,255,0.1); color: #4DA3FF; }
  .ip-result-actions { display: flex; gap: 6px; justify-content: flex-end; }

  .ip-error-body { padding: 12px; }
  .ip-error-icon { font-size: 18px; margin-bottom: 6px; }
  .ip-error-msg {
    font-size: 12px; color: rgba(255,100,100,0.85); line-height: 1.45;
    margin-bottom: 12px; word-break: break-word;
  }
  .ip-error-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .ip-connect-err {
    margin: 0 0 6px; padding: 5px 8px; border-radius: 5px;
    background: rgba(255,69,58,0.15); border: 1px solid rgba(255,69,58,0.3);
    color: #FF6B6B; font-size: 11px; line-height: 1.4;
  }
`
