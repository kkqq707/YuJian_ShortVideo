const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Plan = sequelize.define('Plan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  agent_price: {
    type: DataTypes.DECIMAL(10, 2)
  },
  quota_points: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  duration_days: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  },
  description: {
    type: DataTypes.TEXT
  },
  sort: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1
  }
}, {
  tableName: 'plans'
});

module.exports = Plan;
