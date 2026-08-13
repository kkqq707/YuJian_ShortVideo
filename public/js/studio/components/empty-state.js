/**
 * YuJian Studio — Empty State Component
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D3-D
 *
 * 职责：统一空状态展示（「教会界面」空态，非「这里什么都没有」）。
 *
 * 输入：{ container, title, description, icon, action }
 *   action 可选：{ label, onClick }
 * 输出：<div class="studio-empty-state">…</div> DOM
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不调用 API / 不修改 State
 *   ❌ 禁止 emoji（图标只用 Font Awesome fa-*）
 *   ❌ 无 hex 颜色、无新增颜色变量
 *   ✅ 动态文本一律 textContent（防 XSS）
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var DEFAULT_ICON = 'fa-inbox';
  var DEFAULT_TITLE = '暂无内容';

  /** 纯构建：props → 空态 DOM（不触碰 container / state） */
  function create(config) {
    var opts = config || {};

    var root = document.createElement('div');
    root.className = 'studio-empty-state';

    var icon = document.createElement('i');
    icon.className = 'fas ' + (opts.icon || DEFAULT_ICON) + ' studio-empty-state__icon';
    icon.setAttribute('aria-hidden', 'true');
    root.appendChild(icon);

    var title = document.createElement('h3');
    title.className = 'studio-empty-state__title';
    title.textContent = opts.title || DEFAULT_TITLE;
    root.appendChild(title);

    if (opts.description) {
      var desc = document.createElement('p');
      desc.className = 'studio-empty-state__desc';
      desc.textContent = opts.description;
      root.appendChild(desc);
    }

    if (opts.action) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'yj-btn yj-btn-primary studio-empty-state__action';
      btn.textContent = opts.action.label || '开始';
      if (typeof opts.action.onClick === 'function') {
        btn.addEventListener('click', opts.action.onClick);
      }
      root.appendChild(btn);
    }

    return root;
  }

  /** 渲染：清空容器后挂载空态，返回根元素（幂等，可重复调用） */
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
  YJ.studio.components.emptyState = {
    create: create,
    render: render
  };
  window.YJ = YJ;

  console.log('[Studio/Component] emptyState initialized (Phase DigitalHuman-Rebuild-004 Step5-D3-D)');
})();
