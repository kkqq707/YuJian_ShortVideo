/**
 * Page State Manager — localStorage-based page state persistence
 *
 * Sprint Stable: 用户刷新页面后停留在当前页面，关闭浏览器重新打开恢复最后访问模块
 *
 * Usage:
 *   PageState.save('myworks')        — save current page on navigation
 *   PageState.restore()              — returns saved page key or 'dashboard'
 *   PageState.restoreAndNavigate()   — auto-navigate to saved page
 *
 * Storage key: 'enterprise_current_page'
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'enterprise_current_page';

  /**
   * Supported pages — maps page key to display name for logging
   */
  var VALID_PAGES = [
    'dashboard',    // 首页
    'assets',       // 资产
    'ref2video',    // AI生成
    'text2video',   // 文生视频
    'image2video',  // 图生视频
    'imageGen',     // 图片生成
    'digitalhuman', // 主体
    'storyboard',   // 故事板
    'editor',       // 在线剪辑
    'projects',     // 我的项目
    'myworks',      // 我的作品
    'team',         // 团队
    'billing',      // 购买积分
    'settings'      // 设置
  ];

  /**
   * Save the current page to localStorage
   * @param {string} page - Page key (e.g. 'dashboard', 'assets', 'myworks')
   */
  function save(page) {
    if (!page || typeof page !== 'string') {
      console.warn('[PageState] save called with invalid page:', page);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, page);
    } catch (e) {
      // localStorage full or disabled — silently fail, don't block navigation
      console.warn('[PageState] Failed to save page state:', e.message);
    }
  }

  /**
   * Get the last saved page
   * @returns {string} Page key or 'dashboard' as default
   */
  function getPage() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && VALID_PAGES.indexOf(saved) !== -1) {
        return saved;
      }
    } catch (e) {
      console.warn('[PageState] Failed to read page state:', e.message);
    }
    return 'dashboard';
  }

  /**
   * Restore the saved page — returns the page key for the caller to navigate to
   * @returns {string} Page key
   */
  function restore() {
    return getPage();
  }

  /**
   * Clear saved page state (useful for logout/reset)
   */
  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }

  // ─── Expose to Global ─────────────────────────────────────
  window.PageState = {
    save: save,
    getPage: getPage,
    restore: restore,
    clear: clear
  };

  console.log('[PageState] Module loaded, current saved page:', restore());
})();
