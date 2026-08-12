/**
 * Migration 008: Create pipeline_tasks table
 *
 * Phase 004-Step4-A1 — DigitalHuman Pipeline Data Layer
 *
 * 表结构：
 *   - id: 主键
 *   - pipeline_uuid: 对外唯一标识（UUID v4）
 *   - enterprise_id / user_id: 租户与用户
 *   - status: 流水线状态 ENUM (pending/running/vision/script/tts/digital_human/success/failed/cancelled)
 *   - current_layer / progress: 进度追踪
 *   - vision_task_id / script_task_id / tts_task_id / dh_task_id: 各层 GenerationTask 关联
 *   - script_record_id / audio_asset_id / output_asset_id: 中间结果引用
 *   - input_params / intermediate_results / run_config: JSON 字段
 *   - error_msg / failed_layer / retry_count / layer_retry_counts: 错误与重试
 *   - skip_layers: 跳层配置
 *   - started_at / completed_at / layer_timings: 时间追踪
 *   - deleted_at: 软删除
 *   - created_at / updated_at: 时间戳
 *
 * 运行方式：
 *   node migrations/008_create_pipeline_tasks.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 008] Creating pipeline_tasks table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pipeline_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '本地主键',
      pipeline_uuid VARCHAR(64) NOT NULL COMMENT '对外唯一标识（UUID v4），用于 API 查询',
      enterprise_id INT NOT NULL COMMENT '所属企业ID',
      user_id INT NOT NULL COMMENT '提交用户ID',
      drama_project_id INT NULL COMMENT '关联短剧项目ID（可选，未来扩展）',

      status ENUM('pending','running','vision','script','tts','digital_human','success','failed','cancelled')
        NOT NULL DEFAULT 'pending'
        COMMENT '流水线状态：pending→(vision→script→tts→digital_human)→success | failed | cancelled',
      current_layer VARCHAR(20) NULL COMMENT '当前执行层: vision | script | tts | digital_human',
      progress INT NOT NULL DEFAULT 0 COMMENT '整体进度百分比 0-100',

      vision_task_id INT NULL COMMENT 'Layer 1: Vision → GenerationTask.id',
      script_task_id INT NULL COMMENT 'Layer 2: Script → GenerationTask.id',
      tts_task_id INT NULL COMMENT 'Layer 3: TTS → GenerationTask.id',
      dh_task_id INT NULL COMMENT 'Layer 4: DigitalHuman → GenerationTask.id',

      script_record_id INT NULL COMMENT '关联 ScriptRecord.id（脚本持久化记录）',
      audio_asset_id INT NULL COMMENT '关联 Asset.id（TTS 生成的音频素材）',
      output_asset_id INT NULL COMMENT '关联 Asset.id（最终生成的数字人视频素材）',

      input_params TEXT NOT NULL COMMENT 'JSON: 用户输入参数 { image_url, theme, style, voice_id, target_duration, resolution, tier, skip_vision, skip_script }',
      intermediate_results TEXT NULL COMMENT 'JSON: 各层中间结果聚合',
      run_config TEXT NULL COMMENT 'JSON: 运行配置 { mode, tier, max_retries, layer_timeout }',

      error_msg TEXT NULL COMMENT '失败原因（仅 status=failed 时有值）',
      failed_layer VARCHAR(20) NULL COMMENT '失败的层: vision | script | tts | digital_human',
      retry_count INT NOT NULL DEFAULT 0 COMMENT '流水线整体重试次数（非单层重试）',
      layer_retry_counts TEXT NULL COMMENT 'JSON: 各层重试次数 { vision: 0, script: 1, tts: 0, dh: 0 }',

      skip_layers TEXT NULL COMMENT 'JSON: 跳过的层 ["vision", "script"]',

      started_at DATETIME NULL COMMENT '流水线开始执行时间',
      completed_at DATETIME NULL COMMENT '流水线完成时间',
      layer_timings TEXT NULL COMMENT 'JSON: 各层耗时 { vision: { started, completed, duration_ms }, ... }',

      deleted_at DATETIME NULL COMMENT '软删除时间',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

      UNIQUE INDEX idx_pipeline_uuid (pipeline_uuid),
      INDEX idx_enterprise_id (enterprise_id),
      INDEX idx_user_id (user_id),
      INDEX idx_status (status),
      INDEX idx_drama_project_id (drama_project_id),
      INDEX idx_deleted_at (deleted_at),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='数字人流水线编排任务表';
  `);

  console.log('[Migration 008] ✓ pipeline_tasks table created');
}

async function down() {
  console.log('[Migration 008] Dropping pipeline_tasks table...');

  await sequelize.query('DROP TABLE IF EXISTS pipeline_tasks');

  console.log('[Migration 008] ✓ pipeline_tasks table dropped');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 008] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 008] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
