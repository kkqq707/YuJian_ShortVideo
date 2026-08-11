/**
 * Aliyun Video Provider
 *
 * Sprint 4.6: AI Provider 架构准备
 *
 * 职责：
 *   实现 AIProvider 接口的视频生成部分
 *   - createTask()    — 创建视频生成任务
 *   - getTaskStatus() — 查询任务状态
 *   - cancelTask()    — 取消任务
 *
 * 当前支持的 capability：
 *   - image_to_video — 图生视频
 *   - text_to_video  — 文生视频
 */

const dashscopeClient = require('./dashscope-client');
const { resolveModel } = require('./config');
const ProviderError = require('../../utils/ProviderError');

class AliyunVideoProvider {
  constructor() {
    this.provider = 'aliyun';
    this.client = dashscopeClient;
  }

  /**
   * 创建视频生成任务
   *
   * @param {Object} params
   * @param {string} params.templateId     — 创作模板 ID
   * @param {string} params.prompt         — 提示词
   * @param {string} [params.imageUrl]     — 输入图片 URL（图生视频时使用）
   * @param {Array}  [params.images]       — 多参考图（参考生视频时使用）
   * @param {string} [params.negativePrompt] — 负向提示词
   * @param {number} [params.duration]     — 视频时长（秒）
   * @param {Object} [params.options]      — 额外参数
   * @returns {Promise<{ taskId: string, provider: string, model: string, status: string }>}
   */
  async createTask(params) {
    const {
      templateId, prompt, imageUrl, images,
      negativePrompt, duration, model, options = {}
    } = params;

    // ── 1. 解析模型 ────────────────────────────────────────────
    const modelConfig = resolveModel(templateId);
    if (!modelConfig) {
      throw new ProviderError(
        this.provider, 'UNSUPPORTED_TEMPLATE',
        `Unsupported template: ${templateId}`, false
      );
    }

    if (modelConfig.outputType !== 'video') {
      throw new ProviderError(
        this.provider, 'TEMPLATE_TYPE_MISMATCH',
        `Template ${templateId} is not a video generation template`, false
      );
    }

    // ── 2. 参数校验 ────────────────────────────────────────────
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new ProviderError(
        this.provider, 'INVALID_PROMPT',
        'Prompt is required for video generation', false
      );
    }

    if (prompt.trim().length > 2000) {
      throw new ProviderError(
        this.provider, 'PROMPT_TOO_LONG',
        'Prompt must not exceed 2000 characters', false
      );
    }

    // ── 3. 按 capability 分发 ──────────────────────────────────
    const effectiveModel = model || modelConfig.model;

    switch (modelConfig.capability) {
      case 'image_to_video':
        return this._createImageToVideo(
          prompt.trim(), imageUrl, images,
          negativePrompt, effectiveModel, duration, options
        );

      case 'text_to_video':
        return this._createTextToVideo(
          prompt.trim(), effectiveModel, duration, negativePrompt, options
        );

      case 'reference_to_video':
        return this._createImageToVideo(
          prompt.trim(), imageUrl, images,
          negativePrompt, effectiveModel, duration, options
        );

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
   * 图生视频
   */
  async _createImageToVideo(prompt, imageUrl, images, negativePrompt, model, duration, options) {
    // 图片参数校验
    if (!imageUrl && (!images || images.length === 0)) {
      throw new ProviderError(
        this.provider, 'INVALID_IMAGE',
        'Image URL or reference images are required for image-to-video', false
      );
    }

    let result;
    if (images && images.length > 1) {
      // 多参考图 → 使用 ref2video
      result = await this.client.createRefToVideoTask({
        images,
        prompt,
        model,
        duration: duration || 5,
        negativePrompt,
        extraParams: options
      });
    } else {
      // 单图 → 使用 image2video
      result = await this.client.createImageToVideoTask({
        imageUrl: imageUrl || (images && images[0]),
        prompt,
        negativePrompt,
        model,
        duration: duration || 5,
        extraParams: options
      });
    }

    return {
      taskId: result.taskId,
      provider: this.provider,
      model,
      status: result.status
    };
  }

  /**
   * 文生视频
   */
  async _createTextToVideo(prompt, model, duration, negativePrompt, options = {}) {
    const result = await this.client.createTextToVideoTask({
      prompt,
      model,
      size: options.size || '1080p',
      duration: duration || 5,
      negativePrompt,
      extraParams: options
    });

    return {
      taskId: result.taskId,
      provider: this.provider,
      model,
      status: result.status
    };
  }
}

module.exports = new AliyunVideoProvider();
