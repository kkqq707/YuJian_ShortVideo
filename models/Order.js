const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  order_no: {
    type: DataTypes.STRING(32),
    allowNull: false,
    unique: true
  },
  user_type: {
    type: DataTypes.ENUM('agent', 'enterprise'),
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  plan_id: {
    type: DataTypes.INTEGER
  },
  type: {
    type: DataTypes.ENUM('plan_purchase', 'quota_recharge'),
    defaultValue: 'quota_recharge'
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  quota_points: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'cancelled', 'refunded'),
    defaultValue: 'pending'
  },
  paid_at: {
    type: DataTypes.DATE
  },
  payment_method: {
    type: DataTypes.STRING(20)
  },
  remark: {
    type: DataTypes.STRING(255)
  }
}, {
  tableName: 'orders'
});

module.exports = Order;
