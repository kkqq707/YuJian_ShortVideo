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
 */

const CREATIVE_TEMPLATES = [
  // ═══════════════════════════════════════════════════════════
  //  图片类
  // ═══════════════════════════════════════════════════════════

  {
    id: 'image_generation',
    name: '商业图片生成',
    description: '通过文字描述生成高质量商业图片，适合产品展示、营销素材',
    capability: 'image_generation',
    provider: 'aliyun',
    model: 'qwen-image-3.0-pro',
    category: 'image',
    categoryLabel: '图片生成',
    icon: '🎨',
    outputType: 'image',
    sort: 1
  },

  {
    id: 'image_edit',
    name: '图片智能编辑',
    description: '对现有图片进行智能编辑、优化和风格转换',
    capability: 'image_edit',
    provider: 'aliyun',
    model: 'qwen-image-edit',
    category: 'image',
    categoryLabel: '图片编辑',
    icon: '✏️',
    outputType: 'image',
    sort: 2
  },

  // ═══════════════════════════════════════════════════════════
  //  视频类
  // ═══════════════════════════════════════════════════════════

  {
    id: 'image_to_video',
    name: '图片动态化',
    description: '将静态图片转换为动态视频，赋予画面生命力',
    capability: 'image_to_video',
    provider: 'aliyun',
    model: 'happyhorse-i2v',
    category: 'video',
    categoryLabel: '视频生成',
    icon: '🎬',
    outputType: 'video',
    sort: 3
  },

  {
    id: 'text_to_video',
    name: '宣传视频生成',
    description: '通过文字描述直接生成宣传视频，零素材创作',
    capability: 'text_to_video',
    provider: 'aliyun',
    model: 'happyhorse-t2v',
    category: 'video',
    categoryLabel: '视频生成',
    icon: '📽️',
    outputType: 'video',
    sort: 4
  }
];

// ─── 工具函数 ────────────────────────────────────────────────

/**
 * 根据模板 ID 查找模板配置
 * @param {string} templateId
 * @returns {object|undefined}
 */
function getTemplateById(templateId) {
  return CREATIVE_TEMPLATES.find(t => t.id === templateId);
}

/**
 * 根据 capability 查找模板
 * @param {string} capability - image_generation | image_edit | image_to_video | text_to_video
 * @returns {object|undefined}
 */
function getTemplateByCapability(capability) {
  return CREATIVE_TEMPLATES.find(t => t.capability === capability);
}

/**
 * 按分类获取模板列表
 * @param {string} [category] - 'image' | 'video'，不传则返回全部
 * @returns {object[]}
 */
function getTemplatesByCategory(category) {
  if (!category) return [...CREATIVE_TEMPLATES];
  return CREATIVE_TEMPLATES.filter(t => t.category === category);
}

/**
 * 根据输出类型获取模板列表
 * @param {string} outputType - 'image' | 'video'
 * @returns {object[]}
 */
function getTemplatesByOutput(outputType) {
  if (!outputType) return [...CREATIVE_TEMPLATES];
  return CREATIVE_TEMPLATES.filter(t => t.outputType === outputType);
}

/**
 * 验证 provider 是否为阿里云
 * @param {string} provider
 * @returns {boolean}
 */
function isAliyunProvider(provider) {
  return provider === 'aliyun';
}

/**
 * 获取所有支持的 capability 列表
 * @returns {string[]}
 */
function getAllCapabilities() {
  return CREATIVE_TEMPLATES.map(t => t.capability);
}

module.exports = {
  CREATIVE_TEMPLATES,
  getTemplateById,
  getTemplateByCapability,
  getTemplatesByCategory,
  getTemplatesByOutput,
  isAliyunProvider,
  getAllCapabilities
};
