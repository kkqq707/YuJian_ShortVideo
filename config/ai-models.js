/**
 * AI Models Configuration Center — 阿里云百炼模型配置
 *
 * Sprint 5.1: 统一管理所有 AI 模型定义
 *
 * 职责：
 *   1. 定义可用模型的完整元数据（名称、版本、能力、参数约束）
 *   2. 提供按 capability / outputType 解析模型的方法
 *   3. 作为 generationService 和 provider 之间的单点配置源
 *
 * 模型清单：
 *   ┌──────────────────────────┬────────────────────┬──────────────────┐
 *   │ 模型名称                  │ capability          │ outputType       │
 *   ├──────────────────────────┼────────────────────┼──────────────────┤
 *   │ Wan2.1-T2V (文生视频)     │ text_to_video       │ video            │
 *   │ Wan2.1-I2V (图生视频)     │ image_to_video      │ video            │
 *   │ Qwen-Image (文生图)       │ image_generation    │ image            │
 *   │ Qwen-Image-Edit (图片编辑)│ image_edit          │ image            │
 *   └──────────────────────────┴────────────────────┴──────────────────┘
 *
 * 使用方式：
 *   const { getModelConfig, resolveModelForTemplate } = require('./config/ai-models');
 *   const config = getModelConfig('wan2.1-t2v');
 */

// ═══════════════════════════════════════════════════════════════════════
//  模型定义
// ═══════════════════════════════════════════════════════════════════════

