const { Op } = require('sequelize');
const { Enterprise, EnterpriseUser, Agent } = require('../../models');
const { adjustEnterpriseQuota, adjustAgentQuota } = require('../../utils/quota');
const bcrypt = require('bcryptjs');

exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const keyword = req.query.keyword || '';
  const agentId = req.query.agent_id;
  const status = req.query.status;

  const where = {};
  if (keyword) {
    where.company_name = { [Op.like]: `%${keyword}%` };
  }
  if (agentId) where.agent_id = agentId;
  if (status) where.status = status;

  const { count, rows } = await Enterprise.findAndCountAll({
    where,
    include: [{ model: Agent, attributes: ['id', 'company_name'] }],
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

exports.create = async (req, res) => {
  const { agent_id, company_name, admin_email, admin_password, quota_balance } = req.body;

  if (!agent_id || !company_name || !admin_email || !admin_password) {
    return res.fail('代理商、公司名称、管理员邮箱、密码不能为空');
  }

  const agent = await Agent.findByPk(agent_id);
  if (!agent) return res.fail('代理商不存在');

  // 检查邮箱是否已存在
  const exists = await EnterpriseUser.findOne({ where: { email: admin_email } });
  if (exists) return res.fail('邮箱已被注册');

  // 创建企业
  const enterprise = await Enterprise.create({
    agent_id,
    company_name,
    quota_balance: quota_balance || 0
  });

  // 创建企业管理员账号
  await EnterpriseUser.create({
    enterprise_id: enterprise.id,
    email: admin_email,
    password: admin_password,
    name: '管理员',
    role: 'admin'
  });

  // 如果有初始额度，从代理商额度扣
  if (quota_balance && quota_balance > 0) {
    await adjustAgentQuota({
      agentId: agent_id,
      changePoints: quota_balance,
      changeType: 'adjust',
      remark: `分配给企业：${company_name}`,
      relatedId: enterprise.id,
      operatorId: req.user.userId
    });
  }

  res.success(enterprise);
};

exports.adjustQuota = async (req, res) => {
  const { changePoints, remark } = req.body;
  const enterpriseId = parseInt(req.params.id);

  if (!changePoints) return res.fail('调整积分不能为空');

  const enterprise = await Enterprise.findByPk(enterpriseId);
  if (!enterprise) return res.fail('企业不存在');

  // 如果是增加积分，从代理商额度扣
  if (changePoints > 0) {
    const agentResult = await adjustAgentQuota({
      agentId: enterprise.agent_id,
      changePoints: changePoints,
      changeType: 'adjust',
      remark: `分配给企业ID:${enterpriseId}`,
      operatorId: req.user.userId
    });
    if (!agentResult.success) return res.fail('代理商额度不足');
  }

  const result = await adjustEnterpriseQuota({
    enterpriseId,
    changePoints: parseInt(changePoints),
    changeType: 'adjust',
    remark: remark || '后台手动调整',
    operatorType: 'admin',
    operatorId: req.user.userId
  });

  if (!result.success) return res.fail(result.message);
  res.success({ balance: result.balance });
};

exports.toggleStatus = async (req, res) => {
  const enterprise = await Enterprise.findByPk(req.params.id);
  if (!enterprise) return res.fail('企业不存在');

  enterprise.status = enterprise.status === 1 ? 0 : 1;
  await enterprise.save();

  res.success({ status: enterprise.status });
};

exports.detail = async (req, res) => {
  const enterprise = await Enterprise.findByPk(req.params.id, {
    include: [{ model: Agent, attributes: ['id', 'company_name'] }]
  });
  if (!enterprise) return res.fail('企业不存在');
  res.success(enterprise);
};
