const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DramaScene = sequelize.define('DramaScene', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '场景ID'
  },
  episode_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '所属剧集ID'
  },
  scene_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '场景编号'
  },
  location: {
    type: DataTypes.STRING(200),
    comment: '场景地点'
  },
  description: {
    type: DataTypes.TEXT,
    comment: '场景描述'
  },
  status: {
    type: DataTypes.ENUM('draft', 'generating', 'completed', 'failed'),
    defaultValue: 'draft',
    comment: '场景状态：draft=草稿 | generating=生成中 | completed=已完成 | failed=失败'
  }
}, {
  tableName: 'drama_scenes',
  indexes: [
    { fields: ['episode_id'] },
    { fields: ['status'] },
    { fields: ['episode_id', 'scene_number'], unique: true }
  ]
});

module.exports = DramaScene;
