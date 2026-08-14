/**
 * YuJian Studio — History Page
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D4
 *
 * 职责：历史作品页面（纯组装层）—— 已完成作品（status=success）的列表展示 + 软删除。
 *   - 只展示 status=success（后端 status 过滤，天然排除 cancelled/failed/生成中）
 *   - 排序接受后端 created_at DESC，不加 completed_at 排序参数
 *   - 作品卡片整卡点击 → #/tasks/:id 查看详情（首版不直接展示视频 URL/成品播放）
 *   - 卡片内「删除」按钮 + 确认 Modal → 复用 api.pipeline.remove → 成功重拉列表
 *
 * 数据边界（严格遵守，违规即返工）：
 *   ❌ 不直接 fetch / 不拼 URL / 不自己 catch 映射文案（一切经 api + state.load.*）
 *   ❌ 不写 cache 内部字段（列表数据只经 state.load.pipelines 写入）
 *   ❌ 不写 selection / task（删除为瞬时动作，不产生业务选择态/提交态）
 *   ❌ 不新增组件（复用 list/emptyState/loading/errorPanel + pipeline 的 statusBadge + toast/modal）
 *   ❌ 不渲染 pipeline progress（进度属详情页能力，历史卡片只展示状态徽章 + 时间）
 *   ❌ 不新增 historyState / historyCache / mock 数据 / History API（删除复用 pipeline.remove）
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
  var toast = (YJ.components && YJ.components.toast) || {};
  var modal = (YJ.components && YJ.components.modal) || {};
  // 复用 pipeline 展示组件（状态徽章，保证与 #/tasks、#/tasks/:id 全站一致）
  var pipelineStatusBadge = (YJ.components && YJ.components.pipeline && YJ.components.pipeline.statusBadge) || {};

  // 历史作品固定只展示成功态（产品决策：不含 cancelled；排序沿用后端 created_at DESC）
  var HISTORY_STATUS = 'success';
  var DEFAULT_PAGE_SIZE = 20;

  // ── 页面闭包瞬时状态（destroy 释放，不写 state）──
  var deleteBusy = false; // 删除进行中（防重复提交）
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
  //  加载（唯一入口 state.load.pipelines，status 固定 success；Promise 回调幂等 renderView）
  // ═══════════════════════════════════════════════════════════════════

  function loadPage(opts) {
    opts = opts || {};
    if (typeof state.load.pipelines !== 'function') return Promise.resolve(null);
    return state.load.pipelines({
      status: HISTORY_STATUS,
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
          onRetry: function () { loadPage(); }
        });
      }
      return;
    }

    // 3. empty
    if (!block.items || block.items.length === 0) {
      renderEmpty(container);
      return;
    }

    // 4. normal → list 网格 + 分页（renderItem 委托给页面自建历史作品卡片）
    if (components.list) {
      components.list.render({
        container: container,
        items: block.items,
        renderItem: renderHistoryCard,
        pagination: { page: block.page, total: block.total },
        onPageChange: function (page) { loadPage({ page: page }); }
      });
    }
  }

  function renderEmpty(container) {
    if (!components.emptyState) return;
    components.emptyState.render({
      container: container,
      title: '还没有已完成的作品',
      description: '完成第一条数字人口播视频后，成品会在这里展示。',
      icon: 'fa-film',
      action: { label: '新建口播', onClick: function () { navigate('#/create'); } }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  历史作品卡片渲染（复用 .yj-card + pipeline 的 statusBadge，整卡点击 → #/tasks/:id）
  //  不渲染 pipeline progress（首版历史只展示成功态徽章 + 时间，进度属详情页能力）
  // ═══════════════════════════════════════════════════════════════════

  function renderHistoryCard(item) {
    if (!item) return null;

    var card = document.createElement('div');
    card.className = 'yj-card yj-card-interactive studio-history__card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', '查看作品「' + productName(item) + '」');

    card.appendChild(historyMedia(item));

    var body = document.createElement('div');
    body.className = 'studio-history__body';

    var head = document.createElement('div');
    head.className = 'studio-history__head';

    var title = document.createElement('div');
    title.className = 'studio-history__title';
    title.textContent = productName(item);
    head.appendChild(title);

    // 状态徽章：列表已按 status=success 过滤，item.status 恒为 success（渲染即「已完成」）
    var badgeWrap = document.createElement('div');
    badgeWrap.className = 'studio-history__badge';
    var statusMeta = (api.resolveStatusMeta)
      ? api.resolveStatusMeta('pipeline', item.status)
      : { label: item.status || '未知', tone: 'muted' };
    if (pipelineStatusBadge.render) {
      pipelineStatusBadge.render(badgeWrap, statusMeta);
    } else {
      badgeWrap.textContent = statusMeta.label || '未知';
    }
    head.appendChild(badgeWrap);
    head.appendChild(deleteActionButton(item));
    body.appendChild(head);

    var metaText = timeMetaText(item);
    if (metaText) {
      var meta = document.createElement('div');
      meta.className = 'studio-history__meta';
      meta.textContent = metaText;
      body.appendChild(meta);
    }

    card.appendChild(body);

    card.addEventListener('click', function () { navigate('#/tasks/' + item.id); });
    card.addEventListener('keydown', function (e) {
      if (e.target !== card) return; // 忽略内部按钮（删除）的键盘事件，仅整卡触发跳转
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate('#/tasks/' + item.id);
      }
    });

    return card;
  }

  function historyMedia(item) {
    var media = document.createElement('div');
    media.className = 'studio-history__media';
    var url = imageUrl(item);
    if (url) {
      var img = document.createElement('img');
      img.className = 'studio-history__image';
      img.src = url;
      img.alt = productName(item);
      img.loading = 'lazy';
      media.appendChild(img);
    } else {
      var ph = document.createElement('div');
      ph.className = 'studio-history__placeholder';
      ph.setAttribute('aria-hidden', 'true');
      var icon = document.createElement('i');
      icon.className = 'fas fa-user';
      ph.appendChild(icon);
      media.appendChild(ph);
    }
    return media;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  删除（软删除 + 确认 Modal，复用 YJ.components.modal/toast 与 pipeline.remove）
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

  function errorMessage(err, fallback) {
    if (!err) return fallback;
    if (err.friendlyMessage) return err.friendlyMessage;
    if (err.message) return err.message;
    return fallback;
  }

  /** 卡片内删除按钮（stopPropagation 隔离整卡跳转） */
  function deleteActionButton(item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yj-btn yj-btn-secondary yj-btn-sm';
    btn.setAttribute('aria-label', '删除作品「' + productName(item) + '」');
    var icon = document.createElement('i');
    icon.className = 'fas fa-trash';
    icon.setAttribute('aria-hidden', 'true');
    var text = document.createElement('span');
    text.textContent = '删除';
    btn.appendChild(icon);
    btn.appendChild(text);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      confirmDelete(item);
    });
    return btn;
  }

  function getConfirmBtn() {
    return document.getElementById('modalConfirmBtn');
  }

  function resetConfirmButton() {
    var btn = getConfirmBtn();
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('yj-btn-loading');
  }

  function setConfirmLoading(loading) {
    var btn = getConfirmBtn();
    if (!btn) return;
    btn.disabled = loading;
    if (loading) btn.classList.add('yj-btn-loading');
    else btn.classList.remove('yj-btn-loading');
  }

  function ensureCancelButton() {
    var footer = document.getElementById('modalFooter');
    if (!footer) return;
    if (footer.querySelector('.studio-modal-cancel')) return;
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'yj-btn yj-btn-secondary studio-modal-cancel';
    cancel.textContent = '取消';
    cancel.addEventListener('click', function () { modal.close(); });
    var confirm = getConfirmBtn();
    footer.insertBefore(cancel, confirm);
  }

  function openPageModal(opts) {
    if (!modal.open) return;
    modal.open({
      title: opts.title,
      content: opts.content,
      confirmText: opts.confirmText || '确认',
      confirmClass: opts.confirmClass || 'yj-btn yj-btn-primary',
      onConfirm: opts.onConfirm,
      onClose: opts.onClose
    });
    resetConfirmButton();
    ensureCancelButton();
  }

  function confirmDelete(item) {
    openPageModal({
      title: '删除作品',
      content: '<p class="studio-confirm-text">确定要删除作品「' + escapeHtml(productName(item)) + '」吗？删除后将从列表隐藏。</p>',
      confirmText: '删除',
      confirmClass: 'yj-btn yj-btn-danger',
      onConfirm: function () {
        if (deleteBusy) return false;
        submitDelete(item);
        return false;
      }
    });
  }

  function submitDelete(item) {
    deleteBusy = true;
    setConfirmLoading(true);

    api.pipeline.remove(item.id).then(function () {
      if (toast.success) toast.success('作品已删除');
      modal.close();
      refreshList();
    }).catch(function (err) {
      if (toast.error) toast.error(errorMessage(err, '删除失败，请重试'));
      deleteBusy = false;
      setConfirmLoading(false);
    });
  }

  function refreshList() {
    deleteBusy = false;
    loadPage();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  生命周期（render 纯字符串 / init 绑定+触发加载 / destroy 释放闭包态）
  // ═══════════════════════════════════════════════════════════════════

  function cacheEls() {
    els.content = document.querySelector('#studio-main .studio-history__content');
  }

  function render(params) {
    return '' +
      '<div class="studio-page studio-history">' +
        '<div class="studio-page__header">' +
          '<h1 class="yj-page-title">历史作品</h1>' +
          '<p class="yj-page-subtitle">查看已完成的数字人口播作品</p>' +
        '</div>' +
        '<div class="studio-history__content"></div>' +
      '</div>';
  }

  function init(params) {
    cacheEls();
    loadPage();
    renderView();
  }

  function destroy() {
    // 页面 DOM 由 router 整体替换，节点级监听随 DOM 释放；此处仅清引用与闭包瞬时态
    els = {};
    deleteBusy = false;
  }

  YJ.studio.pages.history = {
    render: render,
    init: init,
    destroy: destroy
  };

  window.YJ = YJ;
})();
