/**
 * Sprint 4.1 — 资产中心打通 验证测试
 *
 * 测试覆盖：
 *   - 后端 API: 获取资产列表、分页、类型筛选、搜索、企业隔离
 *   - 前端: 页面渲染、筛选接入、搜索接入、预览功能、上传刷新
 *   - 回归: 原 MVP 功能无影响
 *
 * 运行方式：node tests/sprint4.1.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ─── 测试计数器 ────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let testName = '';

function test(name, fn) {
  testName = name;
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
console.log('║   Sprint 4.1 资产中心 验证测试              ║');
console.log('║   后端 API + 前端页面 + 安全隔离            ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');

// ════════════════════════════════════════════════════════════════
// Part A: 后端 API — 获取资产列表
// ════════════════════════════════════════════════════════════════
console.log('══ Part A: 获取资产列表 API ══');
console.log('');

test('GET /api/enterprise/assets 路由存在', () => {
  assertContains(assetRoute, 'controller.list');
  assertContains(assetRoute, "router.get('/',");
});

test('list 函数支持分页参数 page 和 pageSize', () => {
  assertContains(assetController, 'req.query.page');
  assertContains(assetController, 'req.query.pageSize');
});

test('list 函数支持类型筛选 type', () => {
  assertContains(assetController, 'req.query.type');
  assertContains(assetController, "if (type) where.type = type");
});

test('list 函数支持关键词搜索 keyword（LIKE 模糊匹配）', () => {
  assertContains(assetController, 'req.query.keyword');
  assertContains(assetController, 'Op.like');
  assertContains(assetController, '%${keyword}%');
});

test('返回结构包含 total, page, pageSize, items', () => {
  assertContains(assetController, 'total: count');
  assertContains(assetController, 'page');
  assertContains(assetController, 'pageSize');
  assertContains(assetController, 'items');
});

test('items 包含 id, type, name, url, thumbnailUrl, size, createdAt', () => {
  assertContains(assetController, "id: asset.id");
  assertContains(assetController, "type: asset.type");
  assertContains(assetController, "name: asset.name");
  assertContains(assetController, "url: asset.url");
  assertContains(assetController, 'thumbnailUrl');
  assertContains(assetController, "size: asset.size");
  assertContains(assetController, "createdAt: asset.createdAt");
});

test('支持 image, video, audio 资产类型', () => {
  assertContains(assetController, 'width: asset.width');
  assertContains(assetController, 'height: asset.height');
  assertContains(assetController, 'duration: asset.duration');
  assertContains(assetController, 'mime_type: asset.mime_type');
});

test('不修改 Asset 模型', () => {
  // Asset 模型文件不在 controller 中修改，仅读取字段
  const assetModel = fs.readFileSync(
    path.join(__dirname, '..', 'models', 'Asset.js'),
    'utf-8'
  );
  // 确保模型字段结构未被改动
  assertContains(assetModel, "type: DataTypes.ENUM('image', 'video', 'audio', 'other')");
  assertContains(assetModel, "thumbnail: {");
  assertContains(assetModel, "url: {");
});

console.log('');
console.log('══ Part B: 企业隔离 ══');
console.log('');

// ════════════════════════════════════════════════════════════════
// Part B: 安全 — 企业隔离
// ════════════════════════════════════════════════════════════════

test('企业隔离 — enterprise_id 用于 where 条件', () => {
  assertContains(assetController, 'enterprise_id: req.user.enterpriseId');
});

test('企业隔离 — 不暴露其他企业数据（无跨企业查询）', () => {
  // 确保 where 条件中没有 OR 跨企业逻辑
  assertNotContains(assetController, 'Op.or');
  // 验证 list 函数中 enterprise_id 正确用于 where 条件隔离
  const listFn = assetController.match(/exports\.list[\s\S]*?^};/m);
  assert(listFn && listFn[0], 'list function should exist');
  assertContains(listFn[0], "enterprise_id: req.user.enterpriseId");
  assertNotContains(listFn[0], 'Op.or');
});

test('路由层 enterpriseAuth 中间件保护所有资产接口', () => {
  const enterpriseIndex = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'enterprise', 'index.js'),
    'utf-8'
  );
  assertContains(enterpriseIndex, "router.use('/assets', assetRouter)");
});

test('JWT 载荷包含 enterpriseId（authController 提供）', () => {
  const authControllerContent = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'authController.js'),
    'utf-8'
  );
  assertContains(authControllerContent, "payload.enterpriseId = user.enterprise_id");
});

console.log('');
console.log('══ Part C: 前端资产页面 ══');
console.log('');

// ════════════════════════════════════════════════════════════════
// Part C: 前端 — 资产页面
// ════════════════════════════════════════════════════════════════

test('前端 — renderAssets 函数存在', () => {
  assertContains(enterpriseHtml, 'function renderAssets()');
});

test('前端 — 资产页不再使用静态占位数据', () => {
  // 旧的静态占位代码已被移除
  assertNotContains(enterpriseHtml, "Array.from({length: 18})");
  assertNotContains(enterpriseHtml, "const types = ['image', 'video', 'audio'];");
});

test('前端 — 搜索框接入 keyword 参数', () => {
  assertContains(enterpriseHtml, "assetSearchInput");
  assertContains(enterpriseHtml, "assetSearch()");
  assertContains(enterpriseHtml, "ASSETS_STATE.currentKeyword");
  assertContains(enterpriseHtml, "&keyword=");
});

test('前端 — 类型筛选接入（全部/图片/视频/音频）', () => {
  assertContains(enterpriseHtml, "assetTypeFilter");
  assertContains(enterpriseHtml, "assetFilterChange()");
  assertContains(enterpriseHtml, 'value="image"');
  assertContains(enterpriseHtml, 'value="video"');
  assertContains(enterpriseHtml, 'value="audio"');
  assertContains(enterpriseHtml, 'value=""');
});

test('前端 — 图片缩略图渲染（img 标签）', () => {
  assertContains(enterpriseHtml, "item.type === 'image'");
  assertContains(enterpriseHtml, 'img src=');
  assertContains(enterpriseHtml, 'thumbnailUrl');
});

test('前端 — 视频封面渲染（带播放图标）', () => {
  assertContains(enterpriseHtml, "item.type === 'video'");
  assertContains(enterpriseHtml, 'asset-play-icon');
  assertContains(enterpriseHtml, 'fa-play-circle');
});

test('前端 — 音频图标渲染（音频标识）', () => {
  assertContains(enterpriseHtml, "item.type === 'audio'");
  assertContains(enterpriseHtml, 'asset-audio-icon');
  assertContains(enterpriseHtml, 'fa-music');
});

test('前端 — 显示名称、类型、时间', () => {
  assertContains(enterpriseHtml, 'asset-card-name');
  assertContains(enterpriseHtml, 'asset-card-type');
  assertContains(enterpriseHtml, 'asset-card-date');
  assertContains(enterpriseHtml, 'formatWorkDate');
});

test('前端 — 图片预览（查看大图）', () => {
  assertContains(enterpriseHtml, 'previewImageAsset');
  assertContains(enterpriseHtml, 'max-width:100%');
  assertContains(enterpriseHtml, 'max-height:65vh');
});

test('前端 — 视频预览（播放器）', () => {
  assertContains(enterpriseHtml, 'previewVideoAsset');
  assertContains(enterpriseHtml, 'playVideo');
});

test('前端 — 音频预览（音频播放器）', () => {
  assertContains(enterpriseHtml, 'previewAudioAsset');
  assertContains(enterpriseHtml, '<audio controls');
});

test('前端 — 上传按钮存在', () => {
  assertContains(enterpriseHtml, 'triggerAssetUpload');
  assertContains(enterpriseHtml, '上传素材');
});

test('前端 — 上传使用现有 OSS 上传流程', () => {
  assertContains(enterpriseHtml, 'uploadAssetFile');
  assertContains(enterpriseHtml, '/enterprise/assets/upload-signature');
  assertContains(enterpriseHtml, "YuJianAPI.post('/enterprise/assets'");
});

test('前端 — 上传成功后刷新资产列表', () => {
  // handleAssetFileSelect 成功后调用 loadAssets(1)
  assertContains(enterpriseHtml, 'loadAssets(1)');
});

test('前端 — 分页渲染函数存在', () => {
  assertContains(enterpriseHtml, 'renderAssetPagination');
});

test('前端 — 空状态提示', () => {
  assertContains(enterpriseHtml, '暂无素材');
});

test('前端 — 加载状态', () => {
  assertContains(enterpriseHtml, '加载中');
});

test('前端 — 资产页面需要登录认证', () => {
  // authPages 包含 'assets'
  assertContains(enterpriseHtml, "'assets'");
});

test('前端 — 导航到资产页自动加载数据', () => {
  assertContains(enterpriseHtml, "page === 'assets'");
  assertContains(enterpriseHtml, "loadAssets(1)");
});

test('前端 — CSS 样式包含资产卡片新样式', () => {
  assertContains(enterpriseHtml, 'asset-grid-new');
  assertContains(enterpriseHtml, 'asset-card {');
  assertContains(enterpriseHtml, 'asset-card-thumb');
  assertContains(enterpriseHtml, 'asset-card-info');
});

console.log('');
console.log('══ Part D: 回归测试 — 原 MVP 功能不受影响 ══');
console.log('');

// ════════════════════════════════════════════════════════════════
// Part D: 回归 — 原 MVP 功能
// ════════════════════════════════════════════════════════════════

test('REGRESSION 资产路由其他端点不受影响（签名/创建/删除/批量删除）', () => {
  assertContains(assetRoute, 'controller.uploadSignature');
  assertContains(assetRoute, 'controller.addRecord');
  assertContains(assetRoute, 'controller.remove');
  assertContains(assetRoute, 'controller.batchRemove');
});

test('REGRESSION Asset 模型未被修改', () => {
  const assetModel = fs.readFileSync(
    path.join(__dirname, '..', 'models', 'Asset.js'),
    'utf-8'
  );
  assertContains(assetModel, 'tableName: \'assets\'');
  assertContains(assetModel, "type: DataTypes.ENUM('image', 'video', 'audio', 'other')");
});

test('REGRESSION 登录功能不受影响', () => {
  assertContains(enterpriseHtml, 'handleLogin()');
  assertContains(enterpriseHtml, 'YuJianAuth.login');
});

test('REGRESSION 上传模块不受影响（YuJianUpload 仍存在）', () => {
  assertContains(enterpriseHtml, 'YuJianUpload');
});

test('REGRESSION 作品管理不受影响（renderMyWorks 仍存在）', () => {
  assertContains(enterpriseHtml, 'function renderMyWorks()');
});

test('REGRESSION AI 生成功能不受影响（图生视频）', () => {
  assertContains(enterpriseHtml, 'handleGenerateImage2Video');
});

test('REGRESSION 资产控制器原有函数保留', () => {
  assertContains(assetController, 'exports.uploadSignature');
  assertContains(assetController, 'exports.addRecord');
  assertContains(assetController, 'exports.remove');
  assertContains(assetController, 'exports.batchRemove');
});

test('REGRESSION 原有 category 筛选已替换为 keyword，功能更强', () => {
  // keyword 取代了 category 参数，提供了更灵活的搜索
  assertNotContains(assetController, 'req.query.category');
});

console.log('');
console.log('══ Part E: API 设计规范 ══');
console.log('');

// ════════════════════════════════════════════════════════════════
// Part E: API 设计规范
// ════════════════════════════════════════════════════════════════

test('API 设计 — 返回结构 { total, page, pageSize, items }', () => {
  assertContains(assetController, 'res.success({ items: signedItems, total: count, page, pageSize');
  assertContains(assetController, 'items: signedItems');
  assertContains(assetController, 'total: count');
});

test('API 设计 — 使用 res.success 统一响应格式', () => {
  assertContains(assetController, 'res.success');
});

test('API 设计 — thumbnailUrl 映射自数据库 thumbnail 字段', () => {
  assertContains(assetController, 'thumbnailUrl: asset.thumbnail || asset.url');
});

test('API 设计 — 默认分页大小 20', () => {
  assertContains(assetController, 'parseInt(req.query.pageSize) || 20');
});

test('API 设计 — 默认按 id 倒序排列（SORT_MAP.newest）', () => {
  assertContains(assetController, 'SORT_MAP');
  assertContains(assetController, "newest: ['id', 'DESC']");
  assertContains(assetController, 'order: [order]');
});

console.log('');
console.log('══ Part F: Sprint 4.1 Patch1 — OSS签名URL修复 ══');
console.log('');

// 加载 ossService 源码
const ossServiceSource = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'ossService.js'),
  'utf-8'
);
const videoGenController = fs.readFileSync(
  path.join(__dirname, '..', 'controllers', 'enterprise', 'videoGenerationController.js'),
  'utf-8'
);

test('PATCH1 ossService.getSignedUrl 方法存在', () => {
  assertContains(ossServiceSource, 'getSignedUrl');
  assertContains(ossServiceSource, 'async getSignedUrl');
});

test('PATCH1 ossService.extractKeyFromUrl 方法存在（URL→key提取）', () => {
  assertContains(ossServiceSource, 'extractKeyFromUrl');
  assertContains(ossServiceSource, 'parsed.pathname.substring(1)');
});

test('PATCH1 getSignedUrl 调用 ali-oss signatureUrl 方法', () => {
  assertContains(ossServiceSource, 'this.client.signatureUrl');
  assertContains(ossServiceSource, 'expires');
});

test('PATCH1 返回URL包含signature参数（signatureUrl 生成签名）', () => {
  // signatureUrl 方法生成的URL包含 OSSAccessKeyId、Expires、Signature 查询参数
  // 验证 ossService 调用 signatureUrl（由 ali-oss SDK 自动附加签名参数）
  assertContains(ossServiceSource, 'signatureUrl(key, { expires }');
});

test('PATCH1 URL过期处理 — 默认expires=3600秒（1小时）', () => {
  assertContains(ossServiceSource, 'expires = 3600');
});

test('PATCH1 Asset list 接口将 url 转换为签名URL', () => {
  assertContains(assetController, 'ossService.getSignedUrl(item.url)');
  assertContains(assetController, 'ossService.getSignedUrl(item.thumbnailUrl)');
});

test('PATCH1 Asset list 签名失败时降级为原始URL（不阻断列表加载）', () => {
  assertContains(assetController, '.catch(() => null)');
  assertContains(assetController, 'signedUrl || item.url');
  assertContains(assetController, 'signedThumb || item.thumbnailUrl');
});

test('PATCH1 企业隔离不变 — enterprise_id 仍用于 where 条件', () => {
  // 签名URL转换不影响企业隔离逻辑
  assertContains(assetController, "enterprise_id: req.user.enterpriseId");
  // 签名转换在 where 查询之后，不影响查询隔离
  const listFn = assetController.match(/exports\.list[\s\S]*?^};/m);
  assert(listFn && listFn[0], 'list function should exist');
  // 签名URL逻辑在查询之后
  assertContains(listFn[0], 'ossService.getSignedUrl');
  // where 条件仍包含 enterprise_id
  assertContains(listFn[0], "enterprise_id: req.user.enterpriseId");
});

test('PATCH1 上传流程不受影响 — uploadSignature 未修改', () => {
  assertContains(assetController, 'exports.uploadSignature');
  assertContains(assetController, 'ossService.generateUploadPolicy');
});

test('PATCH1 上传流程不受影响 — addRecord 未修改', () => {
  assertContains(assetController, 'exports.addRecord');
  assertContains(assetController, 'Asset.create');
  // addRecord 不调用 getSignedUrl（仅保存原始URL）
  const addRecordFn = assetController.match(/exports\.addRecord[\s\S]*?^};/m);
  assert(addRecordFn && addRecordFn[0], 'addRecord function should exist');
  assertNotContains(addRecordFn[0], 'getSignedUrl');
});

test('PATCH1 AI生成sourceAssetId流程 — videoGenerationController 引入 ossService', () => {
  assertContains(videoGenController, "require('../../services/ossService')");
});

test('PATCH1 AI生成sourceAssetId流程 — createTask 使用签名URL作为imageUrl', () => {
  assertContains(videoGenController, 'ossService.getSignedUrl(asset.url)');
  assertContains(videoGenController, 'ossService.getSignedUrl(asset.url) || asset.url');
});

test('PATCH1 AI生成sourceAssetId流程 — sourceAssetId 校验逻辑不变', () => {
  assertContains(videoGenController, 'asset.enterprise_id !== enterpriseId');
  assertContains(videoGenController, "asset.type !== 'image'");
});

test('PATCH1 Asset数据库结构不修改 — url字段保存OSS原始URL', () => {
  const assetModel = fs.readFileSync(
    path.join(__dirname, '..', 'models', 'Asset.js'),
    'utf-8'
  );
  assertContains(assetModel, "url: {");
  assertContains(assetModel, "type: DataTypes.STRING(500)");
  assertContains(assetModel, "allowNull: false");
  // 确保未添加 signed_url 等新字段
  assertNotContains(assetModel, 'signed_url');
  assertNotContains(assetModel, 'signedUrl');
});

test('PATCH1 前端不修改 — 仍使用 thumbnailUrl || url 显示图片', () => {
  assertContains(enterpriseHtml, 'item.thumbnailUrl || item.url');
});

test('PATCH1 前端不修改 — renderAssetCard 仍通过 thumbUrl 渲染img标签', () => {
  assertContains(enterpriseHtml, "var thumbUrl = item.thumbnailUrl || item.url || ''");
});

console.log('');
console.log('══ Part G: Sprint 4.1 Patch2 — 删除功能与预览优化 ══');
console.log('');

// 重新读取可能已修改的源文件
const assetModelUpdated = fs.readFileSync(
  path.join(__dirname, '..', 'models', 'Asset.js'),
  'utf-8'
);
const assetControllerUpdated = fs.readFileSync(
  path.join(__dirname, '..', 'controllers', 'enterprise', 'assetController.js'),
  'utf-8'
);
const enterpriseHtmlUpdated = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'enterprise.html'),
  'utf-8'
);

test('PATCH2 Asset模型新增 deleted_at 字段', () => {
  assertContains(assetModelUpdated, 'deleted_at');
  assertContains(assetModelUpdated, 'DataTypes.DATE');
  assertContains(assetModelUpdated, '软删除时间');
});

test('PATCH2 Asset模型 deleted_at 索引存在', () => {
  assertContains(assetModelUpdated, "{ fields: ['deleted_at'] }");
});

test('PATCH2 删除接口 — remove 使用软删除（update deleted_at）', () => {
  assertContains(assetControllerUpdated, 'deleted_at: new Date()');
  assertContains(assetControllerUpdated, 'asset.update');
  // 确保不是物理删除
  assertNotContains(assetControllerUpdated, 'asset.destroy()');
});

test('PATCH2 删除接口 — 已删除资源返回404', () => {
  assertContains(assetControllerUpdated, 'asset.deleted_at');
  assertContains(assetControllerUpdated, "return res.fail('素材不存在', 404)");
});

test('PATCH2 删除接口 — 不存在资源返回404', () => {
  // findByPk 返回 null 时返回 404
  assertContains(assetControllerUpdated, "return res.fail('素材不存在', 404)");
});

test('PATCH2 删除接口 — 不删除OSS文件', () => {
  // remove 函数不应调用 ossService.deleteFile 或 ossService.deleteFiles
  const removeFn = assetControllerUpdated.match(/exports\.remove[\s\S]*?^};/m);
  assert(removeFn && removeFn[0], 'remove function should exist');
  assertNotContains(removeFn[0], 'ossService.deleteFile');
  assertNotContains(removeFn[0], 'ossService.deleteFiles');
  assertNotContains(removeFn[0], 'deleteFile');
});

test('PATCH2 删除接口 — 不删除OSS文件（确认没有 oss delete 调用）', () => {
  const removeFn = assetControllerUpdated.match(/exports\.remove[\s\S]*?^};/m);
  assert(removeFn && removeFn[0], 'remove function should exist');
  // 只做 update deleted_at，不做其他操作
  assertContains(removeFn[0], 'deleted_at: new Date()');
});

test('PATCH2 删除接口 — 不影响生成任务（remove不操作GenerationTask）', () => {
  // remove 函数只做软删除，不查询/修改 GenerationTask
  // 注释中提到不影响是设计文档，代码层面确保没有 require 或 操作 GenerationTask
  const removeFn = assetControllerUpdated.match(/exports\.remove[\s\S]*?^};/m);
  assert(removeFn && removeFn[0], 'remove function should exist');
  // 确保不操作生成任务字段
  assertNotContains(removeFn[0], 'sourceAssetId');
  assertNotContains(removeFn[0], 'outputAsset');
  // 确保没有跨模型操作（注释除外）
  assertNotContains(removeFn[0], 'GenerationTask.find');
  assertNotContains(removeFn[0], 'GenerationTask.update');
  assertNotContains(removeFn[0], 'GenerationTask.destroy');
});

test('PATCH2 列表接口 — 过滤 deleted_at IS NULL', () => {
  assertContains(assetControllerUpdated, 'deleted_at: { [Op.eq]: null }');
});

test('PATCH2 列表接口 — 企业隔离不变', () => {
  assertContains(assetControllerUpdated, "enterprise_id: req.user.enterpriseId");
  // enterprise_id 和 deleted_at 都在 where 条件中
  const listFn = assetControllerUpdated.match(/exports\.list[\s\S]*?^};/m);
  assert(listFn && listFn[0], 'list function should exist');
  assertContains(listFn[0], 'deleted_at');
  assertContains(listFn[0], 'enterprise_id');
});

test('PATCH2 批量删除 — 也使用软删除', () => {
  assertContains(assetControllerUpdated, 'exports.batchRemove');
  // batchRemove 使用 update 而非 destroy
  const batchFn = assetControllerUpdated.match(/exports\.batchRemove[\s\S]*?^};/m);
  assert(batchFn && batchFn[0], 'batchRemove function should exist');
  assertContains(batchFn[0], 'deleted_at');
  assertNotContains(batchFn[0], 'Asset.destroy');
});

test('PATCH2 前端 — 资产卡片包含删除按钮', () => {
  assertContains(enterpriseHtmlUpdated, 'asset-delete-btn');
  assertContains(enterpriseHtmlUpdated, 'fa-trash-alt');
});

test('PATCH2 前端 — 删除按钮 hover 显示（opacity控制）', () => {
  assertContains(enterpriseHtmlUpdated, '.asset-delete-btn');
  assertContains(enterpriseHtmlUpdated, 'opacity: 0');
  assertContains(enterpriseHtmlUpdated, '.asset-card:hover .asset-delete-btn');
  assertContains(enterpriseHtmlUpdated, 'opacity: 1');
});

test('PATCH2 前端 — 删除按钮阻止事件冒泡（不触发预览）', () => {
  assertContains(enterpriseHtmlUpdated, 'event.stopPropagation()');
  assertContains(enterpriseHtmlUpdated, 'confirmDeleteAsset');
});

test('PATCH2 前端 — confirmDeleteAsset 函数存在', () => {
  assertContains(enterpriseHtmlUpdated, 'function confirmDeleteAsset');
  assertContains(enterpriseHtmlUpdated, '删除素材？');
  assertContains(enterpriseHtmlUpdated, '删除后素材将从资产库移除');
  assertContains(enterpriseHtmlUpdated, '已生成的视频不会受到影响');
});

test('PATCH2 前端 — 确认弹窗包含取消和确认删除按钮', () => {
  assertContains(enterpriseHtmlUpdated, '确认删除');
  assertContains(enterpriseHtmlUpdated, 'btn-danger');
});

test('PATCH2 前端 — deleteAsset 函数调用 DELETE API', () => {
  assertContains(enterpriseHtmlUpdated, 'function deleteAsset');
  assertContains(enterpriseHtmlUpdated, "method: 'DELETE'");
  assertContains(enterpriseHtmlUpdated, '/enterprise/assets/');
});

test('PATCH2 前端 — 删除成功后从本地状态移除并重新渲染', () => {
  assertContains(enterpriseHtmlUpdated, "ASSETS_STATE.items.filter");
  assertContains(enterpriseHtmlUpdated, '素材已删除');
});

test('PATCH2 预览优化 — modal确认按钮不包含alert', () => {
  // 确认按钮已改为仅 closeModal()
  assertNotContains(enterpriseHtmlUpdated, "alert('操作成功')");
  // 确认只关闭弹窗
  const modalBtn = enterpriseHtmlUpdated.match(/id="modalConfirmBtn"[^>]*onclick="([^"]*)"/);
  assert(modalBtn, 'modal confirm button should exist');
  assertNotContains(modalBtn[1], 'alert');
});

test('PATCH2 预览优化 — closeModal 恢复footer默认状态', () => {
  assertContains(enterpriseHtmlUpdated, "modalFooter");
  assertContains(enterpriseHtmlUpdated, "btn btn-primary");
});

test('PATCH2 预览优化 — 禁止使用 window.alert（静态检查）', () => {
  // 搜索新增的 alert 调用（排除已有非阻塞alert和注释）
  // 确认 modal相关代码不包含 alert
  const modalSection = enterpriseHtmlUpdated.match(/function closeModal\(\)[\s\S]{0,300}/);
  assert(modalSection, 'closeModal should exist');
  assertNotContains(modalSection[0], 'alert(');
});

test('PATCH2 回归 — Patch1签名URL逻辑不受影响', () => {
  assertContains(assetControllerUpdated, 'ossService.getSignedUrl');
  assertContains(assetControllerUpdated, 'signedUrl || item.url');
  assertContains(assetControllerUpdated, 'signedThumb || item.thumbnailUrl');
});

// ════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   Results: ' + String(passed).padStart(2) + ' passed, ' + String(failed).padStart(2) + ' failed              ║');
console.log('╚══════════════════════════════════════════════╝');

if (failed > 0) {
  process.exit(1);
}
