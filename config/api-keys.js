/**
 * API Key 统一配置模块
 *
 * ─── 核心原则 ────────────────────────────────────────────────
 *   1. 只读取项目根目录 .env 文件中的配置
 *   2. 禁止读取 Windows 系统环境变量
 *   3. 禁止 process.env fallback
 *   4. 缺少必需配置时直接报错退出
 *
 * ─── API Key 优先级（唯一来源）──────────────────────────────
 *   项目根目录 .env → 仅此一个来源
 *   禁止：Windows 系统环境变量
 *
 * ─── 实现机制 ───────────────────────────────────────────────
 *   直接读取并解析 .env 文件内容，存入内存对象。
 *   不使用 process.env，确保 KEY 不会来自 Windows 系统环境变量。
 *
 * ─── 使用方式 ───────────────────────────────────────────────
 *   const apiKeys = require('./config/api-keys');
 *   const key = apiKeys.DASHSCOPE_API_KEY;  // 不用 process.env
 */

const path = require('path');
const fs = require('fs');

// ─── .env 文件路径（固定为项目根目录）──────────────────────────
const ENV_PATH = path.resolve(__dirname, '..', '.env');

// ─── 脱敏工具 ──────────────────────────────────────────────────

/**
 * 对 API Key 进行脱敏处理
 * 保留前 8 位，其余用 ... 替代
 *
 * @param {string} key
 * @returns {string}
 */
function maskKey(key) {
  if (!key || typeof key !== 'string') return '(未设置)';
  if (key.length <= 8) return key.substring(0, 2) + '***';
  return key.substring(0, 8) + '...';
}

// ─── .env 文件存在性检查 ───────────────────────────────────────

function checkEnvFileExists() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('\n❌ 项目根目录未找到 .env 文件');
    console.error(`   期望路径: ${ENV_PATH}`);
    console.error('   请复制 .env.example 为 .env 并配置模型 API KEY\n');
    process.exit(1);
  }
}

// ─── 直接解析 .env 文件（绕过 process.env）────────────────────

/**
 * 解析 .env 文件内容为键值对对象。
 * 不使用 dotenv 或 process.env，确保值只来自 .env 文件本身。
 *
 * 支持格式：
 *   KEY=value
 *   KEY="value"
 *   KEY='value'
 *   # 注释行
 *   空行
 *
 * @param {string} filePath - .env 文件绝对路径
 * @returns {Object} 解析后的键值对
 */
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // 跳过空行和注释行
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // 处理引号包裹的值
    if ((value.startsWith('"') && value.indexOf('"', 1) !== -1)) {
      const endQuote = value.indexOf('"', 1);
      value = value.substring(1, endQuote);
    } else if (value.startsWith("'") && value.indexOf("'", 1) !== -1) {
      const endQuote = value.indexOf("'", 1);
      value = value.substring(1, endQuote);
    } else {
      // 移除行内注释（# 之后的内容）
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.substring(0, commentIndex).trim();
      }
    }

    result[key] = value;
  }

  return result;
}

// ─── 启动时执行：检查 .env 文件存在并解析 ──────────────────────
checkEnvFileExists();
const _envValues = parseEnvFile(ENV_PATH);

// ─── 取值函数（只从 .env 文件解析结果中读取，禁止 system env）───

/**
 * 获取必需的配置项（仅从 .env 文件读取）
 * 未配置时直接报错退出，禁止读取 Windows 系统环境变量
 *
 * @param {string} key - 环境变量名
 * @param {string} label - 中文描述
 * @returns {string}
 */
function getRequired(key, label) {
  const value = _envValues[key];
  if (!value || value === '') {
    console.error(`\n❌ Missing Aliyun API KEY in .env: ${label} (${key})`);
    console.error(`   配置文件: ${ENV_PATH}`);
    console.error('   请编辑项目根目录 .env 文件，填入正确的 API Key\n');
    process.exit(1);
  }
  return value;
}

