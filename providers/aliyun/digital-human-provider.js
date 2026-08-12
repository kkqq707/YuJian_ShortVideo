/**
 * Aliyun Digital Human Provider — 数字人视频生成
 *
 * Phase DigitalHuman-Rebuild-004 Step4-C
 *
 * 职责：
 *   API Adapter for Digital Human Video models:
 *   - wan2.2-s2v (Primary — Speech-to-Video)
 *   - emo-v1 (Fallback — EMO digital human)
 *
 * wan2.2-s2v 约束：
 *   - 分辨率: 720P, 480P — 禁止 1080P
 *   - 参数: style (speech/singing/performance) — 禁止 scene
 *   - 输入: imageUrl + audioUrl
 *
 * emo-v1 约束：
 *   - 必须: face_bbox
 *   - 分辨率: 512*512 (1:1), 512*704 (3:4)
 *   - 参数: style_level (normal/calm/active)
 *   - 并发限制: 1
 *
 * 输出流程：
 *   DashScope video_url → download → videoStorageService → OSS → VideoResult
 *
 * 禁止：
 *   - 直接保存 DashScope 临时 URL（24h 过期）
 *   - 在 Provider 内写业务流程
 */

const dashscopeClient = require('./dashscope-client');
const registry = require('../../config/ai-model-registry');
const ProviderError = require('../../utils/ProviderError');
const videoStorageService = require('../../services/videoStorageService');

// ─── 允许的模型 ────────────────────────────────────────────────────
const ALLOWED_MODELS = ['wan2.2-s2v', 'emo-v1'];

// ─── 默认模型 ──────────────────────────────────────────────────────
const DEFAULT_MODEL = 'wan2.2-s2v';

// ─── wan2.2-s2v 约束 ──────────────────────────────────────────────
const WAN22_RESOLUTIONS = ['720P', '480P'];
const WAN22_STYLES = ['speech', 'singing', 'performance'];
const WAN22_BANNED_RESOLUTIONS = ['1080P', '1080p'];

// ─── emo-v1 约束 ──────────────────────────────────────────────────
const EMO_RESOLUTIONS = ['512*512', '512*704'];
const EMO_STYLE_LEVELS = ['normal', 'calm', 'active'];
const EMO_ASPECT_RATIOS = ['1:1', '3:4'];

