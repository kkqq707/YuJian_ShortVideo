/**
 * Migration 002: Add retry_count column to generation_tasks
 *
 * 需求：生成任务状态展示系统升级
 *
 * 新增字段：
 *   retry_count INT DEFAULT 0 COMMENT '重试次数'
 *
 * 运行方式：
 *   node migrations/002_add_retry_count.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 002] Adding retry_count column...');

  await sequelize.query(
    "ALTER TABLE generation_tasks " +
    "ADD COLUMN retry_count INT DEFAULT 0 " +
    "COMMENT '重试次数' " +
    "AFTER progress"
  );

  console.log('[Migration 002] ✓ retry_count column added');
}

async function down() {
  console.log('[Migration 002] Rolling back retry_count column...');

  await sequelize.query(
    "ALTER TABLE generation_tasks DROP COLUMN retry_count"
  );

  console.log('[Migration 002] ✓ retry_count column removed');
}

// 直接运行
if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 002] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 002] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
