/**
 * Registry Service — AI Model Registry API 服务层
 *
 * Phase 2-C-2-1: AI Model Registry API 端点
 *
 * 职责：
 *   1. 从 config/ai-model-registry.js 读取数据
 *   2. 将内部数据结构转换为 API 响应格式
 *   3. 不包含任何硬编码的模型名 / templateId
 */

const registry = require('../config/ai-model-registry');

/**
 * 获取所有 templates，每个 template 包含完整的关联 model 信息
 *
 * API 响应格式：
 *   {
 *     templateId: string,
 *     name: string,
 *     capability: string,
 *     defaultModelId: string,
 *     model: { ... }   // 完整 model 配置
 *   }
 *
 * @returns {Object[]}
 */
function getAllTemplates() {
  return registry.templates.map(template => {
    const model = registry.getModelConfig(template.modelId);
    return {
      templateId: template.id,
      name: template.name,
      description: template.description,
      icon: template.icon,
      sort: template.sort,
      capability: model ? model.capability : null,
      defaultModelId: template.modelId,
      model: model || null,
    };
  });
}

/**
 * 根据 capability 获取模型列表
 *
 * @param {string} [capability] — 能力类型，可选；不传返回全部模型
 * @returns {Object[]}
 */
function getModels(capability) {
  if (capability) {
    return registry.getModelsByCapability(capability);
  }
  return registry.getAllModels();
}

/**
 * 获取所有 capability 列表，含基本信息
 *
 * API 响应格式：
 *   {
 *     capability: string,
 *     label: string,      // 中文标签
 *     modelCount: number   // 该 capability 下的模型数量
 *   }
 *
 * @returns {Object[]}
 */
function getAllCapabilities() {
  const capabilities = registry.getAllCapabilities();

  // capability 中文标签映射（基于 CAPABILITY 枚举值）
  const CAPABILITY_LABELS = {
    text_to_video: '文生视频',
    image_to_video: '图生视频',
    reference_to_video: '参考生视频',
    image_generation: '图片生成',
    image_edit: '图片编辑',
    digital_human: '数字人',
  };

  return capabilities.map(cap => ({
    capability: cap,
    label: CAPABILITY_LABELS[cap] || cap,
    modelCount: (registry.capabilityMap[cap] || []).length,
  }));
}

module.exports = {
  getAllTemplates,
  getModels,
  getAllCapabilities,
};
