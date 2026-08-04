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
  YJ.state.cacheAsset = cacheAsset;
  YJ.state.getCachedAsset = getCachedAsset;
  YJ.state.resetGenerationState = resetGenerationState;

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

  console.log('[Enterprise/State] Unified state management initialized');
})();
