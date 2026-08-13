/**
 * YuJian Studio — Error Panel Component
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D3-D
 *
 * 职责：请求失败（loadError）横幅，展示 handleError 归一化对象的 friendlyMessage，附「重试」。
 *
 * 输入：{ container, error, onRetry }
 *   error：YJ.studio.api.handleError 归一化对象 { code, message, status, retryable, friendlyMessage }
 * 输出：<div class="studio-error-panel" role="alert">…</div> DOM
 *
 * 硬约束（任务书 §十三）：只展示 error.friendlyMessage；
 *   ❌ 禁止展示 message 原始值 / Provider 英文 / DashScope 错误 / raw。
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不调用 API / 不修改 State
 *   ❌ 无 hex 颜色、无新增颜色变量
 *   ✅ 动态文本一律 textContent（防 XSS）
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var DEFAULT_MSG = '操作失败，请稍后重试';

  /** 纯构建：props → 错误横幅 DOM（不触碰 container / state） */
  function create(config) {
    var opts = config || {};
    var error = opts.error || {};

    var root = document.createElement('div');
    root.className = 'studio-error-panel';
    root.setAttribute('role', 'alert');

    var icon = document.createElement('i');
    icon.className = 'fas fa-exclamation-circle studio-error-panel__icon';
    icon.setAttribute('aria-hidden', 'true');
    root.appendChild(icon);

    var msg = document.createElement('span');
    msg.className = 'studio-error-panel__msg';
    msg.textContent = error.friendlyMessage || DEFAULT_MSG;
    root.appendChild(msg);

    // 重试：仅当 onRetry 提供且 error 未显式标记不可重试时展示
    if (typeof opts.onRetry === 'function' && error.retryable !== false) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'yj-btn yj-btn-secondary studio-error-panel__retry';
      btn.setAttribute('aria-label', '重试');
      btn.textContent = '重试';
      btn.addEventListener('click', opts.onRetry);
      root.appendChild(btn);
    }

    return root;
  }

  /** 渲染：清空容器后挂载错误横幅，返回根元素（幂等，可重复调用） */
  function render(config) {
    var opts = config || {};
    if (!opts.container) return null;
    var el = create(config);
    opts.container.innerHTML = '';
    opts.container.appendChild(el);
    return el;
  }

  // ─── 挂载到 YJ.studio.components ──────────────────────
  var YJ = window.YJ || {};
  if (!YJ.studio) YJ.studio = {};
  if (!YJ.studio.components) YJ.studio.components = {};
  YJ.studio.components.errorPanel = {
    create: create,
    render: render
  };
  window.YJ = YJ;

  console.log('[Studio/Component] errorPanel initialized (Phase DigitalHuman-Rebuild-004 Step5-D3-D)');
})();
