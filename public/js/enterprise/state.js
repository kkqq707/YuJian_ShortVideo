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

  console.log('[Enterprise/State] Unified state management initialized (Phase 2-D-4.6: selectedAsset bridge)');
})();
