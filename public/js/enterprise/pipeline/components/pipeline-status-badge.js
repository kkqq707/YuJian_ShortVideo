/**
 * YuJian Enterprise — Pipeline Status Badge Component
 *
 * Phase DigitalHuman-Rebuild-004 Step4-G6
 *
 * 职责：纯展示组件，只读 ViewModel 切片 `statusMeta`（label/tone/terminal），
 *       渲染一个语义化状态徽章。
 *
 * 输入：statusMeta —— 来自 YJ.state.pipeline.detail.statusMeta（label/tone/terminal）
 * 输出：<span class="yjp-badge">…</span> DOM
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不 fetch / 不调用 API / 不修改 state
 *   ❌ 不比较层名/状态字符串、不解构下划线命名的数据字段
 *   ❌ 无 hex 颜色、无新增颜色变量
 *   ✅ tone → 颜色令牌只读 Adapter 的 YJ.pipelineAdapter.TONE_TOKENS（G4 §8 唯一映射）
 *   ✅ 颜色只用 design-tokens.css 语义令牌（经 TONE_TOKENS 的 var(--…) 值）
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var STYLE_ID = 'yjp-status-badge-style';

  // tone → Font Awesome 图标（沿用项目既有 fa-* 图标集，非 emoji）
  var TONE_ICONS = {
    info: 'fa-circle-notch fa-spin',
    success: 'fa-check-circle',
    danger: 'fa-times-circle',
    muted: 'fa-minus-circle'
  };

  /** 注入组件作用域样式（幂等，仅引用 design-tokens.css 令牌） */
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.yjp-badge{display:inline-flex;align-items:center;gap:var(--space-2);',
      '  padding:var(--space-1) var(--space-3);border-radius:var(--radius-full);',
      '  font-size:var(--text-xs);font-weight:var(--font-medium);line-height:var(--leading-normal);',
      '  border:1px solid transparent;white-space:nowrap;}',
      '.yjp-badge__icon{color:inherit;}',
      '.yjp-badge__label{color:inherit;}',
      '@media (prefers-reduced-motion: reduce){',
      '  .yjp-badge__icon.fa-spin{animation:none;}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /**
   * 解析 tone → { text, bg, border } 令牌三元组。
   * 唯一来源是 Adapter 的 TONE_TOKENS（G4 §8）；缺失时回退 muted，再缺失返回 null。
   */
  function resolveTone(tone) {
    var tokens = (window.YJ && window.YJ.pipelineAdapter && window.YJ.pipelineAdapter.TONE_TOKENS) || null;
    if (!tokens) return null;
    return tokens[tone] || tokens.muted || null;
  }

  /** 纯构建：statusMeta → 徽章 DOM（不触碰 container / state） */
  function create(statusMeta) {
    var meta = statusMeta || {};
    var tone = meta.tone || 'muted';
    var tokens = resolveTone(tone);

    var badge = document.createElement('span');
    badge.className = 'yjp-badge';
    if (tokens) {
      badge.style.color = tokens.text;
      badge.style.backgroundColor = tokens.bg;
      badge.style.borderColor = tokens.border;
    }

    var icon = document.createElement('i');
    icon.className = 'fas ' + (TONE_ICONS[tone] || TONE_ICONS.muted);
    icon.className += ' yjp-badge__icon';
    icon.setAttribute('aria-hidden', 'true');
    badge.appendChild(icon);

    var label = document.createElement('span');
    label.className = 'yjp-badge__label';
    label.textContent = meta.label || '未知';
    badge.appendChild(label);

    return badge;
  }

  /** 渲染：清空容器后挂载徽章，返回根元素（幂等，可随轮询重复调用） */
  function render(container, statusMeta) {
    ensureStyles();
    if (!container) return null;
    var el = create(statusMeta);
    container.innerHTML = '';
    container.appendChild(el);
    return el;
  }

  // ─── 挂载到 YJ.components.pipeline ──────────────────────
  var YJ = window.YJ || {};
  if (!YJ.components) YJ.components = {};
  if (!YJ.components.pipeline) YJ.components.pipeline = {};
  YJ.components.pipeline.statusBadge = {
    create: create,
    render: render
  };
  window.YJ = YJ;

  console.log('[Enterprise/Pipeline/Component] statusBadge initialized (Phase DigitalHuman-Rebuild-004 Step4-G6)');
})();
