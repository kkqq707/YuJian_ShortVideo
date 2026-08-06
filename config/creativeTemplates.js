/**
 * Creative Template Configuration
 * Sprint 4.4 Patch3: AI Creative Template System
 *
 * 用户选择创作类型 → 系统自动匹配阿里云百炼模型
 *
 * 所有模板统一使用阿里云百炼 DashScope 模型市场中的模型。
 * 禁止第三方模型：即梦、可灵、Runway、Pika 等。
 *
 * ─── capability 分类 ───────────────────────────
 *   image_generation  — 图片生成
 *   image_edit        — 图片编辑
 *   image_to_video    — 图片生成视频
 *   text_to_video     — 文字生成视频
 *
 * ⚠️  @deprecated  Phase 2-C-1-E-2: 本文件已迁移为兼容层。
 *    请改用 config/ai-model-registry.js 作为唯一数据源。
 *    所有导出均委托给 registry，保持旧 API 签名兼容。
 */

const registry = require('./ai-model-registry');

// ═══════════════════════════════════════════════════════════════════════
//  CREATIVE_TEMPLATES — 向后兼容旧格式
//
//  旧格式将 template 与 model 字段合并到一个对象中。
//  现在通过 template.modelId → models[modelId] 动态生成。
// ═══════════════════════════════════════════════════════════════════════

/**
 * 将 registry template + model 合并为旧版 CREATIVE_TEMPLATES 格式
 *
 * @param {Object} template — registry template 条目
 * @param {Object} model    — registry model 条目
 * @returns {Object} 旧格式模板对象
 */
function buildLegacyTemplate(template, model) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    capability: model.capability,
    provider: model.provider,
    model: model.apiModelName,         // 旧字段名：model = API 模型名
    category: model.category,
    categoryLabel: model.categoryLabel,
    icon: template.icon,
    outputType: model.outputType,
    sort: template.sort,
  };
}

/**
 * @deprecated 请使用 registry.templates + registry.models
 */
const CREATIVE_TEMPLATES = Object.freeze(
  registry.templates.map(t => {
    const model = registry.models[t.modelId];
    return buildLegacyTemplate(t, model);
  })
);

// ─── 工具函数（全部委托给 registry）─────────────────────────────────

/**
 * 根据模板 ID 查找模板配置
 * @param {string} templateId
 * @returns {object|undefined}
 */
function getTemplateById(templateId) {
  const template = registry.getTemplate(templateId);
  if (!template) return undefined;
  const model = registry.models[template.modelId];
  return buildLegacyTemplate(template, model);
}

/**
 * 根据 capability 查找模板（返回第一个匹配项，保持旧行为）
 * @param {string} capability - image_generation | image_edit | image_to_video | text_to_video
 * @returns {object|undefined}
 */
function getTemplateByCapability(capability) {
  if (!capability || typeof capability !== 'string') {
    return undefined;
  }
  // 旧行为：返回第一个匹配的 template（非数组）
  const template = registry.templates.find(t => {
    const model = registry.models[t.modelId];
    return model && model.capability === capability;
  });
  if (!template) return undefined;
  const model = registry.models[template.modelId];
  return buildLegacyTemplate(template, model);
}

/**
 * 按分类获取模板列表
 * @param {string} [category] - 'image' | 'video'，不传则返回全部
 * @returns {object[]}
 */
function getTemplatesByCategory(category) {
  const templates = registry.getTemplatesByCategory(category);
  return templates.map(t => {
    const model = registry.models[t.modelId];
    return buildLegacyTemplate(t, model);
  });
}

/**
 * 根据输出类型获取模板列表
 * @param {string} outputType - 'image' | 'video'
 * @returns {object[]}
 */
function getTemplatesByOutput(outputType) {
  const templates = registry.getTemplatesByOutput(outputType);
  return templates.map(t => {
    const model = registry.models[t.modelId];
    return buildLegacyTemplate(t, model);
  });
}

/**
 * 验证 provider 是否为阿里云
 * @param {string} provider
 * @returns {boolean}
 */
const isAliyunProvider = registry.isAliyunProvider;

/**
 * 获取所有支持的 capability 列表
 * @returns {string[]}
 */
const getAllCapabilities = registry.getAllCapabilities;

module.exports = {
  CREATIVE_TEMPLATES,
  getTemplateById,
  getTemplateByCapability,
  getTemplatesByCategory,
  getTemplatesByOutput,
  isAliyunProvider,
  getAllCapabilities
};
