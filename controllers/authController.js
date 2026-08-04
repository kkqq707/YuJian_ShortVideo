const jwt = require('jsonwebtoken');
const { Admin, Agent, EnterpriseUser, Enterprise } = require('../models');

const generateToken = (userType, user) => {
  const payload = {
    userType,
    userId: user.id,
    username: user.username || user.email
  };
  
  if (userType === 'enterprise') {
    payload.enterpriseId = user.enterprise_id;
    payload.role = user.role;
  }
  if (userType === 'agent') {
    payload.agentId = user.id;
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

exports.adminLogin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.fail('用户名和密码不能为空');
  }

  const admin = await Admin.findOne({ where: { username } });
  if (!admin) return res.fail('用户名或密码错误');
  if (admin.status !== 1) return res.fail('账号已被禁用');

  const isValid = await admin.comparePassword(password);
  if (!isValid) return res.fail('用户名或密码错误');

  await admin.update({ last_login_at: new Date() });

  const token = generateToken('admin', admin);
  res.success({
    token,
    userInfo: { id: admin.id, username: admin.username, role: admin.role }
  });
};

exports.agentLogin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.fail('用户名和密码不能为空');
  }

  const agent = await Agent.findOne({ where: { username } });
  if (!agent) return res.fail('用户名或密码错误');
  if (agent.status !== 1) return res.fail('账号已被禁用');

  const isValid = await agent.comparePassword(password);
  if (!isValid) return res.fail('用户名或密码错误');

  await agent.update({ last_login_at: new Date() });

  const token = generateToken('agent', agent);
  res.success({
    token,
    userInfo: {
      id: agent.id,
      username: agent.username,
      company_name: agent.company_name,
      level: agent.level
    }
  });
};

exports.enterpriseLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.fail('邮箱和密码不能为空');
  }

  const user = await EnterpriseUser.findOne({
    where: { email },
    include: [{ model: Enterprise }]
  });

  if (!user) return res.fail('邮箱或密码错误');
  if (user.status !== 1) return res.fail('账号已被禁用');
  if (user.Enterprise && user.Enterprise.status !== 1) {
    return res.fail('企业已被禁用');
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) return res.fail('邮箱或密码错误');

  await user.update({ last_login_at: new Date() });

  const token = generateToken('enterprise', user);
  res.success({
    token,
    userInfo: {
      id: user.id,
      email: user.email,
      role: user.role,
      enterprise_id: user.enterprise_id,
      company_name: user.Enterprise?.company_name
    }
  });
};
