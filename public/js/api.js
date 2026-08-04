/**
 * YuJian API Client — 统一 HTTP 请求封装
 *
 * 使用方式：
 *   const data = await YuJianAPI.get('/enterprise/tasks/1');
 *   const result = await YuJianAPI.post('/enterprise/video-generation/tasks', { sourceAssetId, prompt });
 */

(function () {
  'use strict';

  const BASE_PATH = '/api';
  const TOKEN_KEY = 'yj_token';

  // ─── Token 管理 ───────────────────────────────────────────
  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function isAuthenticated() {
    return !!getToken();
  }

  // ─── 统一错误 ─────────────────────────────────────────────
  class ApiError extends Error {
    constructor({ code, message, status, retryable, raw }) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
      this.retryable = retryable;
      this.raw = raw; // 仅调试用，不展示给用户
    }
  }

  // ─── 请求核心 ─────────────────────────────────────────────
  async function request(path, options = {}) {
    const { method = 'GET', body, headers: customHeaders, signal, skipContentType } = options;

    const url = path.startsWith('http') ? path : `${BASE_PATH}${path}`;

    const headers = {};

    // JSON Content-Type — OSS 上传时跳过
    if (!skipContentType) {
      headers['Content-Type'] = 'application/json';
    }

    // JWT Token
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 合并自定义 headers
    Object.assign(headers, customHeaders || {});

    const fetchOptions = {
      method,
      headers
    };

    if (body && !skipContentType) {
      fetchOptions.body = JSON.stringify(body);
    } else if (body && skipContentType) {
      fetchOptions.body = body; // FormData
    }

    if (signal) {
      fetchOptions.signal = signal;
    }

    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ApiError({
          code: 'ABORTED',
          message: '请求已取消',
          status: 0,
          retryable: false,
          raw: err
        });
      }
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: '网络连接失败，请检查网络后重试',
        status: 0,
        retryable: true,
        raw: err
      });
    }

    // HTTP 非 2xx
    if (!response.ok) {
      // 401 — 清理 Token
      if (response.status === 401) {
        clearToken();
      }

      let bodyData = null;
      try {
        bodyData = await response.json();
      } catch (_) {
        // 无法解析为 JSON
      }

      throw new ApiError({
        code: bodyData?.code || response.status,
        message: bodyData?.message || `请求失败 (${response.status})`,
        status: response.status,
        retryable: response.status >= 500 || response.status === 0,
        raw: bodyData
      });
    }

    // 解析响应
    let result;
    try {
      result = await response.json();
    } catch (_) {
      throw new ApiError({
        code: 'PARSE_ERROR',
        message: '响应格式异常',
        status: response.status,
        retryable: false,
        raw: null
      });
    }

    // 业务层失败
    if (result.code && result.code !== 200) {
      if (result.code === 401) {
        clearToken();
      }
      throw new ApiError({
        code: result.code,
        message: result.message || '操作失败',
        status: result.code,
        retryable: result.code >= 500,
        raw: result
      });
    }

    // 返回 data 字段
    return result.data !== undefined ? result.data : result;
  }

  // ─── 便捷方法 ────────────────────────────────────────────
  function get(path, options = {}) {
    return request(path, { ...options, method: 'GET' });
  }

  function post(path, body, options = {}) {
    return request(path, { ...options, method: 'POST', body });
  }

  // ─── 暴露到全局 ──────────────────────────────────────────
  window.YuJianAPI = {
    request,
    get,
    post,
    getToken,
    setToken,
    clearToken,
    isAuthenticated,
    ApiError,
    BASE_PATH,
    TOKEN_KEY
  };

})();
