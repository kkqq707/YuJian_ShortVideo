/**
 * Migration 005: Create drama_scenes table
 *
 * Sprint 1 — DramaPipeline: 场景表
 *
 * 表结构：
 *   - id: 主键
 *   - episode_id: 关联 drama_episodes.id
 *   - scene_number: 场景编号
 *   - location: 场景地点
 *   - description: 场景描述
 *   - status: ENUM('draft','generating','completed','failed')
 *   - created_at / updated_at
 *
 * 运行方式：
 *   node migrations/005_create_drama_scenes.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 005] Creating drama_scenes table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS drama_scenes (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '场景ID',
      episode_id INT NOT NULL COMMENT '所属剧集ID',
      scene_number INT NOT NULL COMMENT '场景编号',
      location VARCHAR(200) COMMENT '场景地点',
      description TEXT COMMENT '场景描述',
      status ENUM('draft','generating','completed','failed') NOT NULL DEFAULT 'draft'
        COMMENT '场景状态：draft=草稿 | generating=生成中 | completed=已完成 | failed=失败',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_episode_id (episode_id),
      INDEX idx_status (status),
      UNIQUE INDEX idx_episode_scene (episode_id, scene_number),
      CONSTRAINT fk_drama_scenes_episode
        FOREIGN KEY (episode_id) REFERENCES drama_episodes(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='短剧场景表';
  `);

  console.log('[Migration 005] ✓ drama_scenes table created');
}

async function down() {
  console.log('[Migration 005] Dropping drama_scenes table...');

  await sequelize.query('DROP TABLE IF EXISTS drama_scenes');

  console.log('[Migration 005] ✓ drama_scenes table dropped');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 005] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 005] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
