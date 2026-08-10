/**
 * YuJian Enterprise — App Initialization Entry Point
 *
 * Sprint 4.5: 应用初始化、导航、页面渲染、事件绑定
 *
 * 依赖：所有 enterprise 模块 + 现有 js 模块（api.js, auth.js, upload.js, video-task.js, prompt-templates.js）
 */

(function () {
  'use strict';

  // ─── App Config ───────────────────────────────────────────
  var APP = {
    currentPage: 'dashboard',
    enterprise: {
      name: '某某品牌有限公司',
      plan: '标准版',
      totalQuota: 31500,
      usedQuota: 12800,
      contact: '王磊',
      phone: '138****8888',
      eid: 'ENT20260210001'
    },
    storyboard: {
      title: '新品宣传短视频',
      shots: [
        { id: 1, desc: '产品特写镜头，缓缓旋转展示细节', line: '全新升级，品质之选', duration: 3, style: '真实感' },
        { id: 2, desc: '模特手持产品微笑展示', line: '每一次使用都是享受', duration: 4, style: '真实感' },
        { id: 3, desc: '使用场景快速切换蒙太奇', line: '适用于多种生活场景', duration: 5, style: '电影感' },
        { id: 4, desc: '品牌Logo出现 +  slogan展示', line: '煜见光影，创作无限可能', duration: 3, style: '科技感' },
        { id: 5, desc: '结尾号召行动画面', line: '立即体验，开启创作之旅', duration: 3, style: '真实感' }
      ]
    },
    projects: [
      { id: 1, name: '618促销视频', type: 'text2video', typeLabel: '文生视频', typeIcon: 'fa-video', time: '2026-07-14', status: 'completed', statusLabel: '已完成', materialCount: 12, shotCount: 8, generatedVideos: 3, description: '618电商大促宣传视频，突出产品优惠力度' },
      { id: 2, name: '品牌宣传片', type: 'storyboard', typeLabel: '故事板', typeIcon: 'fa-clapperboard', time: '2026-07-12', status: 'processing', statusLabel: '处理中', materialCount: 25, shotCount: 15, generatedVideos: 5, description: '企业品牌形象宣传短片，展示企业文化与实力' },
      { id: 3, name: '产品介绍口播', type: 'digitalhuman', typeLabel: '数字人', typeIcon: 'fa-user-circle', time: '2026-07-10', status: 'completed', statusLabel: '已完成', materialCount: 8, shotCount: 3, generatedVideos: 1, description: '数字人产品功能演示与介绍' },
      { id: 4, name: '新品开箱视频', type: 'image2video', typeLabel: '图生视频', typeIcon: 'fa-images', time: '2026-07-08', status: 'completed', statusLabel: '已完成', materialCount: 18, shotCount: 6, generatedVideos: 2, description: '新产品开箱评测与使用演示' },
      { id: 5, name: '节日祝福视频', type: 'text2video', typeLabel: '文生视频', typeIcon: 'fa-video', time: '2026-07-05', status: 'completed', statusLabel: '已完成', materialCount: 5, shotCount: 4, generatedVideos: 1, description: '节日祝福短视频，温馨感人' },
      { id: 6, name: '团队介绍短片', type: 'storyboard', typeLabel: '故事板', typeIcon: 'fa-clapperboard', time: '2026-07-01', status: 'draft', statusLabel: '草稿', materialCount: 10, shotCount: 0, generatedVideos: 0, description: '团队风采展示短片策划' },
      { id: 7, name: '客户见证视频', type: 'digitalhuman', typeLabel: '数字人', typeIcon: 'fa-user-circle', time: '2026-06-28', status: 'completed', statusLabel: '已完成', materialCount: 6, shotCount: 5, generatedVideos: 3, description: '客户使用体验分享与推荐' },
      { id: 8, name: '教程系列第一集', type: 'text2video', typeLabel: '文生视频', typeIcon: 'fa-video', time: '2026-06-25', status: 'generating', statusLabel: '生成中', materialCount: 15, shotCount: 10, generatedVideos: 2, description: '产品使用教程系列第一集' }
    ],
    members: [
      { id: 1, name: '王磊', role: '管理员', joined: '2026-02-10', status: 'active' },
      { id: 2, name: '李娜', role: '创作者', joined: '2026-03-15', status: 'active' },
      { id: 3, name: '赵岩', role: '创作者', joined: '2026-04-01', status: 'active' },
      { id: 4, name: '陈静', role: '查看者', joined: '2026-05-20', status: 'inactive' }
    ],
    billingRecords: [
      { id: 1, type: '开通', plan: '专业版', amount: 799, time: '2026-02-10', status: 'paid' },
      { id: 2, type: '续费', plan: '专业版', amount: 799, time: '2026-07-10', status: 'paid' },
      { id: 3, type: '使用', desc: '文生视频消耗 50 额度', amount: 50, time: '2026-07-14' },
      { id: 4, type: '使用', desc: '数字人消耗 30 额度', amount: 30, time: '2026-07-13' }
    ],
    generating: false,
    currentStoryboardProject: null
  };

  // ─── Init Template Selector ───────────────────────────────
  // Phase UI-AICreation-02-B-2.3-D-1: 支持 capability 参数过滤
  function initTemplateSelector(containerSelector, targetInputId, capability) {
    var container = document.querySelector(containerSelector);
    if (!container) return;
    if (typeof YuJianPromptTemplates !== 'undefined') {
      YuJianPromptTemplates.render(container, targetInputId, capability);
    }
  }

  // ─── Page Render Functions ────────────────────────────────
  // These render functions are kept here since they're part of the
  // core application shell (not specific to any one module)

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

  // 🔧 Phase Fix: 与企业级设计确认版本同步，包含分镜卡片(shot-item) + 时间轴预览
  function renderStoryboardPage() {
    var s = APP.storyboard;
    var totalDuration = s.shots.reduce(function (a, b) { return a + b.duration; }, 0);
    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">'
      + '<div><h2 style="font-size:20px;margin-bottom:4px">' + s.title + '</h2>'
      + '<div style="font-size:13px;color:var(--text-sub)">共 ' + s.shots.length + ' 个分镜 · 总时长 ' + totalDuration + ' 秒</div></div>'
      + '<div style="display:flex;gap:10px">'
      + '<button class="btn btn-outline"><i class="fas fa-file-import"></i> 导入剧本</button>'
      + '<button class="btn btn-outline"><i class="fas fa-plus"></i> 新增分镜</button>'
      + '<button class="btn btn-primary btn-lg" onclick="alert(\'开始批量生成视频，预计消耗150积分\')"><i class="fas fa-magic"></i> 一键生成全部</button>'
      + '</div></div>'
      + '<div class="storyboard-editor">'
      + '<div class="storyboard-header"><div class="storyboard-title">分镜列表</div>'
      + '<div class="storyboard-actions">'
      + '<button class="btn btn-sm btn-outline" style="background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2);color:#fff"><i class="fas fa-sort"></i> 排序</button>'
      + '<button class="btn btn-sm btn-outline" style="background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2);color:#fff"><i class="fas fa-cog"></i> 全局设置</button>'
      + '</div></div>'
      + '<div class="shot-list">'
      + s.shots.map(function (shot, idx) {
          return '<div class="shot-item">'
            + '<div class="shot-num">' + (idx + 1) + '</div>'
            + '<div class="shot-desc">' + shot.desc
            + '<div class="shot-line">💬 ' + shot.line + '</div></div>'
            + '<div class="shot-style">风格：' + shot.style + '</div>'
            + '<div class="shot-duration">' + shot.duration + 's</div>'
            + '<div class="shot-actions">'
            + '<button title="编辑" onclick="openStoryboard(' + shot.id + ')"><i class="fas fa-edit"></i></button>'
            + '<button title="生成"><i class="fas fa-play"></i></button>'
            + '<button title="删除"><i class="fas fa-trash"></i></button>'
            + '</div></div>';
        }).join('')
      + '</div></div>'
      // 时间轴预览
      + '<div style="margin-top:20px" class="card">'
      + '<div class="card-header"><h3>⏱️ 时间轴预览</h3></div>'
      + '<div class="card-body">'
      + '<div style="background:#1a1a2e;border-radius:10px;padding:20px;display:flex;gap:4px;align-items:flex-end;height:120px">'
      + s.shots.map(function (shot, idx) {
          return '<div style="flex:' + shot.duration + ';background:linear-gradient(180deg, #3b7fe0, #0a58ca);border-radius:6px 6px 0 0;height:' + (60 + idx * 8) + 'px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px">'
            + shot.duration + 's</div>';
        }).join('')
      + '</div></div></div>';
  }

  // ─── Render (main page router) ────────────────────────────
  function render(page) {
    var container = document.getElementById('mainContent');
    switch (page) {
      case 'dashboard': container.innerHTML = (typeof renderDashboard === 'function' ? renderDashboard() : '<div class="card"><div class="card-body">页面开发中</div></div>'); break;
      case 'storyboard': container.innerHTML = (typeof renderStoryboardPage === 'function' ? renderStoryboardPage() : '<div class="card"><div class="card-body">页面开发中</div></div>'); break;
      case 'text2video': container.innerHTML = (typeof renderText2Video === 'function' ? renderText2Video() : '<div class="card"><div class="card-body">页面开发中</div></div>'); initTemplateSelector('#t2vTemplateContainer', 't2vPrompt', 'video'); break;
      case 'image2video': container.innerHTML = (typeof renderImage2Video === 'function' ? renderImage2Video() : '<div class="card"><div class="card-body">页面开发中</div></div>'); initTemplateSelector('#i2vTemplateContainer', 'i2vPrompt', 'video'); break;
      case 'studio': container.innerHTML = (typeof renderStudio === 'function' ? renderStudio() : renderFallback('AI创作中心')); initTemplateSelector('#studioTemplateContainer', 'studioPrompt', 'video'); break;
      case 'ref2video': container.innerHTML = (typeof renderStudio === 'function' ? renderStudio() : renderFallback('AI创作中心')); initTemplateSelector('#studioTemplateContainer', 'studioPrompt', 'video'); setTimeout(function () { if (typeof studioSelectType === 'function') { var card = document.querySelector('.yj-studio-type-card[data-type="ref2video"]'); if (card) studioSelectType(card, 'ref2video'); } }, 0); break;
      case 'digitalhuman':
        if (typeof renderDigitalHumanAsync === 'function') {
          renderDigitalHumanAsync(container);
        } else if (typeof renderDigitalHuman === 'function') {
          container.innerHTML = renderDigitalHuman();
        } else {
          container.innerHTML = '<div class="card"><div class="card-body">页面开发中</div></div>';
        }
        break;
      case 'imageGen': container.innerHTML = (typeof renderImageGen === 'function' ? renderImageGen() : '<div class="card"><div class="card-body">页面开发中</div></div>'); initTemplateSelector('#imgGenTemplateContainer', 'imgGenPrompt', 'image'); break;
      case 'projects': container.innerHTML = (typeof renderProjects === 'function' ? renderProjects() : '<div class="card"><div class="card-body">页面开发中</div></div>'); break;
      case 'project-detail': {
        var pid = APP.currentProjectId;
        container.innerHTML = (typeof renderProjectDetail === 'function' ? renderProjectDetail(pid) : '<div class="card"><div class="card-body">页面开发中</div></div>');
        break;
      }
      case 'myworks': container.innerHTML = (typeof renderMyWorks === 'function' ? renderMyWorks() : '<div class="card"><div class="card-body">页面开发中</div></div>'); setTimeout(function () { if (typeof loadMyWorks === 'function') loadMyWorks(1); }, 0); break;
      case 'assets': container.innerHTML = (typeof renderAssets === 'function' ? renderAssets() : '<div class="card"><div class="card-body">页面开发中</div></div>'); break;
      case 'editor':
        container.innerHTML = (typeof renderEditor === 'function' ? renderEditor() : '<div class="card"><div class="card-body">页面开发中</div></div>');
        // Phase 2-D-4.5: Bind editor events AFTER DOM is rendered
        setTimeout(function () {
          if (window.YJ && window.YJ.EditorApp && window.YJ.EditorApp.initEditor) {
            window.YJ.EditorApp.initEditor();
          }
        }, 0);
        break;
      case 'team': container.innerHTML = (typeof renderTeam === 'function' ? renderTeam() : '<div class="card"><div class="card-body">页面开发中</div></div>'); break;
      case 'billing': container.innerHTML = (typeof renderBilling === 'function' ? renderBilling() : '<div class="card"><div class="card-body">页面开发中</div></div>'); break;
      case 'settings': container.innerHTML = (typeof renderSettings === 'function' ? renderSettings() : '<div class="card"><div class="card-body">页面开发中</div></div>'); break;
      default: container.innerHTML = '<div class="card"><div class="card-body">页面开发中</div></div>';
    }
    document.querySelectorAll('.nav-item').forEach(function (el) { el.classList.remove('active'); });
    var activeNav = document.querySelector('.nav-item[data-page="' + page + '"]');
    if (activeNav) activeNav.classList.add('active');
  }

  // ─── Navigation ───────────────────────────────────────────
  function navigateTo(page) {
    APP.currentPage = page;
    // Sprint Stable: 页面状态持久化 — 刷新后保持当前页面
    if (typeof PageState !== 'undefined' && PageState.save) {
      PageState.save(page);
    }
    // Phase 2-D-1.5: 同步 Header 标题/面包屑
    if (typeof updateHeaderForPage === 'function') {
      updateHeaderForPage(page);
    }
    render(page);
    if (window.innerWidth < 1024) {
      var sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.style.width = '72px';
    }
  }

  // 🔧 Phase Fix: 导航事件由 HTML onclick 属性统一处理，
  // 不再重复绑定 addEventListener，避免 navigateTo 多次触发。

  // ─── Render Guard ─────────────────────────────────────────
  var _renderLock = false;
  var _pendingRender = null;

  // ─── Wrap render for asset auto-load ──────────────────────
  var _originalRender = render;
  render = function (page) {
    // 🔧 Phase Fix: 渲染锁 — 防止短时间内重复渲染导致 DOM/事件混乱
    if (_renderLock) {
      _pendingRender = page;
      return;
    }
    _renderLock = true;

    // Clean up previous page polling
    var generatingPages = ['image2video', 'digitalhuman'];
    if (generatingPages.indexOf(APP.currentPage) !== -1 && generatingPages.indexOf(page) === -1) {
      if (typeof YuJianVideoTask !== 'undefined' && YuJianVideoTask.stopPolling) {
        YuJianVideoTask.stopPolling();
      }
      if (APP.currentPage === 'image2video' && typeof clearImageSelection === 'function') {
        clearImageSelection();
      }
      // Phase 2-C-2-4-B-2-B-3: 离开数字人页面时重置生成状态
      if (APP.currentPage === 'digitalhuman' && window.YJ && window.YJ.state && window.YJ.state.setDigitalHumanState) {
        window.YJ.state.setDigitalHumanState({ isGenerating: false });
      }
    }
    _originalRender(page);
    // Auto-load assets when entering assets page
    if (page === 'assets') {
      setTimeout(function () { if (typeof loadAssets === 'function') loadAssets(1); }, 0);
    }

    // 🔧 Phase Fix: 释放渲染锁，处理积压请求
    _renderLock = false;
    if (_pendingRender && _pendingRender !== page) {
      var pending = _pendingRender;
      _pendingRender = null;
      render(pending);
    } else {
      _pendingRender = null;
    }
  };

  // ─── Auth Interceptor ─────────────────────────────────────
  var _originalNavigateTo = navigateTo;
  navigateTo = function (page) {
    var authPages = ['studio', 'image2video', 'text2video', 'ref2video', 'digitalhuman', 'imageGen', 'assets'];
    if (authPages.indexOf(page) !== -1 && typeof YuJianAuth !== 'undefined' && !YuJianAuth.isAuthenticated()) {
      if (typeof showLogin === 'function') showLogin();
      if (typeof showToast === 'function') showToast('请先登录企业账号', 'warning');
      return;
    }
    _originalNavigateTo(page);
  };

  // ─── Responsive Sidebar ───────────────────────────────────
  window.addEventListener('resize', function () {
    var sidebar = document.getElementById('sidebar');
    if (window.innerWidth < 1024) {
      sidebar.style.width = '72px';
    } else {
      sidebar.style.width = 'var(--sidebar-width)';
    }
  });

  // ─── Global ESC handler ───────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (document.getElementById('storyboardEditor') &&
        document.getElementById('storyboardEditor').classList.contains('show')) {
        if (typeof closeStoryboard === 'function') closeStoryboard();
      }
      if (typeof closeModal === 'function') closeModal();
    }
  });

  // ─── Startup ──────────────────────────────────────────────
  function logModuleStatus() {
    console.log('[Enterprise/App] Modules loaded:', {
      state: !!(window.YJ && window.YJ.state),
      utils: !!(window.YJ && window.YJ.utils),
      api: !!(window.EnterpriseAPI),
      editorState: !!(window.YJ && window.YJ.Editor),
      assetList: !!(window.YJ && window.YJ.modules && window.YJ.modules.assetList),
      assetDetail: !!(window.YJ && window.YJ.modules && window.YJ.modules.assetDetail),
      assetPreview: !!(window.YJ && window.YJ.modules && window.YJ.modules.assetPreview),
      assetActions: !!(window.YJ && window.YJ.modules && window.YJ.modules.assetActions),
      assetHistory: !!(window.YJ && window.YJ.modules && window.YJ.modules.assetHistory),
      workspace: !!(window.YJ && window.YJ.modules && window.YJ.modules.workspace),
      generationPanel: !!(window.YJ && window.YJ.modules && window.YJ.modules.generationPanel)
    });
  }

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  YJ.app = {
    APP: APP,
    render: render,
    navigateTo: navigateTo,
    logModuleStatus: logModuleStatus
  };
  window.YJ = YJ;

  window.APP = APP;
  window.render = render;
  window.navigateTo = navigateTo;
  window.initApp = logModuleStatus;  // Expose for manual re-init if needed

  // Phase 2-D-1.5: Runtime 身份标识（仅调试用，不参与业务逻辑）
  window.YJ_RUNTIME = {
    name: 'enterprise-app',
    phase: '2-D-1.5',
    renderSource: 'app.js'
  };

  // Module status log
  logModuleStatus();

  // 🔧 Phase Fix: 所有外部模块（含 editor-app.js）已加载完毕，
  // 此时 window.renderEditor 已被覆盖为完整版本。
  // 需重新渲染当前页面以确保 DOM 使用正确的 render 函数。
  var initialPage = APP._initialPage
    || (typeof PageState !== 'undefined' && PageState.restore ? PageState.restore() : null)
    || 'dashboard';
  APP.currentPage = initialPage;
  console.log('[Enterprise/App] Startup render — page:', initialPage);
  render(initialPage);
  // Phase 2-B: 同步 Header 显示
  if (typeof updateHeaderForPage === 'function') {
    updateHeaderForPage(initialPage);
  }

  console.log('[Enterprise/App] Module loaded');
})();
