const { Agent, Enterprise, QuotaLog, sequelize } = require('../models');

exports.adjustAgentQuota = async ({ agentId, changePoints, changeType, remark, relatedId, operatorId }) => {
  const t = await sequelize.transaction();
  
  try {
    const agent = await Agent.findByPk(agentId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!agent) throw new Error('代理商不存在');

    const pointsBefore = agent.used_quota;
    const pointsAfter = pointsBefore + changePoints;
    
    if (changePoints < 0 && pointsAfter < 0) {
      throw new Error('代理商额度不足');
    }

    await agent.update({ used_quota: pointsAfter }, { transaction: t });

    await QuotaLog.create({
      user_type: 'agent',
      user_id: agentId,
      change_type: changeType,
      points_before: pointsBefore,
      points_change: changePoints,
      points_after: pointsAfter,
      remark,
      related_id: relatedId,
      operator_type: 'admin',
      operator_id: operatorId
    }, { transaction: t });

    await t.commit();
    return { success: true, balance: agent.total_quota - pointsAfter };
  } catch (error) {
    await t.rollback();
    return { success: false, message: error.message };
  }
};

exports.adjustEnterpriseQuota = async ({ enterpriseId, changePoints, changeType, remark, relatedId, operatorType = 'system', operatorId }) => {
  const t = await sequelize.transaction();
  
  try {
    const enterprise = await Enterprise.findByPk(enterpriseId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!enterprise) throw new Error('企业不存在');

    const pointsBefore = enterprise.quota_balance;
    const pointsAfter = pointsBefore + changePoints;
    
    if (changePoints < 0 && pointsAfter < 0) {
      throw new Error('积分余额不足');
    }

    await enterprise.update({ quota_balance: pointsAfter }, { transaction: t });

    await QuotaLog.create({
      user_type: 'enterprise',
      user_id: enterpriseId,
      change_type: changeType,
      points_before: pointsBefore,
      points_change: changePoints,
      points_after: pointsAfter,
      remark,
      related_id: relatedId,
      operator_type: operatorType,
      operator_id: operatorId
    }, { transaction: t });

    await t.commit();
    return { success: true, balance: pointsAfter };
  } catch (error) {
    await t.rollback();
    return { success: false, message: error.message };
  }
};

exports.generateOrderNo = (prefix = 'ORD') => {
  const date = new Date();
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${dateStr}${random}`;
};
