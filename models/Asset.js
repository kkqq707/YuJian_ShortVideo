const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Asset = sequelize.define('Asset', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  enterprise_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('image', 'video', 'audio', 'other'),
    defaultValue: 'image'
  },
  category: {
    type: DataTypes.STRING(50),
    defaultValue: 'default'
  },
  name: {
    type: DataTypes.STRING(100)
  },
  url: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  thumbnail: {
    type: DataTypes.STRING(500)
  },
  size: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  duration: {
    type: DataTypes.INTEGER
  },
  width: {
    type: DataTypes.INTEGER
  },
  height: {
    type: DataTypes.INTEGER
  },
  mime_type: {
    type: DataTypes.STRING(50)
  },
  audit_status: {
    type: DataTypes.ENUM('pending', 'pass', 'reject'),
    defaultValue: 'pending'
  },
  audit_result: {
    type: DataTypes.TEXT
  },

  // ─── Sprint 4.1 Patch2 新增字段 ────────────────────────────────
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    comment: '软删除时间。NULL=正常，非NULL=已删除。不物理删除以保留关联数据，OSS文件不删除'
  }
}, {
  tableName: 'assets',
  indexes: [
    { fields: ['enterprise_id'] },
    { fields: ['type'] },
    { fields: ['category'] },
    { fields: ['deleted_at'] }
  ]
});

module.exports = Asset;
