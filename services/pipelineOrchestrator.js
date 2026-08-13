/**
 * Pipeline Orchestrator — 数字人流水线编排层
 *
 * Phase DigitalHuman-Rebuild-004 Step4-D3
 *
 * 职责：
 *   1. 编排四阶段流水线：Vision → Script → TTS → DigitalHuman
 *   2. 管理状态流转：pending → running → vision → script → tts → digital_human → success
 *   3. 调用 generationService 执行各层 AI 生成
 *   4. 通过 pipelineTaskService 管理任务生命周期
 *
 * 依赖：
 *   - generationService     — AI 生成方法
 *   - pipelineTaskService    — PipelineTask CRUD
 *   - pipelineAssetService   — Asset 持久化（Step4-D5 新增）
 *
 * 禁止范围：
 *   ❌ Provider / Model / Controller / Route 直接调用
 *   ❌ OSS 操作
 *   ❌ DH 任务轮询
 *   ❌ 队列 / 锁 / 并发控制（Deferred to later phase）
 *   ❌ 数据库事务（由 Service 层处理）
 *
 * 设计原则：
 *   - 串行执行四阶段，前一阶段输出作为后一阶段输入
 *   - 任何阶段失败立即标记 failed 并终止
 *   - 结构化日志，禁止输出敏感信息
 */

const generationService = require('./generationService');
const pipelineTaskService = require('./pipelineTaskService');
const pipelineAssetService = require('./pipelineAssetService');
const pipelineObservabilityService = require('./pipelineObservabilityService');
const { PipelineTask } = require('../models');

// 关键节点事件名（唯一事实来源）
const { EVENTS } = pipelineObservabilityService;

