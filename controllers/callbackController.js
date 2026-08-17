const { GenerationTask, Enterprise } = require('../models');
const { adjustEnterpriseQuota } = require('../utils/quota');
const dashscopeService = require('../services/dashscopeService');
const digitalHumanTaskService = require('../services/digitalHumanTaskService');
const pipelineObservabilityService = require('../services/pipelineObservabilityService');

// 关键节点事件名（唯一事实来源）
const { EVENTS } = pipelineObservabilityService;

/**
 * 记录流水线关键节点（幂等，try/catch 保护，失败仅告警不中断）
 *
 * @param {number|string} pipelineId
 * @param {string} event   — EVENTS 之一（如 DH_CALLBACK）
 * @param {Object} [meta]  — 附加信息
 */
function recordNode(pipelineId, event, meta = {}) {
  try {
    pipelineObservabilityService.recordNode(pipelineId, event, meta);
  } catch (err) {
    console.warn(
      `[Callback] recordNode FAILED (ignored) | ` +
      `pipelineId=${pipelineId} | event=${event} | error=${err.message}`
    );
  }
}

// 阿里云百炼任务回调
exports.dashscopeCallback = async (req, res) => {
  try {
    const { task_id, task_status, output, usage } = req.body;

    const task = await GenerationTask.findOne({ where: { task_id } });
    if (!task) {
      return res.success({ received: true });
    }

    let updateData = {
      status: task_status
    };

    if (task_status === 'SUCCEEDED' || task_status === 'success') {
      // ── 幂等守卫（Step4-E2 任务1）────────────────────────────────
      // GenerationTask.status === 'success' 表示该 task_id 已被完整处理
      // （扣积分 + 建 Asset + 写回结果）。重复回调直接返回 duplicated，
      // 防止重复 adjustEnterpriseQuota / 重复 storeVideoAndCreateAsset。
      if (task.status === 'success') {
        return res.success({ received: true, duplicated: true });
      }

      // ── 取消回调守卫（Step5-G3）────────────────────────────────
      // 流水线「删除 = 终止」已置 PipelineTask.status='cancelled'，但 DashScope
      // 仍可能回调 SUCCEEDED。命中取消时直接返回，禁止：扣积分、storeVideoAndCreateAsset、
      // handleCallbackCompletion（避免取消任务被误判成功并产生积分/Asset 副作用）。
      const pipelineCancelled =
        await digitalHumanTaskService.isPipelineCancelledForGenerationTask(
          task.id,
          task.task_id
        );
      if (pipelineCancelled) {
        return res.success({ received: true, cancelled: true });
      }

      // 计算并扣除积分（保持原逻辑不变）
      const pointsPerSecond = await dashscopeService.getPointsPerSecond(task.model);
      const pointsCost = Math.ceil((usage?.duration || 5) * pointsPerSecond);

      // 扣积分
      await adjustEnterpriseQuota({
        enterpriseId: task.enterprise_id,
        changePoints: -pointsCost,
        changeType: 'consume',
        remark: `${task.task_type}生成消耗`,
        relatedId: task.id,
        operatorType: 'system'
      });

      // Phase_UI-AICreation-07-KJ-05-D: DashScope 回调时主动触发视频转存+封面生成
      // 覆盖 text2video / image2video / ref2video，解决回调无 cover_url 导致列表无封面的问题
      // Phase DigitalHuman-Rebuild-004 Step4-D5.5: 增加 digital_human task_type
      const VIDEO_TASK_TYPES = ['text2video', 'image2video', 'ref2video', 'digital_human'];
      const videoUrl = output?.video_url || output?.url;

      if (VIDEO_TASK_TYPES.includes(task.task_type) && videoUrl) {
        // 视频任务：调用 storeVideoAndCreateAsset 下载视频 → 上传 OSS → ffmpeg 提取封面 → 创建 Asset
        const { storeVideoAndCreateAsset } = require('./enterprise/videoGenerationController');
        await storeVideoAndCreateAsset(
          task,
          task.enterprise_id,
          task.user_id,
          videoUrl,
          output?.cover_url || null,
          usage?.duration || 0
        );
        // storeVideoAndCreateAsset 内部已更新 task（status、output_url、cover_url、output_asset_id）
        // 补充 points_cost（该字段不在 storeVideoAndCreateAsset 的更新范围内）
        await task.update({ points_cost: pointsCost });
      } else {
        // 非视频任务（如 text2image）：保持原更新逻辑
        updateData.status = 'success';
        updateData.output_url = videoUrl;
        updateData.cover_url = output?.cover_url;
        updateData.duration = usage?.duration || 0;
        updateData.progress = 100;
        updateData.points_cost = pointsCost;
        await task.update(updateData);
      }

    } else if (task_status === 'FAILED' || task_status === 'failed') {
      updateData.status = 'failed';
      updateData.error_msg = output?.message || '生成失败';
      await task.update(updateData);
    } else if (task_status === 'RUNNING' || task_status === 'running') {
      updateData.status = 'processing';
      updateData.progress = req.body.task_metrics?.pct || 50;
      await task.update(updateData);
    }

    // Phase DigitalHuman-Rebuild-004 Step4-D6 / Step4-E4:
    // digital_human 回调 → 找到 PipelineTask → 复用 handleCompletedTask 完成闭环
    // 不新增下载/Asset 逻辑，全部委托给 digitalHumanTaskService。
    //
    // Step4-E4 修复 A2（状态分叉）：
    //   1. 仅 SUCCEEDED / FAILED 终态触发（RUNNING 不再触发，避免处理中误判为完成）；
    //   2. 回调 task_status 作为第一状态源，交由 handleCallbackCompletion 直接使用，
    //      不再二次查询 Provider。
    if (task.task_type === 'digital_human') {
      const isTerminalStatus =
        task_status === 'SUCCEEDED' || task_status === 'success' ||
        task_status === 'FAILED' || task_status === 'failed';

      if (isTerminalStatus) {
        try {
          const completionResult = await digitalHumanTaskService.handleCallbackCompletion(
            task,
            task_status,
            output?.video_url || output?.url
          );

          // Step4-F2: 记录 DH_CALLBACK 关键节点（仅记录，失败不影响主流程）
          recordNode(completionResult && completionResult.pipelineId, EVENTS.DH_CALLBACK, {
            providerTaskId: task.task_id,
            callbackStatus: task_status,
            pipelineStatus: completionResult && completionResult.status
          });
        } catch (err) {
          console.error(
            `[Callback] digital_human PipelineTask completion failed: ${err.message || 'Unknown error'}`
          );
        }
      }
    }

    res.success({ received: true });

  } catch (error) {
    console.error('[Callback] DashScope callback processing failed:', error.message || 'Unknown error');
    res.success({ received: true });
  }
};

// OSS回调（可选）
exports.ossCallback = async (req, res) => {
  res.success({ received: true });
};
