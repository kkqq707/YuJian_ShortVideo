/**
 * AI Providers — 统一入口
 *
 * Sprint 5.1: AI Provider 抽象层
 *
 * 导出：
 *   - aliyunProvider    — 阿里云百炼统一接口（generateImage / generateVideo / checkTaskStatus）
 *   - providerRouter    — Provider 路由器（用于兼容旧调用链）
 *   - ProviderError     — 统一错误类
 *
 * ─── 推荐使用方式（Sprint 5.1 新接口）─────────────────
 *   const { aliyunProvider } = require('./providers');
 *   const result = await aliyunProvider.generateVideo({
 *     templateId: 'image_to_video',
 *     prompt: '...',
 *     imageUrl: '...'
 *   });
 *   const status = await aliyunProvider.checkTaskStatus(taskId);
 *
 * ─── 兼容使用方式（Sprint 4.6 旧接口）─────────────────
 *   const { providerRouter } = require('./providers');
 *   const result = await providerRouter.createTask({ templateId, prompt, ... });
 */

const providerRouter = require('./provider-router');
const aliyunProvider = require('./aliyunProvider');
const ProviderError = require('../utils/ProviderError');

module.exports = {
  // ─── Sprint 5.1 新接口（推荐）────────────────────────────────
  aliyunProvider,

  // ─── Sprint 4.6 兼容接口 ────────────────────────────────────
  providerRouter,
  ProviderError,

  // 便捷方法：根据 templateId 解析 provider + model
  resolveTemplateToModel: providerRouter.resolveTemplateToModel,

  // 便捷方法：列出所有已注册的 Provider
  listProviders: providerRouter.listProviders
};
