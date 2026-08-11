/**
 * YuJian PromptTemplates — Prompt 模板系统
 *
 * Sprint 4.3: 静态前端模板，降低用户 Prompt 编写门槛
 * Phase UI-AICreation-02-B-2.3-D-1: 按 capability 分类过滤
 * Phase UI-AICreation-06-D: 按四模块专业化拆分 capability
 *
 * 使用方式：
 *   // 渲染模板卡片到指定容器（无过滤 — 兼容旧行为）
 *   YuJianPromptTemplates.render('.template-selector', 'i2vPrompt');
 *
 *   // 渲染时按 capability 过滤（四模块独立）
 *   YuJianPromptTemplates.render('.template-selector', 'studioPrompt', 'image');              // 图片生成
 *   YuJianPromptTemplates.render('.template-selector', 'studioPrompt', 'text_to_video');      // 文生视频
 *   YuJianPromptTemplates.render('.template-selector', 'studioPrompt', 'image_to_video');     // 图生视频
 *   YuJianPromptTemplates.render('.template-selector', 'studioPrompt', 'reference_to_video'); // 参考生视频
 *
 *   // 兼容旧 'video' 传参（自动展开为三个视频 capability）
 *   YuJianPromptTemplates.render('.template-selector', 'studioPrompt', 'video');
 *
 *   // 获取所有模板
 *   YuJianPromptTemplates.getTemplates();
 *
 *   // 按 capability 获取模板
 *   YuJianPromptTemplates.getTemplatesByCapability('image_to_video');
 */

