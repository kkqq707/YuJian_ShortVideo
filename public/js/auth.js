/**
 * YuJian Auth — 企业用户登录与 Token 管理
 *
 * 依赖：YuJianAPI (public/js/api.js)，需在 api.js 之后引入
 *
 * 使用方式：
 *   await YuJianAuth.login({ phone, password });
 *   await YuJianAuth.sendCode({ phone, purpose });
 *   await YuJianAuth.loginByCode({ phone, code });
 *   await YuJianAuth.setPassword({ password });
 *   await YuJianAuth.forgotPassword({ phone, code, password });
 *   YuJianAuth.isAuthenticated();
 *   YuJianAuth.logout();
 *
 * Auth-Rebuild-004：在保留旧 Token / userInfo / sessionStorage 语义不变的前提下，
 * 新增验证码登录 / 发送验证码 / 设置密码 / 忘记密码能力，接口由 Auth-Rebuild-003 后端提供。
 */

(function () {
  'use strict';

  const api = window.YuJianAPI;

  /**
   * 统一保存登录凭证（保持与旧逻辑一致：yj_token / yj_user → sessionStorage）
   * @param {{token: string, userInfo: object}} result
   */
  function persistLogin(result) {
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
   * 手机号 + 密码登录
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

    // Auth-Rebuild-004：后端手机号优先路径，直接提交 phone 字段
    const result = await api.post('/auth/enterprise/login', { phone, password });
    // result = { token, userInfo: { id, email, phone, role, enterprise_id, company_name } }

    return persistLogin(result);
  }

  /**
   * 发送短信验证码
   * @param {{phone: string, purpose: 'login'|'reset'}} payload
   * @returns {Promise<{sent: boolean, purpose: string}>}
   */
  async function sendCode({ phone, purpose }) {
    if (!phone) {
      throw new api.ApiError({
        code: 'VALIDATION',
        message: '请输入手机号',
        status: 400,
        retryable: false,
        raw: null
      });
    }
    // 响应绝不包含验证码；错误文案（频控/未配置等）直接透传后端 message
    return api.post('/auth/enterprise/send-code', { phone, purpose });
  }

  /**
   * 验证码登录
   * @param {{phone: string, code: string}} payload
   * @returns {Promise<{token: string, userInfo: object, needSetPassword: boolean}>}
   */
  async function loginByCode({ phone, code }) {
    if (!phone || !code) {
      throw new api.ApiError({
        code: 'VALIDATION',
        message: '请输入手机号和验证码',
        status: 400,
        retryable: false,
        raw: null
      });
    }

    const result = await api.post('/auth/enterprise/login-by-code', { phone, code });
    // 未注册手机号（自动注册阻塞）会由后端返回 400 + reason 透传，不会走到这里
    return persistLogin(result);
  }

  /**
   * 首次设置密码（必须已登录）
   * @param {{password: string}} payload
   * @returns {Promise<{message: string}>}
   */
  async function setPassword({ password }) {
    if (!password) {
      throw new api.ApiError({
        code: 'VALIDATION',
        message: '请输入新密码',
        status: 400,
        retryable: false,
        raw: null
      });
    }
    // Token 由 api.js 统一携带 Authorization: Bearer <token>
    return api.post('/auth/enterprise/set-password', { password });
  }

  /**
   * 忘记密码（短信验证后重置）
   * @param {{phone: string, code: string, password: string}} payload
   * @returns {Promise<{message: string}>}
   */
  async function forgotPassword({ phone, code, password }) {
    if (!phone || !code || !password) {
      throw new api.ApiError({
        code: 'VALIDATION',
        message: '请输入手机号、验证码和新密码',
        status: 400,
        retryable: false,
        raw: null
      });
    }
    return api.post('/auth/enterprise/forgot-password', { phone, code, password });
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
    loginByCode,
    sendCode,
    setPassword,
    forgotPassword,
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
