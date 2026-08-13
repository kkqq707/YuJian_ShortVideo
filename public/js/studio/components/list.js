/**
 * YuJian Studio — List Component
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D3-D
 *
 * 职责：统一列表容器，编排「loading / error / empty / normal」四态 + 分页。
 *       列表本身不渲染具体业务项，项渲染全权委托 renderItem。
 *
 * 输入：{ container, items, isLoading, loadError, renderItem, onRetry, pagination, onPageChange }
 *   renderItem: (item, index) → DOM（页面提供，组件不认业务字段）
 *   pagination: { page, total, pageSize }（pageSize 可选，默认 20）
 * 输出：四态之一 —— loading 骨架 / error 横幅 / empty 空态 / 项网格 + 分页条
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不调用 API / 不修改 State
 *   ❌ 禁止识别业务字段（avatar / voice / script / pipeline）
 *   ❌ 无 hex 颜色、无新增颜色变量
 *   ✅ 依赖 loading / empty-state / error-panel（先于本文件加载）
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var DEFAULT_PAGE_SIZE = 20;

  // 依赖组件（脚本加载序保证其已就绪；防御性判空避免误配序时硬崩）
  var components = (window.YJ && window.YJ.studio && window.YJ.studio.components) || {};

  /** 兜底占位（依赖组件缺失时，仅保证不崩溃） */
  function fallback(text) {
    var el = document.createElement('div');
    el.className = 'studio-empty-state';
    el.textContent = text;
    return el;
  }

  /** loading 态 */
  function loadingState() {
    if (components.loading) {
      return components.loading.create({ variant: 'list', count: 6 });
    }
    return fallback('加载中…');
  }

  /** error 态 */
  function errorState(config) {
    if (components.errorPanel) {
      return components.errorPanel.create({ error: config.loadError, onRetry: config.onRetry });
    }
    return fallback('加载失败');
  }

  /** empty 态 */
  function emptyState() {
    if (components.emptyState) {
      return components.emptyState.create({
        title: '暂无内容',
        description: '这里还没有内容',
        icon: 'fa-inbox'
      });
    }
    return fallback('暂无内容');
  }

  /** 分页条：totalPages ≤ 1 时不渲染 */
  function buildPagination(pagination, onPageChange) {
    var page = (typeof pagination.page === 'number' && pagination.page >= 1) ? pagination.page : 1;
    var pageSize = (typeof pagination.pageSize === 'number' && pagination.pageSize > 0)
      ? pagination.pageSize
      : DEFAULT_PAGE_SIZE;
    var total = (typeof pagination.total === 'number' && pagination.total >= 0) ? pagination.total : 0;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (totalPages <= 1) return null;

    var nav = document.createElement('nav');
    nav.className = 'studio-list__pagination';
    nav.setAttribute('aria-label', '分页');

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'yj-btn yj-btn-secondary studio-list__pagination-btn';
    prev.textContent = '上一页';
    prev.disabled = page <= 1;
    prev.addEventListener('click', function () {
      if (page > 1) onPageChange(page - 1);
    });

    var info = document.createElement('span');
    info.className = 'studio-list__pagination-info';
    info.textContent = '第 ' + page + ' / ' + totalPages + ' 页';

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'yj-btn yj-btn-secondary studio-list__pagination-btn';
    next.textContent = '下一页';
    next.disabled = page >= totalPages;
    next.addEventListener('click', function () {
      if (page < totalPages) onPageChange(page + 1);
    });

    nav.appendChild(prev);
    nav.appendChild(info);
    nav.appendChild(next);
    return nav;
  }

  /** normal 态：项网格 + 分页 */
  function normalState(config) {
    var root = document.createElement('div');
    root.className = 'studio-list';

    var grid = document.createElement('div');
    grid.className = 'studio-list__grid';
    var items = Array.isArray(config.items) ? config.items : [];
    for (var i = 0; i < items.length; i++) {
      if (typeof config.renderItem === 'function') {
        var el = config.renderItem(items[i], i);
        if (el) grid.appendChild(el);
      }
    }
    root.appendChild(grid);

    if (config.pagination && typeof config.onPageChange === 'function') {
      var pagination = buildPagination(config.pagination, config.onPageChange);
      if (pagination) root.appendChild(pagination);
    }

    return root;
  }

  /** 纯构建：props → 四态之一 DOM（不触碰 container / state） */
  function create(config) {
    var opts = config || {};

    // 1. loading：isLoading 且无已有项
    if (opts.isLoading && (!Array.isArray(opts.items) || opts.items.length === 0)) {
      return loadingState();
    }

    // 2. error
    if (opts.loadError) {
      return errorState(opts);
    }

    // 3. empty
    if (!Array.isArray(opts.items) || opts.items.length === 0) {
      return emptyState();
    }

    // 4. normal
    return normalState(opts);
  }

  /** 渲染：清空容器后挂载，返回根元素（幂等，可随轮询重复调用） */
  function render(config) {
    var opts = config || {};
    if (!opts.container) return null;
    var el = create(config);
    opts.container.innerHTML = '';
    opts.container.appendChild(el);
    return el;
  }

  // ─── 挂载到 YJ.studio.components ──────────────────────
  var YJ = window.YJ || {};
  if (!YJ.studio) YJ.studio = {};
  if (!YJ.studio.components) YJ.studio.components = {};
  YJ.studio.components.list = {
    create: create,
    render: render
  };
  window.YJ = YJ;

  console.log('[Studio/Component] list initialized (Phase DigitalHuman-Rebuild-004 Step5-D3-D)');
})();
