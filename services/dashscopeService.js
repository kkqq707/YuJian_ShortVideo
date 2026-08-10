const https = require('https');
const { URL } = require('url');
const { ApiConfig } = require('../models');
const apiKeys = require('../config/api-keys');
const registry = require('../config/ai-model-registry');

// ─── 状态映射表 ────────────────────────────────────────────────
const STATUS_MAP = {
  PENDING: 'pending',
  QUEUED: 'pending',
  RUNNING: 'processing',
  PROCESSING: 'processing',
  SUCCEEDED: 'success',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELED: 'failed',
  CANCELLED: 'failed'
};

// ─── 可重试的状态码和网络错误 ──────────────────────────────────
// Phase UI-AICreation-02-B-1-G-M-B: 429 (Rate Limit) removed from retryable set
// Rationale: retrying 429 with short backoff (500ms/1000ms) amplifies request
// volume 3× without recovering — the rate limit window has not reset.
// 429 is now handled as a non-retryable terminal status, same as 4xx.
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
  'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ERR_SOCKET_BAD_PORT'
]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

// ─── URL 安全摘要（日志用）─────────────────────────────────────
function safeUrlSummary(urlStr) {
  if (!urlStr) return '(empty)';
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.hostname}${u.pathname}${u.search ? '?[...]' : ''}`;
  } catch (_) {
    return '(invalid url)';
  }
}

// ─── API Key 脱敏 ─────────────────────────────────────────────
function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '(unset)';
  if (key.length <= 8) return key.substring(0, 2) + '***';
  return key.substring(0, 4) + '***' + key.substring(key.length - 4);
}

class DashScopeService {
  constructor() {
    this.apiKey = apiKeys.DASHSCOPE_API_KEY || '';
    this.endpoint = apiKeys.DASHSCOPE_ENDPOINT || 'https://dashscope.aliyuncs.com';
    this.defaultModel = apiKeys.DASHSCOPE_VIDEO_MODEL || '';
    this.timeout = parseInt(apiKeys.DASHSCOPE_REQUEST_TIMEOUT) || 30000;
    this.maxRetries = 2;
  }

  // ─── 加载 ApiConfig 中的配置（由 request 内部调用）────────────
  async getConfig() {
    const common = await ApiConfig.getConfig('common');
    if (common) {
      this.apiKey = common.access_key || this.apiKey;
      this.endpoint = common.endpoint || this.endpoint;
    }
    return this;
  }

  // ─── 核心 HTTP 请求（带超时）──────────────────────────────────
  async request(path, data, method = 'POST', extraHeaders = {}) {
    await this.getConfig();

    return new Promise((resolve, reject) => {
      const fullUrl = new URL(path, this.endpoint);
      const body = data ? JSON.stringify(data) : null;

      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        ...extraHeaders
      };

      // Allow extraHeaders to explicitly disable X-DashScope-Async
      // (e.g. qwen-image multimodal-generation is synchronous-only)
      if (headers['X-DashScope-Async'] == null || headers['X-DashScope-Async'] === '') {
        delete headers['X-DashScope-Async'];
      }

      if (body) {
        headers['Content-Length'] = Buffer.byteLength(body, 'utf8');
      }

      const options = {
        hostname: fullUrl.hostname,
        port: fullUrl.port || 443,
        path: fullUrl.pathname + fullUrl.search,
        method,
        headers,
        timeout: this.timeout
      };

      const req = https.request(options, (res) => {
        let bodyChunks = [];
        res.on('data', (chunk) => bodyChunks.push(chunk));
        res.on('end', () => {
          const rawBody = Buffer.concat(bodyChunks).toString('utf8');
          let parsed;
          try {
            parsed = JSON.parse(rawBody);
          } catch (e) {
            parsed = rawBody;
          }
          resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed, rawBody });
        });
      });

      req.setTimeout(this.timeout, () => {
        req.destroy();
        const err = new Error('Request timeout');
        err.code = 'ETIMEDOUT';
        reject(err);
      });

      req.on('error', reject);

      if (body) req.write(body);
      req.end();
    });
  }

  // ─── 带重试的请求 ─────────────────────────────────────────────
  async requestWithRetry(path, data, method = 'POST', extraHeaders = {}) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.request(path, data, method, extraHeaders);
        const statusCode = result.statusCode;

        // Phase UI-AICreation-02-B-1-G-M-B: 429 Rate Limit 专用日志
        // 429 不再重试（已从 RETRYABLE_STATUS_CODES 移除），记录详细日志
        if (statusCode === 429) {
          console.warn(
            `[DashScope] Rate Limit (429) hit | ` +
            `method=${method} | ` +
            `path=${path} | ` +
            `attempt=${attempt + 1}/${this.maxRetries + 1} | ` +
            `time=${new Date().toISOString()}`
          );
          return result;
        }

        // 非可重试状态码，直接返回
        if (NON_RETRYABLE_STATUS_CODES.has(statusCode)) {
          return result;
        }

        // 可重试状态码（5xx），且还有剩余重试次数
        if (RETRYABLE_STATUS_CODES.has(statusCode) && attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 500; // 500ms, 1000ms
          console.log(
            `[DashScope] Retry attempt ${attempt + 1}/${this.maxRetries} ` +
            `for ${method} ${path} after ${statusCode}, waiting ${delay}ms`
          );
          await this._sleep(delay);
          continue;
        }

        return result;
      } catch (error) {
        lastError = error;
        const isRetryableNetworkError = RETRYABLE_ERROR_CODES.has(error.code);

        if (isRetryableNetworkError && attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          console.log(
            `[DashScope] Network retry attempt ${attempt + 1}/${this.maxRetries} ` +
            `for ${method} ${path} after ${error.code}, waiting ${delay}ms`
          );
          await this._sleep(delay);
          continue;
        }

        // 不可重试的网络错误，直接抛
        if (!isRetryableNetworkError) {
          throw this.sanitizeError(error);
        }
      }
    }

    // 重试耗尽
    throw this.sanitizeError(lastError || new Error('Max retries exhausted'));
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ──── 状态标准化 ──────────────────────────────────────────────
  /**
   * 将 DashScope 返回的任务状态映射为项目统一状态。
   *
   * @param {string} providerStatus - DashScope 返回的 output.task_status
   * @returns {string} 项目统一状态：pending | processing | success | failed
   */
  normalizeStatus(providerStatus) {
    if (!providerStatus || typeof providerStatus !== 'string') {
      // 未知或缺失状态：安全策略 —— 返回 pending 而非 success
      console.warn(`[DashScope] normalizeStatus received invalid status: ${providerStatus}`);
      return 'pending';
    }

    const upperStatus = providerStatus.toUpperCase().trim();
    const mapped = STATUS_MAP[upperStatus];

    if (!mapped) {
      // 遇到未在映射表中的状态，记录警告并保守返回 pending
      console.warn(
        `[DashScope] Unknown provider status: "${providerStatus}", ` +
        `falling back to "pending" for safety`
      );
      return 'pending';
    }

    return mapped;
  }

  // ─── 错误脱敏 ─────────────────────────────────────────────────
  /**
   * 统一处理错误对象，移除敏感信息。
   *
   * @param {Error|Object} error - 原始错误
   * @returns {Object} { statusCode, errorCode, safeMessage, retryable }
   */
  sanitizeError(error) {
    const safe = {
      statusCode: null,
      errorCode: null,
      safeMessage: '',
      retryable: false
    };

    if (!error) {
      safe.safeMessage = 'Unknown error';
      return safe;
    }

    // HTTP 响应错误（来自 DashScope API）
    if (error.statusCode) {
      safe.statusCode = error.statusCode;
      safe.retryable = RETRYABLE_STATUS_CODES.has(error.statusCode);

      const body = error.body;
      if (body && typeof body === 'object') {
        safe.errorCode = body.code || body.error_code || null;
        safe.safeMessage = body.message || 'DashScope API error';
      } else if (typeof body === 'string') {
        // 截断，防止过长错误信息
        safe.safeMessage = body.substring(0, 500);
      } else {
        safe.safeMessage = `HTTP ${error.statusCode}`;
      }

      return safe;
    }

    // 网络错误（ECONNRESET, ETIMEDOUT, etc.）
    if (error.code) {
      safe.errorCode = error.code;
      safe.retryable = RETRYABLE_ERROR_CODES.has(error.code);

      const messageMap = {
        'ETIMEDOUT': 'Request timed out',
        'ECONNRESET': 'Connection reset',
        'ECONNREFUSED': 'Connection refused',
        'ENOTFOUND': 'DNS resolution failed',
        'EAI_AGAIN': 'DNS resolution failed (temporary)',
        'EPIPE': 'Broken pipe',
        'ERR_SOCKET_BAD_PORT': 'Invalid port'
      };
      safe.safeMessage = messageMap[error.code] || error.message || 'Network error';

      return safe;
    }

    // 业务逻辑抛出的错误（我们自己的 Error）
    if (error.message) {
      safe.safeMessage = error.message;
      safe.errorCode = error.code || null;
      safe.retryable = RETRYABLE_ERROR_CODES.has(error.code);
      return safe;
    }

    // 完全未知的错误
    safe.safeMessage = 'Unknown error';
    return safe;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Sprint 2.5 Step 3.1 新增标准方法
  // ═══════════════════════════════════════════════════════════════

  // ─── 1. createImageToVideoTask ──────────────────────────────────
  /**
   * 创建图生视频异步任务。
   *
   * @param {Object} opts
   * @param {string} opts.imageUrl    - 可访问的图片 URL（必填）
   * @param {string} opts.prompt      - 正向提示词（必填）
   * @param {string} [opts.negativePrompt] - 负向提示词（可选）
   * @param {string} [opts.model]     - 模型名称，未传时使用 DASHSCOPE_VIDEO_MODEL
   * @param {number} [opts.duration]  - 视频时长（秒）
   * @param {Object} [opts.params]    - 其他模型参数
   * @returns {Promise<Object>} { taskId, provider, providerStatus, status, rawStatus }
   */
  async createImageToVideoTask({ imageUrl, prompt, negativePrompt, model, duration, params = {} } = {}) {
    // ── 参数校验 ──────────────────────────────────────────────
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      throw Object.assign(new Error('imageUrl is required and must be a non-empty string'), {
        code: 'INVALID_IMAGE_URL'
      });
    }

    // 必须是 http/https
    if (!/^https?:\/\//i.test(imageUrl.trim())) {
      throw Object.assign(new Error('imageUrl must be an http or https URL, got: ' + safeUrlSummary(imageUrl)), {
        code: 'INVALID_IMAGE_URL_SCHEME'
      });
    }

    // 拒绝本地路径
    if (/^(file:\/\/|[a-zA-Z]:\\|\/)/.test(imageUrl.trim())) {
      throw Object.assign(new Error('imageUrl must be a remote URL, not a local path'), {
        code: 'INVALID_IMAGE_URL_LOCAL'
      });
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw Object.assign(new Error('prompt is required'), {
        code: 'INVALID_PROMPT'
      });
    }

    // ── 模型解析 ──────────────────────────────────────────────
    const resolvedModel = model || this.defaultModel;
    if (!resolvedModel) {
      throw Object.assign(
        new Error('No model specified. Set DASHSCOPE_VIDEO_MODEL env var or pass model parameter.'),
        { code: 'MODEL_NOT_CONFIGURED' }
      );
    }

    // ── 组装请求体 ───────────────────────────────────────────
    // happyhorse 系列模型使用 input.media 格式，其他模型使用 input.img_url
    const happyhorseI2vModelName = registry.getApiModelName('wan2.1-i2v');
    const isHappyhorse = resolvedModel === happyhorseI2vModelName;

    const requestBody = {
      model: resolvedModel,
      input: {
        prompt: prompt.trim()
      },
      parameters: {}
    };

    if (isHappyhorse) {
      requestBody.input.media = [
        { type: 'first_frame', url: imageUrl.trim() }
      ];
    } else {
      requestBody.input.img_url = imageUrl.trim();
    }

    if (negativePrompt) {
      requestBody.input.negative_prompt = negativePrompt.trim();
    }

    // wan2.1-i2v 使用 resolution 而非 duration
    // 默认 720P，支持 480P / 720P
    if (duration) {
      requestBody.parameters.duration = parseInt(duration) || 5;
    }

    // params 中的额外参数合并到 parameters
    const knownParamKeys = ['resolution', 'ratio', 'seed', 'fps', 'camera', 'motion', 'size', 'duration'];
    for (const key of knownParamKeys) {
      if (params[key] !== undefined && params[key] !== null) {
        requestBody.parameters[key] = params[key];
      }
    }

    // 非标准参数也透传（如 future_params）
    for (const [key, value] of Object.entries(params)) {
      if (!knownParamKeys.includes(key) && value !== undefined && value !== null) {
        requestBody.parameters[key] = value;
      }
    }

    // 清理空 parameters
    if (Object.keys(requestBody.parameters).length === 0) {
      delete requestBody.parameters;
    }

    // ── 日志（始终输出，不限于 development）────────────────────
    //    记录请求摘要，不记录完整 prompt 和 imageUrl（隐私保护）
    const apiPath = '/api/v1/services/aigc/video-generation/video-synthesis';
    console.log(
      `[DashScope] createImageToVideoTask REQUEST | ` +
      `model=${resolvedModel} | ` +
      `endpoint=${apiPath} | ` +
      `image=${safeUrlSummary(imageUrl)} | ` +
      `prompt_len=${prompt.length} | ` +
      `has_negative=${!!negativePrompt} | ` +
      `duration=${duration || 'N/A'} | ` +
      `params_keys=${Object.keys(params).join(',') || '(none)'} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 打印最终请求体（验证用）────────────────────────────────
    console.log(
      `[DashScope] Final request body:\n${JSON.stringify(requestBody, null, 2)}`
    );

    // ── 调用 API ──────────────────────────────────────────────
    const result = await this.requestWithRetry(
      apiPath,
      requestBody,
      'POST'
    );

    const body = result.body;

    // ── Sprint 5.3: 记录响应摘要 ──────────────────────────────
    console.log(
      `[DashScope] createImageToVideoTask RESPONSE | ` +
      `httpStatus=${result.statusCode} | ` +
      `hasBody=${!!body} | ` +
      `bodyType=${body ? typeof body : 'null'} | ` +
      `hasCode=${!!(body && body.code)} | ` +
      `hasOutput=${!!(body && body.output)} | ` +
      `hasTaskId=${!!(body && body.output && body.output.task_id)} | ` +
      `taskStatus=${body && body.output ? body.output.task_status || 'N/A' : 'N/A'} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 解析响应 ──────────────────────────────────────────────
    if (!body || typeof body !== 'object') {
      // Sprint 5.3: 记录原始响应内容
      console.error(
        `[DashScope] Non-JSON response | ` +
        `httpStatus=${result.statusCode} | ` +
        `rawBody=${typeof result.rawBody === 'string' ? result.rawBody.substring(0, 1000) : String(result.rawBody).substring(0, 1000)}`
      );
      throw this.sanitizeError({
        statusCode: result.statusCode,
        body: body,
        message: 'DashScope returned non-JSON response'
      });
    }

    // DashScope 业务错误（code 不为空表示失败）
    if (body.code) {
      // Sprint 5.3: 记录 DashScope 返回的完整错误信息
      console.error(
        `[DashScope] API business error | ` +
        `httpStatus=${result.statusCode} | ` +
        `code=${body.code} | ` +
        `message=${body.message || '(no message)'} | ` +
        `request_id=${body.request_id || 'N/A'} | ` +
        `rawResponse=${JSON.stringify(body).substring(0, 2000)}`
      );
      const err = new Error(body.message || 'DashScope API error');
      err.statusCode = result.statusCode;
      err.body = body;
      throw this.sanitizeError(err);
    }

    // 提取 task_id
    const taskId = body.output?.task_id;
    if (!taskId) {
      // Sprint 5.3: 记录缺失 task_id 的完整响应
      console.error(
        `[DashScope] Missing task_id in response | ` +
        `httpStatus=${result.statusCode} | ` +
        `rawResponse=${JSON.stringify(body).substring(0, 2000)}`
      );
      const err = new Error('DashScope response missing output.task_id');
      err.statusCode = result.statusCode;
      err.body = body;
      throw this.sanitizeError(err);
    }

    const providerStatus = body.output.task_status || 'PENDING';
    const normalizedStatus = this.normalizeStatus(providerStatus);

    return {
      taskId,
      provider: 'dashscope',
      providerStatus,
      status: normalizedStatus,
      rawStatus: providerStatus
    };
  }

  // ─── 2. getTaskStatus ──────────────────────────────────────────
  /**
   * 查询 DashScope 异步任务状态。
   *
   * 兼容两种调用方式：
   *   - 新签名：getTaskStatus({ taskId: 'xxx' })
   *   - 旧签名：getTaskStatus('xxx')  （向后兼容）
   *
   * @param {string|Object} taskIdOrOpts - taskId 字符串或 { taskId } 对象
   * @returns {Promise<Object>} 标准化状态结果
   */
  async getTaskStatus(taskIdOrOpts) {
    // ── 兼容旧调用方式 ────────────────────────────────────────
    let taskId;
    if (typeof taskIdOrOpts === 'string') {
      taskId = taskIdOrOpts;
      // Sprint 3.2 待清理：Controller 直接传字符串
    } else if (taskIdOrOpts && typeof taskIdOrOpts === 'object') {
      taskId = taskIdOrOpts.taskId;
    }

    // ── 参数校验 ──────────────────────────────────────────────
    if (!taskId || typeof taskId !== 'string' || !taskId.trim()) {
      throw Object.assign(new Error('taskId is required'), {
        code: 'INVALID_TASK_ID'
      });
    }

    // ── 日志（脱敏）───────────────────────────────────────────
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DashScope] getTaskStatus | taskId=${taskId}`);
    }

    // ── 调用 API ──────────────────────────────────────────────
    const result = await this.requestWithRetry(
      `/api/v1/tasks/${taskId.trim()}`,
      null,
      'GET'
    );

    const body = result.body;

    // ── 解析响应 ──────────────────────────────────────────────
    if (!body || typeof body !== 'object') {
      throw this.sanitizeError({
        statusCode: result.statusCode,
        body: body,
        message: 'DashScope returned non-JSON response for task status'
      });
    }

    if (body.code) {
      const err = new Error(body.message || 'DashScope task status query error');
      err.statusCode = result.statusCode;
      err.body = body;
      throw this.sanitizeError(err);
    }

    const providerStatus = body.output?.task_status || null;
    const normalizedStatus = this.normalizeStatus(providerStatus);

    // ── 进度映射策略 ──────────────────────────────────────────
    // DashScope 不提供真实百分比进度，使用稳定映射：
    //   pending → 0, processing → null, success → 100, failed → 100
    let progress = null;
    if (normalizedStatus === 'pending') {
      progress = 0;
    } else if (normalizedStatus === 'success' || normalizedStatus === 'failed') {
      progress = 100;
    }
    // processing → null（无可靠进度数据）

    // ── 构建标准化返回 ────────────────────────────────────────
    const response = {
      taskId: taskId.trim(),
      provider: 'dashscope',
      providerStatus: providerStatus,
      status: normalizedStatus,
      progress,
      outputUrl: body.output?.video_url || body.output?.url || null,
      coverUrl: body.output?.cover_url || null,
      duration: body.usage?.duration || body.output?.duration || null,
      errorCode: body.output?.error_code || body.code || null,
      errorMessage: body.output?.message || body.message || null
    };

    // 清理 null 字段（可选，保持输出干净）
    // 注意：不清理，保持字段存在性一致

    return response;
  }

  // ═══════════════════════════════════════════════════════════════
  //  向后兼容方法（Sprint 3.2 将清理）
  // ═══════════════════════════════════════════════════════════════

  /**
   * Backward compat: 文生视频
   * @deprecated Sprint 3.2 将迁移至统一 createTask 接口
   */
  async submitText2Video({ prompt, model, size, duration } = {}) {
    const resolvedModel = model || registry.getApiModelName('wan2.1-t2v');
    const body = {
      model: resolvedModel,
      input: { prompt: prompt || '' },
      parameters: {
        size: size || '1080p',
        duration: duration || 5
      }
    };

    if (process.env.NODE_ENV === 'development') {
      console.log(`[DashScope] submitText2Video (compat) | model=${resolvedModel}`);
    }

    const result = await this.requestWithRetry(
      '/api/v1/services/aigc/video-generation/video-synthesis',
      body,
      'POST'
    );
    return result.body;
  }

  /**
   * Backward compat: 图生视频
   * @deprecated Sprint 3.2 将迁移至 createImageToVideoTask
   */
  async submitImage2Video({ imageUrl, prompt, model, duration } = {}) {
    // 委托给新方法，但返回原始 DashScope 响应（兼容旧 Controller）
    const stdResult = await this.createImageToVideoTask({
      imageUrl,
      prompt,
      model,
      duration
    });

    // 包装为兼容格式（Controller 期望 result.output.task_id）
    return {
      output: {
        task_id: stdResult.taskId,
        task_status: stdResult.providerStatus
      }
    };
  }

  /**
   * Backward compat: 参考生视频（核心功能）
   * @deprecated Sprint 3.2 将迁移
   */
  async submitRef2Video({ images, prompt, model, duration } = {}) {
    const resolvedModel = model || registry.getApiModelName('wan2.1-i2v');
    const body = {
      model: resolvedModel,
      input: { prompt: prompt || '', images },
      parameters: { duration: duration || 5 }
    };

    if (process.env.NODE_ENV === 'development') {
      console.log(`[DashScope] submitRef2Video (compat) | model=${resolvedModel}`);
    }

    const result = await this.requestWithRetry(
      '/api/v1/services/aigc/video-generation/video-synthesis',
      body,
      'POST'
    );
    return result.body;
  }

  /**
   * Backward compat: 数字人口播
   * @deprecated Sprint 3.2 将迁移
   */
  async submitDigitalHuman({ imageUrl, text, voice } = {}) {
    const body = {
      model: registry.getApiModelName('wanx-digital-human'),
      input: {
        image_url: imageUrl,
        text: text || '',
        voice: voice || 'zhiyan_emo'
      }
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('[DashScope] submitDigitalHuman (compat)');
    }

    const result = await this.requestWithRetry(
      '/api/v1/services/aigc/video-generation/digital-human',
      body,
      'POST'
    );
    return result.body;
  }

  /**
   * Backward compat: 文生图片
   * @deprecated Sprint 3.2 将迁移
   */
  async text2Image({ prompt, model, size, n } = {}) {
    const body = {
      model: model || registry.getApiModelName('qwen-image'),
      input: { prompt: prompt || '' },
      parameters: {
        size: size || '1024*1024',
        n: n || 1
      }
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('[DashScope] text2Image (compat)');
    }

    const result = await this.requestWithRetry(
      '/api/v1/services/aigc/text2image/image-synthesis',
      body,
      'POST'
    );
    return result.body;
  }

  /**
   * Backward compat: 获取模型积分单价
   *
   * Sprint 4.4 Patch3: 更新为新阿里云百炼模型定价
   */
  async getPointsPerSecond(model) {
    const pricing = await ApiConfig.getConfig('model_pricing') || {};
    return pricing[model] || 8; // 默认8积分/秒
  }

  /**
   * 根据创作模板 capability 解析模型
   *
   * Sprint 4.4 Patch3: 新增模板解析方法
   *
   * @param {string} templateId - 创作模板 ID
   * @returns {{ model: string, provider: string }|null}
   */
  resolveModelFromTemplate(templateId) {
    try {
      const { getTemplateModelConfig } = require('../config/ai-model-registry');
      const modelCfg = getTemplateModelConfig(templateId);
      if (!modelCfg) return null;
      return {
        model: modelCfg.apiModelName,
        provider: modelCfg.provider,
        capability: modelCfg.capability
      };
    } catch (_) {
      return null;
    }
  }
}

module.exports = new DashScopeService();
