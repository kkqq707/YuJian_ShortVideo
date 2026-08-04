/**
 * AI Providers — 统一入口
 *
 * Sprint 4.6: AI Provider 架构准备
 *
 * 导出 Provider Router 用于业务层调用。
 * 业务代码不应直接 import 具体 Provider。
 *
 * 使用方式：
 *   const { providerRouter } = require('./providers');
 *   const result = await providerRouter.createTask({ templateId, prompt, ... });
 */

const providerRouter = require('./provider-router');
const ProviderError = require('../utils/ProviderError');

module.exports = {
  providerRouter,
  ProviderError,

  // 便捷方法：根据 templateId 解析 provider + model
  resolveTemplateToModel: providerRouter.resolveTemplateToModel,

  // 便捷方法：列出所有已注册的 Provider
  listProviders: providerRouter.listProviders
};
