const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Voice — 音色（目录 + 我的资产 双层结构）
 *
 * Phase 004-Step5-C2 — DigitalHuman Studio 后端（Voice Model）
 *
 * 职责:
 *   - 支撑「音色库」与「我的声音」两个叶子
 *   - 系统音色: enterprise_id IS NULL（平台预置，全局可见）
 *   - 我的声音: enterprise_id NOT NULL（企业隔离，用户自定义）
 *
 * 两层概念（与 Provider 音色 ID 的边界）:
 *   - Provider 层: tts-provider.synthesize({ voiceId }) 的 voiceId 是 DashScope 侧音色 ID
 *   - 目录层（本实体）: voice_key 存「某模型下可用的具体音色 ID」，model_id 指明归属 TTS 模型
 *
 * 状态机:
 *   active  ←→  disabled          （上下线软切换，不物理删除）
 *   active  →   deleted_at != NULL （仅「我的声音」软删除；系统音色仅 disabled）
 *
 * 时间戳:
 *   沿用 config/database.js 全局 define 约定（underscored: true）
 *   自动映射为 created_at / updated_at，无需在此显式声明。
 */
const Voice = sequelize.define('Voice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '主键'
  },
  voice_uuid: {
    type: DataTypes.STRING(64),
    unique: true,
    allowNull: false,
    comment: '对外唯一标识（UUID v4）'
  },

  // ─── 租户与用户 ──────────────────────────────────────
  enterprise_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '所属企业ID；NULL = 系统音色（音色库），非空 = 我的声音'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '上传用户ID（系统音色为 NULL）'
  },

  // ─── 展示信息 ────────────────────────────────────────
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '音色展示名（如「温柔女声」「沉稳男声」）'
  },
  voice_key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Provider 音色 ID（透传给 generateTTS.voiceId）'
  },
  model_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '归属 TTS 模型（cosyvoice-v3.5-plus 等）；NULL = 用 TTS 默认模型'
  },
  provider: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'aliyun',
    comment: '提供方（对齐 GenerationTask.provider）'
  },

  // ─── 属性与试听 ──────────────────────────────────────
  gender: {
    type: DataTypes.ENUM('male', 'female', 'unknown'),
    allowNull: false,
    defaultValue: 'unknown',
    comment: '音色性别'
  },
  language: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'zh',
    comment: '语言（zh / en …）'
  },
  sample_audio_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '试听音频 URL'
  },
  sample_audio_asset_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '试听音频关联 Asset（可选）'
  },

  // ─── 分类与状态 ──────────────────────────────────────
  source: {
    type: DataTypes.ENUM('system', 'custom'),
    allowNull: false,
    defaultValue: 'custom',
    comment: '来源：system=系统音色库 | custom=我的声音'
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled'),
    allowNull: false,
    defaultValue: 'active',
    comment: '状态：active=可用 | disabled=停用（软下线）'
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '描述'
  },
  sort: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '排序权重'
  },

  // ─── 软删除 ──────────────────────────────────────────
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    comment: '软删除时间（仅「我的声音」删除用；系统音色不删除仅 disabled）'
  }
}, {
  tableName: 'voices',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['voice_uuid'], unique: true },
    { fields: ['enterprise_id'] },
    { fields: ['source'] },
    { fields: ['status'] },
    { fields: ['model_id'] },
    { fields: ['deleted_at'] }
  ]
});

module.exports = Voice;
