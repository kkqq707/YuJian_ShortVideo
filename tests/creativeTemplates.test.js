/**
 * Creative Templates 单元测试
 * Sprint 4.4 Patch3: AI Creative Template System
 *
 * 运行方式：node tests/creativeTemplates.test.js
 *
 * 测试策略：
 *   - 测试模板配置完整性
 *   - 测试模板查找函数
 *   - 测试 provider 统一为 aliyun
 *   - 测试不包含第三方模型
 *   - 测试模板分类
 */

const assert = require('assert');
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  CREATIVE_TEMPLATES,
  getTemplateById,
  getTemplateByCapability,
  getTemplatesByCategory,
  getTemplatesByOutput,
  isAliyunProvider,
  getAllCapabilities
} = require('../config/creativeTemplates');

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

// ═══════════════════════════════════════════════════════════════
//  测试套件
// ═══════════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   Creative Templates Unit Tests              ║');
console.log('║   Sprint 4.4 Patch3                          ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ─── 1. 模板配置完整性 ─────────────────────────────────────────
console.log('── 模板配置完整性 ──');

test('CREATIVE_TEMPLATES 为非空数组', () => {
  assert.ok(Array.isArray(CREATIVE_TEMPLATES), 'CREATIVE_TEMPLATES should be an array');
  assert.ok(CREATIVE_TEMPLATES.length > 0, 'CREATIVE_TEMPLATES should not be empty');
});

test('所有模板都有必填字段', () => {
  const requiredFields = ['id', 'name', 'description', 'capability', 'provider', 'model', 'category', 'icon'];
  for (const template of CREATIVE_TEMPLATES) {
    for (const field of requiredFields) {
      assert.ok(template[field] !== undefined && template[field] !== null,
        `Template ${template.id} missing field: ${field}`);
    }
  }
});

test('所有模板的 provider 都是 aliyun', () => {
  for (const template of CREATIVE_TEMPLATES) {
    assert.strictEqual(template.provider, 'aliyun',
      `Template ${template.id}: provider should be aliyun, got ${template.provider}`);
  }
});

test('所有模板的 id 唯一', () => {
  const ids = CREATIVE_TEMPLATES.map(t => t.id);
  const uniqueIds = new Set(ids);
  assert.strictEqual(uniqueIds.size, ids.length, 'All template IDs should be unique');
});

test('所有模板的 capability 唯一', () => {
  const capabilities = CREATIVE_TEMPLATES.map(t => t.capability);
  const uniqueCap = new Set(capabilities);
  assert.strictEqual(uniqueCap.size, capabilities.length, 'All template capabilities should be unique');
});

// ─── 2. 不包含第三方模型 ───────────────────────────────────────
console.log('\n── 第三方模型检查 ──');

test('不包含即梦 (jimeng) 模型', () => {
  const models = CREATIVE_TEMPLATES.map(t => t.model).join(' ').toLowerCase();
  assert.ok(!models.includes('jimeng'), 'Should not contain jimeng');
});

test('不包含可灵 (kling) 模型', () => {
  const models = CREATIVE_TEMPLATES.map(t => t.model).join(' ').toLowerCase();
  assert.ok(!models.includes('kling'), 'Should not contain kling');
});

test('不包含 Runway 模型', () => {
  const models = CREATIVE_TEMPLATES.map(t => t.model).join(' ').toLowerCase();
  assert.ok(!models.includes('runway'), 'Should not contain runway');
});

test('不包含 Pika 模型', () => {
  const models = CREATIVE_TEMPLATES.map(t => t.model).join(' ').toLowerCase();
  assert.ok(!models.includes('pika'), 'Should not contain pika');
});

test('不包含 wanx 旧模型', () => {
  const models = CREATIVE_TEMPLATES.map(t => t.model).join(' ').toLowerCase();
  assert.ok(!models.includes('wanx'), 'Should not contain wanx');
});

test('provider 不包含第三方', () => {
  const providers = CREATIVE_TEMPLATES.map(t => t.provider);
  const thirdParty = providers.filter(p => p !== 'aliyun');
  assert.strictEqual(thirdParty.length, 0,
    `Should not have third-party providers: ${thirdParty.join(', ')}`);
});

// ─── 3. 模板查找函数 ──────────────────────────────────────────
console.log('\n── 模板查找函数 ──');

test('getTemplateById 正确查找 image_to_video', () => {
  const template = getTemplateById('image_to_video');
  assert.ok(template, 'Should find image_to_video template');
  assert.strictEqual(template.provider, 'aliyun');
  assert.strictEqual(template.model, 'happyhorse-i2v');
  assert.strictEqual(template.category, 'video');
});

test('getTemplateById 正确查找 image_generation', () => {
  const template = getTemplateById('image_generation');
  assert.ok(template, 'Should find image_generation template');
  assert.strictEqual(template.provider, 'aliyun');
  assert.strictEqual(template.model, 'qwen-image-3.0-pro');
  assert.strictEqual(template.category, 'image');
});

test('getTemplateById 正确查找 text_to_video', () => {
  const template = getTemplateById('text_to_video');
  assert.ok(template, 'Should find text_to_video template');
  assert.strictEqual(template.model, 'happyhorse-t2v');
});

test('getTemplateById 正确查找 image_edit', () => {
  const template = getTemplateById('image_edit');
  assert.ok(template, 'Should find image_edit template');
  assert.strictEqual(template.model, 'qwen-image-edit');
});

test('getTemplateById 不存在返回 undefined', () => {
  const template = getTemplateById('non_existent');
  assert.strictEqual(template, undefined, 'Should return undefined for non-existent template');
});

test('getTemplateByCapability 正确查找', () => {
  const template = getTemplateByCapability('image_to_video');
  assert.ok(template, 'Should find image_to_video capability');
  assert.strictEqual(template.id, 'image_to_video');
});

test('getTemplateByCapability 不存在返回 undefined', () => {
  const template = getTemplateByCapability('non_existent_capability');
  assert.strictEqual(template, undefined);
});

// ─── 4. 分类查找 ──────────────────────────────────────────────
console.log('\n── 分类查找 ──');

test('getTemplatesByCategory("image") 返回图片类模板', () => {
  const templates = getTemplatesByCategory('image');
  assert.ok(templates.length >= 2, `Should have at least 2 image templates, got ${templates.length}`);
  templates.forEach(t => {
    assert.strictEqual(t.category, 'image', `Template ${t.id} should be image category`);
  });
});

test('getTemplatesByCategory("video") 返回视频类模板', () => {
  const templates = getTemplatesByCategory('video');
  assert.ok(templates.length >= 2, `Should have at least 2 video templates, got ${templates.length}`);
  templates.forEach(t => {
    assert.strictEqual(t.category, 'video', `Template ${t.id} should be video category`);
  });
});

test('getTemplatesByCategory() 返回全部模板', () => {
  const templates = getTemplatesByCategory();
  assert.strictEqual(templates.length, CREATIVE_TEMPLATES.length, 'Should return all templates');
});

test('getTemplatesByOutput("image") 返回图片输出模板', () => {
  const templates = getTemplatesByOutput('image');
  assert.ok(templates.length >= 2, 'Should have image output templates');
  templates.forEach(t => {
    assert.strictEqual(t.outputType, 'image');
  });
});

test('getTemplatesByOutput("video") 返回视频输出模板', () => {
  const templates = getTemplatesByOutput('video');
  assert.ok(templates.length >= 2, 'Should have video output templates');
  templates.forEach(t => {
    assert.strictEqual(t.outputType, 'video');
  });
});

// ─── 5. Provider 校验 ─────────────────────────────────────────
console.log('\n── Provider 校验 ──');

test('isAliyunProvider("aliyun") 返回 true', () => {
  assert.strictEqual(isAliyunProvider('aliyun'), true);
});

test('isAliyunProvider("dashscope") 返回 false（历史兼容）', () => {
  assert.strictEqual(isAliyunProvider('dashscope'), false,
    'dashscope is legacy, not the canonical provider');
});

test('isAliyunProvider("runway") 返回 false', () => {
  assert.strictEqual(isAliyunProvider('runway'), false);
});

test('isAliyunProvider("kling") 返回 false', () => {
  assert.strictEqual(isAliyunProvider('kling'), false);
});

// ─── 6. Capability 列表 ───────────────────────────────────────
console.log('\n── Capability 列表 ──');

test('getAllCapabilities 返回所有 capability', () => {
  const capabilities = getAllCapabilities();
  assert.ok(capabilities.includes('image_generation'), 'Should include image_generation');
  assert.ok(capabilities.includes('image_edit'), 'Should include image_edit');
  assert.ok(capabilities.includes('image_to_video'), 'Should include image_to_video');
  assert.ok(capabilities.includes('text_to_video'), 'Should include text_to_video');
  assert.strictEqual(capabilities.length, 4, 'Should have exactly 4 capabilities');
});

// ─── 7. 模板字段完整性 ────────────────────────────────────────
console.log('\n── 模板字段完整性 ──');

test('图片生成模板 model 正确', () => {
  const t = getTemplateById('image_generation');
  assert.strictEqual(t.model, 'qwen-image-3.0-pro');
  assert.strictEqual(t.provider, 'aliyun');
});

test('图片编辑模板 model 正确', () => {
  const t = getTemplateById('image_edit');
  assert.strictEqual(t.model, 'qwen-image-edit');
  assert.strictEqual(t.provider, 'aliyun');
});

test('图片动态化模板 model 正确', () => {
  const t = getTemplateById('image_to_video');
  assert.strictEqual(t.model, 'happyhorse-i2v');
  assert.strictEqual(t.provider, 'aliyun');
});

test('宣传视频生成模板 model 正确', () => {
  const t = getTemplateById('text_to_video');
  assert.strictEqual(t.model, 'happyhorse-t2v');
  assert.strictEqual(t.provider, 'aliyun');
});

// ═══════════════════════════════════════════════════════════════
//  测试汇总
// ═══════════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════╗');
console.log(`║   Results: ${passed} passed, ${failed} failed              ║`);
console.log('╚══════════════════════════════════════════════╝\n');

if (failed > 0) {
  console.log('FAILED tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ✗ ${r.name}`);
    console.log(`    ${r.error}`);
  });
}

process.exit(failed > 0 ? 1 : 0);
