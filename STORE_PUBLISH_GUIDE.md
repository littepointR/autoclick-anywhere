# 商店提审与自动发布指南 (Microsoft Edge Add-ons & Chrome Web Store)

首次向 **Microsoft Edge Add-ons** 和 **Chrome Web Store** 提交新扩展时，需要您用自己的微软 / Google 开发者账号在商店控制台完成首次创建并获取专属的扩展 ID（Chrome 开发者账号若尚未开通需完成一次性 \$5 注册）。下文已准备好**全部合规产物、尺寸精准的视觉素材与可直接复制粘贴的审核填写文本**。

---

## 一、提审文件清单（运行 `npm run package` 后生成）

| 用途 | 本地路径 | 规格校验 |
| :--- | :--- | :--- |
| **扩展上传包 (Edge & Chrome 通用)** | `release/autoclick-anywhere-v1.2.0.zip` | Manifest V3，已配置 `_locales/{zh_CN,zh_TW,en,ja,ko}` 5 种语言 |
| **Edge 商店图标 (Logo)** | `release/store-assets/edge-logo-300x300.png` | `300 × 300` PNG |
| **小型宣传图 (Promo Tile)** | `release/store-assets/promo-small-440x280.png` | `440 × 280` 24-bit RGB PNG（无透明通道） |
| **商店截图 1（流程图与技能CD）** | `release/store-assets/screenshot-1-flowchart-1280x800.png` | `1280 × 800` 24-bit RGB PNG（无透明通道） |
| **商店截图 2（双引擎与Canvas/WebGL）** | `release/store-assets/screenshot-2-dual-engine-1280x800.png` | `1280 × 800` 24-bit RGB PNG（无透明通道） |
| **隐私政策公开 URL（必填）** | `https://github.com/littepointR/autoclick-anywhere/blob/main/PRIVACY_POLICY.md` | 中英双语公开页面 |

---

## 二、可直接复制的商店表单内容

### 1. 扩展简介（Store Description）

**中文简介：**
> AutoClick Anywhere 是一款面向普通网页（DOM / Shadow DOM）以及 Canvas / WebGL 无 DOM 应用的全能可视化流程图自动点击器与宏录制扩展。
>
> 【核心特性】
> • 双引擎输入派发：支持 ⚡ CDP 原生可信引擎（chrome.debugger 派发硬件级 isTrusted=true 事件，直接穿透 Canvas / WebGL 画布）与 🔇 DOM 静默合成引擎（零调试横幅），支持运行中实时热切换。
> • 可视化流程图编排：将点击、滚轮、拖拽（A→B）、键盘按键与等待自由组合为流程图节点；支持类似游戏技能 CD 的顺时针冷却阴影与分环节进度条，清楚呈现当前执行位置与剩余时间。
> • 暂停/继续 vs 停止：支持随时暂停冻结进度与剩余毫秒数并精准继续，或一键完全停止重置。
> • 宏录制自动转流程：录制鼠标点击、拖拽、滚轮与按键后自动生成可编辑流程图，支持倍速回放与 JSON 导入导出。
> • 仅在明确开启的网页显示：默认不打扰任何网页，点击扩展弹窗或按 Alt+H 才在当前页展示悬浮控制台，支持 Alt+P 一键显隐放置的目标点。
> • 100% 本地运行：绝不收集或上传任何个人数据与浏览记录。

**English Description:**
> AutoClick Anywhere is a visual flowchart auto-clicker and macro recorder built for both standard DOM webpages (including open Shadow DOM) and DOM-less Canvas / WebGL applications.
>
> Key Capabilities:
> • Dual-Engine Input Dispatch: Switch live between the CDP Trusted Engine (hardware-level isTrusted=true events via chrome.debugger that pierce Canvas & WebGL) and the silent DOM Synthetic Engine.
> • Visual Flowchart & Skill Cooldown UI: Chain Click, Scroll, Drag (A -> B), Keystroke, and Wait steps into an interactive flowchart with game-style radial cooldown sweeps and sub-phase progress indicators.
> • Pause / Resume vs Stop: Freeze execution mid-countdown and resume seamlessly, or stop and reset anytime.
> • Macro Recording to Flowchart: Record real interactions and automatically convert them into editable flowchart steps with playback speed control and JSON import/export.
> • Per-Page On-Demand HUD: Stays hidden on webpages until explicitly opened via the popup or Alt+H, with 1-click pin visibility toggle (Alt+P).
> • 100% Local & Private: Zero telemetry, zero analytics, zero remote network requests.

