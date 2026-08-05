/**
 * Migration 006: Create drama_characters table
 *
 * Sprint 1 — DramaPipeline: 角色表
 *
 * 表结构：
 *   - id: 主键
 *   - project_id: 关联 drama_projects.id
 *   - name: 角色名称
 *   - description: 角色描述
 *   - avatar_asset_id: 关联 assets.id（角色头像）
 *   - character_prompt: AI角色一致性提示词
 *   - created_at / updated_at
 *
 * 运行方式：
 *   node migrations/006_create_drama_characters.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 006] Creating drama_characters table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS drama_characters (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '角色ID',
      project_id INT NOT NULL COMMENT '所属短剧项目ID',
      name VARCHAR(100) NOT NULL COMMENT '角色名称',
      description TEXT COMMENT '角色描述',
      avatar_asset_id INT COMMENT '角色头像关联的Asset.id',
      character_prompt TEXT COMMENT 'AI角色一致性提示词',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_project_id (project_id),
      INDEX idx_avatar_asset_id (avatar_asset_id),
      CONSTRAINT fk_drama_characters_project
        FOREIGN KEY (project_id) REFERENCES drama_projects(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_drama_characters_asset
        FOREIGN KEY (avatar_asset_id) REFERENCES assets(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='短剧角色表';
  `);

  console.log('[Migration 006] ✓ drama_characters table created');
}

async function down() {
  console.log('[Migration 006] Dropping drama_characters table...');

  await sequelize.query('DROP TABLE IF EXISTS drama_characters');

  console.log('[Migration 006] ✓ drama_characters table dropped');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 006] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 006] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
