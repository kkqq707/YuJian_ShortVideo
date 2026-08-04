/**
 * YuJian PromptTemplates — Prompt 模板系统
 *
 * Sprint 4.3: 静态前端模板，降低用户 Prompt 编写门槛
 *
 * 使用方式：
 *   // 渲染模板卡片到指定容器
 *   YuJianPromptTemplates.render('.template-selector', 'i2vPrompt');
 *
 *   // 获取所有模板
 *   YuJianPromptTemplates.getTemplates();
 */

(function () {
  'use strict';

  // ─── 模板数据（静态 JSON） ─────────────────────────────────

  /**
   * 创作模板列表
   * 每个模板包含用于图生视频的 motion prompt（描述动态效果）
   */
  var TEMPLATES = [
    {
      id: 'movie-blockbuster',
      name: '电影大片',
      icon: '🎬',
      prompt: '电影级光影，镜头缓慢推进，画面富有史诗感，色彩浓郁饱满，浅景深虚化背景，人物主体突出，柔和的胶片颗粒质感，24fps电影帧率，动态模糊自然流畅'
    },
    {
      id: 'portrait-photo',
      name: '人物写真',
      icon: '👤',
      prompt: '人物保持自然优雅的微动作，发丝轻柔飘动，眼神温和有光，背景光斑缓缓旋转，画面有呼吸感，柔焦效果，整体氛围温暖治愈，高端写真质感'
    },
    {
      id: 'product-ad',
      name: '产品广告',
      icon: '🛍',
      prompt: '产品主体精致展示，光影在产品表面流动，镜头以产品为中心环绕旋转，背景干净简约，粒子光效点缀，高端广告质感，画面明亮通透'
    },
    {
      id: 'chinese-anime',
      name: '国风动画',
      icon: '🏮',
      prompt: '中国传统水墨风格动画，墨色浓淡渐变晕染，笔触流动自然，古风元素灵动飘逸，画面留白有韵味，绢本质感，暖色调光晕，诗意氛围'
    },
    {
      id: 'product-showcase',
      name: '产品展示',
      icon: '📦',
      prompt: '产品360度旋转展示，镜头平滑环绕，细节特写切换流畅，光线均匀柔和，纯色背景突出产品，画面干净专业，电商展示风格'
    },
    {
      id: 'game-cg',
      name: '游戏CG',
      icon: '🎮',
      prompt: '游戏CG级别渲染，画面具有强烈的视觉冲击力，粒子特效绚丽，光影对比强烈，动态运镜充满力量感，色彩鲜艳饱和，次世代游戏画面质感'
    }
  ];

  // ─── 模板选择器组件 ───────────────────────────────────────

  /**
   * 渲染模板选择器到指定容器
   *
   * @param {string|Element} container - 容器选择器或 DOM 元素
   * @param {string} targetInputId   - 目标 prompt 输入框的 id
   */
  function render(container, targetInputId) {
    var el = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    if (!el) {
      console.warn('[PromptTemplates] 容器不存在:', container);
      return;
    }

    if (!targetInputId) {
      console.warn('[PromptTemplates] 未指定目标输入框');
      return;
    }

    // 构建模板卡片 HTML
    var html = '<div class="template-selector">';
    html += '<div class="template-selector-label">创作模板</div>';
    html += '<div class="template-cards">';

    TEMPLATES.forEach(function (tmpl) {
      html +=
        '<div class="template-card" ' +
        'data-template-id="' + tmpl.id + '" ' +
        'data-template-prompt="' + escapeAttr(tmpl.prompt) + '" ' +
        'data-target-input="' + targetInputId + '" ' +
        'onclick="YuJianPromptTemplates.handleSelect(this)" ' +
        'title="点击应用「' + tmpl.name + '」模板">' +
        '<span class="template-card-icon">' + tmpl.icon + '</span>' +
        '<span class="template-card-name">' + tmpl.name + '</span>' +
        '</div>';
    });

    html += '</div></div>';

    el.innerHTML = html;
  }

  /**
   * 处理模板卡片点击
   *
   * 交互逻辑：
   * - prompt 为空 → 直接填充
   * - prompt 已有内容 → 弹窗确认是否替换
   *
   * @param {Element} cardEl - 被点击的模板卡片
   */
  function handleSelect(cardEl) {
    var templateId = cardEl.getAttribute('data-template-id');
    var templatePrompt = cardEl.getAttribute('data-template-prompt');
    var targetInputId = cardEl.getAttribute('data-target-input');

    // 查找模板数据
    var template = findTemplate(templateId);
    if (!template) return;

    // 查找目标输入框
    var inputEl = document.getElementById(targetInputId);
    if (!inputEl) {
      console.warn('[PromptTemplates] 目标输入框不存在:', targetInputId);
      return;
    }

    var currentPrompt = (inputEl.value || '').trim();

    // ─── prompt 为空，直接填充 ──────────────────────────
    if (!currentPrompt) {
      inputEl.value = templatePrompt;
      // 触发 input 事件以更新字符计数等
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      // 添加选中样式
      highlightCard(cardEl);
      showToast('已应用「' + template.name + '」模板', 'success');
      return;
    }

    // ─── prompt 已有内容，弹窗确认 ───────────────────────
    showConfirmDialog({
      title: '替换当前描述？',
      message: '当前提示词已有内容，使用「' + template.name + '」模板将替换现有描述。',
      confirmText: '确认替换',
      cancelText: '保留当前',
      onConfirm: function () {
        inputEl.value = templatePrompt;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        highlightCard(cardEl);
        showToast('已替换为「' + template.name + '」模板', 'success');
      }
    });
  }

  /**
   * 高亮选中的模板卡片
   */
  function highlightCard(cardEl) {
    // 移除所有卡片的 active 状态
    var allCards = document.querySelectorAll('.template-card');
    allCards.forEach(function (c) { c.classList.remove('active'); });

    // 添加当前卡片的 active 状态
    if (cardEl) {
      cardEl.classList.add('active');
    }
  }

  /**
   * 根据 id 查找模板
   */
  function findTemplate(id) {
    for (var i = 0; i < TEMPLATES.length; i++) {
      if (TEMPLATES[i].id === id) return TEMPLATES[i];
    }
    return null;
  }

  /**
   * 获取所有模板
   */
  function getTemplates() {
    return TEMPLATES.slice();
  }

  // ─── 工具函数 ────────────────────────────────────────────

  /**
   * 转义 HTML 属性值中的特殊字符
   */
  function escapeAttr(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Toast 提示（复用全局 showToast，如果有的话）
   */
  function showToast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      console.log('[PromptTemplates]', msg);
    }
  }

  /**
   * 确认弹窗
   *
   * 复用页面已有的风格，创建内联确认对话框
   */
  function showConfirmDialog(opts) {
    // 检查是否已有弹窗
    var existing = document.getElementById('templateConfirmOverlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'templateConfirmOverlay';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:rgba(0,0,0,0.6);z-index:10000;' +
      'display:flex;align-items:center;justify-content:center;' +
      'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';

    var dialog = document.createElement('div');
    dialog.style.cssText =
      'background:rgba(30,30,40,0.95);border:1px solid rgba(255,255,255,0.12);' +
      'border-radius:16px;padding:28px;max-width:400px;width:90%;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.5);text-align:center;';

    dialog.innerHTML =
      '<div style="font-size:40px;margin-bottom:12px">⚠️</div>' +
      '<h3 style="margin-bottom:10px;font-size:17px;color:#fff">' + (opts.title || '确认操作') + '</h3>' +
      '<p style="color:var(--text-sub);font-size:13px;line-height:1.6;margin-bottom:24px">' + (opts.message || '') + '</p>' +
      '<div style="display:flex;gap:12px;justify-content:center">' +
      '<button id="templateConfirmCancel" style="' +
      'padding:10px 24px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);' +
      'background:transparent;color:#fff;cursor:pointer;font-size:14px;' +
      'transition:all 0.2s;">' + (opts.cancelText || '取消') + '</button>' +
      '<button id="templateConfirmOk" style="' +
      'padding:10px 24px;border-radius:8px;border:none;' +
      'background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;cursor:pointer;' +
      'font-size:14px;font-weight:600;transition:all 0.2s;">' + (opts.confirmText || '确认') + '</button>' +
      '</div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 事件绑定
    var close = function () { overlay.remove(); };

    document.getElementById('templateConfirmCancel').addEventListener('click', close);
    document.getElementById('templateConfirmOk').addEventListener('click', function () {
      close();
      if (typeof opts.onConfirm === 'function') opts.onConfirm();
    });

    // 点击遮罩关闭
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    // ESC 关闭
    var escHandler = function (e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  }

  // ─── 暴露到全局 ──────────────────────────────────────────
  window.YuJianPromptTemplates = {
    TEMPLATES: TEMPLATES,
    render: render,
    handleSelect: handleSelect,
    getTemplates: getTemplates,
    findTemplate: findTemplate
  };

})();
