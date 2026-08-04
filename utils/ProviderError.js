/**
 * ProviderError — 统一的 AI Provider 错误类
 *
 * Sprint 4.6: AI Provider 架构准备
 *
 * 用途：
 *   所有 AI Provider（阿里云百炼、未来第三方）的错误统一使用此类包装
 *
 * 字段：
 *   provider   — 出错的 Provider 名称（如 'aliyun'）
 *   code       — 错误码（如 'TIMEOUT', 'INVALID_PARAM', 'AUTH_FAILED'）
 *   message    — 人类可读的错误描述（已脱敏，不含 API Key）
 *   retryable  — 是否可重试
 *   statusCode — HTTP 状态码（可选）
 *   originalError — 原始错误对象（内部调试用，不暴露给客户端）
 *
 * 使用示例：
 *   throw new ProviderError('aliyun', 'TIMEOUT', 'DashScope request timeout', true);
 *   throw new ProviderError('aliyun', 'AUTH_FAILED', 'Invalid API key', false, 401);
 */

class ProviderError extends Error {
  /**
   * @param {string} provider   — Provider 名称
   * @param {string} code       — 错误码
   * @param {string} message    — 错误描述
   * @param {boolean} retryable — 是否可重试
   * @param {number}  [statusCode] — HTTP 状态码
   * @param {Error}   [originalError] — 原始错误
   */
  constructor(provider, code, message, retryable = false, statusCode = null, originalError = null) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.message = message;
    this.retryable = retryable;
    this.statusCode = statusCode;
    this.originalError = originalError;

    // 保留堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProviderError);
    }
  }

  /**
   * 转换为安全的 JSON 对象（不含 originalError，适合返回给客户端）
   * @returns {{ provider: string, code: string, message: string, retryable: boolean, statusCode: number|null }}
   */
  toJSON() {
    return {
      provider: this.provider,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      statusCode: this.statusCode
    };
  }

  /**
   * 从 dashscopeService.sanitizeError() 的结果创建 ProviderError
   *
   * @param {string} provider — Provider 名称
   * @param {Object} safeError — sanitizeError 返回的安全错误对象
   * @returns {ProviderError}
   */
  static fromSafeError(provider, safeError) {
    return new ProviderError(
      provider,
      safeError.errorCode || 'UNKNOWN',
      safeError.safeMessage || 'Unknown provider error',
      safeError.retryable || false,
      safeError.statusCode || null
    );
  }
}

module.exports = ProviderError;
