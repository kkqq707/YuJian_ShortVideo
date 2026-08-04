/**
 * YuJian Enterprise — Workspace Module
 *
 * Sprint 4.5: Workspace 统计信息异步加载
 *
 * 依赖：state.js, utils.js, api.js
 */

(function () {
  'use strict';

  var utils = (window.YJ && window.YJ.utils) || {};
  var api = window.EnterpriseAPI || ((window.YJ && window.YJ.api) || {});
  var safeFetch = utils.safeFetch || window.safeFetch;

  // ─── Load Workspace Stats Async ───────────────────────────
  /**
   * 异步加载 Workspace 统计信息（完全解耦，后台请求）
   * Workspace API 失败仅记录 console，绝不影响资产页面的任何功能
   */
  function loadWorkspaceStatsAsync() {
    setTimeout(function () {
      var fetchPromise;
      if (api.Workspace && api.Workspace.getStats) {
        fetchPromise = api.Workspace.getStats();
      } else {
        fetchPromise = safeFetch('/enterprise/workspace/assets?page=1&pageSize=1');
      }

      fetchPromise
        .then(function (wsData) {
          console.log('[Workspace] Stats loaded successfully');
          // Stats available for future use (badges, KPIs, etc.)
          // Currently logged only
        })
        .catch(function (wsErr) {
          console.warn('[Workspace] Stats load failed (non-blocking, asset page unaffected):', wsErr.message);
        });
    }, 500);
  }

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  if (!YJ.modules) YJ.modules = {};
  YJ.modules.workspace = {
    loadWorkspaceStatsAsync: loadWorkspaceStatsAsync
  };
  window.YJ = YJ;

  window.loadWorkspaceStatsAsync = loadWorkspaceStatsAsync;

  console.log('[Enterprise/Workspace] Module initialized');
})();
