const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OperationLog = sequelize.define('OperationLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_type: {
    type: DataTypes.ENUM('admin', 'agent', 'enterprise'),
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  module: {
    type: DataTypes.STRING(50)
  },
  ip: {
    type: DataTypes.STRING(50)
  },
  user_agent: {
    type: DataTypes.STRING(255)
  },
  params: {
    type: DataTypes.TEXT
  },
  result: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'operation_logs',
  indexes: [
    { fields: ['user_type', 'user_id'] },
    { fields: ['action'] },
    { fields: ['created_at'] }
  ]
});

module.exports = OperationLog;
