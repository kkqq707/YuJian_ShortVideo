/**
 * YuJian Enterprise — Pipeline Error Panel Component
 *
 * Phase DigitalHuman-Rebuild-004 Step4-G6
 *
 * 职责：纯展示组件，只读 ViewModel 切片 `diagnostic`（hasError/error），
 *       渲染错误诊断面板：hasError=true 展示错误详情，否则渲染「无错误记录」空态。
 *
 * 输入：diagnostic —— 来自 YJ.state.pipeline.diagnostic（hasError / error）
 * 输出：<div class="yjp-error-panel" role="alert|status">…</div> DOM
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不 fetch / 不调用 API / 不修改 state
 *   ❌ 不比较层名/状态字符串、不解构下划线命名的数据字段
 *   ❌ 无 hex 颜色、无新增颜色变量（错误态直接用 design-tokens 语义令牌）
 *   ✅ 先判 hasError，再逐子字段判空降级（error=null 是预期态，非异常）
 *   ✅ 所有动态文本走 textContent，防 XSS
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var STYLE_ID = 'yjp-error-panel-style';

  /** 注入组件作用域样式（幂等，仅引用 design-tokens.css 令牌） */
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.yjp-error-panel{display:flex;flex-direction:column;gap:var(--space-3);',
      '  padding:var(--space-4);border-radius:var(--radius-lg);',
      '  border:1px solid var(--border-subtle);background:var(--bg-surface);}',
      '.yjp-error-panel--error{border-color:var(--danger);background:var(--danger-bg);}',
      '.yjp-error-panel--empty{flex-direction:row;align-items:center;color:var(--text-secondary);}',
      '.yjp-error-panel__header{display:flex;align-items:center;gap:var(--space-2);',
      '  color:var(--danger);font-weight:var(--font-semibold);font-size:var(--text-base);}',
      '.yjp-error-panel__detail{display:flex;flex-direction:column;gap:var(--space-2);margin:0;}',
      '.yjp-error-panel__row{display:flex;gap:var(--space-3);}',
      '.yjp-error-panel__row dt{flex:none;min-width:4.5rem;color:var(--text-muted);font-size:var(--text-sm);}',
      '.yjp-error-panel__row dd{margin:0;color:var(--text-primary);font-size:var(--text-sm);',
      '  word-break:break-word;}',
      '.yjp-error-panel__empty-icon{color:var(--success);}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /** 空态：无错误记录（教会界面，非空白） */
  function createEmptyState() {
    var root = document.createElement('div');
    root.className = 'yjp-error-panel yjp-error-panel--empty';
    root.setAttribute('role', 'status');

    var icon = document.createElement('i');
    icon.className = 'fas fa-check-circle yjp-error-panel__empty-icon';
    icon.setAttribute('aria-hidden', 'true');
    root.appendChild(icon);

    var text = document.createElement('span');
    text.textContent = '无错误记录';
    root.appendChild(text);

    return root;
  }

  /** 错误态：逐子字段判空降级后渲染错误详情 */
  function createErrorState(error) {
    var err = error || {};

    var root = document.createElement('div');
    root.className = 'yjp-error-panel yjp-error-panel--error';
    root.setAttribute('role', 'alert');

    var header = document.createElement('div');
    header.className = 'yjp-error-panel__header';

    var headerIcon = document.createElement('i');
    headerIcon.className = 'fas fa-exclamation-circle';
    headerIcon.setAttribute('aria-hidden', 'true');
    header.appendChild(headerIcon);

    var headerText = document.createElement('span');
    headerText.textContent = '流水线执行失败';
    header.appendChild(headerText);

    root.appendChild(header);

    var detail = document.createElement('dl');
    detail.className = 'yjp-error-panel__detail';

    var rows = [
      { term: '错误码', value: err.code || 'UNKNOWN' },
      { term: '失败层', value: err.failedLayerLabel || '未知层' },
      { term: '重试次数', value: String(err.retryCount != null ? err.retryCount : 0) },
      { term: '错误信息', value: err.providerMessage || '暂无详细错误信息' }
    ];

    for (var i = 0; i < rows.length; i++) {
      var row = document.createElement('div');
      row.className = 'yjp-error-panel__row';

      var term = document.createElement('dt');
      term.textContent = rows[i].term;
      var value = document.createElement('dd');
      value.textContent = rows[i].value;

      row.appendChild(term);
      row.appendChild(value);
      detail.appendChild(row);
    }

    root.appendChild(detail);
    return root;
  }

  /** 纯构建：diagnostic → 错误面板 DOM（不触碰 container / state） */
  function create(diagnostic) {
    var diag = diagnostic || {};
    if (diag.hasError) {
      return createErrorState(diag.error);
    }
    return createEmptyState();
  }

  /** 渲染：清空容器后挂载错误面板，返回根元素（幂等，可随轮询重复调用） */
  function render(container, diagnostic) {
    ensureStyles();
    if (!container) return null;
    var el = create(diagnostic);
    container.innerHTML = '';
    container.appendChild(el);
    return el;
  }

  // ─── 挂载到 YJ.components.pipeline ──────────────────────
  var YJ = window.YJ || {};
  if (!YJ.components) YJ.components = {};
  if (!YJ.components.pipeline) YJ.components.pipeline = {};
  YJ.components.pipeline.errorPanel = {
    create: create,
    render: render
  };
  window.YJ = YJ;

  console.log('[Enterprise/Pipeline/Component] errorPanel initialized (Phase DigitalHuman-Rebuild-004 Step4-G6)');
})();
