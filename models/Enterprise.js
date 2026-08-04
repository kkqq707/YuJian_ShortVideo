const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Enterprise = sequelize.define('Enterprise', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  agent_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  company_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  quota_balance: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  plan_id: {
    type: DataTypes.INTEGER
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1
  },
  brand_name: {
    type: DataTypes.STRING(50)
  },
  brand_logo: {
    type: DataTypes.STRING(255)
  },
  expire_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'enterprises'
});

module.exports = Enterprise;
