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
const { PipelineTask } = require('../models');

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
}

module.exports = new DigitalHumanTaskService();
