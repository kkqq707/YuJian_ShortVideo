/**
 * AI Models Configuration Center — 阿里云百炼模型配置
 *
 * Sprint 5.1: 统一管理所有 AI 模型定义
 *
 * ⚠️  @deprecated  Phase 2-C-1-E-2: 本文件已迁移为兼容层。
 *    请改用 config/ai-model-registry.js 作为唯一数据源。
 *    所有导出均委托给 registry，保持旧函数签名兼容。
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

const registry = require('./ai-model-registry');

// ═══════════════════════════════════════════════════════════════════════
//  模型定义（委托给 registry）
// ═══════════════════════════════════════════════════════════════════════

/**
 * @deprecated 请使用 registry.models
 */
const AI_MODELS = registry.models;

// ═══════════════════════════════════════════════════════════════════════
//  Template → Model 映射（委托给 registry）
// ═══════════════════════════════════════════════════════════════════════

/**
 * @deprecated 请使用 registry.templateModelMap
 */
const TEMPLATE_MODEL_MAP = registry.templateModelMap;

// ═══════════════════════════════════════════════════════════════════════
//  工具函数（全部委托给 registry）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 根据模型 ID 获取完整配置
 *
 * @param {string} modelId — 模型 ID（如 'wan2.1-t2v', 'qwen-image'）
 * @returns {Object|null} 模型配置对象，未找到返回 null
 */
const getModelConfig = registry.getModelConfig;

/**
 * 根据 templateId 解析对应的模型配置
 *
 * 解析链：templateId → modelId → AI_MODELS[modelId]
 *
 * @param {string} templateId — 创作模板 ID（如 'image_to_video'）
 * @returns {Object|null} 模型配置对象，未找到返回 null
 */
const resolveModelForTemplate = registry.resolveModelForTemplate;

/**
 * 根据 capability 查找匹配的模型列表
 *
 * @param {string} capability — 能力类型（如 'text_to_video'）
 * @returns {Object[]} 匹配的模型配置数组
 */
const getModelsByCapability = registry.getModelsByCapability;

/**
 * 根据 outputType 查找匹配的模型列表
 *
 * @param {string} outputType — 输出类型（'image' | 'video'）
 * @returns {Object[]} 匹配的模型配置数组
 */
const getModelsByOutputType = registry.getModelsByOutputType;

/**
 * 根据模型家族查找
 *
 * @param {string} family — 模型家族（'wan2.1' | 'qwen-image'）
 * @returns {Object[]} 匹配的模型配置数组
 */
const getModelsByFamily = registry.getModelsByFamily;

/**
 * 获取所有已注册的模型 ID 列表
 *
 * @returns {string[]}
 */
const getAllModelIds = registry.getAllModelIds;

/**
 * 获取所有已注册的模型配置（浅拷贝数组）
 *
 * @returns {Object[]}
 */
const getAllModels = registry.getAllModels;

/**
 * 获取所有支持的 templateId 列表
 *
 * @returns {string[]}
 */
const getSupportedTemplateIds = registry.getSupportedTemplateIds;

/**
 * 检查 templateId 是否有对应的模型映射
 *
 * @param {string} templateId
 * @returns {boolean}
 */
const isTemplateSupported = registry.isTemplateSupported;

/**
 * 获取模型定价信息
 *
 * @param {string} modelId — 模型 ID
 * @returns {{ pointsPerUnit: number, unit: string }|null}
 */
const getModelPricing = registry.getModelPricing;

/**
 * 获取模型的 API 调用名称（DashScope API 实际使用的模型名）
 *
 * @param {string} modelId — 内部模型 ID
 * @returns {string|null} API 模型名称
 */
const getApiModelName = registry.getApiModelName;

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
