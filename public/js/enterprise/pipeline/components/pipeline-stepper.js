/**
 * YuJian Enterprise — Pipeline Stepper Component
 *
 * Phase DigitalHuman-Rebuild-004 Step4-G6
 *
 * 职责：纯展示组件，只读 ViewModel 切片 `detail.steps[]`
 *       （固定 4 项：key/label/statusMeta/isCurrent），渲染四层步骤条。
 *       高亮当前层（isCurrent），标注 failed 层（statusMeta.tone）。
 *
 * 输入：steps —— 来自 YJ.state.pipeline.detail.steps（固定顺序 vision → script → tts → digitalHuman）
 * 输出：<ol class="yjp-stepper" role="list">…</ol> DOM
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不 fetch / 不调用 API / 不修改 state
 *   ❌ 不比较层名/状态字符串、不解构下划线命名的数据字段
 *     —— 仅读 Adapter 已派生的 isCurrent（布尔）与 statusMeta.tone（语义键）
 *   ❌ 无 hex 颜色、无新增颜色变量
 *   ✅ tone → 颜色令牌只读 Adapter 的 YJ.pipelineAdapter.TONE_TOKENS（G4 §8 唯一映射）
 *   ✅ 顺序由 steps 数组顺序决定，不排序、不 Object.keys 遍历
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var STYLE_ID = 'yjp-stepper-style';

  // tone → Font Awesome 图标（沿用项目既有 fa-* 图标集，非 emoji）
  // muted（待执行/已跳过）不配图标，改为显示步骤序号
  var TONE_ICONS = {
    info: 'fa-circle-notch fa-spin',
    success: 'fa-check',
    danger: 'fa-times',
    muted: null
  };

  /** 注入组件作用域样式（幂等，仅引用 design-tokens.css 令牌） */
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.yjp-stepper{display:flex;flex-wrap:wrap;gap:var(--space-2);margin:0;padding:0;list-style:none;}',
      '.yjp-step{display:flex;align-items:flex-start;gap:var(--space-2);flex:1 1 160px;min-width:0;',
      '  padding:var(--space-2);border-radius:var(--radius-md);}',
      '.yjp-step--current{background:var(--bg-card);}',
      '.yjp-step__marker{display:inline-flex;align-items:center;justify-content:center;',
      '  width:22px;height:22px;flex:none;border-radius:var(--radius-full);',
      '  border:1px solid transparent;font-size:var(--text-xs);}',
      '.yjp-step__body{display:flex;flex-direction:column;gap:2px;min-width:0;}',
      '.yjp-step__label{font-size:var(--text-sm);font-weight:var(--font-medium);color:var(--text-primary);}',
      '.yjp-step__status{font-size:var(--text-xs);color:var(--text-secondary);}',
      '@media (prefers-reduced-motion: reduce){',
      '  .yjp-step__marker .fa-spin{animation:none;}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /** 解析 tone → { text, bg, border } 令牌三元组（唯一来源 Adapter TONE_TOKENS） */
  function resolveTone(tone) {
    var tokens = (window.YJ && window.YJ.pipelineAdapter && window.YJ.pipelineAdapter.TONE_TOKENS) || null;
    if (!tokens) return null;
    return tokens[tone] || tokens.muted || null;
  }

  /** 纯构建：steps[] → 步骤条 DOM（不触碰 container / state） */
  function create(steps) {
    var list = document.createElement('ol');
    list.className = 'yjp-stepper';
    list.setAttribute('role', 'list');

    var items = Array.isArray(steps) ? steps : [];
    for (var i = 0; i < items.length; i++) {
      var step = items[i] || {};
      var meta = step.statusMeta || {};
      var tone = meta.tone || 'muted';
      var tokens = resolveTone(tone);
      var isCurrent = !!step.isCurrent;

      var li = document.createElement('li');
      li.className = 'yjp-step';
      if (isCurrent) li.className += ' yjp-step--current';
      li.setAttribute('role', 'listitem');
      if (isCurrent) li.setAttribute('aria-current', 'step');

      var marker = document.createElement('span');
      marker.className = 'yjp-step__marker';
      if (tokens) {
        marker.style.color = tokens.text;
        marker.style.backgroundColor = tokens.bg;
        marker.style.borderColor = tokens.border;
      }
      marker.setAttribute('aria-hidden', 'true');

      var icon = TONE_ICONS[tone];
      if (icon) {
        var iconEl = document.createElement('i');
        iconEl.className = 'fas ' + icon;
        marker.appendChild(iconEl);
      } else {
        marker.textContent = String(i + 1);
      }

      var body = document.createElement('span');
      body.className = 'yjp-step__body';

      var label = document.createElement('span');
      label.className = 'yjp-step__label';
      label.textContent = step.label || ('步骤 ' + (i + 1));
      body.appendChild(label);

      var status = document.createElement('span');
      status.className = 'yjp-step__status';
      status.textContent = meta.label || '';
      body.appendChild(status);

      li.appendChild(marker);
      li.appendChild(body);
      list.appendChild(li);
    }
    return list;
  }

  /** 渲染：清空容器后挂载步骤条，返回根元素（幂等，可随轮询重复调用） */
  function render(container, steps) {
    ensureStyles();
    if (!container) return null;
    var el = create(steps);
    container.innerHTML = '';
    container.appendChild(el);
    return el;
  }

  // ─── 挂载到 YJ.components.pipeline ──────────────────────
  var YJ = window.YJ || {};
  if (!YJ.components) YJ.components = {};
  if (!YJ.components.pipeline) YJ.components.pipeline = {};
  YJ.components.pipeline.stepper = {
    create: create,
    render: render
  };
  window.YJ = YJ;

  console.log('[Enterprise/Pipeline/Component] stepper initialized (Phase DigitalHuman-Rebuild-004 Step4-G6)');
})();
