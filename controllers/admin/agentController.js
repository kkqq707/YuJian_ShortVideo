const { Op } = require('sequelize');
const { Agent, Enterprise } = require('../../models');
const { adjustAgentQuota } = require('../../utils/quota');

exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const keyword = req.query.keyword || '';
  const status = req.query.status;

  const where = {};
  if (keyword) {
    where[Op.or] = [
      { company_name: { [Op.like]: `%${keyword}%` } },
      { username: { [Op.like]: `%${keyword}%` } }
    ];
  }
  if (status) where.status = status;

  const { count, rows } = await Agent.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize
  });

  // 统计每个代理商的企业数
  const list = await Promise.all(rows.map(async (agent) => {
    const enterpriseCount = await Enterprise.count({ where: { agent_id: agent.id } });
    return { ...agent.toJSON(), enterprise_count: enterpriseCount };
  }));

  res.success({
    list,
    total: count,
    page,
    pageSize
  });
};

exports.detail = async (req, res) => {
  const agent = await Agent.findByPk(req.params.id);
  if (!agent) return res.fail('代理商不存在');
  res.success(agent);
};

exports.create = async (req, res) => {
  const { username, password, company_name, contact_name, contact_phone, level, total_quota } = req.body;

  if (!username || !password || !company_name) {
    return res.fail('用户名、密码、公司名称不能为空');
  }

  const exists = await Agent.findOne({ where: { username } });
  if (exists) return res.fail('用户名已存在');

  const agent = await Agent.create({
    username, password, company_name, contact_name, contact_phone,
    level: level || 'silver',
    total_quota: total_quota || 0
  });

  res.success(agent);
};

exports.update = async (req, res) => {
  const agent = await Agent.findByPk(req.params.id);
  if (!agent) return res.fail('代理商不存在');

  const { company_name, contact_name, contact_phone, level, status } = req.body;
  await agent.update({ company_name, contact_name, contact_phone, level, status });

  res.success(agent);
};

exports.adjustQuota = async (req, res) => {
  const { changePoints, remark } = req.body;
  const agentId = parseInt(req.params.id);

  if (!changePoints) return res.fail('调整额度不能为空');

  const result = await adjustAgentQuota({
    agentId,
    changePoints: parseInt(changePoints),
    changeType: 'adjust',
    remark: remark || '后台手动调整',
    operatorId: req.user.userId
  });

  if (!result.success) return res.fail(result.message);
  res.success({ balance: result.balance });
};

exports.resetPassword = async (req, res) => {
  const agent = await Agent.findByPk(req.params.id);
  if (!agent) return res.fail('代理商不存在');

  const { password } = req.body;
  if (!password || password.length < 6) return res.fail('密码至少6位');

  const bcrypt = require('bcryptjs');
  agent.password = await bcrypt.hash(password, 10);
  await agent.save();

  res.success({ message: '密码重置成功' });
};

exports.toggleStatus = async (req, res) => {
  const agent = await Agent.findByPk(req.params.id);
  if (!agent) return res.fail('代理商不存在');

  agent.status = agent.status === 1 ? 0 : 1;
  await agent.save();

  res.success({ status: agent.status });
};
