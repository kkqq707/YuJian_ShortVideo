/**
 * YuJian Enterprise — Pipeline Progress Component
 *
 * Phase DigitalHuman-Rebuild-004 Step4-G6
 *
 * 职责：纯展示组件，只读 ViewModel 切片 `progress`（0–100 整数），
 *       渲染一条语义化进度条 + 百分比文本。
 *
 * 输入：progress —— 来自 YJ.state.pipeline.detail.progress（0–100 整数）
 * 输出：<div class="yjp-progress" role="progressbar">…</div> DOM
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不 fetch / 不调用 API / 不修改 state
 *   ❌ 不比较层名/状态字符串、不解构下划线命名的数据字段
 *   ❌ 无 hex 颜色、无新增颜色变量
 *   ✅ 颜色只用 design-tokens.css 令牌（进度填充用品牌色 var(--primary)）
 *   ✅ 尊重 prefers-reduced-motion；填充动画只用 transform（scaleX），不用 width
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var STYLE_ID = 'yjp-progress-style';

  /** 注入组件作用域样式（幂等，仅引用 design-tokens.css 令牌） */
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.yjp-progress{display:flex;align-items:center;gap:var(--space-3);}',
      '.yjp-progress__track{position:relative;flex:1;height:6px;border-radius:var(--radius-full);',
      '  background:var(--bg-card);overflow:hidden;}',
      '.yjp-progress__fill{position:absolute;left:0;top:0;bottom:0;width:100%;',
      '  background:var(--primary);transform-origin:left center;transform:scaleX(0);}',
      '@media (prefers-reduced-motion: no-preference){',
      '  .yjp-progress__fill{transition:transform var(--duration-normal) var(--ease-out);}}',
      '.yjp-progress__value{font-size:var(--text-xs);color:var(--text-secondary);',
      '  font-variant-numeric:tabular-nums;min-width:2.75rem;text-align:right;white-space:nowrap;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /** 归一化 0–100 整数（组件级防御，与 Adapter 一致；仅数值裁剪，非业务判断） */
  function normalizeProgress(n) {
    var v = (typeof n === 'number' && isFinite(n)) ? Math.round(n) : 0;
    if (v < 0) v = 0;
    if (v > 100) v = 100;
    return v;
  }

  /** 纯构建：progress → 进度条 DOM（不触碰 container / state） */
  function create(progress) {
    var value = normalizeProgress(progress);

    var root = document.createElement('div');
    root.className = 'yjp-progress';
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', '100');
    root.setAttribute('aria-valuenow', String(value));
    root.setAttribute('aria-label', '流水线进度');

    var track = document.createElement('div');
    track.className = 'yjp-progress__track';

    var fill = document.createElement('div');
    fill.className = 'yjp-progress__fill';
    fill.style.transform = 'scaleX(' + (value / 100) + ')';
    track.appendChild(fill);

    var text = document.createElement('span');
    text.className = 'yjp-progress__value';
    text.textContent = value + '%';

    root.appendChild(track);
    root.appendChild(text);
    return root;
  }

  /** 渲染：清空容器后挂载进度条，返回根元素（幂等，可随轮询重复调用） */
  function render(container, progress) {
    ensureStyles();
    if (!container) return null;
    var el = create(progress);
    container.innerHTML = '';
    container.appendChild(el);
    return el;
  }

  // ─── 挂载到 YJ.components.pipeline ──────────────────────
  var YJ = window.YJ || {};
  if (!YJ.components) YJ.components = {};
  if (!YJ.components.pipeline) YJ.components.pipeline = {};
  YJ.components.pipeline.progress = {
    create: create,
    render: render
  };
  window.YJ = YJ;

  console.log('[Enterprise/Pipeline/Component] progress initialized (Phase DigitalHuman-Rebuild-004 Step4-G6)');
})();
