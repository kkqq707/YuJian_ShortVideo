/**
 * Aliyun Image Provider
 *
 * Sprint 4.6: AI Provider 架构准备
 *
 * 职责：
 *   实现 AIProvider 接口的图片生成部分
 *   - createTask()    — 创建图片生成任务
 *   - getTaskStatus() — 查询任务状态
 *   - cancelTask()    — 取消任务
 *
 * 当前支持的 capability：
 *   - image_generation — 文生图
 *   - image_edit       — 图片编辑（预留）
 */

const dashscopeClient = require('./dashscope-client');
const { resolveModel, ALIYUN_CONFIG } = require('./config');
const registry = require('../../config/ai-model-registry');
const ProviderError = require('../../utils/ProviderError');

class AliyunImageProvider {
  constructor() {
    this.provider = 'aliyun';
    this.client = dashscopeClient;
  }

  /**
   * 创建图片生成任务
   *
   * @param {Object} params
   * @param {string} params.templateId — 创作模板 ID
   * @param {string} params.prompt    — 提示词
   * @param {string} [params.imageUrl] — 输入图片 URL（图片编辑时使用）
   * @param {Object} [params.options]  — 额外选项 { size, n, ... }
   * @returns {Promise<{ taskId: string, provider: string, model: string, status: string }>}
   */
  async createTask(params) {
    const { templateId, prompt, imageUrl, options = {} } = params;

    // ── 1. 解析模型 ────────────────────────────────────────────
    const modelConfig = resolveModel(templateId);
    if (!modelConfig) {
      throw new ProviderError(
        this.provider, 'UNSUPPORTED_TEMPLATE',
        `Unsupported template: ${templateId}`, false
      );
    }

    if (modelConfig.outputType !== 'image') {
      throw new ProviderError(
        this.provider, 'TEMPLATE_TYPE_MISMATCH',
        `Template ${templateId} is not an image generation template`, false
      );
    }

    // ── 2. 参数校验 ────────────────────────────────────────────
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new ProviderError(
        this.provider, 'INVALID_PROMPT',
        'Prompt is required for image generation', false
      );
    }

    // ── 3. 按 capability 分发 ──────────────────────────────────
    switch (modelConfig.capability) {
      case 'image_generation':
        return this._createImageGeneration(prompt, modelConfig.model, options);

      case 'image_edit':
        return this._createImageEdit(prompt, imageUrl, modelConfig.model, options);

      default:
        throw new ProviderError(
          this.provider, 'UNSUPPORTED_CAPABILITY',
          `Unsupported capability: ${modelConfig.capability}`, false
        );
    }
  }

  /**
   * 查询任务状态
   *
   * @param {string} taskId — Provider 任务 ID
   * @returns {Promise<Object>}
   */
  async getTaskStatus(taskId) {
    return this.client.getTaskStatus(taskId);
  }

  /**
   * 取消任务
   *
   * @param {string} taskId — Provider 任务 ID
   * @returns {Promise<Object>}
   */
  async cancelTask(taskId) {
    return this.client.cancelTask(taskId);
  }

  // ─── 私有方法 ──────────────────────────────────────────────────

  /**
   * 文生图
   *
   * Phase UI-AICreation-02-B-1-G-M-I: 支持通过 options.modelId 覆盖模型
   * 用于备用模型切换，当主模型(qwen-image-3.0-pro)限流时选择 qwen-image-plus
   */
  async _createImageGeneration(prompt, model, options) {
    // Phase UI-AICreation-02-B-1-G-M-I: 如果 options.modelId 指定了其他模型，使用该模型的 apiModelName
    let effectiveModel = model;
    if (options.modelId) {
      const overrideConfig = registry.getModelConfig(options.modelId);
      if (overrideConfig && overrideConfig.apiModelName) {
        effectiveModel = overrideConfig.apiModelName;
        console.log(
          `[AliyunImageProvider] Model override | ` +
          `templateModel=${model} | ` +
          `overrideModel=${effectiveModel} | ` +
          `modelId=${options.modelId}`
        );
      }
    }

    const result = await this.client.createTextToImageTask({
      prompt: prompt.trim(),
      model: effectiveModel,
      size: options.size,
      n: options.n
    });

    // ── DEBUG(Phase UI-AICreation-02-B-1-G-M-F): 打印 image-provider 返回格式 ──
    console.log(
      `[DEBUG-QWEN-IMAGE] AliyunImageProvider._createImageGeneration result | ` +
      `taskId=${result.taskId} | ` +
      `hasResults=${!!result.results} | ` +
      `resultsCount=${result.results ? result.results.length : 0} | ` +
      `status=${result.status} | ` +
      `provider=${result.provider}`
    );
    if (result.results && result.results.length > 0) {
      console.log(
        `[DEBUG-QWEN-IMAGE] AliyunImageProvider._createImageGeneration first result.url (first 200 chars) = ${String(result.results[0].url).substring(0, 200)}`
      );
    }
    const returnValue = {
      taskId: result.taskId,
      results: result.results,
      provider: this.provider,
      model: effectiveModel,
      status: result.status
    };
    console.log(
      `[DEBUG-QWEN-IMAGE] AliyunImageProvider._createImageGeneration return | ` +
      `taskId=${returnValue.taskId} | ` +
      `hasResults=${!!returnValue.results} | ` +
      `resultsCount=${returnValue.results ? returnValue.results.length : 0}`
    );
    // ── DEBUG END ────────────────────────────────────────────────────────────

    return returnValue;
  }

  /**
   * 图片编辑（预留）
   *
   * 当前 DashScope 图片编辑 API 待确认，先返回友好错误。
   */
  async _createImageEdit(prompt, imageUrl, model, options) {
    // 图片编辑 API 待阿里云百炼开放后实现
    // 当前使用文生图作为临时方案
    throw new ProviderError(
      this.provider, 'NOT_IMPLEMENTED',
      'Image edit API is not yet available. Please use image_generation template instead.', false
    );
  }
}

module.exports = new AliyunImageProvider();
