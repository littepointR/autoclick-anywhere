export const HUD_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 12px;
  color: #e2e8f0;
  line-height: 1.4;
}

*, *::before, *::after {
  box-sizing: border-box;
}

:host(.is-running) .ac-pin,
:host(.is-running) .ac-pin-end,
:host(.is-running) .ac-svg-layer,
:host(.is-running) .ac-fx-layer {
  pointer-events: none !important;
}

.ac-hidden {
  display: none !important;
}

/* Full-screen drag shield so rapid cursor movements never drop pins or HUD panels */
.ac-drag-shield {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: auto;
  cursor: grabbing !important;
  touch-action: none;
  user-select: none;
}

/* FX & Pins Layer */
.ac-fx-layer,
.ac-pins-layer,
.ac-svg-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.ac-svg-layer {
  width: 100vw;
  height: 100vh;
}

.ac-ripple {
  position: fixed;
  width: 28px;
  height: 28px;
  margin-left: -14px;
  margin-top: -14px;
  border-radius: 999px;
  border: 2px solid #22d3ee;
  background: rgba(34, 211, 238, 0.22);
  pointer-events: none;
  animation: ac-ripple-pop 460ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.ac-ripple.is-right {
  border-color: #f472b6;
  background: rgba(244, 114, 182, 0.22);
}

.ac-ripple.is-canvas {
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.7);
}

.ac-wheel-fx {
  position: fixed;
  transform: translate(-50%, -50%);
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(56, 189, 248, 0.5);
  color: #38bdf8;
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
  animation: ac-fade-up 520ms ease-out forwards;
}

@keyframes ac-ripple-pop {
  0% {
    transform: scale(0.35);
    opacity: 0.95;
  }
  100% {
    transform: scale(1.9);
    opacity: 0;
  }
}

@keyframes ac-fade-up {
  0% {
    opacity: 0.95;
    transform: translate(-50%, -50%) scale(0.92);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -85%) scale(1.06);
  }
}

/* Pin Markers */
.ac-pin {
  position: fixed;
  width: 26px;
  height: 26px;
  margin-left: -13px;
  margin-top: -13px;
  border-radius: 999px;
  background: linear-gradient(135deg, #0891b2, #2563eb);
  border: 2px solid #e0f2fe;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.55);
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  touch-action: none;
  -webkit-user-drag: none;
  transition: transform 0.1s ease;
}

.ac-pin:hover {
  transform: scale(1.12);
}

.ac-pin.is-canvas {
  background: linear-gradient(135deg, #7c3aed, #db2777);
  border-color: #f5d0fe;
}

.ac-pin.is-scroll {
  background: linear-gradient(135deg, #10b981, #059669);
}

.ac-pin.is-executing-pin {
  box-shadow: 0 0 0 5px rgba(34, 211, 238, 0.45), 0 0 18px rgba(34, 211, 238, 0.8);
  transform: scale(1.16);
}

.ac-pin-end {
  position: fixed;
  width: 22px;
  height: 22px;
  margin-left: -11px;
  margin-top: -11px;
  border-radius: 6px;
  background: #f59e0b;
  border: 2px solid #fef3c7;
  color: #0f172a;
  font-size: 10px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  touch-action: none;
  -webkit-user-drag: none;
}

/* Picker Overlay */
.ac-picker-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.18);
  pointer-events: auto;
  cursor: crosshair;
  z-index: 10;
}

.ac-picker-box {
  position: fixed;
  border: 2px solid #22d3ee;
  background: rgba(34, 211, 238, 0.08);
  border-radius: 4px;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.5), 0 0 16px rgba(34, 211, 238, 0.35);
}

.ac-picker-box.is-canvas {
  border-color: #c084fc;
  background: rgba(192, 132, 252, 0.1);
  box-shadow: 0 0 18px rgba(192, 132, 252, 0.45);
}

.ac-picker-tip {
  position: fixed;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(56, 189, 248, 0.45);
  color: #f8fafc;
  font-size: 11px;
  pointer-events: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  max-width: 280px;
  z-index: 12;
}

.ac-picker-banner {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid #22d3ee;
  color: #e0f2fe;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  z-index: 12;
}

/* HUD Panel */
.ac-hud {
  position: fixed;
  top: 18px;
  right: 18px;
  width: 392px;
  max-width: calc(100vw - 20px);
  max-height: calc(100vh - 20px);
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(56, 189, 248, 0.28);
  border-radius: 14px;
  box-shadow: 0 18px 46px rgba(2, 6, 23, 0.72), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  pointer-events: auto;
  overflow: hidden;
  z-index: 20;
}

