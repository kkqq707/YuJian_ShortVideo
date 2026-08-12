/**
 * Migration 010: Extend generation_tasks.task_type ENUM
 *
 * Phase 004-Step4-A1 — DigitalHuman Pipeline Data Layer
 *
 * 变更：
 *   在 generation_tasks.task_type ENUM 中追加 3 个新值:
 *     - 'vision_analysis'   — Vision 视觉理解
 *     - 'script_generation' — Script 脚本生成
 *     - 'tts_generation'    — TTS 语音合成
 *
 * 现状 ENUM:
 *   ('text2video','image2video','ref2video','digital_human','text2image','video_edit')
 *
 * 变更后 ENUM:
 *   ('text2video','image2video','ref2video','digital_human','text2image','video_edit',
 *    'vision_analysis','script_generation','tts_generation')
 *
 * 原则：
 *   - 只追加，不删除、不重命名、不调整已有值语义
 *   - 保留已有数据完全兼容
 *   - MySQL ENUM 追加新值不重建表，不影响已有行
 *
 * 运行方式：
 *   node migrations/010_extend_generation_task_type.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 010] Extending generation_tasks.task_type ENUM...');

  await sequelize.query(
    "ALTER TABLE generation_tasks " +
    "MODIFY COLUMN task_type ENUM(" +
      "'text2video','image2video','ref2video'," +
      "'digital_human','text2image','video_edit'," +
      "'vision_analysis','script_generation','tts_generation'" +
    ") NOT NULL " +
    "COMMENT '任务类型'"
  );

  console.log('[Migration 010] ✓ task_type ENUM extended with vision_analysis, script_generation, tts_generation');
}

async function down() {
  console.log('[Migration 010] Rolling back task_type ENUM...');

  await sequelize.query(
    "ALTER TABLE generation_tasks " +
    "MODIFY COLUMN task_type ENUM(" +
      "'text2video','image2video','ref2video'," +
      "'digital_human','text2image','video_edit'" +
    ") NOT NULL " +
    "COMMENT '任务类型'"
  );

  console.log('[Migration 010] ✓ task_type ENUM rolled back to original values');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 010] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 010] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
