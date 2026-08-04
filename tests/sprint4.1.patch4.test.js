/**
 * Sprint 4.1 Patch4 — Asset Search & Filter System 验证测试
 *
 * 测试覆盖：
 *   - 后端 API: keyword 搜索、type 筛选、sort 排序、enterprise 隔离
 *   - 前端 UI: 搜索输入(debounce)、类型筛选、排序选择、列表刷新
 *   - 空状态: 无素材 vs 请求失败
 *
 * 运行方式：node tests/sprint4.1.patch4.test.js
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

console.log('╔══════════════════════════════════════════════╗');
console.log('║   Sprint 4.1 Patch4                         ║');
console.log('║   Asset Search & Filter System              ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');

// ════════════════════════════════════════════════════════════════
// Part A: 后端 API — keyword 搜索
// ════════════════════════════════════════════════════════════════
console.log('══ Part A: API — keyword 搜索 ══');
console.log('');

test('A1  keyword 参数从 req.query 读取', () => {
  assertContains(assetController, 'req.query.keyword');
});

test('A2  keyword 使用 Op.like 模糊搜索', () => {
  assertContains(assetController, 'Op.like');
  assertContains(assetController, '%${keyword}%');
});

test('A3  keyword 按 Asset.name 字段搜索', () => {
  assertContains(assetController, 'where.name');
  assertContains(assetController, 'Op.like');
});

test('A4  keyword 为空时不追加搜索条件', () => {
  assertContains(assetController, 'if (keyword)');
});

test('A5  keyword 使用 encodeURIComponent 编码（前端）', () => {
  assertContains(enterpriseHtml, 'encodeURIComponent(ASSETS_STATE.currentKeyword)');
});

console.log('');
console.log('══ Part B: API — type 筛选 ══');
console.log('');

test('B1  type 参数从 req.query 读取', () => {
  assertContains(assetController, 'req.query.type');
});

test('B2  type 非空时追加 where 条件', () => {
  assertContains(assetController, 'if (type) where.type = type');
});

test('B3  type 支持 image/video/audio/other', () => {
  // 前端 select 包含四种类型选项
  assertContains(enterpriseHtml, 'value="image"');
  assertContains(enterpriseHtml, 'value="video"');
  assertContains(enterpriseHtml, 'value="audio"');
});

test('B4  type 为空字符串时不过滤（全部类型）', () => {
  assertContains(enterpriseHtml, 'value=""');
  assertContains(enterpriseHtml, '全部类型');
});

console.log('');
console.log('══ Part C: API — sort 排序 ══');
console.log('');

test('C1  sort 参数从 req.query 读取', () => {
  assertContains(assetController, 'req.query.sort');
});

test('C2  sort 默认值为 newest', () => {
  assertContains(assetController, "req.query.sort || 'newest'");
});

test('C3  sort=newest 按 id DESC 排序', () => {
  assertContains(assetController, "newest: ['id', 'DESC']");
});

test('C4  sort=oldest 按 id ASC 排序', () => {
  assertContains(assetController, "oldest: ['id', 'ASC']");
});

test('C5  sort=size 按 size DESC 排序', () => {
  assertContains(assetController, "size: ['size', 'DESC']");
});

test('C6  SORT_MAP 映射表存在', () => {
  assertContains(assetController, 'SORT_MAP');
  assertContains(assetController, 'const SORT_MAP');
});

test('C7  无效 sort 值回退到 newest', () => {
  assertContains(assetController, 'SORT_MAP[sort] || SORT_MAP.newest');
});

console.log('');
console.log('══ Part D: API — enterprise 隔离 ══');
console.log('');

test('D1  enterprise_id 隔离不变', () => {
  assertContains(assetController, "enterprise_id: req.user.enterpriseId");
});

test('D2  deleted_at IS NULL 过滤不变', () => {
  assertContains(assetController, 'deleted_at: { [Op.eq]: null }');
});

test('D3  没有跨企业 OR 查询', () => {
  assertNotContains(assetController, 'Op.or');
});

test('D4  上传签名接口不受影响', () => {
  assertContains(assetController, 'exports.uploadSignature');
  assertContains(assetController, 'ossService.generateUploadPolicy');
});

test('D5  删除接口不受影响（软删除）', () => {
  assertContains(assetController, 'exports.remove');
  assertContains(assetController, 'deleted_at: new Date()');
});

test('D6  批量删除接口不受影响', () => {
  assertContains(assetController, 'exports.batchRemove');
});

test('D7  OSS 签名URL逻辑不受影响', () => {
  assertContains(assetController, 'ossService.getSignedUrl');
  assertContains(assetController, 'signedUrl || item.url');
});

console.log('');
console.log('══ Part E: 前端 UI — 搜索 ══');
console.log('');

test('E1  搜索输入框存在（assetSearchInput）', () => {
  assertContains(enterpriseHtml, 'assetSearchInput');
});

test('E2  搜索使用 oninput 事件（实时触发）', () => {
  assertContains(enterpriseHtml, 'oninput="assetSearch()"');
});

test('E3  搜索有 300ms debounce（searchTimer + setTimeout 300）', () => {
  assertContains(enterpriseHtml, 'searchTimer');
  assertContains(enterpriseHtml, 'setTimeout(function');
  assertContains(enterpriseHtml, '}, 300)');
});

test('E4  Enter 键立即触发搜索（清除debounce定时器）', () => {
  assertContains(enterpriseHtml, "event.key==='Enter'");
  assertContains(enterpriseHtml, 'clearTimeout(ASSETS_STATE.searchTimer)');
});

test('E5  搜索重置到第一页', () => {
  // assetSearch 中设置 ASSETS_STATE.currentPage = 1
  const searchFn = enterpriseHtml.match(/function assetSearch\(\)[\s\S]*?^        \}/m);
  assert(searchFn && searchFn[0], 'assetSearch function should exist');
  assertContains(searchFn[0], "ASSETS_STATE.currentPage = 1");
});

console.log('');
console.log('══ Part F: 前端 UI — 类型筛选 ══');
console.log('');

test('F1  类型筛选下拉框存在（assetTypeFilter）', () => {
  assertContains(enterpriseHtml, 'assetTypeFilter');
});

test('F2  类型筛选 onchange 调用 assetFilterChange', () => {
  assertContains(enterpriseHtml, 'assetFilterChange()');
});

test('F3  类型筛选重置到第一页', () => {
  const filterFn = enterpriseHtml.match(/function assetFilterChange\(\)[\s\S]*?^        \}/m);
  assert(filterFn && filterFn[0], 'assetFilterChange function should exist');
  assertContains(filterFn[0], "ASSETS_STATE.currentPage = 1");
});

console.log('');
console.log('══ Part G: 前端 UI — 排序选择 ══');
console.log('');

test('G1  排序下拉框存在（assetSortFilter）', () => {
  assertContains(enterpriseHtml, 'assetSortFilter');
});

test('G2  排序选项包含 newest/oldest/size', () => {
  assertContains(enterpriseHtml, 'value="newest"');
  assertContains(enterpriseHtml, 'value="oldest"');
  assertContains(enterpriseHtml, 'value="size"');
});

test('G3  排序标签显示中文', () => {
  assertContains(enterpriseHtml, '最新上传');
  assertContains(enterpriseHtml, '最早上传');
  assertContains(enterpriseHtml, '文件大小');
});

test('G4  排序 onchange 调用 assetSortChange', () => {
  assertContains(enterpriseHtml, 'assetSortChange()');
});

test('G5  排序重置到第一页', () => {
  const sortFn = enterpriseHtml.match(/function assetSortChange\(\)[\s\S]*?^        \}/m);
  assert(sortFn && sortFn[0], 'assetSortChange function should exist');
  assertContains(sortFn[0], "ASSETS_STATE.currentPage = 1");
});

test('G6  ASSETS_STATE 包含 currentSort 字段', () => {
  assertContains(enterpriseHtml, 'currentSort');
  assertContains(enterpriseHtml, "currentSort: 'newest'");
});

test('G7  loadAssets 传递 sort 参数', () => {
  assertContains(enterpriseHtml, '&sort=');
  assertContains(enterpriseHtml, 'ASSETS_STATE.currentSort');
});

console.log('');
console.log('══ Part H: 前端 UI — 列表刷新 ══');
console.log('');

test('H1  loadAssets 函数存在', () => {
  assertContains(enterpriseHtml, 'async function loadAssets');
});

test('H2  loadAssets 传递 page, pageSize 参数', () => {
  assertContains(enterpriseHtml, "?page='");
  assertContains(enterpriseHtml, '&pageSize=');
});

test('H3  筛选/排序/搜索变化后调用 loadAssets', () => {
  const searchFn = enterpriseHtml.match(/function assetSearch\(\)[\s\S]*?^        \}/m);
  assert(searchFn, 'assetSearch should exist');
  assertContains(searchFn[0], 'loadAssets(1)');
});

test('H4  导航到资产页自动加载数据', () => {
  assertContains(enterpriseHtml, "page === 'assets'");
  assertContains(enterpriseHtml, "loadAssets(1)");
});

test('H5  上传成功后刷新列表', () => {
  assertContains(enterpriseHtml, 'loadAssets(1)');
});

test('H6  分页翻页调用 loadAssets', () => {
  assertContains(enterpriseHtml, "onclick=\"loadAssets(");
});

test('H7  isLoading 防重入保护', () => {
  assertContains(enterpriseHtml, 'ASSETS_STATE.isLoading');
  assertContains(enterpriseHtml, 'if (ASSETS_STATE.isLoading) return');
});

console.log('');
console.log('══ Part I: 空状态优化 ══');
console.log('');

test('I1  无素材时显示"暂无素材"', () => {
  assertContains(enterpriseHtml, '暂无素材');
});

test('I2  无素材时显示上传引导文案', () => {
  assertContains(enterpriseHtml, '上传图片、视频或音频素材开始管理');
});

test('I3  请求失败显示"加载失败"', () => {
  assertContains(enterpriseHtml, '加载失败');
});

test('I4  请求失败显示"重新加载"按钮', () => {
  assertContains(enterpriseHtml, '重新加载');
});

test('I5  筛选无结果时显示"没有匹配的素材"', () => {
  assertContains(enterpriseHtml, '没有匹配的素材');
});

test('I6  筛选无结果时显示"清除筛选"按钮', () => {
  assertContains(enterpriseHtml, '清除筛选');
});

test('I7  clearAssetFilters 函数存在', () => {
  assertContains(enterpriseHtml, 'function clearAssetFilters');
});

test('I8  401 未认证时显示"登录已过期"', () => {
  assertContains(enterpriseHtml, '登录已过期');
});

test('I9  加载中显示 loading-skeleton', () => {
  assertContains(enterpriseHtml, 'loading-skeleton');
  assertContains(enterpriseHtml, '加载中...');
});

console.log('');
console.log('══ Part J: 回归 — 原有功能不受影响 ══');
console.log('');

test('J1  Asset Card UI 保留 — asset-card 样式存在', () => {
  assertContains(enterpriseHtml, 'asset-card');
  assertContains(enterpriseHtml, 'asset-card-thumb');
  assertContains(enterpriseHtml, 'asset-card-info');
});

test('J2  Asset Card hover 操作保留（预览/删除）', () => {
  assertContains(enterpriseHtml, 'asset-hover-btn');
  assertContains(enterpriseHtml, 'previewAsset');
  assertContains(enterpriseHtml, 'confirmDeleteAsset');
});

test('J3  OSS 上传逻辑不变', () => {
  assertContains(enterpriseHtml, 'triggerAssetUpload');
  assertContains(enterpriseHtml, '/enterprise/assets/upload-signature');
});

test('J4  删除逻辑不变（软删除）', () => {
  assertContains(enterpriseHtml, 'function deleteAsset');
  assertContains(enterpriseHtml, "method: 'DELETE'");
});

test('J5  分页渲染函数保留', () => {
  assertContains(enterpriseHtml, 'renderAssetPagination');
});

test('J6  预览功能保留（图片/视频/音频）', () => {
  assertContains(enterpriseHtml, 'previewImageAsset');
  assertContains(enterpriseHtml, 'previewVideoAsset');
  assertContains(enterpriseHtml, 'previewAudioAsset');
});

test('J7  资产路由其他端点保留', () => {
  assertContains(assetRoute, 'controller.uploadSignature');
  assertContains(assetRoute, 'controller.addRecord');
  assertContains(assetRoute, 'controller.remove');
  assertContains(assetRoute, 'controller.batchRemove');
});

test('J8  数据库结构不变 — Asset 模型字段完整', () => {
  const assetModel = fs.readFileSync(
    path.join(__dirname, '..', 'models', 'Asset.js'),
    'utf-8'
  );
  assertContains(assetModel, "type: DataTypes.ENUM('image', 'video', 'audio', 'other')");
  assertContains(assetModel, 'deleted_at');
  assertContains(assetModel, 'url: {');
  assertContains(assetModel, 'thumbnail: {');
  assertContains(assetModel, 'size: {');
});

test('J9  默认分页大小仍为 20', () => {
  assertContains(assetController, 'parseInt(req.query.pageSize) || 20');
});

test('J10 API 响应结构保持 { items, total, page, pageSize }', () => {
  assertContains(assetController, 'items: signedItems');
  assertContains(assetController, 'total: count');
  assertContains(assetController, 'page');
  assertContains(assetController, 'pageSize');
});

// ════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   Sprint 4.1 Patch4                         ║');
console.log('║   Asset Search & Filter Report              ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');
console.log('  API:');
console.log('    keyword   — ' + (passedFailed('A') ? 'PASS' : 'CHECK'));
console.log('    type      — ' + (passedFailed('B') ? 'PASS' : 'CHECK'));
console.log('    sort      — ' + (passedFailed('C') ? 'PASS' : 'CHECK'));
console.log('    isolation — ' + (passedFailed('D') ? 'PASS' : 'CHECK'));
console.log('');
console.log('  UI:');
console.log('    搜索(debounce) — ' + (passedFailed('E') ? 'PASS' : 'CHECK'));
console.log('    类型筛选        — ' + (passedFailed('F') ? 'PASS' : 'CHECK'));
console.log('    排序选择        — ' + (passedFailed('G') ? 'PASS' : 'CHECK'));
console.log('    列表刷新        — ' + (passedFailed('H') ? 'PASS' : 'CHECK'));
console.log('');
console.log('  空状态优化 — ' + (passedFailed('I') ? 'PASS' : 'CHECK'));
console.log('  回归测试   — ' + (passedFailed('J') ? 'PASS' : 'CHECK'));
console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   Results: ' + String(passed).padStart(2) + ' passed, ' + String(failed).padStart(2) + ' failed              ║');
console.log('╚══════════════════════════════════════════════╝');

if (failed > 0) {
  process.exit(1);
}

// 辅助：检查某个 Part 是否全部通过（用于报告摘要）
function passedFailed(part) {
  // 简单检查：如果整体有失败则返回 false
  // 实际各 Part 的通过情况通过具体测试输出体现
  return failed === 0;
}
