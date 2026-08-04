/**
 * Generation Service — AI 生成编排层
 *
 * Sprint 4.6: AI Provider 架构准备
 *
 * 职责：
 *   1. 接收生成请求
 *   2. 读取 Creative Template → 匹配 AI Model
 *   3. 调用 Provider Router → 创建 AI 任务
 *   4. 保存 GenerationTask 记录
 *
 * 流程：
 *   createGenerationTask(params)
 *     ↓
 *   resolveTemplate(templateId)        — 解析模板 → provider + model
 *     ↓
 *   resolveProvider(providerName)      — 获取 Provider 实例
 *     ↓
 *   provider.createTask(params)        — 调用 AI Provider
 *     ↓
 *   saveTask(taskData)                 — 持久化 GenerationTask
 *
 * 设计原则：
 *   - 业务代码不直接调用 dashscopeService
 *   - 前端只传 templateId，不传具体模型名
 *   - 统一错误处理
 *   - AI 调用日志记录
 */

const { GenerationTask } = require('../models');
const { providerRouter, ProviderError } = require('../providers');
const {
  getTemplateById
} = require('../config/creativeTemplates');

class GenerationService {
  /**
   * 创建 AI 生成任务（完整流程）
   *
   * @param {Object} params
   * @param {number} params.enterpriseId   — 企业 ID
   * @param {number} params.userId         — 用户 ID
   * @param {string} params.templateId     — 创作模板 ID（如 'image_to_video'）
   * @param {string} params.prompt         — 提示词
   * @param {string} [params.negativePrompt] — 负向提示词
   * @param {string} [params.imageUrl]     — 输入图片 URL
   * @param {Array}  [params.images]       — 多参考图
   * @param {number} [params.sourceAssetId] — 输入素材 Asset ID
   * @param {number} [params.duration]     — 视频时长（秒）
   * @param {Object} [params.options]      — 额外参数
   * @returns {Promise<{
   *   id: number,
   *   taskId: string,
   *   provider: string,
   *   model: string,
   *   status: string,
   *   createdAt: Date
   * }>}
   */
  async createGenerationTask(params) {
    const {
      enterpriseId, userId, templateId, prompt,
      negativePrompt, imageUrl, images,
      sourceAssetId, duration, options
    } = params;

    // ── 1. 参数校验 ────────────────────────────────────────────
    this._validateInput({ enterpriseId, userId, templateId, prompt });

    // ── 2. 解析模板 → provider + model ─────────────────────────
    const resolved = this._resolveTemplate(templateId);
    const { provider, model, capability } = resolved;

    // ── 3. 判断 task_type ──────────────────────────────────────
    const taskType = this._capabilityToTaskType(capability);

    // ── 4. 创建本地 GenerationTask 记录（pending）──────────────
    const localTask = await GenerationTask.create({
      enterprise_id: enterpriseId,
      user_id: userId,
      task_type: taskType,
      model,
      prompt: prompt.trim(),
      negative_prompt: negativePrompt ? negativePrompt.trim() : null,
      input_url: imageUrl || null,
      input_images: images ? JSON.stringify(images) : null,
      source_asset_id: sourceAssetId || null,
      status: 'pending',
      provider,
      duration: duration || null,
      params: options ? JSON.stringify(options) : null,
      progress: 0
    });

    // ── 5. 调用 AI Provider 创建远程任务 ───────────────────────
    try {
      const aiResult = await providerRouter.createTask({
        templateId,
        prompt,
        imageUrl,
        images,
        negativePrompt,
        duration,
        options
      });

      // ── 6. 更新本地任务（关联 provider task ID）──────────────
      await localTask.update({
        task_id: aiResult.taskId,
        provider: aiResult.provider,
        model: aiResult.model || model,
        status: aiResult.status,
        started_at: new Date()
      });

      // ── 7. 记录 AI 调用日志 ─────────────────────────────────
      this._logTaskCreated(localTask, aiResult);

      return {
        id: localTask.id,
        taskId: aiResult.taskId,
        provider: aiResult.provider,
        model: aiResult.model || model,
        status: aiResult.status,
        createdAt: localTask.created_at
      };

    } catch (error) {
      // ── 失败处理：标记本地任务为 failed ──────────────────────
      const errorInfo = this._extractErrorInfo(error);

      await localTask.update({
        status: 'failed',
        error_msg: errorInfo.message,
        completed_at: new Date()
      });

      this._logTaskFailed(localTask, errorInfo);

      // 重新抛出，让上层 Controller 处理
      throw error;
    }
  }

