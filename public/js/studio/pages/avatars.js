/**
 * YuJian Studio — Avatars Page
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D4
 *
 * 职责：数字人资产页面（纯组装层）—— 官方/我的 双 tab，浏览/选择/上传/编辑/删除。
 *   - 官方 tab：只读浏览 + selectCard 选择回写 state.selection.avatar（供 Create 页复用）
 *   - 我的 tab：浏览 + 上传 / 编辑 / 删除
 *
 * 数据边界（严格遵守，违规即返工）：
 *   ❌ 不直接 fetch / 不拼 URL / 不自己 catch 映射文案（一切经 api + state.load.*）
 *   ❌ 不写 cache 内部字段（列表数据只经 state.load.avatarsOfficial/Mine 写入）
 *   ❌ 不写 cache.avatars.mine.isUploading（上传中态走页面闭包 uploadState）
 *   ❌ 不新增组件（复用 list/emptyState/loading/errorPanel/selectCard + toast/modal）
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
  var YuJianUpload = window.YuJianUpload || {};

  var TABS = { OFFICIAL: 'official', MINE: 'mine' };
  var DEFAULT_PAGE_SIZE = 20;

  var GENDER_LABELS = { male: '男', female: '女', unknown: '未知' };

  // ── 页面闭包瞬时状态（destroy 释放，不写 state）──
  var activeTab = TABS.OFFICIAL;
  var els = {};
  var uploadState = { file: null, preview: null, busy: false };

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

  function genderLabel(gender) {
    return GENDER_LABELS[gender] || '未知';
  }

  /** 缩略图优先，原图兜底 */
  function resolveImage(item) {
    if (!item) return '';
    return item.thumbnailUrl || item.imageUrl || '';
  }

  /** 错误信息：优先 friendlyMessage（api 归一化），回退 message（uploadImage 中文），再回退默认 */
  function errorMessage(err, fallback) {
    if (!err) return fallback;
    if (err.friendlyMessage) return err.friendlyMessage;
    if (err.message) return err.message;
    return fallback;
  }

  function blockFor(tab) {
    var cache = (state.get && state.get().cache) || {};
    var avatars = cache.avatars || {};
    return (tab === TABS.MINE) ? avatars.mine : avatars.official;
  }

  function selectedAvatarId() {
    var sel = (state.get && state.get().selection) ? state.get().selection.avatar : null;
    return (sel && sel.id != null) ? sel.id : null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  加载（唯一入口 state.load.*，Promise 回调幂等 renderView）
  // ═══════════════════════════════════════════════════════════════════

  function loadTab(tab, opts) {
    opts = opts || {};
    var load = (tab === TABS.MINE) ? state.load.avatarsMine : state.load.avatarsOfficial;
    if (typeof load !== 'function') return Promise.resolve(null);
    return load({ page: opts.page, pageSize: opts.pageSize }).then(function () {
      if (activeTab === tab) renderView();
    });
  }

  /** 进入/切 tab：有数据或加载中或已错误 → 不重复请求；否则触发对应 load */
  function ensureLoaded(tab) {
    var block = blockFor(tab);
    if (!block) return;
    if (block.items && block.items.length > 0) return;
    if (block.isLoading) return;
    if (block.loadError) return; // 错误态停留，等待 errorPanel 重试
    loadTab(tab);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  四态分派（页面自实现，不依赖 list 内置硬编码空态）
  // ═══════════════════════════════════════════════════════════════════

  function renderView() {
    var container = els.content;
    if (!container) return;

    var block = blockFor(activeTab);
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
          onRetry: function () { loadTab(activeTab); }
        });
      }
      return;
    }

    // 3. empty
    if (!block.items || block.items.length === 0) {
      renderEmpty(container);
      return;
    }

    // 4. normal → list 网格 + 分页（renderItem 委托给页面）
    if (components.list) {
      components.list.render({
        container: container,
        items: block.items,
        isLoading: block.isLoading,
        loadError: block.loadError,
        renderItem: (activeTab === TABS.OFFICIAL) ? renderOfficialItem : renderMineItem,
        pagination: { page: block.page, total: block.total },
        onPageChange: function (page) { loadTab(activeTab, { page: page }); }
      });
    }
  }

  function renderEmpty(container) {
    if (!components.emptyState) return;
    if (activeTab === TABS.MINE) {
      components.emptyState.render({
        container: container,
        title: '还没有我的数字人',
        description: '上传一张正面形象照，创建属于你的数字人。',
        icon: 'fa-user-plus',
        action: { label: '上传数字人', onClick: openUploadModal }
      });
    } else {
      components.emptyState.render({
        container: container,
        title: '暂无可选官方形象',
        description: '官方形象库暂时为空，可切换到「我的数字人」上传自己的形象。',
        icon: 'fa-user-group'
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  列表项渲染（官方：selectCard；我的：普通卡片）
  // ═══════════════════════════════════════════════════════════════════

  function renderOfficialItem(item) {
    if (!components.selectCard) return null;
    var selected = selectedAvatarId() === item.id;
    var meta = [genderLabel(item.gender), item.description].filter(Boolean).join(' · ');
    return components.selectCard.create({
      item: item,
      selected: selected,
      title: item.name || '未命名数字人',
      imageUrl: resolveImage(item),
      meta: meta,
      onSelect: function (selectedItem) {
        // 官方 tab 选择：只写 selection.avatar，供 Create 页复用
        if (state.get && state.get().selection) {
          state.get().selection.avatar = {
            id: selectedItem.id,
            imageUrl: resolveImage(selectedItem),
            name: selectedItem.name
          };
        }
        renderView();
      }
    });
  }

  function renderMineItem(item) {
    var card = document.createElement('div');
    card.className = 'yj-card studio-avatar-card';

    card.appendChild(avatarMedia(item));

    var body = document.createElement('div');
    body.className = 'studio-avatar-card__body';

    var head = document.createElement('div');
    head.className = 'studio-avatar-card__head';
    var title = document.createElement('div');
    title.className = 'studio-avatar-card__title';
    title.textContent = item.name || '未命名数字人';
    head.appendChild(title);
    head.appendChild(statusBadge(item.status));
    body.appendChild(head);

    if (item.description) {
      var desc = document.createElement('p');
      desc.className = 'studio-avatar-card__desc';
      desc.textContent = item.description;
      body.appendChild(desc);
    }

    var meta = document.createElement('div');
    meta.className = 'studio-avatar-card__meta';
    meta.textContent = '性别：' + genderLabel(item.gender);
    body.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'studio-avatar-card__actions';
    actions.appendChild(actionButton('编辑', 'fa-pen', '编辑数字人「' + (item.name || '') + '」', function () {
      openEditModal(item);
    }));
    actions.appendChild(actionButton('删除', 'fa-trash', '删除数字人「' + (item.name || '') + '」', function () {
      confirmDelete(item);
    }));
    body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  function avatarMedia(item) {
    var media = document.createElement('div');
    media.className = 'studio-avatar-card__media';
    var url = resolveImage(item);
    if (url) {
      var img = document.createElement('img');
      img.className = 'studio-avatar-card__image';
      img.src = url;
      img.alt = item.name || '数字人形象';
      img.loading = 'lazy';
      media.appendChild(img);
    } else {
      var ph = document.createElement('div');
      ph.className = 'studio-avatar-card__placeholder';
      ph.setAttribute('aria-hidden', 'true');
      var icon = document.createElement('i');
      icon.className = 'fas fa-user';
      ph.appendChild(icon);
      media.appendChild(ph);
    }
    return media;
  }

  function statusBadge(status) {
    var meta = (api.resolveStatusMeta) ? api.resolveStatusMeta('avatar', status) : { label: status || '未知', tone: 'muted' };
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
    btn.className = 'yj-btn yj-btn-secondary studio-avatar-card__action';
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

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  上传流程：YuJianUpload.uploadImage → api.avatar.create → load.avatarsMine
  // ═══════════════════════════════════════════════════════════════════

  function openUploadModal() {
    resetUploadState();

    openPageModal({
      title: '上传数字人',
      content: uploadFormHtml(),
      confirmText: '上传',
      confirmClass: 'yj-btn yj-btn-primary',
      onConfirm: function () {
        if (uploadState.busy) return false;
        submitUpload();
        return false;
      },
      onClose: resetUploadState
    });

    var pick = document.getElementById('avUploadPick');
    var fileInput = document.getElementById('avUploadFile');
    var preview = document.getElementById('avUploadPreview');
    if (pick && fileInput) {
      pick.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        if (uploadState.preview) { try { uploadState.preview.revoke(); } catch (e) {} }
        uploadState.file = f;
        if (YuJianUpload.createPreview) uploadState.preview = YuJianUpload.createPreview(f);
        if (preview && uploadState.preview) {
          preview.src = uploadState.preview.url;
          preview.hidden = false;
        }
      });
    }
  }

  function uploadFormHtml() {
    return '' +
      '<div class="studio-form">' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="avUploadName">名称<span class="studio-form__required"> *</span></label>' +
          '<input id="avUploadName" type="text" class="studio-form__input" placeholder="给数字人起个名字" autocomplete="off" />' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="avUploadGender">性别</label>' +
          '<select id="avUploadGender" class="studio-form__select">' +
            '<option value="unknown">未知</option>' +
            '<option value="male">男</option>' +
            '<option value="female">女</option>' +
          '</select>' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="avUploadDesc">描述</label>' +
          '<textarea id="avUploadDesc" class="studio-form__textarea" rows="2" placeholder="选填，一句话介绍形象"></textarea>' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label">形象图片<span class="studio-form__required"> *</span></label>' +
          '<div class="studio-upload">' +
            '<input id="avUploadFile" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" />' +
            '<button type="button" class="yj-btn yj-btn-secondary" id="avUploadPick"><i class="fas fa-image" aria-hidden="true"></i><span>选择图片</span></button>' +
            '<img id="avUploadPreview" class="studio-upload__preview" alt="已选图片预览" hidden />' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function submitUpload() {
    var name = fieldValue('avUploadName').trim();
    if (!name) { toast.warning('请填写数字人名称'); return; }
    if (!uploadState.file) { toast.warning('请选择形象图片'); return; }

    uploadState.busy = true;
    setConfirmLoading(true);

    YuJianUpload.uploadImage(uploadState.file)
      .then(function (res) {
        return api.avatar.create({
          name: name,
          imageUrl: res.url,
          assetId: res.assetId,
          description: fieldValue('avUploadDesc').trim() || undefined,
          gender: fieldValue('avUploadGender')
        });
      })
      .then(function () {
        toast.success('数字人已上传');
        modal.close();
        refreshMine();
      })
      .catch(function (err) {
        toast.error(errorMessage(err, '上传失败，请重试'));
        uploadState.busy = false;
        setConfirmLoading(false);
      });
  }

  function resetUploadState() {
    if (uploadState.preview) { try { uploadState.preview.revoke(); } catch (e) {} }
    uploadState.file = null;
    uploadState.preview = null;
    uploadState.busy = false;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  编辑 / 删除流程（成功统一重拉列表，不做本地乐观更新）
  // ═══════════════════════════════════════════════════════════════════

  function openEditModal(item) {
    openPageModal({
      title: '编辑数字人',
      content: editFormHtml(item),
      confirmText: '保存',
      confirmClass: 'yj-btn yj-btn-primary',
      onConfirm: function () {
        if (uploadState.busy) return false;
        submitEdit(item);
        return false;
      }
    });
  }

  function editFormHtml(item) {
    var genders = ['unknown', 'male', 'female'];
    var options = '';
    for (var i = 0; i < genders.length; i++) {
      var g = genders[i];
      var selected = (item.gender === g) ? ' selected' : '';
      options += '<option value="' + g + '"' + selected + '>' + genderLabel(g) + '</option>';
    }
    return '' +
      '<div class="studio-form">' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="avEditName">名称<span class="studio-form__required"> *</span></label>' +
          '<input id="avEditName" type="text" class="studio-form__input" value="' + escapeHtml(item.name || '') + '" autocomplete="off" />' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="avEditGender">性别</label>' +
          '<select id="avEditGender" class="studio-form__select">' + options + '</select>' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="avEditDesc">描述</label>' +
          '<textarea id="avEditDesc" class="studio-form__textarea" rows="2" placeholder="选填，一句话介绍形象">' + escapeHtml(item.description || '') + '</textarea>' +
        '</div>' +
      '</div>';
  }

  function submitEdit(item) {
    var name = fieldValue('avEditName').trim();
    if (!name) { toast.warning('请填写数字人名称'); return; }

    uploadState.busy = true;
    setConfirmLoading(true);

    api.avatar.update(item.id, {
      name: name,
      gender: fieldValue('avEditGender'),
      description: fieldValue('avEditDesc').trim() || undefined
    }).then(function () {
      toast.success('已保存修改');
      modal.close();
      refreshMine();
    }).catch(function (err) {
      toast.error(errorMessage(err, '保存失败，请重试'));
      uploadState.busy = false;
      setConfirmLoading(false);
    });
  }

  function confirmDelete(item) {
    openPageModal({
      title: '删除数字人',
      content: '<p class="studio-confirm-text">确定要删除数字人「' + escapeHtml(item.name || '未命名') + '」吗？删除后不可恢复。</p>',
      confirmText: '删除',
      confirmClass: 'yj-btn yj-btn-danger',
      onConfirm: function () {
        if (uploadState.busy) return false;
        submitDelete(item);
        return false;
      }
    });
  }

  function submitDelete(item) {
    uploadState.busy = true;
    setConfirmLoading(true);

    api.avatar.remove(item.id).then(function () {
      toast.success('数字人已删除');
      modal.close();
      refreshMine();
    }).catch(function (err) {
      toast.error(errorMessage(err, '删除失败，请重试'));
      uploadState.busy = false;
      setConfirmLoading(false);
    });
  }

  function refreshMine() {
    uploadState.busy = false;
    if (typeof state.load.avatarsMine === 'function') {
      state.load.avatarsMine().then(function () { if (activeTab === TABS.MINE) renderView(); });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  tab / 工具栏
  // ═══════════════════════════════════════════════════════════════════

  function setTab(tab) {
    if (tab === activeTab) return;
    activeTab = tab;

    var tabs = els.tabs || [];
    for (var i = 0; i < tabs.length; i++) {
      var isActive = tabs[i].getAttribute('data-tab') === tab;
      tabs[i].classList.toggle('is-active', isActive);
      tabs[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
    }

    syncToolbar();
    ensureLoaded(tab);
    renderView();
  }

  /** 上传入口仅在「我的」tab 可见（官方只读） */
  function syncToolbar() {
    if (els.uploadAction) {
      els.uploadAction.style.display = (activeTab === TABS.MINE) ? '' : 'none';
    }
  }

  function cacheEls() {
    els.root = document.querySelector('#studio-main .studio-page');
    els.content = document.querySelector('#studio-main .studio-avatars__content');
    els.tabs = document.querySelectorAll('#studio-main .studio-tab');
    els.uploadAction = document.querySelector('#studio-main .studio-page__actions');
    els.uploadButton = document.querySelector('#studio-main [data-action="upload"]');
  }

  function bindEvents() {
    var tabs = els.tabs || [];
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        setTab(this.getAttribute('data-tab'));
      });
    }
    if (els.uploadButton) {
      els.uploadButton.addEventListener('click', openUploadModal);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  生命周期（render 纯字符串 / init 绑定+触发加载 / destroy 释放闭包态）
  // ═══════════════════════════════════════════════════════════════════

  function render(params) {
    return '' +
      '<div class="studio-page">' +
        '<div class="studio-page__header">' +
          '<h1 class="yj-page-title">数字人资产</h1>' +
          '<p class="yj-page-subtitle">浏览官方数字人，或上传你自己的形象</p>' +
        '</div>' +
        '<div class="studio-page__toolbar">' +
          '<div class="studio-tabs" role="tablist" aria-label="数字人分类">' +
            '<button type="button" class="studio-tab is-active" role="tab" aria-selected="true" data-tab="official">官方数字人</button>' +
            '<button type="button" class="studio-tab" role="tab" aria-selected="false" data-tab="mine">我的数字人</button>' +
          '</div>' +
          '<div class="studio-page__actions">' +
            '<button type="button" class="yj-btn yj-btn-primary" data-action="upload">' +
              '<i class="fas fa-upload" aria-hidden="true"></i>' +
              '<span>上传数字人</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="studio-avatars__content"></div>' +
      '</div>';
  }

  function init(params) {
    activeTab = TABS.OFFICIAL;
    cacheEls();
    bindEvents();
    syncToolbar();
    ensureLoaded(TABS.OFFICIAL);
    renderView();
  }

  function destroy() {
    // 页面 DOM 由 router 整体替换，节点级监听随 DOM 释放；此处仅清引用与闭包瞬时态
    els = {};
    activeTab = TABS.OFFICIAL;
    resetUploadState();
  }

  YJ.studio.pages.avatars = {
    render: render,
    init: init,
    destroy: destroy
  };

  window.YJ = YJ;
})();
