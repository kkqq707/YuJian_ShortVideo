/**
 * YuJian Studio — State
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D3-B
 *
 * 职责（Studio 业务状态唯一数据源，唯一入口 YJ.studio.state）：
 *   1. 拥有 selection / task / cache 三块业务状态
 *   2. user / route 不复制，只读委托 YuJianAuth / YJ.studio.router
 *   3. 写 cache 的唯一入口是 load.* helper（内部调 YJ.studio.api，成功后写 cache）
 *
 * 边界（严格遵守，违规即返工）：
 *   ❌ 页面直接修改 cache 内部字段（cache 只经 load.* 写入）
 *   ❌ 复制 user / route（保持既有单源，只提供只读委托 getUser / getRoute）
 *   ❌ 详情轮询（Pipeline 详情复用 YJ.state.pipeline，task 只存提交结果快照）
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var api = (window.YJ && window.YJ.studio && window.YJ.studio.api) || {};

  // ═══════════════════════════════════════════════════════════════════
  //  缓存块默认形状（唯一默认值来源，reset 复用）
  // ═══════════════════════════════════════════════════════════════════

  function officialAvatarBlock() {
    return { items: [], page: 1, total: 0, isLoading: false, loadError: null };
  }

  function mineAvatarBlock() {
    return { items: [], page: 1, total: 0, isLoading: false, loadError: null, isUploading: false };
  }

  function voiceLibraryBlock() {
    return { items: [], page: 1, total: 0, isLoading: false, loadError: null, filter: { gender: null } };
  }

  function voiceMineBlock() {
    return { items: [], page: 1, total: 0, isLoading: false, loadError: null, isUploading: false };
  }

  function scriptMineBlock() {
    return { items: [], page: 1, total: 0, isLoading: false, loadError: null, filter: { sourceType: null } };
  }

  function pipelineBlock() {
    return { items: [], page: 1, total: 0, isLoading: false, loadError: null, filter: { status: null } };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  State 单一数据源
  // ═══════════════════════════════════════════════════════════════════

  var state = {
    // ── selection：跨页选择（页面显式赋值选择卡；不经 URL / localStorage）──
    selection: {
      avatar: null,
      voice: null,
      script: null
    },

    // ── task：当前生成任务（仅「提交结果」快照，不承载详情轮询）──
    task: {
      pipelineId: null,
      pipelineUuid: null,
      status: null,
      progress: 0,
      isSubmitting: false,
      error: null
    },

    // ── cache：页面数据缓存（列表 + 分页 + 加载态 + 错误态）──
    cache: {
      avatars: {
        official: officialAvatarBlock(),
        mine: mineAvatarBlock()
      },
      voices: {
        library: voiceLibraryBlock(),
        mine: voiceMineBlock()
      },
      scripts: {
        mine: scriptMineBlock()
      },
      pipelines: pipelineBlock()
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  通用 accessor（少量，够用）
  // ═══════════════════════════════════════════════════════════════════

  /** 只读引用（页面渲染读） */
  function get() {
    return state;
  }

  /** 只读委托：user 不复制，直接读 YuJianAuth */
  function getUser() {
    return (window.YuJianAuth && typeof YuJianAuth.getUserInfo === 'function')
      ? YuJianAuth.getUserInfo()
      : null;
  }

  /** 只读委托：route 不复制，直接读 router */
  function getRoute() {
    return (window.YJ && window.YJ.studio && window.YJ.studio.router &&
            typeof window.YJ.studio.router.getCurrent === 'function')
      ? window.YJ.studio.router.getCurrent()
      : null;
  }

  function resetSelection() {
    state.selection.avatar = null;
    state.selection.voice = null;
    state.selection.script = null;
  }

  function resetTask() {
    state.task.pipelineId = null;
    state.task.pipelineUuid = null;
    state.task.status = null;
    state.task.progress = 0;
    state.task.isSubmitting = false;
    state.task.error = null;
  }

  /**
   * 清指定缓存块。domain: avatars|voices|scripts|pipelines；
   * sub（avatars: official|mine，voices: library|mine）。无 domain 则全清。
   */
  function resetCache(domain, sub) {
    if (domain === 'avatars') {
      if (sub === 'official' || sub === undefined) state.cache.avatars.official = officialAvatarBlock();
      if (sub === 'mine' || sub === undefined) state.cache.avatars.mine = mineAvatarBlock();
    } else if (domain === 'voices') {
      if (sub === 'library' || sub === undefined) state.cache.voices.library = voiceLibraryBlock();
      if (sub === 'mine' || sub === undefined) state.cache.voices.mine = voiceMineBlock();
    } else if (domain === 'scripts') {
      state.cache.scripts.mine = scriptMineBlock();
    } else if (domain === 'pipelines') {
      state.cache.pipelines = pipelineBlock();
    } else {
      resetCache('avatars');
      resetCache('voices');
      resetCache('scripts');
      resetCache('pipelines');
    }
  }

  /** 退出/跳转时全清 */
  function resetAll() {
    resetSelection();
    resetTask();
    resetCache();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  load.* helper（唯一「调 api + 写 cache」的地方）
  //  规则：仅 api 成功后写 items/page/total；失败写 loadError，不 reject。
  // ═══════════════════════════════════════════════════════════════════

  function loadAvatarsOfficial(params) {
    params = params || {};
    var block = state.cache.avatars.official;
    block.isLoading = true;
    block.loadError = null;

    return api.avatar.list({ source: 'official', page: params.page, pageSize: params.pageSize })
      .then(function (result) {
        block.items = result.items;
        block.page = result.page;
        block.total = result.total;
        block.isLoading = false;
        return result;
      })
      .catch(function (err) {
        block.loadError = err || null;
        block.isLoading = false;
        return null;
      });
  }

  function loadAvatarsMine(params) {
    params = params || {};
    var block = state.cache.avatars.mine;
    block.isLoading = true;
    block.loadError = null;

    return api.avatar.list({ source: 'uploaded', page: params.page, pageSize: params.pageSize })
      .then(function (result) {
        block.items = result.items;
        block.page = result.page;
        block.total = result.total;
        block.isLoading = false;
        return result;
      })
      .catch(function (err) {
        block.loadError = err || null;
        block.isLoading = false;
        return null;
      });
  }

  function loadVoicesLibrary(params) {
    params = params || {};
    var block = state.cache.voices.library;
    block.isLoading = true;
    block.loadError = null;

    return api.voice.list({
      source: 'system',
      gender: params.gender,
      page: params.page,
      pageSize: params.pageSize
    })
      .then(function (result) {
        block.items = result.items;
        block.page = result.page;
        block.total = result.total;
        block.isLoading = false;
        return result;
      })
      .catch(function (err) {
        block.loadError = err || null;
        block.isLoading = false;
        return null;
      });
  }

  function loadVoicesMine(params) {
    params = params || {};
    var block = state.cache.voices.mine;
    block.isLoading = true;
    block.loadError = null;

    return api.voice.list({ source: 'custom', page: params.page, pageSize: params.pageSize })
      .then(function (result) {
        block.items = result.items;
        block.page = result.page;
        block.total = result.total;
        block.isLoading = false;
        return result;
      })
      .catch(function (err) {
        block.loadError = err || null;
        block.isLoading = false;
        return null;
      });
  }

  function loadScriptsMine(params) {
    params = params || {};
    var block = state.cache.scripts.mine;
    block.isLoading = true;
    block.loadError = null;

    return api.script.list({ sourceType: params.sourceType, page: params.page, pageSize: params.pageSize })
      .then(function (result) {
        block.items = result.items;
        block.page = result.page;
        block.total = result.total;
        block.isLoading = false;
        return result;
      })
      .catch(function (err) {
        block.loadError = err || null;
        block.isLoading = false;
        return null;
      });
  }

  function loadPipelines(params) {
    params = params || {};
    var block = state.cache.pipelines;
    block.isLoading = true;
    block.loadError = null;

    return api.pipeline.list({ status: params.status, page: params.page, pageSize: params.pageSize })
      .then(function (result) {
        block.items = result.items;
        block.page = result.page;
        block.total = result.total;
        block.isLoading = false;
        return result;
      })
      .catch(function (err) {
        block.loadError = err || null;
        block.isLoading = false;
        return null;
      });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  暴露到全局（仅挂载 YJ.studio.state，不新增顶层全局）
  // ═══════════════════════════════════════════════════════════════════

  state.get = get;
  state.getUser = getUser;
  state.getRoute = getRoute;
  state.resetSelection = resetSelection;
  state.resetTask = resetTask;
  state.resetCache = resetCache;
  state.resetAll = resetAll;
  state.load = {
    avatarsOfficial: loadAvatarsOfficial,
    avatarsMine: loadAvatarsMine,
    voicesLibrary: loadVoicesLibrary,
    voicesMine: loadVoicesMine,
    scriptsMine: loadScriptsMine,
    pipelines: loadPipelines
  };

  var YJ = window.YJ || {};
  if (!YJ.studio) YJ.studio = {};
  YJ.studio.state = state;
  window.YJ = YJ;

  console.log('[Studio/State] Studio state initialized (Phase DigitalHuman-Rebuild-004 Step5-D3-B)');
})();
