/**
 * YuJian Enterprise — Asset Actions Module
 *
 * Sprint 4.5: 删除、复制链接、上传素材
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
  var fallbackCopyText = utils.fallbackCopyText || window.fallbackCopyText;

  // ─── Copy Asset Link ──────────────────────────────────────
  function copyAssetLink() {
    var currentAsset = state.getCurrentAsset ? state.getCurrentAsset() : null;
    // Fallback to legacy global
    if (!currentAsset && typeof window.CURRENT_ASSET_DETAIL !== 'undefined') {
      currentAsset = window.CURRENT_ASSET_DETAIL;
    }

    if (!currentAsset || !currentAsset.url) {
      showToast('无法获取素材链接', 'warning');
      return;
    }

    var url = currentAsset.url;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showToast('链接已复制到剪贴板', 'success');
      }).catch(function () {
        fallbackCopyText(url);
      });
    } else {
      fallbackCopyText(url);
    }
  }

  // ─── Delete from Detail Modal ─────────────────────────────
  function deleteAssetFromDetail() {
    var btn = document.getElementById('assetDetailDeleteBtn');
    var assetId = btn.getAttribute('data-asset-id');
    var assetName = btn.getAttribute('data-asset-name') || '';

    // Close detail modal first
    if (typeof closeAssetDetail === 'function') {
      closeAssetDetail();
    }
    setTimeout(function () {
      confirmDeleteAsset(assetId, assetName);
    }, 150);
  }

  // ─── Confirm Delete Dialog ────────────────────────────────
  function confirmDeleteAsset(assetId, assetName) {
    var content = '<div style="text-align:center;padding:8px 0">' +
      '<p style="margin-bottom:24px;font-size:14px;line-height:1.6;color:var(--text-sub)">删除后该素材将从资产库移除，<br>已生成的视频不会受到影响。</p>' +
      '</div>';

    // Hide default footer
    var footer = document.getElementById('modalFooter');
    if (footer) footer.style.display = 'none';

    content += '<div style="display:flex;gap:12px;justify-content:center;margin-top:8px">' +
      '<button onclick="closeModal()" style="min-width:100px;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;background:transparent;color:#6366f1;border:1px solid #c7d2fe"' +
      ' onmouseover="this.style.background=\'#eef2ff\';this.style.borderColor=\'#818cf8\'"' +
      ' onmouseout="this.style.background=\'transparent\';this.style.borderColor=\'#c7d2fe\'">取消</button>' +
      '<button class="btn btn-danger" onclick="closeModal();deleteAsset(\'' + assetId + '\')" style="min-width:100px;background:var(--danger,#ef4444);border-color:var(--danger,#ef4444);color:#fff"' +
      ' onmouseover="this.style.background=\'#dc2626\';this.style.borderColor=\'#dc2626\'"' +
      ' onmouseout="this.style.background=\'var(--danger,#ef4444)\';this.style.borderColor=\'var(--danger,#ef4444)\'">确认删除</button>' +
      '</div>';

    if (typeof openModal === 'function') {
      openModal('确认删除该素材？', encodeURIComponent(content));
    }
  }

  // ─── Delete Asset ─────────────────────────────────────────
  async function deleteAsset(assetId) {
    try {
      if (api.Asset && api.Asset.deleteAsset) {
        await api.Asset.deleteAsset(assetId);
      } else {
        await YuJianAPI.request('/enterprise/assets/' + assetId, { method: 'DELETE' });
      }

      showToast('素材已删除', 'success');

      // Remove from local state
      state.items = (state.items || []).filter(function (item) { return item.id != assetId; });
      state.total = Math.max(0, (state.total || 1) - 1);

      // Re-render
      var contentEl = document.getElementById('assetContent');
      if (contentEl) {
        if (!state.items.length) {
          contentEl.innerHTML = '<div class="empty-works">' +
            '<i class="fas fa-folder-open"></i>' +
            '<p>暂无素材</p>' +
            '<p class="sub-text">上传图片、视频或音频素材开始管理</p>' +
            '</div>';
        } else {
          contentEl.innerHTML = '<div class="asset-grid-new">' +
            state.items.map(function (item) {
              return typeof renderAssetCard === 'function' ? renderAssetCard(item) : '';
            }).join('') +
            '</div>';
        }
      }

      // Refresh pagination
      var paginationEl = document.getElementById('assetPagination');
      if (paginationEl && typeof renderAssetPagination === 'function') {
        renderAssetPagination(paginationEl);
      }

    } catch (err) {
      console.error('[Asset] 删除失败:', err);
      if (err.status === 401) {
        showToast('登录已过期，请刷新页面重新登录', 'error');
      } else if (err.status === 404) {
        showToast('素材不存在或已删除', 'warning');
        if (typeof loadAssets === 'function') {
          loadAssets(state.currentPage || 1);
        }
      } else {
        showToast('删除失败，请稍后重试', 'error');
      }
    }
  }

  // ─── Trigger Upload ───────────────────────────────────────
  function triggerAssetUpload() {
    if (!YuJianAuth.isAuthenticated()) {
      if (typeof showLogin === 'function') showLogin();
      showToast('请先登录企业账号', 'warning');
      return;
    }
    var fileInput = document.getElementById('assetFileInput');
    if (fileInput) fileInput.click();
  }

  // ─── Handle File Select ───────────────────────────────────
  async function handleAssetFileSelect(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;

    var type = 'other';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';

    var maxSize = type === 'video' ? 200 * 1024 * 1024 : type === 'audio' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    var maxSizeLabel = type === 'video' ? '200MB' : type === 'audio' ? '50MB' : '10MB';

    if (file.size > maxSize) {
      var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      showToast('文件过大 (' + sizeMB + 'MB)，最大支持 ' + maxSizeLabel, 'error');
      event.target.value = '';
      return;
    }

    showToast('正在上传素材...', 'info');

    try {
      await uploadAssetFile(file, type);
      showToast('上传成功！', 'success');
      state.currentPage = 1;
      if (typeof loadAssets === 'function') loadAssets(1);
    } catch (err) {
      console.error('[Assets] 上传失败:', err);
      showToast(err.message || '上传失败，请重试', 'error');
    } finally {
      event.target.value = '';
    }
  }

  // ─── Upload Asset File (OSS flow) ─────────────────────────
  async function uploadAssetFile(file, type) {
    var signatureData;
    if (api.Asset && api.Asset.getUploadSignature) {
      signatureData = await api.Asset.getUploadSignature(type);
    } else {
      signatureData = await YuJianAPI.get('/enterprise/assets/upload-signature?type=' + type);
    }

    var ossResult = await uploadToOssGeneric(file, signatureData);

    var assetRecord;
    if (api.Asset && api.Asset.createAsset) {
      assetRecord = await api.Asset.createAsset({
        name: file.name,
        url: ossResult.ossUrl,
        type: type,
        size: file.size,
        mime_type: file.type
      });
    } else {
      assetRecord = await YuJianAPI.post('/enterprise/assets', {
        name: file.name,
        url: ossResult.ossUrl,
        type: type,
        size: file.size,
        mime_type: file.type
      });
    }

    return assetRecord;
  }

  // ─── OSS Generic Upload ───────────────────────────────────
  function uploadToOssGeneric(file, signatureData) {
    return new Promise(function (resolve, reject) {
      var host = signatureData.host;
      var policy = signatureData.policy;
      var signature = signatureData.signature;
      var dir = signatureData.dir;
      var accessKeyId = signatureData.accessKeyId;

      var timestamp = Date.now();
      var randomStr = Math.random().toString(36).substring(2, 8);
      var safeName = file.name.replace(/[^一-龥a-zA-Z0-9._-]/g, '_');
      var key = dir + timestamp + '_' + randomStr + '_' + safeName;

      var formData = new FormData();
      formData.append('key', key);
      formData.append('policy', policy);
      formData.append('OSSAccessKeyId', accessKeyId);
      formData.append('signature', signature);
      formData.append('success_action_status', '200');
      formData.append('file', file);

      var xhr = new XMLHttpRequest();

      xhr.addEventListener('load', function () {
        if (xhr.status === 200 || xhr.status === 204) {
          var ossUrl = host + '/' + key;
          resolve({ ossUrl: ossUrl, ossKey: key });
        } else {
          reject(new Error('OSS 上传失败 (' + xhr.status + ')'));
        }
      });

      xhr.addEventListener('error', function () {
        reject(new Error('OSS 上传网络异常，请重试'));
      });

      xhr.addEventListener('abort', function () {
        reject(new Error('上传已取消'));
      });

      xhr.open('POST', host);
      xhr.send(formData);
    });
  }

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  if (!YJ.modules) YJ.modules = {};
  YJ.modules.assetActions = {
    copyAssetLink: copyAssetLink,
    deleteAssetFromDetail: deleteAssetFromDetail,
    confirmDeleteAsset: confirmDeleteAsset,
    deleteAsset: deleteAsset,
    triggerAssetUpload: triggerAssetUpload,
    handleAssetFileSelect: handleAssetFileSelect,
    uploadAssetFile: uploadAssetFile,
    uploadToOssGeneric: uploadToOssGeneric
  };
  window.YJ = YJ;

  window.copyAssetLink = copyAssetLink;
  window.deleteAssetFromDetail = deleteAssetFromDetail;
  window.confirmDeleteAsset = confirmDeleteAsset;
  window.deleteAsset = deleteAsset;
  window.triggerAssetUpload = triggerAssetUpload;
  window.handleAssetFileSelect = handleAssetFileSelect;
  window.uploadAssetFile = uploadAssetFile;
  window.uploadToOssGeneric = uploadToOssGeneric;

  console.log('[Enterprise/AssetActions] Module initialized');
})();
