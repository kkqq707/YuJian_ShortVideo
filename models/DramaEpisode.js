const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DramaEpisode = sequelize.define('DramaEpisode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '剧集ID'
  },
  project_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '所属短剧项目ID'
  },
  episode_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '剧集编号（第几集）'
  },
  title: {
    type: DataTypes.STRING(200),
    comment: '剧集标题'
  },
  status: {
    type: DataTypes.ENUM('draft', 'generating', 'completed', 'failed'),
    defaultValue: 'draft',
    comment: '剧集状态：draft=草稿 | generating=生成中 | completed=已完成 | failed=失败'
  }
}, {
  tableName: 'drama_episodes',
  indexes: [
    { fields: ['project_id'] },
    { fields: ['status'] },
    { fields: ['project_id', 'episode_number'], unique: true }
  ]
});

module.exports = DramaEpisode;
