/**
 * Generation Service — AI 生成编排层
 *
 * Sprint 5.1: 接入阿里云百炼，使用 aliyunProvider 统一接口
 *
 * 职责：
 *   1. 接收生成请求（来自 Controller）
 *   2. 读取 AI Models 配置 → 匹配 AI Model
 *   3. 调用 aliyunProvider（generateImage / generateVideo）→ 创建 AI 任务
 *   4. 保存 GenerationTask 记录
 *
 * ─── Sprint 5.1 新流程 ──────────────────────────
 *   frontend
 *     ↓
 *   controller (videoGenerationController)
 *     ↓
 *   generationService.generateImage() / generateVideo()
 *     ↓
 *   aliyunProvider.generateImage() / generateVideo()
 *     ↓
 *   GenerationTask (DB record)
 *
 * ─── 兼容流程（Sprint 4.6 / 旧 Controller）────────
 *   createGenerationTask(params) — 保持向后兼容
 *
 * 设计原则：
 *   - 业务代码不直接调用 dashscopeService
 *   - 前端只传 templateId，不传具体模型名
 *   - 统一错误处理
 *   - AI 调用日志记录（不含 apiKey / prompt / imageUrl）
 */

const { GenerationTask } = require('../models');
const { providerRouter, aliyunProvider, ProviderError } = require('../providers');
const {
  resolveModelForTemplate,
  getTemplateModelConfig,
  getModelConfig
} = require('../config/ai-model-registry');

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
   * @param {string} [params.model]        — 用户指定模型ID（可选，用于覆盖模板默认模型）
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
      sourceAssetId, duration, model: userModel, options
    } = params;

    // ── 0. 用户指定模型日志 ──────────────────────────────────────
    if (userModel) {
      console.log(`[GenerationService] createGenerationTask userModel override: ${userModel}`);
    }

    // ── 1. 参数校验 ────────────────────────────────────────────
    this._validateInput({ enterpriseId, userId, templateId, prompt });

    // ── 2. 解析模板 → provider + model ─────────────────────────
    const modelConfig = this._resolveTemplate(templateId);
    const { provider, model, modelId, capability, outputType } = modelConfig;

    // ── 2.5. 用户模型覆盖 ─────────────────────────────────────
    let effectiveModel = model;
    let effectiveProvider = provider;

    if (userModel) {
      const userConfig = getModelConfig(userModel);
      if (userConfig) {
        // 校验 capability 一致性
        if (userConfig.capability === capability) {
          effectiveModel = userConfig.apiModelName;
          effectiveProvider = userConfig.provider;
          console.log(
            `[GenerationService] userModel override applied: ` +
            `${userModel} → apiModel=${effectiveModel}, provider=${effectiveProvider}`
          );
        } else {
          console.warn(
            `[GenerationService] userModel capability mismatch: ` +
            `${userModel} (capability=${userConfig.capability}) ` +
            `vs template ${templateId} (capability=${capability}) — ignoring`
          );
        }
      } else {
        console.warn(
          `[GenerationService] userModel not found in registry: ${userModel} — using template default`
        );
      }
    }

    // ── 3. 判断 task_type ──────────────────────────────────────
    const taskType = this._capabilityToTaskType(capability);

    // ── 4. 创建本地 GenerationTask 记录（pending）──────────────
    const localTask = await GenerationTask.create({
      enterprise_id: enterpriseId,
      user_id: userId,
      task_type: taskType,
      model: effectiveModel,
      prompt: prompt.trim(),
      negative_prompt: negativePrompt ? negativePrompt.trim() : null,
      input_url: imageUrl || null,
      input_images: images ? JSON.stringify(images) : null,
      source_asset_id: sourceAssetId || null,
      status: 'pending',
      provider: effectiveProvider,
      duration: duration || null,
      params: options ? JSON.stringify(options) : null,
      progress: 5
    });

    // ── 5. 调用 AI Provider 创建远程任务 ───────────────────────
    //     Sprint 5.1: 使用 aliyunProvider 统一接口
    try {
      let aiResult;
      if (outputType === 'video') {
        aiResult = await aliyunProvider.generateVideo({
          templateId,
          prompt,
          imageUrl,
          images,
          negativePrompt,
          duration,
          model: effectiveModel,
          options
        });
      } else if (outputType === 'image') {
        aiResult = await aliyunProvider.generateImage({
          templateId,
          prompt,
          imageUrl,
          options
        });
      } else {
        // 兜底：使用 providerRouter（兼容未知 outputType）
        aiResult = await providerRouter.createTask({
          templateId,
          prompt,
          imageUrl,
          images,
          negativePrompt,
          duration,
          options
        });
      }

      // ── 6. 同步结果（results 存在）→ 直接完成 ──────────────
      if (aiResult.results && aiResult.results.length > 0) {
        await localTask.update({
          task_id: aiResult.taskId,
          provider: aiResult.provider,
          model: aiResult.model || effectiveModel,
          status: 'success',
          progress: 100,
          output_url: aiResult.results[0].url,
          completed_at: new Date()
        });

        this._logTaskCreated(localTask, aiResult);

        return {
          id: localTask.id,
          taskId: aiResult.taskId,
          provider: aiResult.provider,
          model: aiResult.model || effectiveModel,
          status: 'success',
          results: aiResult.results,
          createdAt: localTask.created_at
        };
      }

      // ── 7. 异步任务（taskId）→ 更新本地任务关联 ─────────────
      await localTask.update({
        task_id: aiResult.taskId,
        provider: aiResult.provider,
        model: aiResult.model || effectiveModel,
        status: aiResult.status,
        progress: 30,
        started_at: new Date()
      });

      // ── 8. 记录 AI 调用日志 ─────────────────────────────────
      this._logTaskCreated(localTask, aiResult);

      return {
        id: localTask.id,
        taskId: aiResult.taskId,
        provider: aiResult.provider,
        model: aiResult.model || effectiveModel,
        status: aiResult.status,
        createdAt: localTask.created_at
      };

    } catch (error) {
      // ── 失败处理：标记本地任务为 failed ──────────────────────
      const errorInfo = this._extractErrorInfo(error);

      // Sprint 5.3: 记录完整错误上下文
      console.error(
        `[GenerationService] createGenerationTask FAILED | ` +
        `localTaskId=${localTask.id} | ` +
        `templateId=${templateId} | ` +
        `provider=${effectiveProvider} | ` +
        `model=${effectiveModel} | ` +
        `errorName=${error.name || 'Unknown'} | ` +
        `errorCode=${errorInfo.code} | ` +
        `errorMessage=${errorInfo.message} | ` +
        `statusCode=${error.statusCode || 'N/A'} | ` +
        `retryable=${errorInfo.retryable} | ` +
        `time=${new Date().toISOString()}`
      );

      await localTask.update({
        status: 'failed',
        error_msg: errorInfo.message,
        progress: 0,
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

  // ─── Sprint 5.1 新增便捷方法 ────────────────────────────────────

  /**
   * generateImage — 图片生成（Sprint 5.1 统一接口）
   *
   * Controller 可直接调用此方法，无需关心底层 Provider 细节。
   *
   * @param {Object} params
   * @param {number} params.enterpriseId   — 企业 ID
   * @param {number} params.userId         — 用户 ID
   * @param {string} params.templateId     — 创作模板 ID
   * @param {string} params.prompt         — 提示词
   * @param {string} [params.imageUrl]     — 输入图片 URL
   * @param {number} [params.sourceAssetId] — 输入素材 Asset ID
   * @param {Object} [params.options]      — 额外参数
   * @returns {Promise<{ id: number, taskId: string, provider: string, model: string, modelId: string, status: string, createdAt: Date }>}
   */
  async generateImage(params) {
    const {
      enterpriseId, userId, templateId, prompt,
      imageUrl, sourceAssetId, options
    } = params;

    // ── 1. 参数校验 ────────────────────────────────────────────
    this._validateInput({ enterpriseId, userId, templateId, prompt });

    // ── 2. 解析模型配置 ─────────────────────────────────────────
    const modelConfig = this._resolveTemplate(templateId);
    if (modelConfig.outputType !== 'image') {
      throw new ProviderError(
        'system', 'TEMPLATE_TYPE_MISMATCH',
        `Template "${templateId}" is not an image generation template`, false
      );
    }

    const { provider, model, modelId, capability } = modelConfig;
    const taskType = this._capabilityToTaskType(capability);

    // ── 3. 创建本地 GenerationTask 记录（pending）──────────────
    const localTask = await GenerationTask.create({
      enterprise_id: enterpriseId,
      user_id: userId,
      task_type: taskType,
      model,
      prompt: prompt.trim(),
      input_url: imageUrl || null,
      source_asset_id: sourceAssetId || null,
      status: 'pending',
      provider,
      params: options ? JSON.stringify(options) : null,
      progress: 5
    });

    // ── 4. 调用 aliyunProvider 创建远程任务 ────────────────────
    try {
      const aiResult = await aliyunProvider.generateImage({
        templateId,
        prompt,
        imageUrl,
        options
      });

      // 同步返回（results 存在）：直接完成任务
      if (aiResult.results && aiResult.results.length > 0) {
        // ── DEBUG(Phase UI-AICreation-02-B-1-G-M-F): 打印同步结果处理 ──
        console.log(
          `[DEBUG-QWEN-IMAGE] GenerationService.generateImage SYNCHRONOUS PATH | ` +
          `aiResult.taskId=${aiResult.taskId} | ` +
          `aiResult.results count=${aiResult.results.length} | ` +
          `aiResult.results[0].url (first 200 chars)=${String(aiResult.results[0].url).substring(0, 200)}`
        );
        // ── DEBUG END ────────────────────────────────────────────────────────────

        await localTask.update({
          task_id: aiResult.taskId,
          provider: aiResult.provider,
          model: aiResult.model || model,
          status: 'success',
          progress: 100,
          output_url: aiResult.results[0].url,
          completed_at: new Date()
        });

        this._logTaskCreated(localTask, aiResult);

        const returnValue = {
          id: localTask.id,
          taskId: aiResult.taskId,
          provider: aiResult.provider,
          model: aiResult.model || model,
          modelId: aiResult.modelId || modelId,
          status: 'success',
          results: aiResult.results,
          createdAt: localTask.created_at
        };

        // ── DEBUG(Phase UI-AICreation-02-B-1-G-M-F): 打印返回给上层的格式 ──
        console.log(
          `[DEBUG-QWEN-IMAGE] GenerationService.generateImage return (sync) | ` +
          `id=${returnValue.id} | ` +
          `taskId=${returnValue.taskId} | ` +
          `hasResults=${!!returnValue.results} | ` +
          `resultsCount=${returnValue.results ? returnValue.results.length : 0} | ` +
          `status=${returnValue.status}`
        );
        // ── DEBUG END ────────────────────────────────────────────────────────────

        return returnValue;
      }

      // 异步返回（taskId）：保持原流程
      await localTask.update({
        task_id: aiResult.taskId,
        provider: aiResult.provider,
        model: aiResult.model || model,
        status: aiResult.status,
        progress: 30,
        started_at: new Date()
      });

      this._logTaskCreated(localTask, aiResult);

      return {
        id: localTask.id,
        taskId: aiResult.taskId,
        provider: aiResult.provider,
        model: aiResult.model || model,
        modelId: aiResult.modelId || modelId,
        status: aiResult.status,
        createdAt: localTask.created_at
      };

    } catch (error) {
      const errorInfo = this._extractErrorInfo(error);
      // Sprint 5.3: 增强日志
      console.error(
        `[GenerationService] generateImage FAILED | ` +
        `localTaskId=${localTask.id} | templateId=${templateId} | ` +
        `errorCode=${errorInfo.code} | statusCode=${error.statusCode || 'N/A'} | ` +
        `time=${new Date().toISOString()}`
      );
      await localTask.update({
        status: 'failed',
        error_msg: errorInfo.message,
        progress: 0,
        completed_at: new Date()
      });
      this._logTaskFailed(localTask, errorInfo);
      throw error;
    }
  }

  /**
   * generateVideo — 视频生成（Sprint 5.1 统一接口）
   *
   * Controller 可直接调用此方法，无需关心底层 Provider 细节。
   *
   * @param {Object} params
   * @param {number} params.enterpriseId    — 企业 ID
   * @param {number} params.userId          — 用户 ID
   * @param {string} params.templateId      — 创作模板 ID
   * @param {string} params.prompt          — 提示词
   * @param {string} [params.imageUrl]      — 输入图片 URL
   * @param {Array}  [params.images]        — 多参考图
   * @param {string} [params.negativePrompt] — 负向提示词
   * @param {number} [params.sourceAssetId] — 输入素材 Asset ID
   * @param {number} [params.duration]      — 视频时长（秒）
   * @param {Object} [params.options]       — 额外参数
   * @returns {Promise<{ id: number, taskId: string, provider: string, model: string, modelId: string, status: string, createdAt: Date }>}
   */
  async generateVideo(params) {
    const {
      enterpriseId, userId, templateId, prompt,
      imageUrl, images, negativePrompt,
      sourceAssetId, duration, options
    } = params;

    // ── 1. 参数校验 ────────────────────────────────────────────
    this._validateInput({ enterpriseId, userId, templateId, prompt });

    // ── 2. 解析模型配置 ─────────────────────────────────────────
    const modelConfig = this._resolveTemplate(templateId);
    if (modelConfig.outputType !== 'video') {
      throw new ProviderError(
        'system', 'TEMPLATE_TYPE_MISMATCH',
        `Template "${templateId}" is not a video generation template`, false
      );
    }

    const { provider, model, modelId, capability } = modelConfig;
    const taskType = this._capabilityToTaskType(capability);

    // ── 3. 创建本地 GenerationTask 记录（pending）──────────────
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
      progress: 5
    });

    // ── 4. 调用 aliyunProvider 创建远程任务 ────────────────────
    try {
      const aiResult = await aliyunProvider.generateVideo({
        templateId,
        prompt,
        imageUrl,
        images,
        negativePrompt,
        duration,
        options
      });

      await localTask.update({
        task_id: aiResult.taskId,
        provider: aiResult.provider,
        model: aiResult.model || model,
        status: aiResult.status,
        progress: 30,
        started_at: new Date()
      });

      this._logTaskCreated(localTask, aiResult);

      return {
        id: localTask.id,
        taskId: aiResult.taskId,
        provider: aiResult.provider,
        model: aiResult.model || model,
        modelId: aiResult.modelId || modelId,
        status: aiResult.status,
        createdAt: localTask.created_at
      };

    } catch (error) {
      const errorInfo = this._extractErrorInfo(error);
      // Sprint 5.3: 增强日志
      console.error(
        `[GenerationService] generateVideo FAILED | ` +
        `localTaskId=${localTask.id} | templateId=${templateId} | ` +
        `errorCode=${errorInfo.code} | statusCode=${error.statusCode || 'N/A'} | ` +
        `time=${new Date().toISOString()}`
      );
      await localTask.update({
        status: 'failed',
        error_msg: errorInfo.message,
        progress: 0,
        completed_at: new Date()
      });
      this._logTaskFailed(localTask, errorInfo);
      throw error;
    }
  }

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
   * 使用 ai-model-registry 统一配置中心解析
   *
   * 优先级：
   *   1. config/ai-model-registry.js（Phase 2-C-1-E 统一注册中心）
   *   2. provider-router 的 resolveTemplateToModel（基于 aliyun/config.js）
   *   3. ai-model-registry 模板兜底
   *
   * @returns {{ provider: string, model: string, modelId: string, capability: string, outputType: string }}
   */
  _resolveTemplate(templateId) {
    // ── 优先使用 ai-models 配置中心（Sprint 5.1）──────────────
    const modelConfig = resolveModelForTemplate(templateId);
    if (modelConfig) {
      return {
        provider: modelConfig.provider,
        model: modelConfig.apiModelName,
        modelId: modelConfig.id,
        capability: modelConfig.capability,
        outputType: modelConfig.outputType
      };
    }

    // ── 回退到 provider-router 映射 ──────────────────────────
    const modelInfo = providerRouter.resolveTemplateToModel(templateId);
    if (modelInfo) {
      const modelCfg = getTemplateModelConfig(templateId);
      const capability = modelCfg ? modelCfg.capability : templateId;
      return {
        provider: modelInfo.provider,
        model: modelInfo.model,
        modelId: templateId,
        capability,
        outputType: modelCfg ? modelCfg.outputType : 'video'
      };
    }

    // ── 最后回退到 ai-model-registry ─────────────────────────
    const modelCfg = getTemplateModelConfig(templateId);
    if (modelCfg) {
      return {
        provider: modelCfg.provider,
        model: modelCfg.apiModelName,
        modelId: templateId,
        capability: modelCfg.capability,
        outputType: modelCfg.outputType
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
