const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * VerificationCode — 短信验证码记录
 *
 * Phase DigitalHuman-Rebuild-004 → Auth-Rebuild-002：手机号认证数据层准备
 *
 * 职责:
 *   - 持久化手机号验证码（登录/注册/忘记密码共用）
 *   - 供后续 phase 的 send-code / login-by-code / forgot-password 使用
 *
 * 设计约定:
 *   - 无 Redis，验证码存 MySQL（对齐项目现状），靠 expires_at 过期清理
 *   - purpose 区分用途，防止跨流程复用（登录码不能用于重置密码）
 *   - 仅做数据层准备；发送/校验/频控逻辑在后续 phase（controllers/services）实现
 *   - 明文 code 存储：本 phase 仅建表；若后续要求脱敏，可升级为哈希存储（不在本 phase）
 */
const VerificationCode = sequelize.define('VerificationCode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '主键'
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: '目标手机号（登录标识，对齐 enterprise_users.phone）'
  },
  code: {
    type: DataTypes.STRING(8),
    allowNull: false,
    comment: '验证码（当前明文存储；后续安全 phase 可升级为哈希）'
  },
  purpose: {
    type: DataTypes.ENUM('login', 'register', 'reset'),
    allowNull: false,
    defaultValue: 'login',
    comment: '用途：login=验证码登录(未注册自动注册) | register=注册 | reset=忘记密码重置'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '过期时间（发送后 N 分钟失效，校验时须比对 now < expires_at）'
  },
  used_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '使用时间；NULL=未使用，非 NULL=已消费（防重放）'
  },
  request_ip: {
    type: DataTypes.STRING(45),
    allowNull: true,
    comment: '请求来源 IP（可选，频控审计用）'
  }
}, {
  tableName: 'verification_codes',
  indexes: [
    { fields: ['phone', 'purpose'], name: 'idx_phone_purpose' },
    { fields: ['expires_at'], name: 'idx_expires_at' },
    { fields: ['created_at'], name: 'idx_created_at' }
  ]
});

module.exports = VerificationCode;
