/**
 * Migration 014: Auth-Rebuild-002 — 手机号认证数据层准备
 *
 * Phase DigitalHuman-Rebuild-004 → Auth-Rebuild-002（用户认证体系改造 · 数据层）
 *
 * 变更：
 *   1. enterprise_users 新增 phone VARCHAR(20) NULL + 唯一索引
 *      - 登录标识从 email 扩展出手机号；存量邮箱兼容期允许 NULL
 *      - 唯一索引命名为 `phone`（对齐 Sequelize 对列级 unique:true 的默认索引名，
 *        避免 init.js sequelize.sync({alter:true}) 重复建唯一索引）
 *      - 不改 enterprise_users.id（生产链路 pipeline/asset/billing 的 user_id 外键不变）
 *   2. 存量数据安全回填：email 为合法手机号（11 位且以 1 开头）且 phone 为空
 *      且无其他行占用该手机号 → 复制 email 到 phone（幂等、冲突安全）
 *   3. 新建 verification_codes 表（短信验证码：登录/注册/忘记密码）
 *      - 无 Redis，验证码持久化到 MySQL（对齐项目现状）
 *
 * 原则：
 *   - 仅「增列 + 回填 + 建新表」，不删除/不重命名既有字段，不重建表
 *   - 不修改任何登录接口 / UI / JWT / Pipeline / Asset（数据层只做准备）
 *
 * 运行方式：
 *   node migrations/014_add_phone_and_create_verification_codes.js
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function up() {
  console.log('[Migration 014] Adding phone column to enterprise_users...');

  // 1. enterprise_users 新增 phone（NULL，兼容存量邮箱）
  await sequelize.query(
    "ALTER TABLE enterprise_users " +
    "ADD COLUMN phone VARCHAR(20) NULL " +
    "COMMENT '手机号（登录标识，Auth-Rebuild-002；存量邮箱兼容期允许 NULL）' " +
    "AFTER email"
  );

  // 2. phone 唯一索引（MySQL 唯一索引允许多个 NULL，存量行不受影响）
  await sequelize.query(
    "ALTER TABLE enterprise_users ADD UNIQUE INDEX phone (phone)"
  );

  console.log('[Migration 014] ✓ phone column + unique index added');

  // 3. 存量数据安全回填：仅当 email 是合法手机号、phone 为空、且无其他行占用
  //    才复制 email → phone。幂等；与唯一索引冲突的行自动跳过。
  console.log('[Migration 014] Backfilling phone from legacy email values...');
  const [backfillResult] = await sequelize.query(
    "UPDATE enterprise_users eu " +
    "LEFT JOIN enterprise_users other " +
    "  ON other.phone = eu.email AND other.id <> eu.id " +
    "SET eu.phone = eu.email " +
    "WHERE eu.phone IS NULL " +
    "  AND eu.email REGEXP '^1[0-9]{10}$' " +
    "  AND other.id IS NULL"
  );
  console.log(
    `[Migration 014] ✓ backfill affected ${backfillResult.affectedRows} row(s)`
  );

  // 4. 新建 verification_codes 表
  console.log('[Migration 014] Creating verification_codes table...');
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
      phone VARCHAR(20) NOT NULL COMMENT '目标手机号（对齐 enterprise_users.phone）',
      code VARCHAR(8) NOT NULL COMMENT '验证码（当前明文存储；后续安全 phase 可升级为哈希）',

      purpose ENUM('login','register','reset')
        NOT NULL DEFAULT 'login'
        COMMENT '用途：login=验证码登录(未注册自动注册) | register=注册 | reset=忘记密码重置',
      expires_at DATETIME NOT NULL COMMENT '过期时间（校验时须比对 now < expires_at）',
      used_at DATETIME NULL COMMENT '使用时间；NULL=未使用，非 NULL=已消费（防重放）',
      request_ip VARCHAR(45) NULL COMMENT '请求来源 IP（可选，频控审计）',

      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

      INDEX idx_phone_purpose (phone, purpose),
      INDEX idx_expires_at (expires_at),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='短信验证码表（Auth-Rebuild-002）';
  `);

  console.log('[Migration 014] ✓ verification_codes table created');
}

async function down() {
  console.log('[Migration 014] Rolling back...');

  // 回滚顺序与 up 相反：先删验证码表，再删 phone 列（含唯一索引）
  await sequelize.query('DROP TABLE IF EXISTS verification_codes');
  console.log('[Migration 014] ✓ verification_codes table dropped');

  // ⚠️ 有损回滚：删除 phone 列会一并丢失回填的手机号数据。
  //    仅当确认手机号认证已下线、且无需保留 phone 数据时才执行。
  await sequelize.query(
    "ALTER TABLE enterprise_users DROP INDEX phone"
  );
  await sequelize.query(
    "ALTER TABLE enterprise_users DROP COLUMN phone"
  );
  console.log('[Migration 014] ✓ phone column and unique index dropped');

  console.log('[Migration 014] ✓ rolled back');
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      await up();
      console.log('[Migration 014] Migration completed successfully.');
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('[Migration 014] Migration failed:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
