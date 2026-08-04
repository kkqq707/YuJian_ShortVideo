const { Op } = require('sequelize');
const { GenerationTask, Enterprise } = require('../../models');

exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const status = req.query.status;
  const taskType = req.query.task_type;

  const where = {};
  if (status) where.status = status;
  if (taskType) where.task_type = taskType;

  const { count, rows } = await GenerationTask.findAndCountAll({
    where,
    include: [{ model: Enterprise, attributes: ['id', 'company_name'] }],
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

exports.stats = async (req, res) => {
  const total = await GenerationTask.count();
  const success = await GenerationTask.count({ where: { status: 'success' } });
  const failed = await GenerationTask.count({ where: { status: 'failed' } });
  const processing = await GenerationTask.count({ where: { status: 'processing' } });

  res.success({ total, success, failed, processing });
};

exports.detail = async (req, res) => {
  const task = await GenerationTask.findByPk(req.params.id);
  if (!task) return res.fail('任务不存在');
  res.success(task);
};
