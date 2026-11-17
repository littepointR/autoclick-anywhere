import type { FlowSubPhase, LanguageSetting, LocaleCode } from './types.ts';

export const SUPPORTED_LOCALES: Array<{ value: LanguageSetting; nativeLabel: string }> = [
  { value: 'auto', nativeLabel: 'Auto' },
  { value: 'zh_CN', nativeLabel: '简体中文' },
  { value: 'zh_TW', nativeLabel: '繁體中文' },
  { value: 'en', nativeLabel: 'English' },
  { value: 'ja', nativeLabel: '日本語' },
  { value: 'ko', nativeLabel: '한국어' },
];

export function resolveLocale(setting?: LanguageSetting, browserLang?: string): LocaleCode {
  if (setting && setting !== 'auto') {
    return setting;
  }
  const raw = (
    browserLang ??
    (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage
      ? chrome.i18n.getUILanguage()
      : typeof navigator !== 'undefined'
        ? navigator.language
        : 'en')
  )
    .toLowerCase()
    .replace('_', '-');

  if (
    raw.startsWith('zh-tw') ||
    raw.startsWith('zh-hk') ||
    raw.startsWith('zh-mo') ||
    raw.includes('hant')
  ) {
    return 'zh_TW';
  }
  if (raw.startsWith('zh')) return 'zh_CN';
  if (raw.startsWith('ja')) return 'ja';
  if (raw.startsWith('ko')) return 'ko';
  return 'en';
}

export function toHtmlLang(locale: LocaleCode): string {
  switch (locale) {
    case 'zh_CN':
      return 'zh-CN';
    case 'zh_TW':
      return 'zh-TW';
    case 'ja':
      return 'ja';
    case 'ko':
      return 'ko';
    case 'en':
    default:
      return 'en';
  }
}

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export interface I18nMessages {
  autoLangOption: string;
  presets: {
    singleFlowName: string;
    singleStepName: string;
    scrollFlowName: string;
    scrollStepName: string;
    comboFlowName: string;
    comboClickName: string;
    comboWheelName: string;
    comboWaitName: string;
    emptyFlowName: string;
  };
  recordedFlowName: string;
  importedFlowDefaultName: string;
  importedFlowSuffix: string;
  stepTypes: {
    click: string;
    wheel: string;
    drag: string;
    key: string;
    wait: string;
  };
  phases: Record<FlowSubPhase, string>;
  hud: {
    title: string;
    miniTitle: string;
    pinsOnBtn: string;
    pinsOffBtn: string;
    pinsToggleTitle: string;
    toggleWideTitle: string;
    minimizeTitle: string;
    hideTitle: string;
    expandBtn: string;
    resumeShort: string;
    engineCdp: string;
    engineDom: string;
    engineSwitchTitle: string;
    trustedFooter: string;
    domFooter: string;
    hotkeysFooter: string;
    statusRunning: string;
    statusPaused: string;
    statusRecording: string;
    statusIdle: string;
    pauseBtn: string;
    stopBtn: string;
    resumeBtn: string;
    stopResetBtn: string;
    startBtn: string;
    recordFinishBtn: string;
    recordStartBtn: string;
    recordBtnTitle: string;
    renameBtn: string;
    renameTitle: string;
    renamePrompt: string;
    deleteBtn: string;
    deleteTitle: string;
    exportBtn: string;
    exportTitle: string;
    importBtn: string;
    importTitle: string;
    newPrefix: string;
    presetSingle: string;
    presetScroll: string;
    presetEmpty: string;
    recWheelLabel: string;
    recKeyLabel: string;
    speedLabel: string;
    loopsLabel: string;
    loopCdLabel: string;
    addStepLabel: string;
    addClick: string;
    addWheel: string;
    addDrag: string;
    addKey: string;
    addWait: string;
    flowStartMacro: string;
    flowStartManual: string;
    emptyFlowHint: string;
    loopControlTitle: string;
    loopInfiniteText: string;
    loopFiniteText: string;
    followCursorSummary: string;
    viewportCenterSummary: string;
    pageScrollSummary: string;
    dragStartUnset: string;
    dragEndUnset: string;
    keySummary: string;
    waitSummary: string;
    chipWait: string;
    chipDrag: string;
    chipScroll: string;
    chipKey: string;
    chipClick: string;
    chipPreDelay: string;
    chipRepeatGap: string;
    chipPostDelay: string;
    repInfinite: string;
    repTimes: string;
    btnLeft: string;
    btnRight: string;
    btnMiddle: string;
    kindSingle: string;
    kindDouble: string;
    kindHold: string;
    editTitle: string;
    moveUpTitle: string;
    moveDownTitle: string;
    deleteStepTitle: string;
    editorNameLabel: string;
    editorNamePlaceholder: string;
    editorFollowCursor: string;
    editorRepickTarget: string;
    editorLocMode: string;
    locAuto: string;
    locCanvas: string;
    locDom: string;
    locViewport: string;
    editorMouseBtn: string;
    editorBtnLeft: string;
    editorBtnRight: string;
    editorBtnMiddle: string;
    editorClickKind: string;
    editorKindSingle: string;
    editorKindDouble: string;
    editorKindHold: string;
    editorHoldMs: string;
    editorJitterPx: string;
    editorPageScroll: string;
    editorPickContainer: string;
    editorScrollDir: string;
    dirDown: string;
    dirUp: string;
    dirLeft: string;
    dirRight: string;
    dirCustom: string;
    editorPickStartA: string;
    editorPickEndB: string;
    editorDragMs: string;
    editorKeyCapture: string;
    editorWaitMs: string;
    editorPreWaitMs: string;
    editorRepeatCount: string;
    editorRepeatGapMs: string;
    editorPostWaitMs: string;
    editorJitterMs: string;
    pickClickPrompt: string;
    pickWheelPrompt: string;
    pickDragPrompt: string;
    pickStepStartPrompt: string;
    pickStepEndPrompt: string;
  };
  picker: {
    defaultPointPrompt: string;
    defaultDragPrompt: string;
    canvasRatio: string;
    coordLabel: string;
    viewportCoord: string;
    dragEndTitle: string;
    dragStartTitle: string;
    dragDistance: string;
  };
  overlay: {
    pinTitle: string;
    endPinTitle: string;
    scrollDown: string;
    scrollUp: string;
    scrollRight: string;
    scrollLeft: string;
  };
  fallback: {
    restrictedPage: string;
    devtoolsAttached: string;
    genericFallback: string;
  };
  popup: {
    subtitle: string;
    detecting: string;
    restrictedStatus: string;
    restrictedHint: string;
    showHud: string;
    hideHud: string;
    showPins: string;
    hidePins: string;
    startFlow: string;
    pauseFlow: string;
    resumeFlow: string;
    stopFlow: string;
    recordStart: string;
    recordFinish: string;
    runningBadge: string;
    pausedBadge: string;
    recordingBadge: string;
    hudOnBadge: string;
    hudOffBadge: string;
    hintText: string;
    engineSection: string;
    cdpTitle: string;
    cdpDesc: string;
    domTitle: string;
    domDesc: string;
    optionsSection: string;
    optRipples: string;
    optPins: string;
    optEsc: string;
    optDetach: string;
    openPlayground: string;
  };
  playground: {
    pageTitle: string;
    headerTitle: string;
    headerSub: string;
    toggleHudBtn: string;
    envExtension: string;
    envHttp: string;
    arena1Title: string;
    domClickBtn: string;
    domDblBtn: string;
    domRightBtn: string;
    movingDesc: string;
    movingStart: string;
    movingStop: string;
    movingTargetBtn: string;
    scrollTitle: string;
    scrollRowPrefix: string;
    scrollRowBottom: string;
    arena2Title: string;
    statAtk: string;
    statGold: string;
    statHold: string;
    statZoom: string;
    c2dBtnAtk: string;
    c2dBtnGold: string;
    c2dBtnHold: string;
    c2dOrbHint: string;
    c2dTip: string;
    arena3Title: string;
    statHits: string;
    statRot: string;
    statDistZoom: string;
    wglTip: string;
    inspectorTitle: string;
    clearLogs: string;
  };
}

