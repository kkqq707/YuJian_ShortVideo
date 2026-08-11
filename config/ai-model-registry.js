/**
 * AI Model Registry — 统一 AI 模型注册中心
 *
 * Phase 2-C-1-E-1: 创建统一注册中心
 *
 * 设计原则：
 *   1. 单一数据源 (Single Source of Truth) — 所有模型定义、template 映射、capability 集中在此
 *   2. 不可变核心数据 — models / templates / capabilityMap 为静态定义
 *   3. provider 可插拔 — provider 配置与模型定义分离，注册中心内置校验
 *   4. DashScope 唯一性 — 所有模型必须来自阿里云 DashScope
 *
 * 模型清单：
 *   ┌──────────────────────────────┬──────────────────────┬──────────┐
 *   │ modelId                      │ capability            │ output   │
 *   ├──────────────────────────────┼──────────────────────┼──────────┤
 *   │ wan2.1-t2v                   │ text_to_video         │ video    │
 *   │ wan2.1-i2v                   │ image_to_video        │ video    │
 *   │ wan2.7-i2v                   │ image_to_video        │ video    │
 *   │ wan2.1-ref2video             │ reference_to_video    │ video    │
 *   │ qwen-image                   │ image_generation      │ image    │
 *   │ qwen-image-backup            │ image_generation      │ image    │
 *   │ qwen-image-2.0-pro           │ image_generation      │ image    │
 *   │ qwen-image-2.0               │ image_generation      │ image    │
 *   │ wan2.7-image-pro             │ image_generation      │ image    │
 *   │ wan2.7-image                 │ image_generation      │ image    │
 *   │ qwen-image-edit              │ image_edit            │ image    │
 *   │ wanx-digital-human           │ digital_human         │ video    │
 *   └──────────────────────────────┴──────────────────────┴──────────┘
 *
 * 使用方式：
 *   const registry = require('./config/ai-model-registry');
 *   const config = registry.getModelConfig('wan2.1-t2v');
 */

// ═══════════════════════════════════════════════════════════════════════
//  0. Capability 枚举
// ═══════════════════════════════════════════════════════════════════════

const CAPABILITY = {
  // 视频类
  TEXT_TO_VIDEO:      'text_to_video',
  IMAGE_TO_VIDEO:     'image_to_video',
  REFERENCE_TO_VIDEO: 'reference_to_video',

  // 图片类
  IMAGE_GENERATION:   'image_generation',
  IMAGE_EDIT:         'image_edit',

  // 数字人类
  DIGITAL_HUMAN:      'digital_human',
};

// ═══════════════════════════════════════════════════════════════════════
//  1. 模型定义 (models)
//     — 所有 AI 模型的完整元数据
//     — key: 内部 modelId (kebab-case)
//     — 新增模型只需在此对象新增条目
// ═══════════════════════════════════════════════════════════════════════