  /**
   * 查询任务状态（通过 Provider）
   *
   * @param {string} providerName — Provider 名称
   * @param {string} taskId       — Provider 任务 ID
   * @returns {Promise<Object>}
   */
  async getTaskStatus(providerName, taskId) {
    return providerRouter.getTaskStatus(providerName, taskId);
  }

  /**
   * 取消任务
   *
   * @param {string} providerName — Provider 名称
   * @param {string} taskId       — Provider 任务 ID
   * @returns {Promise<Object>}
   */
  async cancelTask(providerName, taskId) {
    return providerRouter.cancelTask(providerName, taskId);
  }

  /**
   * 根据 templateId 解析 provider + model
   *
   * @param {string} templateId
   * @returns {{ provider: string, model: string, capability: string }}
   */
  resolveTemplateToModel(templateId) {
    return this._resolveTemplate(templateId);
  }

  // ─── 私有方法 ──────────────────────────────────────────────────

  /**
   * 输入参数校验
   */
  _validateInput({ enterpriseId, userId, templateId, prompt }) {
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }
    if (!userId) {
      throw new ProviderError('system', 'VALIDATION', 'User ID is required', false);
    }
    if (!templateId || typeof templateId !== 'string') {
      throw new ProviderError('system', 'VALIDATION', 'Template ID is required', false);
    }
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new ProviderError('system', 'VALIDATION', 'Prompt is required', false);
    }
    if (prompt.trim().length > 2000) {
      throw new ProviderError('system', 'VALIDATION', 'Prompt must not exceed 2000 characters', false);
    }
  }

  /**
   * 解析创作模板
   *
   * 优先级：
   *   1. provider-router 的 resolveTemplateToModel（基于 aliyun/config.js）
   *   2. creativeTemplates 配置（兜底）
   *
   * @returns {{ provider: string, model: string, capability: string }}
   */
  _resolveTemplate(templateId) {
    // 优先使用 provider-router 的映射
    const modelInfo = providerRouter.resolveTemplateToModel(templateId);
    if (modelInfo) {
      // 获取 capability
      const template = getTemplateById(templateId);
      const capability = template ? template.capability : templateId;
      return {
        provider: modelInfo.provider,
        model: modelInfo.model,
        capability
      };
    }

    // 回退到 creativeTemplates
    const template = getTemplateById(templateId);
    if (template) {
      return {
        provider: template.provider,
        model: template.model,
        capability: template.capability
      };
    }

    throw new ProviderError(
      'system', 'UNSUPPORTED_TEMPLATE',
      `No model mapping found for template: ${templateId}`, false
    );
  }

  /**
   * capability → task_type 映射
   */
  _capabilityToTaskType(capability) {
    const map = {
      'image_generation': 'text2image',
      'image_edit': 'text2image',
      'image_to_video': 'image2video',
      'text_to_video': 'text2video'
    };
    return map[capability] || 'image2video';
  }

  /**
   * 从错误对象提取安全错误信息
   */
  _extractErrorInfo(error) {
    if (error instanceof ProviderError) {
      return {
        code: error.code,
        message: `[${error.code}] ${error.message}`,
        retryable: error.retryable
      };
    }

    return {
      code: 'UNKNOWN',
      message: error.message || 'Unknown error',
      retryable: false
    };
  }

  // ─── 日志方法（禁止记录 apiKey）─────────────────────────────────

  _logTaskCreated(localTask, aiResult) {
    console.log(
      `[GenerationService] Task created | ` +
      `id=${localTask.id} | providerTaskId=${aiResult.taskId} | ` +
      `provider=${aiResult.provider} | model=${aiResult.model || localTask.model} | ` +
      `template=${localTask.task_type} | status=${aiResult.status} | ` +
      `time=${new Date().toISOString()}`
    );
    // 注意：不记录 apiKey、prompt、imageUrl
  }

  _logTaskFailed(localTask, errorInfo) {
    console.error(
      `[GenerationService] Task failed | ` +
      `id=${localTask.id} | provider=${localTask.provider} | ` +
      `model=${localTask.model} | code=${errorInfo.code} | ` +
      `message=${errorInfo.message} | ` +
      `time=${new Date().toISOString()}`
    );
  }
}

module.exports = new GenerationService();
