const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DramaCharacter = sequelize.define('DramaCharacter', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '角色ID'
  },
  project_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '所属短剧项目ID'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '角色名称'
  },
  description: {
    type: DataTypes.TEXT,
    comment: '角色描述'
  },
  avatar_asset_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '角色头像关联的Asset.id'
  },
  character_prompt: {
    type: DataTypes.TEXT,
    comment: '角色生成提示词（用于AI角色一致性）'
  }
}, {
  tableName: 'drama_characters',
  indexes: [
    { fields: ['project_id'] },
    { fields: ['avatar_asset_id'] }
  ]
});

module.exports = DramaCharacter;