const models = {
  // ── Wan2.1 系列 ─────────────────────────────────────────────────

  'wan2.1-t2v': {
    id: 'wan2.1-t2v',
    name: 'Wan2.1 文生视频',
    displayName: 'happyhorse-1.1-t2v',
    family: 'wan2.1',
    provider: 'aliyun',
    capability: CAPABILITY.TEXT_TO_VIDEO,
    outputType: 'video',
    apiModelName: 'happyhorse-1.1-t2v',

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
    requireImage: false,

    // 定价
    pricing: { pointsPerUnit: 12, unit: 'second' },

    // API 端点
    apiPath: '/api/v1/services/aigc/video-generation/video-synthesis',
  },

  'wan2.1-i2v': {
    id: 'wan2.1-i2v',
    name: 'Wan2.1 图生视频',
    displayName: 'happyhorse-1.1-i2v',
    family: 'wan2.1',
    provider: 'aliyun',
    capability: CAPABILITY.IMAGE_TO_VIDEO,
    outputType: 'video',
    apiModelName: 'happyhorse-1.1-i2v',

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
    minImages: 1,
    maxImages: 1,

    // 定价
    pricing: { pointsPerUnit: 12, unit: 'second' },

    // API 端点
    apiPath: '/api/v1/services/aigc/video-generation/video-synthesis',
  },

  // ── Wan2.7 系列 ─────────────────────────────────────────────────

  'wan2.7-i2v': {
    id: 'wan2.7-i2v',
    name: 'Wan2.7 图生视频',
    displayName: 'wan2.7-i2v',
    family: 'wan2.7',
    provider: 'aliyun',
    capability: CAPABILITY.IMAGE_TO_VIDEO,
    outputType: 'video',
    apiModelName: 'wan2.7-i2v',

    description: 'Wan2.7 图生视频模型，更高画质与动态表现，将静态图片转换为高质量动态视频',
    category: 'video',
    categoryLabel: '视频生成',
    icon: '🎬',
    sort: 2.5,

    // 参数约束（沿用 wan2.1-i2v 兼容配置）
    maxPromptLength: 2000,
    defaultDuration: 5,
    maxDuration: 30,
    supportedSizes: ['720P', '480P'],
    defaultSize: '720P',
    requireImage: true,
    minImages: 1,
    maxImages: 1,

    // 定价（沿用 wan2.1-i2v 配置）
    pricing: { pointsPerUnit: 12, unit: 'second' },

    // API 端点
    apiPath: '/api/v1/services/aigc/video-generation/video-synthesis',
  },

  'wan2.7-t2v': {
    id: 'wan2.7-t2v',
    name: 'Wan2.7 文生视频',
    displayName: 'wan2.7-t2v',
    family: 'wan2.7',
    provider: 'aliyun',
    capability: CAPABILITY.TEXT_TO_VIDEO,
    outputType: 'video',
    apiModelName: 'wan2.7-t2v',

    description: 'Wan2.7 文生视频模型（基础版），快速出片，适合日常创意视频',
    category: 'video',
    categoryLabel: '视频生成',
    icon: '📽️',
    sort: 4.5,

    // 参数约束
    maxPromptLength: 2000,
    defaultDuration: 5,
    maxDuration: 30,
    supportedSizes: ['1080p', '720p'],
    defaultSize: '1080p',
    requireImage: false,

    // 定价
    pricing: { pointsPerUnit: 8, unit: 'second' },

    // API 端点
    apiPath: '/api/v1/services/aigc/video-generation/video-synthesis',
  },

  'wan2.1-ref2video': {
    id: 'wan2.1-ref2video',
    name: 'Wan2.1 参考生视频',
    displayName: 'happyhorse-1.1-r2v',
    family: 'wan2.1',
    provider: 'aliyun',
    capability: CAPABILITY.REFERENCE_TO_VIDEO,
    outputType: 'video',
    apiModelName: 'happyhorse-1.1-r2v',

    description: '通过多张参考图融合生成视频，保持多图特征一致性',
    category: 'video',
    categoryLabel: '视频生成',
    icon: '🖼️',
    sort: 5,

    // 参数约束
    maxPromptLength: 2000,
    defaultDuration: 5,
    maxDuration: 30,
    supportedSizes: ['720P', '480P'],
    defaultSize: '720P',
    requireImage: true,
    minImages: 2,
    maxImages: 5,

    // 定价
    pricing: { pointsPerUnit: 12, unit: 'second' },

    // API 端点
    apiPath: '/api/v1/services/aigc/video-generation/video-synthesis',
  },

  'wan2.7-r2v': {
    id: 'wan2.7-r2v',
    name: 'Wan2.7 参考生视频',
    displayName: 'wan2.7-r2v',
    family: 'wan2.7',
    provider: 'aliyun',
    capability: CAPABILITY.REFERENCE_TO_VIDEO,
    outputType: 'video',
    apiModelName: 'wan2.7-r2v',

    description: 'Wan2.7 参考生视频模型（基础版），多图参考快速生成视频',
    category: 'video',
    categoryLabel: '视频生成',
    icon: '🖼️',
    sort: 5.5,

    // 参数约束
    maxPromptLength: 2000,
    defaultDuration: 5,
    maxDuration: 30,
    supportedSizes: ['720P', '480P'],
    defaultSize: '720P',
    requireImage: true,
    minImages: 2,
    maxImages: 5,

    // 定价
    pricing: { pointsPerUnit: 8, unit: 'second' },

    // API 端点
    apiPath: '/api/v1/services/aigc/video-generation/video-synthesis',
  },

  // ── Qwen-Image 系列 ──────────────────────────────────────────────

  'qwen-image': {
    id: 'qwen-image',
    name: 'Qwen-Image 商业图片生成',
    displayName: 'qwen-image-3.0-pro',
    family: 'qwen-image',
    provider: 'aliyun',
    capability: CAPABILITY.IMAGE_GENERATION,
    outputType: 'image',
    apiModelName: 'qwen-image-3.0-pro',

    description: '通过文字描述生成高质量商业图片，适合产品展示、营销素材',
    category: 'image',
    categoryLabel: '图片生成',
    icon: '🎨',
    sort: 1.2,

    // 参数约束
    maxPromptLength: 2000,
    supportedSizes: ['1024*1024', '1024*768', '768*1024', '1024*576'],
    defaultSize: '1024*1024',
    maxBatchSize: 4,

    // 定价
    pricing: { pointsPerUnit: 1, unit: 'image' },

    // API 端点
    apiPath: '/api/v1/services/aigc/multimodal-generation/generation',
  },

  // Phase UI-AICreation-02-B-1-G-U: qwen-image-3.0-pro 不再是默认模型，默认改为 qwen-image-2.0-pro
  // qwen-image-3.0-pro 主模型在限流(429)时切到此模型继续生成
  'qwen-image-backup': {
    id: 'qwen-image-backup',
    name: 'Qwen-Image Plus 备用图片生成',
    displayName: 'qwen-image-plus',
    family: 'qwen-image',
    provider: 'aliyun',
    capability: CAPABILITY.IMAGE_GENERATION,
    outputType: 'image',
    apiModelName: 'qwen-image-plus',

    description: '备用文生图模型，当主模型(qwen-image-3.0-pro)限流时使用，适合产品展示、营销素材',
    category: 'image',
    categoryLabel: '图片生成',
    icon: '🖼️',
    sort: 1.5,

    // 参数约束
    maxPromptLength: 2000,
    supportedSizes: ['1024*1024', '1024*768', '768*1024', '1024*576'],
    defaultSize: '1024*1024',
    maxBatchSize: 4,

    // 定价
    pricing: { pointsPerUnit: 1, unit: 'image' },

    // API 端点（与 qwen-image 相同，使用 multimodal-generation）
    apiPath: '/api/v1/services/aigc/multimodal-generation/generation',
  },

  // ── Qwen-Image 2.0 系列（Phase UI-AICreation-02-B-1-G-S）───────────

  'qwen-image-2.0-pro': {
    id: 'qwen-image-2.0-pro',
    name: 'Qwen-Image 2.0 Pro 图片生成',
    displayName: 'qwen-image-2.0-pro',
    family: 'qwen-image',
    provider: 'aliyun',
    capability: CAPABILITY.IMAGE_GENERATION,
    outputType: 'image',
    apiModelName: 'qwen-image-2.0-pro',

    description: 'Qwen-Image 第二代专业版，更高画质与细节表现，适合商业级图像创作',
    category: 'image',
    categoryLabel: '图片生成',
    icon: '🖼️',
    sort: 1,

    // 参数约束
    maxPromptLength: 2000,
    supportedSizes: ['1024*1024', '1280*720', '720*1280', '1280*960'],
    defaultSize: '1024*1024',
    maxBatchSize: 4,

    // 定价
    pricing: { pointsPerUnit: 2, unit: 'image' },

    // API 端点（multimodal-generation，qwen-image 前缀自动路由）
    apiPath: '/api/v1/services/aigc/multimodal-generation/generation',
  },

  'qwen-image-2.0': {
    id: 'qwen-image-2.0',
    name: 'Qwen-Image 2.0 图片生成',
    displayName: 'qwen-image-2.0',
    family: 'qwen-image',
    provider: 'aliyun',
    capability: CAPABILITY.IMAGE_GENERATION,
    outputType: 'image',
    apiModelName: 'qwen-image-2.0',

    description: 'Qwen-Image 第二代标准版，兼顾质量与速度',
    category: 'image',
    categoryLabel: '图片生成',
    icon: '🖼️',
    sort: 1.3,

    // 参数约束
    maxPromptLength: 2000,
    supportedSizes: ['1024*1024', '1280*720', '720*1280', '1280*960'],
    defaultSize: '1024*1024',
    maxBatchSize: 4,

    // 定价
    pricing: { pointsPerUnit: 1, unit: 'image' },

    // API 端点（multimodal-generation，qwen-image 前缀自动路由）
    apiPath: '/api/v1/services/aigc/multimodal-generation/generation',
  },

  // ── Wan2.7 Image 系列（Phase UI-AICreation-02-B-1-G-S）───────────────

  'wan2.7-image-pro': {
    id: 'wan2.7-image-pro',
    name: 'Wan2.7 Image Pro 图片生成',
    displayName: 'wan2.7-image-pro',
    family: 'wan2.7',
    provider: 'aliyun',
    capability: CAPABILITY.IMAGE_GENERATION,
    outputType: 'image',
    apiModelName: 'wan2.7-image-pro',

    description: 'Wan2.7 专业版文生图，高质感画面输出，适合海报、宣传素材',
    category: 'image',
    categoryLabel: '图片生成',
    icon: '🎨',
    sort: 1.6,

    // 参数约束
    maxPromptLength: 2000,
    supportedSizes: ['1024*1024', '1280*720', '720*1280', '1280*960'],
    defaultSize: '1024*1024',
    maxBatchSize: 4,

    // 定价
    pricing: { pointsPerUnit: 2, unit: 'image' },

    // API 端点（text2image/image-synthesis）
    apiPath: '/api/v1/services/aigc/text2image/image-synthesis',
  },

  'wan2.7-image': {
    id: 'wan2.7-image',
    name: 'Wan2.7 Image 图片生成',
    displayName: 'wan2.7-image',
    family: 'wan2.7',
    provider: 'aliyun',
    capability: CAPABILITY.IMAGE_GENERATION,
    outputType: 'image',
    apiModelName: 'wan2.7-image',

    description: 'Wan2.7 标准版文生图，快速出图，适合日常创意素材',
    category: 'image',
    categoryLabel: '图片生成',
    icon: '🎨',
    sort: 1.7,

    // 参数约束
    maxPromptLength: 2000,
    supportedSizes: ['1024*1024', '1280*720', '720*1280', '1280*960'],
    defaultSize: '1024*1024',
    maxBatchSize: 4,

    // 定价
    pricing: { pointsPerUnit: 1, unit: 'image' },

    // API 端点（text2image/image-synthesis）
    apiPath: '/api/v1/services/aigc/text2image/image-synthesis',
  },

  'qwen-image-edit': {
    id: 'qwen-image-edit',
    name: 'Qwen-Image 图片智能编辑',
    displayName: 'qwen-image-edit',
    family: 'qwen-image',
    provider: 'aliyun',
    capability: CAPABILITY.IMAGE_EDIT,
    outputType: 'image',
    apiModelName: 'qwen-image-edit',

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

    // 定价
    pricing: { pointsPerUnit: 1, unit: 'image' },

    // API 端点
    apiPath: '/api/v1/services/aigc/text2image/image-synthesis',
  },

  // ── 数字人系列 ───────────────────────────────────────────────────

  'wanx-digital-human': {
    id: 'wanx-digital-human',
    name: '万相数字人',
    displayName: 'wanx-digital-human',
    family: 'wanx',
    provider: 'aliyun',
    capability: CAPABILITY.DIGITAL_HUMAN,
    outputType: 'video',
    apiModelName: 'wanx-digital-human',

    description: '基于真人形象生成数字人口播视频，支持自定义文案和声音',
    category: 'digital_human',
    categoryLabel: '数字人',
    icon: '🎙️',
    sort: 6,

    // 参数约束
    maxPromptLength: 2000,
    requireImage: true,
    supportedSizes: ['1080P', '720P'],
    defaultSize: '1080P',
    defaultDuration: 30,
    maxDuration: 120,

    // 数字人额外参数
    supportedVoices: ['zhiyan_emo', 'zhiyan_cute', 'zhiyan_pro'],
    defaultVoice: 'zhiyan_emo',

    // 定价
    pricing: { pointsPerUnit: 4, unit: 'second' },

    // API 端点
    apiPath: '/api/v1/services/aigc/video-generation/digital-human',
  },
};

