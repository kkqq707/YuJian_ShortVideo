/**
 * Migration 007: Create drama_shots table
 *
 * Sprint 1 — DramaPipeline: 镜头表（视频生成单元）
 *
 * 表结构：
 *   - id: 主键
 *   - scene_id: 关联 drama_scenes.id
 *   - shot_number: 镜头编号
 *   - description: 镜头描述
 *   - prompt: AI生成提示词
 *   - duration: 目标时长（秒）
 *   - task_id: 关联 generation_tasks.id（复用现有生成任务）
 *   - output_asset_id: 关联 assets.id（生成结果）
 *   - status: ENUM('draft','pending','generating','completed','failed')
 *   - version: 版本号
 *   - parent_shot_id: 自引用，父镜头ID（版本追溯）
 *   - created_at / updated_at
 *
 * 运行方式：
 *   node migrations/007_create_drama_shots.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 007] Creating drama_shots table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS drama_shots (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '镜头ID',
      scene_id INT NOT NULL COMMENT '所属场景ID',
      shot_number INT NOT NULL COMMENT '镜头编号',
      description TEXT COMMENT '镜头描述',
      prompt TEXT COMMENT 'AI生成提示词',
      duration INT COMMENT '目标时长（秒）',
      task_id INT COMMENT '关联的GenerationTask.id（复用现有生成任务）',
      output_asset_id INT COMMENT '生成结果关联的Asset.id',
      status ENUM('draft','pending','generating','completed','failed') NOT NULL DEFAULT 'draft'
        COMMENT '镜头状态：draft=草稿 | pending=排队中 | generating=生成中 | completed=已完成 | failed=失败',
      version INT NOT NULL DEFAULT 1 COMMENT '版本号（支持重新生成）',
      parent_shot_id INT COMMENT '父镜头ID（自引用，用于版本追溯）',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_scene_id (scene_id),
      INDEX idx_task_id (task_id),
      INDEX idx_output_asset_id (output_asset_id),
      INDEX idx_status (status),
      INDEX idx_parent_shot_id (parent_shot_id),
      INDEX idx_scene_shot (scene_id, shot_number),
      CONSTRAINT fk_drama_shots_scene
        FOREIGN KEY (scene_id) REFERENCES drama_scenes(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_drama_shots_task
        FOREIGN KEY (task_id) REFERENCES generation_tasks(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_drama_shots_output_asset
        FOREIGN KEY (output_asset_id) REFERENCES assets(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_drama_shots_parent
        FOREIGN KEY (parent_shot_id) REFERENCES drama_shots(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='短剧镜头表（视频生成单元）';
  `);

  console.log('[Migration 007] ✓ drama_shots table created');
}

async function down() {
  console.log('[Migration 007] Dropping drama_shots table...');

  await sequelize.query('DROP TABLE IF EXISTS drama_shots');

  console.log('[Migration 007] ✓ drama_shots table dropped');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 007] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 007] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
