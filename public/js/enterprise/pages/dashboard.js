/**
 * YuJian Enterprise — Dashboard Page Render
 *
 * Phase 2-D-2-B-1: 从 app.js IIFE 内部提取到独立 pages 模块
 */

(function () {
  'use strict';

  function renderDashboard() {
    return '' +
      '<div class="hero-banner">' +
      '<div class="hero-content">' +
      '<div class="hero-title-group">' +
      '<div class="title-line">' +
      '<span class="brush-text">煜见</span>' +
      '<span class="sans-text">光影</span>' +
      '<span class="dot-sep">·</span>' +
      '<span class="brush-text">一镜</span>' +
      '<span class="sans-text">生辉</span>' +
      '</div>' +
      '</div>' +
      '<button class="hero-btn" onclick="navigateTo(\'studio\')">开始AI创作<i class="fas fa-arrow-right"></i></button>' +
      '</div>' +
      '</div>' +
      '<div class="feature-cards">' +
      '<div class="feature-card" onclick="navigateTo(\'studio\')"><div class="feature-card-info"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><h4>AI创作中心</h4><span class="feature-card-badge">NEW</span></div><p>统一创作入口，一站式生成</p></div><i class="fas fa-arrow-up-right-from-square feature-card-arrow"></i></div>' +
      '<div class="feature-card" onclick="navigateTo(\'storyboard\')"><div class="feature-card-info"><h4>故事板创作</h4><p>剧本拆分，批量生成</p></div><i class="fas fa-arrow-up-right-from-square feature-card-arrow"></i></div>' +
      '<div class="feature-card" onclick="navigateTo(\'digitalhuman\')"><div class="feature-card-info"><h4>数字人创作</h4><p>真人形象，智能口播</p></div><i class="fas fa-arrow-up-right-from-square feature-card-arrow"></i></div>' +
      '<div class="feature-card" onclick="navigateTo(\'assets\')"><div class="feature-card-info"><h4>资产管理</h4><p>素材统一管理</p></div><i class="fas fa-arrow-up-right-from-square feature-card-arrow"></i></div>' +
      '</div>' +
      '<div class="gallery-section"><div class="gallery-tabs"><div class="gallery-tab active">发现</div><div class="gallery-tab">广告营销</div><div class="gallery-tab">剧场</div><div class="gallery-tab">美学</div></div>' +
      '<div class="gallery-grid">' +
      ['赛博朋克城市夜景', '产品宣传展示', '自然风景航拍', '人物肖像艺术', '科技感抽象概念', '美食摄影大片', '建筑空间美学', '时尚潮流大片']
        .map(function (title, i) {
          // Sprint 4.7 Patch1: onerror fallback — hide video when gallery/*.mp4 missing
          return '<div class="gallery-item"><video class="gallery-video" muted loop playsinline preload="metadata" onmouseenter="this.play()" onmouseleave="this.pause()" onerror="this.parentElement.classList.add(\'gallery-video-missing\')"><source src="gallery/' + (i + 1) + '.mp4" type="video/mp4"></video><div class="gallery-item-overlay"><span class="gallery-item-title">' + title + '</span></div></div>';
        }).join('') +
      '</div></div>';
  }

  // ─── Expose to YJ.pages ───────────────────────────────
  window.YJ = window.YJ || {};
  window.YJ.pages = window.YJ.pages || {};

  window.YJ.pages.dashboard = {
    render: renderDashboard
  };

  window.renderDashboard = renderDashboard;

})();
