/**
 * DigitalHuman Task Service — 数字人异步任务完成处理
 *
 * Phase DigitalHuman-Rebuild-004 Step4-D5.5
 *
 * 职责：
 *   1. 查询 DH 异步任务状态（通过已有 Provider 查询链）
 *   2. 处理已完成任务：下载视频 → 创建 Asset → 更新 PipelineTask
 *   3. 处理失败任务：标记 PipelineTask 失败原因
 *
 * 依赖：
 *   - aliyunProvider              — DH 任务状态查询
 *   - pipelineTaskService         — PipelineTask 生命周期管理
 *   - pipelineAssetService        — Asset 持久化（下载+OSS+Asset创建）
 *
 * 设计原则：
 *   - 单次查询：不实现 while loop / 定时器 / 队列（调度属于后续阶段）
 *   - 不直接调用 DashScope SDK（全部通过 Provider 链）
 *   - 不修改 PipelineTask 状态机定义
 *   - 不创建重复的 Asset 流程（复用 downloadAndSaveVideoAsset）
 *
 * 禁止：
 *   ❌ 直接调用 DashScope SDK / dashscopeService
 *   ❌ 修改 models / migrations
 *   ❌ 修改 Provider 核心逻辑
 *   ❌ 轮询循环 / 定时器 / 队列
 *   ❌ 修改 API 契约
 */

const aliyunProvider = require('../providers/aliyunProvider');
const pipelineTaskService = require('./pipelineTaskService');
const pipelineAssetService = require('./pipelineAssetService');
const pipelineObservabilityService = require('./pipelineObservabilityService');
const { PipelineTask } = require('../models');

// 关键节点事件名（唯一事实来源）
const { EVENTS } = pipelineObservabilityService;