class PipelineOrchestrator {
  /**
   * 执行完整流水线
   *
   * 状态流转：
   *   pending → running → vision → script → tts → digital_human → success
   *
   * 失败：
   *   任意阶段 → failed（通过 pipelineTaskService.markFailed）
   *
   * @param {number} pipelineId   — PipelineTask 主键 ID
   * @param {number} enterpriseId — 企业 ID（隔离校验）
   * @returns {Promise<{ status: string, results: Object }>}
   */
  async executePipeline(pipelineId, enterpriseId) {
    const startTime = Date.now();

    console.log(
      `[PipelineOrchestrator] executePipeline START | ` +
      `pipelineId=${pipelineId} | enterpriseId=${enterpriseId} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 1. 读取 PipelineTask ────────────────────────────────────────
    const task = await pipelineTaskService.getPipelineTask(pipelineId, enterpriseId);
    if (!task) {
      const errMsg = `PipelineTask id=${pipelineId} not found for enterpriseId=${enterpriseId}`;
      console.error(`[PipelineOrchestrator] ${errMsg}`);
      throw new Error(errMsg);
    }

    console.log(
      `[PipelineOrchestrator] PipelineTask loaded | ` +
      `pipelineId=${pipelineId} | currentStatus=${task.status} | ` +
      `userId=${task.user_id}`
    );

    // Step4-F2: 记录 PIPELINE_CREATED 关键节点（仅记录，失败不影响主流程）
    this._recordNode(pipelineId, EVENTS.PIPELINE_CREATED, {
      enterpriseId,
      initialStatus: task.status
    });

    // ── 2. 解析输入参数 ─────────────────────────────────────────────
    let inputParams;
    try {
      inputParams = typeof task.input_params === 'string'
        ? JSON.parse(task.input_params)
        : (task.input_params || {});
    } catch (parseError) {
      console.error(
        `[PipelineOrchestrator] input_params parse FAILED | ` +
        `pipelineId=${pipelineId} | error=${parseError.message}`
      );
      inputParams = {};
    }

    // ── 3. 状态：pending → running ──────────────────────────────────
    await pipelineTaskService.updateStatus(pipelineId, 'running', {
      started_at: new Date(),
      current_layer: 'vision'
    });
    await pipelineTaskService.updateProgress(pipelineId, 5);

    console.log(
      `[PipelineOrchestrator] Status: pending → running | ` +
      `pipelineId=${pipelineId}`
    );

    try {
      // ── 4. 串行执行四阶段 ──────────────────────────────────────────

      // Layer 1: Vision
      const visionResult = await this.executeVision(pipelineId, task, inputParams);

      // Layer 2: Script
      const scriptResult = await this.executeScript(pipelineId, task, inputParams, visionResult);

      // Layer 3: TTS
      const ttsResult = await this.executeTTS(pipelineId, task, inputParams, scriptResult);

      // Layer 4: DigitalHuman
      const dhResult = await this.executeDigitalHuman(pipelineId, task, inputParams, ttsResult);

      // ── 5. 成功 ───────────────────────────────────────────────────
      await pipelineTaskService.updateStatus(pipelineId, 'success', {
        completed_at: new Date()
      });
      await pipelineTaskService.updateProgress(pipelineId, 100);

      const elapsedMs = Date.now() - startTime;

      console.log(
        `[PipelineOrchestrator] executePipeline SUCCESS | ` +
        `pipelineId=${pipelineId} | elapsedMs=${elapsedMs} | ` +
        `time=${new Date().toISOString()}`
      );

      return {
        status: 'success',
        pipelineId,
        results: {
          vision: visionResult,
          script: scriptResult,
          tts: ttsResult,
          dh: dhResult
        }
      };

    } catch (error) {
      // 失败已在各层方法中通过 markFailed 处理，此处确保终止
      const elapsedMs = Date.now() - startTime;

      console.error(
        `[PipelineOrchestrator] executePipeline FAILED | ` +
        `pipelineId=${pipelineId} | elapsedMs=${elapsedMs} | ` +
        `time=${new Date().toISOString()}`
      );

      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Layer 1: Vision — 视觉理解
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 执行 Vision 阶段
   *
   * 调用 generationService.generateVision() 分析图片内容。
   *
   * @param {number} pipelineId   — PipelineTask 主键 ID
   * @param {Object} task         — PipelineTask instance
   * @param {Object} inputParams  — 解析后的输入参数
   * @returns {Promise<Object>}   — Vision 分析结果
   */
  async executeVision(pipelineId, task, inputParams) {
    const layer = 'vision';

    console.log(
      `[PipelineOrchestrator] Layer START | ` +
      `pipelineId=${pipelineId} | layer=${layer} | ` +
      `time=${new Date().toISOString()}`
    );

    // Step4-F2: 记录 VISION_STARTED 关键节点（仅记录，失败不影响主流程）
    this._recordNode(pipelineId, EVENTS.VISION_STARTED, { layer });

    try {
      // ── 1. 更新状态为 vision ─────────────────────────────────────
      await pipelineTaskService.updateStatus(pipelineId, 'vision', {
        current_layer: layer
      });

      // ── 2. 调用 generationService.generateVision ─────────────────
      const visionParams = {
        enterpriseId: task.enterprise_id,
        userId: task.user_id,
        imageUrl: inputParams.image_url,
        prompt: inputParams.vision_prompt,
        images: inputParams.images,
        modelId: inputParams.vision_model_id
      };

      const result = await generationService.generateVision(visionParams);

      // ── 3. 保存中间结果（含 generationTaskId） ──────────────────
      const intermediateData = {
        ...result,
        generationTaskId: result.id,
        completedAt: new Date().toISOString()
      };

      await pipelineTaskService.saveIntermediateResult(pipelineId, layer, intermediateData);

      // ── 4. 更新进度 ──────────────────────────────────────────────
      await pipelineTaskService.updateProgress(pipelineId, 25);

      console.log(
        `[PipelineOrchestrator] Layer SUCCESS | ` +
        `pipelineId=${pipelineId} | layer=${layer} | ` +
        `generationTaskId=${result.id} | ` +
        `time=${new Date().toISOString()}`
      );

      return intermediateData;

    } catch (error) {
      const errorMsg = error.message || 'Unknown vision error';

      console.error(
        `[PipelineOrchestrator] Layer FAILED | ` +
        `pipelineId=${pipelineId} | layer=${layer} | ` +
        `time=${new Date().toISOString()}`
      );

      await pipelineTaskService.markFailed(pipelineId, layer, errorMsg);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Layer 2: Script — 口播脚本生成
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 执行 Script 阶段
   *
   * 调用 generationService.generateScript() 生成带货口播脚本。
   * 使用 Vision 阶段结果作为上下文输入。
   *
   * @param {number} pipelineId   — PipelineTask 主键 ID
   * @param {Object} task         — PipelineTask instance
   * @param {Object} inputParams  — 解析后的输入参数
   * @param {Object} visionResult — Vision 阶段输出
   * @returns {Promise<Object>}   — 脚本生成结果
   */
  async executeScript(pipelineId, task, inputParams, visionResult) {
    const layer = 'script';

    console.log(
      `[PipelineOrchestrator] Layer START | ` +
      `pipelineId=${pipelineId} | layer=${layer} | ` +
      `time=${new Date().toISOString()}`
    );

    // Step4-F2: 记录 SCRIPT_STARTED 关键节点（仅记录，失败不影响主流程）
    this._recordNode(pipelineId, EVENTS.SCRIPT_STARTED, { layer });

    try {
      // ── 1. 更新状态为 script ─────────────────────────────────────
      await pipelineTaskService.updateStatus(pipelineId, 'script', {
        current_layer: layer
      });

      // ── 2. 调用 generationService.generateScript ─────────────────
      const scriptParams = {
        enterpriseId: task.enterprise_id,
        userId: task.user_id,
        visionResult: {
          visualDesc: visionResult.visualDesc,
          features: visionResult.features,
          tags: visionResult.tags,
          sellingPoints: visionResult.sellingPoints,
          ocrTexts: visionResult.ocrTexts
        },
        theme: inputParams.theme,
        style: inputParams.script_style || inputParams.style,
        duration: inputParams.target_duration || inputParams.duration,
        productName: inputParams.product_name,
        modelId: inputParams.script_model_id
      };

      const result = await generationService.generateScript(scriptParams);

      // ── 3. 保存中间结果（含 generationTaskId） ──────────────────
      const intermediateData = {
        ...result,
        generationTaskId: result.id,
        completedAt: new Date().toISOString()
      };

      await pipelineTaskService.saveIntermediateResult(pipelineId, layer, intermediateData);

      // ── 4. 更新进度 ──────────────────────────────────────────────
      await pipelineTaskService.updateProgress(pipelineId, 50);

      console.log(
        `[PipelineOrchestrator] Layer SUCCESS | ` +
        `pipelineId=${pipelineId} | layer=${layer} | ` +
        `generationTaskId=${result.id} | ` +
        `estimatedDuration=${result.estimatedDuration}s | ` +
        `totalWords=${result.totalWords} | ` +
        `time=${new Date().toISOString()}`
      );

      return intermediateData;

    } catch (error) {
      const errorMsg = error.message || 'Unknown script error';

      console.error(
        `[PipelineOrchestrator] Layer FAILED | ` +
        `pipelineId=${pipelineId} | layer=${layer} | ` +
        `time=${new Date().toISOString()}`
      );

      await pipelineTaskService.markFailed(pipelineId, layer, errorMsg);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Layer 3: TTS — 语音合成
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 执行 TTS 阶段
   *
   * 调用 generationService.generateTTS() 将脚本转为语音。
   * 使用 Script 阶段的 fullText 作为合成文本。
   *
   * Step4-D5: 完成后自动保存 audio Asset → PipelineTask.audio_asset_id
   *
   * @param {number} pipelineId   — PipelineTask 主键 ID
   * @param {Object} task         — PipelineTask instance
   * @param {Object} inputParams  — 解析后的输入参数
   * @param {Object} scriptResult — Script 阶段输出
   * @returns {Promise<Object>}   — TTS 合成结果（含 audioAssetId）
   */
  async executeTTS(pipelineId, task, inputParams, scriptResult) {
    const layer = 'tts';

    console.log(
      `[PipelineOrchestrator] Layer START | ` +
      `pipelineId=${pipelineId} | layer=${layer} | ` +
      `time=${new Date().toISOString()}`
    );

    // Step4-F2: 记录 TTS_STARTED 关键节点（仅记录，失败不影响主流程）
    this._recordNode(pipelineId, EVENTS.TTS_STARTED, { layer });

    try {
      // ── 1. 更新状态为 tts ────────────────────────────────────────
      await pipelineTaskService.updateStatus(pipelineId, 'tts', {
        current_layer: layer
      });

      // ── 2. 调用 generationService.generateTTS ────────────────────
      const ttsParams = {
        enterpriseId: task.enterprise_id,
        userId: task.user_id,
        text: scriptResult.fullText,
        voiceId: inputParams.voice_id,
        emotion: inputParams.tts_emotion || inputParams.emotion,
        speed: inputParams.tts_speed || inputParams.speed,
        format: inputParams.tts_format || inputParams.format,
        modelId: inputParams.tts_model_id
      };

      const result = await generationService.generateTTS(ttsParams);

      // ── 3. 保存中间结果（含 generationTaskId） ──────────────────
      const intermediateData = {
        ...result,
        generationTaskId: result.id,
        completedAt: new Date().toISOString()
      };

      await pipelineTaskService.saveIntermediateResult(pipelineId, layer, intermediateData);

      // ── 新增 Step4-D5: 保存 TTS 音频 Asset ──────────────────────
      const audioAssetResult = await pipelineAssetService.saveAudioAsset(
        task, intermediateData
      );

      // 将 Asset 信息合并到中间结果
      if (audioAssetResult.assetId) {
        intermediateData.audioAssetId = audioAssetResult.assetId;
        // 更新已保存的 intermediate_results 以包含 asset 信息
        await pipelineTaskService.saveIntermediateResult(pipelineId, layer, intermediateData);
      }

      // ── 4. 更新进度 ──────────────────────────────────────────────
      await pipelineTaskService.updateProgress(pipelineId, 75);

      console.log(
        `[PipelineOrchestrator] Layer SUCCESS | ` +
        `pipelineId=${pipelineId} | layer=${layer} | ` +
        `generationTaskId=${result.id} | ` +
        `audioDuration=${result.duration}s | ` +
        `voiceId=${result.voiceId} | ` +
        `audioAssetId=${audioAssetResult.assetId || 'N/A'} | ` +
        `time=${new Date().toISOString()}`
      );

      return intermediateData;

    } catch (error) {
      const errorMsg = error.message || 'Unknown TTS error';

      console.error(
        `[PipelineOrchestrator] Layer FAILED | ` +
        `pipelineId=${pipelineId} | layer=${layer} | ` +
        `time=${new Date().toISOString()}`
      );

      await pipelineTaskService.markFailed(pipelineId, layer, errorMsg);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Layer 4: DigitalHuman — 数字人视频生成
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 执行 DigitalHuman 阶段
   *
   * 调用 generationService.generateDigitalHuman() 创建数字人视频任务。
   * 异步任务：只保存任务结果，不轮询、不下载、不上传 OSS。
   * Step4-D5: 若 result 包含 videoUrl 则自动保存 video Asset。
   *
   * @param {number} pipelineId   — PipelineTask 主键 ID
   * @param {Object} task         — PipelineTask instance
   * @param {Object} inputParams  — 解析后的输入参数
   * @param {Object} ttsResult    — TTS 阶段输出
   * @returns {Promise<Object>}   — DigitalHuman 任务结果
   */
  async executeDigitalHuman(pipelineId, task, inputParams, ttsResult) {
    const layer = 'dh';

    console.log(
      `[PipelineOrchestrator] Layer START | ` +
      `pipelineId=${pipelineId} | layer=${layer} | ` +
      `time=${new Date().toISOString()}`
    );

    // Step4-F2: 记录 DH_STARTED 关键节点（仅记录，失败不影响主流程）
    this._recordNode(pipelineId, EVENTS.DH_STARTED, { layer });

    try {
      // ── 1. 更新状态为 digital_human ──────────────────────────────
      await pipelineTaskService.updateStatus(pipelineId, 'digital_human', {
        current_layer: layer
      });

      // ── 2. 调用 generationService.generateDigitalHuman ───────────
      const dhParams = {
        enterpriseId: task.enterprise_id,
        userId: task.user_id,
        imageUrl: inputParams.image_url,
        audioUrl: ttsResult.audioUrl,
        style: inputParams.dh_style || inputParams.style,
        resolution: inputParams.resolution,
        faceBbox: inputParams.face_bbox,
        styleLevel: inputParams.style_level,
        modelId: inputParams.dh_model_id
      };

      const result = await generationService.generateDigitalHuman(dhParams);

      // ── 3. 保存中间结果（含 generationTaskId 和 providerTaskId） ─
      const intermediateData = {
        ...result,
        generationTaskId: result.id,
        providerTaskId: result.taskId,
        completedAt: new Date().toISOString()
      };

      await pipelineTaskService.saveIntermediateResult(pipelineId, layer, intermediateData);

      // ── 新增 Step4-D7: 回填 PipelineTask.dh_task_id ────────────
      // 建立 PipelineTask ↔ GenerationTask 直接关联，供 callback 优先索引。
      // 使用已有 Model 方法（findByPk + update），禁止直接 SQL。
      const pipelineTaskRecord = await PipelineTask.findByPk(pipelineId);
      if (pipelineTaskRecord) {
        await pipelineTaskRecord.update({ dh_task_id: result.id });
        console.log(
          `[PipelineOrchestrator] dh_task_id backfilled | ` +
          `pipelineId=${pipelineId} | dh_task_id=${result.id} | ` +
          `time=${new Date().toISOString()}`
        );
      } else {
        console.warn(
          `[PipelineOrchestrator] dh_task_id backfill SKIPPED | ` +
          `pipelineId=${pipelineId} | reason=PipelineTask not found | ` +
          `time=${new Date().toISOString()}`
        );
      }

      // ── 新增 Step4-D5: 保存 DH 视频 Asset（条件执行）─────────────
      // DH 通常为异步任务，videoUrl 可能尚未就绪。
      // 若 result 包含 videoUrl 则立即创建 Asset；否则延后至轮询阶段。
      if (result.videoUrl || result.video_url) {
        const videoAssetResult = await pipelineAssetService.saveVideoAsset(
          task, { ...result, videoUrl: result.videoUrl || result.video_url }
        );

        if (videoAssetResult.assetId) {
          intermediateData.outputAssetId = videoAssetResult.assetId;
          // 更新已保存的 intermediate_results 以包含 asset 信息
          await pipelineTaskService.saveIntermediateResult(pipelineId, layer, intermediateData);
        }
      } else {
        console.log(
          `[PipelineOrchestrator] DH video asset deferred | ` +
          `pipelineId=${pipelineId} | reason=async task, videoUrl not yet available | ` +
          `providerTaskId=${result.taskId}`
        );
      }

      // ── 4. 更新进度 ──────────────────────────────────────────────
      await pipelineTaskService.updateProgress(pipelineId, 90);

      console.log(
        `[PipelineOrchestrator] Layer SUCCESS | ` +
        `pipelineId=${pipelineId} | layer=${layer} | ` +
        `generationTaskId=${result.id} | ` +
        `providerTaskId=${result.taskId} | ` +
        `provider=${result.provider} | ` +
        `model=${result.model} | ` +
        `status=${result.status} | ` +
        `time=${new Date().toISOString()}`
      );

      return intermediateData;

    } catch (error) {
      const errorMsg = error.message || 'Unknown DigitalHuman error';

      console.error(
        `[PipelineOrchestrator] Layer FAILED | ` +
        `pipelineId=${pipelineId} | layer=${layer} | ` +
        `time=${new Date().toISOString()}`
      );

      await pipelineTaskService.markFailed(pipelineId, layer, errorMsg);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  观察能力：记录关键节点（Step4-F2，失败不影响主流程）
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 记录流水线关键节点（幂等，try/catch 保护，失败仅告警不中断）
   *
   * @param {number|string} pipelineId
   * @param {string} event   — EVENTS 之一（如 PIPELINE_CREATED）
   * @param {Object} [meta]  — 附加信息
   */
  _recordNode(pipelineId, event, meta = {}) {
    try {
      pipelineObservabilityService.recordNode(pipelineId, event, meta);
    } catch (err) {
      console.warn(
        `[PipelineOrchestrator] recordNode FAILED (ignored) | ` +
        `pipelineId=${pipelineId} | event=${event} | error=${err.message}`
      );
    }
  }
}

module.exports = new PipelineOrchestrator();
