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
const scriptService = require('./scriptService');
const voiceService = require('./voiceService');
const { PipelineTask } = require('../models');

// 关键节点事件名（唯一事实来源）
const { EVENTS } = pipelineObservabilityService;

class PipelineOrchestrator {
  /**
   * 执行完整流水线
   *
   * 状态流转：
   *   pending → running → vision → script → tts → digital_human
   *
   * digital_human 为异步阶段：本方法在提交 DH 异步任务后即返回，PipelineTask
   * 保持 digital_human（不在此处置 success）。真正的 success 由完成驱动
   * （digitalHumanTaskService.handleCompletedTask / handleCallbackCompletion）
   * 在视频产出并回填 output_asset_id 后推进。
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

      // Step5-G1.1：每层之间检查取消标记（删除 = 终止）。
      // 命中即提前 return（不 markFailed），后续步骤禁止继续。
      // 检查点1：覆盖「删除落在 create 与首次 updateStatus 之间」。
      if (await this._isCancelled(pipelineId)) {
        return this._cancelled(pipelineId, 'before-vision');
      }

      // Layer 1: Vision
      const visionResult = await this.executeVision(pipelineId, task, inputParams);
      if (await this._isCancelled(pipelineId)) {
        return this._cancelled(pipelineId, 'after-vision');
      }

      // Layer 2: Script
      const scriptResult = await this.executeScript(pipelineId, task, inputParams, visionResult);
      if (await this._isCancelled(pipelineId)) {
        return this._cancelled(pipelineId, 'after-script');
      }

      // Layer 3: TTS
      const ttsResult = await this.executeTTS(pipelineId, task, inputParams, scriptResult);
      if (await this._isCancelled(pipelineId)) {
        return this._cancelled(pipelineId, 'after-tts');
      }

      // Layer 4: DigitalHuman
      const dhResult = await this.executeDigitalHuman(pipelineId, task, inputParams, ttsResult);
      if (await this._isCancelled(pipelineId)) {
        return this._cancelled(pipelineId, 'after-dh');
      }

      // ── 5. DH 异步等待（P0-1 修复：不再提前 success）──────────────
      // DigitalHuman 为异步任务：executeDigitalHuman 仅提交并拿到 taskId，
      // 视频尚未生成。禁止在此处置 success —— PipelineTask 保持 digital_human，
      // 由完成驱动（digitalHumanTaskService.handleCompletedTask /
      // handleCallbackCompletion）在视频真正产出、output_asset_id 回填后推进 success。
      const elapsedMs = Date.now() - startTime;

      console.log(
        `[PipelineOrchestrator] executePipeline DH_AWAIT | ` +
        `pipelineId=${pipelineId} | status=digital_human | elapsedMs=${elapsedMs} | ` +
        `providerTaskId=${dhResult.providerTaskId || dhResult.taskId || 'N/A'} | ` +
        `time=${new Date().toISOString()}`
      );

      return {
        status: 'digital_human',
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
  //  取消检查（Step5-G1.1：删除 = 立即终止，不新增状态/字段，不重构四层）
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 检查流水线是否已被取消（删除 = 终止后 pipelineTaskService 已置 status='cancelled'）
   *
   * @param {number} pipelineId — PipelineTask 主键 ID
   * @returns {Promise<boolean>} true 表示已取消
   */
  async _isCancelled(pipelineId) {
    try {
      return await pipelineTaskService.isCancelled(pipelineId);
    } catch (err) {
      // 读失败按「未取消」处理，避免误杀
      console.warn(
        `[PipelineOrchestrator] _isCancelled check FAILED (treated as not-cancelled) | ` +
        `pipelineId=${pipelineId} | error=${err.message}`
      );
      return false;
    }
  }

