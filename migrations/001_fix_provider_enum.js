/**
 * Migration 001: Fix provider ENUM to include 'aliyun'
 *
 * Sprint 5.3.1: Provider Field Fix
 *
 * 问题：
 *   数据库 generation_tasks.provider 的 ENUM 值为:
 *     ('dashscope','runway','kling','openai')
 *   没有包含 'aliyun'，导致写入 'aliyun' 时报错:
 *     SequelizeDatabaseError: Data truncated for column 'provider' at row 1
 *
 * 修复：
 *   ALTER TABLE 将 provider ENUM 修改为:
 *     ('dashscope','aliyun')
 *   并设置默认值为 'aliyun'（与 Sequelize 模型一致）
 *
 * 运行方式：
 *   node migrations/001_fix_provider_enum.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 001] Fixing provider ENUM...');

  await sequelize.query(
    "ALTER TABLE generation_tasks " +
    "MODIFY COLUMN provider enum('dashscope','aliyun') " +
    "NOT NULL DEFAULT 'aliyun' " +
    "COMMENT 'AI 提供商（Sprint 5.3.1: ENUM 修复，添加 aliyun）'"
  );

  console.log('[Migration 001] ✓ provider ENUM fixed to (dashscope, aliyun)');
}

async function down() {
  console.log('[Migration 001] Rolling back provider ENUM...');

  await sequelize.query(
    "ALTER TABLE generation_tasks " +
    "MODIFY COLUMN provider enum('dashscope','runway','kling','openai') " +
    "NOT NULL DEFAULT 'dashscope' " +
    "COMMENT 'AI 提供商'"
  );

  console.log('[Migration 001] ✓ provider ENUM rolled back to (dashscope, runway, kling, openai)');
}

// 直接运行
if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 001] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 001] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
