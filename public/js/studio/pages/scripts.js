/**
 * YuJian Studio — Scripts Page
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D4
 *
 * 职责：内容创作（脚本）页面（纯组装层）—— 浏览 / 选择 / AI 生成 / 手动创建 / 查看 / 编辑 / 删除。
 *   - 单一脚本列表（无官方/我的双 tab，脚本一律归企业所有）
 *   - 选择回写 state.selection.script（供 Create 页潜在复用）
 *   - AI 生成仅调用 api.script.generate，结果以只读模态展示（前端零 AI 逻辑）
 *
 * 数据边界（严格遵守，违规即返工）：
 *   ❌ 不直接 fetch / 不拼 URL / 不自己 catch 映射文案（一切经 api + state.load.*）
 *   ❌ 不写 cache 内部字段（列表数据只经 state.load.scriptsMine 写入）
 *   ❌ 不新增 state 字段（AI 生成中态走页面闭包 formBusy）
 *   ❌ 不新增组件（复用 list/emptyState/loading/errorPanel + toast/modal，自建脚本卡片）
 *   ❌ 不实现 AI 生成逻辑 / 不写 prompt / 不选模型 / 不新增 Provider / 不 mock
 *   ❌ 不引入第三方编辑器（full_script 用原生 textarea；structured_script 只读）
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
  var toast = (YJ.components && YJ.components.toast) || {};
  var modal = (YJ.components && YJ.components.modal) || {};

  var SOURCE_LABELS = { manual: '手动', ai: 'AI 生成', pipeline: '流水线' };
  var STYLE_LABELS = { professional: '专业', casual: '轻松', energetic: '活力', warm: '温暖' };
  var STATUS_LABELS = { draft: '草稿', reviewed: '已审核', approved: '已通过', rejected: '已驳回' };
  var STATUS_OPTIONS = ['draft', 'reviewed', 'approved', 'rejected'];
  var STYLE_OPTIONS = ['professional', 'casual', 'energetic', 'warm'];

  // ── 页面闭包瞬时状态（destroy 释放，不写 state）──
  var els = {};
  var formBusy = false; // 生成/创建/编辑/删除进行中（防重复提交）

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

  /** 错误信息：优先 friendlyMessage（api 归一化），回退 message，再回退默认 */
  function errorMessage(err, fallback) {
    if (!err) return fallback;
    if (err.friendlyMessage) return err.friendlyMessage;
    if (err.message) return err.message;
    return fallback;
  }

  function sourceLabel(sourceType) {
    return SOURCE_LABELS[sourceType] || sourceType || '未知';
  }

  function styleLabel(style) {
    return STYLE_LABELS[style] || style || '';
  }

  function blockFor() {
    var cache = (state.get && state.get().cache) || {};
    var scripts = cache.scripts || {};
    return scripts.mine;
  }

  function selectedScriptId() {
    var sel = (state.get && state.get().selection) ? state.get().selection.script : null;
    return (sel && sel.id != null) ? sel.id : null;
  }

  /** 卡片 meta：时长/字数/创建时间 非空项拼接 */
  function scriptMetaText(item) {
    if (!item) return '';
    var parts = [];
    if (item.estimatedDuration != null) parts.push('约 ' + item.estimatedDuration + ' 秒');
    if (item.totalWords != null) parts.push(item.totalWords + ' 字');
    if (item.createdAt) parts.push(formatDate(item.createdAt));
    return parts.join(' · ');
  }

  /** fullScript 摘要：压缩空白 + 120 字截断（textContent 防注入） */
  function scriptSummary(item) {
    if (!item || !item.fullScript) return '';
    var text = String(item.fullScript).replace(/\s+/g, ' ').trim();
    if (text.length > 120) text = text.slice(0, 120) + '…';
    return text;
  }

  function formatDate(value) {
    if (value == null || value === '') return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // ═══════════════════════════════════════════════════════════════════
  //  加载（唯一入口 state.load.scriptsMine，Promise 回调幂等 renderView）
  // ═══════════════════════════════════════════════════════════════════

  function loadList(opts) {
    opts = opts || {};
    if (typeof state.load.scriptsMine !== 'function') return Promise.resolve(null);
    return state.load.scriptsMine({ page: opts.page, pageSize: opts.pageSize }).then(function () {
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
    loadList();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  四态分派（页面自实现，不依赖 list 内置硬编码空态）
  // ═══════════════════════════════════════════════════════════════════

  function renderView() {
    var container = els.content;
    if (!container) return;

    var block = blockFor();
    if (!block) return;

    // 1. loading：无已有项且加载中 → skeleton
    if (block.isLoading && (!block.items || block.items.length === 0)) {
      if (components.loading) {
        components.loading.render({ container: container, variant: 'card', count: 6 });
      }
      return;
    }

    // 2. error
    if (block.loadError) {
      if (components.errorPanel) {
        components.errorPanel.render({
          container: container,
          error: block.loadError,
          onRetry: function () { loadList(); }
        });
      }
      return;
    }

    // 3. empty
    if (!block.items || block.items.length === 0) {
      renderEmpty(container);
      return;
    }

    // 4. normal → list 网格 + 分页（renderItem 委托给页面自建脚本卡片）
    if (components.list) {
      components.list.render({
        container: container,
        items: block.items,
        isLoading: block.isLoading,
        loadError: block.loadError,
        renderItem: renderScriptCard,
        pagination: { page: block.page, total: block.total },
        onPageChange: function (page) { loadList({ page: page }); }
      });
    }
  }

  function renderEmpty(container) {
    if (!components.emptyState) return;
    components.emptyState.render({
      container: container,
      title: '还没有脚本',
      description: '用 AI 生成第一条口播脚本，或手动起草。',
      icon: 'fa-file-alt',
      action: { label: 'AI 生成脚本', onClick: openGenerateModal }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  列表项渲染（页面自建脚本卡片，复用 .yj-card/.yj-card-selected）
  //  不使用 selectCard：脚本无 imageUrl，且需内嵌查看/编辑/删除多操作按钮
  // ═══════════════════════════════════════════════════════════════════

  function renderScriptCard(item) {
    if (!item) return null;
    var selected = selectedScriptId() === item.id;

    var card = document.createElement('div');
    card.className = 'yj-card yj-card-interactive studio-script-card';
    if (selected) card.className += ' yj-card-selected studio-script-card--selected';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    card.setAttribute('aria-label', '选择脚本「' + (item.title || '') + '」');

    card.appendChild(scriptCardBody(item, selected));

    card.addEventListener('click', function () { selectScript(item); });
    card.addEventListener('keydown', function (e) {
      if (e.target !== card) return; // 忽略内部按钮的键盘事件（Enter/Space 只触发整卡选择）
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectScript(item);
      }
    });
    return card;
  }

  function scriptCardBody(item, selected) {
    var body = document.createElement('div');
    body.className = 'studio-script-card__body';

    var head = document.createElement('div');
    head.className = 'studio-script-card__head';

    var title = document.createElement('div');
    title.className = 'studio-script-card__title';
    title.textContent = item.title || '未命名脚本';
    head.appendChild(title);

    var badges = document.createElement('div');
    badges.className = 'studio-script-card__badges';
    if (selected) {
      var check = document.createElement('span');
      check.className = 'studio-script-card__check';
      check.setAttribute('aria-hidden', 'true');
      var checkIcon = document.createElement('i');
      checkIcon.className = 'fas fa-check';
      check.appendChild(checkIcon);
      badges.appendChild(check);
    }
    badges.appendChild(sourceBadge(item.sourceType));
    badges.appendChild(statusBadge(item.status));
    head.appendChild(badges);

    body.appendChild(head);

    var summary = scriptSummary(item);
    if (summary) {
      var sum = document.createElement('p');
      sum.className = 'studio-script-card__summary';
      sum.textContent = summary;
      body.appendChild(sum);
    }

    var metaText = scriptMetaText(item);
    if (metaText) {
      var meta = document.createElement('div');
      meta.className = 'studio-script-card__meta';
      meta.textContent = metaText;
      body.appendChild(meta);
    }

    var actions = document.createElement('div');
    actions.className = 'studio-script-card__actions';
    actions.appendChild(actionButton('查看', 'fa-eye', '查看脚本「' + (item.title || '') + '」', function () {
      openViewModal(item);
    }));
    actions.appendChild(actionButton('编辑', 'fa-pen', '编辑脚本「' + (item.title || '') + '」', function () {
      openEditModal(item);
    }));
    actions.appendChild(actionButton('删除', 'fa-trash', '删除脚本「' + (item.title || '') + '」', function () {
      confirmDelete(item);
    }));
    body.appendChild(actions);

    return body;
  }

  function sourceBadge(sourceType) {
    var badge = document.createElement('span');
    badge.className = 'yj-badge yj-badge-draft';
    badge.textContent = sourceLabel(sourceType);
    return badge;
  }

  function statusBadge(status) {
    var meta = (api.resolveStatusMeta) ? api.resolveStatusMeta('script', status) : { label: status || '未知', tone: 'muted' };
    var badge = document.createElement('span');
    badge.className = 'yj-badge ' + badgeToneClass(meta.tone);
    badge.textContent = meta.label || status || '未知';
    return badge;
  }

  function badgeToneClass(tone) {
    switch (tone) {
      case 'success': return 'yj-badge-success';
      case 'info': return 'yj-badge-processing';
      case 'danger': return 'yj-badge-failed';
      case 'pending': return 'yj-badge-pending';
      case 'muted':
      default: return 'yj-badge-draft';
    }
  }

  function actionButton(label, icon, ariaLabel, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yj-btn yj-btn-secondary studio-script-card__action';
    btn.setAttribute('aria-label', ariaLabel || label);
    var iconEl = document.createElement('i');
    iconEl.className = 'fas ' + icon;
    iconEl.setAttribute('aria-hidden', 'true');
    var textEl = document.createElement('span');
    textEl.textContent = label;
    btn.appendChild(iconEl);
    btn.appendChild(textEl);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  /** 选择：只写 selection.script = { id, title, sourceType }，供 Create 页复用 */
  function selectScript(item) {
    if (state.get && state.get().selection) {
      state.get().selection.script = { id: item.id, title: item.title, sourceType: item.sourceType };
    }
    renderView();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  模态框（复用 YJ.components.modal，依赖 #modalOverlay）
  // ═══════════════════════════════════════════════════════════════════

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

  /** 表单/确认类模态：确认按钮 + 取消按钮 */
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

  /** 只读类模态（查看 / 生成结果）：单一「完成」按钮，无取消、无业务动作 */
  function openReadonlyModal(opts) {
    if (!modal.open) return;
    modal.open({
      title: opts.title,
      content: opts.content,
      confirmText: opts.confirmText || '完成',
      confirmClass: 'yj-btn yj-btn-primary'
    });
    resetConfirmButton();
  }

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  AI 生成（仅调用 api.script.generate，零 AI 逻辑；结果只读展示）
  // ═══════════════════════════════════════════════════════════════════

  function openGenerateModal() {
    openPageModal({
      title: 'AI 生成脚本',
      content: generateFormHtml(),
      confirmText: '生成',
      confirmClass: 'yj-btn yj-btn-primary',
      onConfirm: function () {
        if (formBusy) return false;
        submitGenerate();
        return false;
      }
    });
  }

  function generateFormHtml() {
    var styleOptions = '';
    for (var i = 0; i < STYLE_OPTIONS.length; i++) {
      var s = STYLE_OPTIONS[i];
      styleOptions += '<option value="' + s + '">' + styleLabel(s) + '</option>';
    }
    return '' +
      '<div class="studio-form">' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="scGenTheme">脚本主题<span class="studio-form__required"> *</span></label>' +
          '<textarea id="scGenTheme" class="studio-form__textarea" rows="3" placeholder="描述要生成的口播脚本主题，如：介绍一款新上市的智能手表"></textarea>' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="scGenStyle">风格</label>' +
          '<select id="scGenStyle" class="studio-form__select">' + styleOptions + '</select>' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="scGenDuration">时长（秒）</label>' +
          '<input id="scGenDuration" type="number" class="studio-form__input" min="1" max="300" step="1" value="30" />' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="scGenProduct">产品名称</label>' +
          '<input id="scGenProduct" type="text" class="studio-form__input" placeholder="选填，如：YuJian 智能手表" autocomplete="off" />' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="scGenScene">场景说明</label>' +
          '<textarea id="scGenScene" class="studio-form__textarea" rows="2" placeholder="选填，如：面向年轻上班族的产品发布会开场"></textarea>' +
        '</div>' +
      '</div>';
  }

  function submitGenerate() {
    var theme = fieldValue('scGenTheme').trim();
    if (!theme) { if (toast.warning) toast.warning('请填写脚本主题'); return; }

    var style = fieldValue('scGenStyle') || 'professional';
    var durationRaw = parseInt(fieldValue('scGenDuration'), 10);
    var duration = (isNaN(durationRaw) || durationRaw < 1 || durationRaw > 300) ? 30 : durationRaw;

    formBusy = true;
    setConfirmLoading(true);

    api.script.generate({
      theme: theme,
      style: style,
      duration: duration,
      productName: fieldValue('scGenProduct').trim() || undefined,
      sceneContext: fieldValue('scGenScene').trim() || undefined
    }).then(function (result) {
      if (toast.success) toast.success('脚本已生成');
      modal.close();
      openResultModal(result);
      refreshList();
    }).catch(function (err) {
      if (toast.error) toast.error(errorMessage(err, '生成失败，请重试'));
      formBusy = false;
      setConfirmLoading(false);
    });
  }

  function openResultModal(result) {
    if (!result) return;
    openReadonlyModal({
      title: '生成结果',
      content: previewHtml({
        title: result.title,
        style: result.style,
        status: result.status,
        estimatedDuration: result.estimatedDuration,
        totalWords: result.totalWords,
        createdAt: result.createdAt,
        fullText: result.fullText,
        segments: result.segments
      }),
      confirmText: '完成'
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  查看（只读：fullScript + structuredScript.segments，不可编辑）
  // ═══════════════════════════════════════════════════════════════════

  function openViewModal(item) {
    if (!item) return;
    var ss = item.structuredScript || null;
    openReadonlyModal({
      title: '查看脚本',
      content: previewHtml({
        title: item.title,
        sourceType: item.sourceType,
        status: item.status,
        estimatedDuration: item.estimatedDuration,
        totalWords: item.totalWords,
        createdAt: item.createdAt,
        fullText: item.fullScript,
        segments: (ss && ss.segments) ? ss.segments : []
      }),
      confirmText: '完成'
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  只读预览构建（查看 / 生成结果 共用：标题 + 徽章 + meta + 全文 + 分段）
  // ═══════════════════════════════════════════════════════════════════

  function previewHtml(cfg) {
    cfg = cfg || {};
    var badges = '';
    if (cfg.style) {
      badges += '<span class="yj-badge yj-badge-draft">' + escapeHtml(styleLabel(cfg.style)) + '</span>';
    }
    if (cfg.sourceType) {
      badges += '<span class="yj-badge yj-badge-draft">' + escapeHtml(sourceLabel(cfg.sourceType)) + '</span>';
    }
    if (cfg.status) {
      var sm = (api.resolveStatusMeta) ? api.resolveStatusMeta('script', cfg.status) : { label: cfg.status, tone: 'muted' };
      badges += '<span class="yj-badge ' + badgeToneClass(sm.tone) + '">' + escapeHtml(sm.label || cfg.status) + '</span>';
    }

    var metaParts = [];
    if (cfg.estimatedDuration != null) metaParts.push('约 ' + cfg.estimatedDuration + ' 秒');
    if (cfg.totalWords != null) metaParts.push(cfg.totalWords + ' 字');
    if (cfg.createdAt) metaParts.push(formatDate(cfg.createdAt));
    var metaText = metaParts.join(' · ');

    var segs = segmentsHtml(cfg.segments);

    return '' +
      '<div class="studio-script-preview">' +
        '<div class="studio-script-preview__head">' +
          '<h3 class="studio-script-preview__title">' + escapeHtml(cfg.title || '未命名脚本') + '</h3>' +
          (badges ? '<div class="studio-script-preview__badges">' + badges + '</div>' : '') +
        '</div>' +
        (metaText ? '<div class="studio-script-preview__meta">' + escapeHtml(metaText) + '</div>' : '') +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label">完整脚本</label>' +
          '<textarea class="studio-form__textarea studio-script-preview__text" rows="8" readonly>' + escapeHtml(cfg.fullText || '') + '</textarea>' +
        '</div>' +
        (segs || '<p class="studio-script-preview__empty">暂无结构化分段。</p>') +
      '</div>';
  }

  function segmentsHtml(segments) {
    var segs = Array.isArray(segments) ? segments : [];
    if (segs.length === 0) return '';

    var html = '<div class="studio-script-segments">';
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i] || {};
      var idx = (seg.index != null && !isNaN(Number(seg.index))) ? (Number(seg.index) + 1) : (i + 1);
      var segMetaParts = [];
      if (seg.emotion) segMetaParts.push('情绪：' + seg.emotion);
      if (seg.estimatedDurationSec != null) segMetaParts.push('约 ' + seg.estimatedDurationSec + ' 秒');
      var segMeta = segMetaParts.join(' · ');

      html += '' +
        '<div class="studio-script-segment">' +
          '<div class="studio-script-segment__head">' +
            '<span class="studio-script-segment__label">第 ' + idx + ' 段</span>' +
            (segMeta ? '<span class="studio-script-segment__meta">' + escapeHtml(segMeta) + '</span>' : '') +
          '</div>' +
          '<p class="studio-script-segment__text">' + escapeHtml(seg.text || '') + '</p>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  手动创建 / 编辑 / 删除流程（成功统一重拉列表，不做本地乐观更新）
  // ═══════════════════════════════════════════════════════════════════

  function openCreateModal() {
    openPageModal({
      title: '新建脚本',
      content: createFormHtml(),
      confirmText: '创建',
      confirmClass: 'yj-btn yj-btn-primary',
      onConfirm: function () {
        if (formBusy) return false;
        submitCreate();
        return false;
      }
    });
  }

  function createFormHtml() {
    return '' +
      '<div class="studio-form">' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="scCreateTitle">标题<span class="studio-form__required"> *</span></label>' +
          '<input id="scCreateTitle" type="text" class="studio-form__input" placeholder="给脚本起个标题" autocomplete="off" />' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="scCreateScript">脚本内容<span class="studio-form__required"> *</span></label>' +
          '<textarea id="scCreateScript" class="studio-form__textarea" rows="8" placeholder="输入口播脚本全文"></textarea>' +
        '</div>' +
      '</div>';
  }

  function submitCreate() {
    var title = fieldValue('scCreateTitle').trim();
    var fullScript = fieldValue('scCreateScript').trim();
    if (!title) { if (toast.warning) toast.warning('请填写脚本标题'); return; }
    if (!fullScript) { if (toast.warning) toast.warning('请填写脚本内容'); return; }

    formBusy = true;
    setConfirmLoading(true);

    api.script.create({ sourceType: 'manual', title: title, fullScript: fullScript })
      .then(function () {
        if (toast.success) toast.success('脚本已创建');
        modal.close();
        refreshList();
      })
      .catch(function (err) {
        if (toast.error) toast.error(errorMessage(err, '创建失败，请重试'));
        formBusy = false;
        setConfirmLoading(false);
      });
  }

  function openEditModal(item) {
    openPageModal({
      title: '编辑脚本',
      content: editFormHtml(item),
      confirmText: '保存',
      confirmClass: 'yj-btn yj-btn-primary',
      onConfirm: function () {
        if (formBusy) return false;
        submitEdit(item);
        return false;
      }
    });
  }

  /**
   * 编辑表单：仅 title + full_script + status（均在 update 白名单内）。
   * 不暴露 structured_script（机器生成物只读，避免破坏 AI/Pipeline 生成结构）。
   */
  function editFormHtml(item) {
    var statusOptions = '';
    for (var i = 0; i < STATUS_OPTIONS.length; i++) {
      var s = STATUS_OPTIONS[i];
      var selected = (item.status === s) ? ' selected' : '';
      statusOptions += '<option value="' + s + '"' + selected + '>' + (STATUS_LABELS[s] || s) + '</option>';
    }
    return '' +
      '<div class="studio-form">' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="scEditTitle">标题<span class="studio-form__required"> *</span></label>' +
          '<input id="scEditTitle" type="text" class="studio-form__input" value="' + escapeHtml(item.title || '') + '" autocomplete="off" />' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="scEditScript">脚本内容</label>' +
          '<textarea id="scEditScript" class="studio-form__textarea" rows="8" placeholder="输入口播脚本全文">' + escapeHtml(item.fullScript || '') + '</textarea>' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="scEditStatus">状态</label>' +
          '<select id="scEditStatus" class="studio-form__select">' + statusOptions + '</select>' +
        '</div>' +
      '</div>';
  }

  function submitEdit(item) {
    var title = fieldValue('scEditTitle').trim();
    if (!title) { if (toast.warning) toast.warning('请填写脚本标题'); return; }

    formBusy = true;
    setConfirmLoading(true);

    api.script.update(item.id, {
      title: title,
      fullScript: fieldValue('scEditScript'),
      status: fieldValue('scEditStatus')
    }).then(function () {
      if (toast.success) toast.success('已保存修改');
      modal.close();
      refreshList();
    }).catch(function (err) {
      if (toast.error) toast.error(errorMessage(err, '保存失败，请重试'));
      formBusy = false;
      setConfirmLoading(false);
    });
  }

  function confirmDelete(item) {
    openPageModal({
      title: '删除脚本',
      content: '<p class="studio-confirm-text">确定要删除脚本「' + escapeHtml(item.title || '未命名') + '」吗？删除后不可恢复。</p>',
      confirmText: '删除',
      confirmClass: 'yj-btn yj-btn-danger',
      onConfirm: function () {
        if (formBusy) return false;
        submitDelete(item);
        return false;
      }
    });
  }

  function submitDelete(item) {
    formBusy = true;
    setConfirmLoading(true);

    api.script.remove(item.id).then(function () {
      if (toast.success) toast.success('脚本已删除');
      modal.close();
      refreshList();
    }).catch(function (err) {
      if (toast.error) toast.error(errorMessage(err, '删除失败，请重试'));
      formBusy = false;
      setConfirmLoading(false);
    });
  }

  function refreshList() {
    formBusy = false;
    if (typeof state.load.scriptsMine === 'function') {
      state.load.scriptsMine().then(function () { renderView(); });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  工具栏 / 事件绑定
  // ═══════════════════════════════════════════════════════════════════

  function cacheEls() {
    els.root = document.querySelector('#studio-main .studio-page');
    els.content = document.querySelector('#studio-main .studio-scripts__content');
    els.generateButton = document.querySelector('#studio-main [data-action="generate"]');
    els.createButton = document.querySelector('#studio-main [data-action="create"]');
  }

  function bindEvents() {
    if (els.generateButton) els.generateButton.addEventListener('click', openGenerateModal);
    if (els.createButton) els.createButton.addEventListener('click', openCreateModal);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  生命周期（render 纯字符串 / init 绑定+触发加载 / destroy 释放闭包态）
  // ═══════════════════════════════════════════════════════════════════

  function render(params) {
    return '' +
      '<div class="studio-page">' +
        '<div class="studio-page__header">' +
          '<h1 class="yj-page-title">内容创作</h1>' +
          '<p class="yj-page-subtitle">AI 生成口播脚本，或手动起草</p>' +
        '</div>' +
        '<div class="studio-page__toolbar studio-scripts__toolbar">' +
          '<div class="studio-page__actions">' +
            '<button type="button" class="yj-btn yj-btn-primary" data-action="generate">' +
              '<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>' +
              '<span>AI 生成脚本</span>' +
            '</button>' +
            '<button type="button" class="yj-btn yj-btn-secondary" data-action="create">' +
              '<i class="fas fa-plus" aria-hidden="true"></i>' +
              '<span>新建草稿</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="studio-scripts__content"></div>' +
      '</div>';
  }

  function init(params) {
    formBusy = false;
    cacheEls();
    bindEvents();
    ensureLoaded();
    renderView();
  }

  function destroy() {
    // 页面 DOM 由 router 整体替换，节点级监听随 DOM 释放；此处仅清引用与闭包瞬时态
    els = {};
    formBusy = false;
  }

  YJ.studio.pages.scripts = {
    render: render,
    init: init,
    destroy: destroy
  };

  window.YJ = YJ;
})();
