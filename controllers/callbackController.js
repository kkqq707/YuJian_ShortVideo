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
      updateData.status = 'success';
      updateData.output_url = output?.video_url || output?.url;
      updateData.cover_url = output?.cover_url;
      updateData.duration = usage?.duration || 0;
      updateData.progress = 100;

      // 计算并扣除积分
      const pointsPerSecond = await dashscopeService.getPointsPerSecond(task.model);
      const pointsCost = Math.ceil((usage?.duration || 5) * pointsPerSecond);
      updateData.points_cost = pointsCost;

      // 扣积分
      await adjustEnterpriseQuota({
        enterpriseId: task.enterprise_id,
        changePoints: -pointsCost,
        changeType: 'consume',
        remark: `${task.task_type}生成消耗`,
        relatedId: task.id,
        operatorType: 'system'
      });

    } else if (task_status === 'FAILED' || task_status === 'failed') {
      updateData.status = 'failed';
      updateData.error_msg = output?.message || '生成失败';
    } else if (task_status === 'RUNNING' || task_status === 'running') {
      updateData.status = 'processing';
      updateData.progress = req.body.task_metrics?.pct || 50;
    }

    await task.update(updateData);
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
