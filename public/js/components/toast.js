/**
 * YuJian Toast Component — Phase 0
 *
 * 统一的 Toast 消息提示组件
 *
 * 向后兼容：
 *   - 旧代码：showToast('消息', 'success')        ← 仍然可用
 *   - 新代码：YJ.components.toast.show('消息', { type: 'success' })
 *
 * 此文件在 enterprise.html 内联脚本之后、enterprise 模块之前加载
 * 不覆盖已有的 window.showToast（内联脚本先定义，utils.js 也会检查后跳过）
 */

(function () {
  'use strict';

  var YJ = window.YJ || {};

  // ─── 确保命名空间存在 ───────────────────────────────────
  if (!YJ.components) {
    YJ.components = {};
  }

  // ─── 配置 ───────────────────────────────────────────────
  var DEFAULT_OPTIONS = {
    type: 'info',       // info | success | warning | error
    duration: 4000,     // 显示时长（ms）
    position: 'top-right' // top-right | top-center | bottom-center
  };

  var ICONS = {
    error: 'fa-times-circle',
    success: 'fa-check-circle',
    info: 'fa-info-circle',
    warning: 'fa-exclamation-triangle'
  };

  var toastQueue = [];
  var maxVisible = 3;

  // ─── 获取或创建容器 ────────────────────────────────────
  function getOrCreateContainer() {
    var container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      // 如果页面已有 .toast-container（旧容器），复用之
      var existing = document.querySelector('.toast-container');
      if (existing) {
        container = existing;
      } else {
        document.body.appendChild(container);
      }
    }
    return container;
  }

  // ─── HTML 转义（内置，不依赖外部） ──────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    if (typeof str !== 'string') str = String(str);
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ─── 显示单个 Toast ─────────────────────────────────────
  function showToast(message, options) {
    // 兼容旧调用：showToast('消息', 'success')
    if (typeof options === 'string') {
      options = { type: options };
    }
    var opts = {};
    opts.type = (options && options.type) || DEFAULT_OPTIONS.type;
    opts.duration = (options && options.duration) || DEFAULT_OPTIONS.duration;
    opts.position = (options && options.position) || DEFAULT_OPTIONS.position;

    var container = getOrCreateContainer();
    if (!container) return;

    // 限制可见 Toast 数量（FIFO）
    var visibleToasts = container.querySelectorAll('.toast:not(.fade-out)');
    while (visibleToasts.length >= maxVisible) {
      var oldest = visibleToasts[0];
      oldest.classList.add('fade-out');
      setTimeout(function () {
        if (oldest.parentNode) oldest.parentNode.removeChild(oldest);
      }, 300);
      visibleToasts = container.querySelectorAll('.toast:not(.fade-out)');
    }

    // 创建 Toast 元素
    var toast = document.createElement('div');
    toast.className = 'toast ' + (opts.type || 'info');
    var icon = ICONS[opts.type] || ICONS.info;
    toast.innerHTML = '<i class="fas ' + icon + '"></i> ' + escapeHtml(message);

    container.appendChild(toast);

    // 自动移除
    var timer = setTimeout(function () {
      dismissToast(toast);
    }, opts.duration);

    // 存储 timer 引用，支持手动关闭
    toast._dismissTimer = timer;

    // 点击关闭
    toast.addEventListener('click', function () {
      clearTimeout(toast._dismissTimer);
      dismissToast(toast);
    });

    return toast;
  }

  // ─── 关闭 Toast ─────────────────────────────────────────
  function dismissToast(toast) {
    if (!toast || !toast.parentNode) return;
    clearTimeout(toast._dismissTimer);
    toast.classList.add('fade-out');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

  // ─── 便捷方法 ───────────────────────────────────────────
  function success(message, options) {
    var opts = options || {};
    opts.type = 'success';
    return showToast(message, opts);
  }

  function error(message, options) {
    var opts = options || {};
    opts.type = 'error';
    return showToast(message, opts);
  }

  function info(message, options) {
    var opts = options || {};
    opts.type = 'info';
    return showToast(message, opts);
  }

  function warning(message, options) {
    var opts = options || {};
    opts.type = 'warning';
    return showToast(message, opts);
  }

  // ─── 关闭所有 Toast ────────────────────────────────────
  function dismissAll() {
    var container = getOrCreateContainer();
    if (!container) return;
    var toasts = container.querySelectorAll('.toast');
    for (var i = 0; i < toasts.length; i++) {
      dismissToast(toasts[i]);
    }
  }

  // ─── 注册到 YJ.components ──────────────────────────────
  YJ.components.toast = {
    show: showToast,
    success: success,
    error: error,
    info: info,
    warning: warning,
    dismiss: dismissToast,
    dismissAll: dismissAll
  };

  window.YJ = YJ;

  // ─── 向后兼容：确保全局 showToast 可用 ─────────────────
  // 内联脚本在加载时已经定义了 window.showToast，这里做一个引用检查
  // 如果因为某种原因不存在（例如未来的新页面不加载内联脚本），则使用组件版本
  if (typeof window.showToast === 'undefined') {
    window.showToast = showToast;
  }

  // 同样为 utils.js / enterprise 模块提供兼容
  // 注意：它们通过 `var showToast = utils.showToast || window.showToast` 引用
  // 由于 utils.js 已经定义 YJ.utils.showToast，这里不覆盖

  console.log('[Components] Toast initialized — YJ.components.toast available');
})();
