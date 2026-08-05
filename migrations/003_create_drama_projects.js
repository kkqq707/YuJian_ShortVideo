/**
 * Migration 003: Create drama_projects table
 *
 * Sprint 1 — DramaPipeline: 短剧项目表
 *
 * 表结构：
 *   - id: 主键
 *   - enterprise_id: 关联 enterprises.id
 *   - title: 短剧标题
 *   - description: 短剧描述/梗概
 *   - status: ENUM('draft','generating','completed','failed')
 *   - total_duration: 总时长（秒）
 *   - created_at / updated_at
 *
 * 运行方式：
 *   node migrations/003_create_drama_projects.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 003] Creating drama_projects table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS drama_projects (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '短剧项目ID',
      enterprise_id INT NOT NULL COMMENT '所属企业ID',
      title VARCHAR(200) NOT NULL COMMENT '短剧标题',
      description TEXT COMMENT '短剧描述/梗概',
      status ENUM('draft','generating','completed','failed') NOT NULL DEFAULT 'draft'
        COMMENT '项目状态：draft=草稿 | generating=生成中 | completed=已完成 | failed=失败',
      total_duration INT NOT NULL DEFAULT 0 COMMENT '总时长（秒）',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_enterprise_id (enterprise_id),
      INDEX idx_status (status),
      CONSTRAINT fk_drama_projects_enterprise
        FOREIGN KEY (enterprise_id) REFERENCES enterprises(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='短剧项目表';
  `);

  console.log('[Migration 003] ✓ drama_projects table created');
}

async function down() {
  console.log('[Migration 003] Dropping drama_projects table...');

  await sequelize.query('DROP TABLE IF EXISTS drama_projects');

  console.log('[Migration 003] ✓ drama_projects table dropped');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 003] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 003] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
