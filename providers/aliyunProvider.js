/**
 * Aliyun Bailian (百炼) AI Provider — 统一接口
 *
 * Sprint 5.1: AI Provider 抽象层
 *
 * 提供统一的 AI 生成入口，Controller 层只需调用此 Provider，
 * 无需感知底层的 DashScope Client、模型选择、参数组装等细节。
 *
 * ─── 三个核心方法 ───────────────────────────────
 *   generateImage(params)   — 图片生成（文生图 / 图片编辑）
 *   generateVideo(params)   — 视频生成（文生视频 / 图生视频）
 *   checkTaskStatus(taskId) — 查询异步任务状态
 *
 * ─── 设计原则 ───────────────────────────────────
 *   1. Controller 只调用 aliyunProvider，不直接调 dashscopeService
 *   2. 模型选择由本层根据 templateId + ai-models 配置自动完成
 *   3. 错误统一包装为 ProviderError，含重试标记
 *   4. 日志不记录 apiKey、prompt、imageUrl
 *
 * ─── 使用方式 ───────────────────────────────────
 *   const aliyunProvider = require('./providers/aliyunProvider');
 *
 *   // 图片生成
 *   const result = await aliyunProvider.generateImage({
 *     templateId: 'image_generation',
 *     prompt: '一只可爱的猫',
 *     options: { size: '1024*1024', n: 1 }
 *   });
 *
 *   // 视频生成
 *   const result = await aliyunProvider.generateVideo({
 *     templateId: 'image_to_video',
 *     prompt: '画面缓缓移动，展现美丽的风景',
 *     imageUrl: 'https://oss.example.com/input.jpg',
 *     duration: 5
 *   });
 *
 *   // 查询状态
 *   const status = await aliyunProvider.checkTaskStatus(taskId);
 */

const { resolveModelForTemplate, getModelConfig, getAllModels } = require('../config/ai-model-registry');
const ProviderError = require('../utils/ProviderError');

// 委托给现有 aliyun/ 子 Provider（复用已验证的 HTTP 客户端能力）
const aliyunImageProvider = require('./aliyun/image-provider');
const aliyunVideoProvider = require('./aliyun/video-provider');

