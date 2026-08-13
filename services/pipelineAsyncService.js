/**
 * Pipeline Async Service — 数字人流水线异步任务扫描
 *
 * Phase DigitalHuman-Rebuild-004 Step4-D6
 *
 * 职责：
 *   1. 单次扫描 status='digital_human' 的 PipelineTask
 *   2. 逐个调用 digitalHumanTaskService.handleCompletedTask()
 *   3. 超时检测：基于 started_at（回退 createdAt），超时则 markFailed
 *
 * 设计原则：
 *   - 仅提供「Service 层单次扫描能力」，不是队列 / Worker / 定时任务系统
 *   - 不引入 BullMQ / Redis Queue / 消息队列
 *   - 不修改 PipelineTask 状态机定义
 *   - 复用 digitalHumanTaskService.handleCompletedTask()（含下载 + Asset 流程）
 *   - 复用 pipelineTaskService.markFailed()
 *
 * 禁止：
 *   ❌ 修改 models / migrations
 *   ❌ 修改 Provider 层
 *   ❌ 修改 pipelineOrchestrator 主流程
 *   ❌ 轮询循环 / 定时器 / 队列
 *   ❌ 新增 timeout 字段（使用已有 started_at / createdAt）
 */

const { PipelineTask } = require('../models');
const digitalHumanTaskService = require('./digitalHumanTaskService');
const pipelineTaskService = require('./pipelineTaskService');

// ─── DigitalHuman 异步任务默认超时阈值 ─────────────────────────────
// 30 分钟。可通过 options.timeoutMs 覆盖（测试用），禁止新增 DB 字段。
const DH_TIMEOUT_MS = 30 * 60 * 1000;

class PipelineAsyncService {
  // ═══════════════════════════════════════════════════════════════════════
  //  scanPendingDigitalHumanTasks — 单次扫描
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 扫描所有 status='digital_human' 的 PipelineTask 并驱动其完成
   *
   * 流程（逐任务）：
   *   1. 超时检测：started_at（回退 createdAt）超过阈值 → markFailed('digital_human')
   *   2. 否则调用 digitalHumanTaskService.handleCompletedTask(id)
   *   3. 依据返回的 status 累计 completed / failed / pending
   *
   * 不引入循环轮询 / 定时器 / 队列，仅单次扫描。
   *
   * @param {Object} [options]
   * @param {number} [options.timeoutMs] — 超时阈值（默认 30 分钟，测试可覆盖）
   * @returns {Promise<{ scanned: number, completed: number, failed: number, pending: number }>}
   */
  async scanPendingDigitalHumanTasks(options = {}) {
    const timeoutMs = options.timeoutMs != null ? options.timeoutMs : DH_TIMEOUT_MS;

    console.log(
      `[PipelineAsyncService] scanPendingDigitalHumanTasks START | ` +
      `timeoutMs=${timeoutMs} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 1. 查询 status='digital_human' 的 PipelineTask ────────────
    const tasks = await PipelineTask.findAll({
      where: { status: 'digital_human' }
    });

    const result = {
      scanned: tasks.length,
      completed: 0,
      failed: 0,
      pending: 0
    };

    console.log(
      `[PipelineAsyncService] scanned ${tasks.length} pending digital_human task(s) | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 2. 逐个处理 ──────────────────────────────────────────────
    for (const task of tasks) {
      // ── 2a. 超时检测 ─────────────────────────────────────────
      if (this._isTimedOut(task, timeoutMs)) {
        const reason =
          `DigitalHuman task timed out after ${Math.round(timeoutMs / 60000)} minutes`;
        console.warn(
          `[PipelineAsyncService] TIMEOUT | ` +
          `pipelineId=${task.id} | ${reason} | ` +
          `time=${new Date().toISOString()}`
        );

        try {
          await pipelineTaskService.markFailed(task.id, 'digital_human', reason);
          result.failed++;
        } catch (error) {
          console.error(
            `[PipelineAsyncService] markFailed (timeout) FAILED | ` +
            `pipelineId=${task.id} | error=${error.message}`
          );
          result.failed++;
        }
        continue;
      }

      // ── 2b. 调用 handleCompletedTask ─────────────────────────
      try {
        const outcome = await digitalHumanTaskService.handleCompletedTask(task.id);

        if (outcome.status === 'success') {
          result.completed++;
        } else if (outcome.status === 'failed') {
          result.failed++;
        } else {
          // pending | skipped | error → 仍未完成
          result.pending++;
        }
      } catch (error) {
        console.error(
          `[PipelineAsyncService] handleCompletedTask FAILED | ` +
          `pipelineId=${task.id} | error=${error.message} | ` +
          `time=${new Date().toISOString()}`
        );
        result.failed++;
      }
    }

    console.log(
      `[PipelineAsyncService] scanPendingDigitalHumanTasks RESULT | ` +
      `scanned=${result.scanned} | completed=${result.completed} | ` +
      `failed=${result.failed} | pending=${result.pending} | ` +
      `time=${new Date().toISOString()}`
    );

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  内部方法
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 判断 PipelineTask 是否超过 DigitalHuman 超时阈值
   *
   * 使用已有字段：优先 started_at，回退 createdAt。
   * 两者均缺失时无法判断超时，返回 false（不做误判）。
   *
   * @param {Object} task      — PipelineTask instance
   * @param {number} timeoutMs — 超时阈值（毫秒）
   * @returns {boolean}
   */
  _isTimedOut(task, timeoutMs) {
    const baseline = task.started_at || task.createdAt;
    if (!baseline) return false;

    const baselineMs = baseline instanceof Date
      ? baseline.getTime()
      : new Date(baseline).getTime();

    if (isNaN(baselineMs)) return false;

    return (Date.now() - baselineMs) > timeoutMs;
  }
}

module.exports = new PipelineAsyncService();
