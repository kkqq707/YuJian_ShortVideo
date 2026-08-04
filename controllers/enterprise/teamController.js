const { EnterpriseUser } = require('../../models');
const bcrypt = require('bcryptjs');

exports.list = async (req, res) => {
  const list = await EnterpriseUser.findAll({
    where: { enterprise_id: req.user.enterpriseId },
    attributes: { exclude: ['password'] },
    order: [['id', 'ASC']]
  });
  res.success(list);
};

exports.add = async (req, res) => {
  if (req.user.role !== 'admin') return res.fail('只有管理员可以添加成员', 403);

  const { email, password, name, role } = req.body;
  if (!email || !password) return res.fail('邮箱和密码不能为空');

  const exists = await EnterpriseUser.findOne({ where: { email } });
  if (exists) return res.fail('邮箱已存在');

  const user = await EnterpriseUser.create({
    enterprise_id: req.user.enterpriseId,
    email,
    password,
    name: name || email,
    role: role || 'creator'
  });

  const { password: pwd, ...result } = user.toJSON();
  res.success(result);
};

exports.update = async (req, res) => {
  if (req.user.role !== 'admin') return res.fail('只有管理员可以修改', 403);

  const user = await EnterpriseUser.findByPk(req.params.id);
  if (!user || user.enterprise_id !== req.user.enterpriseId) {
    return res.fail('成员不存在');
  }

  const { name, role, status } = req.body;
  await user.update({ name, role, status });

  const { password, ...result } = user.toJSON();
  res.success(result);
};

exports.remove = async (req, res) => {
  if (req.user.role !== 'admin') return res.fail('只有管理员可以删除', 403);

  const user = await EnterpriseUser.findByPk(req.params.id);
  if (!user || user.enterprise_id !== req.user.enterpriseId) {
    return res.fail('成员不存在');
  }

  if (user.id === req.user.userId) {
    return res.fail('不能删除自己');
  }

  await user.destroy();
  res.success({ message: '删除成功' });
};

exports.resetPassword = async (req, res) => {
  if (req.user.role !== 'admin') return res.fail('只有管理员可以重置密码', 403);

  const user = await EnterpriseUser.findByPk(req.params.id);
  if (!user || user.enterprise_id !== req.user.enterpriseId) {
    return res.fail('成员不存在');
  }

  const { password } = req.body;
  if (!password || password.length < 6) return res.fail('密码至少6位');

  user.password = await bcrypt.hash(password, 10);
  await user.save();

  res.success({ message: '密码重置成功' });
};
