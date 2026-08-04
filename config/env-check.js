/**
 * 环境变量检查工具
 *
 * 在应用启动时调用，检查必要配置是否就绪。
 * - 缺少 DashScope API Key 仅警告，不阻止启动（其他接口不受影响）
 * - 缺少 JWT_SECRET 或使用默认值 → 警告
 * - 日志输出时自动屏蔽敏感信息
 */

const REQUIRED_CONFIGS = {
  // 数据库 — 已在 config/database.js 中强校验，此处仅确认
  DB_HOST: { required: true, label: '数据库地址' },
  DB_PORT: { required: true, label: '数据库端口' },
  DB_NAME: { required: true, label: '数据库名称' },
  DB_USER: { required: true, label: '数据库用户' },
  DB_PASSWORD: { required: true, label: '数据库密码', secret: true },

  // JWT
  JWT_SECRET: { required: true, label: 'JWT 密钥', secret: true },
  JWT_EXPIRES_IN: { required: false, label: 'JWT 有效期' },

  // DashScope — 仅在实际调用时强制要求，启动时只提示
  DASHSCOPE_API_KEY: { required: false, label: 'DashScope API Key', secret: true },
  DASHSCOPE_BASE_URL: { required: false, label: 'DashScope 接口地址' },
  DASHSCOPE_VIDEO_MODEL: { required: false, label: 'DashScope 默认视频模型' },
  DASHSCOPE_REQUEST_TIMEOUT: { required: false, label: 'DashScope 请求超时' },
  DASHSCOPE_CALLBACK_SECRET: { required: false, label: 'DashScope 回调签名密钥', secret: true },

  // OSS — 文件上传依赖
  OSS_ACCESS_KEY_ID: { required: false, label: 'OSS AccessKeyId', secret: true },
  OSS_ACCESS_KEY_SECRET: { required: false, label: 'OSS AccessKeySecret', secret: true },
  OSS_REGION: { required: false, label: 'OSS 区域' },
  OSS_BUCKET: { required: false, label: 'OSS 存储桶' },
  OSS_ENDPOINT: { required: false, label: 'OSS 访问域名' }
};

/**
 * 脱敏字符串：保留首4位和末4位，中间用 *** 替代
 */
function mask(str) {
  if (!str || typeof str !== 'string') return '(未设置)';
  if (str.length <= 8) return str.substring(0, 2) + '***' + str.substring(str.length - 2);
  return str.substring(0, 4) + '***' + str.substring(str.length - 4);
}

function checkEnv() {
  const warnings = [];
  const errors = [];
  const report = {};

  // DASHSCOPE_BASE_URL 兼容 DASHSCOPE_ENDPOINT（旧配置名）
  if (!process.env.DASHSCOPE_BASE_URL && process.env.DASHSCOPE_ENDPOINT) {
    process.env.DASHSCOPE_BASE_URL = process.env.DASHSCOPE_ENDPOINT;
  }

  for (const [key, opts] of Object.entries(REQUIRED_CONFIGS)) {
    const value = process.env[key];
    const isSet = value !== undefined && value !== '';

    report[key] = {
      set: isSet,
      value: opts.secret && isSet ? mask(value) : isSet ? value : '(未设置)'
    };

    if (opts.required && !isSet) {
      errors.push(`${opts.label} (${key}) 未配置`);
    } else if (!opts.required && !isSet && opts.secret) {
      // 非必需的密钥类配置，仅记录
      // DashScope API Key 缺失不报错，留给实际调用方检查
    }
  }

  // JWT_SECRET 使用默认值检查
  if (process.env.JWT_SECRET) {
    try {
      // 检查是否为示例/默认值（短于32字节即可疑）
      if (Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
        warnings.push('JWT_SECRET 过短，建议使用至少 64 字节随机字符串');
      }
    } catch (_) { /* ignore */ }
  }

  return { errors, warnings, report };
}

function printEnvReport() {
  const { errors, warnings, report } = checkEnv();

  console.log('\n┌──────────────────────────────────────────────┐');
  console.log('│          🔍 环境变量检查                      │');
  console.log('├──────────────────────────────────────────────┤');

  // 分组输出
  const groups = [
    { title: '数据库', keys: ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] },
    { title: 'JWT', keys: ['JWT_SECRET', 'JWT_EXPIRES_IN'] },
    { title: 'DashScope', keys: ['DASHSCOPE_API_KEY', 'DASHSCOPE_BASE_URL', 'DASHSCOPE_VIDEO_MODEL', 'DASHSCOPE_REQUEST_TIMEOUT', 'DASHSCOPE_CALLBACK_SECRET'] },
    { title: 'OSS', keys: ['OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'OSS_REGION', 'OSS_BUCKET', 'OSS_ENDPOINT'] }
  ];

  for (const group of groups) {
    console.log(`│                                                │`);
    console.log(`│  ${group.title}:`);
    for (const key of group.keys) {
      const entry = report[key];
      const icon = entry.set ? '✅' : '⚠️ ';
      const displayValue = entry.value.length > 40 ? entry.value.substring(0, 40) + '...' : entry.value;
      console.log(`│    ${icon} ${key}=${displayValue}`);
    }
  }

  console.log('└──────────────────────────────────────────────┘');

  if (errors.length > 0) {
    console.error('\n❌ 严重配置错误（应用可能无法启动）：');
    errors.forEach(e => console.error(`   - ${e}`));
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  配置警告：');
    warnings.forEach(w => console.warn(`   - ${w}`));
  }

  // DashScope API Key 缺失的温馨提示
  if (!process.env.DASHSCOPE_API_KEY) {
    console.log('\n💡 提示：未配置 DASHSCOPE_API_KEY，视频生成接口暂不可用。');
    console.log('   登录、OSS 上传等其他功能不受影响。');
    console.log('   请前往阿里云百炼控制台获取 API Key：https://bailian.console.aliyun.com/');
  }

  if (errors.length === 0) {
    console.log('\n✅ 所有关键配置已就绪\n');
  }

  return { errors, warnings };
}

module.exports = { checkEnv, printEnvReport, mask };
