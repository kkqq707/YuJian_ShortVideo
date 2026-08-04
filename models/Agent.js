const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const Agent = sequelize.define('Agent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  company_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  contact_name: {
    type: DataTypes.STRING(50)
  },
  contact_phone: {
    type: DataTypes.STRING(20)
  },
  level: {
    type: DataTypes.ENUM('silver', 'gold', 'diamond'),
    defaultValue: 'silver'
  },
  total_quota: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  used_quota: {
    type: DataTypes.BIGINT,
    defaultValue: 0
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
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'agents',
  hooks: {
    beforeCreate: async (agent) => {
      if (agent.password) {
        agent.password = await bcrypt.hash(agent.password, 10);
      }
    }
  }
});

Agent.prototype.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = Agent;