export const MESSAGES: Record<LocaleCode, I18nMessages> = {
  zh_CN: {
    autoLangOption: '🌐 自动 (跟随浏览器)',
    presets: {
      singleFlowName: '单点连点流程',
      singleStepName: '单点连续点击',
      scrollFlowName: '连续自动滚动流程',
      scrollStepName: '页面连续下滑',
      comboFlowName: '点击 + 滚动组合示例',
      comboClickName: '触发点击',
      comboWheelName: '向下滚动',
      comboWaitName: '等待冷却',
      emptyFlowName: '自定义空白流程',
    },
    recordedFlowName: '录制流程 #{n}',
    importedFlowDefaultName: '导入流程',
    importedFlowSuffix: ' (导入)',
    stepTypes: {
      click: '点击',
      wheel: '滚动',
      drag: '拖拽',
      key: '按键',
      wait: '等待',
    },
    phases: {
      idle: '空闲',
      delayBefore: '前置等待',
      acting: '触发动作',
      holding: '长按蓄力',
      dragging: '轨迹拖拽',
      waiting: '等待冷却',
      repeatInterval: '连点间隔',
      delayAfter: '后置冷却',
      loopCooldown: '轮次冷却',
    },
    hud: {
      title: 'AutoClick 流程图控制台',
      miniTitle: '流程 ({count})',
      pinsOnBtn: '👁️ 点位',
      pinsOffBtn: '🙈 点位',
      pinsToggleTitle: '一键显示/隐藏放置的目标点 (Alt+P)',
      toggleWideTitle: '切换宽/窄面板',
      minimizeTitle: '最小化为悬浮胶囊',
      hideTitle: '在本页隐藏面板 (Alt+H)',
      expandBtn: '展开',
      resumeShort: '▶ 继续',
      engineCdp: '⚡ CDP 原生',
      engineDom: '🔇 DOM 静默',
      engineSwitchTitle: '支持运行中实时热切换引擎',
      trustedFooter: '可信输入',
      domFooter: 'DOM 合成',
      hotkeysFooter: 'F8 启停/暂停 · Esc 停止 · F9 录制 · Alt+P 显隐点位',
      statusRunning: '运行中 · 轮 {loop}/{total} · <strong>{count}</strong>次',
      statusPaused: '<span style="color:#fbbf24;">⏸ 已暂停</span> · <strong>{count}</strong>次',
      statusRecording: '<span style="color:#fb7185;">录制中</span> · <strong>{count}</strong>步',
      statusIdle: '空闲就绪',
      pauseBtn: '⏸ 暂停 (F8)',
      stopBtn: '⏹ 停止 (Esc)',
      resumeBtn: '▶ 继续执行 (F8)',
      stopResetBtn: '⏹ 停止重置',
      startBtn: '▶ 启动流程 (F8)',
      recordFinishBtn: '⏹ 完成录制并生成流程 (已录 {count} 步)',
      recordStartBtn: '🔴 录制宏转流程 (F9)',
      recordBtnTitle: '录制操作并在结束后自动转为流程图',
      renameBtn: '改名',
      renameTitle: '重命名流程',
      renamePrompt: '输入流程名称：',
      deleteBtn: '删',
      deleteTitle: '删除流程',
      exportBtn: '导出',
      exportTitle: '导出 JSON',
      importBtn: '导入',
      importTitle: '导入 JSON',
      newPrefix: '新建:',
      presetSingle: '+单点',
      presetScroll: '+滚动',
      presetEmpty: '+空白',
      recWheelLabel: '录滚轮',
      recKeyLabel: '录按键',
      speedLabel: '流程倍速',
      loopsLabel: '循环 (0=无限)',
      loopCdLabel: '轮次CD (ms)',
      addStepLabel: '添加步骤:',
      addClick: '🎯 点击',
      addWheel: '🎡 滚动',
      addDrag: '✥ 拖拽',
      addKey: '⌨️ 按键',
      addWait: '⏳ 等待',
      flowStartMacro: '● 流程起点 (宏录制转换)',
      flowStartManual: '● 流程起点 (可视化编排)',
      emptyFlowHint: '暂无步骤节点，点击上方「🎯 点击 / 🎡 滚动 / ✥ 拖拽 / ⌨️ 按键 / ⏳ 等待」或点击「🔴 录制宏转流程」开始编排',
      loopControlTitle: '流程循环控制节点',
      loopInfiniteText: '无限循环返回起点 · 轮次冷却 {ms}ms',
      loopFiniteText: '循环 {count} 轮返回起点 · 轮次冷却 {ms}ms',
      followCursorSummary: '跟随鼠标实时位置',
      viewportCenterSummary: '视口中心点击',
      pageScrollSummary: '页面/光标位置滚动',
      dragStartUnset: '起点未定',
      dragEndUnset: '终点未定',
      keySummary: '按键 [{key}]',
      waitSummary: '等待 {ms}ms',
      chipWait: '等待 {ms}ms',
      chipDrag: '拖拽 {ms}ms · {rep}',
      chipScroll: '滚动 {dir} · {rep}',
      chipKey: '按键 [{key}] · {rep}',
      chipClick: '{btn}键{kind} · {rep}',
      chipPreDelay: '前置 {ms}ms',
      chipRepeatGap: '连点间隔 {ms}ms',
      chipPostDelay: '后置 {ms}ms',
      repInfinite: '∞次',
      repTimes: '{n}次',
      btnLeft: '左',
      btnRight: '右',
      btnMiddle: '中',
      kindSingle: '单击',
      kindDouble: '双击',
      kindHold: '长按{ms}ms',
      editTitle: '展开/收起节点参数',
      moveUpTitle: '上移',
      moveDownTitle: '下移',
      deleteStepTitle: '删除节点',
      editorNameLabel: '步骤备注名称',
      editorNamePlaceholder: '可选，如：点击攻击按钮',
      editorFollowCursor: '跟随鼠标实时位置',
      editorRepickTarget: '🎯 重选坐标',
      editorLocMode: '定位方式',
      locAuto: '自动识别',
      locCanvas: 'Canvas比例',
      locDom: 'DOM选择器',
      locViewport: '固定坐标',
      editorMouseBtn: '按键',
      editorBtnLeft: '左键',
      editorBtnRight: '右键',
      editorBtnMiddle: '中键',
      editorClickKind: '方式',
      editorKindSingle: '单击',
      editorKindDouble: '双击',
      editorKindHold: '长按',
      editorHoldMs: '按住时长 (ms)',
      editorJitterPx: '坐标偏移 ±px',
      editorPageScroll: '整页/鼠标位置滚动',
      editorPickContainer: '🎯 拾取容器/画布',
      editorScrollDir: '方向',
      dirDown: '向下',
      dirUp: '向上',
      dirLeft: '向左',
      dirRight: '向右',
      dirCustom: '自定义',
      editorPickStartA: '🎯 重选起点 A',
      editorPickEndB: '🎯 重选终点 B',
      editorDragMs: '拖拽耗时 (ms)',
      editorKeyCapture: '按键捕获（点击输入框后直接按下目标按键）',
      editorWaitMs: '等待时长 (ms)',
      editorPreWaitMs: '前置等待 ms',
      editorRepeatCount: '重复 (0=无限)',
      editorRepeatGapMs: '连点间隔 ms',
      editorPostWaitMs: '后置冷却 ms',
      editorJitterMs: '时间随机抖动 ±ms',
      pickClickPrompt: '点击任意 DOM 元素或 Canvas/WebGL 位置添加「点击步骤」',
      pickWheelPrompt: '点击要滚动的容器或 Canvas/WebGL 位置添加「滚动步骤」（也可随后切为整页滚动）',
      pickDragPrompt: '按住左键从起点拖拽到终点添加「拖拽步骤」（Esc 取消）',
      pickStepStartPrompt: '点击设置该步骤的新目标位置（Esc 取消）',
      pickStepEndPrompt: '点击设置该拖拽步骤的终点 B（Esc 取消）',
    },
    picker: {
      defaultPointPrompt: '移动鼠标选择目标位置（支持 DOM / Canvas / WebGL），左键确认，Esc 取消',
      defaultDragPrompt: '按住左键从起点拖拽到终点松开，即可创建拖拽轨迹（Esc 取消）',
      canvasRatio: '画布比例: u={u}%, v={v}%',
      coordLabel: '坐标: ({x}, {y})',
      viewportCoord: '📍 视口坐标',
      dragEndTitle: '拖拽终点',
      dragStartTitle: '按下左键设置拖拽起点',
      dragDistance: '({x}, {y}) · 距离 {d}px',
    },
    overlay: {
      pinTitle: '#{idx} {type} ({x}, {y}) · 按住拖拽可调整坐标',
      endPinTitle: '#{idx} 拖拽终点 ({x}, {y}) · 按住拖拽可调整',
      scrollDown: '↓ 滚动',
      scrollUp: '↑ 滚动',
      scrollRight: '→ 滚动',
      scrollLeft: '← 滚动',
    },
    fallback: {
      restrictedPage: '受限系统/扩展页面不支持 CDP，已自动切换为 DOM 引擎',
      devtoolsAttached: '页面已打开 DevTools 调试器，已自动切换为 DOM 引擎',
      genericFallback: 'CDP 不可用，已自动切换为 DOM 引擎',
    },
    popup: {
      subtitle: 'DOM + Canvas/WebGL 流程图自动点击器',
      detecting: '检测中…',
      restrictedStatus: '受限页面/未连接',
      restrictedHint: '当前页若为浏览器设置页，请切换到普通网页或打开测试靶场',
      showHud: '🎛️ 在当前网页显示悬浮面板 (Alt+H)',
      hideHud: '🙈 在当前网页隐藏悬浮面板 (Alt+H)',
      showPins: '👁️ 显示目标点 (Alt+P)',
      hidePins: '🙈 隐藏目标点 (Alt+P)',
      startFlow: '▶ 启动流程 (F8)',
      pauseFlow: '⏸ 暂停执行 (F8)',
      resumeFlow: '▶ 继续执行 (F8)',
      stopFlow: '⏹ 停止 (Esc)',
      recordStart: '🔴 录制宏转流程 (F9)',
      recordFinish: '⏹ 完成录制转流程 ({count}步)',
      runningBadge: '运行中 ({count})',
      pausedBadge: '已暂停 ({count})',
      recordingBadge: '录制中 ({count}步)',
      hudOnBadge: '本页已开启',
      hudOffBadge: '本页未开启',
      hintText: '引擎: {engine} · {phase}',
      engineSection: '输入派发引擎',
      cdpTitle: '⚡ CDP 原生可信引擎（推荐）',
      cdpDesc: '通过 Chrome Debugger 派发硬件级输入（isTrusted=true），稳定穿透 Canvas / WebGL / Shadow DOM',
      domTitle: '🔇 DOM 静默合成引擎',
      domDesc: '零调试横幅，支持 DOM 选择器追踪、Canvas 比例映射与本地滚动',
      optionsSection: '辅助选项',
      optRipples: '显示点击 / 滚轮 / 拖拽波纹特效',
      optPins: '显示页面目标点位标记 (Pins)',
      optEsc: '按 Esc 键紧急停止执行/录制',
      optDetach: '停止/暂停后自动断开 CDP 调试横幅',
      openPlayground: '🧪 打开 DOM + Canvas + WebGL 测试靶场',
    },
    playground: {
      pageTitle: 'AutoClick Anywhere · DOM / Canvas / WebGL 测试靶场',
      headerTitle: '🎯 AutoClick Anywhere · 全场景交互测试靶场',
      headerSub: '用于验证 DOM 选择器追踪、2D Canvas 无 DOM 游戏按键/拖拽/缩放、WebGL 3D 旋转/点击/滚轮与宏录制回放。',
      toggleHudBtn: '🎛️ 在本页显示/隐藏悬浮面板 (Alt+H)',
      envExtension: '扩展本地页：Chrome 限制对扩展页附加 CDP，此处默认自动使用 DOM 合成引擎；执行 npm run playground 可在 localhost 测试完整 CDP isTrusted=true！',
      envHttp: 'HTTP 页面模式：可同时验证 CDP 原生可信输入 (isTrusted=true) 与 DOM 静默模式！',
      arena1Title: '1. 标准 DOM 交互测试区',
      domClickBtn: '单击计数:',
      domDblBtn: '双击计数:',
      domRightBtn: '右键点击:',
      movingDesc: '动态位移追踪测试（测试 DOM 选择器抗位移能力）',
      movingStart: '开启移动',
      movingStop: '停止移动',
      movingTargetBtn: '移动靶心:',
      scrollTitle: '局部滚动容器测试',
      scrollRowPrefix: '列表项 · 测试局部容器与滚轮事件自动滚动',
      scrollRowBottom: '到底了！',
      arena2Title: '2. 2D Canvas 无 DOM 游戏区',
      statAtk: '⚔️ 攻击:',
      statGold: '💎 金币:',
      statHold: '🛡️ 蓄力:',
      statZoom: '🔍 缩放:',
      c2dBtnAtk: '⚔️ 攻击 Boss',
      c2dBtnGold: '💎 采集金币',
      c2dBtnHold: '🛡️ 蓄力长按',
      c2dOrbHint: '可拖拽能量球区域 · 缩放',
      c2dTip: '内部按钮全部绘制在 Canvas 像素上（无 DOM）。支持点击按钮、拖拽青色能量球、鼠标滚轮缩放。',
      arena3Title: '3. WebGL 3D 交互区',
      statHits: '🎯 命中:',
      statRot: '🔄 视角:',
      statDistZoom: '🔭 距离缩放:',
      wglTip: '真实 WebGL 着色器渲染：点击触发脉冲命中，按住拖拽旋转 3D 模型，滚轮缩放视角。',
      inspectorTitle: '📡 实时输入事件监视台（检验 isTrusted 与坐标穿透）',
      clearLogs: '清空日志',
    },
  },

  zh_TW: {
    autoLangOption: '🌐 自動 (跟隨瀏覽器)',
    presets: {
      singleFlowName: '單點連點流程',
      singleStepName: '單點連續點擊',
      scrollFlowName: '連續自動捲動流程',
      scrollStepName: '頁面連續下滑',
      comboFlowName: '點擊 + 捲動組合範例',
      comboClickName: '觸發點擊',
      comboWheelName: '向下捲動',
      comboWaitName: '等待冷卻',
      emptyFlowName: '自訂空白流程',
    },
    recordedFlowName: '錄製流程 #{n}',
    importedFlowDefaultName: '匯入流程',
    importedFlowSuffix: ' (匯入)',
    stepTypes: {
      click: '點擊',
      wheel: '捲動',
      drag: '拖曳',
      key: '按鍵',
      wait: '等待',
    },
    phases: {
      idle: '閒置',
      delayBefore: '前置等待',
      acting: '觸發動作',
      holding: '長按蓄力',
      dragging: '軌跡拖曳',
      waiting: '等待冷卻',
      repeatInterval: '連點間隔',
      delayAfter: '後置冷卻',
      loopCooldown: '輪次冷卻',
    },
    hud: {
      title: 'AutoClick 流程圖控制台',
      miniTitle: '流程 ({count})',
      pinsOnBtn: '👁️ 點位',
      pinsOffBtn: '🙈 點位',
      pinsToggleTitle: '一鍵顯示/隱藏放置的目標點 (Alt+P)',
      toggleWideTitle: '切換寬/窄面板',
      minimizeTitle: '最小化為懸浮膠囊',
      hideTitle: '在本頁隱藏面板 (Alt+H)',
      expandBtn: '展開',
      resumeShort: '▶ 繼續',
      engineCdp: '⚡ CDP 原生',
      engineDom: '🔇 DOM 靜默',
      engineSwitchTitle: '支援執行中即時熱切換引擎',
      trustedFooter: '可信輸入',
      domFooter: 'DOM 合成',
      hotkeysFooter: 'F8 啟停/暫停 · Esc 停止 · F9 錄製 · Alt+P 顯隱點位',
      statusRunning: '執行中 · 輪 {loop}/{total} · <strong>{count}</strong>次',
      statusPaused: '<span style="color:#fbbf24;">⏸ 已暫停</span> · <strong>{count}</strong>次',
      statusRecording: '<span style="color:#fb7185;">錄製中</span> · <strong>{count}</strong>步',
      statusIdle: '閒置就緒',
      pauseBtn: '⏸ 暫停 (F8)',
      stopBtn: '⏹ 停止 (Esc)',
      resumeBtn: '▶ 繼續執行 (F8)',
      stopResetBtn: '⏹ 停止重置',
      startBtn: '▶ 啟動流程 (F8)',
      recordFinishBtn: '⏹ 完成錄製並產生流程 (已錄 {count} 步)',
      recordStartBtn: '🔴 錄製巨集轉流程 (F9)',
      recordBtnTitle: '錄製操作並在結束後自動轉為流程圖',
      renameBtn: '改名',
      renameTitle: '重新命名流程',
      renamePrompt: '輸入流程名稱：',
      deleteBtn: '刪',
      deleteTitle: '刪除流程',
      exportBtn: '匯出',
      exportTitle: '匯出 JSON',
      importBtn: '匯入',
      importTitle: '匯入 JSON',
      newPrefix: '新增:',
      presetSingle: '+單點',
      presetScroll: '+捲動',
      presetEmpty: '+空白',
      recWheelLabel: '錄滾輪',
      recKeyLabel: '錄按鍵',
      speedLabel: '流程倍速',
      loopsLabel: '循環 (0=無限)',
      loopCdLabel: '輪次CD (ms)',
      addStepLabel: '新增步驟:',
      addClick: '🎯 點擊',
      addWheel: '🎡 捲動',
      addDrag: '✥ 拖曳',
      addKey: '⌨️ 按鍵',
      addWait: '⏳ 等待',
      flowStartMacro: '● 流程起點 (巨集錄製轉換)',
      flowStartManual: '● 流程起點 (視覺化編排)',
      emptyFlowHint: '尚無步驟節點，請點擊上方「🎯 點擊 / 🎡 捲動 / ✥ 拖曳 / ⌨️ 按鍵 / ⏳ 等待」或點擊「🔴 錄製巨集轉流程」',
      loopControlTitle: '流程循環控制節點',
      loopInfiniteText: '無限循環返回起點 · 輪次冷卻 {ms}ms',
      loopFiniteText: '循環 {count} 輪返回起點 · 輪次冷卻 {ms}ms',
      followCursorSummary: '跟隨滑鼠即時位置',
      viewportCenterSummary: '視口中心點擊',
      pageScrollSummary: '頁面/游標位置捲動',
      dragStartUnset: '起點未定',
      dragEndUnset: '終點未定',
      keySummary: '按鍵 [{key}]',
      waitSummary: '等待 {ms}ms',
      chipWait: '等待 {ms}ms',
      chipDrag: '拖曳 {ms}ms · {rep}',
      chipScroll: '捲動 {dir} · {rep}',
      chipKey: '按鍵 [{key}] · {rep}',
      chipClick: '{btn}鍵{kind} · {rep}',
      chipPreDelay: '前置 {ms}ms',
      chipRepeatGap: '連點間隔 {ms}ms',
      chipPostDelay: '後置 {ms}ms',
      repInfinite: '∞次',
      repTimes: '{n}次',
      btnLeft: '左',
      btnRight: '右',
      btnMiddle: '中',
      kindSingle: '單擊',
      kindDouble: '雙擊',
      kindHold: '長按{ms}ms',
      editTitle: '展開/收合節點參數',
      moveUpTitle: '上移',
      moveDownTitle: '下移',
      deleteStepTitle: '刪除節點',
      editorNameLabel: '步驟備註名稱',
      editorNamePlaceholder: '選填，如：點擊攻擊按鈕',
      editorFollowCursor: '跟隨滑鼠即時位置',
      editorRepickTarget: '🎯 重選座標',
      editorLocMode: '定位方式',
      locAuto: '自動識別',
      locCanvas: 'Canvas比例',
      locDom: 'DOM選擇器',
      locViewport: '固定座標',
      editorMouseBtn: '按鍵',
      editorBtnLeft: '左鍵',
      editorBtnRight: '右鍵',
      editorBtnMiddle: '中鍵',
      editorClickKind: '方式',
      editorKindSingle: '單擊',
      editorKindDouble: '雙擊',
      editorKindHold: '長按',
      editorHoldMs: '按住時長 (ms)',
      editorJitterPx: '座標偏移 ±px',
      editorPageScroll: '整頁/滑鼠位置捲動',
      editorPickContainer: '🎯 拾取容器/畫布',
      editorScrollDir: '方向',
      dirDown: '向下',
      dirUp: '向上',
      dirLeft: '向左',
      dirRight: '向右',
      dirCustom: '自訂',
      editorPickStartA: '🎯 重選起點 A',
      editorPickEndB: '🎯 重選終點 B',
      editorDragMs: '拖曳耗時 (ms)',
      editorKeyCapture: '按鍵擷取（點擊輸入框後直接按下目標按鍵）',
      editorWaitMs: '等待時長 (ms)',
      editorPreWaitMs: '前置等待 ms',
      editorRepeatCount: '重複 (0=無限)',
      editorRepeatGapMs: '連點間隔 ms',
      editorPostWaitMs: '後置冷卻 ms',
      editorJitterMs: '時間隨機抖動 ±ms',
      pickClickPrompt: '點擊任意 DOM 元素或 Canvas/WebGL 位置新增「點擊步驟」',
      pickWheelPrompt: '點擊要捲動的容器或 Canvas/WebGL 位置新增「捲動步驟」（也可隨後切為整頁捲動）',
      pickDragPrompt: '按住左鍵從起點拖曳到終點新增「拖曳步驟」（Esc 取消）',
      pickStepStartPrompt: '點擊設定該步驟的新目標位置（Esc 取消）',
      pickStepEndPrompt: '點擊設定該拖曳步驟的終點 B（Esc 取消）',
    },
    picker: {
      defaultPointPrompt: '移動滑鼠選擇目標位置（支援 DOM / Canvas / WebGL），左鍵確認，Esc 取消',
      defaultDragPrompt: '按住左鍵從起點拖曳到終點放開，即可建立拖曳軌跡（Esc 取消）',
      canvasRatio: '畫布比例: u={u}%, v={v}%',
      coordLabel: '座標: ({x}, {y})',
      viewportCoord: '📍 視口座標',
      dragEndTitle: '拖曳終點',
      dragStartTitle: '按下左鍵設定拖曳起點',
      dragDistance: '({x}, {y}) · 距離 {d}px',
    },
    overlay: {
      pinTitle: '#{idx} {type} ({x}, {y}) · 按住拖曳可調整座標',
      endPinTitle: '#{idx} 拖曳終點 ({x}, {y}) · 按住拖曳可調整',
      scrollDown: '↓ 捲動',
      scrollUp: '↑ 捲動',
      scrollRight: '→ 捲動',
      scrollLeft: '← 捲動',
    },
    fallback: {
      restrictedPage: '受限系統/擴充頁面不支援 CDP，已自動切換為 DOM 引擎',
      devtoolsAttached: '頁面已開啟 DevTools 偵錯器，已自動切換為 DOM 引擎',
      genericFallback: 'CDP 無法使用，已自動切換為 DOM 引擎',
    },
    popup: {
      subtitle: 'DOM + Canvas/WebGL 流程圖自動點擊器',
      detecting: '偵測中…',
      restrictedStatus: '受限頁面/未連線',
      restrictedHint: '若目前為瀏覽器設定頁，請切換到一般網頁或開啟測試靶場',
      showHud: '🎛️ 在目前網頁顯示懸浮面板 (Alt+H)',
      hideHud: '🙈 在目前網頁隱藏懸浮面板 (Alt+H)',
      showPins: '👁️ 顯示目標點 (Alt+P)',
      hidePins: '🙈 隱藏目標點 (Alt+P)',
      startFlow: '▶ 啟動流程 (F8)',
      pauseFlow: '⏸ 暫停執行 (F8)',
      resumeFlow: '▶ 繼續執行 (F8)',
      stopFlow: '⏹ 停止 (Esc)',
      recordStart: '🔴 錄製巨集轉流程 (F9)',
      recordFinish: '⏹ 完成錄製轉流程 ({count}步)',
      runningBadge: '執行中 ({count})',
      pausedBadge: '已暫停 ({count})',
      recordingBadge: '錄製中 ({count}步)',
      hudOnBadge: '本頁已開啟',
      hudOffBadge: '本頁未開啟',
      hintText: '引擎: {engine} · {phase}',
      engineSection: '輸入派發引擎',
      cdpTitle: '⚡ CDP 原生可信引擎（推薦）',
      cdpDesc: '透過 Chrome Debugger 派發硬體級輸入（isTrusted=true），穩定穿透 Canvas / WebGL / Shadow DOM',
      domTitle: '🔇 DOM 靜默合成引擎',
      domDesc: '零偵錯橫幅，支援 DOM 選擇器追蹤、Canvas 比例映射與本地捲動',
      optionsSection: '輔助選項',
      optRipples: '顯示點擊 / 滾輪 / 拖曳波紋特效',
      optPins: '顯示頁面目標點位標記 (Pins)',
      optEsc: '按 Esc 鍵緊急停止執行/錄製',
      optDetach: '停止/暫停後自動中斷 CDP 偵錯橫幅',
      openPlayground: '🧪 開啟 DOM + Canvas + WebGL 測試靶場',
    },
    playground: {
      pageTitle: 'AutoClick Anywhere · DOM / Canvas / WebGL 測試靶場',
      headerTitle: '🎯 AutoClick Anywhere · 全場景互動測試靶場',
      headerSub: '用於驗證 DOM 選擇器追蹤、2D Canvas 無 DOM 遊戲按鍵/拖曳/縮放、WebGL 3D 旋轉/點擊/滾輪與巨集錄製回放。',
      toggleHudBtn: '🎛️ 在本頁顯示/隱藏懸浮面板 (Alt+H)',
      envExtension: '擴充本地頁：Chrome 限制對擴充頁附加 CDP，此處預設自動使用 DOM 合成引擎；執行 npm run playground 可於 localhost 測試完整 CDP isTrusted=true！',
      envHttp: 'HTTP 頁面模式：可同時驗證 CDP 原生可信輸入 (isTrusted=true) 與 DOM 靜默模式！',
      arena1Title: '1. 標準 DOM 互動測試區',
      domClickBtn: '單擊計數:',
      domDblBtn: '雙擊計數:',
      domRightBtn: '右鍵點擊:',
      movingDesc: '動態位移追蹤測試（測試 DOM 選擇器抗位移能力）',
      movingStart: '開啟移動',
      movingStop: '停止移動',
      movingTargetBtn: '移動靶心:',
      scrollTitle: '局部捲動容器測試',
      scrollRowPrefix: '列表項目 · 測試局部容器與滾輪事件自動捲動',
      scrollRowBottom: '到底了！',
      arena2Title: '2. 2D Canvas 無 DOM 遊戲區',
      statAtk: '⚔️ 攻擊:',
      statGold: '💎 金幣:',
      statHold: '🛡️ 蓄力:',
      statZoom: '🔍 縮放:',
      c2dBtnAtk: '⚔️ 攻擊 Boss',
      c2dBtnGold: '💎 採集金幣',
      c2dBtnHold: '🛡️ 蓄力長按',
      c2dOrbHint: '可拖曳能量球區域 · 縮放',
      c2dTip: '內部按鈕全部繪製於 Canvas 像素上（無 DOM）。支援點擊按鈕、拖曳青色能量球、滑鼠滾輪縮放。',
      arena3Title: '3. WebGL 3D 互動區',
      statHits: '🎯 命中:',
      statRot: '🔄 視角:',
      statDistZoom: '🔭 距離縮放:',
      wglTip: '真實 WebGL 著色器渲染：點擊觸發脈衝命中，按住拖曳旋轉 3D 模型，滾輪縮放視角。',
      inspectorTitle: '📡 即時輸入事件監視台（檢驗 isTrusted 與座標穿透）',
      clearLogs: '清除日誌',
    },
  },

  en: {
    autoLangOption: '🌐 Auto (Browser UI)',
    presets: {
      singleFlowName: 'Single-Point Rapid Flow',
      singleStepName: 'Rapid Single Click',
      scrollFlowName: 'Auto Scroll Flow',
      scrollStepName: 'Continuous Scroll Down',
      comboFlowName: 'Click + Scroll Combo',
      comboClickName: 'Trigger Click',
      comboWheelName: 'Scroll Down',
      comboWaitName: 'Cooldown Wait',
      emptyFlowName: 'Blank Custom Flow',
    },
    recordedFlowName: 'Recorded Flow #{n}',
    importedFlowDefaultName: 'Imported Flow',
    importedFlowSuffix: ' (Imported)',
    stepTypes: {
      click: 'Click',
      wheel: 'Scroll',
      drag: 'Drag',
      key: 'Key',
      wait: 'Wait',
    },
    phases: {
      idle: 'Idle',
      delayBefore: 'Pre-Delay',
      acting: 'Dispatching',
      holding: 'Holding',
      dragging: 'Dragging',
      waiting: 'Waiting',
      repeatInterval: 'Repeat Gap',
      delayAfter: 'Cooldown',
      loopCooldown: 'Loop Cooldown',
    },
    hud: {
      title: 'AutoClick Flowchart HUD',
      miniTitle: 'Flow ({count})',
      pinsOnBtn: '👁️ Pins',
      pinsOffBtn: '🙈 Pins',
      pinsToggleTitle: 'Show/Hide Target Pins (Alt+P)',
      toggleWideTitle: 'Toggle Wide/Compact Panel',
      minimizeTitle: 'Minimize to Pill',
      hideTitle: 'Hide on This Page (Alt+H)',
      expandBtn: 'Expand',
      resumeShort: '▶ Resume',
      engineCdp: '⚡ CDP Native',
      engineDom: '🔇 DOM Silent',
      engineSwitchTitle: 'Switch input engine live while running',
      trustedFooter: 'Trusted Input',
      domFooter: 'DOM Synthetic',
      hotkeysFooter: 'F8 Run/Pause · Esc Stop · F9 Record · Alt+P Pins',
      statusRunning: 'Running · Loop {loop}/{total} · <strong>{count}</strong>',
      statusPaused: '<span style="color:#fbbf24;">⏸ Paused</span> · <strong>{count}</strong>',
      statusRecording: '<span style="color:#fb7185;">Recording</span> · <strong>{count}</strong> steps',
      statusIdle: 'Ready',
      pauseBtn: '⏸ Pause (F8)',
      stopBtn: '⏹ Stop (Esc)',
      resumeBtn: '▶ Resume (F8)',
      stopResetBtn: '⏹ Stop & Reset',
      startBtn: '▶ Start Flow (F8)',
      recordFinishBtn: '⏹ Finish -> Flow ({count} steps)',
      recordStartBtn: '🔴 Record Macro (F9)',
      recordBtnTitle: 'Record actions and auto-convert into a flowchart',
      renameBtn: 'Rename',
      renameTitle: 'Rename flow',
      renamePrompt: 'Enter flow name:',
      deleteBtn: 'Del',
      deleteTitle: 'Delete flow',
      exportBtn: 'Export',
      exportTitle: 'Export JSON',
      importBtn: 'Import',
      importTitle: 'Import JSON',
      newPrefix: 'New:',
      presetSingle: '+Click',
      presetScroll: '+Scroll',
      presetEmpty: '+Blank',
      recWheelLabel: 'Wheel',
      recKeyLabel: 'Keys',
      speedLabel: 'Speed',
      loopsLabel: 'Loops (0=∞)',
      loopCdLabel: 'Loop CD (ms)',
      addStepLabel: 'Add Step:',
      addClick: '🎯 Click',
      addWheel: '🎡 Scroll',
      addDrag: '✥ Drag',
      addKey: '⌨️ Key',
      addWait: '⏳ Wait',
      flowStartMacro: '● Flow Start (From Macro)',
      flowStartManual: '● Flow Start (Visual)',
      emptyFlowHint: 'No steps yet. Add steps above or click "Record Macro (F9)" to auto-build a flowchart.',
      loopControlTitle: 'Loop Control Node',
      loopInfiniteText: 'Loop forever · Cooldown {ms}ms',
      loopFiniteText: 'Repeat {count} loops · Cooldown {ms}ms',
      followCursorSummary: 'Follow Live Cursor',
      viewportCenterSummary: 'Viewport Center Click',
      pageScrollSummary: 'Page / Cursor Scroll',
      dragStartUnset: 'Start Unset',
      dragEndUnset: 'End Unset',
      keySummary: 'Key [{key}]',
      waitSummary: 'Wait {ms}ms',
      chipWait: 'Wait {ms}ms',
      chipDrag: 'Drag {ms}ms · {rep}',
      chipScroll: 'Scroll {dir} · {rep}',
      chipKey: 'Key [{key}] · {rep}',
      chipClick: '{btn} {kind} · {rep}',
      chipPreDelay: 'Pre {ms}ms',
      chipRepeatGap: 'Gap {ms}ms',
      chipPostDelay: 'Post {ms}ms',
      repInfinite: '∞x',
      repTimes: '{n}x',
      btnLeft: 'L',
      btnRight: 'R',
      btnMiddle: 'M',
      kindSingle: 'Click',
      kindDouble: 'Dbl',
      kindHold: 'Hold {ms}ms',
      editTitle: 'Edit step parameters',
      moveUpTitle: 'Move up',
      moveDownTitle: 'Move down',
      deleteStepTitle: 'Delete step',
      editorNameLabel: 'Step Label',
      editorNamePlaceholder: 'Optional label (e.g. Attack Button)',
      editorFollowCursor: 'Follow live cursor',
      editorRepickTarget: '🎯 Pick Target',
      editorLocMode: 'Locator Mode',
      locAuto: 'Auto',
      locCanvas: 'Canvas Ratio',
      locDom: 'DOM Selector',
      locViewport: 'Viewport XY',
      editorMouseBtn: 'Button',
      editorBtnLeft: 'Left',
      editorBtnRight: 'Right',
      editorBtnMiddle: 'Middle',
      editorClickKind: 'Action',
      editorKindSingle: 'Single',
      editorKindDouble: 'Double',
      editorKindHold: 'Hold',
      editorHoldMs: 'Hold (ms)',
      editorJitterPx: 'Pos Jitter ±px',
      editorPageScroll: 'Scroll page / cursor',
      editorPickContainer: '🎯 Pick Container/Canvas',
      editorScrollDir: 'Direction',
      dirDown: 'Down',
      dirUp: 'Up',
      dirLeft: 'Left',
      dirRight: 'Right',
      dirCustom: 'Custom',
      editorPickStartA: '🎯 Pick Start A',
      editorPickEndB: '🎯 Pick End B',
      editorDragMs: 'Drag Duration (ms)',
      editorKeyCapture: 'Key Capture (focus input and press key)',
      editorWaitMs: 'Wait Duration (ms)',
      editorPreWaitMs: 'Pre-Delay ms',
      editorRepeatCount: 'Repeat (0=∞)',
      editorRepeatGapMs: 'Repeat Gap ms',
      editorPostWaitMs: 'Post-CD ms',
      editorJitterMs: 'Time Jitter ±ms',
      pickClickPrompt: 'Click any DOM element or Canvas/WebGL point to add a Click step (Esc to cancel)',
      pickWheelPrompt: 'Click any container or Canvas/WebGL point to add a Scroll step (Esc to cancel)',
      pickDragPrompt: 'Press and drag from A to B to add a Drag step (Esc to cancel)',
      pickStepStartPrompt: 'Click to set new target point for this step (Esc to cancel)',
      pickStepEndPrompt: 'Click to set drag end point B (Esc to cancel)',
    },
    picker: {
      defaultPointPrompt: 'Move cursor over any DOM / Canvas / WebGL element, Left-click to pick, Esc to cancel',
      defaultDragPrompt: 'Press and drag from start to end, then release (Esc to cancel)',
      canvasRatio: 'Canvas Ratio: u={u}%, v={v}%',
      coordLabel: 'Coords: ({x}, {y})',
      viewportCoord: '📍 Viewport Point',
      dragEndTitle: 'Drag End Point',
      dragStartTitle: 'Press Left Mouse to Set Start Point',
      dragDistance: '({x}, {y}) · Dist {d}px',
    },
    overlay: {
      pinTitle: '#{idx} {type} ({x}, {y}) · Drag to reposition',
      endPinTitle: '#{idx} Drag End ({x}, {y}) · Drag to reposition',
      scrollDown: '↓ Scroll',
      scrollUp: '↑ Scroll',
      scrollRight: '→ Scroll',
      scrollLeft: '← Scroll',
    },
    fallback: {
      restrictedPage: 'CDP unavailable on restricted browser/extension page; switched to DOM engine',
      devtoolsAttached: 'DevTools already attached on this tab; switched to DOM engine',
      genericFallback: 'CDP unavailable; switched to DOM engine',
    },
    popup: {
      subtitle: 'DOM + Canvas/WebGL Flowchart Auto-Clicker',
      detecting: 'Checking…',
      restrictedStatus: 'Restricted / Unconnected',
      restrictedHint: 'Switch to a normal webpage or open the built-in Test Playground',
      showHud: '🎛️ Show Floating HUD on This Tab (Alt+H)',
      hideHud: '🙈 Hide Floating HUD on This Tab (Alt+H)',
      showPins: '👁️ Show Pins (Alt+P)',
      hidePins: '🙈 Hide Pins (Alt+P)',
      startFlow: '▶ Start Flow (F8)',
      pauseFlow: '⏸ Pause (F8)',
      resumeFlow: '▶ Resume (F8)',
      stopFlow: '⏹ Stop (Esc)',
      recordStart: '🔴 Record Macro (F9)',
      recordFinish: '⏹ Finish Macro ({count} steps)',
      runningBadge: 'Running ({count})',
      pausedBadge: 'Paused ({count})',
      recordingBadge: 'Recording ({count})',
      hudOnBadge: 'HUD Open',
      hudOffBadge: 'HUD Closed',
      hintText: 'Engine: {engine} · {phase}',
      engineSection: 'Input Dispatch Engine',
      cdpTitle: '⚡ CDP Native Trusted Engine (Recommended)',
      cdpDesc: 'Dispatches hardware-level events (isTrusted=true) via Chrome Debugger; pierces Canvas / WebGL / Shadow DOM',
      domTitle: '🔇 DOM Silent Synthetic Engine',
      domDesc: 'Zero debugger banner; tracks DOM selectors, Canvas normalized coordinates & nested scroll containers',
      optionsSection: 'Options',
      optRipples: 'Show click / wheel / drag ripple effects',
      optPins: 'Show numbered target pins on page',
      optEsc: 'Press Esc for emergency stop',
      optDetach: 'Auto-detach CDP debugger when stopped/paused',
      openPlayground: '🧪 Open DOM + Canvas + WebGL Test Playground',
    },
    playground: {
      pageTitle: 'AutoClick Anywhere · DOM / Canvas / WebGL Test Playground',
      headerTitle: '🎯 AutoClick Anywhere · Interactive Test Playground',
      headerSub: 'Test DOM selector tracking, DOM-less 2D Canvas buttons/drag/zoom, WebGL 3D orbit/click/wheel, and macro workflows.',
      toggleHudBtn: '🎛️ Toggle HUD on This Page (Alt+H)',
      envExtension: 'Extension URL: Chrome disallows attaching CDP on chrome-extension:// pages, so DOM engine is used here. Run `npm run playground` for full CDP isTrusted=true testing!',
      envHttp: 'HTTP Page Mode: Test both CDP Trusted Engine (isTrusted=true) and DOM Silent Engine!',
      arena1Title: '1. Standard DOM Arena',
      domClickBtn: 'Click:',
      domDblBtn: 'DblClick:',
      domRightBtn: 'RightClick:',
      movingDesc: 'Moving Target Tracker (tests resilient DOM selector tracking)',
      movingStart: 'Start Moving',
      movingStop: 'Stop Moving',
      movingTargetBtn: 'Moving Target:',
      scrollTitle: 'Nested Scroll Container Test',
      scrollRowPrefix: 'List Item · Nested container & wheel scroll test',
      scrollRowBottom: 'Reached bottom!',
      arena2Title: '2. 2D Canvas (DOM-less) Arena',
      statAtk: '⚔️ Attack:',
      statGold: '💎 Gold:',
      statHold: '🛡️ Charge:',
      statZoom: '🔍 Zoom:',
      c2dBtnAtk: '⚔️ Attack Boss',
      c2dBtnGold: '💎 Collect Gold',
      c2dBtnHold: '🛡️ Hold Charge',
      c2dOrbHint: 'Drag Orb Zone · Zoom',
      c2dTip: 'All buttons are drawn on Canvas pixels (zero DOM). Supports clicks, orb dragging, and wheel zoom.',
      arena3Title: '3. WebGL 3D Interactive Arena',
      statHits: '🎯 Hits:',
      statRot: '🔄 Orbit:',
      statDistZoom: '🔭 Zoom:',
      wglTip: 'Real WebGL shader rendering: click to pulse-hit, drag to orbit 3D model, wheel to zoom.',
      inspectorTitle: '📡 Live Input Event Inspector (Verify isTrusted & Coordinates)',
      clearLogs: 'Clear',
    },
  },

  ja: {
    autoLangOption: '🌐 自動 (ブラウザ言語)',
    presets: {
      singleFlowName: '単点連打フロー',
      singleStepName: '単点連続クリック',
      scrollFlowName: '自動スクロールフロー',
      scrollStepName: '連続下スクロール',
      comboFlowName: 'クリック＋スクロール組合せ',
      comboClickName: 'クリック実行',
      comboWheelName: '下スクロール',
      comboWaitName: 'クールダウン待機',
      emptyFlowName: '空白カスタムフロー',
    },
    recordedFlowName: '録画フロー #{n}',
    importedFlowDefaultName: 'インポートフロー',
    importedFlowSuffix: ' (取込)',
    stepTypes: {
      click: 'クリック',
      wheel: 'スクロール',
      drag: 'ドラッグ',
      key: 'キー',
      wait: '待機',
    },
    phases: {
      idle: '待機中',
      delayBefore: '開始前待機',
      acting: '実行中',
      holding: '長押し中',
      dragging: 'ドラッグ中',
      waiting: '待機中',
      repeatInterval: '連打間隔',
      delayAfter: '終了後待機',
      loopCooldown: '周回待機',
    },
    hud: {
      title: 'AutoClick フローチャートHUD',
      miniTitle: 'フロー ({count})',
      pinsOnBtn: '👁️ ピン',
      pinsOffBtn: '🙈 ピン',
      pinsToggleTitle: 'ターゲットピンの表示/非表示 (Alt+P)',
      toggleWideTitle: 'パネル幅の切替',
      minimizeTitle: 'ミニカプセルに最小化',
      hideTitle: 'このページで非表示 (Alt+H)',
      expandBtn: '展開',
      resumeShort: '▶ 再開',
      engineCdp: '⚡ CDP ネイティブ',
      engineDom: '🔇 DOM サイレント',
      engineSwitchTitle: '実行中でもリアルタイムにエンジン切替可能',
      trustedFooter: 'Trusted 入力',
      domFooter: 'DOM 合成',
      hotkeysFooter: 'F8 開始/一時停止 · Esc 停止 · F9 録画 · Alt+P ピン',
      statusRunning: '実行中 · 周回 {loop}/{total} · <strong>{count}</strong>回',
      statusPaused: '<span style="color:#fbbf24;">⏸ 一時停止</span> · <strong>{count}</strong>回',
      statusRecording: '<span style="color:#fb7185;">録画中</span> · <strong>{count}</strong>ステップ',
      statusIdle: '準備完了',
      pauseBtn: '⏸ 一時停止 (F8)',
      stopBtn: '⏹ 停止 (Esc)',
      resumeBtn: '▶ 再開 (F8)',
      stopResetBtn: '⏹ 停止リセット',
      startBtn: '▶ フロー開始 (F8)',
      recordFinishBtn: '⏹ 録画完了→フロー化 ({count}歩)',
      recordStartBtn: '🔴 マクロ録画 (F9)',
      recordBtnTitle: '操作を録画して終了後に自動フロー化',
      renameBtn: '名称変更',
      renameTitle: 'フロー名を変更',
      renamePrompt: '新しいフロー名を入力：',
      deleteBtn: '削除',
      deleteTitle: 'フローを削除',
      exportBtn: '書出',
      exportTitle: 'JSON エクスポート',
      importBtn: '読込',
      importTitle: 'JSON インポート',
      newPrefix: '新規:',
      presetSingle: '+単点',
      presetScroll: '+スクロール',
      presetEmpty: '+空白',
      recWheelLabel: 'ホイール録画',
      recKeyLabel: 'キー録画',
      speedLabel: '再生速度',
      loopsLabel: '周回 (0=無限)',
      loopCdLabel: '周回CD (ms)',
      addStepLabel: 'ステップ追加:',
      addClick: '🎯 クリック',
      addWheel: '🎡 スクロール',
      addDrag: '✥ ドラッグ',
      addKey: '⌨️ キー',
      addWait: '⏳ 待機',
      flowStartMacro: '● 開始 (マクロ変換)',
      flowStartManual: '● 開始 (ビジュアル編集)',
      emptyFlowHint: 'ステップがありません。上のボタンから追加するか「マクロ録画 (F9)」を実行してください。',
      loopControlTitle: 'フロー周回制御ノード',
      loopInfiniteText: '無限ループ · 周回クールダウン {ms}ms',
      loopFiniteText: '{count} 回周回 · 周回クールダウン {ms}ms',
      followCursorSummary: 'カーソル位置を追従',
      viewportCenterSummary: '画面中央クリック',
      pageScrollSummary: 'ページ/カーソル位置スクロール',
      dragStartUnset: '始点未設定',
      dragEndUnset: '終点未設定',
      keySummary: 'キー [{key}]',
      waitSummary: '待機 {ms}ms',
      chipWait: '待機 {ms}ms',
      chipDrag: 'ドラッグ {ms}ms · {rep}',
      chipScroll: 'スクロール {dir} · {rep}',
      chipKey: 'キー [{key}] · {rep}',
      chipClick: '{btn}{kind} · {rep}',
      chipPreDelay: '前 {ms}ms',
      chipRepeatGap: '間隔 {ms}ms',
      chipPostDelay: '後 {ms}ms',
      repInfinite: '∞回',
      repTimes: '{n}回',
      btnLeft: '左',
      btnRight: '右',
      btnMiddle: '中',
      kindSingle: 'クリック',
      kindDouble: 'ダブル',
      kindHold: '長押し{ms}ms',
      editTitle: 'パラメータ編集を開閉',
      moveUpTitle: '上へ',
      moveDownTitle: '下へ',
      deleteStepTitle: 'ステップ削除',
      editorNameLabel: 'ステップ名メモ',
      editorNamePlaceholder: '任意（例：攻撃ボタン）',
      editorFollowCursor: 'カーソル位置をリアルタイム追従',
      editorRepickTarget: '🎯 座標を再選択',
      editorLocMode: 'ターゲット方式',
      locAuto: '自動判定',
      locCanvas: 'Canvas比率',
      locDom: 'DOMセレクタ',
      locViewport: '固定座標',
      editorMouseBtn: 'ボタン',
      editorBtnLeft: '左',
      editorBtnRight: '右',
      editorBtnMiddle: '中',
      editorClickKind: '種類',
      editorKindSingle: 'シングル',
      editorKindDouble: 'ダブル',
      editorKindHold: '長押し',
      editorHoldMs: '長押し時間 (ms)',
      editorJitterPx: '座標揺らぎ ±px',
      editorPageScroll: 'ページ全体をスクロール',
      editorPickContainer: '🎯 コンテナ/Canvas選択',
      editorScrollDir: '方向',
      dirDown: '下',
      dirUp: '上',
      dirLeft: '左',
      dirRight: '右',
      dirCustom: 'カスタム',
      editorPickStartA: '🎯 始点 A 選択',
      editorPickEndB: '🎯 終点 B 選択',
      editorDragMs: 'ドラッグ時間 (ms)',
      editorKeyCapture: 'キー入力（ここをクリックしてキーを押下）',
      editorWaitMs: '待機時間 (ms)',
      editorPreWaitMs: '開始前待機 ms',
      editorRepeatCount: '反復 (0=無限)',
      editorRepeatGapMs: '連打間隔 ms',
      editorPostWaitMs: '終了後待機 ms',
      editorJitterMs: '時間揺らぎ ±ms',
      pickClickPrompt: 'DOM要素またはCanvas/WebGL上の位置をクリックして追加 (Escでキャンセル)',
      pickWheelPrompt: 'スクロール対象のコンテナまたはCanvas位置をクリック (Escでキャンセル)',
      pickDragPrompt: '左ボタンで始点から終点までドラッグしてください (Escでキャンセル)',
      pickStepStartPrompt: 'このステップの新しいターゲット位置をクリック (Escでキャンセル)',
      pickStepEndPrompt: 'ドラッグの終点 B をクリックして指定 (Escでキャンセル)',
    },
    picker: {
      defaultPointPrompt: '対象にカーソルを合わせて左クリックで選択 (Escでキャンセル)',
      defaultDragPrompt: '始点から終点へドラッグして離してください (Escでキャンセル)',
      canvasRatio: 'Canvas比率: u={u}%, v={v}%',
      coordLabel: '座標: ({x}, {y})',
      viewportCoord: '📍 ビューポート座標',
      dragEndTitle: 'ドラッグ終点',
      dragStartTitle: '左押下でドラッグ始点を指定',
      dragDistance: '({x}, {y}) · 距離 {d}px',
    },
    overlay: {
      pinTitle: '#{idx} {type} ({x}, {y}) · ドラッグで位置調整',
      endPinTitle: '#{idx} 終点 ({x}, {y}) · ドラッグで位置調整',
      scrollDown: '↓ スクロール',
      scrollUp: '↑ スクロール',
      scrollRight: '→ スクロール',
      scrollLeft: '← スクロール',
    },
    fallback: {
      restrictedPage: '制限ページのため CDP は使用できません。DOM エンジンに切替えました',
      devtoolsAttached: 'DevTools が既に開いているため DOM エンジンに切替えました',
      genericFallback: 'CDP が利用できないため DOM エンジンに切替えました',
    },
    popup: {
      subtitle: 'DOM + Canvas/WebGL フローチャート自動クリック',
      detecting: '接続確認中…',
      restrictedStatus: '制限ページ / 未接続',
      restrictedHint: '通常のWebページに切り替えるかテストプレイグラウンドを開いてください',
      showHud: '🎛️ このページでHUDを表示 (Alt+H)',
      hideHud: '🙈 このページでHUDを非表示 (Alt+H)',
      showPins: '👁️ ピン表示 (Alt+P)',
      hidePins: '🙈 ピン非表示 (Alt+P)',
      startFlow: '▶ 開始 (F8)',
      pauseFlow: '⏸ 一時停止 (F8)',
      resumeFlow: '▶ 再開 (F8)',
      stopFlow: '⏹ 停止 (Esc)',
      recordStart: '🔴 マクロ録画 (F9)',
      recordFinish: '⏹ 録画完了 ({count}歩)',
      runningBadge: '実行中 ({count})',
      pausedBadge: '一時停止 ({count})',
      recordingBadge: '録画中 ({count})',
      hudOnBadge: '表示中',
      hudOffBadge: '非表示',
      hintText: 'エンジン: {engine} · {phase}',
      engineSection: '入力ディスパッチエンジン',
      cdpTitle: '⚡ CDP ネイティブ信頼エンジン（推奨）',
      cdpDesc: 'Chrome Debugger で isTrusted=true のハードウェア入力を送信し、Canvas / WebGL を貫通します',
      domTitle: '🔇 DOM サイレント合成エンジン',
      domDesc: 'デバッグバナー無しで DOM セレクタ追跡・Canvas 比率変換・スクロールを実行します',
      optionsSection: 'オプション',
      optRipples: 'クリック・ホイール・ドラッグの波紋を表示',
      optPins: '画面に番号付きピンを表示',
      optEsc: 'Esc キーで緊急停止',
      optDetach: '停止/一時停止時に CDP デバッガを自動解除',
      openPlayground: '🧪 DOM + Canvas + WebGL テスト場を開く',
    },
    playground: {
      pageTitle: 'AutoClick Anywhere · DOM / Canvas / WebGL テスト場',
      headerTitle: '🎯 AutoClick Anywhere · インタラクティブテスト場',
      headerSub: 'DOMセレクタ追従、DOMなし2D Canvasボタン/ドラッグ/ズーム、WebGL 3D回転・クリック・録画を検証できます。',
      toggleHudBtn: '🎛️ このページでHUDを表示/非表示 (Alt+H)',
      envExtension: '拡張ローカルページ: chrome-extension:// では CDP デバッガ制限により DOM エンジンが動作します。npm run playground で CDP (isTrusted=true) も検証できます。',
      envHttp: 'HTTP モード: CDP 信頼入力 (isTrusted=true) と DOM サイレントの両方を検証できます！',
      arena1Title: '1. 標準 DOM テストエリア',
      domClickBtn: 'クリック:',
      domDblBtn: 'ダブル:',
      domRightBtn: '右クリック:',
      movingDesc: '移動ターゲット追従テスト（DOM セレクタ追跡を検証）',
      movingStart: '移動開始',
      movingStop: '移動停止',
      movingTargetBtn: '移動ターゲット:',
      scrollTitle: 'コンテナスクロールテスト',
      scrollRowPrefix: 'リスト項目 · スクロールコンテナ＆ホイール検証',
      scrollRowBottom: '最下部に到達しました！',
      arena2Title: '2. 2D Canvas (DOMなし) ゲームエリア',
      statAtk: '⚔️ 攻撃:',
      statGold: '💎 コイン:',
      statHold: '🛡️ チャージ:',
      statZoom: '🔍 ズーム:',
      c2dBtnAtk: '⚔️ ボス攻撃',
      c2dBtnGold: '💎 コイン獲得',
      c2dBtnHold: '🛡️ 長押し防御',
      c2dOrbHint: 'オーブドラッグ領域 · ズーム',
      c2dTip: 'ボタンは全て Canvas ピクセル描画（DOMなし）です。クリック・オーブドラッグ・ホイールズームに対応。',
      arena3Title: '3. WebGL 3D インタラクティブエリア',
      statHits: '🎯 命中:',
      statRot: '🔄 視点:',
      statDistZoom: '🔭 ズーム:',
      wglTip: 'WebGL シェーダー描画: クリックでパルス命中、ドラッグで3D回転、ホイールでズーム。',
      inspectorTitle: '📡 リアルタイム入力モニター (isTrusted と座標を検証)',
      clearLogs: 'クリア',
    },
  },

  ko: {
    autoLangOption: '🌐 자동 (브라우저 언어)',
    presets: {
      singleFlowName: '단일 연타 플로우',
      singleStepName: '단일 연속 클릭',
      scrollFlowName: '자동 스크롤 플로우',
      scrollStepName: '연속 아래로 스크롤',
      comboFlowName: '클릭 + 스크롤 조합',
      comboClickName: '클릭 실행',
      comboWheelName: '아래로 스크롤',
      comboWaitName: '쿨다운 대기',
      emptyFlowName: '빈 사용자 플로우',
    },
    recordedFlowName: '녹화 플로우 #{n}',
    importedFlowDefaultName: '가져온 플로우',
    importedFlowSuffix: ' (가져옴)',
    stepTypes: {
      click: '클릭',
      wheel: '스크롤',
      drag: '드래그',
      key: '키 입력',
      wait: '대기',
    },
    phases: {
      idle: '대기',
      delayBefore: '사전 대기',
      acting: '동작 실행',
      holding: '길게 누름',
      dragging: '드래그 중',
      waiting: '대기 중',
      repeatInterval: '연타 간격',
      delayAfter: '사후 대기',
      loopCooldown: '반복 쿨다운',
    },
    hud: {
      title: 'AutoClick 플로우차트 콘솔',
      miniTitle: '플로우 ({count})',
      pinsOnBtn: '👁️ 핀',
      pinsOffBtn: '🙈 핀',
      pinsToggleTitle: '타겟 핀 표시/숨기기 (Alt+P)',
      toggleWideTitle: '패널 너비 전환',
      minimizeTitle: '미니 캡슐로 축소',
      hideTitle: '이 페이지에서 숨기기 (Alt+H)',
      expandBtn: '펼치기',
      resumeShort: '▶ 재개',
      engineCdp: '⚡ CDP 네이티브',
      engineDom: '🔇 DOM 무음',
      engineSwitchTitle: '실행 중에도 실시간으로 엔진 전환 가능',
      trustedFooter: '신뢰 입력',
      domFooter: 'DOM 합성',
      hotkeysFooter: 'F8 시작/일시정지 · Esc 중지 · F9 녹화 · Alt+P 핀',
      statusRunning: '실행 중 · 루프 {loop}/{total} · <strong>{count}</strong>회',
      statusPaused: '<span style="color:#fbbf24;">⏸ 일시정지</span> · <strong>{count}</strong>회',
      statusRecording: '<span style="color:#fb7185;">녹화 중</span> · <strong>{count}</strong>단계',
      statusIdle: '준비됨',
      pauseBtn: '⏸ 일시정지 (F8)',
      stopBtn: '⏹ 중지 (Esc)',
      resumeBtn: '▶ 계속 실행 (F8)',
      stopResetBtn: '⏹ 중지 및 초기화',
      startBtn: '▶ 플로우 시작 (F8)',
      recordFinishBtn: '⏹ 녹화 완료→플로우 ({count}단계)',
      recordStartBtn: '🔴 매크로 녹화 (F9)',
      recordBtnTitle: '동작을 녹화하고 종료 시 자동으로 플로우차트로 변환',
      renameBtn: '이름변경',
      renameTitle: '플로우 이름 변경',
      renamePrompt: '새 플로우 이름 입력:',
      deleteBtn: '삭제',
      deleteTitle: '플로우 삭제',
      exportBtn: '내보내기',
      exportTitle: 'JSON 내보내기',
      importBtn: '가져오기',
      importTitle: 'JSON 가져오기',
      newPrefix: '새로 만들기:',
      presetSingle: '+단일클릭',
      presetScroll: '+스크롤',
      presetEmpty: '+빈 플로우',
      recWheelLabel: '휠 녹화',
      recKeyLabel: '키 녹화',
      speedLabel: '재생 배속',
      loopsLabel: '반복 (0=무한)',
      loopCdLabel: '루프 CD (ms)',
      addStepLabel: '단계 추가:',
      addClick: '🎯 클릭',
      addWheel: '🎡 스크롤',
      addDrag: '✥ 드래그',
      addKey: '⌨️ 키',
      addWait: '⏳ 대기',
      flowStartMacro: '● 플로우 시작 (매크로 변환)',
      flowStartManual: '● 플로우 시작 (시각적 편집)',
      emptyFlowHint: '단계가 없습니다. 위 버튼으로 추가하거나 "매크로 녹화 (F9)"를 눌러 시작하세요.',
      loopControlTitle: '플로우 루프 제어 노드',
      loopInfiniteText: '무한 루프 · 루프 쿨다운 {ms}ms',
      loopFiniteText: '{count}회 루프 · 루프 쿨다운 {ms}ms',
      followCursorSummary: '실시간 마우스 커서 추적',
      viewportCenterSummary: '화면 중앙 클릭',
      pageScrollSummary: '페이지 / 커서 위치 스크롤',
      dragStartUnset: '시작점 미설정',
      dragEndUnset: '끝점 미설정',
      keySummary: '키 [{key}]',
      waitSummary: '대기 {ms}ms',
      chipWait: '대기 {ms}ms',
      chipDrag: '드래그 {ms}ms · {rep}',
      chipScroll: '스크롤 {dir} · {rep}',
      chipKey: '키 [{key}] · {rep}',
      chipClick: '{btn} {kind} · {rep}',
      chipPreDelay: '전 {ms}ms',
      chipRepeatGap: '간격 {ms}ms',
      chipPostDelay: '후 {ms}ms',
      repInfinite: '∞회',
      repTimes: '{n}회',
      btnLeft: '좌',
      btnRight: '우',
      btnMiddle: '휠',
      kindSingle: '클릭',
      kindDouble: '더블',
      kindHold: '홀드{ms}ms',
      editTitle: '단계 파라미터 펼치기/접기',
      moveUpTitle: '위로',
      moveDownTitle: '아래로',
      deleteStepTitle: '단계 삭제',
      editorNameLabel: '단계 메모',
      editorNamePlaceholder: '선택 사항 (예: 공격 버튼)',
      editorFollowCursor: '실시간 커서 추적',
      editorRepickTarget: '🎯 좌표 재선택',
      editorLocMode: '타겟 모드',
      locAuto: '자동 감지',
      locCanvas: 'Canvas 비율',
      locDom: 'DOM 선택자',
      locViewport: '고정 좌표',
      editorMouseBtn: '버튼',
      editorBtnLeft: '왼쪽',
      editorBtnRight: '오른쪽',
      editorBtnMiddle: '가운데',
      editorClickKind: '동작',
      editorKindSingle: '클릭',
      editorKindDouble: '더블클릭',
      editorKindHold: '길게 누름',
      editorHoldMs: '홀드 시간 (ms)',
      editorJitterPx: '좌표 오차 ±px',
      editorPageScroll: '전체 페이지/커서 스크롤',
      editorPickContainer: '🎯 컨테이너/캔버스 선택',
      editorScrollDir: '방향',
      dirDown: '아래로',
      dirUp: '위로',
      dirLeft: '왼쪽',
      dirRight: '오른쪽',
      dirCustom: '사용자 정의',
      editorPickStartA: '🎯 시작점 A 선택',
      editorPickEndB: '🎯 끝점 B 선택',
      editorDragMs: '드래그 시간 (ms)',
      editorKeyCapture: '키 캡처 (입력칸 클릭 후 키 입력)',
      editorWaitMs: '대기 시간 (ms)',
      editorPreWaitMs: '사전 대기 ms',
      editorRepeatCount: '반복 (0=무한)',
      editorRepeatGapMs: '반복 간격 ms',
      editorPostWaitMs: '사후 대기 ms',
      editorJitterMs: '시간 오차 ±ms',
      pickClickPrompt: 'DOM 요소 또는 Canvas/WebGL 위치를 클릭해 클릭 단계 추가 (Esc 취소)',
      pickWheelPrompt: '스크롤할 컨테이너 또는 Canvas 위치를 클릭 (Esc 취소)',
      pickDragPrompt: '왼쪽 버튼을 누른 채 시작점에서 끝점까지 드래그 (Esc 취소)',
      pickStepStartPrompt: '이 단계의 새 목표 위치를 클릭하세요 (Esc 취소)',
      pickStepEndPrompt: '드래그 끝점 B 위치를 클릭하세요 (Esc 취소)',
    },
    picker: {
      defaultPointPrompt: '대상 위로 마우스를 이동해 좌클릭으로 선택 (Esc 취소)',
      defaultDragPrompt: '시작점에서 끝점까지 드래그 후 놓으세요 (Esc 취소)',
      canvasRatio: 'Canvas 비율: u={u}%, v={v}%',
      coordLabel: '좌표: ({x}, {y})',
      viewportCoord: '📍 뷰포트 좌표',
      dragEndTitle: '드래그 끝점',
      dragStartTitle: '좌클릭을 눌러 시작점 지정',
      dragDistance: '({x}, {y}) · 거리 {d}px',
    },
    overlay: {
      pinTitle: '#{idx} {type} ({x}, {y}) · 드래그하여 위치 조정',
      endPinTitle: '#{idx} 끝점 ({x}, {y}) · 드래그하여 위치 조정',
      scrollDown: '↓ 스크롤',
      scrollUp: '↑ 스크롤',
      scrollRight: '→ 스크롤',
      scrollLeft: '← 스크롤',
    },
    fallback: {
      restrictedPage: '제한된 페이지에서는 CDP를 사용할 수 없어 DOM 엔진으로 전환했습니다',
      devtoolsAttached: 'DevTools가 이미 연결되어 있어 DOM 엔진으로 전환했습니다',
      genericFallback: 'CDP를 사용할 수 없어 DOM 엔진으로 전환했습니다',
    },
    popup: {
      subtitle: 'DOM + Canvas/WebGL 플로우차트 자동 클릭',
      detecting: '확인 중…',
      restrictedStatus: '제한 페이지 / 미연결',
      restrictedHint: '일반 웹페이지로 전환하거나 내장 테스트장을 열어주세요',
      showHud: '🎛️ 현재 탭에 플로팅 HUD 표시 (Alt+H)',
      hideHud: '🙈 현재 탭에서 플로팅 HUD 숨기기 (Alt+H)',
      showPins: '👁️ 핀 표시 (Alt+P)',
      hidePins: '🙈 핀 숨기기 (Alt+P)',
      startFlow: '▶ 플로우 시작 (F8)',
      pauseFlow: '⏸ 일시정지 (F8)',
      resumeFlow: '▶ 계속 실행 (F8)',
      stopFlow: '⏹ 중지 (Esc)',
      recordStart: '🔴 매크로 녹화 (F9)',
      recordFinish: '⏹ 녹화 완료 ({count}단계)',
      runningBadge: '실행 중 ({count})',
      pausedBadge: '일시정지 ({count})',
      recordingBadge: '녹화 중 ({count})',
      hudOnBadge: 'HUD 켜짐',
      hudOffBadge: 'HUD 꺼짐',
      hintText: '엔진: {engine} · {phase}',
      engineSection: '입력 디스패치 엔진',
      cdpTitle: '⚡ CDP 네이티브 신뢰 엔진 (권장)',
      cdpDesc: 'Chrome Debugger로 하드웨어 수준 입력(isTrusted=true)을 전송하여 Canvas / WebGL을 관통합니다',
      domTitle: '🔇 DOM 무음 합성 엔진',
      domDesc: '디버그 배너 없이 DOM 선택자 추적, Canvas 비율 매핑, 로컬 스크롤을 지원합니다',
      optionsSection: '옵션',
      optRipples: '클릭 / 휠 / 드래그 파문 효과 표시',
      optPins: '페이지에 번호 핀 마커 표시',
      optEsc: 'Esc 키로 비상 중지',
      optDetach: '중지/일시정지 시 CDP 디버거 자동 분리',
      openPlayground: '🧪 DOM + Canvas + WebGL 테스트장 열기',
    },
    playground: {
      pageTitle: 'AutoClick Anywhere · DOM / Canvas / WebGL 테스트장',
      headerTitle: '🎯 AutoClick Anywhere · 인터랙티브 테스트장',
      headerSub: 'DOM 선택자 추적, DOM 없는 2D Canvas 버튼/드래그/줌, WebGL 3D 회전·클릭·매크로를 테스트하세요.',
      toggleHudBtn: '🎛️ 이 페이지에서 HUD 표시/숨기기 (Alt+H)',
      envExtension: '확장 로컬 페이지: chrome-extension://에서는 CDP 제한으로 DOM 엔진이 사용됩니다. `npm run playground` 실행 시 CDP(isTrusted=true)도 테스트 가능합니다.',
      envHttp: 'HTTP 모드: CDP 신뢰 입력(isTrusted=true)과 DOM 무음 모드를 모두 테스트할 수 있습니다!',
      arena1Title: '1. 표준 DOM 테스트 영역',
      domClickBtn: '클릭:',
      domDblBtn: '더블클릭:',
      domRightBtn: '우클릭:',
      movingDesc: '이동 타겟 추적 테스트 (DOM 선택자 추적 검증)',
      movingStart: '이동 시작',
      movingStop: '이동 중지',
      movingTargetBtn: '이동 타겟:',
      scrollTitle: '내부 스크롤 컨테이너 테스트',
      scrollRowPrefix: '목록 항목 · 내부 컨테이너 & 휠 스크롤 테스트',
      scrollRowBottom: '맨 아래 도달!',
      arena2Title: '2. 2D Canvas (DOM 없음) 게임 영역',
      statAtk: '⚔️ 공격:',
      statGold: '💎 골드:',
      statHold: '🛡️ 충전:',
      statZoom: '🔍 줌:',
      c2dBtnAtk: '⚔️ 보스 공격',
      c2dBtnGold: '💎 골드 획득',
      c2dBtnHold: '🛡️ 길게 충전',
      c2dOrbHint: '오브 드래그 영역 · 줌',
      c2dTip: '모든 버튼은 Canvas 픽셀로 그려집니다(DOM 없음). 클릭, 오브 드래그, 휠 줌을 지원합니다.',
      arena3Title: '3. WebGL 3D 인터랙티브 영역',
      statHits: '🎯 명중:',
      statRot: '🔄 회전:',
      statDistZoom: '🔭 줌:',
      wglTip: '실시간 WebGL 셰이더 렌더링: 클릭으로 펄스 명중, 드래그로 3D 회전, 휠로 줌.',
      inspectorTitle: '📡 실시간 입력 이벤트 모니터 (isTrusted 및 좌표 확인)',
      clearLogs: '지우기',
    },
  },
};

export function getMessages(setting?: LanguageSetting, browserLang?: string): I18nMessages {
  return MESSAGES[resolveLocale(setting, browserLang)];
}

export function translateFallbackReason(
  reason: string | undefined,
  m: I18nMessages,
): string | undefined {
  if (!reason) return undefined;
  if (/chrome:\/\/|chrome-extension:\/\/|devtools:\/\/|edge:\/\/|内置\/扩展页|受限/i.test(reason)) {
    return m.fallback.restrictedPage;
  }
  if (/DevTools|another debugger/i.test(reason)) {
    return m.fallback.devtoolsAttached;
  }
  return m.fallback.genericFallback;
}
