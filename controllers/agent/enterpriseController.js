const { Op } = require('sequelize');
const { Enterprise, EnterpriseUser } = require('../../models');
const { adjustEnterpriseQuota, adjustAgentQuota } = require('../../utils/quota');
const bcrypt = require('bcryptjs');

exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const keyword = req.query.keyword || '';
  const agentId = req.user.agentId;

  const where = { agent_id: agentId };
  if (keyword) {
    where.company_name = { [Op.like]: `%${keyword}%` };
  }

  const { count, rows } = await Enterprise.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize
  });

  res.success({ list: rows, total: count, page, pageSize });
};

exports.create = async (req, res) => {
  const agentId = req.user.agentId;
  const { company_name, admin_email, admin_password, quota_balance } = req.body;

  if (!company_name || !admin_email || !admin_password) {
    return res.fail('公司名称、管理员邮箱、密码不能为空');
  }

  const exists = await EnterpriseUser.findOne({ where: { email: admin_email } });
  if (exists) return res.fail('邮箱已被注册');

  // 扣代理商额度
  if (quota_balance && quota_balance > 0) {
    const result = await adjustAgentQuota({
      agentId,
      changePoints: quota_balance,
      changeType: 'adjust',
      remark: `分配给企业：${company_name}`,
      operatorId: req.user.userId
    });
    if (!result.success) return res.fail('额度不足');
  }

  const enterprise = await Enterprise.create({
    agent_id: agentId,
    company_name,
    quota_balance: quota_balance || 0
  });

  await EnterpriseUser.create({
    enterprise_id: enterprise.id,
    email: admin_email,
    password: admin_password,
    name: '管理员',
    role: 'admin'
  });

  res.success(enterprise);
};

exports.adjustQuota = async (req, res) => {
  const agentId = req.user.agentId;
  const enterpriseId = parseInt(req.params.id);
  const { changePoints, remark } = req.body;

  if (!changePoints) return res.fail('调整积分不能为空');

  // 增加积分从代理商扣
  if (changePoints > 0) {
    const agentResult = await adjustAgentQuota({
      agentId,
      changePoints,
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
    remark: remark || '代理商调整',
    operatorType: 'agent',
    operatorId: req.user.userId
  });

  if (!result.success) return res.fail(result.message);
  res.success({ balance: result.balance });
};

exports.quotaStats = async (req, res) => {
  const agentId = req.user.agentId;
  // 简化：总额度从Agent表取
  res.success({
    total_quota: 0,
    used_quota: 0,
    available_quota: 0
  });
};
