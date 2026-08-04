const { Op } = require('sequelize');
const { Enterprise, Order, QuotaLog, GenerationTask } = require('../../models');

exports.overview = async (req, res) => {
  const agentId = req.user.agentId;

  const [enterpriseCount, orderCount, totalRevenue, totalQuota, usedQuota] = await Promise.all([
    Enterprise.count({ where: { agent_id: agentId } }),
    Order.count({ where: { user_type: 'enterprise', status: 'paid' } }),
    Order.sum('amount', { where: { user_type: 'enterprise', status: 'paid' } }) || 0,
    // 代理商总额度和已用额度从Agent表取，这里简化
    0, 0
  ]);

  res.success({
    stats: {
      enterprise_count: enterpriseCount,
      total_orders: orderCount,
      total_revenue: parseFloat(totalRevenue),
      total_quota: totalQuota,
      used_quota: usedQuota
    }
  });
};

exports.enterpriseGrowth = async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const agentId = req.user.agentId;
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const count = await Enterprise.count({
      where: { agent_id: agentId, created_at: { [Op.between]: [dayStart, dayEnd] } }
    });

    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    result.push({ date: dateStr, count });
  }

  res.success(result);
};

exports.quotaUsage = async (req, res) => {
  const agentId = req.user.agentId;
  const enterprises = await Enterprise.findAll({
    where: { agent_id: agentId },
    attributes: ['id', 'company_name', 'quota_balance'],
    order: [['quota_balance', 'DESC']],
    limit: 10
  });
  res.success(enterprises);
};
