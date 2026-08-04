/**
 * Aliyun DashScope Provider — 配置
 *
 * Sprint 4.6: AI Provider 架构准备
 *
 * 统一管理：
 *   - endpoint
 *   - apiKey 来源
 *   - model mapping（templateId → model）
 *
 * 禁止：
 *   业务代码直接读取 process.env.DASHSCOPE_*
 *   前端直接传模型名称
 */

// ─── Aliyun 模型映射表 ────────────────────────────────────────────
//
// 前端只传 templateId，后端通过此映射表解析实际模型。
//
// 映射关系：
//   templateId         → capability          → model
//   ───────────────────────────────────────────────────────
//   image_generation   → image_generation    → qwen-image-3.0-pro
//   image_edit         → image_edit          → qwen-image-edit
//   image_to_video     → image_to_video      → happyhorse-i2v
//   text_to_video      → text_to_video       → happyhorse-t2v

const ALIYUN_MODELS = {
  image_generation: {
    provider: 'aliyun',
    model: 'qwen-image-3.0-pro',
    capability: 'image_generation',
    outputType: 'image'
  },
  image_edit: {
    provider: 'aliyun',
    model: 'qwen-image-edit',
    capability: 'image_edit',
    outputType: 'image'
  },
  image_to_video: {
    provider: 'aliyun',
    model: 'wanx2.1-i2v-turbo',   // Sprint 5.3 修复: wan2.1 → wanx2.1 (2.1系列需wanx前缀)
    capability: 'image_to_video',
    outputType: 'video'
  },
  text_to_video: {
    provider: 'aliyun',
    model: 'happyhorse-t2v',
    capability: 'text_to_video',
    outputType: 'video'
  }
};

// ─── Aliyun Provider 配置 ─────────────────────────────────────────

const ALIYUN_CONFIG = {
  provider: 'aliyun',

  // API 端点（优先使用 ApiConfig，其次 env）
  get endpoint() {
    return process.env.DASHSCOPE_ENDPOINT || 'https://dashscope.aliyuncs.com';
  },

  // API Key（优先使用 ApiConfig，其次 env）
  get apiKey() {
    return process.env.DASHSCOPE_API_KEY || '';
  },

  // 默认视频模型
  get defaultVideoModel() {
    return process.env.DASHSCOPE_VIDEO_MODEL || 'wanx2.1-i2v-turbo';
  },

  // 请求超时（毫秒）
  get timeout() {
    return parseInt(process.env.DASHSCOPE_REQUEST_TIMEOUT) || 30000;
  },

  // 回调签名密钥
  get callbackSecret() {
    return process.env.DASHSCOPE_CALLBACK_SECRET || '';
  },

  // API 路径
  paths: {
    videoGeneration: '/api/v1/services/aigc/video-generation/generation',
    imageGeneration: '/api/v1/services/aigc/text2image/image-synthesis',
    taskStatus: '/api/v1/tasks'  // 使用时拼接 /{taskId}
  }
};

// ─── 工具函数 ─────────────────────────────────────────────────────

/**
 * 根据 templateId 解析模型配置
 *
 * @param {string} templateId — 创作模板 ID（如 'image_to_video'）
 * @returns {{ provider: string, model: string, capability: string, outputType: string }|null}
 */
function resolveModel(templateId) {
  if (!templateId || typeof templateId !== 'string') {
    return null;
  }
  return ALIYUN_MODELS[templateId] || null;
}

/**
 * 根据 capability 解析模型配置
 *
 * @param {string} capability — 能力类型（如 'image_to_video'）
 * @returns {{ provider: string, model: string, capability: string, outputType: string }|null}
 */
function resolveModelByCapability(capability) {
  if (!capability || typeof capability !== 'string') {
    return null;
  }
  for (const [, config] of Object.entries(ALIYUN_MODELS)) {
    if (config.capability === capability) {
      return config;
    }
  }
  return null;
}

/**
 * 获取所有支持的 templateId 列表
 * @returns {string[]}
 */
function getSupportedTemplateIds() {
  return Object.keys(ALIYUN_MODELS);
}

/**
 * 检查 templateId 是否受阿里云支持
 * @param {string} templateId
 * @returns {boolean}
 */
function isSupportedTemplate(templateId) {
  return templateId in ALIYUN_MODELS;
}

module.exports = {
  ALIYUN_MODELS,
  ALIYUN_CONFIG,
  resolveModel,
  resolveModelByCapability,
  getSupportedTemplateIds,
  isSupportedTemplate
};