  /**
   * 构造取消结果（提前 return，不调用 markFailed，避免覆盖 cancelled 为 failed）
   *
   * @param {number} pipelineId — PipelineTask 主键 ID
   * @param {string} reason     — 命中位置（before-vision / after-*）
   * @returns {{ status: string, pipelineId: number }}
   */
  _cancelled(pipelineId, reason) {
    console.log(
      `[PipelineOrchestrator] executePipeline CANCELLED | ` +
      `pipelineId=${pipelineId} | reason=${reason} | ` +
      `time=${new Date().toISOString()}`
    );
    return { status: 'cancelled', pipelineId };
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

      // ── Step5-F1 复用分支：有 script_id → 加载已落库 ScriptRecord 复用 ──
      if (inputParams.script_id) {
        const record = await scriptService.getScript(inputParams.script_id, task.enterprise_id);
        if (!record) {
          throw new Error('脚本不存在或已被删除');
        }
        if (!record.full_script || !String(record.full_script).trim()) {
          throw new Error('脚本内容为空');
        }

        const result = this._mapScriptRecordToResult(record);

        const intermediateData = {
          ...result,
          generationTaskId: null,
          scriptRecordId: record.id,
          source: 'script_record',
          completedAt: new Date().toISOString()
        };

        await pipelineTaskService.saveIntermediateResult(pipelineId, layer, intermediateData);

        // 回填 PipelineTask.script_record_id（仿 dh_task_id 回填，禁止直接 SQL）
        const pipelineTaskRecord = await PipelineTask.findByPk(pipelineId);
        if (pipelineTaskRecord) {
          await pipelineTaskRecord.update({ script_record_id: record.id });
          console.log(
            `[PipelineOrchestrator] script_record_id backfilled | ` +
            `pipelineId=${pipelineId} | script_record_id=${record.id} | ` +
            `time=${new Date().toISOString()}`
          );
        }

        await pipelineTaskService.updateProgress(pipelineId, 50);

        console.log(
          `[PipelineOrchestrator] Layer SUCCESS | ` +
          `pipelineId=${pipelineId} | layer=${layer} | ` +
          `Script REUSED scriptId=${record.id} | ` +
          `estimatedDuration=${result.estimatedDuration}s | ` +
          `totalWords=${result.totalWords} | ` +
          `time=${new Date().toISOString()}`
        );

        return intermediateData;
      }

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

  /**
   * Step5-F1: ScriptRecord → ScriptResult 形状映射（复用分支唯一新增映射逻辑）
   *
   * 下游契约：executeTTS 只读 fullText；本层日志读 estimatedDuration/totalWords。
   * fullText 恒以 full_script 为准；structured_script 解析失败降级 segments=[]、style=null。
   *
   * @param {Object} record — ScriptRecord Sequelize instance
   * @returns {Object} { title, fullText, segments, totalWords, estimatedDuration, style }
   */
  _mapScriptRecordToResult(record) {
    let structured = null;
    try {
      if (record.structured_script) {
        structured = typeof record.structured_script === 'string'
          ? JSON.parse(record.structured_script)
          : record.structured_script;
      }
    } catch (_) {
      structured = null;
    }

    return {
      title: record.title != null ? record.title : null,
      fullText: record.full_script != null ? record.full_script : '',
      segments: (structured && Array.isArray(structured.segments)) ? structured.segments : [],
      totalWords: record.total_words != null ? record.total_words : 0,
      estimatedDuration: record.estimated_duration != null ? record.estimated_duration : 0,
      style: (structured && structured.style != null) ? structured.style : null
    };
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

      // ── 2. 服务端权威解析 voice_id(主键) → voice_key + model_id（Step7-B.3 / W2+W3）
      // 前端只传 voice.id（DB 主键），此处解析：
      //   - 命中   → voiceId = voice_key（真实阿里云 voice_id）、modelId = voice.model_id 优先
      //   - 解析不到（已删 / 越权 / 伪造）→ 告警 + 按默认音色继续，不中断任务
      let resolvedVoiceKey = null;
      let resolvedVoiceModelId = null;
      if (inputParams.voice_id) {
        try {
          const resolved = await voiceService.resolveForSynthesis(inputParams.voice_id, task.enterprise_id);
          if (resolved && resolved.found) {
            resolvedVoiceKey = resolved.voiceKey;
            resolvedVoiceModelId = resolved.modelId;
            console.log(
              `[PipelineOrchestrator] voice resolved | ` +
              `pipelineId=${pipelineId} | voiceId=${inputParams.voice_id} | ` +
              `voiceKey=${resolved.voiceKey} | modelId=${resolved.modelId || 'N/A'} | ` +
              `time=${new Date().toISOString()}`
            );
          } else {
            console.warn(
              `[PipelineOrchestrator] voice UNRESOLVABLE | ` +
              `pipelineId=${pipelineId} | voiceId=${inputParams.voice_id} | ` +
              `reason=deleted/forbidden/forged | continue with default voice | ` +
              `time=${new Date().toISOString()}`
            );
          }
        } catch (resolveError) {
          console.warn(
            `[PipelineOrchestrator] voice resolve ERROR | ` +
            `pipelineId=${pipelineId} | voiceId=${inputParams.voice_id} | ` +
            `error=${resolveError.message} | continue with default voice | ` +
            `time=${new Date().toISOString()}`
          );
          resolvedVoiceKey = null;
          resolvedVoiceModelId = null;
        }
      }

      // ── 3. 调用 generationService.generateTTS ────────────────────
      const ttsParams = {
        enterpriseId: task.enterprise_id,
        userId: task.user_id,
        text: scriptResult.fullText,
        voiceId: resolvedVoiceKey || null,       // 真实 voice_key，非 DB 主键
        emotion: inputParams.tts_emotion || inputParams.emotion,
        speed: inputParams.tts_speed || inputParams.speed,
        format: inputParams.tts_format || inputParams.format,
        modelId: resolvedVoiceModelId || inputParams.tts_model_id  // voice 的 model_id 优先
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
