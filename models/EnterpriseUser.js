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
