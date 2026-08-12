const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GenerationTask = sequelize.define('GenerationTask', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '本地主键'
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
  task_id: {
    type: DataTypes.STRING(64),
    unique: true,
    comment: '第三方 Provider 任务ID（如 DashScope task_id）'
  },
  task_type: {
    type: DataTypes.ENUM(
      'text2video', 'image2video', 'ref2video',
      'digital_human', 'text2image', 'video_edit',
      // ↓ Phase 004-Step4-A1 新增: DigitalHuman Pipeline 层 ↓
      'vision_analysis',    // Vision 视觉理解
      'script_generation',  // Script 脚本生成
      'tts_generation'      // TTS 语音合成
    ),
    allowNull: false,
    comment: '任务类型'
  },
  model: {
    type: DataTypes.STRING(50),
    comment: '使用的模型名称'
  },
  prompt: {
    type: DataTypes.TEXT,
    comment: '正向提示词'
  },
  negative_prompt: {
    type: DataTypes.TEXT,
    comment: '负向提示词'
  },
  params: {
    type: DataTypes.TEXT,
    comment: '扩展参数（JSON），如 resolution、ratio、seed、fps 等'
  },
  input_url: {
    type: DataTypes.STRING(500),
    comment: '输入文件URL（图片/视频）'
  },
  input_images: {
    type: DataTypes.TEXT,
    comment: '多图输入JSON数组'
  },
  output_url: {
    type: DataTypes.STRING(500),
    comment: '生成结果URL（视频/图片）'
  },
  cover_url: {
    type: DataTypes.STRING(500),
    comment: '视频封面图URL'
  },
  duration: {
    type: DataTypes.INTEGER,
    comment: '视频时长（秒）'
  },
  width: {
    type: DataTypes.INTEGER,
    comment: '视频宽度'
  },
  height: {
    type: DataTypes.INTEGER,
    comment: '视频高度'
  },
  points_cost: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: '消耗积分'
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'success', 'failed'),
    defaultValue: 'pending',
    comment: '任务状态：pending=排队中 | processing=处理中 | success=成功 | failed=失败'
  },
  error_msg: {
    type: DataTypes.TEXT,
    comment: '失败原因'
  },
  progress: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '进度百分比 0-100'
  },
  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '重试次数'
  },

  // ─── Sprint 2.5 新增字段 ────────────────────────────────────
  source_asset_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '输入素材关联的 Asset.id'
  },
  output_asset_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '输出结果关联的 Asset.id'
  },
  provider: {
    type: DataTypes.ENUM('dashscope', 'aliyun'),
    allowNull: false,
    defaultValue: 'aliyun',
    comment: 'AI 提供商（Sprint 4.4 Patch3: 统一为 aliyun 阿里云百炼；dashscope 为历史数据兼容）'
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '任务开始处理时间'
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '任务完成时间'
  },

  // ─── Sprint 3.3 新增字段 ────────────────────────────────────
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    comment: '软删除时间。NULL=正常，非NULL=已删除。不物理删除以保留审计线索，OSS文件待未来生命周期清理任务处理'
  }
}, {
  tableName: 'generation_tasks',
  indexes: [
    { fields: ['enterprise_id'] },
    { fields: ['task_id'] },
    { fields: ['status'] },
    { fields: ['task_type'] },
    { fields: ['provider'] },
    { fields: ['source_asset_id'] },
    { fields: ['output_asset_id'] },
    { fields: ['deleted_at'] }
  ]
});

module.exports = GenerationTask;
