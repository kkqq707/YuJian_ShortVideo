const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * ScriptRecord — 脚本持久化记录
 *
 * Phase 004 Step3: DigitalHuman Pipeline Architecture
 *
 * 职责:
 *   - 持久化 Pipeline 生成的脚本内容
 *   - 支持脚本版本管理（基础版本）
 *   - 结构化脚本 JSON 存储
 *
 * 注意:
 *   - 本模型仅实现 Step3 已确认的数据结构
 *   - 不包含内容审核、版本树、Prompt 历史等未来功能
 */
const ScriptRecord = sequelize.define('ScriptRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '主键'
  },
  pipeline_task_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '关联 PipelineTask.id（独立草稿为 NULL）'
  },
  source_type: {
    type: DataTypes.ENUM('pipeline', 'ai', 'manual'),
    allowNull: false,
    defaultValue: 'pipeline',
    comment: '来源类型：pipeline=pipeline 内生成 | ai=AI 独立生成 | manual=手写草稿'
  },
  episode_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '关联短剧集ID（可选，未来扩展）'
  },
  enterprise_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '所属企业ID'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '提交用户ID'
  },

  // ─── 脚本内容 ────────────────────────────────────────
  title: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '脚本标题'
  },
  full_script: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '完整脚本文本'
  },
  structured_script: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '结构化脚本 JSON (ScriptResult: { title, fullText, segments[], callsToAction, ... })'
  },

  // ─── 脚本元数据 ──────────────────────────────────────
  character_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '角色数量'
  },
  scene_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '场景数量'
  },
  estimated_duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '预估时长（秒）'
  },
  total_words: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '总字数'
  },

  // ─── 版本与状态 ──────────────────────────────────────
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: '版本号'
  },
  status: {
    type: DataTypes.ENUM('draft', 'reviewed', 'approved', 'rejected'),
    defaultValue: 'draft',
    comment: '脚本状态：draft=草稿 | reviewed=已审核 | approved=已批准 | rejected=已驳回'
  },

  // ─── 软删除 ──────────────────────────────────────────
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    comment: '软删除时间（草稿删除用）'
  }
}, {
  tableName: 'script_records',
  indexes: [
    { fields: ['pipeline_task_id'] },
    { fields: ['enterprise_id'] },
    { fields: ['source_type'] },
    { fields: ['deleted_at'] }
  ]
});

module.exports = ScriptRecord;
