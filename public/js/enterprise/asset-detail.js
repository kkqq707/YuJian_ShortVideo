/**
 * YuJian Enterprise — Asset Detail Module
 *
 * Sprint 4.5: 资产详情 Modal、文件信息、生成统计
 *
 * 依赖：state.js, utils.js, api.js
 */

(function () {
  'use strict';

  var state = (window.YJ && window.YJ.state) || {};
  var utils = (window.YJ && window.YJ.utils) || {};
  var api = window.EnterpriseAPI || ((window.YJ && window.YJ.api) || {});

  var showToast = utils.showToast || window.showToast;
  var escapeHtml = utils.escapeHtml || window.escapeHtml;
  var formatWorkDate = utils.formatWorkDate || window.formatWorkDate;
  var formatAssetSize = utils.formatAssetSize || window.formatAssetSize;
  var getAssetPreviewUrl = utils.getAssetPreviewUrl || window.getAssetPreviewUrl;
  var normalizeAssetResponse = utils.normalizeAssetResponse || window.normalizeAssetResponse;
  var safeFetch = utils.safeFetch || window.safeFetch;

  var TYPE_MAP = state.TYPE_MAP || {
    'image': '图片', 'video': '视频', 'audio': '音频', 'other': '其他'
  };

  // ─── Preview Asset (alias for open detail) ────────────────
  function previewAsset(assetOrId) {
    openAssetDetail(assetOrId);
  }

  // ─── Render Asset Detail Content ──────────────────────────
  async function renderAssetDetailContent(asset, assetId) {
    var previewEl = document.getElementById('assetDetailPreview');
    var bodyEl = document.getElementById('assetDetailBody');
    var actionsEl = document.getElementById('assetDetailActions');
    var titleEl = document.getElementById('assetDetailTitle');
    var deleteBtn = document.getElementById('assetDetailDeleteBtn');

    // Set unified state
    state.setCurrentAsset(asset);
    // Backward compat
    if (typeof window.CURRENT_ASSET_DETAIL !== 'undefined' || window.CURRENT_ASSET_DETAIL === undefined) {
      // Already handled by state.js proxy
    }

    titleEl.innerText = (asset && asset.name) || '素材详情';

    // Sprint 5.8: 通过 resolveAssetPlayableUrl 获取签名 URL
    var resolveAssetPlayableUrl = (utils && utils.resolveAssetPlayableUrl) || window.resolveAssetPlayableUrl;
    var previewUrl = '';

    if (resolveAssetPlayableUrl && asset && asset.id) {
      try {
        previewUrl = await resolveAssetPlayableUrl(asset);
      } catch (e) {
        console.warn('[AssetDetail] 签名URL解析失败，降级:', e.message);
      }
    }

    // 降级：使用 getAssetPreviewUrl
    if (!previewUrl) {
      previewUrl = getAssetPreviewUrl(asset);
    }

    var assetType = (asset && asset.type) || 'other';

    // Preview area
    if (assetType === 'image') {
      if (previewUrl) {
        var backupUrl = escapeHtml(asset.url || asset.fileUrl || asset.path || '');
        previewEl.innerHTML = '<img src="' + escapeHtml(previewUrl) + '" alt="' + escapeHtml(asset.name || '') + '" ' +
          'onerror="var b=this.getAttribute(\'data-backup\');' +
          'if(b&&this.src!==b){this.src=b;this.removeAttribute(\'data-backup\');}else{' +
          'this.parentElement.innerHTML=\'<div style=\\\'text-align:center;padding:40px;color:rgba(255,255,255,0.5)\\\'><i class=\\\'fas fa-image\\\' style=\\\'font-size:48px;display:block;margin-bottom:12px;opacity:0.4\\\'></i><p>图片加载失败</p></div>\'' +
          '}" ' +
          (backupUrl && backupUrl !== escapeHtml(previewUrl) ? 'data-backup="' + backupUrl + '" ' : '') +
          'style="max-width:100%;max-height:360px;object-fit:contain;border-radius:8px">';
      } else {
        previewEl.innerHTML = '<i class="fas fa-image preview-icon"></i>';
      }
    } else if (assetType === 'video') {
      if (previewUrl) {
        var vidBackupUrl = escapeHtml(asset.url || asset.fileUrl || '');
        previewEl.innerHTML = '<img src="' + escapeHtml(previewUrl) + '" alt="' + escapeHtml(asset.name || '') + '" ' +
          'onerror="var b=this.getAttribute(\'data-backup\');' +
          'if(b&&this.src!==b){this.src=b;this.removeAttribute(\'data-backup\');}else{' +
          'this.parentElement.innerHTML=\'<i class=\\\'fas fa-video preview-icon\\\'></i>\'' +
          '}" ' +
          (vidBackupUrl && vidBackupUrl !== escapeHtml(previewUrl) ? 'data-backup="' + vidBackupUrl + '" ' : '') +
          'style="max-width:100%;max-height:360px;object-fit:contain;border-radius:8px">';
      } else {
        previewEl.innerHTML = '<i class="fas fa-video preview-icon"></i>';
      }
    } else if (assetType === 'audio') {
      previewEl.innerHTML = '<i class="fas fa-music preview-icon" style="font-size:72px;color:rgba(16,185,129,0.4)"></i>';
    } else {
      previewEl.innerHTML = '<i class="fas fa-file preview-icon"></i>';
    }

    // Metadata
    var sizeStr = formatAssetSize((asset && asset.size) || 0);
    var dateStr = formatWorkDate((asset && asset.createdAt) || null);
    var typeLabel = (asset && asset.typeLabel) || TYPE_MAP[assetType] || '其他';
    var mimeType = (asset && asset.mime_type) || (asset && asset.mimeType) || '--';

    bodyEl.innerHTML =
      '<div class="asset-detail-name-row">' +
      '<div class="meta-label">文件名</div>' +
      '<div class="meta-value">' + escapeHtml((asset && asset.name) || '未命名') + '</div>' +
      '</div>' +
      '<div class="asset-detail-meta-grid">' +
      '<div class="asset-detail-meta-item"><div class="meta-label">类型</div><div class="meta-value">' + typeLabel + '</div></div>' +
      '<div class="asset-detail-meta-item"><div class="meta-label">大小</div><div class="meta-value">' + (sizeStr || '--') + '</div></div>' +
      '<div class="asset-detail-meta-item"><div class="meta-label">MIME</div><div class="meta-value">' + escapeHtml(mimeType) + '</div></div>' +
      '<div class="asset-detail-meta-item"><div class="meta-label">上传时间</div><div class="meta-value">' + dateStr + '</div></div>' +
      '</div>' +
      '<div class="asset-detail-usage">' +
      '<div class="asset-detail-usage-icon"><i class="fas fa-film"></i></div>' +
      '<div class="asset-detail-usage-text">已生成视频 <strong>' + ((asset && asset.usageCount) || 0) + '</strong> 个</div>' +
      '</div>' +
      '<div class="asset-detail-history" id="assetDetailHistory">' +
      '<div class="asset-detail-history-title"><i class="fas fa-clock-rotate-left"></i> 创作历史</div>' +
      '<div class="asset-detail-history-subtitle">该素材已被使用 <strong>' + ((asset && asset.usageCount) || 0) + '</strong> 次</div>' +
      '<div id="assetHistoryList" style="text-align:center;padding:12px;color:rgba(255,255,255,0.4)"><i class="fas fa-spinner fa-pulse"></i> 加载中...</div>' +
      '</div>';

    // Action buttons
    actionsEl.style.display = 'flex';
    deleteBtn.setAttribute('data-asset-id', (asset && asset.id) || '');
    deleteBtn.setAttribute('data-asset-name', escapeHtml((asset && asset.name) || ''));

    // Add AI create button (clean old first)
    var oldGenBtn = actionsEl.querySelector('#asset-ai-create-btn');
    if (oldGenBtn) oldGenBtn.remove();

    var genBtn = document.createElement('button');
    genBtn.id = 'asset-ai-create-btn';
    genBtn.className = 'btn btn-primary btn-gen-workspace';
    genBtn.style.cssText = 'flex:0.8';
    genBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> AI创作';
    genBtn.onclick = function () {
      var currentAsset = state.getCurrentAsset();
      closeAssetDetail();
      setTimeout(function () { openGenPanel(currentAsset || assetId); }, 200);
    };
    actionsEl.insertBefore(genBtn, actionsEl.firstChild);

    // Load history async
    if (typeof loadAssetHistory === 'function') {
      loadAssetHistory(assetId);
    }
  }

  // ─── Open Asset Detail ────────────────────────────────────
  async function openAssetDetail(assetOrId) {
    var overlay = document.getElementById('assetDetailOverlay');
    var previewEl = document.getElementById('assetDetailPreview');
    var bodyEl = document.getElementById('assetDetailBody');
    var actionsEl = document.getElementById('assetDetailActions');
    var titleEl = document.getElementById('assetDetailTitle');

    // Clean stale dynamic nodes
    var staleGenBtn = actionsEl.querySelector('#asset-ai-create-btn');
    if (staleGenBtn) staleGenBtn.remove();

    overlay.classList.add('show');
    actionsEl.style.display = 'none';
    titleEl.innerText = '素材详情';
    previewEl.innerHTML = '<div class="asset-detail-loading"><div class="spinner"></div><div>加载中...</div></div>';
    bodyEl.innerHTML = '<div class="asset-detail-loading"><div class="spinner"></div><div>加载详情...</div></div>';

    var asset = null;
    var assetId = null;

    // Parse parameter
    if (typeof assetOrId === 'object' && assetOrId !== null && assetOrId.id) {
      asset = assetOrId;
      assetId = asset.id;
    } else if (typeof assetOrId === 'string' || typeof assetOrId === 'number') {
      assetId = String(assetOrId);
      // Try cache first
      asset = state.getCachedAsset ? state.getCachedAsset(assetId) : null;
      if (!asset && window.ASSET_CACHE) {
        asset = window.ASSET_CACHE[assetId] || null;
      }
    }

    // Cache hit — render directly
    if (asset) {
      await renderAssetDetailContent(asset, assetId || asset.id);
      return;
    }

    // No valid ID
    if (!assetId) {
      previewEl.innerHTML = '<i class="fas fa-exclamation-circle preview-icon" style="color:rgba(239,68,68,0.4)"></i>';
      bodyEl.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5)"><p>素材不可用</p></div>';
      actionsEl.style.display = 'flex';
      document.getElementById('assetDetailDeleteBtn').style.display = 'none';
      return;
    }

    // Fetch from API
    try {
      var data;
      if (api.Asset && api.Asset.getAssetDetail) {
        data = await api.Asset.getAssetDetail(assetId);
      } else {
        data = await safeFetch('/enterprise/assets/' + assetId);
      }
      var normalized = normalizeAssetResponse(data);
      if (!normalized) {
        throw { code: 'EMPTY_RESPONSE', message: '服务器返回空数据', status: 0 };
      }
      // Update cache
      if (state.cacheAsset) state.cacheAsset(assetId, normalized);
      if (window.ASSET_CACHE) window.ASSET_CACHE[assetId] = normalized;
      await renderAssetDetailContent(normalized, assetId);
    } catch (err) {
      console.error('[AssetDetail] 加载失败:', err);
      if (err.status === 404) {
        previewEl.innerHTML = '<i class="fas fa-exclamation-circle preview-icon" style="color:rgba(239,68,68,0.4)"></i>';
        bodyEl.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5)"><p>素材不存在或已删除</p></div>';
      } else {
        previewEl.innerHTML = '<i class="fas fa-exclamation-circle preview-icon" style="color:rgba(239,68,68,0.4)"></i>';
        bodyEl.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5)"><p>加载失败，请重试</p><button class="btn btn-outline btn-sm" onclick="openAssetDetail(\'' + assetId + '\')" style="margin-top:12px">重试</button></div>';
      }
      actionsEl.style.display = 'flex';
      document.getElementById('assetDetailDeleteBtn').style.display = 'none';
    }
  }

  // ─── Close Asset Detail ───────────────────────────────────
  function closeAssetDetail() {
    var overlay = document.getElementById('assetDetailOverlay');
    if (overlay) overlay.classList.remove('show');
    state.clearCurrentAsset();
  }

  // ─── Overlay click to close ───────────────────────────────
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'assetDetailOverlay') {
      closeAssetDetail();
    }
  });

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  if (!YJ.modules) YJ.modules = {};
  YJ.modules.assetDetail = {
    openAssetDetail: openAssetDetail,
    closeAssetDetail: closeAssetDetail,
    renderAssetDetailContent: renderAssetDetailContent,
    previewAsset: previewAsset
  };
  window.YJ = YJ;

  window.openAssetDetail = openAssetDetail;
  window.closeAssetDetail = closeAssetDetail;
  window.renderAssetDetailContent = renderAssetDetailContent;
  window.previewAsset = previewAsset;

  console.log('[Enterprise/AssetDetail] Module initialized');
})();
