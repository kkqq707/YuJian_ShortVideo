const { GenerationTask, Enterprise } = require('../models');
const { adjustEnterpriseQuota } = require('../utils/quota');
const dashscopeService = require('../services/dashscopeService');

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
