/**
 * YuJian Studio — Router
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D3-A
 *
 * 职责（Studio 独立壳的轻量 Hash Router，唯一入口 YJ.studio.router）：
 *   1. start()        —— 绑定 hashchange + 首屏渲染
 *   2. navigate(hash) —— 编程式跳转（设置 location.hash）
 *   3. resolve(hash)  —— 解析 hash → { page, params }
 *   4. render(info)   —— 生命周期切页：currentPage.destroy() → target.render() → target.init()
 *   5. getCurrent()   —— 返回当前路由信息
 *
 * 约束（严格遵守，违规即返工）：
 *   ❌ 不引入路由库 / history API / Vue Router
 *   ❌ 本阶段不实现业务页面（仅 workbench 占位空态）
 *   ❌ 不发任何数据请求 / 不建 State 业务模型 / 不写 mock 数据
 *   ✅ 页面模块挂 YJ.studio.pages.<name>，暴露 render()/init()/destroy()
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  if (!YJ.studio) YJ.studio = {};

  var DEFAULT_ROUTE = 'workbench';
  var MAIN_ID = 'studio-main';

  // ─── 路由表（本阶段：workbench 实现；#/tasks/:id 仅解析，页面未实现）───
  // 匹配顺序即优先级；未匹配 → 回退 DEFAULT_ROUTE。
  var ROUTE_TABLE = [
    { pattern: /^#\/workbench$/, page: 'workbench' },
    {
      pattern: /^#\/tasks\/(\d+)$/,
      page: 'tasks-detail',
      parse: function (m) { return { id: m[1] }; }
    }
  ];

  // ─── 页面注册表（未来页面模块挂到这里；本阶段内置 workbench 占位）───
  var pages = YJ.studio.pages || {};

  // 内置默认占位页（空态「教会界面」，非业务页：无数据请求、无 mock、无 emoji）
  pages.workbench = {
    render: function () {
      return '' +
        '<div class="studio-page studio-page--empty">' +
          '<i class="fas fa-compass studio-page__icon" aria-hidden="true"></i>' +
          '<h2 class="studio-page__title">数字人口播 Studio</h2>' +
          '<p class="studio-page__hint">从左侧导航开始，或点击「新建口播」创建第一条口播视频。</p>' +
        '</div>';
    },
    init: function () {},
    destroy: function () {}
  };

  YJ.studio.pages = pages;

  // ─── 当前路由状态 ────────────────────────────────────────
  var current = { page: null, params: null, module: null };

  /** 规范化 hash：空 / # / #/ 统一为默认路由 */
  function normalizeHash(hash) {
    var h = hash || '';
    if (h === '' || h === '#' || h === '#/') return '#/workbench';
    return h;
  }

  /** 解析 hash → { page, params }；未匹配回退默认路由 */
  function resolve(hash) {
    var h = normalizeHash(hash);
    for (var i = 0; i < ROUTE_TABLE.length; i++) {
      var m = h.match(ROUTE_TABLE[i].pattern);
      if (m) {
        return {
          page: ROUTE_TABLE[i].page,
          params: ROUTE_TABLE[i].parse ? ROUTE_TABLE[i].parse(m) : {}
        };
      }
    }
    return { page: DEFAULT_ROUTE, params: {} };
  }

  /** 切页生命周期：销毁旧页 → 渲染新页 → 初始化新页 */
  function render(routeInfo) {
    var info = routeInfo || resolve(location.hash);
    var pageKey = info.page;
    var pageModule = pages[pageKey];

    // 页面模块缺失 → 回退默认占位页（为未来 #/tasks/:id 等预留解析能力）
    if (!pageModule || typeof pageModule.render !== 'function') {
      if (pageKey !== DEFAULT_ROUTE) {
        console.warn('[Studio/Router] 页面模块未实现，回退到 workbench：', pageKey);
      }
      pageKey = DEFAULT_ROUTE;
      pageModule = pages[DEFAULT_ROUTE];
      info = { page: pageKey, params: {} };
    }

    var main = document.getElementById(MAIN_ID);
    if (!main) {
      console.warn('[Studio/Router] 未找到挂载容器 #' + MAIN_ID);
      return info;
    }

    // 离开旧页
    if (current.module && typeof current.module.destroy === 'function') {
      try { current.module.destroy(); } catch (e) { console.warn('[Studio/Router] destroy 失败', e); }
    }

    // 进入新页
    main.innerHTML = pageModule.render(info.params);
    if (typeof pageModule.init === 'function') {
      try { pageModule.init(info.params); } catch (e) { console.warn('[Studio/Router] init 失败', e); }
    }

    current = { page: pageKey, params: info.params, module: pageModule };
    return current;
  }

  /** hashchange 处理器 */
  function onHashChange() {
    render();
  }

  /** 启动：绑定 hashchange + 规范化初始 hash + 首屏渲染 */
  function start() {
    window.addEventListener('hashchange', onHashChange);

    // 空 hash → 用 replace 规范化 URL（不新增历史记录）
    if (location.hash === '' || location.hash === '#' || location.hash === '#/') {
      location.replace('#/workbench');
    }

    render();
  }

  /** 编程式跳转（同 hash 时强制重渲染一次） */
  function navigate(hash) {
    var target = hash || '#/workbench';
    if (location.hash === target) {
      render();
      return;
    }
    location.hash = target;
  }

  /** 当前路由信息（供顶栏标题 / 导航激活态同步） */
  function getCurrent() {
    return { page: current.page, params: current.params };
  }

  // ─── 暴露到全局 ──────────────────────────────────────────
  YJ.studio.router = {
    start: start,
    navigate: navigate,
    resolve: resolve,
    render: render,
    getCurrent: getCurrent
  };

  window.YJ = YJ;

  console.log('[Studio/Router] Studio Router initialized (Phase DigitalHuman-Rebuild-004 Step5-D3-A)');
})();
