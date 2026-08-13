/**
 * Migration 013: Alter script_records table
 *
 * Phase 004-Step5-C3 — DigitalHuman Studio 后端（ScriptRecord 调整）
 *
 * 变更：
 *   1. pipeline_task_id 放宽为可空（支持独立草稿，无 pipeline 关联时为 NULL）
 *   2. 新增 source_type ENUM('pipeline','ai','manual') DEFAULT 'pipeline'
 *      pipeline=pipeline 内生成 | ai=AI 独立生成 | manual=手写草稿
 *   3. 新增 deleted_at DATETIME NULL（草稿软删除）
 *   4. 新增索引 idx_source_type / idx_deleted_at
 *
 * 原则：
 *   - 仅「放宽 + 增列」，不删除/不重命名既有字段，不重建表
 *   - 现有行回填 source_type='pipeline'（现有记录均为 pipeline 生成，语义正确）
 *
 * 运行方式：
 *   node migrations/013_alter_script_records.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 013] Altering script_records table...');

  // 1. 放宽 pipeline_task_id 可空（支持独立草稿）
  await sequelize.query(
    "ALTER TABLE script_records " +
    "MODIFY COLUMN pipeline_task_id INT NULL " +
    "COMMENT '关联 PipelineTask.id（独立草稿为 NULL）'"
  );

  // 2. 新增 source_type（现有行回填默认 'pipeline'）
  await sequelize.query(
    "ALTER TABLE script_records " +
    "ADD COLUMN source_type ENUM('pipeline','ai','manual') " +
    "NOT NULL DEFAULT 'pipeline' " +
    "COMMENT '来源类型：pipeline=pipeline 内生成 | ai=AI 独立生成 | manual=手写草稿' " +
    "AFTER pipeline_task_id"
  );

  // 3. 新增 deleted_at（软删除）
  await sequelize.query(
    "ALTER TABLE script_records " +
    "ADD COLUMN deleted_at DATETIME NULL " +
    "COMMENT '软删除时间（草稿删除用）' " +
    "AFTER status"
  );

  // 4. 索引
  await sequelize.query(
    "ALTER TABLE script_records ADD INDEX idx_source_type (source_type)"
  );
  await sequelize.query(
    "ALTER TABLE script_records ADD INDEX idx_deleted_at (deleted_at)"
  );

  console.log('[Migration 013] ✓ script_records altered');
}

async function down() {
  console.log('[Migration 013] Rolling back script_records...');

  // ⚠️ 注意：恢复 pipeline_task_id NOT NULL 前，需先确认表中不存在
  //   pipeline_task_id IS NULL 的独立草稿，否则此 MODIFY 会失败（有损回滚）。
  await sequelize.query(
    "ALTER TABLE script_records " +
    "MODIFY COLUMN pipeline_task_id INT NOT NULL " +
    "COMMENT '关联 PipelineTask.id'"
  );

  await sequelize.query("ALTER TABLE script_records DROP INDEX idx_source_type");
  await sequelize.query("ALTER TABLE script_records DROP COLUMN source_type");
  await sequelize.query("ALTER TABLE script_records DROP INDEX idx_deleted_at");
  await sequelize.query("ALTER TABLE script_records DROP COLUMN deleted_at");

  console.log('[Migration 013] ✓ script_records rolled back');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 013] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 013] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