// ═══════════════════════════════════════════════════════════════════════
//  2. 能力映射 (capabilityMap)
//     — capability → modelId[] 的反向索引
//     — 运行时自动从 models 生成，无需手动维护
// ═══════════════════════════════════════════════════════════════════════

/**
 * 从 models 自动生成 capability → modelId[] 反向索引
 * 无需手动维护，新增模型后自动映射
 */
function buildCapabilityMap() {
  const map = {};
  for (const [modelId, config] of Object.entries(models)) {
    if (!map[config.capability]) {
      map[config.capability] = [];
    }
    map[config.capability].push(modelId);
  }
  return Object.freeze(map);
}

const capabilityMap = buildCapabilityMap();
// 生成结果:
// {
//   text_to_video:        ['wan2.1-t2v'],
//   image_to_video:       ['wan2.1-i2v', 'wan2.7-i2v'],
//   reference_to_video:   ['wan2.1-ref2video'],
//   image_generation:     ['qwen-image', 'qwen-image-backup', 'qwen-image-2.0-pro', 'qwen-image-2.0', 'wan2.7-image-pro', 'wan2.7-image'],
//   image_edit:           ['qwen-image-edit'],
//   digital_human:        ['wanx-digital-human'],
// }

// ═══════════════════════════════════════════════════════════════════════
//  3. 创作模板 (templates)
//     — 面向用户的创作类型
//     — 每个 template 明确引用 models 中的一个 modelId
//     — 通过 registry.getTemplateModelConfig(templateId) 获取完整模型配置
// ═══════════════════════════════════════════════════════════════════════

