/**
 * SmsService — 短信验证码发送服务
 *
 * Phase DigitalHuman-Rebuild-004 → Auth-Rebuild-003（手机号认证后端能力）
 *
 * 阶段策略（任务第三节）：
 *   - 开发环境（NODE_ENV !== 'production'）：Mock 短信
 *       · 验证码取 SMS_MOCK_CODE（默认 123456），落库走真实存储/校验/消费链路
 *       · 验证码仅在受控开发日志输出（只输出 code，不关联手机号，避免敏感信息泄漏）
 *   - 生产环境（NODE_ENV === 'production'）：不自动使用固定验证码
 *       · 阿里云短信尚未在本阶段接入；未配置密钥时明确抛错，拒绝静默发送
 *   - 严禁：API response 含验证码 / 验证码写进 userInfo 或 JWT / 日志输出"手机号+验证码"
 */

/**
 * 生成本次验证码
 * 开发环境返回固定 Mock 码（默认 123456）；生产环境生成随机 6 位数字。
 */
function issueVerificationCode() {
  if (process.env.NODE_ENV !== 'production') {
    return process.env.SMS_MOCK_CODE || '123456';
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 发送验证码。
 * @param {{ phone: string, code: string }} params
 * @returns {Promise<{ delivered: 'mock' | 'production' }>} 永不返回验证码本体
 * @throws {Error} code === 'SMS_NOT_CONFIGURED' 表示短信未配置/未接入
 */
async function sendVerificationCode({ phone, code }) {
  // 开发环境 Mock：受控日志只输出 code，不打印手机号
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[SmsService][mock] 验证码: ${code}（开发环境 Mock，生产环境不会输出）`
    );
    return { delivered: 'mock' };
  }

  // 生产环境：必须显式配置阿里云短信，否则拒绝发送（不静默失败）
  const configured =
    process.env.SMS_ACCESS_KEY_ID &&
    process.env.SMS_ACCESS_KEY_SECRET &&
    process.env.SMS_SIGN_NAME &&
    process.env.SMS_TEMPLATE_CODE;

  if (!configured) {
    const err = new Error('短信服务未配置，请联系管理员');
    err.code = 'SMS_NOT_CONFIGURED';
    throw err;
  }

  // TODO(Auth-Rebuild-004 或后续 phase)：对接阿里云短信 dysmsapi
  //   签名 + 模板 + 手机号 + code 真实下发；本阶段不接入，避免假发送造成误判。
  const err = new Error('短信服务未接入，请稍后再试');
  err.code = 'SMS_NOT_CONFIGURED';
  throw err;
}

module.exports = { issueVerificationCode, sendVerificationCode };
