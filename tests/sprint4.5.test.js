/**
 * Sprint 4.5 Frontend Component Isolation Refactor 测试
 *
 * 运行方式：node tests/sprint4.5.test.js
 *
 * 测试范围：
 *   - 模块文件存在性
 *   - 模块结构完整性（IIFE、全局导出）
 *   - 统一状态管理（YJ.state）
 *   - API 层封装完整性
 *   - Asset 模块功能覆盖
 *   - Preview 模块功能覆盖
 *   - Generation 模块功能覆盖
 *   - History 模块功能覆盖
 *   - Workspace 模块功能覆盖
 *   - 无全局变量污染（验证 YJ 命名空间）
 *   - enterprise.html 正确加载模块
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ─── 测试计数器 ────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    results.push({ name, status: 'FAIL', error: e.message });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

// ─── 加载文件 ──────────────────────────────────────────────────
const BASE = path.join(__dirname, '..', 'public', 'js', 'enterprise');
const htmlPath = path.join(__dirname, '..', 'public', 'enterprise.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const moduleFiles = [
  'state.js',
  'utils.js',
  'api.js',
  'asset-list.js',
  'asset-detail.js',
  'asset-preview.js',
  'asset-actions.js',
  'asset-history.js',
  'workspace.js',
  'generation-panel.js',
  'app.js'
];

const modules = {};
moduleFiles.forEach(f => {
  const fp = path.join(BASE, f);
  if (fs.existsSync(fp)) {
    modules[f] = fs.readFileSync(fp, 'utf8');
  }
});

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   Sprint 4.5 前端组件隔离重构测试            ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════
//  Part A: 模块文件存在性
// ═══════════════════════════════════════════════════════════════

console.log('══ Part A: 模块文件存在性 ══\n');

moduleFiles.forEach(f => {
  test(`模块文件存在 — ${f}`, () => {
    assert.ok(fs.existsSync(path.join(BASE, f)),
      `${f} must exist in public/js/enterprise/`);
    assert.ok(modules[f] && modules[f].length > 100,
      `${f} must contain meaningful content`);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Part B: 模块结构完整性
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part B: 模块结构完整性 ══\n');

test('所有模块使用 IIFE 模式', () => {
  moduleFiles.forEach(f => {
    const content = modules[f];
    assert.ok(content.includes('(function'),
      `${f} must use IIFE pattern`);
    assert.ok(content.includes('})();') || content.includes('}());'),
      `${f} must close IIFE properly`);
    assert.ok(content.includes("'use strict'") || content.includes('"use strict"'),
      `${f} must use strict mode`);
  });
});

test('state.js — 统一状态管理结构', () => {
  const c = modules['state.js'];
  assert.ok(c.includes('APP_STATE'), 'must define APP_STATE');
  assert.ok(c.includes('YJ.state'), 'must expose YJ.state');
  assert.ok(c.includes('setCurrentAsset'), 'must have setCurrentAsset');
  assert.ok(c.includes('getCurrentAsset'), 'must have getCurrentAsset');
  assert.ok(c.includes('setCurrentPreviewAsset'), 'must have setCurrentPreviewAsset');
  assert.ok(c.includes('setCurrentGenerationAsset'), 'must have setCurrentGenerationAsset');
  assert.ok(c.includes('cacheAsset'), 'must have cacheAsset');
  assert.ok(c.includes('getCachedAsset'), 'must have getCachedAsset');
  assert.ok(c.includes('resetGenerationState'), 'must have resetGenerationState');
  assert.ok(c.includes('PAGE_STATE'), 'must define PAGE_STATE constants');
  assert.ok(c.includes('TYPE_MAP'), 'must define TYPE_MAP');
  assert.ok(c.includes('ICONS'), 'must define ICONS');
});

test('utils.js — 共享工具函数完整性', () => {
  const c = modules['utils.js'];
  assert.ok(c.includes('function showToast'), 'must have showToast');
  assert.ok(c.includes('function escapeHtml'), 'must have escapeHtml');
  assert.ok(c.includes('function formatWorkDate'), 'must have formatWorkDate');
  assert.ok(c.includes('function formatAssetSize'), 'must have formatAssetSize');
  assert.ok(c.includes('function formatTaskType'), 'must have formatTaskType');
  assert.ok(c.includes('function safeFetch'), 'must have safeFetch');
  assert.ok(c.includes('function normalizeAssetResponse'), 'must have normalizeAssetResponse');
  assert.ok(c.includes('function getAssetPreviewUrl'), 'must have getAssetPreviewUrl');
  assert.ok(c.includes('function fallbackCopyText'), 'must have fallbackCopyText');
  assert.ok(c.includes('YJ.utils'), 'must expose YJ.utils');
});

test('api.js — API 层完整性', () => {
  const c = modules['api.js'];
  assert.ok(c.includes('AssetAPI'), 'must define AssetAPI');
  assert.ok(c.includes('GenerationAPI'), 'must define GenerationAPI');
  assert.ok(c.includes('WorkspaceAPI'), 'must define WorkspaceAPI');
  assert.ok(c.includes('getAssets'), 'must have Asset.getAssets');
  assert.ok(c.includes('getAssetDetail'), 'must have Asset.getAssetDetail');
  assert.ok(c.includes('deleteAsset'), 'must have Asset.deleteAsset');
  assert.ok(c.includes('getAssetHistory'), 'must have Asset.getAssetHistory');
  assert.ok(c.includes('createTask'), 'must have Generation.createTask');
  assert.ok(c.includes('getStats'), 'must have Workspace.getStats');
  assert.ok(c.includes('EnterpriseAPI'), 'must expose EnterpriseAPI');
  assert.ok(c.includes('YJ.api'), 'must expose YJ.api');
});

test('asset-list.js — 资产列表模块完整性', () => {
  const c = modules['asset-list.js'];
  assert.ok(c.includes('function loadAssets'), 'must have loadAssets');
  assert.ok(c.includes('function renderAssetCard'), 'must have renderAssetCard');
  assert.ok(c.includes('function renderAssetPagination'), 'must have renderAssetPagination');
  assert.ok(c.includes('function assetSearch'), 'must have assetSearch');
  assert.ok(c.includes('function assetFilterChange'), 'must have assetFilterChange');
  assert.ok(c.includes('function assetSortChange'), 'must have assetSortChange');
  assert.ok(c.includes('function clearAssetFilters'), 'must have clearAssetFilters');
  assert.ok(c.includes('function toggleAssetMenu'), 'must have toggleAssetMenu');
  assert.ok(c.includes('function closeAssetMenu'), 'must have closeAssetMenu');
  // Global exports
  assert.ok(c.includes('window.loadAssets'), 'must export loadAssets globally');
  assert.ok(c.includes('window.renderAssetCard'), 'must export renderAssetCard globally');
  assert.ok(c.includes('window.assetSearch'), 'must export assetSearch globally');
});

test('asset-detail.js — 资产详情模块完整性', () => {
  const c = modules['asset-detail.js'];
  assert.ok(c.includes('function openAssetDetail'), 'must have openAssetDetail');
  assert.ok(c.includes('function renderAssetDetailContent'), 'must have renderAssetDetailContent');
  assert.ok(c.includes('function closeAssetDetail'), 'must have closeAssetDetail');
  assert.ok(c.includes('function previewAsset'), 'must have previewAsset');
  assert.ok(c.includes('window.openAssetDetail'), 'must export openAssetDetail globally');
  assert.ok(c.includes('window.closeAssetDetail'), 'must export closeAssetDetail globally');
});

test('asset-preview.js — 图片预览模块完整性', () => {
  const c = modules['asset-preview.js'];
  assert.ok(c.includes('function openImagePreview'), 'must have openImagePreview');
  assert.ok(c.includes('function closeImagePreview'), 'must have closeImagePreview');
  assert.ok(c.includes('window.openImagePreview'), 'must export openImagePreview globally');
  assert.ok(c.includes('window.closeImagePreview'), 'must export closeImagePreview globally');
});

test('asset-actions.js — 资产操作模块完整性', () => {
  const c = modules['asset-actions.js'];
  assert.ok(c.includes('function copyAssetLink'), 'must have copyAssetLink');
  assert.ok(c.includes('function deleteAsset'), 'must have deleteAsset');
  assert.ok(c.includes('function confirmDeleteAsset'), 'must have confirmDeleteAsset');
  assert.ok(c.includes('function triggerAssetUpload'), 'must have triggerAssetUpload');
  assert.ok(c.includes('function handleAssetFileSelect'), 'must have handleAssetFileSelect');
  assert.ok(c.includes('function uploadAssetFile'), 'must have uploadAssetFile');
  assert.ok(c.includes('function uploadToOssGeneric'), 'must have uploadToOssGeneric');
  assert.ok(c.includes('window.deleteAsset'), 'must export deleteAsset globally');
  assert.ok(c.includes('window.copyAssetLink'), 'must export copyAssetLink globally');
  assert.ok(c.includes('window.triggerAssetUpload'), 'must export triggerAssetUpload globally');
});

test('asset-history.js — 创作历史模块完整性', () => {
  const c = modules['asset-history.js'];
  assert.ok(c.includes('function loadAssetHistory'), 'must have loadAssetHistory');
  assert.ok(c.includes('function viewHistoryOutput'), 'must have viewHistoryOutput');
  assert.ok(c.includes('window.loadAssetHistory'), 'must export loadAssetHistory globally');
});

test('workspace.js — Workspace 模块完整性', () => {
  const c = modules['workspace.js'];
  assert.ok(c.includes('function loadWorkspaceStatsAsync'), 'must have loadWorkspaceStatsAsync');
  assert.ok(c.includes('window.loadWorkspaceStatsAsync'), 'must export loadWorkspaceStatsAsync globally');
});

test('generation-panel.js — AI创作面板模块完整性', () => {
  const c = modules['generation-panel.js'];
  assert.ok(c.includes('function openGenPanel'), 'must have openGenPanel');
  assert.ok(c.includes('function closeGenPanel'), 'must have closeGenPanel');
  assert.ok(c.includes('function resetGenPanel'), 'must have resetGenPanel');
  assert.ok(c.includes('function handleGenPanelSubmit'), 'must have handleGenPanelSubmit');
  assert.ok(c.includes('function selectCreativeTemplate'), 'must have selectCreativeTemplate');
  assert.ok(c.includes('function selectGenOutput'), 'must have selectGenOutput');
  assert.ok(c.includes('function updateGenTimeline'), 'must have updateGenTimeline');
  assert.ok(c.includes('function showGenResult'), 'must have showGenResult');
  assert.ok(!c.includes('TEMPLATE_MAP'), 'Sprint 4.7: TEMPLATE_MAP removed from frontend — backend handles model resolution');
  assert.ok(c.includes('templateId'), 'must use templateId for backend model resolution');
  assert.ok(c.includes('window.openGenPanel'), 'must export openGenPanel globally');
  assert.ok(c.includes('window.closeGenPanel'), 'must export closeGenPanel globally');
  assert.ok(c.includes('window.handleGenPanelSubmit'), 'must export handleGenPanelSubmit globally');
});

test('app.js — 应用入口模块完整性', () => {
  const c = modules['app.js'];
  assert.ok(c.includes('APP'), 'must define APP config');
  assert.ok(c.includes('function render'), 'must have render function');
  assert.ok(c.includes('function navigateTo'), 'must have navigateTo');
  assert.ok(c.includes('window.APP'), 'must export APP globally');
  assert.ok(c.includes('window.render'), 'must export render globally');
  assert.ok(c.includes('window.navigateTo'), 'must export navigateTo globally');
});

// ═══════════════════════════════════════════════════════════════
//  Part C: 全局命名空间
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part C: 全局命名空间与无污染 ══\n');

test('YJ 命名空间统一管理', () => {
  moduleFiles.forEach(f => {
    const c = modules[f];
    assert.ok(c.includes('window.YJ = YJ') || c.includes('YJ.state') || c.includes('YJ.utils') || c.includes('YJ.api') || c.includes('YJ.modules') || c.includes('YJ.app'),
      `${f} must use YJ namespace`);
  });
});

test('模块通过 YJ.modules 注册', () => {
  const moduleNames = ['assetList', 'assetDetail', 'assetPreview', 'assetActions', 'assetHistory', 'workspace', 'generationPanel'];
  let registeredCount = 0;
  moduleNames.forEach(name => {
    moduleFiles.forEach(f => {
      if (modules[f].includes("YJ.modules." + name)) {
        registeredCount++;
      }
    });
  });
  assert.ok(registeredCount >= moduleNames.length,
    `At least ${moduleNames.length} modules must register in YJ.modules (found ${registeredCount})`);
});

test('禁止业务模块直接 fetch — API 层封装检查', () => {
  // Asset modules should use EnterpriseAPI or safeFetch, not raw fetch()
  const assetModules = ['asset-list.js', 'asset-detail.js', 'asset-actions.js', 'asset-history.js', 'generation-panel.js'];
  let cleanCount = 0;
  assetModules.forEach(f => {
    const c = modules[f];
    // They may reference YuJianAPI as fallback but should primarily use EnterpriseAPI/safeFetch
    const usesApiLayer = c.includes('EnterpriseAPI') || c.includes('safeFetch') || c.includes('YJ.api');
    if (usesApiLayer) cleanCount++;
  });
  assert.ok(cleanCount >= assetModules.length,
    `All asset modules must use API layer (${cleanCount}/${assetModules.length} passed)`);
});

// ═══════════════════════════════════════════════════════════════
//  Part D: enterprise.html 集成
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part D: enterprise.html 集成 ══\n');

test('enterprise.html 加载所有 Enterprise 模块', () => {
  moduleFiles.forEach(f => {
    const scriptTag = `js/enterprise/${f}`;
    assert.ok(html.includes(scriptTag),
      `enterprise.html must load ${scriptTag}`);
  });
});

test('enterprise.html 模块加载顺序正确', () => {
  const stateIdx = html.indexOf('js/enterprise/state.js');
  const utilsIdx = html.indexOf('js/enterprise/utils.js');
  const apiIdx = html.indexOf('js/enterprise/api.js');
  const appIdx = html.indexOf('js/enterprise/app.js');

  assert.ok(stateIdx < utilsIdx, 'state.js must load before utils.js');
  assert.ok(utilsIdx < apiIdx, 'utils.js must load before api.js');
  assert.ok(apiIdx < appIdx, 'api.js must load before app.js');
});

test('enterprise.html 保留原有 JS 依赖', () => {
  assert.ok(html.includes('js/api.js'), 'must keep original api.js');
  assert.ok(html.includes('js/auth.js'), 'must keep original auth.js');
  assert.ok(html.includes('js/upload.js'), 'must keep original upload.js');
  assert.ok(html.includes('js/video-task.js'), 'must keep original video-task.js');
  assert.ok(html.includes('js/prompt-templates.js'), 'must keep original prompt-templates.js');
});

test('enterprise.html 保留核心 HTML 结构', () => {
  assert.ok(html.includes('assetDetailOverlay'), 'must keep asset detail modal HTML');
  assert.ok(html.includes('imagePreviewOverlay'), 'must keep image preview modal HTML');
  assert.ok(html.includes('genPanelOverlay'), 'must keep generation panel HTML');
  assert.ok(html.includes('assetPickerOverlay'), 'must keep asset picker HTML');
  assert.ok(html.includes('loginOverlay'), 'must keep login overlay HTML');
});

test('enterprise.html 内联脚本函数仍存在（迁移未完成部分）', () => {
  // These functions haven't been fully migrated yet (future sprints)
  assert.ok(html.includes('function renderMyWorks()'), 'renderMyWorks still in inline script');
  assert.ok(html.includes('function loadMyWorks'), 'loadMyWorks still in inline script');
  assert.ok(html.includes('function showLogin()'), 'showLogin still in inline script');
  assert.ok(html.includes('function handleLogin()'), 'handleLogin still in inline script');
});

// ═══════════════════════════════════════════════════════════════
//  Part E: 功能回归检查
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part E: 功能回归检查 ══\n');

test('PASS: 资产列表加载 — loadAssets 全局可用', () => {
  const foundInModules = modules['asset-list.js'].includes('window.loadAssets = loadAssets');
  const foundInHtml = html.includes('function loadAssets(page)');
  assert.ok(foundInModules || foundInHtml, 'loadAssets must be globally available');
});

test('PASS: 搜索功能 — assetSearch 全局可用', () => {
  const foundInModules = modules['asset-list.js'].includes('window.assetSearch = assetSearch');
  assert.ok(foundInModules, 'assetSearch must be globally exported from asset-list.js');
});

test('PASS: 筛选功能 — assetFilterChange 全局可用', () => {
  const foundInModules = modules['asset-list.js'].includes('window.assetFilterChange = assetFilterChange');
  assert.ok(foundInModules, 'assetFilterChange must be globally exported');
});

test('PASS: 排序功能 — assetSortChange 全局可用', () => {
  const foundInModules = modules['asset-list.js'].includes('window.assetSortChange = assetSortChange');
  assert.ok(foundInModules, 'assetSortChange must be globally exported');
});

test('PASS: 详情Modal — openAssetDetail 全局可用', () => {
  const foundInModules = modules['asset-detail.js'].includes('window.openAssetDetail = openAssetDetail');
  assert.ok(foundInModules, 'openAssetDetail must be globally exported');
});

test('PASS: 图片预览 — openImagePreview 全局可用', () => {
  const foundInModules = modules['asset-preview.js'].includes('window.openImagePreview = openImagePreview');
  assert.ok(foundInModules, 'openImagePreview must be globally exported');
});

test('PASS: 删除功能 — deleteAsset 全局可用', () => {
  const foundInModules = modules['asset-actions.js'].includes('window.deleteAsset = deleteAsset');
  assert.ok(foundInModules, 'deleteAsset must be globally exported');
});

test('PASS: 复制链接 — copyAssetLink 全局可用', () => {
  const foundInModules = modules['asset-actions.js'].includes('window.copyAssetLink = copyAssetLink');
  assert.ok(foundInModules, 'copyAssetLink must be globally exported');
});

test('PASS: AI创作 — openGenPanel 全局可用', () => {
  const foundInModules = modules['generation-panel.js'].includes('window.openGenPanel = openGenPanel');
  assert.ok(foundInModules, 'openGenPanel must be globally exported');
});

test('PASS: 创作历史 — loadAssetHistory 全局可用', () => {
  const foundInModules = modules['asset-history.js'].includes('window.loadAssetHistory = loadAssetHistory');
  assert.ok(foundInModules, 'loadAssetHistory must be globally exported');
});

test('PASS: Workspace统计 — loadWorkspaceStatsAsync 全局可用', () => {
  const foundInModules = modules['workspace.js'].includes('window.loadWorkspaceStatsAsync = loadWorkspaceStatsAsync');
  assert.ok(foundInModules, 'loadWorkspaceStatsAsync must be globally exported');
});

// ═══════════════════════════════════════════════════════════════
//  Part F: Creative Template System 保持不变
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part F: Creative Template System ══\n');

test('模板映射保持完整', () => {
  const c = modules['generation-panel.js'];
  assert.ok(c.includes('image_to_video'), 'must keep image_to_video template reference');
  // Sprint 4.7: 前端不再硬编码所有模板ID，模板由后端 creativeTemplates.js 统一管理
  assert.ok(!c.includes("provider: 'aliyun'"), 'Sprint 4.7: provider config moved to backend GenerationService');
});

test('阿里云 provider 配置 — 后端统一管理', () => {
  // Sprint 4.7: 模型映射不再写死在前端 TEMPLATE_MAP 中
  // 而是由后端 GenerationService → Provider Router → Aliyun Config 统一解析
  const c = modules['generation-panel.js'];
  assert.ok(!c.includes("'happyhorse-i2v'"), 'Sprint 4.7: model mapping moved from frontend to backend config');
  assert.ok(!c.includes("'happyhorse-t2v'"), 'Sprint 4.7: model mapping moved from frontend to backend config');
  assert.ok(!c.includes("'qwen-image-3.0-pro'"), 'Sprint 4.7: model mapping moved from frontend to backend config');
  assert.ok(!c.includes("'qwen-image-edit'"), 'Sprint 4.7: model mapping moved from frontend to backend config');
});

// ─── 测试结果汇总 ──────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   测试结果汇总                               ║');
console.log('╚══════════════════════════════════════════════╝\n');

console.log(`  Total:  ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failed > 0) {
  console.log('\n  失败列表:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`    ✗ ${r.name}`);
    console.log(`      ${r.error}`);
  });
}

console.log('\n');

// 退出码
process.exit(failed > 0 ? 1 : 0);
