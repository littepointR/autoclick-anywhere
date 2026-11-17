# Privacy Policy / 隐私政策 — AutoClick Anywhere

**Effective Date / 生效日期**: 2026-11-17  
**Repository / 开源仓库**: https://github.com/littepointR/autoclick-anywhere

---

## 中文声明

**AutoClick Anywhere** 是一款纯本地运行的开源浏览器自动化辅助工具。我们高度重视您的隐私与数据安全：

1. **零数据收集与零网络上传**
   - 本扩展**不会**收集、读取、存储或向任何外部服务器传输您的个人身份信息、浏览历史、表单输入、Cookie、网页内容或任何遥测/统计数据。
   - 本扩展不包含任何第三方分析 SDK、广告代码或远程代码加载逻辑。

2. **纯本地存储**
   - 您编排的流程图配置、坐标点位、宏录制步骤与偏好设置，仅保存在您的浏览器本地 `chrome.storage.local` 中。
   - 当前标签页是否显示悬浮控制台的状态仅保存在该标签页的 `sessionStorage` 中，不会跨网站跟踪您的浏览行为。

3. **权限用途透明说明**
   - `storage`：在浏览器本地保存您的流程图与参数配置。
   - `activeTab` 与 `scripting`：仅当您在工具栏弹窗点击控制按钮或按下快捷键时，向当前活动标签页发送控制消息或按需注入界面脚本。
   - `debugger`：仅在您启用「CDP 原生可信引擎」并主动启动流程执行期间按需附加，用于向 `<canvas>` / WebGL 等无 DOM 场景派发标准鼠标/滚轮/键盘事件；流程暂停或停止后自动分离。
   - `<all_urls>`：允许用户在任意自己访问的网站或本地页面上按需开启悬浮控制面板进行点击、滚动或宏回放（默认关闭，仅在明确点击开启的页面显示）。

---

## English Privacy Policy

**AutoClick Anywhere** is a 100% locally executed open-source browser automation extension.

1. **No Data Collection or External Transmission**
   - The extension **does not** collect, read, track, or transmit any personal information, browsing history, webpage contents, keystrokes outside user-initiated macro recording, cookies, or telemetry data to any remote server.
   - The extension contains no third-party analytics, tracking scripts, ads, or remotely hosted executable code.

2. **Local-Only Storage**
   - User-configured flows, target locators, recorded macros, and extension preferences are stored strictly locally in `chrome.storage.local`.
   - Per-tab HUD visibility is stored locally in the page's `sessionStorage` and defaults to hidden (`false`) on every webpage until explicitly opened by the user.

3. **Permission Usage**
   - `storage`: Persists user workflows, macros, and settings locally in the browser.
   - `activeTab` & `scripting`: Connects the toolbar popup / keyboard shortcuts to the currently active tab on user action.
   - `debugger`: Attached strictly on demand while running a flow with the CDP Trusted Engine enabled to dispatch input events (`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`) to `<canvas>` and WebGL surfaces, and detached automatically when stopped or paused.
   - `<all_urls>`: Enables on-demand automation on whichever website the user explicitly opens the extension HUD on.

---

## Contact / 联系方式

If you have any questions about this privacy policy, please open an issue at:  
如有任何疑问，请通过 GitHub Issues 联系我们：  
https://github.com/littepointR/autoclick-anywhere/issues
