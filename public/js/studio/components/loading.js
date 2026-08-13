/**
 * YuJian Studio — Loading Component
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D3-D
 *
 * 职责：Skeleton 加载骨架，统一 list / card / progress 三类占位形状。
 *
 * 输入：{ container, variant, count }
 *   variant: 'list' | 'card' | 'progress'
 * 输出：<div class="studio-loading" role="status" aria-busy="true">…</div> DOM
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不调用 API / 不修改 State
 *   ❌ 禁止新增 spinner 体系（必须复用 .yj-skeleton 渐变）
 *   ❌ 无 hex 颜色、无新增颜色变量
 *   ✅ 尊重 prefers-reduced-motion
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var DEFAULT_COUNT = 6;
  var VALID_VARIANTS = ['list', 'card', 'progress'];

  /** 归一化 count：正整数，越界回退默认值（仅数值裁剪，非业务判断） */
  function normalizeCount(n) {
    var v = (typeof n === 'number' && isFinite(n) && n >= 1) ? Math.floor(n) : DEFAULT_COUNT;
    return v;
  }

  /** 纯构建：props → 骨架 DOM（复用 .yj-skeleton，不触碰 container / state） */
  function create(config) {
    var opts = config || {};
    var variant = VALID_VARIANTS.indexOf(opts.variant) >= 0 ? opts.variant : 'list';
    var count = normalizeCount(opts.count);

    var root = document.createElement('div');
    root.className = 'studio-loading studio-loading--' + variant;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-busy', 'true');
    root.setAttribute('aria-label', '加载中');

    for (var i = 0; i < count; i++) {
      var item = document.createElement('div');
      item.className = 'yj-skeleton studio-loading__item studio-loading__item--' + variant;
      item.setAttribute('aria-hidden', 'true');
      root.appendChild(item);
    }

    return root;
  }

  /** 渲染：清空容器后挂载骨架，返回根元素（幂等，可重复调用） */
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
  YJ.studio.components.loading = {
    create: create,
    render: render
  };
  window.YJ = YJ;

  console.log('[Studio/Component] loading initialized (Phase DigitalHuman-Rebuild-004 Step5-D3-D)');
})();