const AI_MODELS = {
  // ─── Wan2.1 系列 ─────────────────────────────────────────────────
  'wan2.1-t2v': {
    id: 'wan2.1-t2v',
    name: 'Wan2.1 文生视频',
    displayName: 'Wan2.1',
    family: 'wan2.1',
    provider: 'aliyun',
    capability: 'text_to_video',
    outputType: 'video',
    apiModelName: 'happyhorse-t2v',       // DashScope API 实际模型名
    description: '通过文字描述直接生成高质量视频，零素材创作',
    category: 'video',
    categoryLabel: '视频生成',
    icon: '📽️',
    sort: 4,

    // 参数约束
    maxPromptLength: 2000,
    defaultDuration: 5,
    maxDuration: 30,
    supportedSizes: ['1080p', '720p'],
    defaultSize: '1080p',

    // 定价
    pricing: {
      pointsPerUnit: 12,
      unit: 'second'
    }
  },

  'wan2.1-i2v': {
    id: 'wan2.1-i2v',
    name: 'Wan2.1 图生视频',
    displayName: 'Wan2.1',
    family: 'wan2.1',
    provider: 'aliyun',
    capability: 'image_to_video',
    outputType: 'video',
    apiModelName: 'happyhorse-1.1-i2v',    // DashScope API 实际模型名 (图生视频)
    description: '将静态图片转换为动态视频，赋予画面生命力',
    category: 'video',
    categoryLabel: '视频生成',
    icon: '🎬',
    sort: 3,

    // 参数约束
    maxPromptLength: 2000,
    defaultDuration: 5,
    maxDuration: 30,
    supportedSizes: ['720P', '480P'],
    defaultSize: '720P',
    requireImage: true,

    // 定价
    pricing: {
      pointsPerUnit: 12,
      unit: 'second'
    }
  },

  // ─── Qwen-Image 系列 ────────────────────────────────────────────
  'qwen-image': {
    id: 'qwen-image',
    name: 'Qwen-Image 商业图片生成',
    displayName: 'Qwen-Image',
    family: 'qwen-image',
    provider: 'aliyun',
    capability: 'image_generation',
    outputType: 'image',
    apiModelName: 'qwen-image-3.0-pro',   // DashScope API 实际模型名
    description: '通过文字描述生成高质量商业图片，适合产品展示、营销素材',
    category: 'image',
    categoryLabel: '图片生成',
    icon: '🎨',
    sort: 1,

    // 参数约束
    maxPromptLength: 2000,
    supportedSizes: ['1024*1024', '1024*768', '768*1024', '1024*576'],
    defaultSize: '1024*1024',
    maxBatchSize: 4,

    // 定价
    pricing: {
      pointsPerUnit: 1,
      unit: 'image'
    }
  },

  'qwen-image-edit': {
    id: 'qwen-image-edit',
    name: 'Qwen-Image 图片智能编辑',
    displayName: 'Qwen-Image-Edit',
    family: 'qwen-image',
    provider: 'aliyun',
    capability: 'image_edit',
    outputType: 'image',
    apiModelName: 'qwen-image-edit',      // DashScope API 实际模型名
    description: '对现有图片进行智能编辑、优化和风格转换',
    category: 'image',
    categoryLabel: '图片编辑',
    icon: '✏️',
    sort: 2,

    // 参数约束
    maxPromptLength: 2000,
    supportedSizes: ['1024*1024', '1024*768', '768*1024'],
    defaultSize: '1024*1024',
    requireImage: true,

    // 定价（预留，API 待百炼开放）
    pricing: {
      pointsPerUnit: 1,
      unit: 'image'
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  Template → Model 映射
//
//  前端只传 templateId，后端通过此表解析实际模型。
//  这是连接 creativeTemplates 和 AI_MODELS 的桥梁。
// ═══════════════════════════════════════════════════════════════════════

const TEMPLATE_MODEL_MAP = {
  'image_generation': 'qwen-image',
  'image_edit':       'qwen-image-edit',
  'image_to_video':   'wan2.1-i2v',
  'text_to_video':    'wan2.1-t2v'
};

// ═══════════════════════════════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════════════════════════════

/**
 * 根据模型 ID 获取完整配置
 *
 * @param {string} modelId — 模型 ID（如 'wan2.1-t2v', 'qwen-image'）
 * @returns {Object|null} 模型配置对象，未找到返回 null
 */
function getModelConfig(modelId) {
  if (!modelId || typeof modelId !== 'string') {
    return null;
  }
  return AI_MODELS[modelId] || null;
}

/**
 * 根据 templateId 解析对应的模型配置
 *
 * 解析链：templateId → modelId → AI_MODELS[modelId]
 *
 * @param {string} templateId — 创作模板 ID（如 'image_to_video'）
 * @returns {Object|null} 模型配置对象，未找到返回 null
 */
function resolveModelForTemplate(templateId) {
  if (!templateId || typeof templateId !== 'string') {
    return null;
  }

  const modelId = TEMPLATE_MODEL_MAP[templateId];
  if (!modelId) {
    return null;
  }

  return AI_MODELS[modelId] || null;
}

/**
 * 根据 capability 查找匹配的模型列表
 *
 * @param {string} capability — 能力类型（如 'text_to_video'）
 * @returns {Object[]} 匹配的模型配置数组
 */
function getModelsByCapability(capability) {
  if (!capability) return [];
  return Object.values(AI_MODELS).filter(m => m.capability === capability);
}

/**
 * 根据 outputType 查找匹配的模型列表
 *
 * @param {string} outputType — 输出类型（'image' | 'video'）
 * @returns {Object[]} 匹配的模型配置数组
 */
function getModelsByOutputType(outputType) {
  if (!outputType) return [];
  return Object.values(AI_MODELS).filter(m => m.outputType === outputType);
}

/**
 * 根据模型家族查找
 *
 * @param {string} family — 模型家族（'wan2.1' | 'qwen-image'）
 * @returns {Object[]} 匹配的模型配置数组
 */
function getModelsByFamily(family) {
  if (!family) return [];
  return Object.values(AI_MODELS).filter(m => m.family === family);
}

/**
 * 获取所有已注册的模型 ID 列表
 *
 * @returns {string[]}
 */
function getAllModelIds() {
  return Object.keys(AI_MODELS);
}

/**
 * 获取所有已注册的模型配置（浅拷贝数组）
 *
 * @returns {Object[]}
 */
function getAllModels() {
  return Object.values(AI_MODELS).map(m => ({ ...m }));
}

/**
 * 获取所有支持的 templateId 列表
 *
 * @returns {string[]}
 */
function getSupportedTemplateIds() {
  return Object.keys(TEMPLATE_MODEL_MAP);
}

/**
 * 检查 templateId 是否有对应的模型映射
 *
 * @param {string} templateId
 * @returns {boolean}
 */
function isTemplateSupported(templateId) {
  return templateId in TEMPLATE_MODEL_MAP;
}

/**
 * 获取模型定价信息
 *
 * @param {string} modelId — 模型 ID
 * @returns {{ pointsPerUnit: number, unit: string }|null}
 */
function getModelPricing(modelId) {
  const config = getModelConfig(modelId);
  return config ? config.pricing : null;
}

/**
 * 获取模型的 API 调用名称（DashScope API 实际使用的模型名）
 *
 * @param {string} modelId — 内部模型 ID
 * @returns {string|null} API 模型名称
 */
function getApiModelName(modelId) {
  const config = getModelConfig(modelId);
  return config ? config.apiModelName : null;
}

module.exports = {
  // 模型定义
  AI_MODELS,
  TEMPLATE_MODEL_MAP,

  // 查询方法
  getModelConfig,
  resolveModelForTemplate,
  getModelsByCapability,
  getModelsByOutputType,
  getModelsByFamily,
  getAllModelIds,
  getAllModels,
  getSupportedTemplateIds,
  isTemplateSupported,

  // 便捷方法
  getModelPricing,
  getApiModelName
};
