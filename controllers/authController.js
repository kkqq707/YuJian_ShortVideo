const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { Admin, Agent, EnterpriseUser, Enterprise, VerificationCode } = require('../models');
const smsService = require('../services/smsService');

// ─── Auth-Rebuild-003: 手机号认证常量 ─────────────────────────
// 中国大陆手机号格式（任务第九节统一规则）
const PHONE_RE = /^1[3-9]\d{9}$/;
// 验证码有效期 5 分钟（任务第二节）
const VERIFICATION_CODE_TTL_MS = 5 * 60 * 1000;
// 发送频控：同一手机号 60 秒内不可重复发送（任务第十节）
const SEND_CODE_INTERVAL_MS = 60 * 1000;
// 业务主流程允许的用途（register 保留在数据模型，但本阶段 API 不开放独立注册入口）
const PURPOSE_ALLOWED = ['login', 'reset'];

const isValidPhone = (v) => typeof v === 'string' && PHONE_RE.test(v);

// 企业用户登录返回的用户信息（与旧结构兼容，仅追加 phone 字段）
function buildEnterpriseUserInfo(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    enterprise_id: user.enterprise_id,
    company_name: user.Enterprise?.company_name
  };
}

// 取该手机号指定用途的「最新」验证码（最新码使旧码失效，天然实现一次性语义）
async function findLatestCode(phone, purpose) {
  return VerificationCode.findOne({
    where: { phone, purpose },
    order: [['id', 'DESC']]
  });
}

// 校验并原子消费验证码（at-most-once：used_at 条件更新防止并发重复使用）
// 返回 null 表示校验通过（已消费）；否则返回错误提示文案
async function consumeCode(record, inputCode) {
  if (!record) return '验证码错误，请重新输入';
  if (record.code !== inputCode) return '验证码错误，请重新输入';
  if (record.used_at) return '验证码已失效，请重新获取';
  if (record.expires_at <= new Date()) return '验证码已过期，请重新获取';

  const [updated] = await VerificationCode.update(
    { used_at: new Date() },
    { where: { id: record.id, used_at: null } }
  );
  if (updated === 0) return '验证码已失效，请重新获取'; // 并发竞争：已被消费
  return null;
}

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
  const { password } = req.body;
  let { phone, email } = req.body;

  // 旧前端调用兼容：前端字段名是 phone，但历史上把它映射到 email 字段提交。
  // 若 email 字段实际是合法手机号，则按手机号路径处理，以获得明确的"未注册/密码错误"提示。
  if (!phone && email && isValidPhone(email)) {
    phone = email;
    email = null;
  }

  if (!password) return res.fail('请输入密码');
  if (!phone && !email) return res.fail('请输入手机号或邮箱');

  // 手机号登录：格式校验 + 明确的"未注册"提示
  if (phone && !isValidPhone(phone)) return res.fail('请输入正确的手机号');

  const user = await EnterpriseUser.findOne({
    where: {
      [Op.or]: phone
        ? [{ phone }, { email: phone }]   // 兜底存量：email 列存过手机号字符串的账号
        : [{ email }]
    },
    include: [{ model: Enterprise }]
  });

  if (!user) return res.fail(phone ? '手机号未注册，请先注册' : '邮箱或密码错误');
  if (user.status !== 1) return res.fail('账号已被禁用');
  if (user.Enterprise && user.Enterprise.status !== 1) {
    return res.fail('企业已被禁用');
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) return res.fail(phone ? '密码错误，请重新输入' : '邮箱或密码错误');

  await user.update({ last_login_at: new Date() });

  const token = generateToken('enterprise', user);
  res.success({
    token,
    userInfo: buildEnterpriseUserInfo(user)
  });
};

// ─── Auth-Rebuild-003: 手机号认证能力 ─────────────────────────

/**
 * 发送验证码
 * POST /api/auth/enterprise/send-code  { phone, purpose }
 */
