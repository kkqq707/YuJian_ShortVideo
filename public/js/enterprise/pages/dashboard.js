/**
 * YuJian Enterprise — Dashboard Page Render
 *
 * UI-002: AI Video Creative Studio homepage. Rendering stays presentation-only;
 * live counters and queue content are loaded from existing enterprise endpoints.
 */

(function () {
  'use strict';

  var galleryMedia = [
    'assets/homepage/ai-city.jpg',
    'assets/homepage/product-film.jpg',
    'assets/homepage/cinematic-landscape.jpg',
    'assets/homepage/digital-human.jpg',
    'assets/homepage/ai-abstract.jpg',
    'assets/homepage/studio-space.jpg',
    'assets/homepage/cinematic-landscape.jpg',
    'assets/homepage/product-film.jpg'
  ];
  var galleryTitles = ['赛博朋克城市夜景', '产品宣传展示', '自然风景航拍', '数字人品牌口播', '科技感抽象概念', '广告电影感', '建筑空间美学', '时尚潮流大片'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatNumber(value) {
    return value == null || value === '' || isNaN(Number(value)) ? '--' : Number(value).toLocaleString('en-US');
  }

  function formatTaskType(type) {
    var map = { text2video: '文生视频', image2video: '图生视频', ref2video: '参考生视频', text2image: '文生图片', image_generation: '图片生成', digitalhuman: '数字人' };
    return map[type] || type || 'AI 任务';
  }

  function isToday(value) {
    if (!value) return false;
    var date = new Date(value);
    var now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }

  function renderStats() {
    return '<section class="ai-studio-stats" aria-label="创作数据">'
      + '<div class="ai-stat-card"><span class="ai-stat-icon"><i class="fas fa-wand-magic-sparkles"></i></span><span class="ai-stat-label">今日生成</span><strong id="dashboardTodayCount">--</strong><small>今日完成的生成任务</small></div>'
      + '<div class="ai-stat-card"><span class="ai-stat-icon"><i class="fas fa-coins"></i></span><span class="ai-stat-label">可用积分</span><strong id="dashboardCreditCount">--</strong><small>实时账户余额</small></div>'
      + '<div class="ai-stat-card"><span class="ai-stat-icon"><i class="fas fa-layer-group"></i></span><span class="ai-stat-label">进行中任务</span><strong id="dashboardTaskCount">--</strong><small>等待或处理中的任务</small></div>'
      + '<div class="ai-stat-card"><span class="ai-stat-icon"><i class="fas fa-film"></i></span><span class="ai-stat-label">作品总数</span><strong id="dashboardWorkCount">--</strong><small>工作区中的创作资产</small></div>'
      + '</section>';
  }

  function renderQueue() {
    return '<section class="ai-studio-lower-grid">'
      + '<div class="ai-task-panel"><div class="ai-section-heading"><div><h2>任务队列</h2><p>实时查看创作进度</p></div><button class="ai-section-link" onclick="navigateTo(\'projects\')">查看全部 <i class="fas fa-arrow-up-right-from-square"></i></button></div><div id="dashboardTaskQueue" class="ai-task-queue"><div class="ai-empty-state"><i class="fas fa-satellite-dish"></i><strong>正在同步任务状态</strong><span>稍等片刻，创作动态即将出现</span></div></div></div>'
      + '<div class="ai-trend-panel"><div class="ai-section-heading"><div><h2>创作概览</h2><p>用真实数据了解你的创作节奏</p></div><i class="fas fa-chart-line ai-heading-mark"></i></div><div id="dashboardTrend" class="ai-trend-empty"><i class="fas fa-chart-area"></i><strong>暂无趋势数据</strong><span>完成一次创作后，这里会记录你的节奏</span></div></div>'
      + '</section>';
  }

  function renderDashboard() {
    var gallery = galleryTitles.map(function (title, i) {
      return '<div class="gallery-item" tabindex="0"><img class="gallery-image" src="' + galleryMedia[i] + '" alt="' + esc(title) + ' AI 视频案例" loading="lazy" onerror="this.parentElement.classList.add(\'gallery-media-missing\')"><div class="gallery-item-overlay"><span class="gallery-item-title">' + esc(title) + '</span><span class="gallery-item-meta">AI 创作案例 <i class="fas fa-play-circle"></i></span></div></div>';
    }).join('');

    var html = '<div class="hero-banner">'
      + '<div class="hero-orbit hero-orbit-one"></div><div class="hero-orbit hero-orbit-two"></div>'
      + '<div class="hero-chip"><span class="hero-chip-core"></span><span class="hero-chip-line hero-chip-line-a"></span><span class="hero-chip-line hero-chip-line-b"></span><span class="hero-chip-label">AI CORE</span></div>'
      + '<div class="hero-preview"><span class="hero-preview-bar"><i></i><i></i><i></i><b>CREATIVE / 01</b></span><span class="hero-preview-screen"><span class="hero-preview-play"><i class="fas fa-play"></i></span></span><span class="hero-preview-caption">生成 · 预览 · 发布</span></div>'
      + '<div class="hero-content"><div class="hero-title-group"><div class="hero-kicker"><span></span> PREMIUM AI CREATIVE STUDIO</div><h1 class="ai-hero-title">AI驱动创意<br><em>一键生成大片</em></h1><p class="ai-hero-subtitle">从灵感到成片，让每一次创作都拥有电影般的表现力。</p></div><button class="hero-btn" onclick="navigateTo(\'studio\')"><i class="fas fa-wand-magic-sparkles"></i> 开始 AI 创作 <i class="fas fa-arrow-right"></i></button></div>'
      + '</div>'
      + renderStats()
      + '<section class="ai-capability-section"><div class="ai-section-heading"><div><h2>把灵感变成镜头</h2><p>选择一条创作路径，进入你的 AI 工作台</p></div><span class="ai-live-status"><i></i> STUDIO ONLINE</span></div>'
      + '<div class="feature-cards">'
      + '<div class="feature-card" onclick="navigateTo(\'studio\')"><span class="ai-feature-glyph"><i class="fas fa-wand-magic-sparkles"></i></span><div class="feature-card-info"><div><h4>AI视频创作</h4><span class="feature-card-badge">NEW</span></div><p>文字、图片与参考素材，一站式生成</p></div><i class="fas fa-arrow-up-right-from-square feature-card-arrow"></i></div>'
      + '<div class="feature-card" onclick="navigateTo(\'storyboard\')"><span class="ai-feature-glyph"><i class="fas fa-clapperboard"></i></span><div class="feature-card-info"><h4>故事板</h4><p>拆解镜头语言，批量构建完整叙事</p></div><i class="fas fa-arrow-up-right-from-square feature-card-arrow"></i></div>'
      + '<div class="feature-card" onclick="navigateTo(\'digitalhuman\')"><span class="ai-feature-glyph"><i class="fas fa-user-tie"></i></span><div class="feature-card-info"><h4>数字人口播</h4><p>让品牌形象自然表达每一句内容</p></div><i class="fas fa-arrow-up-right-from-square feature-card-arrow"></i></div>'
      + '<div class="feature-card" onclick="navigateTo(\'assets\')"><span class="ai-feature-glyph"><i class="fas fa-folder-open"></i></span><div class="feature-card-info"><h4>素材库</h4><p>统一管理创作资产，随时调用灵感</p></div><i class="fas fa-arrow-up-right-from-square feature-card-arrow"></i></div>'
      + '</div></section>'
      + '<section class="gallery-section ai-gallery-section"><div class="ai-section-heading"><div><h2>AI Gallery</h2><p>从真实创作中寻找下一帧灵感</p></div><button class="ai-section-link" onclick="navigateTo(\'myworks\')">进入作品库 <i class="fas fa-arrow-up-right-from-square"></i></button></div><div class="gallery-tabs"><div class="gallery-tab active">精选</div><div class="gallery-tab">广告营销</div><div class="gallery-tab">故事叙事</div><div class="gallery-tab">视觉实验</div></div><div class="gallery-grid">' + gallery + '</div></section>'
      + renderQueue();

    setTimeout(loadDashboardData, 0);
    return html;
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function taskTitle(task) {
    return task.prompt || task.name || task.title || formatTaskType(task.taskType);
  }

  function renderQueueItems(tasks) {
    var container = document.getElementById('dashboardTaskQueue');
    if (!container) return;
    var active = tasks.filter(function (task) { return task.status === 'pending' || task.status === 'processing' || task.status === 'generating'; }).slice(0, 3);
    if (!active.length) {
      container.innerHTML = '<div class="ai-empty-state"><i class="fas fa-check-circle"></i><strong>暂无进行中的任务</strong><span>准备好后，开始你的下一段创作</span><button onclick="navigateTo(\'studio\')">开始创作 <i class="fas fa-arrow-right"></i></button></div>';
      return;
    }
    container.innerHTML = active.map(function (task) {
      var progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
      return '<div class="ai-task-row"><span class="ai-task-status"><i class="fas fa-circle-notch fa-spin"></i></span><div><strong>' + esc(taskTitle(task).slice(0, 42)) + '</strong><small>' + esc(formatTaskType(task.taskType)) + ' · ' + (progress ? progress + '%' : '处理中') + '</small></div><span class="ai-task-progress"><i style="width:' + progress + '%"></i></span></div>';
    }).join('');
  }

  function loadDashboardData() {
    if (!window.YuJianAPI || !window.YuJianAuth || !YuJianAuth.isAuthenticated()) {
      setText('dashboardCreditCount', '--'); setText('dashboardTodayCount', '--'); setText('dashboardTaskCount', '--'); setText('dashboardWorkCount', '--');
      return;
    }
    var taskRequest = YuJianAPI.get('/enterprise/video-generation/tasks?page=1&pageSize=100').catch(function () { return { items: [] }; });
    var creditRequest = YuJianAPI.get('/enterprise/quota/balance').catch(function () { return {}; });
    var assetRequest = (window.EnterpriseAPI && EnterpriseAPI.Asset) ? EnterpriseAPI.Asset.getAssets({ page: 1, pageSize: 1 }).catch(function () { return {}; }) : Promise.resolve({});
    Promise.all([taskRequest, creditRequest, assetRequest]).then(function (results) {
      if (!window.APP || APP.currentPage !== 'dashboard') return;
      var tasks = results[0] && Array.isArray(results[0].items) ? results[0].items : [];
      var balance = results[1] && results[1].balance;
      var assetData = results[2] || {};
      var activeCount = tasks.filter(function (task) { return task.status === 'pending' || task.status === 'processing' || task.status === 'generating'; }).length;
      var todayCount = tasks.filter(function (task) { return isToday(task.createdAt || task.created_at || task.createdTime); }).length;
      var workCount = assetData.total != null ? assetData.total : (assetData.count != null ? assetData.count : (assetData.pagination && assetData.pagination.total));
      setText('dashboardCreditCount', formatNumber(balance)); setText('dashboardTodayCount', formatNumber(todayCount)); setText('dashboardTaskCount', formatNumber(activeCount)); setText('dashboardWorkCount', formatNumber(workCount));
      renderQueueItems(tasks);
      if (todayCount > 0) {
        var trend = document.getElementById('dashboardTrend');
        if (trend) trend.innerHTML = '<div class="ai-trend-value"><strong>' + formatNumber(todayCount) + '</strong><span>今日生成任务</span></div><div class="ai-trend-bars"><i style="height:34%"></i><i style="height:52%"></i><i style="height:44%"></i><i style="height:68%"></i><i style="height:58%"></i><i style="height:82%"></i><i style="height:100%"></i></div><small>按今日任务记录汇总</small>';
      }
    });
  }

  window.YJ = window.YJ || {};
  window.YJ.pages = window.YJ.pages || {};
  window.YJ.pages.dashboard = { render: renderDashboard, reload: loadDashboardData };
  window.renderDashboard = renderDashboard;
})();