.ac-hud.is-wide {
  width: 472px;
}

.ac-hud-mini {
  position: fixed;
  top: 18px;
  right: 18px;
  max-width: calc(100vw - 20px);
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 11px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 999px;
  box-shadow: 0 10px 30px rgba(2, 6, 23, 0.6);
  pointer-events: auto;
  z-index: 20;
  cursor: move;
  user-select: none;
  touch-action: none;
  -webkit-user-drag: none;
}

.ac-hud-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: linear-gradient(90deg, rgba(8, 145, 178, 0.24), rgba(124, 58, 237, 0.2));
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  cursor: move;
  user-select: none;
  touch-action: none;
  -webkit-user-drag: none;
}

.ac-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 700;
  font-size: 13px;
  color: #f8fafc;
}

.ac-brand-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #22d3ee;
  box-shadow: 0 0 10px #22d3ee;
}

.ac-brand-dot.is-running {
  background: #10b981;
  box-shadow: 0 0 10px #10b981;
}

.ac-brand-dot.is-paused {
  background: #f59e0b;
  box-shadow: 0 0 10px #f59e0b;
}

.ac-brand-dot.is-recording {
  background: #f43f5e;
  box-shadow: 0 0 10px #f43f5e;
}

.ac-header-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.ac-icon-btn {
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(30, 41, 59, 0.72);
  color: #cbd5e1;
  border-radius: 7px;
  padding: 3px 7px;
  font-size: 11px;
  cursor: pointer;
  line-height: 1.3;
}

.ac-icon-btn:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.95);
  color: #ffffff;
}

.ac-icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ac-icon-btn.is-on {
  background: rgba(6, 182, 212, 0.22);
  border-color: rgba(34, 211, 238, 0.5);
  color: #67e8f9;
}

.ac-lang-select {
  background: rgba(30, 41, 59, 0.82);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 7px;
  padding: 2px 5px;
  font-size: 11px;
  cursor: pointer;
  outline: none;
  max-width: 78px;
}

.ac-lang-select:focus {
  border-color: #22d3ee;
}

