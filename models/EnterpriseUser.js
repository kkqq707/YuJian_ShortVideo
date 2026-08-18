const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const EnterpriseUser = sequelize.define('EnterpriseUser', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  enterprise_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  // ─── Auth-Rebuild-002: 手机号登录标识 ────────────────────────
  // 存量兼容期允许 NULL（历史数据以 email 为登录标识，手机号回填见 migration 014）。
  // 唯一约束命名为 `phone`（与 Sequelize 对 unique:true 的默认索引名一致，
  // 避免 init.js sequelize.sync({alter:true}) 与迁移重复建唯一索引）。
  // 生产链路（pipeline/asset/billing）只依赖 id / enterprise_id，本字段不影响它们。
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true,
    comment: '手机号（登录标识，Auth-Rebuild-002；存量邮箱兼容期允许 NULL）'
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(50)
  },
  role: {
    type: DataTypes.ENUM('admin', 'creator', 'viewer'),
    defaultValue: 'creator'
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'enterprise_users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

EnterpriseUser.prototype.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = EnterpriseUser;
