/**
 * YuJian Auth — 企业用户登录与 Token 管理
 *
 * 依赖：YuJianAPI (public/js/api.js)，需在 api.js 之后引入
 *
 * 使用方式：
 *   await YuJianAuth.login({ email, password });
 *   YuJianAuth.isAuthenticated();
 *   YuJianAuth.logout();
 */

(function () {
  'use strict';

  const api = window.YuJianAPI;

  /**
   * 登录
   * @param {{phone: string, password: string}} credentials
   * @returns {Promise<{token: string, userInfo: object}>}
   */
  async function login({ phone, password }) {
    if (!phone || !password) {
      throw new api.ApiError({
        code: 'VALIDATION',
        message: '请输入手机号和密码',
        status: 400,
        retryable: false,
        raw: null
      });
    }

    // 后端接口字段名为 email，前端传 phone 值映射到 email 字段
    const result = await api.post('/auth/enterprise/login', { email: phone, password });
    // result = { token, userInfo: { id, email, role, enterprise_id, company_name } }

    if (!result.token) {
      throw new api.ApiError({
        code: 'LOGIN_FAILED',
        message: '登录失败：服务器未返回有效凭证',
        status: 500,
        retryable: false,
        raw: result
      });
    }

    // 保存 Token
    api.setToken(result.token);

    // 保存用户信息以便展示
    if (result.userInfo) {
      sessionStorage.setItem('yj_user', JSON.stringify(result.userInfo));
    }

    return result;
  }

  /**
   * 退出登录
   */
  function logout() {
    api.clearToken();
    sessionStorage.removeItem('yj_user');
    sessionStorage.removeItem('yj_pending_task');
  }

  /**
   * 是否已认证
   */
  function isAuthenticated() {
    return api.isAuthenticated();
  }

  /**
   * 获取已登录用户信息
   */
  function getUserInfo() {
    const raw = sessionStorage.getItem('yj_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  /**
   * 获取企业ID
   */
  function getEnterpriseId() {
    const user = getUserInfo();
    return user?.enterprise_id || null;
  }

  /**
   * 验证当前 Token 是否有效（可选：调用余额接口验证）
   */
  async function verifyToken() {
    if (!isAuthenticated()) return false;
    try {
      await api.get('/enterprise/quota/balance');
      return true;
    } catch (err) {
      if (err.status === 401) {
        logout();
      }
      return false;
    }
  }

  // ─── 暴露到全局 ──────────────────────────────────────────
  window.YuJianAuth = {
    login,
    logout,
    isAuthenticated,
    getUserInfo,
    getEnterpriseId,
    verifyToken,
    getToken: api.getToken,
    setToken: api.setToken,
    clearToken: api.clearToken
  };

})();
