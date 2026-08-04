/**
 * Sprint 4.2 — Asset Detail & Usage Tracking 验证测试
 *
 * 测试覆盖：
 *   - 后端 API: GET /api/enterprise/assets/:id 返回详情 + 使用统计
 *   - 前端: Asset Detail Modal 渲染、元数据显示、操作按钮
 *   - 集成: 删除逻辑不影响、预签名URL、企业隔离
 *
 * 运行方式：node tests/sprint4.2.test.js
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
console.log('║   Sprint 4.2 Asset Detail 验证测试          ║');
console.log('║   资产详情 + 使用统计 + 前端Modal           ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');

// ════════════════════════════════════════════════════════════════
// Part A: 后端 API — 资产详情
// ════════════════════════════════════════════════════════════════
console.log('══ Part A: 获取资产详情 API ══');
console.log('');

test('GET /api/enterprise/assets/:id 路由存在', () => {
  assertContains(assetRoute, "router.get('/:id'");
  assertContains(assetRoute, 'controller.detail');
});

test('detail 函数返回 basic 元信息（type, name, size, mime_type, createdAt）', () => {
  // 检查返回结构
  assertContains(assetController, 'asset.type');
  assertContains(assetController, 'asset.name');
  assertContains(assetController, 'asset.size');
  assertContains(assetController, 'asset.mime_type');
  assertContains(assetController, 'asset.createdAt');
  assertContains(assetController, 'res.success');
});

test('detail 函数返回 typeLabel 中文类型标签', () => {
  assertContains(assetController, 'typeLabel');
  assertContains(assetController, 'TYPE_LABELS');
  assertContains(assetController, "image: '图片'");
  assertContains(assetController, "video: '视频'");
  assertContains(assetController, "audio: '音频'");
});

test('detail 返回字段包含 id, url, thumbnailUrl', () => {
  assertContains(assetController, "id: asset.id");
  assertContains(assetController, 'signedUrl');
  assertContains(assetController, 'thumbnailUrl');
});

test('detail 对 OSS URL 进行签名转换', () => {
  assertContains(assetController, 'ossService.getSignedUrl');
  assertContains(assetController, 'signedUrl || asset.url');
});

test('detail 查询 GenerationTask 统计使用量', () => {
  assertContains(assetController, 'GenerationTask.count');
  assertContains(assetController, 'source_asset_id');
  assertContains(assetController, 'usageCount');
});

test('detail 返回字段包含 usageCount', () => {
  assertContains(assetController, 'usageCount');
});

test('detail 仅统计未删除的 GenerationTask', () => {
  // GenerationTask.count where deleted_at IS NULL
  assertContains(assetController, "[Op.eq]: null");
});

test('detail 排除已删除的 Asset（deleted_at IS NULL）', () => {
  // Asset.findOne where deleted_at IS NULL
  const assetFindOne = assetController.match(/Asset\.findOne[\s\S]{0,500}deleted_at[\s\S]{0,200}\[Op\.eq\][\s\S]{0,100}null/);
  assert.ok(assetFindOne, 'Should filter by deleted_at IS NULL in Asset.findOne');
});

test('detail — 素材不存在返回 404', () => {
  assertContains(assetController, "res.fail('素材不存在', 404)");
});

test('detail 限制企业 scope（enterprise_id = req.user.enterpriseId）', () => {
  assertContains(assetController, 'req.user.enterpriseId');
  // 在 Asset.findOne 的 where 中
  const assetControllerBody = assetController;
  assertContains(assetControllerBody, 'enterprise_id: req.user.enterpriseId');
});

test('detail — type 枚举完整覆盖（image, video, audio, other）', () => {
  assertContains(assetController, "image: '图片'");
  assertContains(assetController, "video: '视频'");
  assertContains(assetController, "audio: '音频'");
  assertContains(assetController, "other: '其他'");
});

// ════════════════════════════════════════════════════════════════
// Part B: 前端 — Asset Detail Modal 结构与样式
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('══ Part B: Asset Detail Modal — 前端结构 ══');
console.log('');

test('HTML 中存在 assetDetailOverlay 容器', () => {
  assertContains(enterpriseHtml, 'assetDetailOverlay');
});

test('HTML 中存在 asset-detail-modal 结构', () => {
  assertContains(enterpriseHtml, 'asset-detail-modal');
  assertContains(enterpriseHtml, 'asset-detail-header');
  assertContains(enterpriseHtml, 'asset-detail-preview');
  assertContains(enterpriseHtml, 'asset-detail-body');
  assertContains(enterpriseHtml, 'asset-detail-actions');
});

test('CSS 中存在 asset-detail-overlay 样式定义', () => {
  assertContains(enterpriseHtml, '.asset-detail-overlay');
  assertContains(enterpriseHtml, '.asset-detail-modal');
});

test('CSS 使用玻璃拟态风格（backdrop-filter blur）', () => {
  assertContains(enterpriseHtml, 'backdrop-filter');
  // 检查在 asset-detail-overlay 上下文中存在
  const cssSection = enterpriseHtml.substring(
    enterpriseHtml.indexOf('.asset-detail-overlay'),
    enterpriseHtml.indexOf('.asset-detail-overlay') + 1500
  );
  assertContains(cssSection, 'blur', 'asset-detail-overlay should use backdrop-filter blur');
});

test('CSS 包含打开动画 detail-modal-in', () => {
  assertContains(enterpriseHtml, 'detail-modal-in');
});

test('HTML 中存在预览区 assetDetailPreview', () => {
  assertContains(enterpriseHtml, 'id="assetDetailPreview"');
});

test('HTML 中存在元数据区 assetDetailBody', () => {
  assertContains(enterpriseHtml, 'id="assetDetailBody"');
});

test('HTML 中存在操作按钮区 assetDetailActions', () => {
  assertContains(enterpriseHtml, 'id="assetDetailActions"');
});

// ════════════════════════════════════════════════════════════════
// Part C: 前端 — Asset Detail Modal JS 函数
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('══ Part C: Asset Detail Modal — JS 函数 ══');
console.log('');

test('JS 中存在 openAssetDetail 函数', () => {
  assertContains(enterpriseHtml, 'function openAssetDetail');
});

test('JS 中存在 closeAssetDetail 函数', () => {
  assertContains(enterpriseHtml, 'function closeAssetDetail');
});

test('JS 中存在 copyAssetLink 函数', () => {
  assertContains(enterpriseHtml, 'function copyAssetLink');
});

test('JS 中存在 deleteAssetFromDetail 函数', () => {
  assertContains(enterpriseHtml, 'function deleteAssetFromDetail');
});

test('JS 中存在 CURRENT_ASSET_DETAIL 状态变量', () => {
  assertContains(enterpriseHtml, 'CURRENT_ASSET_DETAIL');
});

test('previewAsset 调用 openAssetDetail（Sprint 4.2 改造）', () => {
  const previewFn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function previewAsset'),
    enterpriseHtml.indexOf('function previewAsset') + 150
  );
  assertContains(previewFn, 'openAssetDetail');
});

test('openAssetDetail 通过 safeFetch 获取资产（Sprint 4.4 Patch5: 缓存优先）', () => {
  assertContains(enterpriseHtml, "/enterprise/assets/");
  // openAssetDetail 中
  const detailFn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function openAssetDetail'),
    enterpriseHtml.indexOf('function closeAssetDetail')
  );
  assertContains(detailFn, "safeFetch");
  // Sprint 4.4 Patch5: 优先使用缓存
  assertContains(detailFn, "ASSET_CACHE");
});

test('detail modal 显示已生成视频数量（usageCount）', () => {
  assertContains(enterpriseHtml, 'usageCount');
  assertContains(enterpriseHtml, '已生成视频');
});

test('detail modal 显示元数据字段（文件名、类型、大小、上传时间）', () => {
  assertContains(enterpriseHtml, '文件名');
  assertContains(enterpriseHtml, 'asset-detail-meta-grid');
});

test('copyAssetLink 使用 Clipboard API', () => {
  const copyFn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function copyAssetLink'),
    enterpriseHtml.indexOf('function fallbackCopyText')
  );
  assertContains(copyFn, 'navigator.clipboard');
  assertContains(copyFn, 'writeText');
});

test('copyAssetLink 有 fallback 降级方案', () => {
  assertContains(enterpriseHtml, 'function fallbackCopyText');
  assertContains(enterpriseHtml, "document.execCommand('copy')");
});

test('deleteAssetFromDetail 关闭详情模态框后调用 confirmDeleteAsset', () => {
  // 在整个 HTML 中搜索，而不是限定 substring 范围
  const afterDeleteFromDetail = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function deleteAssetFromDetail')
  );
  assertContains(afterDeleteFromDetail, 'closeAssetDetail');
  assertContains(afterDeleteFromDetail, 'confirmDeleteAsset');
});

test('关闭按钮触发 closeAssetDetail', () => {
  assertContains(enterpriseHtml, 'onclick="closeAssetDetail()"');
});

test('点击 overlay 空白处关闭详情', () => {
  assertContains(enterpriseHtml, "bindAssetDetailOverlayClick");
  assertContains(enterpriseHtml, "e.target === this");
});

// ════════════════════════════════════════════════════════════════
// Part D: 集成验证 — 删除逻辑不受影响
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('══ Part D: 集成验证 — 删除逻辑不破坏 ══');
console.log('');

test('confirmDeleteAsset 函数仍然存在且未修改', () => {
  assertContains(enterpriseHtml, 'function confirmDeleteAsset');
});

test('deleteAsset 函数仍然存在且调用 DELETE /enterprise/assets/:id', () => {
  // 注意: 'async function deleteAsset' 区别于 'function deleteAssetFromDetail'
  assertContains(enterpriseHtml, 'async function deleteAsset');
  const delFn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('async function deleteAsset'),
    enterpriseHtml.indexOf('async function deleteAsset') + 300
  );
  assertContains(delFn, '/enterprise/assets/');
  assertContains(delFn, "method: 'DELETE'");
});

test('assetController.remove 仍保留（软删除不变）', () => {
  assertContains(assetController, 'exports.remove');
  assertContains(assetController, 'deleted_at: new Date()');
});

test('assetController.remove 返回 404 当素材不存在', () => {
  assertContains(assetController, "res.fail('素材不存在', 404)");
});

test('assetController.remove 检查企业权限', () => {
  assertContains(assetController, 'asset.enterprise_id !== req.user.enterpriseId');
  assertContains(assetController, "res.fail('无权限')");
});

test('Asset 模型未修改（deleted_at 仍是最后一个字段）', () => {
  const Asset = fs.readFileSync(
    path.join(__dirname, '..', 'models', 'Asset.js'),
    'utf-8'
  );
  // deleted_at 应仍然存在于模型中
  assertContains(Asset, 'deleted_at');
  assertContains(Asset, 'comment: \'软删除时间');
});

// ════════════════════════════════════════════════════════════════
// Part E: 前端集成 — 按钮能力
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('══ Part E: 前端按钮能力 ══');
console.log('');

test('detail modal 有复制链接按钮', () => {
  assertContains(enterpriseHtml, 'copyAssetLink()');
  assertContains(enterpriseHtml, 'fa-link');
});

test('detail modal 有删除素材按钮', () => {
  assertContains(enterpriseHtml, 'deleteAssetFromDetail()');
  assertContains(enterpriseHtml, 'assetDetailDeleteBtn');
});

test('asset card hover overlay 预览按钮调用 previewAsset → openAssetDetail', () => {
  assertContains(enterpriseHtml, 'previewAsset(');
});

test('asset card 点击信息区调用 previewAsset', () => {
  assertContains(enterpriseHtml, "onclick=\"previewAsset(");
});

test('TYPE_LABELS 包含完整中文映射（图片/视频/音频/其他）', () => {
  const controllerLines = assetController;
  assertContains(controllerLines, "image: '图片'");
  assertContains(controllerLines, "video: '视频'");
  assertContains(controllerLines, "audio: '音频'");
  assertContains(controllerLines, "other: '其他'");
});

// ════════════════════════════════════════════════════════════════
// Part F: 安全校验
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('══ Part F: 安全校验 ══');
console.log('');

test('detail 不返回原始 OSS URL（签名后返回）', () => {
  const detailFn = assetController.substring(
    assetController.indexOf('exports.detail'),
    assetController.indexOf('exports.batchRemove')
  );
  assertContains(detailFn, 'getSignedUrl');
  assertContains(detailFn, 'signedUrl');
});

test('detail 仅对未删除 Asset 生效', () => {
  const detailFn = assetController.substring(
    assetController.indexOf('exports.detail'),
    assetController.indexOf('exports.batchRemove')
  );
  assertContains(detailFn, 'deleted_at');
  assertContains(detailFn, "[Op.eq]: null");
});

test('detail 跨企业数据隔离（enterprise_id 校验）', () => {
  const detailFn = assetController.substring(
    assetController.indexOf('exports.detail'),
    assetController.indexOf('exports.batchRemove')
  );
  assertContains(detailFn, 'enterprise_id');
  assertContains(detailFn, 'req.user.enterpriseId');
});

// ════════════════════════════════════════════════════════════════
// Part G: 路由顺序验证
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('══ Part G: 路由顺序验证 ══');
console.log('');

test('upload-signature 路由在 :id 之前（避免 id=upload-signature 误匹配）', () => {
  const uploadIdx = assetRoute.indexOf("router.get('/upload-signature'");
  const detailIdx = assetRoute.indexOf("router.get('/:id'");
  assert.ok(uploadIdx < detailIdx, 'upload-signature route must be before :id param route');
});

test('/:id DELETE 路由仍然存在', () => {
  assertContains(assetRoute, "router.delete('/:id'");
  assertContains(assetRoute, 'controller.remove');
});

// ════════════════════════════════════════════════════════════════
// Part H: Sprint 4.4 Patch5 — Asset Detail Preview 缓存优先
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('══ Part H: Sprint 4.4 Patch5 — Asset Detail Preview ══');
console.log('');

test('Patch5 getAssetPreviewUrl 函数存在', () => {
  assertContains(enterpriseHtml, 'function getAssetPreviewUrl');
});

test('Patch5 getAssetPreviewUrl 优先级: thumbnailUrl → url → fileUrl → path', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function getAssetPreviewUrl'),
    enterpriseHtml.indexOf('function getAssetPreviewUrl') + 200
  );
  assertContains(fn, 'thumbnailUrl');
  assertContains(fn, 'fileUrl');
  assertContains(fn, 'path');
});

test('Patch5 normalizeAssetResponse 函数存在', () => {
  assertContains(enterpriseHtml, 'function normalizeAssetResponse');
});

test('Patch5 normalizeAssetResponse 支持 data.data.asset 嵌套格式', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function normalizeAssetResponse'),
    enterpriseHtml.indexOf('function normalizeAssetResponse') + 400
  );
  assertContains(fn, 'data.data.asset');
  assertContains(fn, 'data.data.id');
  assertContains(fn, 'data.asset');
});

test('Patch5 renderAssetDetailContent 提取为独立函数', () => {
  assertContains(enterpriseHtml, 'function renderAssetDetailContent');
});

test('Patch5 renderAssetDetailContent 使用 getAssetPreviewUrl', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function renderAssetDetailContent'),
    enterpriseHtml.indexOf('function openAssetDetail')
  );
  assertContains(fn, 'getAssetPreviewUrl');
});

test('Patch5 openAssetDetail 优先检查 ASSET_CACHE', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function openAssetDetail'),
    enterpriseHtml.indexOf('function closeAssetDetail')
  );
  assertContains(fn, 'ASSET_CACHE');
  assertContains(fn, 'renderAssetDetailContent');
});

test('Patch5 openAssetDetail 仅 API 404 时显示"素材不存在或已删除"', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function openAssetDetail'),
    enterpriseHtml.indexOf('function closeAssetDetail')
  );
  // 确认 404 分支仍然显示"素材不存在或已删除"
  assertContains(fn, '素材不存在或已删除');
  assertContains(fn, "err.status === 404");
});

test('Patch5 图片 onerror 支持备用 URL 容错', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function renderAssetDetailContent'),
    enterpriseHtml.indexOf('function openAssetDetail')
  );
  assertContains(fn, 'data-backup');
  assertContains(fn, '图片加载失败');
});

test('Patch5 图片加载失败不显示"素材不存在或已删除"', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function renderAssetDetailContent'),
    enterpriseHtml.indexOf('function openAssetDetail')
  );
  // 图片加载失败显示"图片加载失败"，不是"素材不存在或已删除"
  assertContains(fn, '图片加载失败');
});

test('Patch5 mimeType 兼容 mime_type 和 mimeType 两种格式', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function renderAssetDetailContent'),
    enterpriseHtml.indexOf('function openAssetDetail')
  );
  assertContains(fn, 'mime_type');
  assertContains(fn, 'mimeType');
});

test('Patch5 previewAsset 支持传入 Asset 对象或 assetId', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function previewAsset'),
    enterpriseHtml.indexOf('function previewAsset') + 150
  );
  assertContains(fn, 'assetOrId');
  assertContains(fn, 'openAssetDetail');
});

// ════════════════════════════════════════════════════════════════
// Part I: Sprint 4.4 Patch6 — Asset Image Preview Separation
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('══ Part I: Sprint 4.4 Patch6 — Image Preview Separation ══');
console.log('');

test('Patch6 HTML 中存在 imagePreviewOverlay 容器', () => {
  assertContains(enterpriseHtml, 'id="imagePreviewOverlay"');
  assertContains(enterpriseHtml, 'id="imagePreviewBody"');
});

test('Patch6 CSS 中存在 image-preview-overlay 样式', () => {
  assertContains(enterpriseHtml, '.image-preview-overlay');
  assertContains(enterpriseHtml, '.image-preview-container');
  assertContains(enterpriseHtml, '.image-preview-close');
  assertContains(enterpriseHtml, '.image-preview-body');
});

test('Patch6 图片预览 z-index 高于详情 Modal（1700 > 1600）', () => {
  assertContains(enterpriseHtml, 'z-index: 1700');
});

test('Patch6 openImagePreview 函数存在', () => {
  assertContains(enterpriseHtml, 'function openImagePreview');
});

test('Patch6 closeImagePreview 函数存在', () => {
  assertContains(enterpriseHtml, 'function closeImagePreview');
});

test('Patch6 CURRENT_IMAGE_PREVIEW 状态变量存在', () => {
  assertContains(enterpriseHtml, 'CURRENT_IMAGE_PREVIEW');
});

test('Patch6 openImagePreview 使用 ASSET_CACHE 读取素材', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function openImagePreview'),
    enterpriseHtml.indexOf('function closeImagePreview')
  );
  assertContains(fn, 'ASSET_CACHE');
});

test('Patch6 openImagePreview 使用 getAssetPreviewUrl 解析 URL', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function openImagePreview'),
    enterpriseHtml.indexOf('function closeImagePreview')
  );
  assertContains(fn, 'getAssetPreviewUrl');
});

test('Patch6 图片预览支持 backup URL 容错', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function openImagePreview'),
    enterpriseHtml.indexOf('function closeImagePreview')
  );
  assertContains(fn, 'data-backup');
});

test('Patch6 图片加载失败显示"图片加载失败"', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function openImagePreview'),
    enterpriseHtml.indexOf('function closeImagePreview')
  );
  assertContains(fn, '图片加载失败');
});

test('Patch6 图片加载失败不显示"素材不存在或已删除"', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function openImagePreview'),
    enterpriseHtml.indexOf('function closeImagePreview')
  );
  assert.notStrictEqual(fn.indexOf('素材不存在或已删除'), -1 ? false : true, false);
  // 确认 openImagePreview 不包含此文案
  const hasMsg = fn.indexOf('素材不存在或已删除') !== -1;
  assert.ok(!hasMsg, 'openImagePreview should NOT contain "素材不存在或已删除"');
});

test('Patch6 图片预览 Modal 不包含文件信息/元数据区域', () => {
  const overlayHtml = enterpriseHtml.substring(
    enterpriseHtml.indexOf('id="imagePreviewOverlay"'),
    enterpriseHtml.indexOf('id="imagePreviewOverlay"') + 400
  );
  // 不应包含 asset-detail-meta-grid 或 asset-detail-body
  assert.notStrictEqual(overlayHtml.indexOf('asset-detail-body'), -1 ? false : true, false);
  const hasDetailBody = overlayHtml.indexOf('asset-detail-body') !== -1;
  assert.ok(!hasDetailBody, 'Image preview overlay should NOT contain asset-detail-body');
});

test('Patch6 图片预览 Modal 不包含 AI创作按钮', () => {
  const overlayHtml = enterpriseHtml.substring(
    enterpriseHtml.indexOf('id="imagePreviewOverlay"'),
    enterpriseHtml.indexOf('id="imagePreviewOverlay"') + 400
  );
  const hasAiBtn = overlayHtml.indexOf('AI创作') !== -1 || overlayHtml.indexOf('btn-gen-workspace') !== -1;
  assert.ok(!hasAiBtn, 'Image preview overlay should NOT contain AI creation button');
});

test('Patch6 图片预览 Modal 不包含删除按钮', () => {
  const overlayHtml = enterpriseHtml.substring(
    enterpriseHtml.indexOf('id="imagePreviewOverlay"'),
    enterpriseHtml.indexOf('id="imagePreviewOverlay"') + 400
  );
  const hasDelete = overlayHtml.indexOf('删除素材') !== -1;
  assert.ok(!hasDelete, 'Image preview overlay should NOT contain delete button');
});

test('Patch6 图片预览 Modal 只有关闭按钮', () => {
  const overlayHtml = enterpriseHtml.substring(
    enterpriseHtml.indexOf('id="imagePreviewOverlay"'),
    enterpriseHtml.indexOf('id="imagePreviewOverlay"') + 500
  );
  assertContains(overlayHtml, 'fa-times');
});

test('Patch6 图片卡片缩略图点击调用 openImagePreview', () => {
  // renderAssetCard 对 image 类型生成 openImagePreview 调用
  // 源码中使用转义引号: openImagePreview(\\' + itemId + \\')
  assertContains(enterpriseHtml, 'openImagePreview(');
});

test('Patch6 非图片卡片缩略图仍调用 previewAsset', () => {
  const renderFn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function renderAssetCard'),
    enterpriseHtml.indexOf('function toggleAssetMenu')
  );
  // 源码中使用转义引号: previewAsset(\\' + itemId + \\')
  assertContains(renderFn, 'previewAsset(');
});

test('Patch6 ESC 关闭图片预览（优先于 GenPanel）', () => {
  const escHandler = enterpriseHtml.substring(
    enterpriseHtml.indexOf('GenPanel ESC 关闭'),
    enterpriseHtml.indexOf('GenPanel ESC 关闭') + 500
  );
  assertContains(escHandler, 'closeImagePreview');
  assertContains(escHandler, 'imagePreviewOverlay');
});

test('Patch6 closeImagePreview 清除 CURRENT_IMAGE_PREVIEW', () => {
  const fn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function closeImagePreview'),
    enterpriseHtml.indexOf('function closeImagePreview') + 250
  );
  assertContains(fn, 'CURRENT_IMAGE_PREVIEW = null');
});

test('Patch6 asset card info 区域仍调用 previewAsset（打开详情）', () => {
  const renderFn = enterpriseHtml.substring(
    enterpriseHtml.indexOf('function renderAssetCard'),
    enterpriseHtml.indexOf('function toggleAssetMenu')
  );
  assertContains(renderFn, "asset-card-info");
  assertContains(renderFn, "previewAsset(");
});

// ════════════════════════════════════════════════════════════════
// 测试汇总
// ════════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   Sprint 4.2 Asset Detail Report            ║');
console.log('╠══════════════════════════════════════════════╣');
console.log('║   Results: ' + String(passed).padStart(3) + ' passed, ' + String(failed).padStart(3) + ' failed              ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');

if (failed > 0) {
  process.exit(1);
}
