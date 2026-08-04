/**
 * YuJian Enterprise — Asset Preview Module
 *
 * Sprint 4.5: 图片大图预览、关闭、ESC事件、遮罩关闭
 *
 * 依赖：state.js, utils.js
 */

(function () {
  'use strict';

  var state = (window.YJ && window.YJ.state) || {};
  var utils = (window.YJ && window.YJ.utils) || {};

  var escapeHtml = utils.escapeHtml || window.escapeHtml;
  var getAssetPreviewUrl = utils.getAssetPreviewUrl || window.getAssetPreviewUrl;

  // ─── Open Image Preview ───────────────────────────────────
  async function openImagePreview(assetOrId) {
    var overlay = document.getElementById('imagePreviewOverlay');
    var bodyEl = document.getElementById('imagePreviewBody');
    if (!overlay || !bodyEl) return;

    var asset = null;

    // Parse parameter
    if (typeof assetOrId === 'object' && assetOrId !== null && assetOrId.id) {
      asset = assetOrId;
    } else if (typeof assetOrId === 'string' || typeof assetOrId === 'number') {
      var id = String(assetOrId);
      asset = state.getCachedAsset ? state.getCachedAsset(id) : null;
      if (!asset && window.ASSET_CACHE) {
        asset = window.ASSET_CACHE[id] || null;
      }
    }

    // Show loading
    overlay.classList.add('show');
    bodyEl.innerHTML = '<div style="text-align:center;padding:60px 40px;color:rgba(255,255,255,0.5)">' +
      '<div class="spinner"></div><div>加载中...</div></div>';

    if (!asset) {
      bodyEl.innerHTML = '<div class="image-preview-error">' +
        '<i class="fas fa-exclamation-circle"></i><p>素材不可用</p></div>';
      return;
    }

    // Set unified state
    state.setCurrentPreviewAsset(asset);

    // Sprint 5.8: 通过 resolveAssetPlayableUrl 获取签名 URL
    var resolveAssetPlayableUrl = (utils && utils.resolveAssetPlayableUrl) || window.resolveAssetPlayableUrl;
    var previewUrl = '';
    var backupUrl = asset.url || asset.fileUrl || asset.path || '';

    if (resolveAssetPlayableUrl) {
      try {
        previewUrl = await resolveAssetPlayableUrl(asset);
      } catch (e) {
        console.warn('[AssetPreview] 签名URL解析失败，降级:', e.message);
      }
    }

    // 降级：使用 getAssetPreviewUrl
    if (!previewUrl) {
      previewUrl = getAssetPreviewUrl(asset);
    }

    if (!previewUrl) {
      bodyEl.innerHTML = '<div class="image-preview-error">' +
        '<i class="fas fa-image"></i><p>无可预览的图片</p></div>';
      return;
    }

    // Render image with two-level fallback
    bodyEl.innerHTML = '<img src="' + escapeHtml(previewUrl) + '" alt="' + escapeHtml(asset.name || '') + '" ' +
      'onerror="var b=this.getAttribute(\'data-backup\');' +
      'if(b&&this.src!==b){this.src=b;this.removeAttribute(\'data-backup\');}else{' +
      'this.parentElement.innerHTML=\'<div class=\\\'image-preview-error\\\'><i class=\\\'fas fa-image\\\'></i><p>图片加载失败</p></div>\'' +
      '}" ' +
      (backupUrl && backupUrl !== previewUrl ? 'data-backup="' + escapeHtml(backupUrl) + '" ' : '') +
      '>';
  }

  // ─── Close Image Preview ──────────────────────────────────
  function closeImagePreview() {
    var overlay = document.getElementById('imagePreviewOverlay');
    if (overlay) overlay.classList.remove('show');
    state.clearCurrentPreviewAsset();
  }

  // ─── ESC key handler ──────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var imgOverlay = document.getElementById('imagePreviewOverlay');
      if (imgOverlay && imgOverlay.classList.contains('show')) {
        closeImagePreview();
      }
    }
  });

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  if (!YJ.modules) YJ.modules = {};
  YJ.modules.assetPreview = {
    openImagePreview: openImagePreview,
    closeImagePreview: closeImagePreview
  };
  window.YJ = YJ;

  window.openImagePreview = openImagePreview;
  window.closeImagePreview = closeImagePreview;

  console.log('[Enterprise/AssetPreview] Module initialized');
})();
