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
  transition: transform 0.1s ease;
}

.ac-pin:hover {
  transform: scale(1.12);
}

.ac-pin.is-canvas {
  background: linear-gradient(135deg, #7c3aed, #db2777);
  border-color: #f5d0fe;
}

.ac-pin.is-single {
  background: linear-gradient(135deg, #06b6d4, #0284c7);
}

.ac-pin.is-scroll {
  background: linear-gradient(135deg, #10b981, #059669);
}

.ac-pin-end {
  position: fixed;
  width: 20px;
  height: 20px;
  margin-left: -10px;
  margin-top: -10px;
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
  width: 356px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(56, 189, 248, 0.28);
  border-radius: 14px;
  box-shadow: 0 18px 46px rgba(2, 6, 23, 0.68), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  pointer-events: auto;
  overflow: hidden;
  z-index: 20;
}

.ac-hud-mini {
  position: fixed;
  top: 18px;
  right: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 999px;
  box-shadow: 0 10px 30px rgba(2, 6, 23, 0.6);
  pointer-events: auto;
  z-index: 20;
  cursor: move;
  user-select: none;
}

.ac-hud-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: linear-gradient(90deg, rgba(8, 145, 178, 0.22), rgba(124, 58, 237, 0.18));
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  cursor: move;
  user-select: none;
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

.ac-icon-btn:hover {
  background: rgba(51, 65, 85, 0.95);
  color: #ffffff;
}

.ac-engine-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
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
  padding: 4px 9px;
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

.ac-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 8px 10px 6px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.ac-tab {
  border: 1px solid transparent;
  background: rgba(30, 41, 59, 0.65);
  color: #94a3b8;
  border-radius: 8px;
  padding: 6px 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
}

.ac-tab.is-active {
  background: rgba(8, 145, 178, 0.25);
  border-color: rgba(34, 211, 238, 0.45);
  color: #e0f2fe;
}

.ac-body {
  padding: 10px 12px 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ac-card {
  background: rgba(30, 41, 59, 0.62);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 10px;
  padding: 9px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ac-card-title {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ac-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ac-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.ac-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.ac-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.ac-field label {
  font-size: 11px;
  color: #94a3b8;
}

.ac-input,
.ac-select {
  width: 100%;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.26);
  color: #f8fafc;
  border-radius: 7px;
  padding: 5px 8px;
  font-size: 12px;
  outline: none;
}

.ac-input:focus,
.ac-select:focus {
  border-color: #22d3ee;
}

.ac-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
  cursor: pointer;
}

.ac-btn {
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(51, 65, 85, 0.72);
  color: #f1f5f9;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.ac-btn:hover {
  background: rgba(71, 85, 105, 0.9);
}

.ac-btn-primary {
  background: linear-gradient(135deg, #0891b2, #2563eb);
  border-color: rgba(56, 189, 248, 0.45);
  color: #ffffff;
}

.ac-btn-primary:hover {
  filter: brightness(1.08);
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
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  background: rgba(6, 182, 212, 0.18);
  color: #67e8f9;
  border: 1px solid rgba(6, 182, 212, 0.35);
}

.ac-badge.is-canvas {
  background: rgba(139, 92, 246, 0.22);
  color: #ddd6fe;
  border-color: rgba(167, 139, 250, 0.4);
}

.ac-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.ac-list-item {
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 7px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ac-list-item.is-active-step {
  border-color: #22d3ee;
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.35);
}

.ac-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.ac-item-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 11px;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
