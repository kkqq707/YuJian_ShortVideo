/**
 * Migration 012: Create voices table
 *
 * Phase 004-Step5-C2 — DigitalHuman Studio 后端（Voice）
 *
 * 表结构：
 *   - id: 主键
 *   - voice_uuid: 对外唯一标识（UUID v4）
 *   - enterprise_id / user_id: 租户与用户（enterprise_id NULL = 系统音色）
 *   - name: 音色展示名
 *   - voice_key: Provider 音色 ID（透传给 generateTTS.voiceId）
 *   - model_id: 归属 TTS 模型（NULL = 用默认模型）
 *   - provider: 提供方（默认 aliyun）
 *   - gender: 音色性别 ENUM (male/female/unknown)
 *   - language: 语言（默认 zh）
 *   - sample_audio_url / sample_audio_asset_id: 试听音频
 *   - source: 来源 ENUM (system/custom)
 *   - status: 状态 ENUM (active/disabled)
 *   - description: 描述
 *   - sort: 排序权重
 *   - deleted_at: 软删除
 *   - created_at / updated_at: 时间戳
 *
 * 运行方式：
 *   node migrations/012_create_voices.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 012] Creating voices table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS voices (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
      voice_uuid VARCHAR(64) NOT NULL COMMENT '对外唯一标识（UUID v4）',
      enterprise_id INT NULL COMMENT '所属企业ID；NULL = 系统音色（音色库），非空 = 我的声音',
      user_id INT NULL COMMENT '上传用户ID（系统音色为 NULL）',
      name VARCHAR(100) NOT NULL COMMENT '音色展示名',
      voice_key VARCHAR(100) NOT NULL COMMENT 'Provider 音色 ID（透传给 generateTTS.voiceId）',
      model_id VARCHAR(50) NULL COMMENT '归属 TTS 模型；NULL = 用 TTS 默认模型',
      provider VARCHAR(20) NOT NULL DEFAULT 'aliyun' COMMENT '提供方（对齐 GenerationTask.provider）',

      gender ENUM('male','female','unknown')
        NOT NULL DEFAULT 'unknown'
        COMMENT '音色性别',
      language VARCHAR(20) NOT NULL DEFAULT 'zh' COMMENT '语言（zh / en …）',
      sample_audio_url VARCHAR(500) NULL COMMENT '试听音频 URL',
      sample_audio_asset_id INT NULL COMMENT '试听音频关联 Asset（可选）',

      source ENUM('system','custom')
        NOT NULL DEFAULT 'custom'
        COMMENT '来源：system=系统音色库 | custom=我的声音',
      status ENUM('active','disabled')
        NOT NULL DEFAULT 'active'
        COMMENT '状态：active=可用 | disabled=停用（软下线）',
      description VARCHAR(500) NULL COMMENT '描述',
      sort INT NOT NULL DEFAULT 0 COMMENT '排序权重',

      deleted_at DATETIME NULL COMMENT '软删除时间（仅「我的声音」删除用）',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

      UNIQUE INDEX idx_voice_uuid (voice_uuid),
      INDEX idx_enterprise_id (enterprise_id),
      INDEX idx_source (source),
      INDEX idx_status (status),
      INDEX idx_model_id (model_id),
      INDEX idx_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='数字人音色表';
  `);

  console.log('[Migration 012] ✓ voices table created');
}

async function down() {
  console.log('[Migration 012] Dropping voices table...');

  await sequelize.query('DROP TABLE IF EXISTS voices');

  console.log('[Migration 012] ✓ voices table dropped');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 012] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 012] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
