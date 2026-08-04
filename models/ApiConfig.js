const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ApiConfig = sequelize.define('ApiConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  config_key: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  config_value: {
    type: DataTypes.TEXT
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'api_configs'
});

ApiConfig.getConfig = async function(key) {
  const config = await this.findOne({ where: { config_key: key } });
  if (!config) return null;
  try {
    return JSON.parse(config.config_value);
  } catch (e) {
    return config.config_value;
  }
};

ApiConfig.setConfig = async function(key, value, description = '') {
  const configValue = typeof value === 'object' ? JSON.stringify(value) : value;
  const [config, created] = await this.findOrCreate({
    where: { config_key: key },
    defaults: { config_value: configValue, description }
  });
  if (!created) {
    await config.update({ config_value: configValue, description });
  }
  return true;
};

module.exports = ApiConfig;
