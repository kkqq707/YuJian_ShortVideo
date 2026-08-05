const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DramaProject = sequelize.define('DramaProject', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '短剧项目ID'
  },
  enterprise_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '所属企业ID'
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: '短剧标题'
  },
  description: {
    type: DataTypes.TEXT,
    comment: '短剧描述/梗概'
  },
  status: {
    type: DataTypes.ENUM('draft', 'generating', 'completed', 'failed'),
    defaultValue: 'draft',
    comment: '项目状态：draft=草稿 | generating=生成中 | completed=已完成 | failed=失败'
  },
  total_duration: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '总时长（秒）'
  }
}, {
  tableName: 'drama_projects',
  indexes: [
    { fields: ['enterprise_id'] },
    { fields: ['status'] }
  ]
});

module.exports = DramaProject;
