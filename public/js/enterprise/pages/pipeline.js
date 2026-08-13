/**
 * YuJian Enterprise — Pipeline Dashboard Page
 *
 * Phase DigitalHuman-Rebuild-004 Step4-G7
 *
 * 职责（Pipeline Dashboard 页面组装层，唯一入口 YJ.pages.pipeline）：
 *   1. 创建 DOM 容器：render() 产出页面骨架（状态徽章 / 进度条 / 步骤条 / 错误面板
 *      四个组件容器 + 刷新按钮 + 层详情卡片 + 请求错误横幅）
 *   2. 调用组件 render：从唯一数据源 YJ.state.pipeline 读取 ViewModel 切片，
 *      渲染四个纯展示组件（statusBadge / progress / stepper / errorPanel）
 *   3. 绑定必要事件：刷新按钮（重新 load）、步骤条点击（展开层详情）
 *   4. 进入页面：YJ.state.pipeline.load(id) + YJ.state.pipeline.startPoll(id)
 *   5. 离开页面：YJ.state.pipeline.stopPoll() + 清理视图同步定时器与事件
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 禁止直接发起网络请求 / 直接调用 API（一切数据只读 YJ.state.pipeline）
 *   ❌ 禁止修改 state.js / adapter.js / components/*
 *   ❌ 禁止硬编码十六进制色值（颜色只用 design-tokens 语义令牌）
 *   ❌ 禁止层名字符串比较 / 解构下划线命名数据字段（只读 camelCase ViewModel）
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  // ─── 常量 ────────────────────────────────────────────────
  var STYLE_ID = 'yjp-pipeline-page-style';
  var PAGE_ROOT_ID = 'yjp-pipeline-page';
  var BADGE_ID = 'yjp-pipeline-badge';
  var PROGRESS_ID = 'yjp-pipeline-progress';
  var STEPPER_ID = 'yjp-pipeline-stepper';
  var ERROR_ID = 'yjp-pipeline-error';
  var STATUS_ID = 'yjp-pipeline-status';
  var STATUS_MSG_ID = 'yjp-pipeline-status-msg';
  var REFRESH_ID = 'yjp-pipeline-refresh';
  var RETRY_ID = 'yjp-pipeline-retry';
  var LAYER_CARD_ID = 'yjp-pipeline-layer-card';
  var LAYER_TITLE_ID = 'yjp-pipeline-layer-title';
  var LAYER_DETAIL_ID = 'yjp-pipeline-layer-detail';

  // 视图同步间隔（毫秒）：state 无订阅机制，页面以固定节拍读取 YJ.state.pipeline
  // 并重渲染四组件；稍快于 state 轮询间隔（2000ms），确保新快照及时上屏。
  var VIEW_SYNC_INTERVAL = 1000;

  // 请求失败统一文案（G2 §3.4：请求失败 ≠ 流水线失败，只提示「无法加载」）
  var LOAD_ERROR_TEXT = '无法加载流水线状态';

  // ─── 页面内部状态 ────────────────────────────────────────
  var currentId = null;          // 当前 pipeline id
  var activeLayerIndex = null;   // 当前展开的层下标（null 表示未展开）
  var viewTimer = null;          // 视图同步定时器句柄
  var els = null;                // 页面容器引用缓存（init 后填充）

  // ─── 依赖引用（脚本加载顺序异常时防御为空对象）─────────────
  var comp = (window.YJ && window.YJ.components && window.YJ.components.pipeline) || {};

  /** 读取唯一数据源（缺失时返回空对象，避免 NPE） */
  function getState() {
    return (window.YJ && window.YJ.state && window.YJ.state.pipeline) || {};
  }

  // ═══════════════════════════════════════════════════════════════════
  //  页面作用域样式（幂等注入，仅引用 design-tokens 语义令牌，无 hex）
  // ═══════════════════════════════════════════════════════════════════

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.yjp-page{display:flex;flex-direction:column;gap:var(--space-4);}',
      '.yjp-page__header{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-3);',
      '  padding:var(--space-4);border-radius:var(--radius-lg);',
      '  border:1px solid var(--border-subtle);background:var(--bg-surface);}',
      '.yjp-page__head-left{display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;}',
      '.yjp-page__title{margin:0;font-size:var(--text-base);font-weight:var(--font-semibold);',
      '  color:var(--text-primary);}',
      '.yjp-page__progress{flex:1 1 220px;min-width:0;}',
      '.yjp-page__refresh{display:inline-flex;align-items:center;gap:var(--space-2);',
      '  min-height:44px;padding:var(--space-2) var(--space-4);',
      '  border:1px solid var(--border-default);border-radius:var(--radius-md);',
      '  background:var(--bg-card);color:var(--text-primary);',
      '  font-size:var(--text-sm);font-weight:var(--font-medium);cursor:pointer;}',
      '.yjp-page__refresh:hover{border-color:var(--primary);color:var(--primary);}',
      '.yjp-page__refresh:focus-visible{outline:2px solid var(--border-focus);outline-offset:2px;}',
      '.yjp-page__refresh:disabled{opacity:0.55;cursor:not-allowed;}',
      '.yjp-page__status{display:flex;align-items:center;gap:var(--space-3);',
      '  padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);',
      '  border:1px solid var(--danger);background:var(--danger-bg);color:var(--danger);',
      '  font-size:var(--text-sm);}',
      '.yjp-page__status[hidden]{display:none;}',
      '.yjp-page__status-msg{flex:1;min-width:0;}',
      '.yjp-page__retry{display:inline-flex;align-items:center;gap:var(--space-2);',
      '  min-height:44px;padding:var(--space-1) var(--space-3);',
      '  border:1px solid var(--danger);border-radius:var(--radius-md);',
      '  background:transparent;color:var(--danger);cursor:pointer;',
      '  font-size:var(--text-sm);font-weight:var(--font-medium);}',
      '.yjp-page__retry:hover{background:var(--danger-bg);}',
      '.yjp-page__retry:focus-visible{outline:2px solid var(--border-focus);outline-offset:2px;}',
      '.yjp-page__card{display:flex;flex-direction:column;gap:var(--space-3);',
      '  padding:var(--space-4);border-radius:var(--radius-lg);',
      '  border:1px solid var(--border-subtle);background:var(--bg-surface);}',
      '.yjp-page__card[hidden]{display:none;}',
      '.yjp-page__card-title{margin:0;font-size:var(--text-sm);font-weight:var(--font-semibold);',
      '  color:var(--text-secondary);}',
      // 步骤条卡片可点击（进入层详情），触控目标为整张步骤卡片（≥44px）
      '.yjp-page .yjp-step{cursor:pointer;}',
      '.yjp-page .yjp-step:hover{background:var(--bg-card);}',
      '.yjp-page .yjp-step:focus-visible{outline:2px solid var(--border-focus);outline-offset:2px;}',
      // 层详情列表
      '.yjp-layer-detail{display:flex;flex-direction:column;gap:var(--space-2);margin:0;}',
      '.yjp-layer-detail__row{display:flex;gap:var(--space-3);}',
      '.yjp-layer-detail__row dt{flex:none;min-width:5rem;color:var(--text-muted);font-size:var(--text-sm);}',
      '.yjp-layer-detail__row dd{margin:0;color:var(--text-primary);font-size:var(--text-sm);',
      '  word-break:break-word;}',
      // 加载骨架（skeleton，非 spinner；opacity 动效，尊重 reduced-motion）
      '.yjp-skel{display:inline-block;height:14px;border-radius:var(--radius-sm);',
      '  background:var(--bg-card);}',
      '@media (prefers-reduced-motion: no-preference){',
      '  .yjp-skel{animation:yjp-skel-pulse var(--duration-slow) var(--ease-in-out) infinite alternate;}}',
      '@keyframes yjp-skel-pulse{from{opacity:0.5;}to{opacity:1;}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  render() — 产出页面骨架（HTML 字符串，供 app.js 路由插入容器）
  // ═══════════════════════════════════════════════════════════════════

  function render() {
    ensureStyles();
    return '' +
      '<div class="yjp-page" id="' + PAGE_ROOT_ID + '">' +
        '<section class="yjp-page__header">' +
          '<div class="yjp-page__head-left">' +
            '<h2 class="yjp-page__title">数字人流水线</h2>' +
            '<div id="' + BADGE_ID + '"></div>' +
          '</div>' +
          '<div class="yjp-page__progress" id="' + PROGRESS_ID + '"></div>' +
          '<button type="button" class="yjp-page__refresh" id="' + REFRESH_ID + '" aria-label="刷新流水线状态">' +
            '<i class="fas fa-redo" aria-hidden="true"></i><span>刷新</span>' +
          '</button>' +
        '</section>' +
        '<div class="yjp-page__status" id="' + STATUS_ID + '" role="alert" hidden>' +
          '<i class="fas fa-exclamation-circle" aria-hidden="true"></i>' +
          '<span class="yjp-page__status-msg" id="' + STATUS_MSG_ID + '">' + LOAD_ERROR_TEXT + '</span>' +
          '<button type="button" class="yjp-page__retry" id="' + RETRY_ID + '">重试</button>' +
        '</div>' +
        '<section class="yjp-page__card">' +
          '<h3 class="yjp-page__card-title">执行步骤</h3>' +
          '<div id="' + STEPPER_ID + '"></div>' +
        '</section>' +
        '<section class="yjp-page__card">' +
          '<h3 class="yjp-page__card-title">错误诊断</h3>' +
          '<div id="' + ERROR_ID + '"></div>' +
        '</section>' +
        '<section class="yjp-page__card" id="' + LAYER_CARD_ID + '" hidden>' +
          '<h3 class="yjp-page__card-title" id="' + LAYER_TITLE_ID + '">层详情</h3>' +
          '<div id="' + LAYER_DETAIL_ID + '"></div>' +
        '</section>' +
      '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  renderView() — 读取 YJ.state.pipeline，重渲染四组件 + 加载/错误态 + 层详情
  // ═══════════════════════════════════════════════════════════════════

  function renderView() {
    if (!els) return;
    var state = getState();
    var detail = state.detail || null;
    var isLoading = !!state.isLoading;
    var loadError = state.loadError || null;

    // 初始加载中且尚无快照 → 骨架（非 spinner）
    if (isLoading && !detail) {
      showSkeleton();
    } else {
      renderComponents(state);
    }

    // 请求错误横幅
    if (els.status) {
      els.status.hidden = !loadError;
    }

    // 刷新按钮 loading 态（异步中禁用）
    if (els.refresh) {
      els.refresh.disabled = isLoading;
    }

    // 已展开的层详情随轮询重渲染
    if (activeLayerIndex != null) {
      renderLayerDetail(activeLayerIndex);
    }
  }

  /** 渲染四个纯展示组件（数据均来自 ViewModel 切片） */
  function renderComponents(state) {
    var detail = state.detail || null;
    var diagnostic = state.diagnostic || null;

    if (els.badge && comp.statusBadge && comp.statusBadge.render) {
      comp.statusBadge.render(els.badge, detail ? detail.statusMeta : null);
    }
    if (els.progress && comp.progress && comp.progress.render) {
      comp.progress.render(els.progress, detail ? detail.progress : null);
    }
    if (els.stepper && comp.stepper && comp.stepper.render) {
      comp.stepper.render(els.stepper, detail ? detail.steps : null);
      enhanceStepper();
    }
    if (els.error && comp.errorPanel && comp.errorPanel.render) {
      comp.errorPanel.render(els.error, diagnostic);
    }
  }

  /** 加载骨架：四容器各置一块占位条 */
  function showSkeleton() {
    if (els.badge) els.badge.innerHTML = '<span class="yjp-skel" style="width:6rem;"></span>';
    if (els.progress) els.progress.innerHTML = '<span class="yjp-skel" style="width:100%;height:6px;"></span>';
    if (els.stepper) {
      var html = '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">';
      for (var i = 0; i < 4; i++) {
        html += '<span class="yjp-skel" style="flex:1 1 160px;height:44px;"></span>';
      }
      html += '</div>';
      els.stepper.innerHTML = html;
    }
    if (els.error) els.error.innerHTML = '<span class="yjp-skel" style="width:8rem;"></span>';
  }

  /** 步骤条可访问性增强：整卡可聚焦、可键盘激活（Enter / Space） */
  function enhanceStepper() {
    var steps = els.stepper.querySelectorAll('.yjp-step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].setAttribute('role', 'button');
      steps[i].setAttribute('tabindex', '0');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  层详情 — 读取 timeline.layers[index]（进入某层时展示耗时/重试/ID）
  // ═══════════════════════════════════════════════════════════════════

  function renderLayerDetail(index) {
    if (!els || !els.layerCard || !els.layerDetail) return;

    var state = getState();
    var steps = (state.detail && state.detail.steps) || [];
    var layers = (state.timeline && state.timeline.layers) || [];
    var step = steps[index] || null;
    var layer = layers[index] || null;

    if (!step && !layer) {
      els.layerCard.hidden = true;
      return;
    }

    var label = (step && step.label) || (layer && layer.label) || ('第 ' + (index + 1) + ' 层');
    if (els.layerTitle) els.layerTitle.textContent = '层详情 · ' + label;

    var rows = [
      { term: '状态', value: (step && step.statusMeta && step.statusMeta.label) || (layer && layer.statusMeta && layer.statusMeta.label) || null },
      { term: '生成任务 ID', value: layer ? layer.generationTaskId : null },
      { term: '素材 ID', value: layer ? layer.assetId : null },
      { term: '开始时间', value: layer ? layer.startedAt : null },
      { term: '完成时间', value: layer ? layer.completedAt : null },
      { term: '耗时', value: layer && layer.durationMs != null ? (layer.durationMs + ' ms') : null },
      { term: '重试次数', value: layer && layer.retryCount != null ? String(layer.retryCount) : null }
    ];

    els.layerDetail.innerHTML = '';
    var dl = document.createElement('dl');
    dl.className = 'yjp-layer-detail';

    for (var i = 0; i < rows.length; i++) {
      var row = document.createElement('div');
      row.className = 'yjp-layer-detail__row';

      var term = document.createElement('dt');
      term.textContent = rows[i].term;
      var value = document.createElement('dd');
      value.textContent = rows[i].value != null ? rows[i].value : '—';

      row.appendChild(term);
      row.appendChild(value);
      dl.appendChild(row);
    }

    els.layerDetail.appendChild(dl);
    els.layerCard.hidden = false;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  事件绑定
  // ═══════════════════════════════════════════════════════════════════

  function onRefresh() {
    var state = getState();
    if (currentId == null || !state || typeof state.load !== 'function') return;
    state.load(currentId).then(renderView);
    renderView(); // 立即反映 loading 态（禁用按钮 + 骨架）
  }

  /** 选中/取消某层（共享点击与键盘两条路径） */
  function activateStep(stepEl) {
    if (!els || !els.stepper) return;
    var steps = els.stepper.querySelectorAll('.yjp-step');
    var index = Array.prototype.indexOf.call(steps, stepEl);
    if (index < 0) return;
    activeLayerIndex = (activeLayerIndex === index) ? null : index;
    renderLayerDetail(activeLayerIndex);
  }

  function onStepperClick(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    var stepEl = target.closest('.yjp-step');
    if (stepEl && els.stepper.contains(stepEl)) {
      activateStep(stepEl);
    }
  }

  function onStepperKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var target = event.target;
    if (target && target.classList && target.classList.contains('yjp-step')) {
      event.preventDefault();
      activateStep(target);
    }
  }

  function bindEvents() {
    if (els.refresh) els.refresh.addEventListener('click', onRefresh);
    if (els.retry) els.retry.addEventListener('click', onRefresh);
    if (els.stepper) {
      els.stepper.addEventListener('click', onStepperClick);
      els.stepper.addEventListener('keydown', onStepperKeydown);
    }
  }

  function unbindEvents() {
    if (els.refresh) els.refresh.removeEventListener('click', onRefresh);
    if (els.retry) els.retry.removeEventListener('click', onRefresh);
    if (els.stepper) {
      els.stepper.removeEventListener('click', onStepperClick);
      els.stepper.removeEventListener('keydown', onStepperKeydown);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  视图同步定时器（state 无订阅，页面主动轮读并重渲染）
  // ═══════════════════════════════════════════════════════════════════

  function startViewSync() {
    stopViewSync();
    viewTimer = setInterval(renderView, VIEW_SYNC_INTERVAL);
  }

  function stopViewSync() {
    if (viewTimer) {
      clearInterval(viewTimer);
      viewTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  init(id) / destroy()
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 进入页面：挂载容器引用、渲染组件、绑定事件、启动加载 + 轮询。
   * 需先由调用方将 render() 的产物插入 DOM。
   */
  function init(id) {
    ensureStyles();

    if (id == null) {
      console.warn('[Enterprise/Pipeline/Page] init(id) 需要 pipeline id');
      return;
    }

    var root = document.getElementById(PAGE_ROOT_ID);
    if (!root) {
      console.warn('[Enterprise/Pipeline/Page] 未找到页面容器 #' + PAGE_ROOT_ID + '，请先插入 render() 产物');
      return;
    }

    currentId = id;
    activeLayerIndex = null;
    els = {
      badge: document.getElementById(BADGE_ID),
      progress: document.getElementById(PROGRESS_ID),
      stepper: document.getElementById(STEPPER_ID),
      error: document.getElementById(ERROR_ID),
      status: document.getElementById(STATUS_ID),
      refresh: document.getElementById(REFRESH_ID),
      retry: document.getElementById(RETRY_ID),
      layerCard: document.getElementById(LAYER_CARD_ID),
      layerTitle: document.getElementById(LAYER_TITLE_ID),
      layerDetail: document.getElementById(LAYER_DETAIL_ID)
    };

    bindEvents();

    var state = getState();
    if (state && typeof state.load === 'function') {
      state.load(id).then(renderView); // load 同步置 isLoading=true，完成后立即渲染
    }
    if (state && typeof state.startPoll === 'function') {
      state.startPoll(id);
    }

    renderView();      // 立即渲染一次（isLoading=true → 骨架）
    startViewSync();   // 之后以固定节拍同步 state 到视图
  }

  /** 离开页面：停轮询 + 清理视图同步定时器与事件 */
  function destroy() {
    stopViewSync();
    unbindEvents();

    var state = getState();
    if (state && typeof state.stopPoll === 'function') {
      state.stopPoll();
    }

    currentId = null;
    activeLayerIndex = null;
    els = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  暴露到全局（仅挂载 YJ.pages.pipeline，不新增顶层全局）
  // ═══════════════════════════════════════════════════════════════════

  var YJ = window.YJ || {};
  if (!YJ.pages) YJ.pages = {};
  YJ.pages.pipeline = {
    render: render,
    init: init,
    destroy: destroy
  };
  window.YJ = YJ;

  console.log('[Enterprise/Pipeline/Page] Pipeline page initialized (Phase DigitalHuman-Rebuild-004 Step4-G7)');
})();