.ac-engine-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(2, 6, 23, 0.45);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.ac-segmented {
  display: inline-flex;
  background: rgba(30, 41, 59, 0.85);
  border-radius: 8px;
  padding: 2px;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.ac-seg-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.ac-seg-btn.is-active {
  background: linear-gradient(135deg, #0891b2, #6366f1);
  color: #ffffff;
}

.ac-status-pill {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ac-status-pill strong {
  color: #38bdf8;
}

.ac-fallback-note {
  padding: 5px 12px;
  background: rgba(245, 158, 11, 0.14);
  border-bottom: 1px solid rgba(245, 158, 11, 0.25);
  color: #fcd34d;
  font-size: 11px;
}

.ac-transport {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.72);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.ac-flow-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(30, 41, 59, 0.42);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.ac-palette-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 6px 12px;
  background: rgba(2, 6, 23, 0.36);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  flex-wrap: wrap;
}

.ac-body {
  padding: 10px 12px 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 110px;
}

/* Flowchart Nodes & Game Skill CD */
.ac-flowchart {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.ac-flow-start {
  align-self: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #7dd3fc;
  background: rgba(8, 145, 178, 0.18);
  border: 1px solid rgba(56, 189, 248, 0.38);
}

.ac-flow-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 18px;
  color: rgba(148, 163, 184, 0.55);
  font-size: 12px;
  line-height: 1;
  user-select: none;
}

.ac-flow-arrow.is-flowing {
  color: #22d3ee;
  text-shadow: 0 0 8px rgba(34, 211, 238, 0.8);
}

.ac-flow-node {
  position: relative;
  background: rgba(30, 41, 59, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 11px;
  padding: 8px 9px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.ac-flow-node.is-disabled-node {
  opacity: 0.48;
}

.ac-flow-node.is-active-node {
  border-color: #22d3ee;
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.45), 0 8px 20px rgba(6, 182, 212, 0.18);
}

.ac-flow-node.is-paused-node {
  border-color: #f59e0b;
  background: rgba(30, 27, 18, 0.92);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.45), 0 8px 20px rgba(245, 158, 11, 0.16);
}

.ac-node-main {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.ac-skill-box {
  position: relative;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 10px;
  background: linear-gradient(145deg, #1e293b, #0f172a);
  border: 1.5px solid rgba(56, 189, 248, 0.35);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  user-select: none;
}

.ac-skill-box.is-canvas {
  border-color: rgba(192, 132, 252, 0.55);
}

.ac-skill-emoji {
  font-size: 16px;
  line-height: 1;
}

.ac-skill-num {
  font-size: 9px;
  font-weight: 700;
  color: #94a3b8;
  margin-top: 2px;
}

/* Clockwise radial skill cooldown sweep overlay */
.ac-skill-cd-mask {
  position: absolute;
  inset: 0;
  border-radius: 9px;
  pointer-events: none;
  background: conic-gradient(
    from 0deg,
    transparent calc((1 - var(--cd-ratio, 0)) * 360deg),
    rgba(2, 6, 23, 0.86) calc((1 - var(--cd-ratio, 0)) * 360deg) 360deg
  );
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: var(--cd-visible, 0);
}

.ac-skill-cd-text {
  font-size: 10px;
  font-weight: 800;
  color: #f8fafc;
  text-shadow: 0 1px 3px #000000;
  font-variant-numeric: tabular-nums;
}

.ac-node-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ac-node-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.ac-node-title {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 11px;
  font-weight: 700;
  color: #f1f5f9;
}

.ac-node-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ac-phase-pipeline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.ac-phase-chip {
  position: relative;
  overflow: hidden;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.ac-phase-chip.is-active-phase {
  border-color: #22d3ee;
  color: #ffffff;
  background: rgba(8, 145, 178, 0.34);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.35);
}

.ac-flow-node.is-paused-node .ac-phase-chip.is-active-phase {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.28);
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.35);
}

.ac-phase-cd-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: calc(var(--phase-cd, 0) * 100%);
  background: rgba(2, 6, 23, 0.72);
  border-left: 1.5px solid rgba(56, 189, 248, 0.9);
  pointer-events: none;
}

.ac-phase-label {
  position: relative;
  z-index: 1;
}

.ac-flow-loop-node {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px dashed rgba(148, 163, 184, 0.3);
  color: #94a3b8;
  font-size: 11px;
}

.ac-flow-loop-node.is-active-node {
  border-style: solid;
  border-color: #22d3ee;
  color: #e0f2fe;
}

.ac-flow-loop-node.is-paused-node {
  border-style: solid;
  border-color: #f59e0b;
  color: #fde68a;
}

.ac-node-editor {
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ac-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ac-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.ac-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.ac-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.ac-field label {
  font-size: 10px;
  color: #94a3b8;
}

.ac-input,
.ac-select {
  width: 100%;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.26);
  color: #f8fafc;
  border-radius: 7px;
  padding: 4px 7px;
  font-size: 11px;
  outline: none;
}

.ac-input:focus,
.ac-select:focus {
  border-color: #22d3ee;
}

.ac-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
}

.ac-btn {
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(51, 65, 85, 0.72);
  color: #f1f5f9;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.ac-btn:hover:not(:disabled) {
  background: rgba(71, 85, 105, 0.9);
}

.ac-btn:disabled {
  opacity: 0.44;
  cursor: not-allowed;
  filter: none;
}

.ac-btn-primary {
  background: linear-gradient(135deg, #0891b2, #2563eb);
  border-color: rgba(56, 189, 248, 0.45);
  color: #ffffff;
}

.ac-btn-warn {
  background: linear-gradient(135deg, #d97706, #b45309);
  border-color: rgba(251, 191, 36, 0.5);
  color: #ffffff;
}

.ac-btn-danger {
  background: linear-gradient(135deg, #e11d48, #be123c);
  border-color: rgba(251, 113, 133, 0.45);
  color: #ffffff;
}

.ac-btn-record {
  background: linear-gradient(135deg, #dc2626, #9333ea);
  border-color: rgba(244, 114, 182, 0.4);
  color: #ffffff;
}

.ac-btn-sm {
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 6px;
}

.ac-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  background: rgba(6, 182, 212, 0.18);
  color: #67e8f9;
  border: 1px solid rgba(6, 182, 212, 0.35);
  flex-shrink: 0;
}

.ac-badge.is-canvas {
  background: rgba(139, 92, 246, 0.22);
  color: #ddd6fe;
  border-color: rgba(167, 139, 250, 0.4);
}

.ac-footer-hotkeys {
  padding: 6px 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(2, 6, 23, 0.55);
  color: #94a3b8;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
`;
