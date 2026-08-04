/**
 * YuJian Enterprise — Shared Utility Functions
 *
 * Sprint 4.5: 提取共用工具函数，避免在各模块中重复定义
 *
 * 所有函数同时挂载到 window（保持全局可用）和 YJ.utils 命名空间
 */

(function () {
  'use strict';

  // ─── Toast 提示 ───────────────────────────────────────────
  function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    var icons = {
      error: 'fa-times-circle',
      success: 'fa-check-circle',
      info: 'fa-info-circle',
      warning: 'fa-exclamation-triangle'
    };
    toast.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + escapeHtml(message);
    container.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('fade-out');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 4000);
  }

  // ─── HTML 转义 ────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    if (typeof str !== 'string') str = String(str);
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ─── 日期格式化 ───────────────────────────────────────────
  function formatWorkDate(dateStr) {
    if (!dateStr) return '--';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + ' ' + h + ':' + min;
  }

  // ─── 文件大小格式化 ──────────────────────────────────────
  function formatAssetSize(bytes) {
    if (!bytes || bytes === 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ─── 创作类型格式化 ──────────────────────────────────────
  function formatTaskType(taskType) {
    var map = {
      'text_to_video': '文生视频',
      'image_to_video': '图生视频',
      'image_generation': '图片生成',
      'image_edit': '图片编辑',
      'ref_to_video': '参考生视频',
      'digital_human': '数字人',
      'storyboard': '故事板'
    };
    return map[taskType] || taskType || '未知';
  }

  // ─── 作品状态格式化 ──────────────────────────────────────
  function formatWorkStatus(status) {
    var map = {
      'success': '已完成',
      'processing': '处理中',
      'pending': '等待中',
      'failed': '失败',
      'draft': '草稿'
    };
    return map[status] || status || '未知';
  }

  // ─── 时长格式化 ──────────────────────────────────────────
  function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return '--';
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + '分' + s + '秒';
  }

  // ─── 剪贴板复制回退 ──────────────────────────────────────
  function fallbackCopyText(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('链接已复制到剪贴板', 'success');
    } catch (e) {
      showToast('复制失败，请手动复制链接', 'error');
    }
    document.body.removeChild(textarea);
  }

  // ─── API 响应归一化 ──────────────────────────────────────
  function normalizeAssetResponse(data) {
    if (!data) return null;
    // 支持: { data: { asset: {...} } }  →  提取 asset
    if (data.data && data.data.asset && data.data.asset.id) return data.data.asset;
    // 支持: { data: {...} }  →  提取 data
    if (data.data && data.data.id) return data.data;
    // 支持: { asset: {...} }  →  提取 asset
    if (data.asset && data.asset.id) return data.asset;
    // 直接就是 Asset 对象
    return data;
  }

  // ─── 素材预览 URL 解析 ───────────────────────────────────
  function getAssetPreviewUrl(asset) {
    if (!asset) return '';
    return asset.thumbnailUrl || asset.url || asset.fileUrl || asset.path || '';
  }

  // ─── 安全 API 请求封装 ───────────────────────────────────
  function safeFetch(url, options) {
    var timeoutMs = (options && options.timeout) || 15000;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject({ code: 'TIMEOUT', message: '请求超时', status: 0, retryable: true });
      }, timeoutMs);

      YuJianAPI.get(url, options)
        .then(function (data) {
          clearTimeout(timer);
          resolve(data);
        })
        .catch(function (err) {
          clearTimeout(timer);
          reject({
            code: err.code || 'UNKNOWN',
            message: err.message || '未知错误',
            status: err.status || 0,
            retryable: err.retryable !== false,
            raw: err
          });
        });
    });
  }

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  YJ.utils = {
    showToast: showToast,
    escapeHtml: escapeHtml,
    formatWorkDate: formatWorkDate,
    formatAssetSize: formatAssetSize,
    formatTaskType: formatTaskType,
    formatWorkStatus: formatWorkStatus,
    formatDuration: formatDuration,
    fallbackCopyText: fallbackCopyText,
    normalizeAssetResponse: normalizeAssetResponse,
    getAssetPreviewUrl: getAssetPreviewUrl,
    safeFetch: safeFetch
  };
  window.YJ = YJ;

  // ─── Backward-compatible global aliases ───────────────────
  // Only set if not already defined by enterprise.html inline script
  if (typeof window.showToast === 'undefined') {
    window.showToast = showToast;
  }
  if (typeof window.escapeHtml === 'undefined') {
    window.escapeHtml = escapeHtml;
  }
  if (typeof window.formatWorkDate === 'undefined') {
    window.formatWorkDate = formatWorkDate;
  }
  if (typeof window.formatAssetSize === 'undefined') {
    window.formatAssetSize = formatAssetSize;
  }
  if (typeof window.formatTaskType === 'undefined') {
    window.formatTaskType = formatTaskType;
  }
  if (typeof window.formatWorkStatus === 'undefined') {
    window.formatWorkStatus = formatWorkStatus;
  }
  if (typeof window.formatDuration === 'undefined') {
    window.formatDuration = formatDuration;
  }
  if (typeof window.fallbackCopyText === 'undefined') {
    window.fallbackCopyText = fallbackCopyText;
  }
  if (typeof window.normalizeAssetResponse === 'undefined') {
    window.normalizeAssetResponse = normalizeAssetResponse;
  }
  if (typeof window.getAssetPreviewUrl === 'undefined') {
    window.getAssetPreviewUrl = getAssetPreviewUrl;
  }
  if (typeof window.safeFetch === 'undefined') {
    window.safeFetch = safeFetch;
  }

  console.log('[Enterprise/Utils] Utility functions initialized');
})();
