const { Agent } = require('../../models');
const bcrypt = require('bcryptjs');

exports.getProfile = async (req, res) => {
  const agent = await Agent.findByPk(req.user.agentId, {
    attributes: { exclude: ['password'] }
  });
  res.success(agent);
};

exports.updateProfile = async (req, res) => {
  const agent = await Agent.findByPk(req.user.agentId);
  if (!agent) return res.fail('代理商不存在');

  const { company_name, contact_name, contact_phone, brand_name, brand_logo } = req.body;
  await agent.update({ company_name, contact_name, contact_phone, brand_name, brand_logo });

  res.success({ message: '更新成功' });
};

exports.changePassword = async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.fail('密码不能为空');
  if (new_password.length < 6) return res.fail('新密码至少6位');

  const agent = await Agent.findByPk(req.user.agentId);
  const isValid = await agent.comparePassword(old_password);
  if (!isValid) return res.fail('原密码错误');

  agent.password = await bcrypt.hash(new_password, 10);
  await agent.save();

  res.success({ message: '密码修改成功' });
};
