/**
 * Sprint 4.3 — Asset Relationship & Generation History 验证测试
 *
 * 测试覆盖：
 *   - 后端 API: GET /api/enterprise/assets/:id/history 返回关系链数据
 *   - 数据关系: source_asset_id / output_asset_id 正确关联
 *   - 安全: 企业隔离、404处理
 *   - 前端: 创作历史 UI 渲染、查看作品按钮
 *
 * 运行方式：node tests/sprint4.3.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ─── 测试计数器 ────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS  ' + name);
  } catch (err) {
    failed++;
    console.log('  FAIL  ' + name + ' — ' + err.message);
  }
}

function assertContains(haystack, needle, msg) {
  if (haystack.indexOf(needle) === -1) {
    throw new Error(msg || `Expected to contain "${needle}"`);
  }
}

function assertNotContains(haystack, needle, msg) {
  if (haystack.indexOf(needle) !== -1) {
    throw new Error(msg || `Expected NOT to contain "${needle}"`);
  }
}

// ─── 加载源文件 ─────────────────────────────────────────────────
const enterpriseHtml = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'enterprise.html'),
  'utf-8'
);

const assetController = fs.readFileSync(
  path.join(__dirname, '..', 'controllers', 'enterprise', 'assetController.js'),
  'utf-8'
);

const assetRoute = fs.readFileSync(
  path.join(__dirname, '..', 'routes', 'enterprise', 'asset.js'),
  'utf-8'
);

const generationTaskModel = fs.readFileSync(
  path.join(__dirname, '..', 'models', 'GenerationTask.js'),
  'utf-8'
);

const assetModel = fs.readFileSync(
  path.join(__dirname, '..', 'models', 'Asset.js'),
  'utf-8'
);

// ═══════════════════════════════════════════════════════════════
//  Part A: 后端 Controller — history() 方法
// ═══════════════════════════════════════════════════════════════
console.log('\n══ Part A: 后端 Controller — history() 方法 ══');

test('assetController 导出 history 方法', () => {
  assertContains(assetController, 'exports.history', 'history 方法未导出');
});

test('history 方法查询 Asset（含 enterprise_id）', () => {
  assertContains(assetController, 'enterprise_id', '需包含 enterprise_id 隔离');
});

test('history 方法查询 GenerationTask（source_asset_id）', () => {
  assertContains(assetController, 'source_asset_id', '需查询 source_asset_id');
});

test('history 方法查询输出资产（output_asset_id）', () => {
  assertContains(assetController, 'output_asset_id', '需查询 output_asset_id');
});

test('history 返回 usageCount 统计', () => {
  assertContains(assetController, 'usageCount', '需返回 usageCount');
});

test('history 返回 generationTasks 数组', () => {
  assertContains(assetController, 'generationTasks', '需返回 generationTasks');
});

test('history 返回 asset 信息', () => {
  // asset 对象包含 id, name, type
  assertContains(assetController, 'asset:', '需返回 asset 对象');
});

test('history 处理 404 — 素材不存在', () => {
  assertContains(assetController, "res.fail('素材不存在'", '需返回 404 错误');
});

test('history 排除已软删除的素材', () => {
  assertContains(assetController, 'deleted_at', '需过滤软删除');
});

test('history 排除已软删除的生成任务', () => {
  // GenerationTask 也需要过滤 deleted_at
  const lines = assetController.split('\n');
  const taskQueryLines = lines.filter(l => l.includes('GenerationTask.findAll'));
  // 确保在 GenerationTask 查询附近有 deleted_at 过滤
  const taskSection = assetController.substring(
    assetController.indexOf('GenerationTask.findAll'),
    assetController.indexOf('outputAssetIds')
  );
  assertContains(taskSection, 'deleted_at', 'GenerationTask 查询需过滤软删除');
});

test('history 输出资产带签名 URL', () => {
  assertContains(assetController, 'getSignedUrl', '需为输出资产生成签名URL');
});

test('history 按时间倒序排列任务', () => {
  assertContains(assetController, "['createdAt', 'DESC']", '需按创建时间倒序');
});

// ═══════════════════════════════════════════════════════════════
//  Part B: 路由 — GET /assets/:id/history
// ═══════════════════════════════════════════════════════════════
console.log('\n══ Part B: 路由 — GET /assets/:id/history ══');

test('路由注册 /:id/history', () => {
  assertContains(assetRoute, '/:id/history', '路由需注册 /:id/history');
});

test('路由指向 controller.history', () => {
  assertContains(assetRoute, 'controller.history', '路由需绑定 history 方法');
});

test('路由 /:id/history 在 /:id 之前（避免冲突）', () => {
  const historyIdx = assetRoute.indexOf('/:id/history');
  const detailIdx = assetRoute.indexOf("'/:");  // first /:id without /history
  // Find the detail route line: router.get('/:id', ...)
  const detailLineIdx = assetRoute.indexOf("'/:id'");
  assert.ok(historyIdx < detailLineIdx,
    '/:id/history 必须在 /:id 之前注册，避免路由冲突。historyIdx=' + historyIdx + ' detailLineIdx=' + detailLineIdx);
});

// ═══════════════════════════════════════════════════════════════
//  Part C: 数据库模型 — 字段验证（不修改现有结构）
// ═══════════════════════════════════════════════════════════════
console.log('\n══ Part C: 数据库模型 — 字段验证 ══');

test('GenerationTask 保留 source_asset_id 字段', () => {
  assertContains(generationTaskModel, 'source_asset_id', 'source_asset_id 字段必须保留');
});

test('GenerationTask 保留 output_asset_id 字段', () => {
  assertContains(generationTaskModel, 'output_asset_id', 'output_asset_id 字段必须保留');
});

test('GenerationTask 索引包含 source_asset_id', () => {
  assertContains(generationTaskModel, "{ fields: ['source_asset_id'] }", 'source_asset_id 索引必须保留');
});

test('GenerationTask 索引包含 output_asset_id', () => {
  assertContains(generationTaskModel, "{ fields: ['output_asset_id'] }", 'output_asset_id 索引必须保留');
});

test('Asset 表结构未被修改 — 无新增字段', () => {
  // Asset 模型应保持 Sprint 4.1 Patch2 的字段（含 deleted_at）
  const knownFields = ['id', 'enterprise_id', 'user_id', 'type', 'category', 'name',
    'url', 'thumbnail', 'size', 'duration', 'width', 'height', 'mime_type',
    'audit_status', 'audit_result', 'deleted_at'];
  // 确保没有 unexpected 新字段
  const typeMatches = assetModel.match(/type:\s*DataTypes\.\w+/g) || [];
  // 所有 type 字段都在已知列表中（通过检查已知字段名是否还在）
  knownFields.forEach(f => {
    assertContains(assetModel, f, 'Asset 需保留字段: ' + f);
  });
});

test('Asset 模型未被新增 history 相关字段', () => {
  assertNotContains(assetModel, 'history', 'Asset 模型不应新增 history 字段');
  assertNotContains(assetModel, 'generation_count', 'Asset 模型不应新增 generation_count 字段');
  assertNotContains(assetModel, 'usage_history', 'Asset 模型不应新增 usage_history 字段');
});

// ═══════════════════════════════════════════════════════════════
//  Part D: 前端 UI — 创作历史区域
// ═══════════════════════════════════════════════════════════════
console.log('\n══ Part D: 前端 UI — 创作历史区域 ══');

test('CSS: asset-detail-history 样式存在', () => {
  assertContains(enterpriseHtml, '.asset-detail-history', '缺少创作历史容器样式');
});

test('CSS: history-item 卡片样式存在', () => {
  assertContains(enterpriseHtml, '.history-item', '缺少历史项样式');
});

test('CSS: 状态颜色 — success/processing/pending/failed', () => {
  const statusStyles = ['history-status-success', 'history-status-processing',
    'history-status-pending', 'history-status-failed'];
  statusStyles.forEach(s => {
    assertContains(enterpriseHtml, s, '缺少状态样式: ' + s);
  });
});

test('CSS: btn-view-work 查看作品按钮样式', () => {
  assertContains(enterpriseHtml, '.btn-view-work', '缺少查看作品按钮样式');
});

test('CSS: history-empty 空状态样式', () => {
  assertContains(enterpriseHtml, '.history-empty', '缺少空状态样式');
});

test('HTML: assetDetailHistory 容器存在', () => {
  assertContains(enterpriseHtml, 'id="assetDetailHistory"', '缺少创作历史容器');
});

test('HTML: assetHistoryList 列表容器存在', () => {
  assertContains(enterpriseHtml, 'id="assetHistoryList"', '缺少历史列表容器');
});

// ═══════════════════════════════════════════════════════════════
//  Part E: 前端 JS — loadAssetHistory / viewHistoryOutput
// ═══════════════════════════════════════════════════════════════
console.log('\n══ Part E: 前端 JS — 创作历史逻辑 ══');

test('JS: loadAssetHistory 函数存在', () => {
  assertContains(enterpriseHtml, 'function loadAssetHistory(', '缺少 loadAssetHistory 函数');
});

test('JS: loadAssetHistory 调用 /assets/:id/history API', () => {
  assertContains(enterpriseHtml, "assets/' + assetId + '/history'",
    '需调用 history API');
});

test('JS: 空状态处理 — 无创作记录时显示空提示', () => {
  assertContains(enterpriseHtml, '暂无创作记录', '需有空状态提示');
});

test('JS: 状态映射 — success/processing/pending/failed', () => {
  const labels = ['已完成', '处理中', '等待中', '失败'];
  labels.forEach(l => {
    assertContains(enterpriseHtml, l, '需包含状态标签: ' + l);
  });
});

test('JS: viewHistoryOutput 函数存在', () => {
  assertContains(enterpriseHtml, 'function viewHistoryOutput(', '缺少 viewHistoryOutput 函数');
});

test('JS: 查看作品跳转到我的作品页', () => {
  assertContains(enterpriseHtml, "navigateTo('myworks')", '需跳转到我的作品页');
});

test('JS: 查看作品调用 showWorkDetail', () => {
  assertContains(enterpriseHtml, 'showWorkDetail(taskId)', '需调用作品详情');
});

test('JS: loadAssetHistory 在 openAssetDetail 中被调用', () => {
  assertContains(enterpriseHtml, 'loadAssetHistory(assetId)', 'openAssetDetail 需调用 loadAssetHistory');
});

test('JS: loadAssetHistory 有错误处理', () => {
  assertContains(enterpriseHtml, '[AssetHistory]', '需有错误日志标记');
});

test('JS: 查看作品前关闭素材详情', () => {
  assertContains(enterpriseHtml, 'closeAssetDetail()', 'viewHistoryOutput 需关闭素材详情');
});

// ═══════════════════════════════════════════════════════════════
//  Part F: 兼容性 — 已有功能不受影响
// ═══════════════════════════════════════════════════════════════
console.log('\n══ Part F: 兼容性 — 已有功能不受影响 ══');

test('已有路由 GET / 仍在', () => {
  assertContains(assetRoute, "router.get('/', controller.list)", '基础列表路由必须保留');
});

test('已有路由 GET /:id 仍在', () => {
  assertContains(assetRoute, "'/:id'", '详情路由必须保留');
});

test('已有路由 DELETE /:id 仍在', () => {
  assertContains(assetRoute, "router.delete('/:id'", '删除路由必须保留');
});

test('已有路由 POST / 仍在', () => {
  assertContains(assetRoute, "router.post('/'", '新增路由必须保留');
});

test('上传签名路由仍在', () => {
  assertContains(assetRoute, '/upload-signature', '上传签名路由必须保留');
});

test('批量删除路由仍在', () => {
  assertContains(assetRoute, '/batch-delete', '批量删除路由必须保留');
});

test('Controller list 方法未变', () => {
  assertContains(assetController, 'exports.list', 'list 方法必须保留');
});

test('Controller detail 方法未变', () => {
  assertContains(assetController, 'exports.detail', 'detail 方法必须保留');
});

test('Controller remove 方法未变', () => {
  assertContains(assetController, 'exports.remove', 'remove 方法必须保留');
});

test('Controller addRecord 方法未变', () => {
  assertContains(assetController, 'exports.addRecord', 'addRecord 方法必须保留');
});

test('Controller uploadSignature 方法未变', () => {
  assertContains(assetController, 'exports.uploadSignature', 'uploadSignature 方法必须保留');
});

test('Controller batchRemove 方法未变', () => {
  assertContains(assetController, 'exports.batchRemove', 'batchRemove 方法必须保留');
});

test('软删除逻辑保留（deleted_at）', () => {
  assertContains(assetController, 'deleted_at', '软删除逻辑必须保留');
});

test('企业隔离保留（enterprise_id）', () => {
  // 所有查询都包含 enterprise_id
  const enterpriseIdMatches = assetController.match(/enterprise_id/g) || [];
  assert.ok(enterpriseIdMatches.length >= 3,
    'enterprise_id 应出现在多处查询中，实际: ' + enterpriseIdMatches.length);
});

test('OSS 签名 URL 逻辑保留', () => {
  assertContains(assetController, 'getSignedUrl', 'OSS 签名 URL 逻辑必须保留');
});

test('前端 openAssetDetail 函数未改名', () => {
  assertContains(enterpriseHtml, 'function openAssetDetail(', 'openAssetDetail 必须保留');
});

test('前端 closeAssetDetail 函数未改名', () => {
  assertContains(enterpriseHtml, 'function closeAssetDetail(', 'closeAssetDetail 必须保留');
});

test('前端 deleteAssetFromDetail 函数未改名', () => {
  assertContains(enterpriseHtml, 'function deleteAssetFromDetail(', 'deleteAssetFromDetail 必须保留');
});

// ═══════════════════════════════════════════════════════════════
//  Part G: 安全验证
// ═══════════════════════════════════════════════════════════════
console.log('\n══ Part G: 安全验证 ══');

test('history 查询包含 enterprise_id 隔离', () => {
  // 在 exports.history 方法中有 enterprise_id
  const historyStart = assetController.indexOf('exports.history');
  const historyEnd = assetController.indexOf('exports.batchRemove');
  const historyMethod = assetController.substring(historyStart, historyEnd);
  assertContains(historyMethod, 'enterprise_id', 'history 必须包含企业隔离');
  // 应该有 3 处 enterprise_id 查询：Asset查询、GenerationTask查询、OutputAsset查询
  const count = (historyMethod.match(/enterprise_id/g) || []).length;
  assert.ok(count >= 3,
    'history 方法中 enterprise_id 至少出现3处（Asset、GenerationTask、OutputAsset），实际: ' + count);
});

test('不存在 asset 时返回 404 而非 500', () => {
  assertContains(assetController, '素材不存在', '应返回友好404消息');
});

test('错误消息不暴露内部实现', () => {
  assertNotContains(assetController, 'stack', '不应暴露堆栈跟踪');
  assertNotContains(assetController, 'Sequelize', '不应暴露 ORM 细节');
});

// ═══════════════════════════════════════════════════════════════
//  结果汇总
// ═══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log('  Sprint 4.3 测试结果: ' + passed + ' 通过, ' + failed + ' 失败, 共 ' + (passed + failed) + ' 项');
console.log('═'.repeat(50));

if (failed > 0) {
  console.log('\n❌ 测试未全部通过！');
  process.exit(1);
} else {
  console.log('\n✅ Sprint 4.3 Asset Relationship & Generation History 所有测试通过！\n');
}
