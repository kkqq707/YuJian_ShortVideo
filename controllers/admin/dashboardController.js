const { Op } = require('sequelize');
const { 
  Agent, Enterprise, EnterpriseUser, 
  Order, QuotaLog, GenerationTask, OperationLog 
} = require('../../models');

exports.overview = async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    agentCount, enterpriseCount, userCount, taskCount,
    todayNewEnterprises, todayTasks,
    totalRevenue, todayRevenue
  ] = await Promise.all([
    Agent.count(),
    Enterprise.count(),
    EnterpriseUser.count(),
    GenerationTask.count(),
    Enterprise.count({ where: { created_at: { [Op.gte]: todayStart } } }),
    GenerationTask.count({ where: { created_at: { [Op.gte]: todayStart } } }),
    Order.sum('amount', { where: { status: 'paid' } }) || 0,
    Order.sum('amount', { where: { status: 'paid', paid_at: { [Op.gte]: todayStart } } }) || 0
  ]);

  const totalPointsConsumed = await QuotaLog.sum('points_change', {
    where: { change_type: 'consume', points_change: { [Op.lt]: 0 } }
  }) || 0;

  res.success({
    stats: {
      agent_count: agentCount,
      enterprise_count: enterpriseCount,
      user_count: userCount,
      task_count: taskCount,
      today_new_enterprises: todayNewEnterprises,
      today_tasks: todayTasks,
      total_revenue: parseFloat(totalRevenue),
      today_revenue: parseFloat(todayRevenue),
      total_points_consumed: Math.abs(totalPointsConsumed)
    }
  });
};

exports.revenueTrend = async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const dayRevenue = await Order.sum('amount', {
      where: { status: 'paid', paid_at: { [Op.between]: [dayStart, dayEnd] } }
    }) || 0;

    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    result.push({ date: dateStr, revenue: parseFloat(dayRevenue) });
  }

  res.success(result);
};

exports.userGrowth = async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const newEnterprises = await Enterprise.count({
      where: { created_at: { [Op.between]: [dayStart, dayEnd] } }
    });
    const newAgents = await Agent.count({
      where: { created_at: { [Op.between]: [dayStart, dayEnd] } }
    });

    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    result.push({ date: dateStr, new_enterprises: newEnterprises, new_agents: newAgents });
  }

  res.success(result);
};

exports.taskStats = async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const total = await GenerationTask.count({ where: { created_at: { [Op.between]: [dayStart, dayEnd] } } });
    const success = await GenerationTask.count({ where: { created_at: { [Op.between]: [dayStart, dayEnd] }, status: 'success' } });
    const failed = await GenerationTask.count({ where: { created_at: { [Op.between]: [dayStart, dayEnd] }, status: 'failed' } });

    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    result.push({ date: dateStr, total, success, failed });
  }

  const typeStats = await GenerationTask.findAll({
    attributes: ['task_type', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
    group: 'task_type'
  });

  res.success({ daily: result, by_type: typeStats });
};

exports.recentLogs = async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const logs = await OperationLog.findAll({ limit, order: [['id', 'DESC']] });
  res.success(logs);
};

exports.systemStatus = async (req, res) => {
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  
  const todayCalls = await GenerationTask.count({ where: { created_at: { [Op.gte]: todayStart } } });
  const successCount = await GenerationTask.count({ where: { created_at: { [Op.gte]: todayStart }, status: 'success' } });
  const successRate = todayCalls > 0 ? ((successCount / todayCalls) * 100).toFixed(1) + '%' : '100%';
  const totalQuota = await Enterprise.sum('quota_balance') || 0;

  res.success({
    api_status: 'normal',
    today_calls: todayCalls,
    success_rate: successRate,
    total_quota_pool: totalQuota,
    uptime: process.uptime()
  });
};
