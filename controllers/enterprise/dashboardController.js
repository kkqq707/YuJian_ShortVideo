const { Op } = require('sequelize');
const { GenerationTask, EnterpriseUser, QuotaLog } = require('../../models');

exports.overview = async (req, res) => {
  const enterpriseId = req.user.enterpriseId;

  const [taskCount, todayTasks, memberCount, quotaLog] = await Promise.all([
    GenerationTask.count({ where: { enterprise_id: enterpriseId } }),
    GenerationTask.count({
      where: {
        enterprise_id: enterpriseId,
        created_at: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) }
      }
    }),
    EnterpriseUser.count({ where: { enterprise_id: enterpriseId, status: 1 } }),
    QuotaLog.sum('points_change', {
      where: {
        user_type: 'enterprise',
        user_id: enterpriseId,
        change_type: 'consume',
        created_at: { [Op.gte]: new Date(new Date().setDate(new Date().getDate() - 30)) }
      }
    })
  ]);

  res.success({
    stats: {
      total_tasks: taskCount,
      today_tasks: todayTasks,
      member_count: memberCount,
      month_consume: Math.abs(quotaLog || 0)
    }
  });
};

exports.usageTrend = async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const enterpriseId = req.user.enterpriseId;
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const consume = await QuotaLog.sum('points_change', {
      where: {
        user_type: 'enterprise',
        user_id: enterpriseId,
        change_type: 'consume',
        created_at: { [Op.between]: [dayStart, dayEnd] }
      }
    }) || 0;

    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    result.push({ date: dateStr, consume: Math.abs(consume) });
  }

  res.success(result);
};

exports.recentTasks = async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const tasks = await GenerationTask.findAll({
    where: { enterprise_id: req.user.enterpriseId },
    order: [['id', 'DESC']],
    limit
  });
  res.success(tasks);
};
