/** Figma-style panel CSS — imported by properties.ts */

import { Z } from '../tokens.js'

export const PANEL_STYLES = `
  :host {
    all: initial;
    position: fixed;
    top: 64px;
    right: 16px;
    z-index: ${Z.PANEL};
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Helvetica Neue", sans-serif;
    width: 240px;
    max-height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .panel {
    background: rgba(28, 28, 30, 0.88);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset;
    overflow-y: auto;
    max-height: calc(100vh - 80px);
    color: rgba(255,255,255,0.9);
    font-size: 11px;
  }
  .panel-header {
    padding: 10px 12px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .title {
    font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.9);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    margin-bottom: 2px;
  }
  .subtitle {
    font-size: 10px; color: rgba(255,255,255,0.35);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .section {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .section:last-child { border-bottom: none; }
  .sec-hd {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 7px;
  }
  .sec-title { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.85); }
  .sec-actions { display: flex; gap: 2px; align-items: center; }
  .flabel {
    font-size: 10px; color: rgba(255,255,255,0.35);
    margin-bottom: 3px; display: block;
  }
  .row { display: flex; align-items: center; gap: 4px; }
  .row + .row { margin-top: 4px; }
  .field {
    display: flex; align-items: center;
    background: rgba(255,255,255,0.08); border-radius: 5px;
    padding: 0 7px; height: 26px; gap: 3px;
    flex: 1; min-width: 0;
    border: 1.5px solid transparent;
    transition: border-color 0.12s, background 0.12s;
  }
  .field:focus-within { border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.12); }
  .field-pre { font-size: 10px; color: rgba(255,255,255,0.35); flex-shrink: 0; font-weight: 500; }
  .field input {
    flex: 1; border: none; outline: none;
    background: transparent; font-size: 11px;
    font-family: inherit; color: rgba(255,255,255,0.9);
    min-width: 0; text-align: right; padding: 0;
  }
  .field input[type=number] { font-variant-numeric: tabular-nums; -moz-appearance: textfield; }
  .field input[type=number]::-webkit-inner-spin-button,
  .field input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
  .field-suf { font-size: 10px; color: rgba(255,255,255,0.35); flex-shrink: 0; }
  .ibtn {
    width: 26px; height: 26px; display: flex;
    align-items: center; justify-content: center;
    border-radius: 5px; border: 1.5px solid transparent;
    background: transparent; cursor: pointer; color: rgba(255,255,255,0.4);
    transition: background 0.1s, color 0.1s; flex-shrink: 0; padding: 0;
  }
  .ibtn:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.85); }
  .ibtn.active { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.9); }
  .seg {
    display: flex; gap: 2px; background: rgba(255,255,255,0.07);
    border-radius: 6px; padding: 2px; flex: 1;
  }
  .sbtn {
    flex: 1; height: 22px; display: flex;
    align-items: center; justify-content: center;
    border-radius: 4px; border: 1.5px solid transparent;
    background: transparent; cursor: pointer; color: rgba(255,255,255,0.35);
    transition: background 0.1s, color 0.1s; padding: 0;
  }
  .sbtn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
  .sbtn.active {
    background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.18);
    color: rgba(255,255,255,0.9); box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  .algrid {
    width: 68px; height: 68px; flex-shrink: 0;
    background: rgba(255,255,255,0.07); border-radius: 5px;
    display: grid; grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr); padding: 3px; gap: 2px;
  }
  .agbtn {
    display: flex; align-items: center; justify-content: center;
    border-radius: 3px; border: 1.5px solid transparent;
    background: transparent; cursor: pointer; padding: 0;
    transition: background 0.1s;
  }
  .agbtn:hover { background: rgba(255,255,255,0.08); }
  .agbtn.active { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.18); box-shadow: 0 1px 2px rgba(0,0,0,0.3); }
  .agdot { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.25); }
  .agbtn.active .agdot { background: rgba(255,255,255,0.9); }
  .msel {
    height: 26px; border: 1.5px solid transparent;
    border-radius: 5px; background: rgba(255,255,255,0.08);
    font-size: 11px; font-family: inherit; color: rgba(255,255,255,0.9);
    outline: none; cursor: pointer; padding: 0 18px 0 7px;
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg width='7' height='4' viewBox='0 0 7 4' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='.5.5l3 3 3-3' stroke='rgba(255,255,255,0.4)' stroke-width='1.1' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 5px center;
    transition: border-color 0.12s; flex-shrink: 0;
  }
  .msel:focus { border-color: rgba(255,255,255,0.25); background-color: rgba(255,255,255,0.12); }
  .toggle {
    appearance: none; -webkit-appearance: none;
    width: 26px; height: 14px; border-radius: 7px;
    background: rgba(255,255,255,0.15); cursor: pointer;
    transition: background 0.18s; position: relative; flex-shrink: 0;
  }
  .toggle::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 10px; height: 10px; border-radius: 50%;
    background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    transition: transform 0.18s;
  }
  .toggle:checked { background: #34C759; }
  .toggle:checked::after { transform: translateX(12px); }
  .cswatch {
    width: 20px; height: 20px; border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.2); cursor: pointer;
    flex-shrink: 0; position: relative; overflow: hidden;
  }
  .cswatch input[type=color] {
    position: absolute; inset: -2px; width: calc(100% + 4px); height: calc(100% + 4px);
    border: none; padding: 0; cursor: pointer; opacity: 0;
  }
  .cswatch-bg { position: absolute; inset: 0; border-radius: 3px; }
  .cbrow { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
  .cbrow input[type=checkbox] {
    width: 13px; height: 13px; border-radius: 3px;
    border: 1.5px solid rgba(255,255,255,0.25);
    appearance: none; -webkit-appearance: none;
    background: rgba(255,255,255,0.08); cursor: pointer; position: relative;
    flex-shrink: 0; transition: background 0.12s, border-color 0.12s;
  }
  .cbrow input:checked { background: rgba(255,255,255,0.9); border-color: rgba(255,255,255,0.9); }
  .cbrow input:checked::after {
    content: ''; position: absolute; left: 2px; top: 0px;
    width: 5px; height: 8px;
    border: 1.5px solid #1c1c1e; border-left: none; border-top: none;
    transform: rotate(40deg);
  }
  .cblabel { font-size: 11px; color: rgba(255,255,255,0.85); }
  .sync-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.07);
  }
  .sync-label {
    font-size: 11px; color: rgba(255,255,255,0.35); flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px;
  }
  textarea {
    width: 100%; border: 1.5px solid transparent;
    border-radius: 5px; padding: 6px 8px;
    font-size: 11px; font-family: inherit; outline: none;
    background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.9);
    resize: vertical; min-height: 44px;
    transition: border-color 0.12s, background 0.12s;
  }
  textarea:focus { border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.12); }
  .fsel {
    width: 100%; height: 26px;
    border: 1.5px solid transparent; border-radius: 5px;
    background: rgba(255,255,255,0.08); font-size: 11px;
    font-family: inherit; color: rgba(255,255,255,0.9);
    outline: none; cursor: pointer; padding: 0 8px;
    appearance: none; -webkit-appearance: none;
    transition: border-color 0.12s;
  }
  .fsel:focus { border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.12); }
  .al-badge {
    display: flex; align-items: center; gap: 3px;
    height: 22px; padding: 0 7px;
    border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 600;
    border: 1.5px solid; transition: all 0.12s;
  }
  .al-badge.off { background: rgba(255,255,255,0.07); border-color: transparent; color: rgba(255,255,255,0.35); }
  .al-badge.off:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); }
  .al-badge.on { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.9); }
  .gap-block { flex: 1; min-width: 0; }
  .divider-v { width: 1px; height: 18px; background: rgba(255,255,255,0.08); flex-shrink: 0; }
  .mt4 { margin-top: 4px; }
  .mt6 { margin-top: 6px; }
`
