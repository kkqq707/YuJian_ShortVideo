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
      pageSize: 20,
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
      creationType: 'image2video',  // imageGen | image2video | text2video | digitalhuman
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
      // Phase 2-C-1-C: 统一图生视频参数
      params: {
        aspectRatio: '16:9',        // 画面比例: 16:9 | 9:16 | 1:1
        duration: 5,                // 视频时长: 5 | 10
        motionStrength: 'medium',   // 动态强度: low | medium | high
        cameraMovement: 'static',   // 运镜方式: static | push | zoom | orbit
        quality: 'standard'         // 画质: standard | high
      }
    },

    // ── Works State ──────────────────────────────────────
    works: {
      currentPage: 1,
      pageSize: 12,
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
    // Phase 2-C-1-C: Reset unified params to defaults
    ac.params = {
      aspectRatio: '16:9',
      duration: 5,
      motionStrength: 'medium',
      cameraMovement: 'static',
      quality: 'standard'
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

  /** Set creation type for AI Creation */
  function setAiCreationType(type) {
    APP_STATE.aiCreation.creationType = type;
  }

  /** Get creation type */
  function getAiCreationType() {
    return APP_STATE.aiCreation.creationType;
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

  console.log('[Enterprise/State] Unified state management initialized (Phase 2-D-4.6: selectedAsset bridge, Phase 2-C-1-A: aiCreation state, Phase 2-C-1-C: aiCreation.params)');
})();
