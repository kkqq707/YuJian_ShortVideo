/**
 * YuJian Studio — Voices Page
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D4
 *
 * 职责：声音中心页面（纯组装层）—— 音色库/我的 双 tab，浏览/试听/选择/创建/编辑/删除。
 *   - 音色库 tab：只读浏览 + 试听 + 选择回写 state.selection.voice（供 Create 页复用）
 *   - 我的 tab：试听 + 创建 / 编辑 / 删除
 *
 * 数据边界（严格遵守，违规即返工）：
 *   ❌ 不直接 fetch / 不拼 URL / 不自己 catch 映射文案（一切经 api + state.load.*）
 *   ❌ 不写 cache 内部字段（列表数据只经 state.load.voicesLibrary/Mine 写入）
 *   ❌ 不写 cache.voices.mine.isUploading / library.filter.gender（创建中态走页面闭包 formBusy）
 *   ❌ 不新增组件（复用 list/emptyState/loading/errorPanel + toast/modal）
 *   ❌ 不自建播放器系统 / 不引入第三方音频库（试听只用原生 HTMLAudioElement）
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

  var TABS = { LIBRARY: 'library', MINE: 'mine' };
  var DEFAULT_PAGE_SIZE = 20;

  var GENDER_LABELS = { male: '男', female: '女', unknown: '未知' };

  // ── 页面闭包瞬时状态（destroy 释放，不写 state）──
  var activeTab = TABS.LIBRARY;
  var els = {};
  var playingId = null;        // 当前播放的音色 id（null=无）
  var audioState = 'idle';     // idle | loading | playing | paused | error
  var audio = null;            // 单共享隐藏 <audio>，destroy 释放
  var formBusy = false;        // 创建/编辑/删除进行中（防重复提交）

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

  /** 错误信息：优先 friendlyMessage（api 归一化），回退 message，再回退默认 */
  function errorMessage(err, fallback) {
    if (!err) return fallback;
    if (err.friendlyMessage) return err.friendlyMessage;
    if (err.message) return err.message;
    return fallback;
  }

  function blockFor(tab) {
    var cache = (state.get && state.get().cache) || {};
    var voices = cache.voices || {};
    return (tab === TABS.MINE) ? voices.mine : voices.library;
  }

  function selectedVoiceId() {
    var sel = (state.get && state.get().selection) ? state.get().selection.voice : null;
    return (sel && sel.id != null) ? sel.id : null;
  }

  /** 卡片 meta：gender/language/provider 非空项拼接 */
  function voiceMetaText(item) {
    if (!item) return '';
    var parts = [];
    if (item.gender) parts.push(genderLabel(item.gender));
    if (item.language) parts.push(item.language);
    if (item.provider) parts.push(item.provider);
    return parts.join(' · ');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  加载（唯一入口 state.load.*，Promise 回调幂等 renderView）
  // ═══════════════════════════════════════════════════════════════════

  function loadTab(tab, opts) {
    opts = opts || {};
    var load = (tab === TABS.MINE) ? state.load.voicesMine : state.load.voicesLibrary;
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

    // 4. normal → list 网格 + 分页（renderItem 委托给页面自建 voice 卡片）
    if (components.list) {
      components.list.render({
        container: container,
        items: block.items,
        isLoading: block.isLoading,
        loadError: block.loadError,
        renderItem: (activeTab === TABS.LIBRARY) ? renderLibraryCard : renderMineCard,
        pagination: { page: block.page, total: block.total },
        onPageChange: function (page) { stopPlayback(); loadTab(activeTab, { page: page }); }
      });
    }
  }

  function renderEmpty(container) {
    if (!components.emptyState) return;
    if (activeTab === TABS.MINE) {
      components.emptyState.render({
        container: container,
        title: '还没有我的声音',
        description: '创建一个声音，为口播配音。',
        icon: 'fa-microphone',
        action: { label: '创建声音', onClick: openCreateModal }
      });
    } else {
      components.emptyState.render({
        container: container,
        title: '暂无可选系统音色',
        description: '系统音色库暂时为空，可切换到「我的声音」创建自己的声音。',
        icon: 'fa-headphones'
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  列表项渲染（页面自建 voice 卡片，复用 .yj-card/.yj-card-selected）
  //  不使用 selectCard：需内嵌试听按钮（独立 stopPropagation），且 voice 无 imageUrl
  // ═══════════════════════════════════════════════════════════════════

  /** 音色库卡片：试听 + 整卡选择（写 selection.voice），只读无编辑/删除 */
  function renderLibraryCard(item) {
    if (!item) return null;
    var selected = selectedVoiceId() === item.id;

    var card = document.createElement('div');
    card.className = 'yj-card yj-card-interactive studio-voice-card';
    if (selected) card.className += ' yj-card-selected studio-voice-card--selected';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    card.setAttribute('aria-label', '选择音色「' + (item.name || '') + '」');

    if (selected) {
      var check = document.createElement('span');
      check.className = 'studio-voice-card__check';
      check.setAttribute('aria-hidden', 'true');
      var checkIcon = document.createElement('i');
      checkIcon.className = 'fas fa-check';
      check.appendChild(checkIcon);
      card.appendChild(check);
    }

    card.appendChild(voiceCardBody(item, false));

    card.addEventListener('click', function () { selectVoice(item); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectVoice(item);
      }
    });
    return card;
  }

  /** 我的声音卡片：试听 + 编辑/删除，不可整卡选择 */
  function renderMineCard(item) {
    if (!item) return null;
    var card = document.createElement('div');
    card.className = 'yj-card studio-voice-card';
    card.appendChild(voiceCardBody(item, true));
    return card;
  }

  function voiceCardBody(item, isMine) {
    var body = document.createElement('div');
    body.className = 'studio-voice-card__body';

    var head = document.createElement('div');
    head.className = 'studio-voice-card__head';
    var title = document.createElement('div');
    title.className = 'studio-voice-card__title';
    title.textContent = item.name || '未命名音色';
    head.appendChild(title);
    head.appendChild(statusBadge(item.status));
    body.appendChild(head);

    if (item.description) {
      var desc = document.createElement('p');
      desc.className = 'studio-voice-card__desc';
      desc.textContent = item.description;
      body.appendChild(desc);
    }

    var metaText = voiceMetaText(item);
    if (metaText) {
      var meta = document.createElement('div');
      meta.className = 'studio-voice-card__meta';
      meta.textContent = metaText;
      body.appendChild(meta);
    }

    var actions = document.createElement('div');
    actions.className = 'studio-voice-card__actions';
    actions.appendChild(playButton(item));
    if (isMine) {
      actions.appendChild(actionButton('编辑', 'fa-pen', '编辑音色「' + (item.name || '') + '」', function () {
        openEditModal(item);
      }));
      actions.appendChild(actionButton('删除', 'fa-trash', '删除音色「' + (item.name || '') + '」', function () {
        confirmDelete(item);
      }));
    }
    body.appendChild(actions);

    return body;
  }

  /** 试听按钮：fa-play/fa-pause，无音频时禁用；stopPropagation 避免触发整卡选择 */
  function playButton(item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yj-btn yj-btn-secondary studio-voice-card__play';
    btn.setAttribute('data-play-id', String(item.id));
    btn.setAttribute('data-play-name', item.name || '音色');

    var isPlaying = (String(playingId) === String(item.id)) && audioState === 'playing';
    var icon = document.createElement('i');
    icon.className = 'fas ' + (isPlaying ? 'fa-pause' : 'fa-play');
    icon.setAttribute('aria-hidden', 'true');
    btn.appendChild(icon);
    btn.setAttribute('aria-label', isPlaying ? ('暂停试听「' + (item.name || '音色') + '」') : ('试听「' + (item.name || '音色') + '」'));
    btn.classList.toggle('is-playing', isPlaying);

    if (!item.sampleAudioUrl) {
      btn.disabled = true;
      btn.setAttribute('data-play-disabled', '1');
      btn.setAttribute('title', '该音色暂无可试听音频');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePlay(item);
    });
    return btn;
  }

  function actionButton(label, icon, ariaLabel, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yj-btn yj-btn-secondary studio-voice-card__action';
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

  function statusBadge(status) {
    var meta = (api.resolveStatusMeta) ? api.resolveStatusMeta('voice', status) : { label: status || '未知', tone: 'muted' };
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

  /** 选择：只写 selection.voice，供 Create 页复用 */
  function selectVoice(item) {
    if (state.get && state.get().selection) {
      state.get().selection.voice = { id: item.id, voiceKey: item.voiceKey, name: item.name };
    }
    renderView();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  试听（原生 HTMLAudioElement 最薄原语，非播放器系统）
  //  无进度条 / 无音量 / 无 seek / 无播放列表；一次只播一个
  // ═══════════════════════════════════════════════════════════════════

  function setupAudio() {
    audio = document.createElement('audio');
    audio.preload = 'none';

    audio.addEventListener('play', function () {
      audioState = 'playing';
      syncPlayButtons();
    });

    audio.addEventListener('pause', function () {
      // stopPlayback 已先置 idle，避免覆盖；仅播放中暂停才进 paused
      if (audioState === 'playing') audioState = 'paused';
      syncPlayButtons();
    });

    audio.addEventListener('ended', function () {
      playingId = null;
      audioState = 'idle';
      syncPlayButtons();
    });

    audio.addEventListener('error', function () {
      playingId = null;
      audioState = 'error';
      if (toast && toast.warning) toast.warning('试听加载失败');
      syncPlayButtons();
    });
  }

  function togglePlay(item) {
    if (!audio) return;
    if (!item || !item.sampleAudioUrl) {
      if (toast && toast.warning) toast.warning('该音色暂无可试听音频');
      return;
    }

    // 同一音色：播放中 → 暂停；暂停/加载中 → 续播
    if (playingId === item.id) {
      if (audioState === 'playing') {
        audio.pause();
      } else {
        safePlay();
      }
      return;
    }

    // 切到新音色
    playingId = item.id;
    audioState = 'loading';
    syncPlayButtons();
    audio.src = item.sampleAudioUrl;
    safePlay();
  }

  function safePlay() {
    if (!audio) return;
    try {
      var p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {
          if (audioState === 'loading') {
            playingId = null;
            audioState = 'error';
            if (toast && toast.warning) toast.warning('试听加载失败');
            syncPlayButtons();
          }
        });
      }
    } catch (e) {
      playingId = null;
      audioState = 'error';
      if (toast && toast.warning) toast.warning('试听加载失败');
      syncPlayButtons();
    }
  }

  /** 切 tab / 翻页：暂停 + 复位播放态（保留 src，便于同音色续播） */
  function stopPlayback() {
    playingId = null;
    audioState = 'idle';
    if (audio) {
      try { audio.pause(); } catch (e) {}
    }
    syncPlayButtons();
  }

  /** 播放态变更后，同步各卡片试听按钮图标/aria-label/禁用态 */
  function syncPlayButtons() {
    if (!els.content) return;
    var btns = els.content.querySelectorAll('[data-play-id]');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var id = btn.getAttribute('data-play-id');
      var name = btn.getAttribute('data-play-name') || '音色';
      var icon = btn.querySelector('i');
      var isCurrent = (String(playingId) === String(id));
      var isPlaying = isCurrent && audioState === 'playing';
      var isBusy = isCurrent && audioState === 'loading';
      if (icon) icon.className = 'fas ' + (isPlaying ? 'fa-pause' : 'fa-play');
      btn.setAttribute('aria-label', isPlaying ? ('暂停试听「' + name + '」') : ('试听「' + name + '」'));
      btn.classList.toggle('is-playing', isPlaying);
      // 无音频按钮由 render 固定 disabled，此处不覆盖
      if (btn.getAttribute('data-play-disabled') !== '1') {
        btn.disabled = isBusy;
      }
    }
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
  //  创建 / 编辑 / 删除流程（成功统一重拉列表，不做本地乐观更新）
  // ═══════════════════════════════════════════════════════════════════

  function openCreateModal() {
    openPageModal({
      title: '创建声音',
      content: voiceFormHtml(null),
      confirmText: '创建',
      confirmClass: 'yj-btn yj-btn-primary',
      onConfirm: function () {
        if (formBusy) return false;
        submitCreate();
        return false;
      }
    });
  }

  function openEditModal(item) {
    openPageModal({
      title: '编辑声音',
      content: voiceFormHtml(item),
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
   * 创建/编辑共用表单。
   * voice_key（Provider 音色 ID）必填文本输入；无 Provider 清单 API，首版不接浏览。
   * sampleAudioUrl 以 URL 文本提供（无音频上传工具）。
   */
  function voiceFormHtml(item) {
    var isEdit = !!item;
    var genders = ['unknown', 'male', 'female'];
    var options = '';
    for (var i = 0; i < genders.length; i++) {
      var g = genders[i];
      var selected = (isEdit && item.gender === g) ? ' selected' : '';
      options += '<option value="' + g + '"' + selected + '>' + genderLabel(g) + '</option>';
    }
    return '' +
      '<div class="studio-form">' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="vcName">名称<span class="studio-form__required"> *</span></label>' +
          '<input id="vcName" type="text" class="studio-form__input" value="' + (isEdit ? escapeHtml(item.name || '') : '') + '" placeholder="给音色起个名字" autocomplete="off" />' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="vcVoiceKey">Provider 音色 ID<span class="studio-form__required"> *</span></label>' +
          '<input id="vcVoiceKey" type="text" class="studio-form__input" value="' + (isEdit ? escapeHtml(item.voiceKey || '') : '') + '" placeholder="填写 Provider 音色 ID" autocomplete="off" />' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="vcGender">性别</label>' +
          '<select id="vcGender" class="studio-form__select">' + options + '</select>' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="vcLanguage">语言</label>' +
          '<input id="vcLanguage" type="text" class="studio-form__input" value="' + (isEdit ? escapeHtml(item.language || '') : '') + '" placeholder="选填，如 zh-CN" autocomplete="off" />' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="vcSampleUrl">试听音频 URL</label>' +
          '<input id="vcSampleUrl" type="text" class="studio-form__input" value="' + (isEdit ? escapeHtml(item.sampleAudioUrl || '') : '') + '" placeholder="选填，试听音频直链地址" autocomplete="off" />' +
        '</div>' +
        '<div class="studio-form__field">' +
          '<label class="studio-form__label" for="vcDesc">描述</label>' +
          '<textarea id="vcDesc" class="studio-form__textarea" rows="2" placeholder="选填，一句话介绍音色">' + (isEdit ? escapeHtml(item.description || '') : '') + '</textarea>' +
        '</div>' +
      '</div>';
  }

  function submitCreate() {
    var name = fieldValue('vcName').trim();
    var voiceKey = fieldValue('vcVoiceKey').trim();
    if (!name) { if (toast.warning) toast.warning('请填写音色名称'); return; }
    if (!voiceKey) { if (toast.warning) toast.warning('请填写 Provider 音色 ID'); return; }

    formBusy = true;
    setConfirmLoading(true);

    api.voice.create({
      name: name,
      voiceKey: voiceKey,
      gender: fieldValue('vcGender'),
      language: fieldValue('vcLanguage').trim() || undefined,
      sampleAudioUrl: fieldValue('vcSampleUrl').trim() || undefined,
      description: fieldValue('vcDesc').trim() || undefined
    }).then(function () {
      if (toast.success) toast.success('声音已创建');
      modal.close();
      refreshMine();
    }).catch(function (err) {
      if (toast.error) toast.error(errorMessage(err, '创建失败，请重试'));
      formBusy = false;
      setConfirmLoading(false);
    });
  }

  function submitEdit(item) {
    var name = fieldValue('vcName').trim();
    var voiceKey = fieldValue('vcVoiceKey').trim();
    if (!name) { if (toast.warning) toast.warning('请填写音色名称'); return; }
    if (!voiceKey) { if (toast.warning) toast.warning('请填写 Provider 音色 ID'); return; }

    formBusy = true;
    setConfirmLoading(true);

    api.voice.update(item.id, {
      name: name,
      voiceKey: voiceKey,
      gender: fieldValue('vcGender'),
      language: fieldValue('vcLanguage').trim() || undefined,
      sampleAudioUrl: fieldValue('vcSampleUrl').trim() || undefined,
      description: fieldValue('vcDesc').trim() || undefined
    }).then(function () {
      if (toast.success) toast.success('已保存修改');
      modal.close();
      refreshMine();
    }).catch(function (err) {
      if (toast.error) toast.error(errorMessage(err, '保存失败，请重试'));
      formBusy = false;
      setConfirmLoading(false);
    });
  }

  function confirmDelete(item) {
    openPageModal({
      title: '删除声音',
      content: '<p class="studio-confirm-text">确定要删除音色「' + escapeHtml(item.name || '未命名') + '」吗？删除后不可恢复。</p>',
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

    api.voice.remove(item.id).then(function () {
      if (toast.success) toast.success('声音已删除');
      modal.close();
      refreshMine();
    }).catch(function (err) {
      if (toast.error) toast.error(errorMessage(err, '删除失败，请重试'));
      formBusy = false;
      setConfirmLoading(false);
    });
  }

  function refreshMine() {
    formBusy = false;
    if (typeof state.load.voicesMine === 'function') {
      state.load.voicesMine().then(function () { if (activeTab === TABS.MINE) renderView(); });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  tab / 工具栏
  // ═══════════════════════════════════════════════════════════════════

  function setTab(tab) {
    if (tab === activeTab) return;
    stopPlayback();
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

  /** 创建入口仅在「我的」tab 可见（音色库只读） */
  function syncToolbar() {
    if (els.createAction) {
      els.createAction.style.display = (activeTab === TABS.MINE) ? '' : 'none';
    }
  }

  function cacheEls() {
    els.root = document.querySelector('#studio-main .studio-page');
    els.content = document.querySelector('#studio-main .studio-voices__content');
    els.tabs = document.querySelectorAll('#studio-main .studio-tab');
    els.createAction = document.querySelector('#studio-main .studio-page__actions');
    els.createButton = document.querySelector('#studio-main [data-action="create"]');
  }

  function bindEvents() {
    var tabs = els.tabs || [];
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        setTab(this.getAttribute('data-tab'));
      });
    }
    if (els.createButton) {
      els.createButton.addEventListener('click', openCreateModal);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  生命周期（render 纯字符串 / init 绑定+建 audio+触发加载 / destroy 清理）
  // ═══════════════════════════════════════════════════════════════════

  function render(params) {
    return '' +
      '<div class="studio-page">' +
        '<div class="studio-page__header">' +
          '<h1 class="yj-page-title">声音中心</h1>' +
          '<p class="yj-page-subtitle">浏览系统音色，或创建你自己的声音</p>' +
        '</div>' +
        '<div class="studio-page__toolbar">' +
          '<div class="studio-tabs" role="tablist" aria-label="声音分类">' +
            '<button type="button" class="studio-tab is-active" role="tab" aria-selected="true" data-tab="library">音色库</button>' +
            '<button type="button" class="studio-tab" role="tab" aria-selected="false" data-tab="mine">我的声音</button>' +
          '</div>' +
          '<div class="studio-page__actions">' +
            '<button type="button" class="yj-btn yj-btn-primary" data-action="create">' +
              '<i class="fas fa-plus" aria-hidden="true"></i>' +
              '<span>创建声音</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="studio-voices__content"></div>' +
      '</div>';
  }

  function init(params) {
    activeTab = TABS.LIBRARY;
    playingId = null;
    audioState = 'idle';
    cacheEls();
    bindEvents();
    setupAudio();
    syncToolbar();
    ensureLoaded(TABS.LIBRARY);
    renderView();
  }

  function destroy() {
    // 页面 DOM 由 router 整体替换，节点级监听随 DOM 释放；此处清 audio + 闭包瞬时态
    if (audio) {
      try { audio.pause(); } catch (e) {}
      try { audio.removeAttribute('src'); audio.load(); } catch (e) {}
      audio = null;
    }
    playingId = null;
    audioState = 'idle';
    els = {};
    activeTab = TABS.LIBRARY;
    formBusy = false;
  }

  YJ.studio.pages.voices = {
    render: render,
    init: init,
    destroy: destroy
  };

  window.YJ = YJ;
})();
