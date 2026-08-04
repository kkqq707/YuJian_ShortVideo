/**
 * Aliyun DashScope API Client
 *
 * Sprint 4.6: AI Provider 架构准备
 *
 * 职责：
 *   对 DashScope HTTP API 的薄封装
 *   仅负责 HTTP 通信、重试、错误脱敏
 *
 * 不负责：
 *   业务逻辑（由 image-provider / video-provider 处理）
 *   数据库操作
 *   模型选择
 *
 * 基于现有 dashscopeService.js 的核心能力，
 * 将其封装为 Provider 专用的 HTTP 客户端。
 */

const dashscopeService = require('../../services/dashscopeService');
const ProviderError = require('../../utils/ProviderError');

class DashScopeClient {
  constructor() {
    this.service = dashscopeService;
    this.provider = 'aliyun';
  }

  // ─── 异步任务创建（图生视频 / 文生视频）─────────────────────────

  /**
   * 创建图生视频异步任务
   *
   * @param {Object} params
   * @param {string} params.imageUrl  — 可访问的图片 URL
   * @param {string} params.prompt    — 正向提示词
   * @param {string} params.model     — 模型名称
   * @param {string} [params.negativePrompt] — 负向提示词
   * @param {number} [params.duration] — 视频时长
   * @param {Object} [params.extraParams]  — 额外参数
   * @returns {Promise<{ taskId: string, provider: string, status: string }>}
   */
  async createImageToVideoTask(params) {
    try {
      const result = await this.service.createImageToVideoTask({
        imageUrl: params.imageUrl,
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
        model: params.model,
        duration: params.duration,
        params: params.extraParams
      });
      return {
        taskId: result.taskId,
        provider: this.provider,
        status: result.status
      };
    } catch (error) {
      throw this._wrapError(error);
    }
  }

  /**
   * 创建文生视频异步任务
   *
   * @param {Object} params
   * @param {string} params.prompt   — 提示词
   * @param {string} params.model    — 模型名称
   * @param {string} [params.size]   — 分辨率
   * @param {number} [params.duration] — 时长
   * @returns {Promise<{ taskId: string, provider: string, status: string }>}
   */
  async createTextToVideoTask(params) {
    try {
      const result = await this.service.submitText2Video({
        prompt: params.prompt,
        model: params.model,
        size: params.size || '1080p',
        duration: params.duration || 5
      });

      if (!result.output?.task_id) {
        throw new ProviderError(
          this.provider, 'MISSING_TASK_ID',
          'DashScope response missing task_id', false
        );
      }

      return {
        taskId: result.output.task_id,
        provider: this.provider,
        status: this.service.normalizeStatus(result.output.task_status || 'PENDING')
      };
    } catch (error) {
      throw this._wrapError(error);
    }
  }

  /**
   * 创建参考生视频异步任务
   *
   * @param {Object} params
   * @param {Array}  params.images   — 参考图列表
   * @param {string} params.prompt   — 提示词
   * @param {string} params.model    — 模型名称
   * @param {number} [params.duration] — 时长
   * @returns {Promise<{ taskId: string, provider: string, status: string }>}
   */
  async createRefToVideoTask(params) {
    try {
      const result = await this.service.submitRef2Video({
        images: params.images,
        prompt: params.prompt,
        model: params.model,
        duration: params.duration || 5
      });

      if (!result.output?.task_id) {
        throw new ProviderError(
          this.provider, 'MISSING_TASK_ID',
          'DashScope response missing task_id', false
        );
      }

      return {
        taskId: result.output.task_id,
        provider: this.provider,
        status: this.service.normalizeStatus(result.output.task_status || 'PENDING')
      };
    } catch (error) {
      throw this._wrapError(error);
    }
  }

