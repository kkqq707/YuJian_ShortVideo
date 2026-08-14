/**
 * YuJian Studio — Tasks Page
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D4
 *
 * 职责：生成任务页面（纯组装层）—— Pipeline 生成任务的列表展示 + 状态查看。
 *   - 状态过滤（全部 / 生成中 / 已完成 / 失败 四档，映射到 pipeline status 入参）
 *   - 分页（复用 list 组件分页 + load.pipelines({page})）
 *   - 列表项点击 → #/tasks/:id；空态 → #/create
 *
 * 数据边界（严格遵守，违规即返工）：
 *   ❌ 不直接 fetch / 不拼 URL / 不自己 catch 映射文案（一切经 api + state.load.*）
 *   ❌ 不写 cache 内部字段（列表数据只经 state.load.pipelines 写入）
 *   ❌ 不写 selection / task（tasks 只读展示，不产生业务选择态/提交态）
 *   ❌ 不新增组件（复用 list/emptyState/loading/errorPanel + 复用 pipeline 的 statusBadge/progress）
 *   ❌ 不做详情轮询 / 不创建任务 / 不执行任务（委托 #/tasks/:id、#/create）
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
  // 复用 pipeline 展示组件（状态徽章/进度，保证与 #/tasks/:id 全站一致）
  var pipelineStatusBadge = (YJ.components && YJ.components.pipeline && YJ.components.pipeline.statusBadge) || {};
  var pipelineProgress = (YJ.components && YJ.components.pipeline && YJ.components.pipeline.progress) || {};

  var DEFAULT_FILTER = 'all';
  var DEFAULT_PAGE_SIZE = 20;

  // 状态过滤四档（首版收敛，不逐态列出 9 个内部 pipeline 状态）。
  // status 为逗号分隔多值，后端 list 接口已支持 split(',') 白名单校验。
  var FILTERS = [
    { key: 'all',     label: '全部',   status: null },
    { key: 'active',  label: '生成中', status: 'pending,running,vision,script,tts,digital_human' },
    { key: 'success', label: '已完成', status: 'success' },
    { key: 'failed',  label: '失败',   status: 'failed,cancelled' }
  ];

  // ── 页面闭包瞬时状态（destroy 释放，不写 state）──
  var activeFilter = DEFAULT_FILTER;
  var els = {};

  // ═══════════════════════════════════════════════════════════════════
  //  工具函数
  // ═══════════════════════════════════════════════════════════════════

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

  function filterByKey(key) {
    for (var i = 0; i < FILTERS.length; i++) {
      if (FILTERS[i].key === key) return FILTERS[i];
    }
    return FILTERS[0];
  }

  /** 卡片时间：createdAt 必展示，completedAt 仅在存在时追加 */
  function timeMetaText(item) {
    if (!item) return '';
    var parts = [];
    var created = formatDateTime(item.createdAt);
    if (created) parts.push('创建 ' + created);
    var completed = formatDateTime(item.completedAt);
    if (completed) parts.push('完成 ' + completed);
    return parts.join(' · ');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  加载（唯一入口 state.load.pipelines，Promise 回调幂等 renderView）
  // ═══════════════════════════════════════════════════════════════════

  function loadPage(filterKey, opts) {
    opts = opts || {};
    var f = filterByKey(filterKey);
    if (typeof state.load.pipelines !== 'function') return Promise.resolve(null);
    return state.load.pipelines({
      status: f.status,
      page: opts.page,
      pageSize: opts.pageSize || DEFAULT_PAGE_SIZE
    }).then(function () {
      renderView();
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  四态分派（页面自实现，不依赖 list 内置硬编码空态，以便空态/错误态携带定制文案与动作）
  // ═══════════════════════════════════════════════════════════════════

  function renderView() {
    var container = els.content;
    if (!container) return;

    var block = blockFor();
    if (!block) return;

    // 1. loading：无已有项且加载中 → skeleton
    if (block.isLoading && (!block.items || block.items.length === 0)) {
      if (components.loading) {
        components.loading.render({ container: container, variant: 'list', count: 6 });
      }
      return;
    }

    // 2. error
    if (block.loadError) {
      if (components.errorPanel) {
        components.errorPanel.render({
          container: container,
          error: block.loadError,
          onRetry: function () { loadPage(activeFilter); }
        });
      }
      return;
    }

    // 3. empty
    if (!block.items || block.items.length === 0) {
      renderEmpty(container);
      return;
    }

    // 4. normal → list 网格 + 分页（renderItem 委托给页面自建任务卡片）
    if (components.list) {
      components.list.render({
        container: container,
        items: block.items,
        renderItem: renderTaskCard,
        pagination: { page: block.page, total: block.total },
        onPageChange: function (page) { loadPage(activeFilter, { page: page }); }
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
  //  任务卡片渲染（复用 .yj-card + pipeline 的 statusBadge/progress，整卡点击 → #/tasks/:id）
  // ═══════════════════════════════════════════════════════════════════

  function renderTaskCard(item) {
    if (!item) return null;

    var card = document.createElement('div');
    card.className = 'yj-card yj-card-interactive studio-tasks__card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', '查看任务「' + productName(item) + '」');

    card.appendChild(taskMedia(item));

    var body = document.createElement('div');
    body.className = 'studio-tasks__body';

    var head = document.createElement('div');
    head.className = 'studio-tasks__head';

    var title = document.createElement('div');
    title.className = 'studio-tasks__title';
    title.textContent = productName(item);
    head.appendChild(title);

    var badgeWrap = document.createElement('div');
    badgeWrap.className = 'studio-tasks__badge';
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
    progressWrap.className = 'studio-tasks__progress';
    if (pipelineProgress.render) {
      pipelineProgress.render(progressWrap, item.progress);
    }
    body.appendChild(progressWrap);

    var metaText = timeMetaText(item);
    if (metaText) {
      var meta = document.createElement('div');
      meta.className = 'studio-tasks__meta';
      meta.textContent = metaText;
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
    media.className = 'studio-tasks__media';
    var url = imageUrl(item);
    if (url) {
      var img = document.createElement('img');
      img.className = 'studio-tasks__image';
      img.src = url;
      img.alt = productName(item);
      img.loading = 'lazy';
      media.appendChild(img);
    } else {
      var ph = document.createElement('div');
      ph.className = 'studio-tasks__placeholder';
      ph.setAttribute('aria-hidden', 'true');
      var icon = document.createElement('i');
      icon.className = 'fas fa-user';
      ph.appendChild(icon);
      media.appendChild(ph);
    }
    return media;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  状态过滤 tab（复用 .studio-tabs/.studio-tab，同 avatars 范式）
  // ═══════════════════════════════════════════════════════════════════

  function filterTabsHtml() {
    var html = '';
    for (var i = 0; i < FILTERS.length; i++) {
      var f = FILTERS[i];
      var isActive = f.key === DEFAULT_FILTER;
      html += '' +
        '<button type="button" class="studio-tab' + (isActive ? ' is-active' : '') + '"' +
        ' role="tab" aria-selected="' + (isActive ? 'true' : 'false') + '" data-filter="' + f.key + '">' +
        f.label +
        '</button>';
    }
    return html;
  }

  function setFilter(key) {
    if (key === activeFilter) return;
    activeFilter = key;

    var tabs = els.tabs || [];
    for (var i = 0; i < tabs.length; i++) {
      var isActive = tabs[i].getAttribute('data-filter') === key;
      tabs[i].classList.toggle('is-active', isActive);
      tabs[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
    }

    loadPage(key);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  事件绑定
  // ═══════════════════════════════════════════════════════════════════

  function cacheEls() {
    els.root = document.querySelector('#studio-main .studio-page');
    els.content = document.querySelector('#studio-main .studio-tasks__content');
    els.tabs = document.querySelectorAll('#studio-main .studio-tab');
  }

  function bindEvents() {
    var tabs = els.tabs || [];
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        setFilter(this.getAttribute('data-filter'));
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  生命周期（render 纯字符串 / init 绑定+触发加载 / destroy 释放闭包态）
  // ═══════════════════════════════════════════════════════════════════

  function render(params) {
    return '' +
      '<div class="studio-page studio-tasks">' +
        '<div class="studio-page__header">' +
          '<h1 class="yj-page-title">生成任务</h1>' +
          '<p class="yj-page-subtitle">查看数字人口播生成任务的状态与进度</p>' +
        '</div>' +
        '<div class="studio-page__toolbar">' +
          '<div class="studio-tabs" role="tablist" aria-label="任务状态筛选">' +
            filterTabsHtml() +
          '</div>' +
        '</div>' +
        '<div class="studio-tasks__content"></div>' +
      '</div>';
  }

  function init(params) {
    activeFilter = DEFAULT_FILTER;
    cacheEls();
    bindEvents();
    loadPage(activeFilter);
    renderView();
  }

  function destroy() {
    // 页面 DOM 由 router 整体替换，节点级监听随 DOM 释放；此处仅清引用与闭包瞬时态
    els = {};
    activeFilter = DEFAULT_FILTER;
  }

  YJ.studio.pages.tasks = {
    render: render,
    init: init,
    destroy: destroy
  };

  window.YJ = YJ;
})();
