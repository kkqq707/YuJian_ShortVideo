const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuotaLog = sequelize.define('QuotaLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_type: {
    type: DataTypes.ENUM('agent', 'enterprise'),
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  change_type: {
    type: DataTypes.ENUM('recharge', 'consume', 'adjust', 'refund', 'order'),
    allowNull: false
  },
  points_before: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  points_change: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  points_after: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  remark: {
    type: DataTypes.STRING(255)
  },
  related_id: {
    type: DataTypes.INTEGER
  },
  operator_type: {
    type: DataTypes.ENUM('admin', 'agent', 'system', 'user'),
    defaultValue: 'system'
  },
  operator_id: {
    type: DataTypes.INTEGER
  }
}, {
  tableName: 'quota_logs',
  indexes: [
    { fields: ['user_type', 'user_id'] },
    { fields: ['change_type'] }
  ]
});

module.exports = QuotaLog;
