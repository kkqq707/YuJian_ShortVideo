/**
 * Aliyun DashScope AI Provider
 *
 * Sprint 4.6: AI Provider 架构准备
 *
 * 实现统一的 AIProvider 接口：
 *   - createTask(params)    — 创建 AI 生成任务
 *   - getTaskStatus(taskId) — 查询任务状态
 *   - cancelTask(taskId)    — 取消任务
 *
 * 内部委托给 image-provider 或 video-provider，
 * 根据 templateId 自动选择正确的子 Provider。
 */

const imageProvider = require('./image-provider');
const videoProvider = require('./video-provider');
const { resolveModel, ALIYUN_CONFIG } = require('./config');
const ProviderError = require('../../utils/ProviderError');

class AliyunProvider {
  constructor() {
    this.name = 'aliyun';
    this.displayName = '阿里云百炼 (DashScope)';
    this.imageProvider = imageProvider;
    this.videoProvider = videoProvider;
  }

  /**
   * 创建 AI 生成任务
   *
   * 根据 templateId 自动路由到 image-provider 或 video-provider。
   *
   * @param {Object} params
   * @param {string} params.templateId     — 创作模板 ID（必填）
   * @param {string} params.prompt         — 提示词（必填）
   * @param {string} [params.imageUrl]     — 输入图片 URL
   * @param {Array}  [params.images]       — 多参考图
   * @param {string} [params.negativePrompt] — 负向提示词
   * @param {number} [params.duration]     — 视频时长（秒）
   * @param {Object} [params.options]      — 额外参数
   * @returns {Promise<{ taskId: string, provider: string, model: string, status: string }>}
   */
  async createTask(params) {
    const { templateId } = params;

    // ── 1. 解析模型配置 ─────────────────────────────────────────
    const modelConfig = resolveModel(templateId);
    if (!modelConfig) {
      throw new ProviderError(
        this.name, 'UNSUPPORTED_TEMPLATE',
        `Template "${templateId}" is not supported by Aliyun DashScope`, false
      );
    }

    // ── 2. 按输出类型路由到子 Provider ──────────────────────────
    try {
      let result;
      switch (modelConfig.outputType) {
        case 'video':
          result = await this.videoProvider.createTask(params);
          break;
        case 'image':
          result = await this.imageProvider.createTask(params);
          break;
        default:
          throw new ProviderError(
            this.name, 'UNSUPPORTED_OUTPUT_TYPE',
            `Unsupported output type: ${modelConfig.outputType}`, false
          );
      }

      // ── 3. 记录 AI 调用日志 ──────────────────────────────────
      this._logAICall({
        taskId: result.taskId,
        provider: this.name,
        model: result.model,
        templateId,
        outputType: modelConfig.outputType,
        status: result.status
      });

      return result;
    } catch (error) {
      // 记录失败日志
      if (error instanceof ProviderError) {
        this._logAIError({
          provider: this.name,
          templateId,
          errorCode: error.code,
          errorMessage: error.message
        });
      }
      throw error;
    }
  }

  /**
   * 查询任务状态
   *
   * @param {string} taskId — Provider 任务 ID
   * @returns {Promise<Object>}
   */
  async getTaskStatus(taskId) {
    // 视频和图片的状态查询使用相同 API，委托给 videoProvider
    return this.videoProvider.getTaskStatus(taskId);
  }

  /**
   * 取消任务
   *
   * @param {string} taskId — Provider 任务 ID
   * @returns {Promise<Object>}
   */
  async cancelTask(taskId) {
    return this.videoProvider.cancelTask(taskId);
  }

  /**
   * 根据 templateId 获取模型名称
   *
   * @param {string} templateId
   * @returns {string|null}
   */
  getModelForTemplate(templateId) {
    const config = resolveModel(templateId);
    return config ? config.model : null;
  }

  /**
   * 检查 templateId 是否被此 Provider 支持
   *
   * @param {string} templateId
   * @returns {boolean}
   */
  supportsTemplate(templateId) {
    return resolveModel(templateId) !== null;
  }

  // ─── 内部日志方法 ──────────────────────────────────────────────
  //
  // 记录 AI 调用日志。禁止记录 apiKey。
  // 日志格式：{ taskId, provider, model, templateId, outputType, status, time }

  _logAICall(info) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[AI:${info.provider}] taskId=${info.taskId} | ` +
        `template=${info.templateId} | model=${info.model} | ` +
        `type=${info.outputType} | status=${info.status} | ` +
        `time=${new Date().toISOString()}`
      );
    }
  }

  _logAIError(info) {
    console.error(
      `[AI:${info.provider}] ERROR | template=${info.templateId} | ` +
      `code=${info.errorCode} | message=${info.errorMessage} | ` +
      `time=${new Date().toISOString()}`
    );
  }
}

module.exports = new AliyunProvider();
