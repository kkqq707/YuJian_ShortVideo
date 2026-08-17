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
const dashscopeService = require('./dashscopeService');
const { PipelineTask, GenerationTask } = require('../models');
const { adjustEnterpriseQuota } = require('../utils/quota');

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

      // ── 4. 委托唯一 Completion Workflow（下载→OSS→Asset→收敛→计费）──
      // Step6-E3B：Polling 只负责驱动，不亲自下载 / 建 Asset / 扣积分。
      console.log(
        `[DigitalHumanTaskService] DH task SUCCESS — delegating to completeDigitalHumanTask | ` +
        `pipelineTaskId=${pipelineTaskId} | ` +
        `dhTaskId=${dhTaskId} | ` +
        `time=${new Date().toISOString()}`
      );

      return this.completeDigitalHumanTask(pipelineTask, {
        videoUrl,
        duration: dhStatus.duration || undefined,
        dhTaskStatus: dhStatus.status
      });
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
  //  2.5 completeDigitalHumanTask — 唯一 Completion Workflow（Step6-E3B）
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 数字人口播唯一完成流程（幂等，Polling 与未来 Callback 都只调用它）
   *
   * Step6-E3B / E3B.1 最终设计：统一收尾 Asset → GenerationTask → PipelineTask
   * → Quota 四个对象，保证 GenerationTask 与 PipelineTask 共用同一个 Asset，
   * 积分只扣一次。
   *
   * 固定顺序（计费最后）：
   *   1. 幂等预守卫：status !== 'digital_human' → skip
   *   2. 定位 GenerationTask（dh_task_id → generationTaskId → providerTaskId）
   *   3. 下载 + OSS + 建 Asset（downloadAndSaveVideoAsset 含 output_asset_id 幂等守卫）
   *   4. 收敛 GenerationTask（status/output_asset_id/output_url/cover_url/duration/completed_at，★不写 points_cost）
   *   5. 收敛 PipelineTask（output_asset_id 同源 + status=success + progress=100）
   *   6. 计费（最后、原子、幂等）：adjustEnterpriseQuota（dedupeKey → 事务内 consume 查重）
   *        → 成功 → 写 GenerationTask.points_cost（纯审计字段，不作扣费判重）
   *        → 失败 → 响亮日志 + 错误诊断，任务已 success 但未计费，等待重扫对账
   *
   * 禁止：
   *   ❌ 以 GenerationTask.points_cost > 0 作扣费幂等（E3B.1 已否决）
   *   ❌ 事务外「先查后扣」两段事务
   *
   * @param {Object} pipelineTask — PipelineTask instance（status='digital_human'）
   * @param {Object} [ctx]
   * @param {string} ctx.videoUrl       — DashScope 成功态 video_url（必填）
   * @param {number} [ctx.duration]     — 视频时长（秒，可选）
   * @param {string} [ctx.dhTaskStatus] — DH 任务状态（透传返回，可选）
   * @returns {Promise<{
   *   status: string,
   *   pipelineId: number,
   *   dhTaskStatus: string|null,
   *   assetId: number|null,
   *   videoUrl: string|null,
   *   generationTaskId: number|null,
   *   billed: boolean,
   *   pointsCost: number|null
   * }>}
   */
  async completeDigitalHumanTask(pipelineTask, ctx = {}) {
    const pipelineId = pipelineTask.id;
    const enterpriseId = pipelineTask.enterprise_id;
    const startTime = Date.now();

    console.log(
      `[DigitalHumanTaskService] completeDigitalHumanTask START | ` +
      `pipelineId=${pipelineId} | enterpriseId=${enterpriseId} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 1. 幂等预守卫：非 digital_human → 已处理 ─────────────────
    if (pipelineTask.status !== 'digital_human') {
      console.log(
        `[DigitalHumanTaskService] completeDigitalHumanTask SKIP | ` +
        `pipelineId=${pipelineId} | reason=status "${pipelineTask.status}" != "digital_human"`
      );
      return {
        status: 'skipped',
        pipelineId,
        dhTaskStatus: ctx.dhTaskStatus || null,
        assetId: pipelineTask.output_asset_id || null,
        videoUrl: null,
        generationTaskId: null,
        billed: false,
        pointsCost: null
      };
    }

    // ── 2. 定位 GenerationTask ──────────────────────────────────
    const generationTask = await this._resolveDigitalHumanGenerationTask(pipelineTask);
    if (!generationTask) {
      const errMsg = `No GenerationTask resolved for pipelineId=${pipelineId}`;
      console.error(`[DigitalHumanTaskService] completeDigitalHumanTask ${errMsg}`);
      await pipelineTaskService.markFailed(pipelineId, 'dh', errMsg);
      this._recordNode(pipelineId, EVENTS.PIPELINE_FAILED, { failedLayer: 'dh' });
      return {
        status: 'failed',
        pipelineId,
        dhTaskStatus: ctx.dhTaskStatus || null,
        assetId: null,
        videoUrl: null,
        generationTaskId: null,
        billed: false,
        pointsCost: null
      };
    }

    const generationTaskId = generationTask.id;

    // ── 3. 下载 + OSS + 建 Asset（幂等：output_asset_id 已存在则复用）──
    if (!ctx.videoUrl) {
      const errMsg = 'DH task succeeded but no videoUrl provided to Completion Workflow';
      console.error(`[DigitalHumanTaskService] completeDigitalHumanTask ${errMsg} | pipelineId=${pipelineId}`);
      await pipelineTaskService.markFailed(pipelineId, 'dh', errMsg);
      this._recordNode(pipelineId, EVENTS.PIPELINE_FAILED, { failedLayer: 'dh' });
      return {
        status: 'failed',
        pipelineId,
        dhTaskStatus: ctx.dhTaskStatus || null,
        assetId: null,
        videoUrl: null,
        generationTaskId,
        billed: false,
        pointsCost: null
      };
    }

    const assetResult = await pipelineAssetService.downloadAndSaveVideoAsset(
      pipelineTask,
      ctx.videoUrl,
      { duration: ctx.duration || undefined, mimeType: 'video/mp4' }
    );

    const assetId = assetResult.assetId || null;
    if (!assetId) {
      const errMsg = 'Failed to create video Asset from DH result';
      console.error(`[DigitalHumanTaskService] completeDigitalHumanTask ${errMsg} | pipelineId=${pipelineId}`);
      await pipelineTaskService.markFailed(pipelineId, 'dh', errMsg);
      this._recordNode(pipelineId, EVENTS.PIPELINE_FAILED, { failedLayer: 'dh' });
      return {
        status: 'failed',
        pipelineId,
        dhTaskStatus: ctx.dhTaskStatus || null,
        assetId: null,
        videoUrl: assetResult.videoUrl || ctx.videoUrl || null,
        generationTaskId,
        billed: false,
        pointsCost: null
      };
    }

    const outputUrl = assetResult.videoUrl || ctx.videoUrl;
    const coverUrl = assetResult.coverUrl || null;
    const duration = assetResult.duration || ctx.duration || null;

    // ── 4. 收敛 GenerationTask（★ 此处不写 points_cost）──────────
    await generationTask.update({
      status: 'success',
      progress: 100,
      output_asset_id: assetId,
      output_url: outputUrl,
      cover_url: coverUrl,
      duration: duration || null,
      completed_at: new Date()
    });

    // ── 5. 收敛 PipelineTask（output_asset_id 与 GenerationTask 同源）──
    await pipelineTaskService.updateStatus(pipelineId, 'success', {
      completed_at: new Date()
    });
    await pipelineTaskService.updateProgress(pipelineId, 100);
    await pipelineTaskService.saveIntermediateResult(pipelineId, 'dh', {
      providerTaskId: generationTask.task_id || null,
      generationTaskId,
      dhStatus: 'success',
      outputAssetId: assetId,
      videoUrl: outputUrl,
      duration: duration || null,
      completedAt: new Date().toISOString()
    });

    if (assetId) {
      this._recordNode(pipelineId, EVENTS.ASSET_CREATED, { layer: 'dh', assetId });
    }
    this._recordNode(pipelineId, EVENTS.PIPELINE_COMPLETED, { layer: 'dh' });

    // ── 6. 计费（最后、原子、幂等）─────────────────────────────
    const billing = await this._billDigitalHumanCompletion(pipelineId, generationTask, duration);

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[DigitalHumanTaskService] completeDigitalHumanTask SUCCESS | ` +
      `pipelineId=${pipelineId} | generationTaskId=${generationTaskId} | ` +
      `assetId=${assetId} | billed=${billing.billed} | ` +
      `pointsCost=${billing.pointsCost ?? 'N/A'} | elapsedMs=${elapsedMs} | ` +
      `time=${new Date().toISOString()}`
    );

    return {
      status: 'success',
      pipelineId,
      dhTaskStatus: ctx.dhTaskStatus || null,
      assetId,
      videoUrl: outputUrl || null,
      generationTaskId,
      billed: billing.billed,
      pointsCost: billing.pointsCost
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  2.6 计费（最后一步，Step6-E3B.1）— 以 QuotaLog consume 存在为幂等依据
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 扣积分一次（at-most-once）：事务内查重 + Enterprise 行锁串行化。
   *
   * 判重键 = quota_logs(user_type='enterprise', change_type='consume', related_id=GenerationTask.id)，
   * 与余额扣减同事务原子提交。points_cost 仅作审计字段、随扣费成功补写，不作判重。
   *
   * @param {number} pipelineId    — PipelineTask 主键 ID（用于错误诊断）
   * @param {Object} generationTask — GenerationTask instance
   * @param {number} [duration]    — 计费时长（秒，回退 5）
   * @returns {Promise<{ billed: boolean, pointsCost: number|null }>}
   */
  async _billDigitalHumanCompletion(pipelineId, generationTask, duration) {
    let pointsCost = null;
    try {
      const pointsPerSecond = await dashscopeService.getPointsPerSecond(generationTask.model);
      const billingDuration = duration || 5;
      pointsCost = Math.ceil(billingDuration * pointsPerSecond);

      const billingResult = await adjustEnterpriseQuota({
        enterpriseId: generationTask.enterprise_id,
        changePoints: -pointsCost,
        changeType: 'consume',
        remark: `${generationTask.task_type}生成消耗`,
        relatedId: generationTask.id,
        operatorType: 'system',
        dedupeKey: { changeType: 'consume', relatedId: generationTask.id }
      });

      if (billingResult.success) {
        // points_cost 仅作审计字段：仅在尚未写入时补写，绝不作扣费幂等依据（E3B.1）
        const currentCost = Number(generationTask.points_cost || 0);
        if (currentCost === 0) {
          await generationTask.update({ points_cost: pointsCost });
        }
        return { billed: true, pointsCost };
      }

      // 扣费失败（余额不足 / 异常）：任务已 success，但未计费。响亮日志 + 错误诊断，等待重扫对账。
      console.error(
        `[DigitalHumanTaskService] BILLING FAILED (task completed, not billed) | ` +
        `pipelineId=${pipelineId} | generationTaskId=${generationTask.id} | ` +
        `enterpriseId=${generationTask.enterprise_id} | pointsCost=${pointsCost} | ` +
        `reason=${billingResult.message || 'unknown'} | ` +
        `time=${new Date().toISOString()}`
      );
      this._recordError(pipelineId, {
        errorCode: 'BILLING_FAILED',
        failedLayer: 'dh',
        providerMessage: billingResult.message || 'billing failed'
      });

      return { billed: false, pointsCost };
    } catch (error) {
      console.error(
        `[DigitalHumanTaskService] BILLING EXCEPTION (task completed, not billed) | ` +
        `pipelineId=${pipelineId} | generationTaskId=${generationTask.id} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      this._recordError(pipelineId, {
        errorCode: 'BILLING_EXCEPTION',
        failedLayer: 'dh',
        providerMessage: error.message
      });

      return { billed: false, pointsCost };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  2.7 定位 DH GenerationTask（dh_task_id → generationTaskId → providerTaskId）
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 由 PipelineTask 定位其 DigitalHuman GenerationTask。
   *
   * 匹配顺序（与 handleCallbackCompletion 对齐）：
   *   1. PipelineTask.dh_task_id 直接索引（Step4-D7 回填 = GenerationTask.id）
   *   2. intermediate_results.dh.generationTaskId
   *   3. intermediate_results.dh.providerTaskId（= DashScope task_id）
   *
   * @param {Object} pipelineTask — PipelineTask instance
   * @returns {Promise<Object|null>} GenerationTask instance 或 null
   */
  async _resolveDigitalHumanGenerationTask(pipelineTask) {
    // ── 1. dh_task_id 直接索引 ──────────────────────────────────
    if (pipelineTask.dh_task_id != null) {
      const byDhTaskId = await GenerationTask.findByPk(pipelineTask.dh_task_id);
      if (byDhTaskId) return byDhTaskId;
    }

    // ── 2. intermediate_results.dh 兜底 ─────────────────────────
    let ir = pipelineTask.intermediate_results;
    if (typeof ir === 'string') {
      try {
        ir = JSON.parse(ir);
      } catch (_) {
        ir = null;
      }
    }
    const dh = ir && ir.dh ? ir.dh : null;
    if (!dh) return null;

    if (dh.generationTaskId != null) {
      const byGenId = await GenerationTask.findByPk(dh.generationTaskId);
      if (byGenId) return byGenId;
    }

    if (dh.providerTaskId) {
      const byProvider = await GenerationTask.findOne({
        where: { task_id: dh.providerTaskId }
      });
      if (byProvider) return byProvider;
    }

    return null;
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

  /**
   * 记录错误诊断（计费失败等，try/catch 保护，失败仅告警不中断）
   *
   * @param {number|string} pipelineId
   * @param {Object} [info] — { errorCode, failedLayer, providerMessage }
   */
  _recordError(pipelineId, info = {}) {
    try {
      pipelineObservabilityService.recordError(pipelineId, info);
    } catch (err) {
      console.warn(
        `[DigitalHumanTaskService] recordError FAILED (ignored) | ` +
        `pipelineId=${pipelineId} | error=${err.message}`
      );
    }
  }
}

module.exports = new DigitalHumanTaskService();
