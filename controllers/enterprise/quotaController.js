const { Op } = require('sequelize');
const { Enterprise, QuotaLog, Order, Plan } = require('../../models');
const { adjustEnterpriseQuota, generateOrderNo } = require('../../utils/quota');

// 查询积分余额
exports.balance = async (req, res) => {
  const enterprise = await Enterprise.findByPk(req.user.enterpriseId);
  res.success({
    balance: enterprise.quota_balance,
    plan_id: enterprise.plan_id,
    expire_at: enterprise.expire_at
  });
};

// 积分流水
exports.logs = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;

  const { count, rows } = await QuotaLog.findAndCountAll({
    where: {
      user_type: 'enterprise',
      user_id: req.user.enterpriseId
    },
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize
  });

  res.success({ list: rows, total: count, page, pageSize });
};

// 购买积分（模拟支付，直接到账）
exports.purchase = async (req, res) => {
  const { plan_id, points, amount } = req.body;

  const orderNo = generateOrderNo('ENT');

  const order = await Order.create({
    order_no: orderNo,
    user_type: 'enterprise',
    user_id: req.user.enterpriseId,
    plan_id,
    type: 'quota_recharge',
    amount: amount || 0,
    quota_points: points || 0,
    status: 'paid',
    paid_at: new Date(),
    payment_method: 'offline'
  });

  // 加积分
  if (points && points > 0) {
    await adjustEnterpriseQuota({
      enterpriseId: req.user.enterpriseId,
      changePoints: parseInt(points),
      changeType: 'recharge',
      remark: '购买积分',
      relatedId: order.id,
      operatorType: 'user',
      operatorId: req.user.userId
    });
  }

  res.success({ order_no: orderNo, message: '购买成功' });
};

// 套餐列表
exports.plans = async (req, res) => {
  const plans = await Plan.findAll({
    where: { status: 1 },
    order: [['sort', 'ASC']]
  });
  res.success(plans);
};
