/**
 * Migration 011: Create avatars table
 *
 * Phase 004-Step5-C1 — DigitalHuman Studio 后端（Avatar）
 *
 * 表结构：
 *   - id: 主键
 *   - avatar_uuid: 对外唯一标识（UUID v4）
 *   - enterprise_id / user_id: 租户与用户（enterprise_id NULL = 官方形象）
 *   - name / description: 形象名称与描述
 *   - image_url / thumbnail_url: 主图与缩略图
 *   - asset_id: 关联 assets.id（图片素材）
 *   - source: 来源 ENUM (official/uploaded)
 *   - gender: 性别 ENUM (male/female/unknown)
 *   - status: 状态 ENUM (active/disabled)
 *   - sort: 排序权重
 *   - deleted_at: 软删除
 *   - created_at / updated_at: 时间戳
 *
 * 运行方式：
 *   node migrations/011_create_avatars.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 011] Creating avatars table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS avatars (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
      avatar_uuid VARCHAR(64) NOT NULL COMMENT '对外唯一标识（UUID v4），对齐 pipeline_uuid 惯例',
      enterprise_id INT NULL COMMENT '所属企业ID；NULL = 官方形象（全局可见）',
      user_id INT NULL COMMENT '上传用户ID（官方形象为 NULL）',
      name VARCHAR(100) NOT NULL COMMENT '形象名称（展示名）',
      description VARCHAR(500) NULL COMMENT '形象描述',
      image_url VARCHAR(500) NOT NULL COMMENT '形象主图 URL（直接可用，兼容 pipeline 的 image_url）',
      thumbnail_url VARCHAR(500) NULL COMMENT '缩略图 URL（列表用）',
      asset_id INT NULL COMMENT '关联 assets.id（复用素材体系，图片素材）',

      source ENUM('official','uploaded')
        NOT NULL DEFAULT 'uploaded'
        COMMENT '来源：official=官方种子 | uploaded=用户上传',
      gender ENUM('male','female','unknown')
        NOT NULL DEFAULT 'unknown'
        COMMENT '性别（可选过滤维度）',
      status ENUM('active','disabled')
        NOT NULL DEFAULT 'active'
        COMMENT '状态：active=可用 | disabled=停用（软下线）',
      sort INT NOT NULL DEFAULT 0 COMMENT '排序权重（官方形象列表排序用）',

      deleted_at DATETIME NULL COMMENT '软删除时间（我的形象删除用；官方形象不删除仅 disabled）',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

      UNIQUE INDEX idx_avatar_uuid (avatar_uuid),
      INDEX idx_enterprise_id (enterprise_id),
      INDEX idx_source (source),
      INDEX idx_status (status),
      INDEX idx_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='数字人形象表';
  `);

  console.log('[Migration 011] ✓ avatars table created');
}

async function down() {
  console.log('[Migration 011] Dropping avatars table...');

  await sequelize.query('DROP TABLE IF EXISTS avatars');

  console.log('[Migration 011] ✓ avatars table dropped');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 011] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 011] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
