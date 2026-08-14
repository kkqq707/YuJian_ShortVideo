/**
 * YuJian Studio — Create Page
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D4
 *
 * 职责：新建口播页面（组装层）—— 回显已选 Avatar/Voice，填写口播信息，提交启动数字人流水线。
 *   - Avatar 摘要回显（已选 → 缩略图 + 名称 + 更换；未选 → 空态引导去 #/avatars）
 *   - Voice 摘要回显（已选 → 名称 + 更换；未选 → 「将使用默认音色」+ 去 #/voices）
 *   - 表单：productName / theme / style / resolution / duration（imageUrl 由 selection.avatar 提供）
 *   - 提交：api.pipeline.execute → 成功写 task 快照 + resetSelection + 跳 #/tasks/:id
 *
 * 数据边界（严格遵守，违规即返工）：
 *   ❌ 不直接 fetch / 不拼 URL / 不自己 catch 映射文案（一切经 api + state）
 *   ❌ 不写 cache 内部字段（本页不消费 cache）
 *   ❌ 不消费 selection.script（Create v1 不接脚本：保留但不用，禁新增 script_id 字段）
 *   ❌ 不新增组件 / state / API / createCache（复用 state.selection/task + api.pipeline.execute）
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

  // 风格偏好（对齐 pipeline 契约：marketing | storytelling | professional | casual）
  var STYLE_OPTIONS = [
    { value: 'marketing', label: '营销' },
    { value: 'storytelling', label: '故事叙述' },
    { value: 'professional', label: '专业' },
    { value: 'casual', label: '轻松' }
  ];

  // 分辨率（对齐 pipeline 契约：720P | 1080P）
  var RESOLUTION_OPTIONS = ['720P', '1080P'];

  // ── 页面闭包瞬时状态（destroy 释放，不写 state）──
  var els = {};

  // ═══════════════════════════════════════════════════════════════════
  //  工具函数
  // ═══════════════════════════════════════════════════════════════════

  function navigate(route) {
    if (router && typeof router.navigate === 'function') router.navigate(route);
  }

  function selection() {
    return (state.get && state.get()) ? state.get().selection : {};
  }

  function currentTask() {
    return (state.get && state.get()) ? state.get().task : null;
  }

  function selectedAvatar() {
    return selection().avatar || null;
  }

  function selectedVoice() {
    return selection().voice || null;
  }

  function avatarImageUrl() {
    var a = selectedAvatar();
    return (a && a.imageUrl) ? a.imageUrl : '';
  }

  /** 错误信息：优先 friendlyMessage（api 归一化），回退 message，再回退默认 */
  function errorMessage(err, fallback) {
    if (!err) return fallback;
    if (err.friendlyMessage) return err.friendlyMessage;
    if (err.message) return err.message;
    return fallback;
  }

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  /** 可选文本：空串 → undefined（后端走默认） */
  function optionalText(value) {
    value = (value == null) ? '' : String(value).trim();
    return value === '' ? undefined : value;
  }

  /** 可选数字：空/非法 → undefined（后端走默认） */
  function optionalNumber(value) {
    if (value == null || String(value).trim() === '') return undefined;
    var n = parseInt(value, 10);
    return isNaN(n) ? undefined : n;
  }

  function iconButton(label, icon, ariaLabel, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yj-btn yj-btn-secondary';
    btn.setAttribute('aria-label', ariaLabel || label);
    var iconEl = document.createElement('i');
    iconEl.className = 'fas ' + icon;
    iconEl.setAttribute('aria-hidden', 'true');
    var textEl = document.createElement('span');
    textEl.textContent = label;
    btn.appendChild(iconEl);
    btn.appendChild(textEl);
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Avatar / Voice 摘要回显（读 state.selection，DOM 构建，textContent 防注入）
  // ═══════════════════════════════════════════════════════════════════

  function renderAvatarSummary() {
    var container = els.avatar;
    if (!container) return;

    var avatar = selectedAvatar();
    var url = avatarImageUrl();

    // 未选择 / 无图 → 空态引导（必选项，引导去 #/avatars）
    if (!avatar || !url) {
      if (components.emptyState) {
        components.emptyState.render({
          container: container,
          title: '尚未选择数字人形象',
          description: '选择或上传一个数字人形象，才能生成口播视频。',
          icon: 'fa-user',
          action: { label: '选择数字人形象', onClick: function () { navigate('#/avatars'); } }
        });
      }
      return;
    }

    // 已选 → 摘要卡（缩略图 + 名称 + 更换）
    var card = document.createElement('div');
    card.className = 'yj-card studio-create__avatar-card';

    var media = document.createElement('div');
    media.className = 'studio-create__avatar-media';
    var img = document.createElement('img');
    img.className = 'studio-create__avatar-image';
    img.src = url;
    img.alt = avatar.name || '数字人形象';
    media.appendChild(img);
    card.appendChild(media);

    var body = document.createElement('div');
    body.className = 'studio-create__avatar-body';
    var title = document.createElement('div');
    title.className = 'studio-create__avatar-title';
    title.textContent = avatar.name || '未命名数字人';
    body.appendChild(title);
    card.appendChild(body);

    var change = iconButton('更换', 'fa-repeat', '更换数字人形象', function () { navigate('#/avatars'); });
    change.className += ' studio-create__avatar-change';
    card.appendChild(change);

    container.innerHTML = '';
    container.appendChild(card);
  }

  function renderVoiceSummary() {
    var container = els.voice;
    if (!container) return;

    var voice = selectedVoice();
    var hasVoice = !!(voice && voice.name);

    var card = document.createElement('div');
    card.className = 'yj-card studio-create__voice-card';

    var iconWrap = document.createElement('span');
    iconWrap.className = 'studio-create__voice-icon';
    iconWrap.setAttribute('aria-hidden', 'true');
    var iconEl = document.createElement('i');
    iconEl.className = 'fas fa-microphone';
    iconWrap.appendChild(iconEl);
    card.appendChild(iconWrap);

    var body = document.createElement('div');
    body.className = 'studio-create__voice-body';
    var title = document.createElement('div');
    title.className = 'studio-create__voice-title';
    title.textContent = hasVoice ? voice.name : '未选择音色';
    body.appendChild(title);
    var hint = document.createElement('div');
    hint.className = 'studio-create__voice-hint';
    hint.textContent = hasVoice ? '将使用该音色配音' : '将使用后端默认音色';
    body.appendChild(hint);
    card.appendChild(body);

    var action = iconButton(
      hasVoice ? '更换' : '选择音色',
      hasVoice ? 'fa-repeat' : 'fa-plus',
      hasVoice ? '更换配音音色' : '选择配音音色',
      function () { navigate('#/voices'); }
    );
    action.className += ' studio-create__voice-action';
    card.appendChild(action);

    container.innerHTML = '';
    container.appendChild(card);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  表单选项（对齐 pipeline 契约枚举）
  // ═══════════════════════════════════════════════════════════════════

  function styleOptionsHtml() {
    var html = '<option value="">自动（默认）</option>';
    for (var i = 0; i < STYLE_OPTIONS.length; i++) {
      html += '<option value="' + STYLE_OPTIONS[i].value + '">' + STYLE_OPTIONS[i].label + '</option>';
    }
    return html;
  }

  function resolutionOptionsHtml() {
    var html = '<option value="">自动（默认）</option>';
    for (var i = 0; i < RESOLUTION_OPTIONS.length; i++) {
      html += '<option value="' + RESOLUTION_OPTIONS[i] + '">' + RESOLUTION_OPTIONS[i] + '</option>';
    }
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  提交（唯一入口 api.pipeline.execute；成功写 task + resetSelection + 跳转）
  // ═══════════════════════════════════════════════════════════════════

  function onSubmit() {
    var task = currentTask();
    if (task && task.isSubmitting) return; // 防重复提交

    // 提交校验：imageUrl 必须存在（其余字段均后端可默认）
    var imageUrl = avatarImageUrl();
    if (!imageUrl) {
      if (toast.warning) toast.warning('请先选择数字人形象');
      renderAvatarSummary(); // 刷新空态引导
      return;
    }

    var voice = selectedVoice();

    var body = {
      imageUrl: imageUrl,
      theme: optionalText(fieldValue('createTheme')),
      style: optionalText(fieldValue('createStyle')),
      resolution: optionalText(fieldValue('createResolution')),
      duration: optionalNumber(fieldValue('createDuration')),
      productName: optionalText(fieldValue('createProductName'))
    };
    if (voice && voice.id != null) body.voiceId = voice.id;

    if (task) task.isSubmitting = true;
    setSubmitLoading(true);

    api.pipeline.execute(body).then(function (result) {
      result = result || {};
      if (task) {
        task.pipelineId = result.pipelineId != null ? result.pipelineId : null;
        task.pipelineUuid = result.pipelineUuid != null ? result.pipelineUuid : null;
        task.status = result.status != null ? result.status : null;
        task.isSubmitting = false;
      }
      // 提交成功后：先清选择，再跳任务详情
      if (typeof state.resetSelection === 'function') state.resetSelection();
      navigate('#/tasks/' + result.pipelineId);
    }).catch(function (err) {
      if (task) task.isSubmitting = false;
      setSubmitLoading(false);
      if (toast.error) toast.error(errorMessage(err, '提交失败，请重试'));
    });
  }

  function setSubmitLoading(loading) {
    if (!els.submit) return;
    els.submit.disabled = loading;
    if (loading) {
      els.submit.classList.add('yj-btn-loading');
    } else {
      els.submit.classList.remove('yj-btn-loading');
    }
    var span = els.submit.querySelector('span');
    if (span) span.textContent = loading ? '提交中…' : '生成口播';
  }

  function syncSubmit() {
    var task = currentTask();
    setSubmitLoading(!!(task && task.isSubmitting));
  }

  // ═══════════════════════════════════════════════════════════════════
  //  生命周期（render 纯字符串 / init 回显+绑定 / destroy 释放闭包态）
  // ═══════════════════════════════════════════════════════════════════

  function render(params) {
    return '' +
      '<div class="studio-page studio-create">' +
        '<div class="studio-page__header">' +
          '<h1 class="yj-page-title">新建口播</h1>' +
          '<p class="yj-page-subtitle">选择数字人形象与音色，填写口播信息后提交生成</p>' +
        '</div>' +

        '<section class="studio-create__section">' +
          '<div class="studio-create__section-head">' +
            '<h2 class="studio-create__section-title">数字人形象</h2>' +
            '<span class="studio-create__section-hint">必选</span>' +
          '</div>' +
          '<div class="studio-create__avatar"></div>' +
        '</section>' +

        '<section class="studio-create__section">' +
          '<div class="studio-create__section-head">' +
            '<h2 class="studio-create__section-title">配音音色</h2>' +
            '<span class="studio-create__section-hint">可选</span>' +
          '</div>' +
          '<div class="studio-create__voice"></div>' +
        '</section>' +

        '<section class="studio-create__section">' +
          '<div class="studio-create__section-head">' +
            '<h2 class="studio-create__section-title">口播信息</h2>' +
          '</div>' +
          '<form class="studio-form studio-create__form" id="studio-create-form" novalidate>' +
            '<div class="studio-form__field">' +
              '<label class="studio-form__label" for="createProductName">产品名称</label>' +
              '<input id="createProductName" type="text" class="studio-form__input" placeholder="选填，如：YuJian 智能手表" autocomplete="off" />' +
            '</div>' +
            '<div class="studio-form__field">' +
              '<label class="studio-form__label" for="createTheme">口播主题</label>' +
              '<input id="createTheme" type="text" class="studio-form__input" placeholder="选填，如：介绍一款新上市的智能手表" autocomplete="off" />' +
            '</div>' +
            '<div class="studio-form__field">' +
              '<label class="studio-form__label" for="createStyle">风格偏好</label>' +
              '<select id="createStyle" class="studio-form__select">' + styleOptionsHtml() + '</select>' +
            '</div>' +
            '<div class="studio-form__field">' +
              '<label class="studio-form__label" for="createResolution">分辨率</label>' +
              '<select id="createResolution" class="studio-form__select">' + resolutionOptionsHtml() + '</select>' +
            '</div>' +
            '<div class="studio-form__field">' +
              '<label class="studio-form__label" for="createDuration">时长（秒）</label>' +
              '<input id="createDuration" type="number" class="studio-form__input" min="1" max="300" step="1" placeholder="选填，如 30" />' +
            '</div>' +
            '<div class="studio-create__submit">' +
              '<button type="submit" class="yj-btn yj-btn-primary yj-btn-lg studio-create__submit-btn" id="studio-create-submit">' +
                '<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>' +
                '<span>生成口播</span>' +
              '</button>' +
            '</div>' +
          '</form>' +
        '</section>' +
      '</div>';
  }

  function init(params) {
    cacheEls();
    bindEvents();
    renderAvatarSummary();
    renderVoiceSummary();
    syncSubmit();
  }

  function destroy() {
    // 页面 DOM 由 router 整体替换，节点级监听随 DOM 释放；此处仅清引用与闭包瞬时态
    els = {};
  }

  function cacheEls() {
    els.avatar = document.querySelector('#studio-main .studio-create__avatar');
    els.voice = document.querySelector('#studio-main .studio-create__voice');
    els.form = document.getElementById('studio-create-form');
    els.submit = document.getElementById('studio-create-submit');
  }

  function bindEvents() {
    if (els.form) {
      els.form.addEventListener('submit', function (e) {
        e.preventDefault();
        onSubmit();
      });
    }
  }

  YJ.studio.pages.create = {
    render: render,
    init: init,
    destroy: destroy
  };

  window.YJ = YJ;
})();
