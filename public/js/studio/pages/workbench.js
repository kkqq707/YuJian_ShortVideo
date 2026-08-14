/**
 * YuJian Studio — Workbench Page
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D4
 *
 * 职责：工作台页面（纯组装层）—— Studio 生产工作台入口 + 导航中枢 + 最近任务概览。
 *   - 主 CTA「新建口播」→ #/create
 *   - 快捷入口（数字人资产/声音中心/内容创作/历史作品）→ 各页，仅导航不加载数据
 *   - 最近任务列表 → 复用 cache.pipelines（load.pipelines 拉取），点击 → #/tasks/:id
 *
 * 数据边界（严格遵守，违规即返工）：
 *   ❌ 不直接 fetch / 不拼 URL / 不自己 catch 映射文案（一切经 api + state.load.*）
 *   ❌ 不写 cache 内部字段（列表数据只经 state.load.pipelines 写入）
 *   ❌ 不写 selection / task（workbench 只读概览，不产生业务选择态/提交态）
 *   ❌ 不新增组件（复用 list/emptyState/loading/errorPanel + 复用 pipeline 的 statusBadge/progress）
 *   ❌ 不新增 KPI 统计 / 不实现创建流程 / 不做任务详情轮询（委托 #/create、#/tasks/:id）
 *   ✅ vanilla JS + IIFE + window.YJ，暴露 render(params)/init(params)/destroy()
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  if (!YJ.studio) YJ.studio = {};
  if (!YJ.studio.pages) YJ.studio.pages = {};

  // 依赖（脚本加载序保证已就绪；防御性判空避免误配序时硬崩）
  var state = (YJ.studio && YJ.studio.state) || {};
  var api = (YJ.studio && YJ.studio.api) || {};
  var components = (YJ.studio && YJ.studio.components) || {};
  var router = (YJ.studio && YJ.studio.router) || {};
  // 复用 pipeline 展示组件（状态徽章/进度，保证与 #/tasks 全站一致）
  var pipelineStatusBadge = (YJ.components && YJ.components.pipeline && YJ.components.pipeline.statusBadge) || {};
  var pipelineProgress = (YJ.components && YJ.components.pipeline && YJ.components.pipeline.progress) || {};

  var RECENT_PAGE_SIZE = 5;

  // 快捷入口静态配置（纯导航，不加载数据，不预拉资产列表）
  var QUICK_ENTRIES = [
    { route: '#/avatars', icon: 'fa-user-group', title: '数字人资产', desc: '管理数字人形象' },
    { route: '#/voices', icon: 'fa-microphone', title: '声音中心', desc: '管理配音音色' },
    { route: '#/scripts', icon: 'fa-file-alt', title: '内容创作', desc: '生成口播脚本' },
    { route: '#/history', icon: 'fa-film', title: '历史作品', desc: '查看生成历史' }
  ];

  // ── 页面闭包瞬时状态（destroy 释放，不写 state）──
  var els = {};

  // ═══════════════════════════════════════════════════════════════════
  //  工具函数
  // ═══════════════════════════════════════════════════════════════════

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function navigate(route) {
    if (router && typeof router.navigate === 'function') router.navigate(route);
  }

  function blockFor() {
    var cache = (state.get && state.get().cache) || {};
    return cache.pipelines;
  }

  function productName(item) {
    var s = item && item.inputSummary;
    return (s && s.productName) ? s.productName : '未命名产品';
  }

  function imageUrl(item) {
    var s = item && item.inputSummary;
    return (s && s.imageUrl) ? s.imageUrl : '';
  }

  function formatDateTime(value) {
    if (value == null || value === '') return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ═══════════════════════════════════════════════════════════════════
  //  加载（唯一入口 state.load.pipelines，Promise 回调幂等 renderView）
  // ═══════════════════════════════════════════════════════════════════

  function loadRecent() {
    if (typeof state.load.pipelines !== 'function') return Promise.resolve(null);
    return state.load.pipelines({ pageSize: RECENT_PAGE_SIZE }).then(function () {
      renderView();
    });
  }

  /** 进入：有数据或加载中或已错误 → 不重复请求；否则触发加载 */
  function ensureLoaded() {
    var block = blockFor();
    if (!block) return;
    if (block.items && block.items.length > 0) return;
    if (block.isLoading) return;
    if (block.loadError) return; // 错误态停留，等待 errorPanel 重试
    loadRecent();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  四态分派（页面自实现，不依赖 list 内置硬编码空态，以便空态/错误态携带定制文案与动作）
  // ═══════════════════════════════════════════════════════════════════

  function renderView() {
    var container = els.recentContent;
    if (!container) return;

    var block = blockFor();
    if (!block) return;

    // 1. loading：无已有项且加载中 → skeleton
    if (block.isLoading && (!block.items || block.items.length === 0)) {
      if (components.loading) {
        components.loading.render({ container: container, variant: 'list', count: RECENT_PAGE_SIZE });
      }
      return;
    }

    // 2. error
    if (block.loadError) {
      if (components.errorPanel) {
        components.errorPanel.render({
          container: container,
          error: block.loadError,
          onRetry: function () { loadRecent(); }
        });
      }
      return;
    }

    // 3. empty
    if (!block.items || block.items.length === 0) {
      renderEmpty(container);
      return;
    }

    // 4. normal → list 网格（renderItem 委托给页面自建任务卡片；仅前 N 条不分页）
    if (components.list) {
      components.list.render({
        container: container,
        items: block.items,
        renderItem: renderTaskCard
      });
    }
  }

  function renderEmpty(container) {
    if (!components.emptyState) return;
    components.emptyState.render({
      container: container,
      title: '还没有生成任务',
      description: '创建第一条数字人口播视频，任务进度会在这里展示。',
      icon: 'fa-clapperboard',
      action: { label: '新建口播', onClick: function () { navigate('#/create'); } }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  最近任务项渲染（复用 .yj-card + pipeline 的 statusBadge/progress，整卡点击 → #/tasks/:id）
  // ═══════════════════════════════════════════════════════════════════

  function renderTaskCard(item) {
    if (!item) return null;

    var card = document.createElement('div');
    card.className = 'yj-card yj-card-interactive studio-workbench-task';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', '查看任务「' + productName(item) + '」');

    card.appendChild(taskMedia(item));

    var body = document.createElement('div');
    body.className = 'studio-workbench-task__body';

    var head = document.createElement('div');
    head.className = 'studio-workbench-task__head';

    var title = document.createElement('div');
    title.className = 'studio-workbench-task__title';
    title.textContent = productName(item);
    head.appendChild(title);

    var badgeWrap = document.createElement('div');
    badgeWrap.className = 'studio-workbench-task__badge';
    var statusMeta = (api.resolveStatusMeta)
      ? api.resolveStatusMeta('pipeline', item.status)
      : { label: item.status || '未知', tone: 'muted' };
    if (pipelineStatusBadge.render) {
      pipelineStatusBadge.render(badgeWrap, statusMeta);
    } else {
      badgeWrap.textContent = statusMeta.label || '未知';
    }
    head.appendChild(badgeWrap);
    body.appendChild(head);

    var progressWrap = document.createElement('div');
    progressWrap.className = 'studio-workbench-task__progress';
    if (pipelineProgress.render) {
      pipelineProgress.render(progressWrap, item.progress);
    }
    body.appendChild(progressWrap);

    var timeText = formatDateTime(item.createdAt);
    if (timeText) {
      var meta = document.createElement('div');
      meta.className = 'studio-workbench-task__meta';
      meta.textContent = timeText;
      body.appendChild(meta);
    }

    card.appendChild(body);

    card.addEventListener('click', function () { navigate('#/tasks/' + item.id); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate('#/tasks/' + item.id);
      }
    });

    return card;
  }

  function taskMedia(item) {
    var media = document.createElement('div');
    media.className = 'studio-workbench-task__media';
    var url = imageUrl(item);
    if (url) {
      var img = document.createElement('img');
      img.className = 'studio-workbench-task__image';
      img.src = url;
      img.alt = productName(item);
      img.loading = 'lazy';
      media.appendChild(img);
    } else {
      var ph = document.createElement('div');
      ph.className = 'studio-workbench-task__placeholder';
      ph.setAttribute('aria-hidden', 'true');
      var icon = document.createElement('i');
      icon.className = 'fas fa-user';
      ph.appendChild(icon);
      media.appendChild(ph);
    }
    return media;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  事件绑定（主 CTA + 快捷入口 + 查看全部，纯导航）
  // ═══════════════════════════════════════════════════════════════════

  function quickEntriesHtml() {
    var html = '';
    for (var i = 0; i < QUICK_ENTRIES.length; i++) {
      var e = QUICK_ENTRIES[i];
      html += '' +
        '<button type="button" class="yj-card yj-card-interactive studio-workbench__quick-item" data-route="' + e.route + '">' +
          '<i class="fas ' + e.icon + ' studio-workbench__quick-icon" aria-hidden="true"></i>' +
          '<span class="studio-workbench__quick-text">' +
            '<span class="studio-workbench__quick-title">' + escapeHtml(e.title) + '</span>' +
            '<span class="studio-workbench__quick-desc">' + escapeHtml(e.desc) + '</span>' +
          '</span>' +
        '</button>';
    }
    return html;
  }

  function cacheEls() {
    els.createButton = document.querySelector('#studio-main [data-action="create"]');
    els.tasksAllButton = document.querySelector('#studio-main [data-action="tasks-all"]');
    els.quickItems = document.querySelectorAll('#studio-main [data-route]');
    els.recentContent = document.querySelector('#studio-main .studio-workbench__recent-content');
  }

  function bindEvents() {
    if (els.createButton) {
      els.createButton.addEventListener('click', function () { navigate('#/create'); });
    }
    if (els.tasksAllButton) {
      els.tasksAllButton.addEventListener('click', function () { navigate('#/tasks'); });
    }
    var items = els.quickItems || [];
    for (var i = 0; i < items.length; i++) {
      (function (el) {
        el.addEventListener('click', function () { navigate(el.getAttribute('data-route')); });
      })(items[i]);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  生命周期（render 纯字符串 / init 绑定+触发加载 / destroy 释放闭包态）
  // ═══════════════════════════════════════════════════════════════════

  function render(params) {
    return '' +
      '<div class="studio-page studio-workbench">' +
        '<div class="studio-page__header">' +
          '<h1 class="yj-page-title">工作台</h1>' +
          '<p class="yj-page-subtitle">快速开始制作数字人口播视频</p>' +
        '</div>' +
        '<div class="studio-workbench__hero">' +
          '<button type="button" class="yj-btn yj-btn-primary yj-btn-lg studio-workbench__hero-cta" data-action="create">' +
            '<i class="fas fa-plus" aria-hidden="true"></i>' +
            '<span>新建口播</span>' +
          '</button>' +
        '</div>' +
        '<div class="studio-workbench__quick">' + quickEntriesHtml() + '</div>' +
        '<div class="studio-workbench__recent">' +
          '<div class="studio-workbench__recent-head">' +
            '<h2 class="studio-workbench__recent-title">最近任务</h2>' +
            '<button type="button" class="yj-btn yj-btn-ghost studio-workbench__recent-all" data-action="tasks-all">查看全部</button>' +
          '</div>' +
          '<div class="studio-workbench__recent-content"></div>' +
        '</div>' +
      '</div>';
  }

  function init(params) {
    cacheEls();
    bindEvents();
    ensureLoaded();
    renderView();
  }

  function destroy() {
    // 页面 DOM 由 router 整体替换，节点级监听随 DOM 释放；此处仅清引用
    els = {};
  }

  YJ.studio.pages.workbench = {
    render: render,
    init: init,
    destroy: destroy
  };

  window.YJ = YJ;
})();
