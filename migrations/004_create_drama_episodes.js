/**
 * Migration 004: Create drama_episodes table
 *
 * Sprint 1 — DramaPipeline: 剧集表
 *
 * 表结构：
 *   - id: 主键
 *   - project_id: 关联 drama_projects.id
 *   - episode_number: 剧集编号
 *   - title: 剧集标题
 *   - status: ENUM('draft','generating','completed','failed')
 *   - created_at / updated_at
 *
 * 运行方式：
 *   node migrations/004_create_drama_episodes.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 004] Creating drama_episodes table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS drama_episodes (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '剧集ID',
      project_id INT NOT NULL COMMENT '所属短剧项目ID',
      episode_number INT NOT NULL COMMENT '剧集编号（第几集）',
      title VARCHAR(200) COMMENT '剧集标题',
      status ENUM('draft','generating','completed','failed') NOT NULL DEFAULT 'draft'
        COMMENT '剧集状态：draft=草稿 | generating=生成中 | completed=已完成 | failed=失败',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_project_id (project_id),
      INDEX idx_status (status),
      UNIQUE INDEX idx_project_episode (project_id, episode_number),
      CONSTRAINT fk_drama_episodes_project
        FOREIGN KEY (project_id) REFERENCES drama_projects(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='短剧剧集表';
  `);

  console.log('[Migration 004] ✓ drama_episodes table created');
}

async function down() {
  console.log('[Migration 004] Dropping drama_episodes table...');

  await sequelize.query('DROP TABLE IF EXISTS drama_episodes');

  console.log('[Migration 004] ✓ drama_episodes table dropped');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 004] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 004] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
