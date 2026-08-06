const crypto = require('crypto');
const apiKeys = require('../config/api-keys');

/**
 * DashScope Callback HMAC-SHA256 签名验证中间件
 *
 * 验证阿里云百炼 DashScope 回调请求的签名。
 * 签名算法：HMAC-SHA256(rawBody, DASHSCOPE_CALLBACK_SECRET)
 * 签名格式：hex 字符串
 *
 * 请求头：
 *   X-DashScope-Signature: <hex-encoded-hmac-sha256>
 *
 * 验证失败返回 401，成功则继续执行原回调逻辑。
 *
 * 注意：DASHSCOPE_CALLBACK_SECRET 仅从项目 .env 文件读取，
 * 不会使用 Windows 系统环境变量。
 */

const SIGNATURE_HEADER = 'x-dashscope-signature';

function getCallbackSecret() {
  return apiKeys.DASHSCOPE_CALLBACK_SECRET || '';
}

/**
 * 验证回调签名
 */
function verifySignature(rawBody, receivedSignature, secret) {
  if (!secret || typeof secret !== 'string' || secret.length === 0) {
    console.error('[CallbackSignature] DASHSCOPE_CALLBACK_SECRET is not configured');
    return false;
  }

  if (!receivedSignature || typeof receivedSignature !== 'string') {
    console.warn('[CallbackSignature] Missing X-DashScope-Signature header');
    return false;
  }

  if (!rawBody || rawBody.length === 0) {
    console.warn('[CallbackSignature] Empty request body');
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    // 使用 timingSafeEqual 防止时序攻击
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const receivedBuf = Buffer.from(receivedSignature, 'hex');

    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch (error) {
    console.error('[CallbackSignature] Signature verification error:', error.message);
    return false;
  }
}

/**
 * Express 中间件：验证 DashScope 回调签名
 */
function callbackSignatureMiddleware(req, res, next) {
  const secret = getCallbackSecret();

  // 如果未配置 callback secret，记录警告并拒绝所有回调
  if (!secret) {
    console.error(
      '[CallbackSignature] DASHSCOPE_CALLBACK_SECRET not configured. ' +
      'All DashScope callbacks will be rejected (401). ' +
      'Set DASHSCOPE_CALLBACK_SECRET in .env to a secure random string.'
    );
    return res.status(401).json({
      code: 401,
      message: 'Callback secret not configured',
      data: null
    });
  }

  const receivedSignature = req.headers[SIGNATURE_HEADER];
  const rawBody = req.rawBody;

  if (!verifySignature(rawBody, receivedSignature, secret)) {
    console.warn(
      '[CallbackSignature] Signature verification FAILED | ' +
      `ip=${req.ip} | ` +
      `header=${receivedSignature ? receivedSignature.substring(0, 8) + '...' : '(missing)'}`
    );
    return res.status(401).json({
      code: 401,
      message: 'Signature verification failed',
      data: null
    });
  }

  // 签名验证通过，继续执行原回调逻辑
  next();
}

module.exports = callbackSignatureMiddleware;
