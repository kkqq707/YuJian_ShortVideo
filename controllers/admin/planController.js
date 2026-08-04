const { Plan } = require('../../models');

exports.list = async (req, res) => {
  const list = await Plan.findAll({
    where: { status: 1 },
    order: [['sort', 'ASC'], ['id', 'ASC']]
  });
  res.success(list);
};

exports.all = async (req, res) => {
  const list = await Plan.findAll({ order: [['sort', 'ASC'], ['id', 'ASC']] });
  res.success(list);
};

exports.create = async (req, res) => {
  const plan = await Plan.create(req.body);
  res.success(plan);
};

exports.update = async (req, res) => {
  const plan = await Plan.findByPk(req.params.id);
  if (!plan) return res.fail('套餐不存在');
  await plan.update(req.body);
  res.success(plan);
};

exports.remove = async (req, res) => {
  const plan = await Plan.findByPk(req.params.id);
  if (!plan) return res.fail('套餐不存在');
  await plan.destroy();
  res.success({ message: '删除成功' });
};
