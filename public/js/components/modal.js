/**
 * YuJian Modal Component — Phase 0
 *
 * 统一的模态框组件
 *
 * 向后兼容：
 *   - 旧代码：openModal('标题', encodedContent)  ← 仍然可用
 *   - 旧代码：closeModal()                        ← 仍然可用
 *   - 新代码：YJ.components.modal.open({ title: '标题', content: '...' })
 *   - 新代码：YJ.components.modal.close()
 *
 * 此文件在 enterprise.html 内联脚本之后、enterprise 模块之前加载
 * 保留已有的 openModal/closeModal 全局函数（内联脚本定义）
 * 同时提供 YJ.components.modal API 作为新入口
 */

(function () {
  'use strict';

  var YJ = window.YJ || {};

  // ─── 确保命名空间存在 ───────────────────────────────────
  if (!YJ.components) {
    YJ.components = {};
  }

  // ─── 内部状态 ───────────────────────────────────────────
  var callbacks = {
    onOpen: null,
    onClose: null
  };

  // ─── 获取 DOM 元素 ──────────────────────────────────────
  function getOverlay() {
    return document.getElementById('modalOverlay');
  }

  function getTitleEl() {
    return document.getElementById('modalTitle');
  }

  function getContentEl() {
    return document.getElementById('modalContent');
  }

  function getFooterEl() {
    return document.getElementById('modalFooter');
  }

  function getConfirmBtn() {
    return document.getElementById('modalConfirmBtn');
  }

  // ─── 重置 Modal 默认状态 ───────────────────────────────
  function resetModal() {
    var footer = getFooterEl();
    if (footer) footer.style.display = '';

    var confirmBtn = getConfirmBtn();
    if (confirmBtn) {
      confirmBtn.className = 'btn btn-primary';
      confirmBtn.innerText = '确认';
      confirmBtn.onclick = function () { closeModal(); };
    }
  }

  // ─── 打开模态框 ─────────────────────────────────────────
  function open(config) {
    // 兼容旧调用：openModal('标题', encodedContent)
    if (typeof config === 'string') {
      var title = arguments[0];
      var contentEncoded = arguments[1];
      document.getElementById('modalTitle').innerText = title;
      document.getElementById('modalContent').innerHTML = decodeURIComponent(contentEncoded || '');
      var overlay = getOverlay();
      if (overlay) overlay.classList.add('show');
      return;
    }

    // 新 API：{ title, content, footer, size, onConfirm, onClose, showFooter }
    var opts = config || {};

    var titleEl = getTitleEl();
    var contentEl = getContentEl();
    var footerEl = getFooterEl();
    var confirmBtn = getConfirmBtn();
    var overlay = getOverlay();

    if (!overlay) return;

    // 设置标题
    if (titleEl && opts.title) {
      titleEl.innerText = opts.title;
    }

    // 设置内容（支持 HTML 字符串）
    if (contentEl && opts.content !== undefined) {
      contentEl.innerHTML = opts.content;
    }

    // 设置底部
    if (footerEl) {
      if (opts.showFooter === false) {
        footerEl.style.display = 'none';
      } else {
        footerEl.style.display = '';
      }
    }

    // 确认按钮
    if (confirmBtn) {
      if (opts.confirmText) {
        confirmBtn.innerText = opts.confirmText;
      }
      if (opts.confirmClass) {
        confirmBtn.className = opts.confirmClass;
      }
      confirmBtn.onclick = function () {
        if (typeof opts.onConfirm === 'function') {
          var shouldClose = opts.onConfirm();
          if (shouldClose !== false) {
            close();
          }
        } else {
          close();
        }
      };
    }

    // 大小
    var modalBox = overlay.querySelector('.modal');
    if (modalBox && opts.size) {
      modalBox.className = 'modal modal-' + opts.size;
    }

    // onClose 回调
    callbacks.onClose = opts.onClose || null;

    // onOpen 回调
    if (typeof opts.onOpen === 'function') {
      callbacks.onOpen = opts.onOpen;
    }

    // 显示
    overlay.classList.add('show');

    if (typeof callbacks.onOpen === 'function') {
      callbacks.onOpen();
    }
  }

  // ─── 关闭模态框 ─────────────────────────────────────────
  function close() {
    var overlay = getOverlay();
    if (!overlay) return;

    overlay.classList.remove('show');

    resetModal();

    if (typeof callbacks.onClose === 'function') {
      var cb = callbacks.onClose;
      callbacks.onClose = null;
      cb();
    }
  }

  // ─── 判断是否打开 ───────────────────────────────────────
  function isOpen() {
    var overlay = getOverlay();
    return overlay ? overlay.classList.contains('show') : false;
  }

  // ─── 设置确认按钮 ───────────────────────────────────────
  function setConfirm(text, onClick, className) {
    var confirmBtn = getConfirmBtn();
    if (!confirmBtn) return;
    if (text) confirmBtn.innerText = text;
    if (className) confirmBtn.className = className;
    if (typeof onClick === 'function') {
      confirmBtn.onclick = function () {
        var shouldClose = onClick();
        if (shouldClose !== false) {
          close();
        }
      };
    }
  }

  // ─── 注册到 YJ.components ──────────────────────────────
  YJ.components.modal = {
    open: open,
    close: close,
    isOpen: isOpen,
    setConfirm: setConfirm,
    getOverlay: getOverlay,
    getTitleEl: getTitleEl,
    getContentEl: getContentEl
  };

  window.YJ = YJ;

  console.log('[Components] Modal initialized — YJ.components.modal available');
})();
