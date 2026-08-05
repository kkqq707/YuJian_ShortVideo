const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DramaShot = sequelize.define('DramaShot', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '镜头ID'
  },
  scene_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '所属场景ID'
  },
  shot_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '镜头编号'
  },
  description: {
    type: DataTypes.TEXT,
    comment: '镜头描述'
  },
  prompt: {
    type: DataTypes.TEXT,
    comment: 'AI生成提示词'
  },
  duration: {
    type: DataTypes.INTEGER,
    comment: '目标时长（秒）'
  },
  task_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '关联的GenerationTask.id（复用现有生成任务）'
  },
  output_asset_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '生成结果关联的Asset.id'
  },
  status: {
    type: DataTypes.ENUM('draft', 'pending', 'generating', 'completed', 'failed'),
    defaultValue: 'draft',
    comment: '镜头状态：draft=草稿 | pending=排队中 | generating=生成中 | completed=已完成 | failed=失败'
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: '版本号（支持重新生成）'
  },
  parent_shot_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '父镜头ID（自引用，用于版本追溯）'
  }
}, {
  tableName: 'drama_shots',
  indexes: [
    { fields: ['scene_id'] },
    { fields: ['task_id'] },
    { fields: ['output_asset_id'] },
    { fields: ['status'] },
    { fields: ['parent_shot_id'] },
    { fields: ['scene_id', 'shot_number'] }
  ]
});

module.exports = DramaShot;
