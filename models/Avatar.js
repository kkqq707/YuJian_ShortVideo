const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Avatar — 数字人形象（目录 + 我的资产 双层结构）
 *
 * Phase 004-Step5-C1 — DigitalHuman Studio 后端（Avatar Model）
 *
 * 职责:
 *   - 支撑「官方数字人」与「我的数字人」两个叶子
 *   - 官方形象: enterprise_id IS NULL（平台预置，全局可见）
 *   - 我的形象: enterprise_id NOT NULL（企业隔离，用户上传）
 *
 * 状态机:
 *   active  ←→  disabled          （上下线软切换，不物理删除）
 *   active  →   deleted_at != NULL （仅「我的形象」软删除；官方形象仅 disabled）
 *
 * 时间戳:
 *   沿用 config/database.js 全局 define 约定（underscored: true）
 *   自动映射为 created_at / updated_at，无需在此显式声明。
 */
const Avatar = sequelize.define('Avatar', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '主键'
  },
  avatar_uuid: {
    type: DataTypes.STRING(64),
    unique: true,
    allowNull: false,
    comment: '对外唯一标识（UUID v4），对齐 pipeline_uuid 惯例'
  },

  // ─── 租户与用户 ──────────────────────────────────────
  enterprise_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '所属企业ID；NULL = 官方形象（全局可见）'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '上传用户ID（官方形象为 NULL）'
  },

  // ─── 展示信息 ────────────────────────────────────────
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '形象名称（展示名）'
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '形象描述'
  },
  image_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: '形象主图 URL（直接可用，兼容 pipeline 的 image_url）'
  },
  thumbnail_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '缩略图 URL（列表用）'
  },
  asset_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '关联 assets.id（复用素材体系，图片素材）'
  },

  // ─── 分类与状态 ──────────────────────────────────────
  source: {
    type: DataTypes.ENUM('official', 'uploaded'),
    allowNull: false,
    defaultValue: 'uploaded',
    comment: '来源：official=官方种子 | uploaded=用户上传'
  },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'unknown'),
    allowNull: false,
    defaultValue: 'unknown',
    comment: '性别（可选过滤维度）'
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled'),
    allowNull: false,
    defaultValue: 'active',
    comment: '状态：active=可用 | disabled=停用（软下线）'
  },
  sort: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '排序权重（官方形象列表排序用）'
  },

  // ─── 软删除 ──────────────────────────────────────────
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    comment: '软删除时间（我的形象删除用；官方形象不删除仅 disabled）'
  }
}, {
  tableName: 'avatars',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['avatar_uuid'], unique: true },
    { fields: ['enterprise_id'] },
    { fields: ['source'] },
    { fields: ['status'] },
    { fields: ['deleted_at'] }
  ]
});

module.exports = Avatar;
