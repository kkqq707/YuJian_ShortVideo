/**
 * Aliyun DashScope Provider — 配置
 *
 * Sprint 4.6: AI Provider 架构准备
 *
 * 统一管理：
 *   - endpoint
 *   - apiKey 来源（仅从项目 .env 文件，禁止 Windows 系统环境变量）
 *   - timeout / paths
 *
 * Phase 2-C-1-E-2: ALIYUN_MODELS 已迁移至 config/ai-model-registry.js。
 *   模型解析函数（resolveModel 等）委托给 registry。
 *
 * 禁止：
 *   业务代码直接读取 process.env.DASHSCOPE_*
 *   前端直接传模型名称
 */

const apiKeys = require('../../config/api-keys');
const registry = require('../../config/ai-model-registry');

// ─── Aliyun Provider 配置 ─────────────────────────────────────────

const ALIYUN_CONFIG = {
  provider: 'aliyun',

  // API 端点（仅从 .env 文件读取）
  get endpoint() {
    return apiKeys.DASHSCOPE_ENDPOINT || 'https://dashscope.aliyuncs.com';
  },

  // API Key（仅从 .env 文件读取，禁止 Windows 系统环境变量）
  get apiKey() {
    return apiKeys.DASHSCOPE_API_KEY || '';
  },

  // 默认视频模型（仅从 .env 文件读取）
  get defaultVideoModel() {
    return apiKeys.DASHSCOPE_VIDEO_MODEL || registry.getApiModelName('happyhorse-1.1-i2v');
  },

  // 请求超时（毫秒）
  get timeout() {
    return parseInt(apiKeys.DASHSCOPE_REQUEST_TIMEOUT) || 30000;
  },

  // 回调签名密钥（仅从 .env 文件读取）
  get callbackSecret() {
    return apiKeys.DASHSCOPE_CALLBACK_SECRET || '';
  },

  // API 路径
  paths: {
    videoGeneration: '/api/v1/services/aigc/video-generation/generation',
    imageGeneration: '/api/v1/services/aigc/text2image/image-synthesis',
    taskStatus: '/api/v1/tasks'  // 使用时拼接 /{taskId}
  }
};

// ─── 工具函数（委托给 registry）────────────────────────────────────

/**
 * 根据 templateId 解析模型配置
 *
 * @param {string} templateId — 创作模板 ID（如 'image_to_video'）
 * @returns {{ provider: string, model: string, capability: string, outputType: string }|null}
 */
function resolveModel(templateId) {
  const modelConfig = registry.resolveTemplate(templateId);
  if (!modelConfig) return null;
  return {
    provider: modelConfig.provider,
    model: modelConfig.apiModelName,
    capability: modelConfig.capability,
    outputType: modelConfig.outputType,
  };
}

/**
 * 根据 capability 解析模型配置
 *
 * @param {string} capability — 能力类型（如 'image_to_video'）
 * @returns {{ provider: string, model: string, capability: string, outputType: string }|null}
 */
function resolveModelByCapability(capability) {
  const models = registry.getModelsByCapability(capability);
  if (!models || models.length === 0) return null;
  const modelConfig = models[0];
  return {
    provider: modelConfig.provider,
    model: modelConfig.apiModelName,
    capability: modelConfig.capability,
    outputType: modelConfig.outputType,
  };
}

/**
 * 获取所有支持的 templateId 列表
 * @returns {string[]}
 */
const getSupportedTemplateIds = registry.getSupportedTemplateIds;

/**
 * 检查 templateId 是否受阿里云支持
 * @param {string} templateId
 * @returns {boolean}
 */
const isSupportedTemplate = registry.isTemplateSupported;

module.exports = {
  ALIYUN_CONFIG,
  resolveModel,
  resolveModelByCapability,
  getSupportedTemplateIds,
  isSupportedTemplate
};