---

### 2. 单一用途声明与权限说明（Chrome Web Store Privacy Practices & Edge Certification）

- **Single Purpose Description（单一用途声明）**：
  > User-initiated browser input automation (clicking, scrolling, dragging, keystrokes, and macro workflow playback) on standard DOM and Canvas/WebGL pages.
- **`debugger` 权限理由**：
  > Attached strictly on demand only while the user runs a workflow with the CDP Trusted Engine enabled, to dispatch Input.dispatchMouseEvent and Input.dispatchKeyEvent commands to Canvas/WebGL surfaces that ignore synthetic DOM events. Detached automatically when paused or stopped.
- **`scripting` & `activeTab` 权限理由**：
  > Used solely when the user clicks the extension popup or invokes keyboard shortcuts to toggle the HUD or send controls to the currently active tab.
- **`storage` 权限理由**：
  > Used strictly to save user-created workflows, recorded macros, and local preferences in chrome.storage.local.
- **`host_permissions (<all_urls>)` 权限理由**：
  > Allows the user to explicitly activate the HUD and run their automation workflow on any website or local web app they choose. The HUD stays hidden by default until explicitly opened per tab.
- **Does your extension use remote code?（是否使用远程代码）**：**No**
- **Data Collection（数据收集声明）**：**Do not collect or transmit any user data**（全部勾选“不收集”）。

---

### 3. 审核测试指引（Notes for Reviewer / Certification Notes）

> Thank you for reviewing AutoClick Anywhere!
> 1. Click the extension toolbar icon and click "打开 DOM + Canvas + WebGL 测试靶场" (Open Built-in Test Playground), OR navigate to any standard webpage.
> 2. Notice the floating HUD stays hidden by default so it does not intrude on browsing. Click "在当前网页显示悬浮面板 (Alt+H)" in the popup (or press Alt+H / click the button in the Playground header) to show the HUD on that tab.
> 3. Click "🎯 点击" in the HUD to pick a DOM button or a region on the 2D Canvas / WebGL canvas, then click "▶ 启动流程 (F8)".
> 4. You can test "⏸ 暂停" vs "⏹ 停止", toggle "👁️ 点位" (Alt+P), drag numbered pin markers on screen, or click "🔴 录制宏转流程 (F9)" and stop recording to see the recorded steps auto-convert into an editable flowchart.
> Note: Chrome/Edge disallow chrome.debugger on `chrome-extension://` pages, so the extension automatically switches to the silent DOM engine on the built-in extension URL and uses the CDP engine on `http://` / `https://` webpages.

---

## 三、手动提审入口

1. **Microsoft Edge Add-ons**（免费，审核通常 1–3 个工作日）：
   - 打开：https://partner.microsoft.com/dashboard/microsoftedge/overview
   - 创建新扩展 → 上传 `release/autoclick-anywhere-v1.2.0.zip` → 上传 `edge-logo-300x300.png` 与 `1280×800` 截图 → 粘贴上方简介、隐私 URL 与审核备注 → 提交发布。
2. **Chrome Web Store**：
   - 打开：https://chrome.google.com/webstore/devconsole
   - 点击 **New Item** → 上传 `release/autoclick-anywhere-v1.2.0.zip` → 填写 Store Listing（上传 `promo-small-440x280.png` 与 `1280×800` 截图）、Privacy Practices（粘贴隐私 URL 与权限理由）→ 提交审核。

---

## 四、后续版本 GitHub Actions 自动发布配置

首次人工过审拿到商店分配的扩展 ID 后，在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 配置以下 Secrets，以后每次发布 GitHub Release 时 `.github/workflows/publish-stores.yml` 会自动打包并提交至 Chrome 与 Edge 商店：

- **Chrome Web Store**：`CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`
- **Microsoft Edge Add-ons**：`EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`