class AliyunDigitalHumanProvider {
  constructor() {
    this.provider = 'aliyun';
    this.client = dashscopeClient;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  核心接口
  // ═══════════════════════════════════════════════════════════════════

  /**
   * createTask — Create digital human video generation task (async)
   *
   * @param {Object} params
   * @param {string} params.imageUrl     — Input image URL (required)
   * @param {string} params.audioUrl     — Input audio URL (required for S2V)
   * @param {string} [params.style]      — wan2.2-s2v: speech | singing | performance
   * @param {string} [params.resolution] — Video resolution
   * @param {Array}  [params.faceBbox]   — emo-v1: [x1, y1, x2, y2] face bounding box
   * @param {string} [params.styleLevel] — emo-v1: normal | calm | active
   * @param {string} [params.modelId]    — Override model
   * @returns {Promise<{taskId: string, provider: string, model: string, status: string}>}
   * @throws {ProviderError}
   */
  async createTask(params) {
    const {
      imageUrl,
      audioUrl,
      style = 'speech',
      resolution,
      faceBbox,
      styleLevel = 'normal',
      modelId,
    } = params;

    // ── 1. Validate ──────────────────────────────────────────────
    this.validate(params);

    // ── 2. Resolve model ─────────────────────────────────────────
    const modelConfig = this._resolveModel(modelId);
    const model = modelConfig.apiModelName;
    const isWan22 = modelConfig.id === 'wan2.2-s2v';
    const isEmo = modelConfig.id === 'emo-v1';

    // ── 3. Enforce model-specific constraints ────────────────────
    if (isWan22) {
      // BAN 1080P
      if (resolution && WAN22_BANNED_RESOLUTIONS.includes(resolution)) {
        throw new ProviderError(
          this.provider, 'INVALID_RESOLUTION',
          `Resolution "${resolution}" is banned for wan2.2-s2v. ` +
          `Allowed: ${WAN22_RESOLUTIONS.join(', ')}`, false
        );
      }
      // Validate style
      if (style && !WAN22_STYLES.includes(style)) {
        throw new ProviderError(
          this.provider, 'INVALID_STYLE',
          `Style "${style}" not supported for wan2.2-s2v. ` +
          `Allowed: ${WAN22_STYLES.join(', ')}`, false
        );
      }
    }

    if (isEmo) {
      // face_bbox is required
      if (!faceBbox || !Array.isArray(faceBbox) || faceBbox.length !== 4) {
        throw new ProviderError(
          this.provider, 'MISSING_FACE_BBOX',
          'faceBbox [x1, y1, x2, y2] is required for emo-v1', false
        );
      }
      // Validate each bbox value
      for (let i = 0; i < faceBbox.length; i++) {
        if (typeof faceBbox[i] !== 'number' || faceBbox[i] < 0) {
          throw new ProviderError(
            this.provider, 'INVALID_FACE_BBOX',
            `faceBbox[${i}] must be a non-negative number, got: ${faceBbox[i]}`, false
          );
        }
      }
      // Validate resolution
      if (resolution && !EMO_RESOLUTIONS.includes(resolution)) {
        throw new ProviderError(
          this.provider, 'INVALID_RESOLUTION',
          `Resolution "${resolution}" not supported for emo-v1. ` +
          `Allowed: ${EMO_RESOLUTIONS.join(', ')}`, false
        );
      }
      // Validate styleLevel
      if (styleLevel && !EMO_STYLE_LEVELS.includes(styleLevel)) {
        throw new ProviderError(
          this.provider, 'INVALID_STYLE_LEVEL',
          `styleLevel "${styleLevel}" not supported for emo-v1. ` +
          `Allowed: ${EMO_STYLE_LEVELS.join(', ')}`, false
        );
      }
    }

    // ── 4. Build input ───────────────────────────────────────────
    const input = this._buildInput(params, isWan22, isEmo);
    const parameters = this._buildParameters(params, isWan22, isEmo);

    // ── 5. Log ────────────────────────────────────────────────────
    console.log(
      `[DigitalHumanProvider] createTask START | ` +
      `provider=${this.provider} | ` +
      `model=${model} | ` +
      `type=${isWan22 ? 'wan2.2-s2v' : isEmo ? 'emo-v1' : 'unknown'} | ` +
      `hasImage=${!!imageUrl} | ` +
      `hasAudio=${!!audioUrl} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 6. Call API ──────────────────────────────────────────────
    try {
      const result = await this.client.createDigitalHumanTask({
        model,
        input,
        parameters,
      });

      console.log(
        `[DigitalHumanProvider] createTask SUCCESS | ` +
        `model=${model} | ` +
        `taskId=${result.taskId}`
      );

      return {
        taskId: result.taskId,
        provider: this.provider,
        model,
        status: result.status,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        this.provider, 'DIGITAL_HUMAN_FAILED',
        `Digital human task creation failed: ${error.message}`, false
      );
    }
  }

  /**
   * getTaskStatus — Query async task status
   *
   * @param {string} taskId — DashScope task ID
   * @returns {Promise<Object>} Status result
   */
  async getTaskStatus(taskId) {
    if (!taskId || typeof taskId !== 'string' || !taskId.trim()) {
      throw new ProviderError(
        this.provider, 'INVALID_TASK_ID',
        'taskId is required', false
      );
    }

    return this.client.getTaskStatus(taskId);
  }

  /**
   * getResult — Wait for async completion and transfer video to OSS
   *
   * After the async task completes (SUCCEEDED):
   * 1. Extract video_url from task result
   * 2. Download video from DashScope CDN
   * 3. Upload to project OSS via videoStorageService
   * 4. Return VideoResult with permanent OSS URLs
   *
   * @param {string} taskId           — DashScope task ID
   * @param {number} enterpriseId     — Enterprise ID for OSS path
   * @param {Object} [meta]           — Additional metadata (style, resolution, model)
   * @returns {Promise<VideoResult>}
   */
  async getResult(taskId, enterpriseId, meta = {}) {
    const startTime = Date.now();

    // ── 1. Check task status ────────────────────────────────────
    const statusResult = await this.getTaskStatus(taskId);

    if (statusResult.status !== 'success') {
      throw new ProviderError(
        this.provider, 'TASK_NOT_COMPLETE',
        `Task ${taskId} is not complete yet. Status: ${statusResult.status}`, false
      );
    }

    const videoUrl = statusResult.outputUrl;
    if (!videoUrl) {
      throw new ProviderError(
        this.provider, 'NO_VIDEO_URL',
        `Task ${taskId} completed but no video URL in response`, false
      );
    }

    // ── 2. Download and transfer to OSS ──────────────────────────
    try {
      const storageResult = await this._transferVideo(videoUrl, enterpriseId);

      // ── 3. Build VideoResult ──────────────────────────────────
      const result = this.normalizeResult({
        taskId,
        statusResult,
        storageResult,
        meta,
        startTime,
      });

      console.log(
        `[DigitalHumanProvider] getResult SUCCESS | ` +
        `taskId=${taskId} | ` +
        `duration=${Date.now() - startTime}ms | ` +
        `videoOssKey=${storageResult.video.ossKey}`
      );

      return result;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        this.provider, 'VIDEO_TRANSFER_FAILED',
        `Failed to transfer digital human video to OSS: ${error.message}`, false
      );
    }
  }

  /**
   * validate — Input validation
   *
   * @param {Object} params
   * @throws {ProviderError}
   */
  validate(params) {
    if (!params) {
      throw new ProviderError(this.provider, 'INVALID_PARAM', 'params is required', false);
    }

    const { imageUrl, audioUrl, modelId } = params;

    // Image URL is required for both models
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      throw new ProviderError(
        this.provider, 'INVALID_IMAGE',
        'imageUrl is required and must be a non-empty string', false
      );
    }

    if (!/^https?:\/\//i.test(imageUrl.trim())) {
      throw new ProviderError(
        this.provider, 'INVALID_IMAGE',
        'imageUrl must be an http(s) URL', false
      );
    }

    // Audio URL is required for wan2.2-s2v, emo-v1 may use text
    if (!audioUrl && (!modelId || modelId === 'wan2.2-s2v')) {
      throw new ProviderError(
        this.provider, 'INVALID_AUDIO',
        'audioUrl is required for digital human video generation', false
      );
    }

    if (audioUrl && (!/^https?:\/\//i.test(audioUrl.trim()))) {
      throw new ProviderError(
        this.provider, 'INVALID_AUDIO',
        'audioUrl must be an http(s) URL', false
      );
    }

    // Model validation
    if (modelId && !ALLOWED_MODELS.includes(modelId)) {
      throw new ProviderError(
        this.provider, 'INVALID_MODEL',
        `Model "${modelId}" not supported. Allowed: ${ALLOWED_MODELS.join(', ')}`, false
      );
    }
  }

  /**
   * normalizeResult — Build VideoResult from task + storage results
   *
   * @param {Object} params
   * @returns {VideoResult}
   */
  normalizeResult(params) {
    const { taskId, statusResult, storageResult, meta, startTime } = params;

    const processingTimeMs = startTime ? Date.now() - startTime : 0;

    return {
      videoUrl: storageResult?.video?.url || '',
      videoOssKey: storageResult?.video?.ossKey || '',
      coverUrl: storageResult?.cover?.url || null,
      coverOssKey: storageResult?.cover?.ossKey || null,
      dashscopeTaskId: taskId,
      duration: statusResult?.duration || meta?.duration || 0,
      resolution: meta?.resolution || '720P',
      style: meta?.style || 'speech',
      model: meta?.model || 'unknown',
      fileSize: storageResult?.size || 0,
      mimeType: storageResult?.mimeType || 'video/mp4',
      processingTimeMs,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  内部方法
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Build input object for the API request.
   */
  _buildInput(params, isWan22, isEmo) {
    const { imageUrl, audioUrl, faceBbox, style } = params;

    const input = {
      image_url: imageUrl.trim(),
    };

    // Audio URL (required for both models in practice)
    if (audioUrl) {
      input.audio_url = audioUrl.trim();
    }

    // wan2.2-s2v specific: style
    if (isWan22 && style) {
      input.style = style;
    }

    // emo-v1 specific: face_bbox
    if (isEmo && faceBbox) {
      input.face_bbox = faceBbox;
    }

    return input;
  }

  /**
   * Build parameters object for the API request.
   */
  _buildParameters(params, isWan22, isEmo) {
    const { resolution, styleLevel } = params;
    const parameters = {};

    if (isWan22) {
      parameters.resolution = resolution || '720P';
      // NOTE: 'scene' parameter is BANNED for wan2.2-s2v
      // We never add it, regardless of params
    }

    if (isEmo) {
      parameters.resolution = resolution || '512*512';
      if (styleLevel) {
        parameters.style_level = styleLevel;
      }
    }

    return parameters;
  }

  /**
   * Resolve model configuration from registry.
   */
  _resolveModel(modelId) {
    const resolvedId = modelId || DEFAULT_MODEL;

    const modelConfig = registry.getModelConfig(resolvedId);
    if (!modelConfig) {
      throw new ProviderError(
        this.provider, 'UNSUPPORTED_MODEL',
        `Model "${resolvedId}" not found in registry`, false
      );
    }

    if (modelConfig.capability !== 'digital_human') {
      throw new ProviderError(
        this.provider, 'CAPABILITY_MISMATCH',
        `Model "${resolvedId}" is not a digital human model`, false
      );
    }

    return modelConfig;
  }

  /**
   * Transfer video from DashScope CDN to project OSS.
   *
   * Uses videoStorageService.downloadAndStore() for the complete flow:
   * download → validate → upload OSS + cover extraction.
   *
   * @param {string} videoUrl    — DashScope temporary video URL
   * @param {number} enterpriseId — Enterprise ID for OSS path
   * @returns {Promise<Object>} Storage result
   */
  async _transferVideo(videoUrl, enterpriseId) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[DigitalHumanProvider] Transferring video to OSS | ` +
        `enterprise=${enterpriseId}`
      );
    }

    try {
      const result = await videoStorageService.downloadAndStore({
        videoUrl,
        enterpriseId,
      });

      return result;
    } catch (storageError) {
      throw new ProviderError(
        this.provider, 'VIDEO_STORAGE_FAILED',
        `Failed to transfer video to OSS: ${storageError.message}`, false
      );
    }
  }
}

module.exports = new AliyunDigitalHumanProvider();
