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

// Phase 004-Step4-C: DigitalHuman Pipeline Provider Layer
const aliyunVisionProvider = require('./aliyun/vision-provider');
const aliyunScriptProvider = require('./aliyun/script-provider');
const aliyunTtsProvider = require('./aliyun/tts-provider');
const aliyunDigitalHumanProvider = require('./aliyun/digital-human-provider');

class AliyunBailianProvider {
  constructor() {
    this.name = 'aliyun';
    this.displayName = '阿里云百炼';
    this.imageProvider = aliyunImageProvider;
    this.videoProvider = aliyunVideoProvider;
    // Phase 004-Step4-C: DigitalHuman Pipeline providers
    this.visionProvider = aliyunVisionProvider;
    this.scriptProvider = aliyunScriptProvider;
    this.ttsProvider = aliyunTtsProvider;
    this.digitalHumanProvider = aliyunDigitalHumanProvider;
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
      negativePrompt, duration, model, options = {}
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
      model,
      options
    });

    this._logSuccess('generateVideo', result);

    return {
      taskId: result.taskId,
      provider: this.name,
      model: model || modelConfig.apiModelName,
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
  //  Phase 004-Step4-C: DigitalHuman Pipeline Provider Methods
  // ═══════════════════════════════════════════════════════════════════

  /**
   * analyzeVision — Visual understanding via Vision Provider
   *
   * Delegates to aliyun/vision-provider.js
   *
   * @param {Object} params
   * @param {string} params.imageUrl   — Image URL (required)
   * @param {string} [params.prompt]   — Custom analysis prompt
   * @param {Array}  [params.images]   — Multiple image URLs
   * @param {string} [params.modelId]  — Model override ('qwen3-vl-plus' | 'qwen3-vl-flash')
   * @returns {Promise<{
   *   model: string, visualDesc: string, features: string[],
   *   tags: string[], sellingPoints: string[], ocrTexts: string[],
   *   tokensUsed: number, processingTimeMs: number
   * }>}
   * @throws {ProviderError}
   */
  async analyzeVision(params) {
    this._logRequest('analyzeVision', { modelId: params.modelId || 'qwen3-vl-plus' });
    try {
      const result = await this.visionProvider.analyze(params);
      this._logSuccess('analyzeVision', { model: result.model, tokensUsed: result.tokensUsed });
      return result;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        this.name, 'VISION_FAILED',
        `Vision analysis failed: ${error.message}`, false
      );
    }
  }

  /**
   * generateScript — Script generation via Script Provider
   *
   * Delegates to aliyun/script-provider.js
   *
   * @param {Object} params
   * @param {Object} [params.visionResult] — Output from analyzeVision()
   * @param {string} [params.theme]        — Product/script theme
   * @param {string} [params.style]        — professional | casual | energetic | warm
   * @param {number} [params.duration]     — Target duration in seconds
   * @param {string} [params.productName]  — Product name
   * @param {string} [params.modelId]      — Model override ('qwen3.6-plus' | 'qwen3.6-flash')
   * @returns {Promise<{
   *   title: string, fullText: string, segments: Array,
   *   totalWords: number, estimatedDuration: number, style: string,
   *   model: string, tokensUsed: number, processingTimeMs: number
   * }>}
   * @throws {ProviderError}
   */
  async generateScript(params) {
    this._logRequest('generateScript', {
      style: params.style || 'professional',
      modelId: params.modelId || 'qwen3.6-plus',
    });
    try {
      const result = await this.scriptProvider.generate(params);
      this._logSuccess('generateScript', {
        model: result.model,
        segments: result.segments ? result.segments.length : 0,
        totalWords: result.totalWords,
      });
      return result;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        this.name, 'SCRIPT_FAILED',
        `Script generation failed: ${error.message}`, false
      );
    }
  }

  /**
   * synthesizeSpeech — TTS synthesis via TTS Provider
   *
   * Delegates to aliyun/tts-provider.js
   *
   * @param {Object} params
   * @param {string} params.text           — Text to synthesize (required)
   * @param {string} [params.voiceId]      — Voice ID
   * @param {string} [params.emotion]      — Emotion
   * @param {number} [params.speed]        — Speech speed (0.5–2.0)
   * @param {string} [params.format]       — Output format (mp3, wav, pcm)
   * @param {string} [params.modelId]      — Model override
   * @param {number} [params.enterpriseId] — For OSS storage path
   * @returns {Promise<{
   *   audioUrl: string, ossKey: string, duration: number, format: string,
   *   sampleRate: number, fileSize: number, voiceId: string,
   *   emotion: string, speed: number, model: string, processingTimeMs: number
   * }>}
   * @throws {ProviderError}
   */
  async synthesizeSpeech(params) {
    this._logRequest('synthesizeSpeech', {
      modelId: params.modelId || 'cosyvoice-v3.5-plus',
      textLen: params.text ? params.text.length : 0,
    });
    try {
      const result = await this.ttsProvider.synthesize(params);
      this._logSuccess('synthesizeSpeech', {
        model: result.model,
        duration: result.duration,
        fileSize: result.fileSize,
      });
      return result;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        this.name, 'TTS_FAILED',
        `TTS synthesis failed: ${error.message}`, false
      );
    }
  }

  /**
   * createDigitalHuman — Digital human video task creation
   *
   * Delegates to aliyun/digital-human-provider.js
   *
   * @param {Object} params
   * @param {string} params.imageUrl     — Input image URL (required)
   * @param {string} params.audioUrl     — Input audio URL (required)
   * @param {string} [params.style]      — wan2.2-s2v: speech | singing | performance
   * @param {string} [params.resolution] — Video resolution
   * @param {Array}  [params.faceBbox]   — emo-v1: [x1, y1, x2, y2]
   * @param {string} [params.styleLevel] — emo-v1: normal | calm | active
   * @param {string} [params.modelId]    — Model override
   * @returns {Promise<{
   *   taskId: string, provider: string, model: string, status: string
   * }>}
   * @throws {ProviderError}
   */
  async createDigitalHuman(params) {
    this._logRequest('createDigitalHuman', {
      modelId: params.modelId || 'wan2.2-s2v',
    });
    try {
      const result = await this.digitalHumanProvider.createTask(params);
      this._logSuccess('createDigitalHuman', {
        taskId: result.taskId,
        model: result.model,
      });
      return result;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        this.name, 'DIGITAL_HUMAN_FAILED',
        `Digital human task creation failed: ${error.message}`, false
      );
    }
  }

  /**
   * getDigitalHumanResult — Wait for async completion + OSS transfer
   *
   * @param {string} taskId       — DashScope task ID
   * @param {number} enterpriseId — Enterprise ID for OSS path
   * @param {Object} [meta]       — Additional metadata
   * @returns {Promise<{
   *   videoUrl: string, videoOssKey: string, coverUrl: string|null,
   *   dashscopeTaskId: string, duration: number, resolution: string,
   *   style: string, model: string, fileSize: number, mimeType: string
   * }>}
   */
  async getDigitalHumanResult(taskId, enterpriseId, meta = {}) {
    this._logRequest('getDigitalHumanResult', { taskId });
    try {
      const result = await this.digitalHumanProvider.getResult(taskId, enterpriseId, meta);
      this._logSuccess('getDigitalHumanResult', { taskId, videoOssKey: result.videoOssKey });
      return result;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        this.name, 'DIGITAL_HUMAN_RESULT_FAILED',
        `Failed to get digital human result: ${error.message}`, false
      );
    }
  }

  /**
   * getDigitalHumanTaskStatus — Check async digital human task status
   *
   * @param {string} taskId — DashScope task ID
   * @returns {Promise<Object>} Status result
   */
  async getDigitalHumanTaskStatus(taskId) {
    return this.digitalHumanProvider.getTaskStatus(taskId);
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