const templates = [
  {
    id: 'image_generation',
    modelId: 'qwen-image-2.0-pro',
    name: '商业图片生成',
    description: '通过文字描述生成高质量商业图片，适合产品展示、营销素材',
    icon: '🎨',
    sort: 1,
  },
  {
    id: 'image_edit',
    modelId: 'qwen-image-edit',
    name: '图片智能编辑',
    description: '对现有图片进行智能编辑、优化和风格转换',
    icon: '✏️',
    sort: 2,
  },
  {
    id: 'image_to_video_wan27',
    modelId: 'wan2.7-i2v',
    name: 'Wan2.7 图片动态化',
    description: 'Wan2.7图生视频模型，更高画质与动态表现，将静态图片转换为高质量动态视频',
    icon: '🎬',
    sort: 2.8,
  },
  {
    id: 'image_to_video',
    modelId: 'wan2.1-i2v',
    name: '图片动态化',
    description: '将静态图片转换为动态视频，赋予画面生命力',
    icon: '🎬',
    sort: 3,
  },
  {
    id: 'text_to_video',
    modelId: 'wan2.1-t2v',
    name: '宣传视频生成',
    description: '通过文字描述直接生成宣传视频，零素材创作',
    icon: '📽️',
    sort: 4,
  },
  {
    id: 'text_to_video_wan27',
    modelId: 'wan2.7-t2v',
    name: 'Wan2.7 文生视频',
    description: 'Wan2.7 文生视频模型（基础版），快速出片',
    icon: '📽️',
    sort: 4.5,
  },
  {
    id: 'ref_to_video',
    modelId: 'wan2.1-ref2video',
    name: '参考生视频',
    description: '通过多张参考图融合生成视频，保持多图特征一致性',
    icon: '🖼️',
    sort: 5,
  },
  {
    id: 'ref_to_video_wan27',
    modelId: 'wan2.7-r2v',
    name: 'Wan2.7 参考生视频',
    description: 'Wan2.7 参考生视频模型（基础版），多图参考快速生成',
    icon: '🖼️',
    sort: 5.5,
  },
  {
    id: 'digital_human',
    modelId: 'wanx-digital-human',
    name: '数字人口播',
    description: '基于真人形象生成数字人口播视频，支持自定义文案和声音',
    icon: '🎙️',
    sort: 6,
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  4. Provider 校验
// ═══════════════════════════════════════════════════════════════════════

const PROVIDER_VALIDATION = {
  // 唯一允许的 Provider
  ALLOWED_PROVIDER: 'aliyun',

  // 校验级别
  //   'strict'  — 不匹配则抛出错误（生产环境默认）
  //   'warn'    — 不匹配则 console.warn（开发环境默认）
  level: (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV)
    ? 'warn'
    : 'strict',
};

/**
 * 模块加载时自动执行 — 遍历所有 models，校验 provider
 */
function validateAllModels() {
  const invalidModels = [];

  for (const [modelId, config] of Object.entries(models)) {
    // 校验 1: provider 必须为 'aliyun'
    if (config.provider !== PROVIDER_VALIDATION.ALLOWED_PROVIDER) {
      invalidModels.push({
        modelId,
        provider: config.provider,
        reason: `Provider "${config.provider}" is not allowed. Only "aliyun" DashScope models are permitted.`
      });
      continue;
    }

    // 校验 2: 必须有 apiModelName
    if (!config.apiModelName || typeof config.apiModelName !== 'string') {
      invalidModels.push({
        modelId,
        reason: 'Missing or invalid apiModelName'
      });
    }

    // 校验 3: apiModelName 不能为空字符串
    if (config.apiModelName && config.apiModelName.trim() === '') {
      invalidModels.push({
        modelId,
        reason: 'apiModelName cannot be empty'
      });
    }
  }

  if (invalidModels.length > 0) {
    const message = '[ModelRegistry] Provider validation FAILED:\n' +
      invalidModels.map(m => `  - ${m.modelId}: ${m.reason}`).join('\n');

    if (PROVIDER_VALIDATION.level === 'strict') {
      throw new Error(message);
    } else {
      console.warn(message);
    }
  }
}

// 模块加载时立即执行校验
validateAllModels();

// ═══════════════════════════════════════════════════════════════════════
//  5. 模型查询函数
// ═══════════════════════════════════════════════════════════════════════

/**
 * 根据模型 ID 获取完整配置
 *
 * @param {string} modelId — 模型 ID（如 'wan2.1-t2v', 'qwen-image'）
 * @returns {Object|null} 模型配置对象（浅拷贝），未找到返回 null
 */
function getModelConfig(modelId) {
  if (!modelId || typeof modelId !== 'string') {
    return null;
  }
  const config = models[modelId];
  return config ? { ...config } : null;
}

/**
 * 根据 capability 查找匹配的模型列表
 *
 * @param {string} capability — 能力类型（如 'text_to_video'）
 * @returns {Object[]} 匹配的模型配置数组（浅拷贝）
 */
function getModelsByCapability(capability) {
  if (!capability) return [];
  const ids = capabilityMap[capability] || [];
  return ids.map(id => ({ ...models[id] }));
}

/**
 * 根据 outputType 查找匹配的模型列表
 *
 * @param {string} outputType — 输出类型（'image' | 'video'）
 * @returns {Object[]} 匹配的模型配置数组（浅拷贝）
 */
function getModelsByOutputType(outputType) {
  if (!outputType) return [];
  return Object.values(models)
    .filter(m => m.outputType === outputType)
    .map(m => ({ ...m }));
}

/**
 * 根据模型家族查找
 *
 * @param {string} family — 模型家族（'wan2.1' | 'qwen-image' | 'wanx'）
 * @returns {Object[]} 匹配的模型配置数组（浅拷贝）
 */
function getModelsByFamily(family) {
  if (!family) return [];
  return Object.values(models)
    .filter(m => m.family === family)
    .map(m => ({ ...m }));
}

/**
 * 获取所有已注册的模型 ID 列表
 *
 * @returns {string[]}
 */
function getAllModelIds() {
  return Object.keys(models);
}

/**
 * 获取所有已注册的模型配置（浅拷贝数组）
 *
 * @returns {Object[]}
 */
function getAllModels() {
  return Object.values(models).map(m => ({ ...m }));
}

// ═══════════════════════════════════════════════════════════════════════
//  6. 模板查询函数
// ═══════════════════════════════════════════════════════════════════════

/**
 * 根据模板 ID 查找模板配置
 *
 * @param {string} templateId — 模板 ID（如 'image_to_video'）
 * @returns {Object|undefined} 模板配置对象（浅拷贝）
 */
function getTemplate(templateId) {
  if (!templateId || typeof templateId !== 'string') {
    return undefined;
  }
  const template = templates.find(t => t.id === templateId);
  return template ? { ...template } : undefined;
}

// 别名：向后兼容 creativeTemplates.js 的 getTemplateById
const getTemplateById = getTemplate;

/**
 * 根据 templateId 获取关联的模型配置（快捷方法）
 *
 * @param {string} templateId — 模板 ID
 * @returns {Object|null} 模型配置对象（浅拷贝），未找到返回 null
 */
function getTemplateModelConfig(templateId) {
  const template = getTemplate(templateId);
  if (!template) return null;
  return getModelConfig(template.modelId);
}

/**
 * 根据 capability 查找匹配的模板列表
 *
 * @param {string} capability — 能力类型
 * @returns {Object[]} 匹配的模板配置数组（浅拷贝）
 */
function getTemplatesByCapability(capability) {
  if (!capability) return [];
  // 找到该 capability 对应的 modelId 列表
  const modelIds = capabilityMap[capability] || [];
  return templates
    .filter(t => modelIds.includes(t.modelId))
    .map(t => ({ ...t }));
}

/**
 * 按分类获取模板列表
 * 通过关联的 model.category 判断模板分类
 *
 * @param {string} [category] — 'image' | 'video' | 'digital_human'，不传则返回全部
 * @returns {Object[]} 匹配的模板配置数组（浅拷贝）
 */
function getTemplatesByCategory(category) {
  if (!category) return templates.map(t => ({ ...t }));
  return templates
    .filter(t => {
      const model = models[t.modelId];
      return model && model.category === category;
    })
    .map(t => ({ ...t }));
}

/**
 * 根据输出类型获取模板列表
 * 通过关联的 model.outputType 判断
 *
 * @param {string} outputType — 'image' | 'video'
 * @returns {Object[]} 匹配的模板配置数组（浅拷贝）
 */
function getTemplatesByOutput(outputType) {
  if (!outputType) return templates.map(t => ({ ...t }));
  return templates
    .filter(t => {
      const model = models[t.modelId];
      return model && model.outputType === outputType;
    })
    .map(t => ({ ...t }));
}

/**
 * 获取所有模板 ID 列表
 *
 * @returns {string[]}
 */
function getAllTemplateIds() {
  return templates.map(t => t.id);
}

// ═══════════════════════════════════════════════════════════════════════
//  7. 模型名解析（向后兼容）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 根据 templateId 解析对应的模型配置
 *
 * 解析链：templateId → template.modelId → models[modelId]
 *
 * @param {string} templateId — 创作模板 ID（如 'image_to_video'）
 * @returns {Object|null} 模型配置对象（浅拷贝），未找到返回 null
 */
function resolveTemplate(templateId) {
  return getTemplateModelConfig(templateId);
}

// 别名：向后兼容 ai-models.js 的 resolveModelForTemplate
const resolveModelForTemplate = resolveTemplate;

/**
 * 获取模型的 API 调用名称（DashScope API 实际使用的模型名）
 *
 * @param {string} modelId — 内部模型 ID
 * @returns {string|null} API 模型名称
 */
function getApiModelName(modelId) {
  const config = models[modelId];
  return config ? config.apiModelName : null;
}

/**
 * 获取模型定价信息
 *
 * @param {string} modelId — 模型 ID
 * @returns {{ pointsPerUnit: number, unit: string }|null}
 */
function getModelPricing(modelId) {
  const config = models[modelId];
  return config ? { ...config.pricing } : null;
}

// ═══════════════════════════════════════════════════════════════════════
//  8. 兼容层映射
// ═══════════════════════════════════════════════════════════════════════

/**
 * templateId → modelId 映射表
 * 向后兼容 ai-models.js 的 TEMPLATE_MODEL_MAP
 */
const templateModelMap = Object.freeze(
  templates.reduce((map, t) => {
    map[t.id] = t.modelId;
    return map;
  }, {})
);

/**
 * 检查 templateId 是否支持
 *
 * @param {string} templateId
 * @returns {boolean}
 */
function isTemplateSupported(templateId) {
  return templates.some(t => t.id === templateId);
}

/**
 * 获取所有支持的 templateId 列表
 *
 * @returns {string[]}
 */
function getSupportedTemplateIds() {
  return templates.map(t => t.id);
}

/**
 * 验证 provider 是否为阿里云
 *
 * @param {string} provider
 * @returns {boolean}
 */
function isAliyunProvider(provider) {
  return provider === PROVIDER_VALIDATION.ALLOWED_PROVIDER;
}

/**
 * 获取所有支持的 capability 列表
 *
 * @returns {string[]}
 */
function getAllCapabilities() {
  return Object.keys(capabilityMap);
}

// ═══════════════════════════════════════════════════════════════════════
//  9. Provider 校验函数
// ═══════════════════════════════════════════════════════════════════════

/**
 * 校验单个模型的 provider
 *
 * @param {string} modelId — 模型 ID
 * @returns {{ valid: boolean, modelId: string, provider: string|null, error?: string }}
 */
function validateProvider(modelId) {
  const config = models[modelId];
  if (!config) {
    return { valid: false, modelId, provider: null, error: 'Model not found in registry' };
  }

  if (config.provider !== PROVIDER_VALIDATION.ALLOWED_PROVIDER) {
    return {
      valid: false,
      modelId,
      provider: config.provider,
      error: `Provider "${config.provider}" is not allowed. Only "aliyun" is permitted.`
    };
  }

  return { valid: true, modelId, provider: config.provider };
}

/**
 * 校验 template 是否指向合法模型
 *
 * @param {string} templateId — 模板 ID
 * @returns {{ valid: boolean, templateId: string, modelId?: string, error?: string }}
 */
function validateTemplateProvider(templateId) {
  const template = getTemplate(templateId);
  if (!template) {
    return { valid: false, templateId, error: 'Template not found' };
  }
  return validateProvider(template.modelId);
}

/**
 * 开发辅助：检查新模型注册是否符合规范
 *
 * 在 CI / pre-commit hook 中调用，确保新增模型通过校验。
 *
 * @param {Object} modelConfig — 新模型配置
 * @returns {{ valid: boolean, errors: string[] }}
 */
function checkNewModel(modelConfig) {
  const errors = [];

  // 必填字段检查
  const requiredFields = [
    'id', 'name', 'displayName', 'family', 'provider',
    'capability', 'outputType', 'apiModelName', 'description',
    'category', 'icon', 'sort', 'pricing'
  ];

  for (const field of requiredFields) {
    if (!modelConfig[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // provider 校验
  if (modelConfig.provider && modelConfig.provider !== PROVIDER_VALIDATION.ALLOWED_PROVIDER) {
    errors.push(`Provider must be "${PROVIDER_VALIDATION.ALLOWED_PROVIDER}", got "${modelConfig.provider}"`);
  }

  // capability 校验
  if (modelConfig.capability && !Object.values(CAPABILITY).includes(modelConfig.capability)) {
    errors.push(`Unknown capability: "${modelConfig.capability}". Allowed: ${Object.values(CAPABILITY).join(', ')}`);
  }

  // outputType 校验
  if (modelConfig.outputType && !['image', 'video'].includes(modelConfig.outputType)) {
    errors.push(`Invalid outputType: "${modelConfig.outputType}". Must be "image" or "video"`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 获取唯一允许的 provider 名称
 *
 * @returns {string}
 */
function getAllowedProvider() {
  return PROVIDER_VALIDATION.ALLOWED_PROVIDER;
}

// ═══════════════════════════════════════════════════════════════════════
//  10. 导出
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // ─── 核心数据（只读）─────────────────
  models,
  templates,
  capabilityMap,
  CAPABILITY,

  // ─── 模型查询 ────────────────────────
  getModelConfig,
  getModelsByCapability,
  getModelsByOutputType,
  getModelsByFamily,
  getAllModelIds,
  getAllModels,

  // ─── 模板查询 ────────────────────────
  getTemplate,
  getTemplateById,
  getTemplateModelConfig,
  getTemplatesByCapability,
  getTemplatesByCategory,
  getTemplatesByOutput,
  getAllTemplateIds,

  // ─── 模型名解析 ──────────────────────
  resolveTemplate,
  resolveModelForTemplate,
  getApiModelName,
  getModelPricing,

  // ─── 兼容层映射 ──────────────────────
  templateModelMap,
  isTemplateSupported,
  getSupportedTemplateIds,
  isAliyunProvider,
  getAllCapabilities,

  // ─── Provider 校验 ───────────────────
  validateProvider,
  validateTemplateProvider,
  checkNewModel,
  getAllowedProvider,
};
