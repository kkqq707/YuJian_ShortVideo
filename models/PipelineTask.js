const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * PipelineTask — 数字人流水线编排任务
 *
 * Phase 004 Step3: DigitalHuman Pipeline Architecture
 *
 * 职责:
 *   - 管理四层流水线执行: Vision → Script → TTS → DigitalHuman
 *   - 追踪整体状态和进度
 *   - 阶段间数据传递与转换
 *   - 错误处理、重试、断点续跑
 *
 * 状态机:
 *   pending → (vision → script → tts → digital_human) → success
 *   任意非终态 → failed | cancelled
 */
const PipelineTask = sequelize.define('PipelineTask', {
  // ─── 主键与标识 ──────────────────────────────────────
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '本地主键'
  },
  pipeline_uuid: {
    type: DataTypes.STRING(64),
    unique: true,
    allowNull: false,
    comment: '对外唯一标识（UUID v4），用于 API 查询'
  },

  // ─── 租户与用户 ──────────────────────────────────────
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

  // ─── 关联关系 ────────────────────────────────────────
  drama_project_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '关联短剧项目ID（可选，未来扩展）'
  },

  // ─── 状态与进度 ──────────────────────────────────────
  status: {
    type: DataTypes.ENUM(
      'pending', 'running',
      'vision', 'script', 'tts', 'digital_human',
      'success', 'failed', 'cancelled'
    ),
    defaultValue: 'pending',
    comment: '流水线状态：pending→(vision→script→tts→digital_human)→success | failed | cancelled'
  },
  current_layer: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '当前执行层: vision | script | tts | digital_human'
  },
  progress: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '整体进度百分比 0-100。计算规则: (已完成层 / 总层数 * 100)。四层全量时每层25%，跳过层不计入'
  },

  // ─── 各层 GenerationTask 关联 ─────────────────────────
  vision_task_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Layer 1: Vision → GenerationTask.id'
  },
  script_task_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Layer 2: Script → GenerationTask.id'
  },
  tts_task_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Layer 3: TTS → GenerationTask.id'
  },
  dh_task_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Layer 4: DigitalHuman → GenerationTask.id'
  },

  // ─── 中间结果引用 ────────────────────────────────────
  script_record_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '关联 ScriptRecord.id（脚本持久化记录）'
  },
  audio_asset_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '关联 Asset.id（TTS 生成的音频素材）'
  },
  output_asset_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '关联 Asset.id（最终生成的数字人视频素材）'
  },

  // ─── 输入参数（用户提交的原始参数） ────────────────────
  input_params: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'JSON: 用户输入参数 { image_url, theme, style, voice_id, target_duration, resolution, tier, skip_vision, skip_script }'
  },

  // ─── 中间结果聚合（最新值） ───────────────────────────
  intermediate_results: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON: 各层中间结果聚合 { vision: VisionResult|null, script: ScriptResult|null, tts: AudioResult|null, dh: VideoResult|null }'
  },

  // ─── 运行配置 ────────────────────────────────────────
  run_config: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON: 运行配置 { mode: "auto"|"step", tier: "premium"|"standard"|"budget", max_retries: 3, layer_timeout: {...} }'
  },

  // ─── 错误与重试 ──────────────────────────────────────
  error_msg: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '失败原因（仅 status=failed 时有值）'
  },
  failed_layer: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '失败的层: vision | script | tts | digital_human'
  },
  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '流水线整体重试次数（非单层重试）'
  },
  layer_retry_counts: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON: 各层重试次数 { vision: 0, script: 1, tts: 0, dh: 0 }'
  },

  // ─── 跳层配置 ────────────────────────────────────────
  skip_layers: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON: 跳过的层 ["vision", "script"]。仅 Auto-Pilot 模式下生效，Step 模式下由用户手动控制'
  },

  // ─── 时间追踪 ────────────────────────────────────────
  started_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '流水线开始执行时间'
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '流水线完成时间'
  },
  layer_timings: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON: 各层耗时 { vision: { started: "...", completed: "...", duration_ms: 2300 }, ... }'
  },

  // ─── 软删除 ──────────────────────────────────────────
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    comment: '软删除时间'
  }
}, {
  tableName: 'pipeline_tasks',
  indexes: [
    { fields: ['pipeline_uuid'], unique: true },
    { fields: ['enterprise_id'] },
    { fields: ['user_id'] },
    { fields: ['status'] },
    { fields: ['drama_project_id'] },
    { fields: ['deleted_at'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = PipelineTask;
