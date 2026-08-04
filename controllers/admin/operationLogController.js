const { OperationLog } = require('../../models');

exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const module = req.query.module;
  const userType = req.query.user_type;

  const where = {};
  if (module) where.module = module;
  if (userType) where.user_type = userType;

  const { count, rows } = await OperationLog.findAndCountAll({
    where,
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
