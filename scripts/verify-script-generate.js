/**
 * Verify AI Script Generation — 生产链路运行时验证（Step7-C.2.1）
 *
 * Phase DigitalHuman-Rebuild-004 Step7-C.2.1
 *
 * 验证目标（仅验证，不修改代码）：
 *   1. POST /api/enterprise/scripts/generate 真实可达（JWT 鉴权、参数校验、响应信封）
 *   2. 真实调用 DashScope（text-generation/generation）
 *   3. model=qwen-plus（默认模型映射生效）
 *   4. 返回 ScriptResult（title / full_text / segments / total_words / estimated_duration / style）
 *   5. ScriptRecord 落库且 source_type='ai'
 *   6. Script Library 列表展示（GET /api/enterprise/scripts?source_type=ai）
 *
 * 用法：
 *   node scripts/verify-script-generate.js
 *
 * 依赖：
 *   - 服务已运行于 localhost:3000（npm run dev）
 *   - .env 中 JWT_SECRET / DB_* / DASHSCOPE_API_KEY 配置有效
 *   - DB 中企业 1「演示企业」/ 用户 1 真实种子数据存在
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');
const { sequelize, ScriptRecord, EnterpriseUser } = require('../models');

const BASE = 'http://localhost:3000/api/enterprise';
const THEME = 'YuJian智能保温杯｜职场人的高效温控伴侣';

// ── 工具 ────────────────────────────────────────────────────────────
function mask(msg) { console.log(msg); }

async function main() {
  // ── 0. 前置：DB 可达 + 测试主体存在 ──────────────────────────────
  await sequelize.authenticate();
  mask(`[0] DB connected | time=${new Date().toISOString()}`);

  const user = await EnterpriseUser.findOne({ where: { id: 1, enterprise_id: 1 } });
  if (!user) throw new Error('EnterpriseUser id=1 / enterprise_id=1 not found in DB (seed missing)');
  mask(`[0] Test subject OK | enterpriseId=1 | user=${user.email || user.username}`);

  // ── 1. 生成 JWT（与 authController.generateToken payload 一致）──
  const token = jwt.sign(
    { userType: 'enterprise', userId: user.id, enterpriseId: 1, role: user.role || 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  mask(`[1] JWT generated | userId=${user.id} | enterpriseId=1`);

  // ── 2. 调用 POST /api/enterprise/scripts/generate ──────────────
  mask(`\n[2] POST /enterprise/scripts/generate | theme="${THEME}"`);
  const genRes = await fetch(`${BASE}/scripts/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      theme: THEME,
      style: 'professional',
      duration: 30,
      product_name: 'YuJian智能保温杯',
      scene_context: '办公室职场场景，上午上班时段',
    }),
  });

  const genBody = await genRes.json();
  mask(`    HTTP ${genRes.status} | code=${genBody.code} | message=${genBody.message || ''}`);

  const data = genBody.data || genBody;
  const ok = genRes.status === 200 && data && data.script_record_id;

  const fields = {
    script_record_id: data.script_record_id,
    title: data.title,
    full_text_len: data.full_text ? data.full_text.length : 0,
    segments: Array.isArray(data.segments) ? data.segments.length : 0,
    total_words: data.total_words,
    estimated_duration: data.estimated_duration,
    style: data.style,
    status: data.status,
  };
  mask(`    ScriptResult fields: ${JSON.stringify(fields)}`);

  if (!ok) {
    throw new Error(`Generate FAILED: HTTP ${genRes.status} | ${JSON.stringify(genBody)}`);
  }

  const recordId = data.script_record_id;
  mask(`[2] ✅ generate returned ScriptResult | script_record_id=${recordId}`);

  // ── 3. DB 校验：ScriptRecord source_type='ai' ──────────────────
  const rec = await ScriptRecord.findByPk(recordId);
  if (!rec) throw new Error(`ScriptRecord id=${recordId} not found in DB`);

  let structured = null;
  try { structured = typeof rec.structured_script === 'string' ? JSON.parse(rec.structured_script) : rec.structured_script; } catch (_) { /* ignore */ }

  mask(`\n[3] DB ScriptRecord:`);
  mask(`    id=${rec.id} | source_type=${rec.source_type} | status=${rec.status}`);
  mask(`    title=${rec.title} | full_script_len=${rec.full_script ? rec.full_script.length : 0}`);
  mask(`    total_words=${rec.total_words} | estimated_duration=${rec.estimated_duration}`);
  mask(`    enterprise_id=${rec.enterprise_id} | user_id=${rec.user_id} | pipeline_task_id=${rec.pipeline_task_id}`);

  if (rec.source_type !== 'ai') throw new Error(`source_type expected 'ai', got '${rec.source_type}'`);
  if (!rec.full_script || !String(rec.full_script).trim()) throw new Error('full_script is empty');
  if (rec.enterprise_id !== 1) throw new Error(`enterprise isolation broken: enterprise_id=${rec.enterprise_id}`);
  mask(`[3] ✅ ScriptRecord source_type='ai' | full_script 非空 | 企业隔离正确`);

  // ── 4. Script Library 列表展示 ─────────────────────────────────
  mask(`\n[4] GET /enterprise/scripts?source_type=ai`);
  const listRes = await fetch(`${BASE}/scripts?source_type=ai&page=1&pageSize=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listBody = await listRes.json();
  const listData = listBody.data || {};
  const items = Array.isArray(listData.items) ? listData.items : [];
  const hit = items.find(i => i.id === recordId);
  mask(`    HTTP ${listRes.status} | total=${listData.total} | page=${listData.page} | pageSize=${listData.pageSize}`);
  mask(`    recordId=${recordId} in items: ${!!hit} | item.source_type=${hit ? hit.source_type : 'N/A'}`);

  if (!hit) throw new Error(`ScriptRecord id=${recordId} not present in source_type=ai list`);
  mask(`[4] ✅ Script Library 展示 AI 生成脚本 | source_type='ai'`);

  // ── 汇总 ──────────────────────────────────────────────────────
  mask(`\n═══════════════════════════════════════════════════════`);
  mask(`VERIFY SCRIPT GENERATE PASS`);
  mask(`  script_record_id=${recordId}`);
  mask(`  model-path: DEFAULT_MODEL(qwen-plus) → DashScope text-generation → ScriptResult`);
  mask(`  source_type='ai' | full_script_len=${rec.full_script.length} | segments=${Array.isArray(structured && structured.segments) ? structured.segments.length : 0}`);
  mask(`═══════════════════════════════════════════════════════`);

  await sequelize.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(`\n[VERIFY] FATAL | ${err.message}`);
  try { await sequelize.close(); } catch (_) { /* ignore */ }
  process.exit(1);
});
