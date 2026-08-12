/**
 * YuJian Enterprise — Unified Application State
 *
 * Sprint 4.5: 统一管理所有全局状态，禁止多个变量重复保存当前 Asset
 *
 * 使用方式：
 *   YJ.state.assets.currentPage
 *   YJ.state.setCurrentAsset(asset)
 *   YJ.state.getCurrentAsset()
 */

(function () {
  'use strict';

  // ─── Page State Constants ──────────────────────────────────
  var PAGE_STATE = {
    LOADING: 'loading',
    SUCCESS: 'success',
    EMPTY: 'empty',
    ERROR: 'error'
  };

  // ─── Type Mappings ────────────────────────────────────────
  var TYPE_MAP = {
    'image': '图片',
    'video': '视频',
    'audio': '音频',
    'other': '其他'
  };

  var ICONS = {
    'image': 'fa-image',
    'video': 'fa-video',
    'audio': 'fa-music',
    'other': 'fa-file'
  };

  var TYPE_BADGES = {
    'image': 'IMG',
    'video': 'MP4',
    'audio': 'MP3',
    'other': 'FILE'
  };

  // ─── Unified Application State ────────────────────────────
  var APP_STATE = {
    // ── Asset List State ─────────────────────────────────
    assets: {
      currentPage: 1,
      total: 0,
      pageSize: 24,
      items: [],
      currentType: '',
      currentKeyword: '',
      currentSort: 'newest',
      currentStatus: '',
      isLoading: false,
      searchTimer: null,
      pageState: 'loading',
      errorMessage: '',
      cache: {}  // Asset cache to avoid duplicate API queries
    },

    // ── Current Selections ───────────────────────────────
    // Sprint 4.5: 统一管理当前Asset，禁止多个全局变量重复保存
    currentAsset: null,         // Currently viewed asset (detail modal)
    currentPreviewAsset: null,  // Currently previewed asset (image preview)
    currentGenerationAsset: null, // Currently selected asset for generation
    selectedAsset: null,        // Phase 2-D-4.6: Asset selected for sending to editor

    // ── Generation Panel State ───────────────────────────
    generation: {
      assetId: null,
      sourceAssetId: null,
      sourceAsset: null,
      currentAsset: null,
      isSubmitting: false,
      currentTaskId: null,
      pollTimer: null,
      selectedTemplate: 'image_to_video',
      selectedOutput: 'video'
    },

    // ── AI Creation Center State (Phase 2-C-1-A) ─────────
    // 统一 Studio 创作状态，与 STUDIO_STATE / generation 并行存在
    // 后续逐步将 Studio inline 代码迁移到此处
    aiCreation: {
      creationType: 'image2video',  // imageGen | image2video | text2video | ref2video
      selectedFile: null,           // 用户上传的 File 对象
      previewUrl: null,             // 本地预览 ObjectURL
      uploadedImageUrl: null,       // OSS 上传后的 URL
      assetId: null,                // 资产记录 ID
      selectedAsset: null,          // 选中的资产对象
      sourceMode: 'upload',         // 'upload' | 'asset'
      currentTaskId: null,          // 当前任务 ID
      isUploading: false,           // 上传中标志
      isGenerating: false,          // 生成中标志
      // Phase 2-C-1-D: 文生视频专用字段
      textPrompt: '',               // 文生视频提示词
      negativePrompt: '',           // Phase UI-AICreation-07-C: 负向提示词
      // Phase 2-C-2-4-C-3-1: ref2video 状态字段
      ref2videoPrompt: '',          // 参考生视频描述
      referenceSubjects: [],        // 参考主体列表
      referenceImages: [],          // 参考图片列表
      // Phase 2-C-1-C: 统一图生视频参数（保留兼容，新代码优先读写 per-mode namespaces）
      params: {
        aspectRatio: '16:9',        // 画面比例: 16:9 | 9:16 | 1:1
        duration: 5,                // 视频时长: 5 | 10
        motionStrength: 'medium',   // 动态强度: low | medium | high
        cameraMovement: 'static',   // 运镜方式: static | push | zoom | orbit
        quality: 'standard',        // 画质: standard | high
        // Phase UI-AICreation-02-B-1-E-B-2: imageGen 参数
        style: 'realistic'         // 图片风格: realistic | cartoon | ink | cyberpunk
      },

      // ═══════════════════════════════════════════════════════
      // Phase UI-AICreation-02-B-2.2-A: Per-Mode Namespaces
      // 四个独立的创作模式命名空间，实现状态隔离
      // 旧扁平字段保留兼容，模式切换时通过 save/restore 同步
      // ═══════════════════════════════════════════════════════

      text2video: {
        prompt: '',                    // 文生视频提示词
        negativePrompt: '',            // Phase UI-AICreation-07-C: 负向提示词
        params: {
          aspectRatio: '16:9',
          duration: 5,
          motionStrength: 'medium',
          cameraMovement: 'static',
          quality: 'standard'
        }
      },

      image2video: {
        prompt: '',                    // 图生视频提示词
        selectedFile: null,           // 用户上传的 File 对象
        previewUrl: null,             // 本地预览 ObjectURL
        uploadedImageUrl: null,       // OSS 上传后的 URL
        assetId: null,                // 资产记录 ID
        selectedAsset: null,          // 选中的资产对象
        sourceMode: 'upload',         // 'upload' | 'asset'
        params: {
          aspectRatio: '16:9',
          duration: 5,
          motionStrength: 'medium',
          cameraMovement: 'static',
          quality: 'standard'
        }
      },

      ref2video: {
        prompt: '',                    // 参考生视频描述
        referenceSubjects: [],         // 参考主体列表
        referenceImages: [],           // 参考图片列表
        params: {
          aspectRatio: '16:9',
          duration: 5,
          motionStrength: 'medium',
          cameraMovement: 'static',
          quality: 'standard'
        }
      },

      imageGen: {
        prompt: '',                    // 文生图提示词
        params: {
          aspectRatio: '16:9',         // 画面比例
          style: 'realistic',          // 图片风格: realistic | cartoon | ink | cyberpunk
          count: 4                     // 生成数量: 1 | 4 | 9
        }
      }
    },

    // ── Works State ──────────────────────────────────────
    works: {
      currentPage: 1,
      pageSize: 20,
      total: 0
    },

    // ── Task Type Mapping ────────────────────────────────
    TASKTYPE_MAP: {
      'text_to_video': '文生视频',
      'image_to_video': '图生视频',
      'image_generation': '图片生成',
      'image_edit': '图片编辑',
      'ref_to_video': '参考生视频',
      'digital_human': '数字人',
      'storyboard': '故事板'
    },

    // ── Works Status Mapping ─────────────────────────────
    WORKS_STATUS_MAP: {
      'success': '已完成',
      'processing': '处理中',
      'pending': '等待中',
      'failed': '失败',
      'draft': '草稿'
    },

    // ── AI Model Registry Data (Phase 2-C-2-3-A) ─────────
    // 从 Registry API 获取的 template / model / capability 数据
    // 前端统一数据源，禁止各模块重复定义模型映射
    aiModels: {
      templates: [],          // 全部 template: [{templateId, name, description, icon, sort, capability, defaultModelId, model}]
      models: {},             // modelId → modelConfig 快速查找
      capabilities: [],       // 全部 capability: [{capability, label, modelCount}]
      // 派生映射表（运行时自动构建）
      templateToModel: {},    // templateId → modelId
      capabilityToModels: {}, // capability → modelId[]
      modelToTemplate: {},    // modelId → templateId
      // 加载状态
      isLoaded: false,
      isLoading: false,
      error: null,
      lastFetchTime: null
    },

    // ── Digital Human State (Phase 2-C-2-4-B-2-B-1) ──────
    // 数字人模块状态管理
    // modelId / modelConfig 通过 Registry 动态获取，禁止硬编码
    digitalHuman: {
      templateId: 'digital_human',   // 模板标识（系统常量）
      modelId: null,                 // 模型ID — 从 Registry capability=digital_human 动态解析
      modelConfig: null,             // 模型完整配置 — 从 Registry 获取
      imageUrl: null,                // 数字人形象图片URL
      avatarId: null,                // 数字人形象ID
      script: '',                    // 口播文案
      voice: null,                   // 语音配置 — 默认从 Registry 模型配置获取
      speed: 1.0,                    // 语速
      background: '',                // 背景设置
      resolution: null,              // 分辨率 — 默认从 Registry 模型配置获取
      aspectRatio: '16:9',           // 画面比例
      isGenerating: false,           // 是否正在生成
      currentTaskId: null            // 当前任务ID
    },

    // ── Editor State (Phase 2-D-1-B) ─────────────────────
    editor: {
      project: {
        id: null,
        name: '未命名项目',
        createdAt: null,
        updatedAt: null,
        duration: 0,
        resolution: { width: 1920, height: 1080 },
        fps: 30
      },

      mediaBin: {
        items: [],
        selectedIds: [],
        selectedAsset: null  // Phase 2-D-4: 当前选中的素材（用于预览）
      },

      timeline: {
        duration: 0,
        fps: 30,
        resolution: { width: 1920, height: 1080 },
        tracks: [],
        playheadPosition: 0,
        currentTime: 0,
        selectedClipId: null,
        zoom: 1,
        scrollLeft: 0
      },

      preview: {
        isPlaying: false,
        currentTime: 0,
        volume: 1,
        isMuted: false,
        quality: 'preview'
      },

      export: {
        format: 'mp4',
        resolution: { width: 1920, height: 1080 },
        quality: 'high',
        bitrate: 8000,
        fps: 30,
        progress: 0,
        status: 'idle'
      },

      history: {
        past: [],
        future: [],
        maxSteps: 50
      },

      ui: {
        selectedClipId: null,
        selectedTrackId: null,
        isPlaying: false,
        zoom: 1,
        scrollLeft: 0,
        panelOpen: null
      }
    }
  };

  // ─── State Accessors ──────────────────────────────────────

  /** Set the currently viewed asset (detail modal) */
  function setCurrentAsset(asset) {
    APP_STATE.currentAsset = asset;
  }

  /** Get the currently viewed asset */
  function getCurrentAsset() {
    return APP_STATE.currentAsset;
  }

  /** Clear the currently viewed asset */
  function clearCurrentAsset() {
    APP_STATE.currentAsset = null;
  }

  /** Set the currently previewed asset (image preview) */
  function setCurrentPreviewAsset(asset) {
    APP_STATE.currentPreviewAsset = asset;
  }

  /** Get the currently previewed asset */
  function getCurrentPreviewAsset() {
    return APP_STATE.currentPreviewAsset;
  }

  /** Clear the currently previewed asset */
  function clearCurrentPreviewAsset() {
    APP_STATE.currentPreviewAsset = null;
  }

  /** Phase 2-D-4.6: Set asset selected for editor bridge */
  function setSelectedAsset(asset) {
    APP_STATE.selectedAsset = asset;
  }

  /** Phase 2-D-4.6: Get asset selected for editor bridge */
  function getSelectedAsset() {
    return APP_STATE.selectedAsset;
  }

  /** Phase 2-D-4.6: Clear asset selected for editor bridge */
  function clearSelectedAsset() {
    APP_STATE.selectedAsset = null;
  }

  /** Set the currently selected generation asset */
  function setCurrentGenerationAsset(asset) {
    APP_STATE.currentGenerationAsset = asset;
    APP_STATE.generation.currentAsset = asset;
  }

  /** Get the currently selected generation asset */
  function getCurrentGenerationAsset() {
    return APP_STATE.currentGenerationAsset;
  }

  /** Cache an asset by ID */
  function cacheAsset(id, asset) {
    if (id && asset) {
      APP_STATE.assets.cache[id] = asset;
    }
  }

  /** Get cached asset by ID */
  function getCachedAsset(id) {
    return APP_STATE.assets.cache[id] || null;
  }

  /** Get the editor project state */
  function getEditorProject() {
    return APP_STATE.editor.project;
  }

  /** Set the editor project state */
  function setEditorProject(project) {
    APP_STATE.editor.project = Object.assign(APP_STATE.editor.project, project);
  }

  /** Get the editor timeline state */
  function getEditorTimeline() {
    return APP_STATE.editor.timeline;
  }

  /** Reset editor state to defaults */
  function resetEditorState() {
    APP_STATE.editor.project = {
      id: null, name: '未命名项目', createdAt: null, updatedAt: null,
      duration: 0, resolution: { width: 1920, height: 1080 }, fps: 30
    };
    APP_STATE.editor.mediaBin = { items: [], selectedIds: [], selectedAsset: null };
    APP_STATE.editor.timeline = {
      duration: 0, fps: 30, resolution: { width: 1920, height: 1080 },
      tracks: [], playheadPosition: 0, currentTime: 0, selectedClipId: null, zoom: 1, scrollLeft: 0
    };
    APP_STATE.editor.preview = { isPlaying: false, currentTime: 0, volume: 1, isMuted: false, quality: 'preview' };
    APP_STATE.editor.export = { format: 'mp4', resolution: { width: 1920, height: 1080 }, quality: 'high', bitrate: 8000, fps: 30, progress: 0, status: 'idle' };
    APP_STATE.editor.history = { past: [], future: [], maxSteps: 50 };
    APP_STATE.editor.ui = { selectedClipId: null, selectedTrackId: null, isPlaying: false, zoom: 1, scrollLeft: 0, panelOpen: null };
  }

  /** Reset generation panel state */
  function resetGenerationState() {
    APP_STATE.generation.assetId = null;
    APP_STATE.generation.sourceAssetId = null;
    APP_STATE.generation.sourceAsset = null;
    APP_STATE.generation.currentAsset = null;
    APP_STATE.generation.isSubmitting = false;
    APP_STATE.generation.currentTaskId = null;
    if (APP_STATE.generation.pollTimer) {
      clearInterval(APP_STATE.generation.pollTimer);
      APP_STATE.generation.pollTimer = null;
    }
    APP_STATE.currentGenerationAsset = null;
  }

  // ── AI Creation State Accessors (Phase 2-C-1-A) ────────────

  /** Reset AI Creation state to defaults */
  function resetAiCreationState() {
    var ac = APP_STATE.aiCreation;
    // Revoke preview URL if present
    if (ac.previewUrl) {
      try { URL.revokeObjectURL(ac.previewUrl); } catch (e) { /* ignore */ }
    }
    ac.creationType = 'image2video';
    ac.selectedFile = null;
    ac.previewUrl = null;
    ac.uploadedImageUrl = null;
    ac.assetId = null;
    ac.selectedAsset = null;
    ac.sourceMode = 'upload';
    ac.currentTaskId = null;
    ac.isUploading = false;
    ac.isGenerating = false;
    ac.textPrompt = '';
    ac.negativePrompt = '';                        // Phase UI-AICreation-07-C
    // Phase 2-C-2-4-C-3-1: Reset ref2video fields
    ac.ref2videoPrompt = '';
    ac.referenceSubjects = [];
    ac.referenceImages = [];
    // Phase 2-C-1-C: Reset unified params to defaults
    ac.params = {
      aspectRatio: '16:9',
      duration: 5,
      motionStrength: 'medium',
      cameraMovement: 'static',
      quality: 'standard',
      // Phase UI-AICreation-02-B-1-E-B-2: imageGen 参数
      style: 'realistic'
    };

    // Phase UI-AICreation-02-B-2.2-A: Reset all per-mode namespaces
    ac.text2video = {
      prompt: '',
      negativePrompt: '',                            // Phase UI-AICreation-07-C
      params: { aspectRatio: '16:9', duration: 5, motionStrength: 'medium', cameraMovement: 'static', quality: 'standard' }
    };
    ac.image2video = {
      prompt: '', selectedFile: null, previewUrl: null, uploadedImageUrl: null,
      assetId: null, selectedAsset: null, sourceMode: 'upload',
      params: { aspectRatio: '16:9', duration: 5, motionStrength: 'medium', cameraMovement: 'static', quality: 'standard' }
    };
    ac.ref2video = {
      prompt: '', referenceSubjects: [], referenceImages: [],
      params: { aspectRatio: '16:9', duration: 5, motionStrength: 'medium', cameraMovement: 'static', quality: 'standard' }
    };
    ac.imageGen = {
      prompt: '',
      params: { aspectRatio: '16:9', style: 'realistic', count: 4 }
    };
  }

  /** Set AI Creation state fields (partial update) */
  function setAiCreationState(updates) {
    if (!updates) return;
    var ac = APP_STATE.aiCreation;
    var keys = Object.keys(updates);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'params' && ac.params && typeof updates.params === 'object') {
        // Phase 2-C-1-C: 深度合并 params，避免覆盖未传入的字段
        var paramKeys = Object.keys(updates.params);
        for (var j = 0; j < paramKeys.length; j++) {
          var pk = paramKeys[j];
          if (ac.params.hasOwnProperty(pk)) {
            ac.params[pk] = updates.params[pk];
          }
        }
      } else if (ac.hasOwnProperty(k)) {
        ac[k] = updates[k];
      }
    }
  }

  /** Get the current AI Creation state (returns a shallow copy) */
  function getAiCreationState() {
    return Object.assign({}, APP_STATE.aiCreation);
  }

  /** Phase 2-C-1-C: Set AI Creation generation params (partial merge) */
  function setAiCreationParams(paramUpdates) {
    if (!paramUpdates) return;
    var ac = APP_STATE.aiCreation;
    if (!ac.params) {
      ac.params = {
        aspectRatio: '16:9',
        duration: 5,
        motionStrength: 'medium',
        cameraMovement: 'static',
        quality: 'standard'
      };
    }
    var keys = Object.keys(paramUpdates);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (ac.params.hasOwnProperty(k)) {
        ac.params[k] = paramUpdates[k];
      }
    }
  }

  /** Phase 2-C-1-C: Get current AI Creation generation params (shallow copy) */
  function getAiCreationParams() {
    var ac = APP_STATE.aiCreation;
    return ac.params ? Object.assign({}, ac.params) : {
      aspectRatio: '16:9',
      duration: 5,
      motionStrength: 'medium',
      cameraMovement: 'static',
      quality: 'standard'
    };
  }

  // ── Phase UI-AICreation-02-B-2.2-A: Per-Mode Namespace Accessors ──

  /** Available mode namespace keys */
  var AI_CREATION_MODES = ['text2video', 'image2video', 'ref2video', 'imageGen'];

  /**
   * Save current flat state fields into the specified mode namespace.
   * Called BEFORE switching away from a mode.
   * @param {string} mode — one of 'text2video' | 'image2video' | 'ref2video' | 'imageGen'
   */
  function saveAiCreationModeState(mode) {
    var ac = APP_STATE.aiCreation;
    if (!ac[mode]) return;

    var ns = ac[mode];

    switch (mode) {
      case 'text2video':
        ns.prompt = ac.textPrompt || '';
        ns.negativePrompt = ac.negativePrompt || '';   // Phase UI-AICreation-07-C
        ns.params = Object.assign({}, ac.params);
        // text2video doesn't need video-specific params, but we keep all for consistency
        break;
      case 'image2video':
        ns.prompt = ac.textPrompt || '';
        ns.selectedFile = ac.selectedFile;
        ns.previewUrl = ac.previewUrl;
        ns.uploadedImageUrl = ac.uploadedImageUrl;
        ns.assetId = ac.assetId;
        ns.selectedAsset = ac.selectedAsset;
        ns.sourceMode = ac.sourceMode;
        ns.params = Object.assign({}, ac.params);
        break;
      case 'ref2video':
        ns.prompt = ac.ref2videoPrompt || '';
        ns.negativePrompt = ac.negativePrompt || '';   // Phase UI-AICreation-07-G P2-1
        ns.referenceSubjects = (ac.referenceSubjects || []).slice();
        ns.referenceImages = (ac.referenceImages || []).slice();
        ns.params = Object.assign({}, ac.params);
        break;
      case 'imageGen':
        ns.prompt = ac.textPrompt || '';
        ns.params = Object.assign({}, ac.params);
        break;
    }
  }

  /**
   * Restore the specified mode namespace into the current flat state fields.
   * Called AFTER switching to a mode.
   * @param {string} mode — one of 'text2video' | 'image2video' | 'ref2video' | 'imageGen'
   */
  function restoreAiCreationModeState(mode) {
    var ac = APP_STATE.aiCreation;
    if (!ac[mode]) return;

    var ns = ac[mode];

    switch (mode) {
      case 'text2video':
        ac.textPrompt = ns.prompt || '';
        ac.negativePrompt = ns.negativePrompt || '';   // Phase UI-AICreation-07-C
        ac.params = Object.assign({}, ns.params);
        break;
      case 'image2video':
        ac.textPrompt = ns.prompt || '';
        ac.selectedFile = ns.selectedFile;
        ac.previewUrl = ns.previewUrl;
        ac.uploadedImageUrl = ns.uploadedImageUrl;
        ac.assetId = ns.assetId;
        ac.selectedAsset = ns.selectedAsset;
        ac.sourceMode = ns.sourceMode || 'upload';
        ac.params = Object.assign({}, ns.params);
        break;
      case 'ref2video':
        ac.ref2videoPrompt = ns.prompt || '';
        ac.negativePrompt = ns.negativePrompt || '';   // Phase UI-AICreation-07-G P2-1
        ac.referenceSubjects = (ns.referenceSubjects || []).slice();
        ac.referenceImages = (ns.referenceImages || []).slice();
        ac.params = Object.assign({}, ns.params);
        break;
      case 'imageGen':
        ac.textPrompt = ns.prompt || '';
        ac.params = Object.assign({}, ns.params);
        break;
    }
  }

  /**
   * Get a shallow copy of the specified mode's namespace state.
   * @param {string} mode — one of 'text2video' | 'image2video' | 'ref2video' | 'imageGen'
   * @returns {Object|null} shallow copy of mode state, or null if mode is invalid
   */
  function getAiCreationModeState(mode) {
    var ac = APP_STATE.aiCreation;
    if (!ac[mode]) return null;
    var ns = ac[mode];
    // Deep-copy params and arrays
    var copy = {};
    var keys = Object.keys(ns);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = ns[k];
      if (k === 'params') {
        copy[k] = Object.assign({}, v);
      } else if (Array.isArray(v)) {
        copy[k] = v.slice();
      } else {
        copy[k] = v;
      }
    }
    return copy;
  }

  /**
   * Reset a single mode namespace to its defaults without touching other modes.
   * @param {string} mode — one of 'text2video' | 'image2video' | 'ref2video' | 'imageGen'
   */
  function resetAiCreationModeState(mode) {
    var ac = APP_STATE.aiCreation;
    var defaults = {
      text2video: {
        prompt: '',
        negativePrompt: '',                            // Phase UI-AICreation-07-C
        params: { aspectRatio: '16:9', duration: 5, motionStrength: 'medium', cameraMovement: 'static', quality: 'standard' }
      },
      image2video: {
        prompt: '', selectedFile: null, previewUrl: null, uploadedImageUrl: null,
        assetId: null, selectedAsset: null, sourceMode: 'upload',
        params: { aspectRatio: '16:9', duration: 5, motionStrength: 'medium', cameraMovement: 'static', quality: 'standard' }
      },
      ref2video: {
        prompt: '', negativePrompt: '', referenceSubjects: [], referenceImages: [],
        params: { aspectRatio: '16:9', duration: 5, motionStrength: 'medium', cameraMovement: 'static', quality: 'standard' }
      },
      imageGen: {
        prompt: '',
        params: { aspectRatio: '16:9', style: 'realistic', count: 4 }
      }
    };
    if (defaults[mode]) {
      ac[mode] = defaults[mode];
    }
  }

  /** Set creation type for AI Creation */
  function setAiCreationType(type) {
    APP_STATE.aiCreation.creationType = type;
  }

  /** Get creation type */
  function getAiCreationType() {
    return APP_STATE.aiCreation.creationType;
  }

  // ── AI Model Registry Accessors (Phase 2-C-2-3-A) ───────────

  /** Populate aiModels from API response data */
  function setAiModelsData(templates, capabilities, allModels) {
    var am = APP_STATE.aiModels;

    // Build lookup maps from templates (each template carries its associated model)
    var models = {};
    var templateToModel = {};
    var capabilityToModels = {};
    var modelToTemplate = {};

    if (templates && templates.length) {
      for (var i = 0; i < templates.length; i++) {
        var t = templates[i];
        if (t.templateId && t.defaultModelId) {
          templateToModel[t.templateId] = t.defaultModelId;
        }
        if (t.model && t.model.id) {
          var m = t.model;
          models[m.id] = m;
          if (t.templateId) {
            modelToTemplate[m.id] = t.templateId;
          }
          if (m.capability) {
            if (!capabilityToModels[m.capability]) {
              capabilityToModels[m.capability] = [];
            }
            if (capabilityToModels[m.capability].indexOf(m.id) === -1) {
              capabilityToModels[m.capability].push(m.id);
            }
          }
        }
      }
    }

    // Phase UI-AICreation-02-B-1-G-M-I: 合并来自 /registry/models 的全部模型
    // 确保无 template 的备用模型（如 qwen-image-backup）也出现在 state 中
    if (allModels && allModels.length) {
      for (var j = 0; j < allModels.length; j++) {
        var am_ = allModels[j];
        if (am_.id && !models[am_.id]) {
          models[am_.id] = am_;
        }
        if (am_.id && am_.capability) {
          if (!capabilityToModels[am_.capability]) {
            capabilityToModels[am_.capability] = [];
          }
          if (capabilityToModels[am_.capability].indexOf(am_.id) === -1) {
            capabilityToModels[am_.capability].push(am_.id);
          }
        }
      }
    }

    am.templates = templates || [];
    am.models = models;
    am.capabilities = capabilities || [];
    am.templateToModel = templateToModel;
    am.capabilityToModels = capabilityToModels;
    am.modelToTemplate = modelToTemplate;
    am.isLoaded = true;
    am.lastFetchTime = Date.now();
    am.error = null;
  }

  /** Get full aiModels state (shallow copy) */
  function getAiModels() {
    var am = APP_STATE.aiModels;
    return {
      templates: am.templates.slice(),
      models: Object.assign({}, am.models),
      capabilities: am.capabilities.slice(),
      templateToModel: Object.assign({}, am.templateToModel),
      capabilityToModels: Object.assign({}, am.capabilityToModels),
      modelToTemplate: Object.assign({}, am.modelToTemplate),
      isLoaded: am.isLoaded,
      isLoading: am.isLoading,
      error: am.error,
      lastFetchTime: am.lastFetchTime
    };
  }

  /** Resolve templateId → model config */
  function getModelByTemplateId(templateId) {
    var am = APP_STATE.aiModels;
    var modelId = am.templateToModel[templateId];
    if (!modelId) return null;
    return am.models[modelId] ? Object.assign({}, am.models[modelId]) : null;
  }

  /** Get models for a given capability */
  function getModelsByCapability(capability) {
    var am = APP_STATE.aiModels;
    var ids = am.capabilityToModels[capability] || [];
    var result = [];
    for (var i = 0; i < ids.length; i++) {
      if (am.models[ids[i]]) {
        result.push(Object.assign({}, am.models[ids[i]]));
      }
    }
    return result;
  }

  /** Check if aiModels data is loaded and ready */
  function isAiModelsReady() {
    return APP_STATE.aiModels.isLoaded && !APP_STATE.aiModels.isLoading;
  }

  /** Get the error message if loading failed */
  function getAiModelsError() {
    return APP_STATE.aiModels.error || null;
  }

  /** Mark aiModels as loading */
  function setAiModelsLoading(isLoading) {
    APP_STATE.aiModels.isLoading = isLoading;
  }

  /** Set aiModels error state */
  function setAiModelsError(errMsg) {
    APP_STATE.aiModels.error = errMsg;
    APP_STATE.aiModels.isLoading = false;
  }

  // ── Digital Human State Accessors (Phase 2-C-2-4-B-2-B-1) ────

  /**
   * 设置数字人状态（部分更新，深度合并 modelConfig）
   *
   * 数据来源优先级：
   *   1. 调用方传入的 modelId / modelConfig
   *   2. Registry 的 digital_human capability 自动解析（通过 resolveDigitalHumanFromRegistry）
   *
   * @param {Object} updates — 要更新的字段（部分更新）
   */
  function setDigitalHumanState(updates) {
    if (!updates) return;
    var dh = APP_STATE.digitalHuman;
    var keys = Object.keys(updates);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'modelConfig' && dh.modelConfig && typeof updates.modelConfig === 'object') {
        // 深度合并 modelConfig，避免覆盖未传入的字段
        var configKeys = Object.keys(updates.modelConfig);
        for (var j = 0; j < configKeys.length; j++) {
          var ck = configKeys[j];
          dh.modelConfig[ck] = updates.modelConfig[ck];
        }
      } else if (dh.hasOwnProperty(k)) {
        dh[k] = updates[k];
      }
    }
  }

  /**
   * 获取当前数字人状态（返回浅拷贝，避免外部直接修改内部状态）
   * @returns {Object}
   */
  function getDigitalHumanState() {
    var dh = APP_STATE.digitalHuman;
    return {
      templateId: dh.templateId,
      modelId: dh.modelId,
      modelConfig: dh.modelConfig ? Object.assign({}, dh.modelConfig) : null,
      imageUrl: dh.imageUrl,
      avatarId: dh.avatarId,
      script: dh.script,
      voice: dh.voice,
      speed: dh.speed,
      background: dh.background,
      resolution: dh.resolution,
      aspectRatio: dh.aspectRatio,
      isGenerating: dh.isGenerating,
      currentTaskId: dh.currentTaskId
    };
  }

  /**
   * 重置数字人状态到默认值
   * 注意：不重置 templateId（系统常量），modelId/modelConfig 回到 null
   */
  function resetDigitalHumanState() {
    var dh = APP_STATE.digitalHuman;
    dh.templateId = 'digital_human';
    dh.modelId = null;
    dh.modelConfig = null;
    dh.imageUrl = null;
    dh.avatarId = null;
    dh.script = '';
    dh.voice = null;
    dh.speed = 1.0;
    dh.background = '';
    dh.resolution = null;
    dh.aspectRatio = '16:9';
    dh.isGenerating = false;
    dh.currentTaskId = null;
  }

  /**
   * 从 Registry 解析数字人模型配置
   *
   * 数据流: aiModels.capabilityToModels['digital_human'] → models[modelId]
   * 禁止硬编码 modelId（如 'wanx-digital-human'），始终通过 capability 动态查找
   *
   * 解析成功后自动填充：
   *   - digitalHuman.modelId
   *   - digitalHuman.modelConfig
   *   - digitalHuman.voice（若未设置则使用模型默认值）
   *   - digitalHuman.resolution（若未设置则使用模型默认值）
   *
   * @returns {Object|null} 模型配置对象，若 Registry 未加载则返回 null
   */
  function resolveDigitalHumanFromRegistry() {
    var dh = APP_STATE.digitalHuman;

    // 通过 capability 查找（禁止硬编码 modelId）
    var models = getModelsByCapability('digital_human');
    if (!models || models.length === 0) {
      console.warn('[State/DigitalHuman] No digital_human model found in Registry — ensure aiModels is loaded');
      return null;
    }

    // 取第一个匹配模型作为主模型
    var model = models[0];

    // 填充 modelId 和 modelConfig
    dh.modelId = model.id;
    dh.modelConfig = Object.assign({}, model);

    // 从模型配置填充默认参数（仅当尚未设置时）
    if (!dh.voice && model.defaultVoice) {
      dh.voice = model.defaultVoice;
    }
    if (!dh.resolution && model.defaultSize) {
      dh.resolution = model.defaultSize;
    }

    console.log('[State/DigitalHuman] Model resolved from Registry:', dh.modelId,
      '(voice:', dh.voice, ', resolution:', dh.resolution, ')');
    return dh.modelConfig;
  }

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  YJ.state = APP_STATE;
  YJ.state.setCurrentAsset = setCurrentAsset;
  YJ.state.getCurrentAsset = getCurrentAsset;
  YJ.state.clearCurrentAsset = clearCurrentAsset;
  YJ.state.setCurrentPreviewAsset = setCurrentPreviewAsset;
  YJ.state.getCurrentPreviewAsset = getCurrentPreviewAsset;
  YJ.state.clearCurrentPreviewAsset = clearCurrentPreviewAsset;
  YJ.state.setCurrentGenerationAsset = setCurrentGenerationAsset;
  YJ.state.getCurrentGenerationAsset = getCurrentGenerationAsset;
  YJ.state.setSelectedAsset = setSelectedAsset;
  YJ.state.getSelectedAsset = getSelectedAsset;
  YJ.state.clearSelectedAsset = clearSelectedAsset;
  YJ.state.cacheAsset = cacheAsset;
  YJ.state.getCachedAsset = getCachedAsset;
  YJ.state.resetGenerationState = resetGenerationState;
  YJ.state.resetAiCreationState = resetAiCreationState;
  YJ.state.setAiCreationState = setAiCreationState;
  YJ.state.getAiCreationState = getAiCreationState;
  YJ.state.setAiCreationType = setAiCreationType;
  YJ.state.getAiCreationType = getAiCreationType;
  YJ.state.setAiCreationParams = setAiCreationParams;
  YJ.state.getAiCreationParams = getAiCreationParams;
  YJ.state.saveAiCreationModeState = saveAiCreationModeState;
  YJ.state.restoreAiCreationModeState = restoreAiCreationModeState;
  YJ.state.getAiCreationModeState = getAiCreationModeState;
  YJ.state.resetAiCreationModeState = resetAiCreationModeState;
  YJ.state.AI_CREATION_MODES = AI_CREATION_MODES;
  YJ.state.setAiModelsData = setAiModelsData;
  YJ.state.getAiModels = getAiModels;
  YJ.state.getModelByTemplateId = getModelByTemplateId;
  YJ.state.getModelsByCapability = getModelsByCapability;
  YJ.state.isAiModelsReady = isAiModelsReady;
  YJ.state.getAiModelsError = getAiModelsError;
  YJ.state.setAiModelsLoading = setAiModelsLoading;
  YJ.state.setAiModelsError = setAiModelsError;
  YJ.state.setDigitalHumanState = setDigitalHumanState;
  YJ.state.getDigitalHumanState = getDigitalHumanState;
  YJ.state.resetDigitalHumanState = resetDigitalHumanState;
  YJ.state.resolveDigitalHumanFromRegistry = resolveDigitalHumanFromRegistry;
  YJ.state.getEditorProject = getEditorProject;
  YJ.state.setEditorProject = setEditorProject;
  YJ.state.getEditorTimeline = getEditorTimeline;
  YJ.state.resetEditorState = resetEditorState;

  // Constants exposed for convenience
  YJ.state.PAGE_STATE = PAGE_STATE;
  YJ.state.TYPE_MAP = TYPE_MAP;
  YJ.state.ICONS = ICONS;
  YJ.state.TYPE_BADGES = TYPE_BADGES;

  window.YJ = YJ;

  // ─── Backward-compatible aliases (for migration phase) ─────
  // Since enterprise modules load after the inline script, we
  // override the window-level globals. The inline script's `var`
  // declarations are scoped to that script block and won't conflict.
  window.ASSETS_STATE = APP_STATE.assets;
  window.ASSET_CACHE = APP_STATE.assets.cache;
  window.ASSET_PAGE_STATE = PAGE_STATE;
  window.ASSET_TYPE_MAP = TYPE_MAP;
  window.ASSET_ICONS = ICONS;
  window.CURRENT_ASSET_DETAIL = APP_STATE.currentAsset;
  window.CURRENT_IMAGE_PREVIEW = APP_STATE.currentPreviewAsset;
  window.SELECTED_ASSET = APP_STATE.selectedAsset;

  console.log('[Enterprise/State] Unified state management initialized (Phase 2-D-4.6: selectedAsset bridge, Phase 2-C-1-A: aiCreation state, Phase 2-C-1-C: aiCreation.params, Phase 2-C-2-3-A: aiModels registry data, Phase 2-C-2-4-B-2-B-1: digitalHuman state, Phase 2-C-2-4-C-3-1: ref2video state, Phase UI-AICreation-02-B-2.2-A: per-mode namespace isolation)');
})();