  /**
   * 创建文生图异步任务
   *
   * @param {Object} params
   * @param {string} params.prompt  — 提示词
   * @param {string} params.model   — 模型名称
   * @param {string} [params.size]  — 图片尺寸
   * @param {number} [params.n]     — 生成数量
   * @returns {Promise<{ taskId: string, provider: string, status: string }>}
   */
  async createTextToImageTask(params) {
    try {
      const result = await this.service.text2Image({
        prompt: params.prompt,
        model: params.model,
        size: params.size || '1024*1024',
        n: params.n || 1
      });

      if (!result.output?.task_id) {
        throw new ProviderError(
          this.provider, 'MISSING_TASK_ID',
          'DashScope response missing task_id', false
        );
      }

      return {
        taskId: result.output.task_id,
        provider: this.provider,
        status: this.service.normalizeStatus(result.output.task_status || 'PENDING')
      };
    } catch (error) {
      throw this._wrapError(error);
    }
  }

  // ─── 任务状态查询 ──────────────────────────────────────────────

  /**
   * 查询任务状态
   *
   * @param {string} taskId — Provider 任务 ID
   * @returns {Promise<Object>} 标准化状态结果
   */
  async getTaskStatus(taskId) {
    try {
      const result = await this.service.getTaskStatus({ taskId });
      result.provider = this.provider;
      return result;
    } catch (error) {
      throw this._wrapError(error);
    }
  }

  // ─── 任务取消 ──────────────────────────────────────────────────

  /**
   * 取消任务
   *
   * 注意：DashScope 目前不一定支持异步任务取消。
   * 此方法为接口预留，待阿里云提供取消 API 后实现。
   *
   * @param {string} taskId — Provider 任务 ID
   * @returns {Promise<{ cancelled: boolean, message: string }>}
   */
  async cancelTask(taskId) {
    // DashScope 目前不支持异步任务取消 API
    // 此方法为接口预留
    return {
      cancelled: false,
      message: 'DashScope does not currently support task cancellation via API'
    };
  }

  // ─── 积分查询 ──────────────────────────────────────────────────

  /**
   * 获取模型积分单价
   *
   * @param {string} model — 模型名称
   * @returns {Promise<number>}
   */
  async getPointsPerSecond(model) {
    return this.service.getPointsPerSecond(model);
  }

  // ─── 内部方法 ──────────────────────────────────────────────────

  /**
   * 将 dashscopeService 的 sanitizeError 结果包装为 ProviderError
   *
   * Sprint 5.3: 修复双重脱敏导致错误信息丢失
   *
   * 问题：dashscopeService.createImageToVideoTask() 在错误时 throw sanitizeError()
   *       返回的 plain object { statusCode, errorCode, safeMessage, retryable }。
   *       原 _wrapError 对这个 plain object 再次调用 sanitizeError()，
   *       由于 plain object 没有 .body 属性，safeMessage 变为空字符串。
   *
   * 修复：检测已脱敏的 plain object，直接使用，不再二次脱敏。
   *
   * @param {Error|Object} error — 原始错误
   * @returns {ProviderError}
   */
  _wrapError(error) {
    // 如果已经是 ProviderError，直接返回
    if (error instanceof ProviderError) {
      return error;
    }

    // Sprint 5.3: 检测是否已经是 sanitizeError 返回的 plain object
    // 特征：有 safeMessage 和 errorCode 属性，但没有 stack（不是 Error 实例）
    if (error && typeof error === 'object' && !(error instanceof Error) && 'safeMessage' in error) {
      console.error(
        `[DashScopeClient] DashScope API error | ` +
        `statusCode=${error.statusCode || 'N/A'} | ` +
        `code=${error.errorCode || 'N/A'} | ` +
        `message=${error.safeMessage || '(empty)'} | ` +
        `retryable=${error.retryable} | ` +
        `time=${new Date().toISOString()}`
      );
      return ProviderError.fromSafeError(this.provider, error);
    }

    // 原始错误（Error 实例或未知形状），先脱敏再包装
    console.error(
      `[DashScopeClient] Raw error (sanitizing) | ` +
      `type=${error?.constructor?.name || typeof error} | ` +
      `message=${error?.message || '(no message)'} | ` +
      `code=${error?.code || 'N/A'} | ` +
      `statusCode=${error?.statusCode || 'N/A'} | ` +
      `time=${new Date().toISOString()}`
    );

    const safe = this.service.sanitizeError(error);
    return ProviderError.fromSafeError(this.provider, safe);
  }
}

module.exports = new DashScopeClient();
