const { Op } = require('sequelize');
const { Order, Plan } = require('../../models');

exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const status = req.query.status;
  const userType = req.query.user_type;

  const where = {};
  if (status) where.status = status;
  if (userType) where.user_type = userType;

  const { count, rows } = await Order.findAndCountAll({
    where,
    include: [{ model: Plan, attributes: ['id', 'name'] }],
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize
  });

  res.success({
    list: rows,
    total: count,
    page,
    pageSize
  });
};

exports.detail = async (req, res) => {
  const order = await Order.findByPk(req.params.id, {
    include: [{ model: Plan }]
  });
  if (!order) return res.fail('订单不存在');
  res.success(order);
};