class DigitalHumanTaskService {
  // ═══════════════════════════════════════════════════════════════════════
  //  1. checkTaskStatus — 查询 DH 异步任务状态
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 查询 DigitalHuman 异步任务在 DashScope 的状态
   *
   * 调用已有 Provider 查询链：
   *   aliyunProvider.getDigitalHumanTaskStatus(taskId)
   *     → digitalHumanProvider.getTaskStatus(taskId)
   *     → dashscopeClient.getTaskStatus(taskId)
   *     → dashscopeService.getTaskStatus({taskId})
   *
   * 禁止直接调用 DashScope SDK。
   *
   * @param {string} taskId       — DashScope task_id（字符串）
   * @param {number} enterpriseId — 企业 ID（用于日志追踪）
   * @returns {Promise<{
   *   status: string,       // pending | processing | success | failed
   *   videoUrl: string|null,
   *   coverUrl: string|null,
   *   duration: number|null,
   *   resolution: string|null,
   *   taskId: string,
   *   errorCode: string|null,
   *   errorMessage: string|null
   * }>}
   */
  async checkTaskStatus(taskId, enterpriseId) {
    if (!taskId || typeof taskId !== 'string' || !taskId.trim()) {
      throw new Error('taskId is required and must be a non-empty string');
    }

    console.log(
      `[DigitalHumanTaskService] checkTaskStatus START | ` +
      `taskId=${taskId} | ` +
      `enterpriseId=${enterpriseId} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 调用已有 Provider 查询链 ──────────────────────────────────
    const statusResult = await aliyunProvider.getDigitalHumanTaskStatus(taskId);

    // ── 标准化返回 ───────────────────────────────────────────────
    const result = {
      status: statusResult.status,
      videoUrl: statusResult.outputUrl || null,
      coverUrl: statusResult.coverUrl || null,
      duration: statusResult.duration || null,
      resolution: null, // DashScope getTaskStatus 不返回 resolution
      taskId: statusResult.taskId || taskId,
      errorCode: statusResult.errorCode || null,
      errorMessage: statusResult.errorMessage || null
    };

    console.log(
      `[DigitalHumanTaskService] checkTaskStatus RESULT | ` +
      `taskId=${taskId} | ` +
      `status=${result.status} | ` +
      `hasVideoUrl=${!!result.videoUrl} | ` +
      `hasError=${!!result.errorCode} | ` +
      `time=${new Date().toISOString()}`
    );

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  2. handleCompletedTask — 处理已完成的 DH 任务
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 处理 DigitalHuman 异步任务完成（单次查询）
   *
   * 流程：
   *   1. 查询 PipelineTask（含 enterprise_id）
   *   2. 从 intermediate_results 获取 DashScope task_id
   *   3. 查询 DH 任务状态
   *   4. 成功 → 下载视频 + 创建 Asset + 更新 PipelineTask
   *   5. 失败 → 标记 PipelineTask 失败
   *   6. 处理中 → 返回 pending（不阻塞）
   *
   * 只实现单次查询，不实现轮询/队列/定时器。
   *
   * @param {number} pipelineTaskId — PipelineTask 主键 ID
   * @returns {Promise<{
   *   status: string,
   *   pipelineId: number,
   *   dhTaskStatus: string|null,
   *   assetId: number|null,
   *   videoUrl: string|null
   * }>}
   */
  async handleCompletedTask(pipelineTaskId) {
    const startTime = Date.now();

    if (!pipelineTaskId || typeof pipelineTaskId !== 'number') {
      throw new Error('pipelineTaskId is required and must be a number');
    }

    console.log(
      `[DigitalHumanTaskService] handleCompletedTask START | ` +
      `pipelineTaskId=${pipelineTaskId} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 1. 查询 PipelineTask ──────────────────────────────────────
    const pipelineTask = await PipelineTask.findByPk(pipelineTaskId);
    if (!pipelineTask) {
      const errMsg = `PipelineTask id=${pipelineTaskId} not found`;
      console.error(`[DigitalHumanTaskService] ${errMsg}`);
      throw new Error(errMsg);
    }

    const enterpriseId = pipelineTask.enterprise_id;

    console.log(
      `[DigitalHumanTaskService] PipelineTask loaded | ` +
      `pipelineTaskId=${pipelineTaskId} | ` +
      `enterpriseId=${enterpriseId} | ` +
      `currentStatus=${pipelineTask.status} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 1.5 幂等检查：非 digital_human 状态 ──────────────────────
    if (pipelineTask.status !== 'digital_human') {
      console.log(
        `[DigitalHumanTaskService] handleCompletedTask SKIP | ` +
        `pipelineTaskId=${pipelineTaskId} | ` +
        `reason=PipelineTask status is "${pipelineTask.status}", not "digital_human" | ` +
        `time=${new Date().toISOString()}`
      );
      return {
        status: 'skipped',
        pipelineId: pipelineTaskId,
        dhTaskStatus: null,
        assetId: null,
        videoUrl: null
      };
    }

    // ── 2. 获取 DashScope task_id ────────────────────────────────
    let dhTaskId = null;
    try {
      const intermediateResults = pipelineTask.intermediate_results
        ? (typeof pipelineTask.intermediate_results === 'string'
            ? JSON.parse(pipelineTask.intermediate_results)
            : pipelineTask.intermediate_results)
        : {};
      dhTaskId = intermediateResults.dh?.providerTaskId || null;
    } catch (parseError) {
      console.error(
        `[DigitalHumanTaskService] intermediate_results parse FAILED | ` +
        `pipelineTaskId=${pipelineTaskId} | ` +
        `error=${parseError.message}`
      );
    }

    if (!dhTaskId) {
      const errMsg = `No DashScope task_id found in intermediate_results.dh.providerTaskId for pipelineTaskId=${pipelineTaskId}`;
      console.error(`[DigitalHumanTaskService] ${errMsg}`);

      // 标记为失败 — 缺少必要数据无法继续
      await pipelineTaskService.markFailed(pipelineTaskId, 'dh', errMsg);
      this._recordNode(pipelineTaskId, EVENTS.PIPELINE_FAILED, { failedLayer: 'dh' });

      return {
        status: 'failed',
        pipelineId: pipelineTaskId,
        dhTaskStatus: null,
        assetId: null,
        videoUrl: null
      };
    }

    console.log(
      `[DigitalHumanTaskService] DashScope task_id resolved | ` +
      `pipelineTaskId=${pipelineTaskId} | ` +
      `dhTaskId=${dhTaskId} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 3. 查询 DH 任务状态 ──────────────────────────────────────
    let dhStatus;
    try {
      dhStatus = await this.checkTaskStatus(dhTaskId, enterpriseId);
    } catch (error) {
      console.error(
        `[DigitalHumanTaskService] checkTaskStatus FAILED | ` +
        `pipelineTaskId=${pipelineTaskId} | ` +
        `dhTaskId=${dhTaskId} | ` +
        `error=${error.message} | ` +
        `time=${new Date().toISOString()}`
      );

      return {
        status: 'error',
        pipelineId: pipelineTaskId,
        dhTaskStatus: null,
        assetId: null,
        videoUrl: null
      };
    }

    // ── 4. 处理成功 ──────────────────────────────────────────────
    if (dhStatus.status === 'success') {
      const videoUrl = dhStatus.videoUrl;

      if (!videoUrl) {
        console.error(
          `[DigitalHumanTaskService] DH task succeeded but no videoUrl | ` +
          `pipelineTaskId=${pipelineTaskId} | ` +
          `dhTaskId=${dhTaskId} | ` +
          `time=${new Date().toISOString()}`
        );

        // 无 videoUrl 无法下载，标记失败
        await pipelineTaskService.markFailed(
          pipelineTaskId, 'dh',
          'DH task completed successfully but no video URL in response'
        );
        this._recordNode(pipelineTaskId, EVENTS.PIPELINE_FAILED, { failedLayer: 'dh' });

        return {
          status: 'failed',
          pipelineId: pipelineTaskId,
          dhTaskStatus: dhStatus.status,
          assetId: null,
          videoUrl: null
        };
      }

      // ── 4a. 下载视频 + 创建 Asset ────────────────────────────
      console.log(
        `[DigitalHumanTaskService] DH task SUCCESS — downloading video | ` +
        `pipelineTaskId=${pipelineTaskId} | ` +
        `dhTaskId=${dhTaskId} | ` +
        `time=${new Date().toISOString()}`
      );

      const assetResult = await pipelineAssetService.downloadAndSaveVideoAsset(
        pipelineTask,
        videoUrl,
        {
          duration: dhStatus.duration || undefined,
          mimeType: 'video/mp4'
        }
      );

      // ── 4b. 更新 PipelineTask 状态为 success ──────────────────
      if (assetResult.assetId) {
        // output_asset_id 已由 downloadAndSaveVideoAsset 内部更新
        await pipelineTaskService.updateStatus(pipelineTaskId, 'success', {
          completed_at: new Date()
        });
        await pipelineTaskService.updateProgress(pipelineTaskId, 100);

        // 更新 intermediate_results.dh 补充状态信息
        await pipelineTaskService.saveIntermediateResult(pipelineTaskId, 'dh', {
          providerTaskId: dhTaskId,
          dhStatus: dhStatus.status,
          outputAssetId: assetResult.assetId,
          videoUrl: assetResult.videoUrl,
          duration: assetResult.duration,
          resolution: assetResult.resolution,
          completedAt: new Date().toISOString()
        });

        // Step4-F2: 记录 ASSET_CREATED / PIPELINE_COMPLETED（仅记录，失败不影响主流程）
        this._recordNode(pipelineTaskId, EVENTS.ASSET_CREATED, {
          layer: 'dh', assetId: assetResult.assetId
        });
        this._recordNode(pipelineTaskId, EVENTS.PIPELINE_COMPLETED, { layer: 'dh' });
      } else {
        // Asset 创建失败（downloadAndSaveVideoAsset 已做降级处理）
        console.error(
          `[DigitalHumanTaskService] Asset creation returned no assetId | ` +
          `pipelineTaskId=${pipelineTaskId} | ` +
          `dhTaskId=${dhTaskId} | ` +
          `time=${new Date().toISOString()}`
        );

        // 标记失败 — Asset 创建是必要步骤
        await pipelineTaskService.markFailed(
          pipelineTaskId, 'dh',
          'Failed to create video Asset from DH result'
        );
        this._recordNode(pipelineTaskId, EVENTS.PIPELINE_FAILED, { failedLayer: 'dh' });
      }

      const elapsedMs = Date.now() - startTime;

      console.log(
        `[DigitalHumanTaskService] handleCompletedTask SUCCESS | ` +
        `pipelineTaskId=${pipelineTaskId} | ` +
        `dhTaskId=${dhTaskId} | ` +
        `assetId=${assetResult.assetId || 'N/A'} | ` +
        `elapsedMs=${elapsedMs} | ` +
        `time=${new Date().toISOString()}`
      );

      return {
        status: assetResult.assetId ? 'success' : 'failed',
        pipelineId: pipelineTaskId,
        dhTaskStatus: dhStatus.status,
        assetId: assetResult.assetId || null,
        videoUrl: assetResult.videoUrl || null
      };
    }

    // ── 5. 处理失败 ─────────────────────────────────────────────
    if (dhStatus.status === 'failed') {
      const errorMsg = dhStatus.errorMessage
        || dhStatus.errorCode
        || 'DigitalHuman async task failed on provider side';

      console.error(
        `[DigitalHumanTaskService] DH task FAILED | ` +
        `pipelineTaskId=${pipelineTaskId} | ` +
        `dhTaskId=${dhTaskId} | ` +
        `errorCode=${dhStatus.errorCode || 'N/A'} | ` +
        `errorMessage=${dhStatus.errorMessage || 'N/A'} | ` +
        `time=${new Date().toISOString()}`
      );

      await pipelineTaskService.markFailed(pipelineTaskId, 'dh', errorMsg);
      this._recordNode(pipelineTaskId, EVENTS.PIPELINE_FAILED, { failedLayer: 'dh' });

      const elapsedMs = Date.now() - startTime;

      return {
        status: 'failed',
        pipelineId: pipelineTaskId,
        dhTaskStatus: dhStatus.status,
        assetId: null,
        videoUrl: null
      };
    }

    // ── 6. 处理中（pending / processing）─ 不阻塞 ──────────────
    console.log(
      `[DigitalHumanTaskService] DH task still running | ` +
      `pipelineTaskId=${pipelineTaskId} | ` +
      `dhTaskId=${dhTaskId} | ` +
      `dhStatus=${dhStatus.status} | ` +
      `time=${new Date().toISOString()}`
    );

    return {
      status: 'pending',
      pipelineId: pipelineTaskId,
      dhTaskStatus: dhStatus.status,
      assetId: null,
      videoUrl: null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  3. handleCallbackCompletion — 回调驱动 PipelineTask 完成
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * DashScope 回调驱动数字人 PipelineTask 完成（回调状态作为第一状态源）
   *
   * Step4-E4 修复 A2 / A1 / A3：
   *   - A2：不再二次查询 Provider，直接采用回调携带的 task_status 作为状态源，
   *         消除「回调 FAILED 但二次查询成功 → Pipeline success」与
   *         「GenerationTask success / PipelineTask failed」的状态分叉。
   *   - A1/A3：优先复用 GenerationTask.output_asset_id（storeVideoAndCreateAsset
   *         已下载/上传/建 Asset），避免同一 DashScope task_id 被重复 download /
   *         upload OSS / create Asset。
   *
   * 流程：
   *   1. 根据 GenerationTask（task_id / id）定位 status='digital_human' 的 PipelineTask
   *   2. 按回调状态归一化：
   *        - FAILED  → markFailed('dh')
   *        - SUCCESS → 复用 GenerationTask Asset（无则按 videoUrl 下载）→ status=success
   *        - 其他    → 返回 pending（非终态，不回写）
   *
   * 关联方式（dh_task_id 未回填，见 Precheck）：
   *   通过 intermediate_results.dh 的 providerTaskId（= DashScope task_id）
   *   或 generationTaskId（= GenerationTask.id）匹配。
   *
   * 禁止重复下载视频 / 重复创建 Asset：优先复用 GenerationTask 已建 Asset。
   *
   * @param {Object} generationTask — GenerationTask instance（含 id / task_id / output_asset_id）
   * @param {string} [callbackStatus] — 回调 task_status（SUCCEEDED|FAILED|success|failed|...）
   * @param {string} [videoUrl] — 回调 output.video_url（SUCCEEDED 时可用）
   * @returns {Promise<{
   *   found: boolean,
   *   pipelineId: number|null,
   *   status: string|null,
   *   assetId: number|null
   * }>}
   */
  async handleCallbackCompletion(generationTask, callbackStatus, videoUrl) {
    if (!generationTask || !generationTask.task_id) {
      throw new Error('generationTask with task_id is required');
    }

    const dashScopeTaskId = generationTask.task_id;
    const generationTaskId = generationTask.id;

    console.log(
      `[DigitalHumanTaskService] handleCallbackCompletion START | ` +
      `dashScopeTaskId=${dashScopeTaskId} | generationTaskId=${generationTaskId} | ` +
      `callbackStatus=${callbackStatus || 'N/A'} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 1. 优先：PipelineTask.dh_task_id 直接索引 ────────────────
    // Step4-D7: 新任务通过 dh_task_id 直接关联，避免全表 JSON 扫描。
    let matchedPipelineTask = null;
    if (generationTaskId != null) {
      matchedPipelineTask = await PipelineTask.findOne({
        where: { dh_task_id: generationTaskId }
      });
      if (matchedPipelineTask) {
        console.log(
          `[DigitalHumanTaskService] handleCallbackCompletion resolved via dh_task_id | ` +
          `pipelineId=${matchedPipelineTask.id} | generationTaskId=${generationTaskId}`
        );
      }
    }

    // ── 2. Fallback：扫描 status='digital_human'，JSON 匹配 ──────
    // 保留旧逻辑以兼容历史数据（无 dh_task_id 的 PipelineTask）。
    if (!matchedPipelineTask) {
      const candidates = await PipelineTask.findAll({
        where: { status: 'digital_human' }
      });

      for (const pt of candidates) {
        let ir = pt.intermediate_results;
        if (typeof ir === 'string') {
          try {
            ir = JSON.parse(ir);
          } catch (_) {
            ir = null;
          }
        }
        const dh = ir && ir.dh ? ir.dh : null;
        if (!dh) continue;

        if (dh.providerTaskId === dashScopeTaskId || dh.generationTaskId === generationTaskId) {
          matchedPipelineTask = pt;
          break;
        }
      }
    }

    if (!matchedPipelineTask) {
      console.warn(
        `[DigitalHumanTaskService] handleCallbackCompletion NOT_FOUND | ` +
        `dashScopeTaskId=${dashScopeTaskId} | no matching PipelineTask in status=digital_human`
      );
      return {
        found: false,
        pipelineId: null,
        status: 'not_found',
        assetId: null
      };
    }

    console.log(
      `[DigitalHumanTaskService] handleCallbackCompletion PipelineTask resolved | ` +
      `pipelineId=${matchedPipelineTask.id} | dashScopeTaskId=${dashScopeTaskId}`
    );

    // ── 2.5 幂等守卫：非 digital_human 状态跳过 ────────────────
    if (matchedPipelineTask.status !== 'digital_human') {
      console.log(
        `[DigitalHumanTaskService] handleCallbackCompletion SKIP | ` +
        `pipelineId=${matchedPipelineTask.id} | ` +
        `reason=PipelineTask status is "${matchedPipelineTask.status}", not "digital_human"`
      );
      return {
        found: true,
        pipelineId: matchedPipelineTask.id,
        status: 'skipped',
        assetId: null
      };
    }

    // ── 3. 归一化回调状态（第一状态源） ────────────────────────
    const normalizedStatus =
      callbackStatus === 'SUCCEEDED' || callbackStatus === 'success'
        ? 'success'
        : callbackStatus === 'FAILED' || callbackStatus === 'failed'
          ? 'failed'
          : 'pending';

    // ── 4. FAILED：与 GenerationTask 一致标记失败 ───────────────
    if (normalizedStatus === 'failed') {
      await pipelineTaskService.markFailed(
        matchedPipelineTask.id, 'dh',
        'DigitalHuman task failed on provider (callback FAILED)'
      );
      this._recordNode(matchedPipelineTask.id, EVENTS.PIPELINE_FAILED, { failedLayer: 'dh' });

      console.log(
        `[DigitalHumanTaskService] handleCallbackCompletion FAILED | ` +
        `pipelineId=${matchedPipelineTask.id} | callbackStatus=${callbackStatus}`
      );

      return {
        found: true,
        pipelineId: matchedPipelineTask.id,
        status: 'failed',
        assetId: null
      };
    }

    // ── 5. SUCCESS：复用 GenerationTask Asset 完成 ──────────────
    if (normalizedStatus === 'success') {
      return this._completeCallbackSuccess(matchedPipelineTask, generationTask, videoUrl);
    }

    // ── 6. 其他（RUNNING 等非终态）：不回写，避免状态分叉 ───────
    console.log(
      `[DigitalHumanTaskService] handleCallbackCompletion PENDING | ` +
      `pipelineId=${matchedPipelineTask.id} | callbackStatus=${callbackStatus || 'N/A'}`
    );

    return {
      found: true,
      pipelineId: matchedPipelineTask.id,
      status: 'pending',
      assetId: null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  4. _completeCallbackSuccess — SUCCESS 回调：复用 Asset 完成
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * SUCCESS 回调下的 PipelineTask 完成（复用 GenerationTask Asset，避免重复 Asset）
   *
   * Step4-E4 修复 A1/A3：优先复用 GenerationTask.output_asset_id，
   * 不重复 download / upload OSS / create Asset。
   *
   * 无 output_asset_id 且无 videoUrl 时，仍标记 success（与 GenerationTask 一致），
   * 禁止出现 GenerationTask success / PipelineTask failed（A2）。
   *
   * @param {Object} pipelineTask    — 已匹配的 PipelineTask instance
   * @param {Object} generationTask  — GenerationTask instance（含 output_asset_id / output_url / duration）
   * @param {string} [videoUrl]      — 回调 output.video_url
   * @returns {Promise<{ found: boolean, pipelineId: number, status: string, assetId: number|null }>}
   */
  async _completeCallbackSuccess(pipelineTask, generationTask, videoUrl) {
    const pipelineId = pipelineTask.id;

    // ── 1. 优先复用 GenerationTask 已建 Asset（A1/A3） ─────────
    let assetId = generationTask.output_asset_id || null;
    let outputVideoUrl = generationTask.output_url || null;
    let duration = generationTask.duration || null;

    if (!assetId && videoUrl) {
      // 兜底：GenerationTask 尚未建 Asset（历史任务 / 未走 storeVideoAndCreateAsset）
      const assetResult = await pipelineAssetService.downloadAndSaveVideoAsset(
        pipelineTask,
        videoUrl,
        { duration: undefined, mimeType: 'video/mp4' }
      );
      assetId = assetResult.assetId || null;
      outputVideoUrl = assetResult.videoUrl || outputVideoUrl;
      duration = assetResult.duration || duration;
    } else if (assetId) {
      // 复用已建 Asset：回填 PipelineTask.output_asset_id 指向同一 Asset
      await pipelineTaskService.updateAssetId(pipelineId, 'output_asset_id', assetId);
    }

    // ── 2. 以回调状态为第一状态源：SUCCEEDED → success ────────
    await pipelineTaskService.updateStatus(pipelineId, 'success', {
      completed_at: new Date()
    });
    await pipelineTaskService.updateProgress(pipelineId, 100);

    await pipelineTaskService.saveIntermediateResult(pipelineId, 'dh', {
      providerTaskId: generationTask.task_id,
      generationTaskId: generationTask.id,
      dhStatus: 'success',
      outputAssetId: assetId || null,
      videoUrl: outputVideoUrl || null,
      duration: duration || null,
      completedAt: new Date().toISOString()
    });

    // Step4-F2: 记录 ASSET_CREATED / PIPELINE_COMPLETED（仅记录，失败不影响主流程）
    if (assetId) {
      this._recordNode(pipelineId, EVENTS.ASSET_CREATED, { layer: 'dh', assetId });
    }
    this._recordNode(pipelineId, EVENTS.PIPELINE_COMPLETED, { layer: 'dh' });

    console.log(
      `[DigitalHumanTaskService] handleCallbackCompletion SUCCESS | ` +
      `pipelineId=${pipelineId} | assetId=${assetId || 'N/A'} | ` +
      `reusedAsset=${!!generationTask.output_asset_id}`
    );

    return {
      found: true,
      pipelineId,
      status: 'success',
      assetId: assetId || null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  5. isPipelineCancelledForGenerationTask — 取消回调守卫（Step5-G3）
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 判断某 GenerationTask（数字人）对应的 PipelineTask 是否已被取消
   *
   * Step5-G3：流水线「删除 = 终止」会置 status='cancelled'（含 deleted_at），
   * 但 DashScope 异步任务仍可能回调 SUCCEEDED。回调侧在读到此状态时需提前返回，
   * 避免：重复扣积分（adjustEnterpriseQuota）、重复建 Asset（storeVideoAndCreateAsset）、
   * 推进 PipelineTask（handleCallbackCompletion）。
   *
   * 只读、不写库、不修改任何状态。
   *
   * 匹配顺序（与 handleCallbackCompletion 对齐）：
   *   1. 优先：PipelineTask.dh_task_id === generationTaskId（新任务，直接索引，
   *      不过滤 deleted_at，确保能读到「已软删除且已取消」的行）
   *   2. 兜底：扫描 status='cancelled' 的 PipelineTask，JSON 匹配
   *      intermediate_results.dh.providerTaskId === dashScopeTaskId
   *      或 intermediate_results.dh.generationTaskId === generationTaskId
   *
   * @param {number|null} generationTaskId — GenerationTask.id（= dh_task_id）
   * @param {string|null} dashScopeTaskId   — GenerationTask.task_id（DashScope task_id）
   * @returns {Promise<boolean>} true 表示对应 PipelineTask 已被取消
   */
  async isPipelineCancelledForGenerationTask(generationTaskId, dashScopeTaskId) {
    // ── 1. 优先：dh_task_id 直接索引 ─────────────────────────────
    if (generationTaskId != null) {
      try {
        const byDhTaskId = await PipelineTask.findOne({
          where: { dh_task_id: generationTaskId }
        });
        if (byDhTaskId) {
          return byDhTaskId.status === 'cancelled';
        }
      } catch (err) {
        // 读失败按「未取消」处理，避免误杀；回调自然推进（扣积分 / 建 Asset）
        console.warn(
          `[DigitalHumanTaskService] isPipelineCancelledForGenerationTask dh_task_id read FAILED (treated as not-cancelled) | ` +
          `generationTaskId=${generationTaskId} | error=${err.message}`
        );
      }
    }

    // ── 2. 兜底：扫描 cancelled PipelineTask，JSON 匹配 ──────────
    try {
      const cancelledPipelines = await PipelineTask.findAll({
        where: { status: 'cancelled' }
      });

      for (const pt of cancelledPipelines) {
        let ir = pt.intermediate_results;
        if (typeof ir === 'string') {
          try {
            ir = JSON.parse(ir);
          } catch (_) {
            ir = null;
          }
        }
        const dh = ir && ir.dh ? ir.dh : null;
        if (!dh) continue;

        if (
          (dashScopeTaskId && dh.providerTaskId === dashScopeTaskId) ||
          (generationTaskId != null && dh.generationTaskId === generationTaskId)
        ) {
          return true;
        }
      }
    } catch (err) {
      console.warn(
        `[DigitalHumanTaskService] isPipelineCancelledForGenerationTask cancelled-scan read FAILED (treated as not-cancelled) | ` +
        `error=${err.message}`
      );
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  观察能力：记录关键节点（Step4-F2，失败不影响主流程）
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 记录流水线关键节点（幂等，try/catch 保护，失败仅告警不中断）
   *
   * @param {number|string} pipelineId
   * @param {string} event   — EVENTS 之一（如 PIPELINE_COMPLETED）
   * @param {Object} [meta]  — 附加信息
   */
  _recordNode(pipelineId, event, meta = {}) {
    try {
      pipelineObservabilityService.recordNode(pipelineId, event, meta);
    } catch (err) {
      console.warn(
        `[DigitalHumanTaskService] recordNode FAILED (ignored) | ` +
        `pipelineId=${pipelineId} | event=${event} | error=${err.message}`
      );
    }
  }
}

module.exports = new DigitalHumanTaskService();