(function () {
  'use strict';

  // ─── 模板数据（静态 JSON） ─────────────────────────────────

  /**
   * 创作模板列表
   *
   * 每个模板必须声明 capability 字段，与四模块一一对应：
   *   'image'              — 图片生成（imageGen）
   *   'text_to_video'      — 文生视频（text2video）：描述场景全貌+运镜
   *   'image_to_video'     — 图生视频（image2video）：描述运动/动态效果
   *   'reference_to_video' — 参考生视频（ref2video）：描述特征融合+风格统一
   */
  var TEMPLATES = [
    // ── text_to_video（text2video·文生视频）─────────────────
    {
      id: 'movie-blockbuster',
      name: '电影大片',
      icon: '🎬',
      capability: 'text_to_video',
      prompt: '电影级光影，镜头缓慢推进，画面富有史诗感，色彩浓郁饱满，浅景深虚化背景，人物主体突出，柔和的胶片颗粒质感，24fps电影帧率，动态模糊自然流畅'
    },
    {
      id: 'portrait-photo',
      name: '人物写真',
      icon: '👤',
      capability: 'text_to_video',
      prompt: '人物保持自然优雅的微动作，发丝轻柔飘动，眼神温和有光，背景光斑缓缓旋转，画面有呼吸感，柔焦效果，整体氛围温暖治愈，高端写真质感'
    },
    {
      id: 'product-ad',
      name: '产品广告',
      icon: '🛍',
      capability: 'text_to_video',
      prompt: '产品主体精致展示，光影在产品表面流动，镜头以产品为中心环绕旋转，背景干净简约，粒子光效点缀，高端广告质感，画面明亮通透'
    },
    {
      id: 'chinese-anime',
      name: '国风动画',
      icon: '🏮',
      capability: 'text_to_video',
      prompt: '中国传统水墨风格动画，墨色浓淡渐变晕染，笔触流动自然，古风元素灵动飘逸，画面留白有韵味，绢本质感，暖色调光晕，诗意氛围'
    },
    {
      id: 'game-cg',
      name: '游戏CG',
      icon: '🎮',
      capability: 'text_to_video',
      prompt: '游戏CG级别渲染，画面具有强烈的视觉冲击力，粒子特效绚丽，光影对比强烈，动态运镜充满力量感，色彩鲜艳饱和，次世代游戏画面质感'
    },

    // ── image_to_video（image2video·图生视频）──────────────
    {
      id: 'product-showcase',
      name: '产品展示',
      icon: '📦',
      capability: 'image_to_video',
      prompt: '产品360度旋转展示，镜头平滑环绕，细节特写切换流畅，光线均匀柔和，纯色背景突出产品，画面干净专业，电商展示风格'
    },
    {
      id: 'i2v-subtle-motion',
      name: '微动感',
      icon: '🌊',
      capability: 'image_to_video',
      prompt: '画面保持轻微动态，发丝和衣物自然飘动，背景元素缓缓流动，画面有呼吸感，柔焦效果，自然光线变化，轻微的粒子浮动点缀'
    },
    {
      id: 'i2v-camera-push',
      name: '镜头推进',
      icon: '🎥',
      capability: 'image_to_video',
      prompt: '镜头缓慢向前推进，画面景深逐渐变化，主体细节依次呈现，电影级运镜节奏，平滑稳定的视角移动，空间感逐步增强'
    },
    {
      id: 'i2v-portrait-cinematic',
      name: '人物电影感',
      icon: '🎭',
      capability: 'image_to_video',
      prompt: '人物保持自然优雅的微动作，眼神温和有光，发丝轻柔飘动，浅景深虚化背景，柔和的胶片颗粒质感，电影级光影氛围，画面有呼吸感'
    },

    // ── reference_to_video（ref2video·参考生视频）───────────
    {
      id: 'ref2v-consistent-fusion',
      name: '特征融合',
      icon: '🖼️',
      capability: 'reference_to_video',
      prompt: '基于参考图特征进行融合生成，保持人物面部特征一致，画面风格统一，多图特征自然过渡，光影色调一致，动态流畅不突兀，整体协调自然'
    },
    {
      id: 'ref2v-style-transfer',
      name: '风格迁移',
      icon: '🎨',
      capability: 'reference_to_video',
      prompt: '将参考图的风格特征应用到生成的视频中，保持风格统一性，色彩基调一致，笔触纹理特征延续，画面整体协调，艺术风格鲜明，视觉连贯'
    },
    {
      id: 'ref2v-scene-compose',
      name: '场景组合',
      icon: '🎬',
      capability: 'reference_to_video',
      prompt: '参考图元素重新组合到动态场景中，各参考特征在画面中协调呈现，镜头平滑过渡，场景氛围统一，元素融合自然不违和，整体视觉和谐'
    },

    // ── image（imageGen·图片生成）────────────────────────────
    {
      id: 'image-portrait',
      name: '人物肖像',
      icon: '📷',
      capability: 'image',
      prompt: '专业人像摄影，柔和自然光从侧前方打亮面部，眼神深邃有故事感，浅景深虚化背景，皮肤质感细腻真实，色彩温暖自然，高端杂志封面质感，8K超高清细节'
    },
    {
      id: 'image-product-photo',
      name: '产品摄影',
      icon: '💎',
      capability: 'image',
      prompt: '商业产品摄影，产品主体居中构图，影棚级布光突出材质与轮廓，干净的纯色渐变背景，水珠或光斑点缀增强质感，画面通透锐利，高端电商广告风格，超写实渲染'
    },
    {
      id: 'image-concept-art',
      name: '概念艺术',
      icon: '🎨',
      capability: 'image',
      prompt: '概念艺术插画，宏大的世界观场景设定，丰富的环境细节与层次感，戏剧性的光影对比营造氛围，独特的艺术风格与色彩基调，画面具有强烈的叙事性与想象空间，数字绘画大师级品质'
    },
    {
      id: 'image-movie-poster',
      name: '电影海报',
      icon: '🎭',
      capability: 'image',
      prompt: '电影海报设计，精心构图的角色群像或关键场景，强烈的视觉中心与标题留白区域，电影级色彩调色与光影氛围，字体排版预留空间，戏剧化的情绪张力，高端影视宣传风格'
    }
  ];

  // ─── 模板选择器组件 ───────────────────────────────────────

  /**
   * 渲染模板选择器到指定容器
   *
   * @param {string|Element} container    - 容器选择器或 DOM 元素
   * @param {string}          targetInputId - 目标 prompt 输入框的 id
   * @param {string}          [capability]  - 可选，按 capability 过滤模板：
   *                                          'image' | 'text_to_video' | 'image_to_video' | 'reference_to_video'
   *                                          传 'video' 兼容旧行为（展开为三个视频 capability）
   *                                          不传则渲染全部模板
   */
  function render(container, targetInputId, capability) {
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

    // ── Phase UI-AICreation-06-D: 向后兼容 'video' capability ──
    // 旧 'video' 展开为三个细粒度视频 capability，待调用方全部迁移后移除
    var COMPAT_VIDEO_CAPABILITIES = ['text_to_video', 'image_to_video', 'reference_to_video'];

    // ── Phase UI-AICreation-02-B-2.3-D-1: 按 capability 过滤 ──
    var filtered;
    if (!capability) {
      filtered = TEMPLATES;
    } else if (capability === 'video') {
      // 兼容旧 'video' 传参 — 展开为全部视频子类型
      filtered = TEMPLATES.filter(function (tmpl) {
        return COMPAT_VIDEO_CAPABILITIES.indexOf(tmpl.capability) !== -1;
      });
    } else {
      filtered = TEMPLATES.filter(function (tmpl) { return tmpl.capability === capability; });
    }

    // 构建模板卡片 HTML
    var html = '<div class="template-selector">';
    html += '<div class="template-selector-label">创作模板</div>';
    html += '<div class="template-cards">';

    filtered.forEach(function (tmpl) {
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

  /**
   * 按 capability 获取模板列表
   *
   * @param {string} capability — 'image' | 'text_to_video' | 'image_to_video' | 'reference_to_video'
   *                              传 'video' 兼容旧行为（展开为三个视频 capability）
   * @returns {object[]} 匹配的模板数组
   */
  function getTemplatesByCapability(capability) {
    if (!capability) return TEMPLATES.slice();
    // Phase UI-AICreation-06-D: 向后兼容 'video'
    if (capability === 'video') {
      var COMPAT_VIDEO_CAPABILITIES = ['text_to_video', 'image_to_video', 'reference_to_video'];
      return TEMPLATES.filter(function (tmpl) {
        return COMPAT_VIDEO_CAPABILITIES.indexOf(tmpl.capability) !== -1;
      });
    }
    return TEMPLATES.filter(function (tmpl) { return tmpl.capability === capability; });
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
    getTemplatesByCapability: getTemplatesByCapability,
    findTemplate: findTemplate
  };

})();