/**
 * 获取可选的配置项（仅从 .env 文件读取）
 * 未配置时返回默认值，不读取系统环境变量
 *
 * @param {string} key
 * @param {*} defaultValue
 * @returns {*}
 */
function getOptional(key, defaultValue) {
  const value = _envValues[key];
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════════
//  导出的 API Key 配置（唯一来源：项目 .env）
// ═══════════════════════════════════════════════════════════════════

// ─── DashScope（阿里云百炼）─────────────────────────────────────
const DASHSCOPE_API_KEY = getRequired('DASHSCOPE_API_KEY', 'DashScope API Key');
const DASHSCOPE_ENDPOINT = getOptional('DASHSCOPE_ENDPOINT', 'https://dashscope.aliyuncs.com');
const DASHSCOPE_BASE_URL = getOptional('DASHSCOPE_BASE_URL', DASHSCOPE_ENDPOINT);
const DASHSCOPE_VIDEO_MODEL = getOptional('DASHSCOPE_VIDEO_MODEL', 'happyhorse-1.1-i2v');
const DASHSCOPE_REQUEST_TIMEOUT = parseInt(getOptional('DASHSCOPE_REQUEST_TIMEOUT', '30000'));
const DASHSCOPE_CALLBACK_SECRET = getOptional('DASHSCOPE_CALLBACK_SECRET', '');

// ─── OSS（阿里云对象存储）───────────────────────────────────────
const OSS_ACCESS_KEY_ID = getOptional('OSS_ACCESS_KEY_ID', '');
const OSS_ACCESS_KEY_SECRET = getOptional('OSS_ACCESS_KEY_SECRET', '');
const OSS_REGION = getOptional('OSS_REGION', 'oss-cn-beijing');
const OSS_BUCKET = getOptional('OSS_BUCKET', '');
const OSS_ENDPOINT = getOptional('OSS_ENDPOINT', 'https://oss-cn-beijing.aliyuncs.com');
const OSS_DOMAIN = getOptional('OSS_DOMAIN', '');

// ═══════════════════════════════════════════════════════════════════
//  启动日志：输出 API Key 来源和脱敏值
// ═══════════════════════════════════════════════════════════════════

function printKeySource() {
  console.log('\n┌──────────────────────────────────────────────────────────┐');
  console.log('│              🔑 API Key 来源检查                         │');
  console.log('│                                                          │');
  console.log('│  来源: 项目根目录 .env                                    │');
  console.log(`│  路径: ${ENV_PATH}`);
  console.log('│                                                          │');
  console.log('│  已加载的密钥（仅显示前8位）:                              │');
  console.log(`│    DASHSCOPE_API_KEY:          ${maskKey(DASHSCOPE_API_KEY)}`);
  console.log(`│    DASHSCOPE_CALLBACK_SECRET:  ${maskKey(DASHSCOPE_CALLBACK_SECRET)}`);
  if (OSS_ACCESS_KEY_ID) {
    console.log(`│    OSS_ACCESS_KEY_ID:          ${maskKey(OSS_ACCESS_KEY_ID)}`);
  }
  console.log('│                                                          │');
  console.log('│  ⚠ 禁止读取 Windows 系统环境变量                          │');
  console.log('│  ⚠ 所有密钥仅来自项目 .env 文件                           │');
  console.log('└──────────────────────────────────────────────────────────┘\n');
}

module.exports = {
  // DashScope
  DASHSCOPE_API_KEY,
  DASHSCOPE_ENDPOINT,
  DASHSCOPE_BASE_URL,
  DASHSCOPE_VIDEO_MODEL,
  DASHSCOPE_REQUEST_TIMEOUT,
  DASHSCOPE_CALLBACK_SECRET,

  // OSS
  OSS_ACCESS_KEY_ID,
  OSS_ACCESS_KEY_SECRET,
  OSS_REGION,
  OSS_BUCKET,
  OSS_ENDPOINT,
  OSS_DOMAIN,

  // 工具
  ENV_PATH,
  maskKey,
  printKeySource
};
