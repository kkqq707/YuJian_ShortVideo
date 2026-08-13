/**
 * YuJian Studio — Select Card Component
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D3-D
 *
 * 职责：Create 流程（选 Avatar/Voice/Script）的「可选卡片」，展示选中态 + 触发选择事件。
 *
 * 输入：{ item, selected, title, imageUrl, meta, onSelect }
 *   selected：boolean（只读，由页面从 state.selection 派生后传入）
 * 输出：<div class="yj-card studio-select-card" role="button">…</div> DOM
 *
 * 状态边界（任务书 §十五 硬约束）：
 *   selected 只读；点击只能回调 onSelect(item)；
 *   ❌ 禁止直接修改 YJ.studio.state；❌ 禁止保存选择状态。
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不调用 API / 不修改 State / 不识别业务字段
 *   ❌ 无 hex 颜色、无新增颜色变量
 *   ✅ 动态文本一律 textContent（防 XSS）
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  /** 纯构建：props → 可选卡片 DOM（不触碰 container / state） */
  function create(config) {
    var opts = config || {};

    var root = document.createElement('div');
    root.className = 'yj-card yj-card-interactive studio-select-card';
    if (opts.selected) {
      root.className += ' yj-card-selected studio-select-card--selected';
    }
    root.setAttribute('role', 'button');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-pressed', opts.selected ? 'true' : 'false');
    if (opts.title) root.setAttribute('aria-label', String(opts.title));

    if (opts.selected) {
      var check = document.createElement('span');
      check.className = 'studio-select-card__check';
      check.setAttribute('aria-hidden', 'true');
      var checkIcon = document.createElement('i');
      checkIcon.className = 'fas fa-check';
      check.appendChild(checkIcon);
      root.appendChild(check);
    }

    if (opts.imageUrl) {
      var media = document.createElement('div');
      media.className = 'studio-select-card__media';
      var img = document.createElement('img');
      img.className = 'studio-select-card__image';
      img.src = opts.imageUrl;
      img.alt = opts.title || '';
      media.appendChild(img);
      root.appendChild(media);
    }

    var body = document.createElement('div');
    body.className = 'studio-select-card__body';

    var title = document.createElement('div');
    title.className = 'studio-select-card__title';
    title.textContent = opts.title || '';
    body.appendChild(title);

    if (opts.meta) {
      var meta = document.createElement('div');
      meta.className = 'studio-select-card__meta';
      meta.textContent = String(opts.meta);
      body.appendChild(meta);
    }

    root.appendChild(body);

    /** 点击/键盘：只回调 onSelect(item)，不写 state */
    function handleSelect() {
      if (typeof opts.onSelect === 'function') {
        opts.onSelect(opts.item);
      }
    }

    root.addEventListener('click', handleSelect);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect();
      }
    });

    return root;
  }

  /**
   * 渲染：清空容器后挂载卡片。
   * 注：select-card 输入无 container 字段，故 render 沿用 pipeline 组件
   *     render(container, config) 范式（区别于其余四个 render(config)）。
   */
  function render(container, config) {
    if (!container) return null;
    var el = create(config);
    container.innerHTML = '';
    container.appendChild(el);
    return el;
  }

  // ─── 挂载到 YJ.studio.components ──────────────────────
  var YJ = window.YJ || {};
  if (!YJ.studio) YJ.studio = {};
  if (!YJ.studio.components) YJ.studio.components = {};
  YJ.studio.components.selectCard = {
    create: create,
    render: render
  };
  window.YJ = YJ;

  console.log('[Studio/Component] selectCard initialized (Phase DigitalHuman-Rebuild-004 Step5-D3-D)');
})();
