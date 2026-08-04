/**
 * Sprint 4.6 Aliyun AI Provider Architecture Preparation — 测试
 *
 * 运行方式：node tests/sprint4.6.test.js
 *
 * 测试范围：
 *   Part A: ProviderError 统一错误类
 *   Part B: Aliyun Config 模型映射
 *   Part C: Provider Router 注册与路由
 *   Part D: Aliyun Provider 注册成功
 *   Part E: DashScope Client 封装
 *   Part F: GenerationTask 字段验证
 *   Part G: Generation Service 编排层
 *   Part H: 旧 Generation 流程兼容
 *   Part I: API Key 不泄露
 *   Part J: 目录结构完整性
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

// ─── 加载模块 ──────────────────────────────────────────────────
const BASE = path.join(__dirname, '..');

// 加载环境变量
require('dotenv').config({ path: path.join(BASE, '.env') });

const ProviderError = require('../utils/ProviderError');
const aliyunConfig = require('../providers/aliyun/config');
const providerRouter = require('../providers/provider-router');
const providersIndex = require('../providers');
const generationService = require('../services/generationService');

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   Sprint 4.6 AI Provider 架构测试            ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════
//  Part A: ProviderError 统一错误类
// ═══════════════════════════════════════════════════════════════

console.log('══ Part A: ProviderError 统一错误类 ══\n');

test('ProviderError 正确创建', () => {
  const err = new ProviderError('aliyun', 'TIMEOUT', 'DashScope timeout', true);
  assert.strictEqual(err.provider, 'aliyun');
  assert.strictEqual(err.code, 'TIMEOUT');
  assert.strictEqual(err.message, 'DashScope timeout');
  assert.strictEqual(err.retryable, true);
  assert.strictEqual(err.name, 'ProviderError');
});

test('ProviderError 包含 statusCode', () => {
  const err = new ProviderError('aliyun', 'AUTH_FAILED', 'Invalid API key', false, 401);
  assert.strictEqual(err.statusCode, 401);
  assert.strictEqual(err.retryable, false);
});

test('ProviderError.toJSON() 不泄露原始错误', () => {
  const original = new Error('Secret detail: sk-abc123');
  const err = new ProviderError('aliyun', 'ERROR', 'Safe message', false, 500, original);
  const json = err.toJSON();
  assert.strictEqual(json.provider, 'aliyun');
  assert.strictEqual(json.code, 'ERROR');
  assert.strictEqual(json.message, 'Safe message');
  assert.ok(!json.originalError, 'toJSON() should not include originalError');
  assert.ok(!JSON.stringify(json).includes('sk-'), 'toJSON() should not leak API key');
});

test('ProviderError.fromSafeError() 正确转换', () => {
  const safeError = {
    errorCode: 'TIMEOUT',
    safeMessage: 'Request timed out',
    retryable: true,
    statusCode: null
  };
  const err = ProviderError.fromSafeError('aliyun', safeError);
  assert.strictEqual(err.provider, 'aliyun');
  assert.strictEqual(err.code, 'TIMEOUT');
  assert.strictEqual(err.retryable, true);
});

test('ProviderError 是标准 Error 子类', () => {
  const err = new ProviderError('aliyun', 'TEST', 'test', false);
  assert.ok(err instanceof Error);
  assert.ok(err instanceof ProviderError);
});

// ═══════════════════════════════════════════════════════════════
//  Part B: Aliyun Config 模型映射
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part B: Aliyun Config 模型映射 ══\n');

test('resolveModel — image_to_video → happyhorse-i2v', () => {
  const config = aliyunConfig.resolveModel('image_to_video');
  assert.ok(config, 'Should resolve image_to_video');
  assert.strictEqual(config.provider, 'aliyun');
  assert.strictEqual(config.model, 'happyhorse-i2v');
  assert.strictEqual(config.capability, 'image_to_video');
  assert.strictEqual(config.outputType, 'video');
});

test('resolveModel — text_to_video → happyhorse-t2v', () => {
  const config = aliyunConfig.resolveModel('text_to_video');
  assert.ok(config, 'Should resolve text_to_video');
  assert.strictEqual(config.model, 'happyhorse-t2v');
  assert.strictEqual(config.outputType, 'video');
});

test('resolveModel — image_generation → qwen-image-3.0-pro', () => {
  const config = aliyunConfig.resolveModel('image_generation');
  assert.ok(config, 'Should resolve image_generation');
  assert.strictEqual(config.model, 'qwen-image-3.0-pro');
  assert.strictEqual(config.outputType, 'image');
});

test('resolveModel — image_edit → qwen-image-edit', () => {
  const config = aliyunConfig.resolveModel('image_edit');
  assert.ok(config, 'Should resolve image_edit');
  assert.strictEqual(config.model, 'qwen-image-edit');
  assert.strictEqual(config.outputType, 'image');
});

test('resolveModel — 不存在的 templateId 返回 null', () => {
  const config = aliyunConfig.resolveModel('nonexistent_template');
  assert.strictEqual(config, null);
});

test('resolveModel — 空字符串返回 null', () => {
  const config = aliyunConfig.resolveModel('');
  assert.strictEqual(config, null);
});

test('resolveModel — null 返回 null', () => {
  const config = aliyunConfig.resolveModel(null);
  assert.strictEqual(config, null);
});

test('resolveModelByCapability — image_to_video', () => {
  const config = aliyunConfig.resolveModelByCapability('image_to_video');
  assert.ok(config);
  assert.strictEqual(config.model, 'happyhorse-i2v');
});

test('isSupportedTemplate — 支持的模板', () => {
  assert.strictEqual(aliyunConfig.isSupportedTemplate('image_to_video'), true);
  assert.strictEqual(aliyunConfig.isSupportedTemplate('text_to_video'), true);
  assert.strictEqual(aliyunConfig.isSupportedTemplate('image_generation'), true);
  assert.strictEqual(aliyunConfig.isSupportedTemplate('image_edit'), true);
});

test('isSupportedTemplate — 不支持的模板', () => {
  assert.strictEqual(aliyunConfig.isSupportedTemplate('jimeng_t2v'), false);
  assert.strictEqual(aliyunConfig.isSupportedTemplate(''), false);
});

test('getSupportedTemplateIds — 返回4个模板', () => {
  const ids = aliyunConfig.getSupportedTemplateIds();
  assert.strictEqual(ids.length, 4);
  assert.ok(ids.includes('image_to_video'));
  assert.ok(ids.includes('text_to_video'));
  assert.ok(ids.includes('image_generation'));
  assert.ok(ids.includes('image_edit'));
});

test('ALIYUN_MODELS 所有模型 provider 均为 aliyun', () => {
  const models = aliyunConfig.ALIYUN_MODELS;
  for (const [id, config] of Object.entries(models)) {
    assert.strictEqual(config.provider, 'aliyun',
      `${id} should have provider=aliyun, got ${config.provider}`);
  }
});

test('ALIYUN_CONFIG 端点已配置', () => {
  assert.ok(aliyunConfig.ALIYUN_CONFIG.endpoint, 'Endpoint should be configured');
  assert.ok(
    aliyunConfig.ALIYUN_CONFIG.endpoint.includes('dashscope'),
    'Endpoint should point to DashScope'
  );
});

// ═══════════════════════════════════════════════════════════════
//  Part C: Provider Router 注册与路由
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part C: Provider Router ══\n');

test('Provider Router 正常加载', () => {
  assert.ok(providerRouter, 'Provider Router should be loaded');
  assert.ok(typeof providerRouter.createTask === 'function', 'Should export createTask');
  assert.ok(typeof providerRouter.getTaskStatus === 'function', 'Should export getTaskStatus');
  assert.ok(typeof providerRouter.cancelTask === 'function', 'Should export cancelTask');
  assert.ok(typeof providerRouter.resolveTemplateToModel === 'function', 'Should export resolveTemplateToModel');
});

test('getProvider — aliyun 已注册', () => {
  const provider = providerRouter.getProvider('aliyun');
  assert.ok(provider, 'Aliyun provider should be registered');
  assert.strictEqual(provider.name, 'aliyun');
  assert.ok(typeof provider.createTask === 'function', 'Provider should have createTask');
  assert.ok(typeof provider.getTaskStatus === 'function', 'Provider should have getTaskStatus');
  assert.ok(typeof provider.cancelTask === 'function', 'Provider should have cancelTask');
});

test('getProvider — 未注册的 provider 抛出 ProviderError', () => {
  try {
    providerRouter.getProvider('openai');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e instanceof ProviderError, 'Should be ProviderError');
    assert.strictEqual(e.code, 'PROVIDER_NOT_FOUND');
  }
});

test('listProviders — 包含 aliyun', () => {
  const providers = providerRouter.listProviders();
  assert.ok(providers.includes('aliyun'), 'Should include aliyun');
});

test('hasProvider — aliyun 存在', () => {
  assert.strictEqual(providerRouter.hasProvider('aliyun'), true);
});

test('hasProvider — openai 不存在', () => {
  assert.strictEqual(providerRouter.hasProvider('openai'), false);
});

test('resolveTemplateToModel — image_to_video', () => {
  const result = providerRouter.resolveTemplateToModel('image_to_video');
  assert.ok(result);
  assert.strictEqual(result.provider, 'aliyun');
  assert.strictEqual(result.model, 'happyhorse-i2v');
});

test('resolveTemplateToModel — 不存在模板返回 null', () => {
  const result = providerRouter.resolveTemplateToModel('nonexistent');
  assert.strictEqual(result, null);
});

// ═══════════════════════════════════════════════════════════════
//  Part D: Aliyun Provider 注册成功
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part D: Aliyun Provider 注册成功 ══\n');

test('Aliyun Provider 已正确导出', () => {
  const aliyunProvider = require('../providers/aliyun');
  assert.ok(aliyunProvider, 'Aliyun provider should be loadable');
  assert.strictEqual(aliyunProvider.name, 'aliyun');
  assert.strictEqual(aliyunProvider.displayName, '阿里云百炼 (DashScope)');
});

test('Aliyun Provider 实现 AIProvider 接口', () => {
  const aliyunProvider = require('../providers/aliyun');
  assert.ok(typeof aliyunProvider.createTask === 'function', 'Must implement createTask()');
  assert.ok(typeof aliyunProvider.getTaskStatus === 'function', 'Must implement getTaskStatus()');
  assert.ok(typeof aliyunProvider.cancelTask === 'function', 'Must implement cancelTask()');
});

test('Aliyun Provider supportsTemplate 正确判断', () => {
  const aliyunProvider = require('../providers/aliyun');
  assert.strictEqual(aliyunProvider.supportsTemplate('image_to_video'), true);
  assert.strictEqual(aliyunProvider.supportsTemplate('text_to_video'), true);
  assert.strictEqual(aliyunProvider.supportsTemplate('image_generation'), true);
  assert.strictEqual(aliyunProvider.supportsTemplate('jimeng_t2v'), false);
});

test('Aliyun Provider getModelForTemplate 正确', () => {
  const aliyunProvider = require('../providers/aliyun');
  assert.strictEqual(aliyunProvider.getModelForTemplate('image_to_video'), 'happyhorse-i2v');
  assert.strictEqual(aliyunProvider.getModelForTemplate('text_to_video'), 'happyhorse-t2v');
  assert.strictEqual(aliyunProvider.getModelForTemplate('nonexistent'), null);
});

test('Aliyun Image Provider 正确加载', () => {
  const imageProv = require('../providers/aliyun/image-provider');
  assert.ok(imageProv, 'Image provider should be loadable');
  assert.ok(typeof imageProv.createTask === 'function', 'Must implement createTask()');
  assert.ok(typeof imageProv.getTaskStatus === 'function', 'Must implement getTaskStatus()');
  assert.ok(typeof imageProv.cancelTask === 'function', 'Must implement cancelTask()');
});

test('Aliyun Video Provider 正确加载', () => {
  const videoProv = require('../providers/aliyun/video-provider');
  assert.ok(videoProv, 'Video provider should be loadable');
  assert.ok(typeof videoProv.createTask === 'function', 'Must implement createTask()');
  assert.ok(typeof videoProv.getTaskStatus === 'function', 'Must implement getTaskStatus()');
  assert.ok(typeof videoProv.cancelTask === 'function', 'Must implement cancelTask()');
});

test('DashScope Client 正确加载', () => {
  const client = require('../providers/aliyun/dashscope-client');
  assert.ok(client, 'DashScope client should be loadable');
  assert.ok(typeof client.createImageToVideoTask === 'function', 'Must implement createImageToVideoTask()');
  assert.ok(typeof client.getTaskStatus === 'function', 'Must implement getTaskStatus()');
  assert.ok(typeof client.cancelTask === 'function', 'Must implement cancelTask()');
});

// ═══════════════════════════════════════════════════════════════
//  Part E: Providers Index 入口
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part E: Providers Index ══\n');

test('providers/index.js 正确导出', () => {
  assert.ok(providersIndex.providerRouter, 'Should export providerRouter');
  assert.ok(providersIndex.ProviderError, 'Should export ProviderError');
  assert.ok(typeof providersIndex.resolveTemplateToModel === 'function', 'Should export resolveTemplateToModel');
  assert.ok(typeof providersIndex.listProviders === 'function', 'Should export listProviders');
});

test('providers/index.js 的 ProviderError 就是 ProviderError 类', () => {
  assert.strictEqual(providersIndex.ProviderError, ProviderError);
});

// ═══════════════════════════════════════════════════════════════
//  Part F: GenerationTask 字段验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part F: GenerationTask 字段验证 ══\n');

test('GenerationTask model 存在', () => {
  const GenerationTask = require('../models/GenerationTask');
  assert.ok(GenerationTask, 'GenerationTask model should be loadable');
});

test('GenerationTask 包含 provider 字段', () => {
  const GenerationTask = require('../models/GenerationTask');
  const attrs = GenerationTask.rawAttributes;
  assert.ok(attrs.provider, 'GenerationTask should have provider field');
  assert.ok(attrs.provider.type, 'provider should have type definition');
});

test('GenerationTask 包含 model 字段', () => {
  const GenerationTask = require('../models/GenerationTask');
  const attrs = GenerationTask.rawAttributes;
  assert.ok(attrs.model, 'GenerationTask should have model field');
  assert.strictEqual(attrs.model.type.constructor.name, 'STRING', 'model should be STRING type');
});

test('GenerationTask 包含 task_id 字段（providerTaskId）', () => {
  const GenerationTask = require('../models/GenerationTask');
  const attrs = GenerationTask.rawAttributes;
  assert.ok(attrs.task_id, 'GenerationTask should have task_id field (serves as providerTaskId)');
  assert.ok(attrs.task_id.unique, 'task_id should be unique');
});

test('GenerationTask provider 支持 aliyun 值', () => {
  const GenerationTask = require('../models/GenerationTask');
  const attrs = GenerationTask.rawAttributes;
  const providerValues = attrs.provider.type.values;
  assert.ok(providerValues.includes('aliyun'), 'provider enum should include aliyun');
});

test('GenerationTask 保留所有已有字段（旧流程兼容）', () => {
  const GenerationTask = require('../models/GenerationTask');
  const attrs = GenerationTask.rawAttributes;
  const requiredFields = [
    'id', 'enterprise_id', 'user_id', 'task_id', 'task_type',
    'model', 'prompt', 'negative_prompt', 'params',
    'input_url', 'input_images', 'output_url', 'cover_url',
    'duration', 'width', 'height', 'points_cost',
    'status', 'error_msg', 'progress',
    'source_asset_id', 'output_asset_id', 'provider',
    'started_at', 'completed_at', 'deleted_at'
  ];
  requiredFields.forEach(field => {
    assert.ok(attrs[field],
      `GenerationTask should have field: ${field}`);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Part G: Generation Service 编排层
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part G: Generation Service ══\n');

test('GenerationService 正确加载', () => {
  assert.ok(generationService, 'GenerationService should be loaded');
  assert.ok(typeof generationService.createGenerationTask === 'function', 'Must have createGenerationTask');
  assert.ok(typeof generationService.getTaskStatus === 'function', 'Must have getTaskStatus');
  assert.ok(typeof generationService.cancelTask === 'function', 'Must have cancelTask');
  assert.ok(typeof generationService.resolveTemplateToModel === 'function', 'Must have resolveTemplateToModel');
});

test('GenerationService._resolveTemplate — image_to_video', () => {
  const result = generationService._resolveTemplate('image_to_video');
  assert.strictEqual(result.provider, 'aliyun');
  assert.strictEqual(result.model, 'happyhorse-i2v');
  assert.strictEqual(result.capability, 'image_to_video');
});

test('GenerationService._resolveTemplate — 不存在的模板抛出 ProviderError', () => {
  try {
    generationService._resolveTemplate('nonexistent_template_xyz');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e instanceof ProviderError, 'Should be ProviderError');
    assert.strictEqual(e.code, 'UNSUPPORTED_TEMPLATE');
  }
});

test('GenerationService._capabilityToTaskType 映射', () => {
  assert.strictEqual(generationService._capabilityToTaskType('image_generation'), 'text2image');
  assert.strictEqual(generationService._capabilityToTaskType('image_edit'), 'text2image');
  assert.strictEqual(generationService._capabilityToTaskType('image_to_video'), 'image2video');
  assert.strictEqual(generationService._capabilityToTaskType('text_to_video'), 'text2video');
});

test('GenerationService._validateInput — 正常参数不抛错', () => {
  assert.doesNotThrow(() => {
    generationService._validateInput({
      enterpriseId: 1,
      userId: 1,
      templateId: 'image_to_video',
      prompt: 'A beautiful sunset'
    });
  });
});

test('GenerationService._validateInput — 缺少 enterpriseId 抛错', () => {
  try {
    generationService._validateInput({
      userId: 1,
      templateId: 'image_to_video',
      prompt: 'test'
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e instanceof ProviderError);
    assert.strictEqual(e.code, 'VALIDATION');
  }
});

test('GenerationService._validateInput — 缺少 prompt 抛错', () => {
  try {
    generationService._validateInput({
      enterpriseId: 1,
      userId: 1,
      templateId: 'image_to_video',
      prompt: ''
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e instanceof ProviderError);
    assert.strictEqual(e.code, 'VALIDATION');
  }
});

test('GenerationService._validateInput — prompt 超长抛错', () => {
  try {
    generationService._validateInput({
      enterpriseId: 1,
      userId: 1,
      templateId: 'image_to_video',
      prompt: 'x'.repeat(2001)
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e instanceof ProviderError);
    assert.strictEqual(e.code, 'VALIDATION');
  }
});

test('GenerationService._extractErrorInfo — ProviderError', () => {
  const err = new ProviderError('aliyun', 'TIMEOUT', 'Timeout', true);
  const info = generationService._extractErrorInfo(err);
  assert.strictEqual(info.code, 'TIMEOUT');
  assert.ok(info.message.includes('TIMEOUT'));
  assert.strictEqual(info.retryable, true);
});

test('GenerationService._extractErrorInfo — 普通 Error', () => {
  const err = new Error('Something went wrong');
  const info = generationService._extractErrorInfo(err);
  assert.strictEqual(info.code, 'UNKNOWN');
  assert.ok(info.message.includes('Something went wrong'));
  assert.strictEqual(info.retryable, false);
});

// ═══════════════════════════════════════════════════════════════
//  Part H: 旧 Generation 流程兼容
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part H: 旧 Generation 流程兼容 ══\n');

test('旧 dashscopeService 仍然可用', () => {
  const dashscopeService = require('../services/dashscopeService');
  assert.ok(dashscopeService, 'dashscopeService should still be loadable');
  assert.ok(typeof dashscopeService.createImageToVideoTask === 'function',
    'Old createImageToVideoTask should still work');
  assert.ok(typeof dashscopeService.getTaskStatus === 'function',
    'Old getTaskStatus should still work');
  assert.ok(typeof dashscopeService.normalizeStatus === 'function',
    'Old normalizeStatus should still work');
});

test('旧 taskController 仍然可以加载', () => {
  const taskController = require('../controllers/enterprise/taskController');
  assert.ok(taskController, 'Old taskController should still be loadable');
  assert.ok(typeof taskController.text2Video === 'function');
  assert.ok(typeof taskController.image2Video === 'function');
  assert.ok(typeof taskController.ref2Video === 'function');
  assert.ok(typeof taskController.list === 'function');
  assert.ok(typeof taskController.getStatus === 'function');
});

test('旧 videoGenerationController 仍然可以加载', () => {
  const videoGenController = require('../controllers/enterprise/videoGenerationController');
  assert.ok(videoGenController, 'videoGenerationController should still be loadable');
  assert.ok(typeof videoGenController.createTask === 'function');
  assert.ok(typeof videoGenController.getTask === 'function');
  assert.ok(typeof videoGenController.listTasks === 'function');
  assert.ok(typeof videoGenController.deleteTask === 'function');
  assert.ok(typeof videoGenController.getTemplates === 'function');
});

test('creativeTemplates 配置未被修改', () => {
  const { CREATIVE_TEMPLATES, getTemplateById, getTemplateByCapability } = require('../config/creativeTemplates');
  assert.strictEqual(CREATIVE_TEMPLATES.length, 4, 'Should still have 4 templates');

  const template = getTemplateById('image_to_video');
  assert.ok(template);
  assert.strictEqual(template.provider, 'aliyun');
  assert.strictEqual(template.model, 'happyhorse-i2v');

  const byCap = getTemplateByCapability('image_to_video');
  assert.ok(byCap);

  // 确认无第三方模型
  const thirdParty = CREATIVE_TEMPLATES.filter(t =>
    !['aliyun'].includes(t.provider)
  );
  assert.strictEqual(thirdParty.length, 0, 'No third-party providers allowed');
});

test('GenerationTask model 未破坏已有关联', () => {
  const { GenerationTask } = require('../models');
  // sourceAsset 关联
  const sourceAssoc = Object.values(GenerationTask.associations)
    .find(a => a.as === 'sourceAsset');
  assert.ok(sourceAssoc, 'sourceAsset association should exist');

  // outputAsset 关联
  const outputAssoc = Object.values(GenerationTask.associations)
    .find(a => a.as === 'outputAsset');
  assert.ok(outputAssoc, 'outputAsset association should exist');
});

// ═══════════════════════════════════════════════════════════════
//  Part I: API Key 不泄露
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part I: API Key 不泄露 ══\n');

function checkFileNoApiKeyLeak(filePath, label) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  // 检查文件中没有硬编码的 API Key（sk- 开头）
  const apiKeyPattern = /sk-[a-zA-Z0-9]{10,}/g;
  const matches = content.match(apiKeyPattern) || [];
  // 过滤掉 从 env 读取的模式：process.env.DASHSCOPE_API_KEY
  const linesWithKey = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (apiKeyPattern.test(line) && !line.includes('process.env') && !line.includes('DASHSCOPE_API_KEY')) {
      linesWithKey.push({ line: idx + 1, content: line.trim() });
    }
  });

  assert.strictEqual(linesWithKey.length, 0,
    `${fileName} should not hardcode API keys. Found at lines: ${JSON.stringify(linesWithKey)}`);
}

const providerFiles = [
  'providers/index.js',
  'providers/provider-router.js',
  'providers/aliyun/index.js',
  'providers/aliyun/config.js',
  'providers/aliyun/dashscope-client.js',
  'providers/aliyun/image-provider.js',
  'providers/aliyun/video-provider.js',
  'services/generationService.js',
  'utils/ProviderError.js'
];

providerFiles.forEach(f => {
  const fp = path.join(BASE, f);
  if (fs.existsSync(fp)) {
    test(`API Key 不泄露 — ${f}`, () => {
      checkFileNoApiKeyLeak(fp, f);
    });
  }
});

test('ProviderError.toJSON() 不含 API Key', () => {
  const err = new ProviderError('aliyun', 'ERROR', 'Safe message', false);
  const json = JSON.stringify(err.toJSON());
  assert.ok(!json.includes('sk-'), 'toJSON() should not contain API key pattern');
  assert.ok(!json.includes('Bearer'), 'toJSON() should not contain Bearer token');
});

test('日志方法不记录 apiKey', () => {
  // 检查 generationService 和 aliyun/index.js 中的日志语句
  const genServiceSource = fs.readFileSync(
    path.join(BASE, 'services', 'generationService.js'), 'utf8'
  );
  const aliyunIndexSource = fs.readFileSync(
    path.join(BASE, 'providers', 'aliyun', 'index.js'), 'utf8'
  );

  const allSources = [genServiceSource, aliyunIndexSource];

  allSources.forEach(source => {
    // 查找所有 console.log / console.error
    const logLines = source.match(/console\.(log|error)\([^)]*\)/g) || [];
    logLines.forEach(line => {
      assert.ok(
        !line.includes('apiKey') && !line.includes('api_key') && !line.includes('API_KEY'),
        `Log line should not reference apiKey: ${line.trim().substring(0, 80)}`
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  Part J: 目录结构完整性
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part J: 目录结构完整性 ══\n');

const expectedFiles = [
  'providers/index.js',
  'providers/provider-router.js',
  'providers/aliyun/index.js',
  'providers/aliyun/config.js',
  'providers/aliyun/dashscope-client.js',
  'providers/aliyun/image-provider.js',
  'providers/aliyun/video-provider.js',
  'services/generationService.js',
  'utils/ProviderError.js'
];

expectedFiles.forEach(f => {
  test(`文件存在 — ${f}`, () => {
    const fp = path.join(BASE, f);
    assert.ok(fs.existsSync(fp), `${f} must exist`);
    const content = fs.readFileSync(fp, 'utf8');
    assert.ok(content.length > 100, `${f} must contain meaningful content`);
  });
});

test('providers/ 目录结构符合设计', () => {
  const providersDir = path.join(BASE, 'providers');
  const aliyunDir = path.join(BASE, 'providers', 'aliyun');

  assert.ok(fs.statSync(providersDir).isDirectory(), 'providers/ must be a directory');
  assert.ok(fs.statSync(aliyunDir).isDirectory(), 'providers/aliyun/ must be a directory');

  const aliyunFiles = fs.readdirSync(aliyunDir);
  assert.ok(aliyunFiles.includes('index.js'), 'aliyun/index.js must exist');
  assert.ok(aliyunFiles.includes('config.js'), 'aliyun/config.js must exist');
  assert.ok(aliyunFiles.includes('dashscope-client.js'), 'aliyun/dashscope-client.js must exist');
  assert.ok(aliyunFiles.includes('image-provider.js'), 'aliyun/image-provider.js must exist');
  assert.ok(aliyunFiles.includes('video-provider.js'), 'aliyun/video-provider.js must exist');
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
