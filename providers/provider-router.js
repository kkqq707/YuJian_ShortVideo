/**
 * AI Provider Router
 *
 * Sprint 4.6: AI Provider 架构准备
 *
 * 职责：
 *   根据 provider 名称将请求路由到正确的 AI Provider 实例。
 *
 * 设计原则：
 *   - 业务代码不直接调用具体 Provider
 *   - 新增 Provider 只需在此注册
 *   - 前端只传 templateId，不感知 provider 名称
 *
 * 使用方式：
 *   const router = require('./providers/provider-router');
 *   const result = await router.createTask({ templateId: 'image_to_video', prompt: '...' });
 *   const status = await router.getTaskStatus('aliyun', 'task-xxx');
 */

const aliyunProvider = require('./aliyun');
const ProviderError = require('../utils/ProviderError');
const {
  getTemplateModelConfig
} = require('../config/ai-model-registry');
const {
  resolveModel
} = require('./aliyun/config');

// ─── Provider 注册表 ──────────────────────────────────────────────
//
// 新增 Provider 时在此注册即可：
//   registry['new_provider'] = require('./new-provider');

const registry = {
  'aliyun': aliyunProvider
};

// ─── Provider 实例获取 ────────────────────────────────────────────

/**
 * 获取指定名称的 Provider 实例
 *
 * @param {string} providerName — Provider 名称（如 'aliyun'）
 * @returns {Object} AIProvider 实例
 * @throws {ProviderError} 如果 Provider 未注册
 */
function getProvider(providerName) {
  const provider = registry[providerName];
  if (!provider) {
    throw new ProviderError(
      providerName || 'unknown',
      'PROVIDER_NOT_FOUND',
      `AI Provider "${providerName}" is not registered`,
      false
    );
  }
  return provider;
}

/**
 * 列出所有已注册的 Provider 名称
 *
 * @returns {string[]}
 */
function listProviders() {
  return Object.keys(registry);
}

/**
 * 检查 Provider 是否已注册
 *
 * @param {string} providerName
 * @returns {boolean}
 */
function hasProvider(providerName) {
  return providerName in registry;
}

// ─── 路由方法 ─────────────────────────────────────────────────────

/**
 * 根据 templateId 自动解析 provider 并创建任务
 *
 * 流程：
 *   1. 通过 templateId 解析 provider + model
 *   2. 获取对应 Provider 实例
 *   3. 调用 provider.createTask()
 *
 * @param {Object} params
 * @param {string} params.templateId — 创作模板 ID
 * @param {string} params.prompt     — 提示词
 * @param {string} [params.imageUrl] — 输入图片 URL
 * @param {Array}  [params.images]   — 多参考图
 * @param {string} [params.negativePrompt] — 负向提示词
 * @param {number} [params.duration] — 视频时长
 * @param {Object} [params.options]  — 额外参数
 * @returns {Promise<{ taskId: string, provider: string, model: string, status: string }>}
 */
async function createTask(params) {
  const { templateId } = params;

  // ── 1. 从创作模板解析 provider ──────────────────────────────
  let providerName;
  let model;

  // 优先使用 Aliyun config 中的映射
  const aliyunModelConfig = resolveModel(templateId);
  if (aliyunModelConfig) {
    providerName = aliyunModelConfig.provider;
    model = aliyunModelConfig.model;
  } else {
    // 回退到 ai-model-registry 配置
    const modelCfg = getTemplateModelConfig(templateId);
    if (!modelCfg) {
      throw new ProviderError(
        'unknown', 'UNSUPPORTED_TEMPLATE',
        `No provider found for template: ${templateId}`, false
      );
    }
    providerName = modelCfg.provider;
    model = modelCfg.apiModelName;
  }

  // ── 2. 获取 Provider 实例 ───────────────────────────────────
  const provider = getProvider(providerName);

  // ── 3. 调用 Provider 创建任务 ───────────────────────────────
  const result = await provider.createTask({
    ...params,
    model  // 确保 model 已解析
  });

  return {
    taskId: result.taskId,
    provider: result.provider,
    model: result.model || model,
    status: result.status
  };
}

/**
 * 查询任务状态
 *
 * @param {string} providerName — Provider 名称
 * @param {string} taskId       — Provider 任务 ID
 * @returns {Promise<Object>}
 */
async function getTaskStatus(providerName, taskId) {
  const provider = getProvider(providerName);
  return provider.getTaskStatus(taskId);
}

/**
 * 取消任务
 *
 * @param {string} providerName — Provider 名称
 * @param {string} taskId       — Provider 任务 ID
 * @returns {Promise<Object>}
 */
async function cancelTask(providerName, taskId) {
  const provider = getProvider(providerName);
  return provider.cancelTask(taskId);
}

/**
 * 根据 templateId 获取模型名称
 *
 * @param {string} templateId
 * @returns {{ provider: string, model: string }|null}
 */
function resolveTemplateToModel(templateId) {
  const config = resolveModel(templateId);
  if (config) {
    return { provider: config.provider, model: config.model };
  }

  // 回退到 ai-model-registry
  const modelCfg = getTemplateModelConfig(templateId);
  if (modelCfg) {
    return { provider: modelCfg.provider, model: modelCfg.apiModelName };
  }

  return null;
}

module.exports = {
  // Provider 管理
  getProvider,
  listProviders,
  hasProvider,
  registry,

  // 业务方法
  createTask,
  getTaskStatus,
  cancelTask,
  resolveTemplateToModel
};