class AliyunBailianProvider {
  constructor() {
    this.name = 'aliyun';
    this.displayName = '阿里云百炼';
    this.imageProvider = aliyunImageProvider;
    this.videoProvider = aliyunVideoProvider;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  核心接口
  // ═══════════════════════════════════════════════════════════════════

  /**
   * generateImage — 图片生成统一入口
   *
   * 根据 templateId 自动路由到文生图或图片编辑。
   *
   * @param {Object} params
   * @param {string} params.templateId  — 创作模板 ID（'image_generation' | 'image_edit'）
   * @param {string} params.prompt      — 正向提示词（必填）
   * @param {string} [params.imageUrl]  — 输入图片 URL（图片编辑时必填）
   * @param {Object} [params.options]   — 额外选项 { size, n, ... }
   * @returns {Promise<{
   *   taskId: string,
   *   provider: string,
   *   model: string,
   *   modelId: string,
   *   status: string,
   *   outputType: string
   * }>}
   * @throws {ProviderError}
   */
  async generateImage(params) {
    const { templateId, prompt, imageUrl, options = {} } = params;

    // ── 1. 参数校验 ────────────────────────────────────────────
    this._validatePrompt(prompt);

    // ── 2. 解析模型配置 ─────────────────────────────────────────
    const modelConfig = resolveModelForTemplate(templateId);
    if (!modelConfig) {
      throw new ProviderError(
        this.name, 'UNSUPPORTED_TEMPLATE',
        `Template "${templateId}" is not supported for image generation`, false
      );
    }

    if (modelConfig.outputType !== 'image') {
      throw new ProviderError(
        this.name, 'TEMPLATE_TYPE_MISMATCH',
        `Template "${templateId}" does not produce images (outputType: ${modelConfig.outputType})`, false
      );
    }

    // ── 3. 调用子 Provider ─────────────────────────────────────
    this._logRequest('generateImage', { templateId, model: modelConfig.apiModelName });

    const result = await this.imageProvider.createTask({
      templateId,
      prompt,
      imageUrl,
      options
    });

    this._logSuccess('generateImage', result);

    // ── DEBUG(Phase UI-AICreation-02-B-1-G-M-F): 打印 aliyunProvider return ──
    console.log(
      `[DEBUG-QWEN-IMAGE] AliyunBailianProvider.generateImage | ` +
      `result.taskId=${result.taskId} | ` +
      `result.hasResults=${!!result.results} | ` +
      `result.resultsCount=${result.results ? result.results.length : 0} | ` +
      `result.status=${result.status}`
    );

    // Phase UI-AICreation-02-B-1-G-M-I: 使用 image-provider 实际返回的 model
    // 当通过 options.modelId 选择了备用模型时，result.model 可能有别于 modelConfig.apiModelName
    const effectiveModel = (result && result.model) || modelConfig.apiModelName;

    // Resolve effective modelId from apiModelName if model was overridden
    let resolvedModelId = modelConfig.id;
    if (result && result.model && result.model !== modelConfig.apiModelName) {
      const allModels = getAllModels();
      const matched = allModels.find(m => m.apiModelName === result.model);
      if (matched) {
        resolvedModelId = matched.id;
      }
    }

    const returnValue = {
      taskId: result.taskId,
      results: result.results || null,
      provider: this.name,
      model: effectiveModel,
      modelId: resolvedModelId,
      status: result.status,
      outputType: 'image'
    };

    console.log(
      `[DEBUG-QWEN-IMAGE] AliyunBailianProvider.generateImage return | ` +
      `taskId=${returnValue.taskId} | ` +
      `hasResults=${!!returnValue.results} | ` +
      `resultsCount=${returnValue.results ? returnValue.results.length : 0} | ` +
      `model=${effectiveModel}`
    );
    // ── DEBUG END ────────────────────────────────────────────────────────────

    return returnValue;
  }

  /**
   * generateVideo — 视频生成统一入口
   *
   * 根据 templateId 自动路由到文生视频或图生视频。
   *
   * @param {Object} params
   * @param {string} params.templateId      — 创作模板 ID（'text_to_video' | 'image_to_video'）
   * @param {string} params.prompt          — 正向提示词（必填）
   * @param {string} [params.imageUrl]      — 输入图片 URL（图生视频时使用）
   * @param {Array}  [params.images]        — 多参考图（参考生视频时使用）
   * @param {string} [params.negativePrompt] — 负向提示词
   * @param {number} [params.duration]      — 视频时长（秒）
   * @param {Object} [params.options]       — 额外选项 { size, ... }
   * @returns {Promise<{
   *   taskId: string,
   *   provider: string,
   *   model: string,
   *   modelId: string,
   *   status: string,
   *   outputType: string
   * }>}
   * @throws {ProviderError}
   */
  async generateVideo(params) {
    const {
      templateId, prompt, imageUrl, images,
      negativePrompt, duration, options = {}
    } = params;

    // ── 1. 参数校验 ────────────────────────────────────────────
    this._validatePrompt(prompt);

    // ── 2. 解析模型配置 ─────────────────────────────────────────
    const modelConfig = resolveModelForTemplate(templateId);
    if (!modelConfig) {
      throw new ProviderError(
        this.name, 'UNSUPPORTED_TEMPLATE',
        `Template "${templateId}" is not supported for video generation`, false
      );
    }

    if (modelConfig.outputType !== 'video') {
      throw new ProviderError(
        this.name, 'TEMPLATE_TYPE_MISMATCH',
        `Template "${templateId}" does not produce videos (outputType: ${modelConfig.outputType})`, false
      );
    }

    // ── 3. 调用子 Provider ─────────────────────────────────────
    this._logRequest('generateVideo', { templateId, model: modelConfig.apiModelName });

    const result = await this.videoProvider.createTask({
      templateId,
      prompt,
      imageUrl,
      images,
      negativePrompt,
      duration: duration || modelConfig.defaultDuration,
      options
    });

    this._logSuccess('generateVideo', result);

    return {
      taskId: result.taskId,
      provider: this.name,
      model: modelConfig.apiModelName,
      modelId: modelConfig.id,
      status: result.status,
      outputType: 'video'
    };
  }

  /**
   * checkTaskStatus — 查询异步任务状态
   *
   * @param {string} taskId — Provider 任务 ID（DashScope task_id）
   * @returns {Promise<{
   *   taskId: string,
   *   provider: string,
   *   status: string,
   *   providerStatus: string,
   *   progress: number|null,
   *   outputUrl: string|null,
   *   coverUrl: string|null,
   *   duration: number|null,
   *   errorCode: string|null,
   *   errorMessage: string|null
   * }>}
   * @throws {ProviderError}
   */
  async checkTaskStatus(taskId) {
    // ── 参数校验 ────────────────────────────────────────────────
    if (!taskId || typeof taskId !== 'string' || !taskId.trim()) {
      throw new ProviderError(
        this.name, 'INVALID_TASK_ID',
        'taskId is required and must be a non-empty string', false
      );
    }

    // ── 调用子 Provider（视频和图片使用相同查询 API）────────────
    this._logRequest('checkTaskStatus', { taskId });

    try {
      const result = await this.videoProvider.getTaskStatus(taskId);

      this._logSuccess('checkTaskStatus', {
        taskId,
        status: result.status,
        progress: result.progress
      });

      return {
        taskId: result.taskId || taskId.trim(),
        provider: this.name,
        status: result.status,
        providerStatus: result.providerStatus,
        progress: result.progress,
        outputUrl: result.outputUrl || null,
        coverUrl: result.coverUrl || null,
        duration: result.duration || null,
        errorCode: result.errorCode || null,
        errorMessage: result.errorMessage || null
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(
        this.name, 'STATUS_CHECK_FAILED',
        `Failed to check task status: ${error.message}`, true
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  便捷方法
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 取消任务
   *
   * @param {string} taskId — Provider 任务 ID
   * @returns {Promise<{ cancelled: boolean, message: string }>}
   */
  async cancelTask(taskId) {
    return this.videoProvider.cancelTask(taskId);
  }

  /**
   * 根据 templateId 获取模型配置
   *
   * @param {string} templateId
   * @returns {Object|null} 模型配置对象
   */
  getModelForTemplate(templateId) {
    return resolveModelForTemplate(templateId);
  }

  /**
   * 检查 templateId 是否受此 Provider 支持
   *
   * @param {string} templateId
   * @returns {boolean}
   */
  supportsTemplate(templateId) {
    return resolveModelForTemplate(templateId) !== null;
  }

  /**
   * 根据模型 ID 获取模型配置
   *
   * @param {string} modelId — 如 'wan2.1-t2v'
   * @returns {Object|null}
   */
  getModelConfig(modelId) {
    return getModelConfig(modelId);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  内部方法
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 统一参数校验（prompt）
   */
  _validatePrompt(prompt) {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new ProviderError(
        this.name, 'INVALID_PROMPT',
        'Prompt is required and must be a non-empty string', false
      );
    }

    if (prompt.trim().length > 2000) {
      throw new ProviderError(
        this.name, 'PROMPT_TOO_LONG',
        'Prompt must not exceed 2000 characters', false
      );
    }
  }

  // ─── 日志方法（不记录 apiKey / prompt / imageUrl）───────────────

  _logRequest(method, info) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[AliyunBailian] ${method} | ` +
        `template=${info.templateId || 'N/A'} | ` +
        `model=${info.model || 'N/A'} | ` +
        `taskId=${info.taskId || '(new)'} | ` +
        `time=${new Date().toISOString()}`
      );
    }
  }

  _logSuccess(method, result) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[AliyunBailian] ${method} ✓ | ` +
        `taskId=${result.taskId} | status=${result.status}`
      );
    }
  }
}

// 单例导出
module.exports = new AliyunBailianProvider();
