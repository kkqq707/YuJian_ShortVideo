const { Op } = require('sequelize');
const { Order, Enterprise } = require('../../models');

exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const status = req.query.status;

  const where = { user_type: 'enterprise' };
  if (status) where.status = status;

  const { count, rows } = await Order.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize
  });

  res.success({ list: rows, total: count, page, pageSize });
};
