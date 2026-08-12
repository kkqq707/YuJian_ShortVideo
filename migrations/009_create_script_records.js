/**
 * Migration 009: Create script_records table
 *
 * Phase 004-Step4-A1 — DigitalHuman Pipeline Data Layer
 *
 * 表结构：
 *   - id: 主键
 *   - pipeline_task_id: 关联 pipeline_tasks.id
 *   - episode_id: 可选关联短剧集ID
 *   - enterprise_id / user_id: 租户与用户
 *   - title / full_script / structured_script: 脚本内容
 *   - character_count / scene_count / estimated_duration / total_words: 脚本元数据
 *   - version: 版本号
 *   - status: 脚本状态 ENUM (draft/reviewed/approved/rejected)
 *   - created_at / updated_at: 时间戳
 *
 * 运行方式：
 *   node migrations/009_create_script_records.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 009] Creating script_records table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS script_records (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
      pipeline_task_id INT NOT NULL COMMENT '关联 PipelineTask.id',
      episode_id INT NULL COMMENT '关联短剧集ID（可选，未来扩展）',
      enterprise_id INT NOT NULL COMMENT '所属企业ID',
      user_id INT NOT NULL COMMENT '提交用户ID',

      title VARCHAR(200) NULL COMMENT '脚本标题',
      full_script TEXT NULL COMMENT '完整脚本文本',
      structured_script TEXT NULL COMMENT '结构化脚本 JSON (ScriptResult)',

      character_count INT NOT NULL DEFAULT 0 COMMENT '角色数量',
      scene_count INT NOT NULL DEFAULT 0 COMMENT '场景数量',
      estimated_duration INT NULL COMMENT '预估时长（秒）',
      total_words INT NOT NULL DEFAULT 0 COMMENT '总字数',

      version INT NOT NULL DEFAULT 1 COMMENT '版本号',
      status ENUM('draft','reviewed','approved','rejected')
        NOT NULL DEFAULT 'draft'
        COMMENT '脚本状态：draft=草稿 | reviewed=已审核 | approved=已批准 | rejected=已驳回',

      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

      INDEX idx_pipeline_task_id (pipeline_task_id),
      INDEX idx_enterprise_id (enterprise_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='脚本持久化记录表';
  `);

  console.log('[Migration 009] ✓ script_records table created');
}

async function down() {
  console.log('[Migration 009] Dropping script_records table...');

  await sequelize.query('DROP TABLE IF EXISTS script_records');

  console.log('[Migration 009] ✓ script_records table dropped');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 009] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 009] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