exports.sendCode = async (req, res) => {
  const { phone, purpose } = req.body;

  if (!isValidPhone(phone)) return res.fail('请输入正确的手机号');
  if (!PURPOSE_ALLOWED.includes(purpose)) return res.fail('验证码用途不正确');

  // 最小频控：同一手机号 60 秒内不可重复发送（任务第十节，防短信轰炸）
  const recent = await VerificationCode.findOne({
    where: {
      phone,
      created_at: { [Op.gte]: new Date(Date.now() - SEND_CODE_INTERVAL_MS) }
    },
    order: [['id', 'DESC']]
  });
  if (recent) return res.fail('验证码发送过于频繁，请稍后再试');

  const code = smsService.issueVerificationCode();
  try {
    await smsService.sendVerificationCode({ phone, code });
  } catch (err) {
    if (err.code === 'SMS_NOT_CONFIGURED') return res.fail(err.message);
    throw err;
  }

  await VerificationCode.create({
    phone,
    code,
    purpose,
    expires_at: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
    request_ip: req.ip
  });

  // 响应绝不包含验证码本体
  res.success({ sent: true, purpose });
};

/**
 * 验证码登录（未注册手机号自动注册 → 本阶段被企业归属机制阻塞，返回明确错误）
 * POST /api/auth/enterprise/login-by-code  { phone, code }
 */
exports.loginByCode = async (req, res) => {
  const { phone, code } = req.body;

  if (!isValidPhone(phone)) return res.fail('请输入正确的手机号');
  if (!code) return res.fail('请输入验证码');

  const record = await findLatestCode(phone, 'login');
  // 先完整校验验证码（错误/失效/过期提示优先，避免泄露手机号注册状态）
  if (!record) return res.fail('验证码错误，请重新输入');
  if (record.code !== code) return res.fail('验证码错误，请重新输入');
  if (record.used_at) return res.fail('验证码已失效，请重新获取');
  if (record.expires_at <= new Date()) return res.fail('验证码已过期，请重新获取');

  const user = await EnterpriseUser.findOne({
    where: { phone },
    include: [{ model: Enterprise }]
  });

  // 未注册手机号 → 自动注册被阻塞（任务第六节：系统无"个人用户默认企业"机制，
  // enterprise_id 无法合法获得，禁止创建无归属用户）。
  // 验证码保留未消费，避免烧掉一次有效验证码。
  if (!user) {
    return res.fail(
      '手机号未注册，自动注册暂不可用，请联系管理员开通',
      400,
      { reason: 'AUTO_REGISTER_UNAVAILABLE' }
    );
  }

  // 原子消费验证码（at-most-once：used_at 条件更新防止并发重复使用）
  const [updated] = await VerificationCode.update(
    { used_at: new Date() },
    { where: { id: record.id, used_at: null } }
  );
  if (updated === 0) return res.fail('验证码已失效，请重新获取');

  if (user.status !== 1) return res.fail('账号已被禁用');
  if (user.Enterprise && user.Enterprise.status !== 1) return res.fail('企业已被禁用');

  const token = generateToken('enterprise', user);
  res.success({
    token,
    userInfo: buildEnterpriseUserInfo(user),
    needSetPassword: false
  });
};

/**
 * 首次设置密码（验证码自动注册后的第一步）
 * POST /api/auth/enterprise/set-password  { password }  （必须已登录，enterpriseAuth）
 */
exports.setPassword = async (req, res) => {
  const { password } = req.body;

  if (!password) return res.fail('请输入新密码');
  if (password.length < 6) return res.fail('密码至少6位');

  const user = await EnterpriseUser.findByPk(req.user.userId);
  if (!user) return res.fail('用户不存在');

  // 密码不得明文存储；沿用项目既有 bcryptjs（任务第七节）
  user.password = await bcrypt.hash(password, 10);
  await user.save();

  res.success({ message: '密码设置成功' });
};

/**
 * 忘记密码（短信验证后重置）
 * POST /api/auth/enterprise/forgot-password  { phone, code, password }
 */
exports.forgotPassword = async (req, res) => {
  const { phone, code, password } = req.body;

  if (!isValidPhone(phone)) return res.fail('请输入正确的手机号');
  if (!code) return res.fail('请输入验证码');
  if (!password) return res.fail('请输入新密码');
  if (password.length < 6) return res.fail('密码至少6位');

  const user = await EnterpriseUser.findOne({ where: { phone } });
  if (!user) return res.fail('手机号未注册，请先注册');

  const record = await findLatestCode(phone, 'reset');
  const errorMsg = await consumeCode(record, code);
  if (errorMsg) return res.fail(errorMsg);

  user.password = await bcrypt.hash(password, 10);
  await user.save();

  res.success({ message: '密码重置成功' });
};
