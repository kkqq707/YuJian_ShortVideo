/**
 * YuJian Studio — App
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D3-A
 *
 * 职责（Studio 入口，唯一入口 YJ.studio.app）：
 *   1. Studio 启动
 *   2. 鉴权检查（复用 YuJianAuth.isAuthenticated，未登录跳 index.html）
 *   3. 初始化 Shell（缓存 DOM 引用、渲染用户区、绑定退出、绑定 hashchange 同步顶栏/导航）
 *   4. 初始化 Router（router.js 已挂载 YJ.studio.router）
 *   5. 启动默认页面（router.start()）
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不自己读 token / 不复刻登录（鉴权只调 YuJianAuth）
 *   ❌ 不实现业务页面 / 不发数据请求 / 不建 State 业务模型 / 不写 mock
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  if (!YJ.studio) YJ.studio = {};

  // ─── 顶栏标题映射（Step5-D4：注册全部页面标题）───
  var DEFAULT_TITLE = '工作台';
  var PAGE_TITLES = {
    workbench: '工作台',
    create: '新建口播',
    avatars: '数字人资产',
    voices: '声音中心',
    scripts: '内容创作',
    tasks: '生成任务',
    history: '历史作品',
    'tasks-detail': '生成任务详情'
  };

  // ─── DOM 引用缓存 ────────────────────────────────────────
  var els = {};

  function isLoggedIn() {
    return !!(window.YuJianAuth &&
              typeof YuJianAuth.isAuthenticated === 'function' &&
              YuJianAuth.isAuthenticated());
  }

  function redirectToIndex() {
    window.location.href = 'index.html';
  }

  /** 同步顶栏标题 */
  function syncTitle() {
    if (!els.title) return;
    var page = (YJ.studio.router && typeof YJ.studio.router.getCurrent === 'function')
      ? YJ.studio.router.getCurrent().page
      : null;
    els.title.textContent = PAGE_TITLES[page] || DEFAULT_TITLE;
  }

  /** 同步侧边导航激活态 */
  function syncNav() {
    if (!els.nav) return;
    var page = (YJ.studio.router && typeof YJ.studio.router.getCurrent === 'function')
      ? YJ.studio.router.getCurrent().page
      : null;
    var items = els.nav.querySelectorAll('.studio-nav__item[data-route]');
    for (var i = 0; i < items.length; i++) {
      var active = items[i].getAttribute('data-route') === page;
      items[i].classList.toggle('is-active', active);
    }
  }

  /** 统一同步顶栏标题 + 导航激活态 */
  function syncChrome() {
    syncTitle();
    syncNav();
  }

  /** 渲染用户区（读 sessionStorage 用户信息，非 API 请求） */
  function renderUser() {
    if (!els.userName) return;
    var info = (window.YuJianAuth && typeof YuJianAuth.getUserInfo === 'function')
      ? YuJianAuth.getUserInfo()
      : null;
    if (info) {
      els.userName.textContent = info.company_name || info.email || info.name || '已登录';
    } else {
      els.userName.textContent = '已登录';
    }
  }

  /** 退出登录：清 token → 返回主平台 */
  function onLogout() {
    if (window.YuJianAuth && typeof YuJianAuth.logout === 'function') {
      YuJianAuth.logout();
    }
    redirectToIndex();
  }

  function cacheRefs() {
    els.title = document.getElementById('studio-page-title');
    els.nav = document.getElementById('studio-nav');
    els.userName = document.getElementById('studio-user-name');
    els.logout = document.getElementById('studio-logout');
  }

  function bindEvents() {
    if (els.logout) els.logout.addEventListener('click', onLogout);
    window.addEventListener('hashchange', syncChrome);
  }

  /** 启动入口 */
  function start() {
    // 1. 鉴权检查
    if (!isLoggedIn()) {
      redirectToIndex();
      return;
    }

    // 2. 初始化 Shell
    cacheRefs();
    renderUser();
    bindEvents();

    // 3. 初始化 Router
    if (!YJ.studio.router || typeof YJ.studio.router.start !== 'function') {
      console.error('[Studio/App] Studio Router 未加载，无法启动');
      return;
    }

    // 4. 启动默认页面
    YJ.studio.router.start();

    // 5. 首屏同步顶栏标题 + 导航激活态
    syncChrome();
  }

  function onReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  // ─── 暴露到全局 ──────────────────────────────────────────
  YJ.studio.app = {
    start: start
  };

  window.YJ = YJ;

  onReady();

  console.log('[Studio/App] Studio App ready (Phase DigitalHuman-Rebuild-004 Step5-D3-A)');
})();
