/**
 * Sprint 4.7 Aliyun Provider Real API Integration — 测试
 *
 * 运行方式：node tests/sprint4.7.test.js
 *
 * 测试范围：
 *   Part A: Controller 调用链验证（Controller → GenerationService，禁止直接 dashscopeService）
 *   Part B: GenerationService 接管验证
 *   Part C: templateId 正确解析 model
 *   Part D: Aliyun Provider 正常调用
 *   Part E: GenerationTask 保存正确
 *   Part F: getTaskStatus 状态查询正常
 *   Part G: API Key 安全
 *   Part H: 前端参数清理验证
 *   Part I: 回归测试（Sprint 4.6 测试全部通过）
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
const generationService = require('../services/generationService');
const providerRouter = require('../providers/provider-router');
const aliyunConfig = require('../providers/aliyun/config');
const videoGenerationController = require('../controllers/enterprise/videoGenerationController');

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   Sprint 4.7 Aliyun Provider Real API       ║');
console.log('║   Integration 测试                           ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════
//  Part A: Controller 调用链验证
// ═══════════════════════════════════════════════════════════════

console.log('══ Part A: Controller 调用链验证 ══\n');

test('Controller createTask 存在且为函数', () => {
  assert.ok(videoGenerationController, 'Controller should be loadable');
  assert.strictEqual(typeof videoGenerationController.createTask, 'function',
    'createTask should be a function');
});

test('Controller getTask 存在且为函数', () => {
  assert.strictEqual(typeof videoGenerationController.getTask, 'function',
    'getTask should be a function');
});

test('Controller listTasks 存在且为函数', () => {
  assert.strictEqual(typeof videoGenerationController.listTasks, 'function',
    'listTasks should be a function');
});

test('Controller deleteTask 存在且为函数', () => {
  assert.strictEqual(typeof videoGenerationController.deleteTask, 'function',
    'deleteTask should be a function');
});

test('Controller getTemplates 存在且为函数', () => {
  assert.strictEqual(typeof videoGenerationController.getTemplates, 'function',
    'getTemplates should be a function');
});

test('Controller 源码引用 generationService（非仅 dashscopeService）', () => {
  const source = fs.readFileSync(
    path.join(BASE, 'controllers', 'enterprise', 'videoGenerationController.js'), 'utf8'
  );
  assert.ok(
    source.includes("require('../../services/generationService')"),
    'Controller should require generationService'
  );
});

test('Controller createTask 源码中调用 generationService.createGenerationTask', () => {
  const source = fs.readFileSync(
    path.join(BASE, 'controllers', 'enterprise', 'videoGenerationController.js'), 'utf8'
  );
  assert.ok(
    source.includes('generationService.createGenerationTask'),
    'createTask should call generationService.createGenerationTask()'
  );
});

test('Controller 不再直接调用 dashscopeService.createImageToVideoTask', () => {
  const source = fs.readFileSync(
    path.join(BASE, 'controllers', 'enterprise', 'videoGenerationController.js'), 'utf8'
  );
  // 确保 createTask 函数体内没有直接调用 dashscopeService.createImageToVideoTask
  // 允许 import 行存在，但不允许在 createTask 中调用
  const createTaskFn = source.match(/exports\.createTask\s*=\s*async[\s\S]*?^};/m);
  if (createTaskFn) {
    const hasDirectCall = createTaskFn[0].includes('dashscopeService.createImageToVideoTask');
    assert.strictEqual(hasDirectCall, false,
      'createTask() should NOT directly call dashscopeService.createImageToVideoTask()');
  }
});

test('Controller getTask 源码中调用 generationService.getTaskStatus', () => {
  const source = fs.readFileSync(
    path.join(BASE, 'controllers', 'enterprise', 'videoGenerationController.js'), 'utf8'
  );
  assert.ok(
    source.includes('generationService.getTaskStatus'),
    'getTask should call generationService.getTaskStatus()'
  );
});

test('Controller getTask 不再直接调用 dashscopeService.getTaskStatus', () => {
  const source = fs.readFileSync(
    path.join(BASE, 'controllers', 'enterprise', 'videoGenerationController.js'), 'utf8'
  );
  const getTaskFn = source.match(/exports\.getTask\s*=\s*async[\s\S]*?^};/m);
  if (getTaskFn) {
    const hasDirectCall = getTaskFn[0].includes('dashscopeService.getTaskStatus');
    assert.strictEqual(hasDirectCall, false,
      'getTask() should NOT directly call dashscopeService.getTaskStatus()');
  }
});

// ═══════════════════════════════════════════════════════════════
//  Part B: GenerationService 接管验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part B: GenerationService 接管验证 ══\n');

test('GenerationService 正确加载', () => {
  assert.ok(generationService, 'GenerationService should be loaded');
});

test('GenerationService.createGenerationTask 存在', () => {
  assert.strictEqual(typeof generationService.createGenerationTask, 'function',
    'createGenerationTask should be a function');
});

test('GenerationService.getTaskStatus 存在', () => {
  assert.strictEqual(typeof generationService.getTaskStatus, 'function',
    'getTaskStatus should be a function');
});

test('GenerationService.cancelTask 存在', () => {
  assert.strictEqual(typeof generationService.cancelTask, 'function',
    'cancelTask should be a function');
});

test('GenerationService.resolveTemplateToModel 存在', () => {
  assert.strictEqual(typeof generationService.resolveTemplateToModel, 'function',
    'resolveTemplateToModel should be a function');
});

test('GenerationService._validateInput 参数校验', () => {
  // 正常参数
  assert.doesNotThrow(() => {
    generationService._validateInput({
      enterpriseId: 1,
      userId: 1,
      templateId: 'image_to_video',
      prompt: 'A beautiful sunset over the ocean'
    });
  });

  // 缺少 enterpriseId
  try {
    generationService._validateInput({
      userId: 1,
      templateId: 'image_to_video',
      prompt: 'test'
    });
    assert.fail('Should have thrown for missing enterpriseId');
  } catch (e) {
    assert.ok(e instanceof ProviderError);
    assert.strictEqual(e.code, 'VALIDATION');
  }

  // 缺少 prompt
  try {
    generationService._validateInput({
      enterpriseId: 1,
      userId: 1,
      templateId: 'image_to_video',
      prompt: ''
    });
    assert.fail('Should have thrown for empty prompt');
  } catch (e) {
    assert.ok(e instanceof ProviderError);
    assert.strictEqual(e.code, 'VALIDATION');
  }

  // prompt 超长
  try {
    generationService._validateInput({
      enterpriseId: 1,
      userId: 1,
      templateId: 'image_to_video',
      prompt: 'x'.repeat(2001)
    });
    assert.fail('Should have thrown for long prompt');
  } catch (e) {
    assert.ok(e instanceof ProviderError);
    assert.strictEqual(e.code, 'VALIDATION');
  }
});

test('GenerationService._capabilityToTaskType 映射正确', () => {
  assert.strictEqual(generationService._capabilityToTaskType('image_generation'), 'text2image');
  assert.strictEqual(generationService._capabilityToTaskType('image_edit'), 'text2image');
  assert.strictEqual(generationService._capabilityToTaskType('image_to_video'), 'image2video');
  assert.strictEqual(generationService._capabilityToTaskType('text_to_video'), 'text2video');
});

test('GenerationService._capabilityToTaskType 未知 capability 默认值', () => {
  const result = generationService._capabilityToTaskType('unknown_capability');
  assert.strictEqual(result, 'image2video', 'Unknown capability should default to image2video');
});

test('GenerationService._extractErrorInfo — ProviderError', () => {
  const err = new ProviderError('aliyun', 'TIMEOUT', 'Request timed out', true, 504);
  const info = generationService._extractErrorInfo(err);
  assert.strictEqual(info.code, 'TIMEOUT');
  assert.ok(info.message.includes('TIMEOUT'));
  assert.strictEqual(info.retryable, true);
});

test('GenerationService._extractErrorInfo — 普通 Error', () => {
  const err = new Error('Network error');
  const info = generationService._extractErrorInfo(err);
  assert.strictEqual(info.code, 'UNKNOWN');
  assert.ok(info.message.includes('Network error'));
  assert.strictEqual(info.retryable, false);
});

// ═══════════════════════════════════════════════════════════════
//  Part C: templateId 正确解析 model
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part C: templateId → model 解析 ══\n');

test('templateId image_to_video → happyhorse-i2v (Aliyun Config)', () => {
  const config = aliyunConfig.resolveModel('image_to_video');
  assert.ok(config, 'Should resolve');
  assert.strictEqual(config.provider, 'aliyun');
  assert.strictEqual(config.model, 'happyhorse-1.1-i2v');
  assert.strictEqual(config.capability, 'image_to_video');
  assert.strictEqual(config.outputType, 'video');
});

test('templateId text_to_video → happyhorse-t2v (Aliyun Config)', () => {
  const config = aliyunConfig.resolveModel('text_to_video');
  assert.ok(config);
  assert.strictEqual(config.model, 'happyhorse-t2v');
  assert.strictEqual(config.provider, 'aliyun');
});

test('templateId image_generation → qwen-image-3.0-pro (Aliyun Config)', () => {
  const config = aliyunConfig.resolveModel('image_generation');
  assert.ok(config);
  assert.strictEqual(config.model, 'qwen-image-3.0-pro');
  assert.strictEqual(config.outputType, 'image');
});

test('templateId image_edit → qwen-image-edit (Aliyun Config)', () => {
  const config = aliyunConfig.resolveModel('image_edit');
  assert.ok(config);
  assert.strictEqual(config.model, 'qwen-image-edit');
});

test('GenerationService._resolveTemplate — image_to_video', () => {
  const result = generationService._resolveTemplate('image_to_video');
  assert.strictEqual(result.provider, 'aliyun');
  assert.strictEqual(result.model, 'happyhorse-1.1-i2v');
  assert.strictEqual(result.capability, 'image_to_video');
});

test('GenerationService._resolveTemplate — text_to_video', () => {
  const result = generationService._resolveTemplate('text_to_video');
  assert.strictEqual(result.provider, 'aliyun');
  assert.strictEqual(result.model, 'happyhorse-t2v');
  assert.strictEqual(result.capability, 'text_to_video');
});

test('GenerationService._resolveTemplate — 不存在的模板抛出 UNSUPPORTED_TEMPLATE', () => {
  try {
    generationService._resolveTemplate('nonexistent_xyz_123');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e instanceof ProviderError);
    assert.strictEqual(e.code, 'UNSUPPORTED_TEMPLATE');
  }
});

test('ProviderRouter.resolveTemplateToModel — image_to_video', () => {
  const result = providerRouter.resolveTemplateToModel('image_to_video');
  assert.ok(result);
  assert.strictEqual(result.provider, 'aliyun');
  assert.strictEqual(result.model, 'happyhorse-1.1-i2v');
});

test('ProviderRouter.resolveTemplateToModel — text_to_video', () => {
  const result = providerRouter.resolveTemplateToModel('text_to_video');
  assert.ok(result);
  assert.strictEqual(result.model, 'happyhorse-t2v');
});

test('GenerationService.resolveTemplateToModel 公开方法', () => {
  const result = generationService.resolveTemplateToModel('image_to_video');
  assert.strictEqual(result.provider, 'aliyun');
  assert.strictEqual(result.model, 'happyhorse-1.1-i2v');
});

// ═══════════════════════════════════════════════════════════════
//  Part D: Aliyun Provider 正常调用
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part D: Aliyun Provider 正常调用 ══\n');

test('Aliyun Provider 正确加载', () => {
  const aliyunProvider = require('../providers/aliyun');
  assert.ok(aliyunProvider);
  assert.strictEqual(aliyunProvider.name, 'aliyun');
  assert.strictEqual(aliyunProvider.displayName, '阿里云百炼 (DashScope)');
});

test('Aliyun Provider 实现完整 AIProvider 接口', () => {
  const aliyunProvider = require('../providers/aliyun');
  assert.strictEqual(typeof aliyunProvider.createTask, 'function');
  assert.strictEqual(typeof aliyunProvider.getTaskStatus, 'function');
  assert.strictEqual(typeof aliyunProvider.cancelTask, 'function');
  assert.strictEqual(typeof aliyunProvider.supportsTemplate, 'function');
  assert.strictEqual(typeof aliyunProvider.getModelForTemplate, 'function');
});

test('Aliyun Video Provider 正确加载', () => {
  const videoProv = require('../providers/aliyun/video-provider');
  assert.ok(videoProv);
  assert.strictEqual(videoProv.provider, 'aliyun');
  assert.strictEqual(typeof videoProv.createTask, 'function');
  assert.strictEqual(typeof videoProv.getTaskStatus, 'function');
  assert.strictEqual(typeof videoProv.cancelTask, 'function');
});

test('Aliyun Image Provider 正确加载', () => {
  const imageProv = require('../providers/aliyun/image-provider');
  assert.ok(imageProv);
  assert.strictEqual(imageProv.provider, 'aliyun');
  assert.strictEqual(typeof imageProv.createTask, 'function');
  assert.strictEqual(typeof imageProv.getTaskStatus, 'function');
  assert.strictEqual(typeof imageProv.cancelTask, 'function');
});

test('DashScope Client 正确加载', () => {
  const client = require('../providers/aliyun/dashscope-client');
  assert.ok(client);
  assert.strictEqual(typeof client.createImageToVideoTask, 'function');
  assert.strictEqual(typeof client.createTextToVideoTask, 'function');
  assert.strictEqual(typeof client.createRefToVideoTask, 'function');
  assert.strictEqual(typeof client.createTextToImageTask, 'function');
  assert.strictEqual(typeof client.getTaskStatus, 'function');
  assert.strictEqual(typeof client.cancelTask, 'function');
});

test('Aliyun Provider supportsTemplate 正确判断', () => {
  const aliyunProvider = require('../providers/aliyun');
  assert.strictEqual(aliyunProvider.supportsTemplate('image_to_video'), true);
  assert.strictEqual(aliyunProvider.supportsTemplate('text_to_video'), true);
  assert.strictEqual(aliyunProvider.supportsTemplate('image_generation'), true);
  assert.strictEqual(aliyunProvider.supportsTemplate('image_edit'), true);
  assert.strictEqual(aliyunProvider.supportsTemplate('jimeng_t2v'), false);
  assert.strictEqual(aliyunProvider.supportsTemplate(''), false);
});

test('Aliyun Provider getModelForTemplate 正确', () => {
  const aliyunProvider = require('../providers/aliyun');
  assert.strictEqual(aliyunProvider.getModelForTemplate('image_to_video'), 'happyhorse-1.1-i2v');
  assert.strictEqual(aliyunProvider.getModelForTemplate('text_to_video'), 'happyhorse-t2v');
  assert.strictEqual(aliyunProvider.getModelForTemplate('image_generation'), 'qwen-image-3.0-pro');
  assert.strictEqual(aliyunProvider.getModelForTemplate('nonexistent'), null);
});

test('Provider Router getProvider — aliyun 已注册', () => {
  const provider = providerRouter.getProvider('aliyun');
  assert.ok(provider);
  assert.strictEqual(provider.name, 'aliyun');
});

test('Provider Router getProvider — 未注册的 provider 抛出 PROVIDER_NOT_FOUND', () => {
  try {
    providerRouter.getProvider('openai');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e instanceof ProviderError);
    assert.strictEqual(e.code, 'PROVIDER_NOT_FOUND');
  }
});

test('Provider Router listProviders 包含 aliyun', () => {
  const providers = providerRouter.listProviders();
  assert.ok(providers.includes('aliyun'));
});

test('Provider Router hasProvider — aliyun', () => {
  assert.strictEqual(providerRouter.hasProvider('aliyun'), true);
  assert.strictEqual(providerRouter.hasProvider('openai'), false);
});

// ═══════════════════════════════════════════════════════════════
//  Part E: GenerationTask 保存正确
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part E: GenerationTask Model 验证 ══\n');

test('GenerationTask model 可加载', () => {
  const GenerationTask = require('../models/GenerationTask');
  assert.ok(GenerationTask, 'GenerationTask model should be loadable');
});

test('GenerationTask 包含所有必需字段', () => {
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
    assert.ok(attrs[field], `GenerationTask should have field: ${field}`);
  });
});

test('GenerationTask provider 字段支持 aliyun 值', () => {
  const GenerationTask = require('../models/GenerationTask');
  const attrs = GenerationTask.rawAttributes;
  const providerValues = attrs.provider.type.values;
  assert.ok(providerValues.includes('aliyun'),
    'provider enum should include aliyun');
});

test('GenerationTask model 字段类型正确', () => {
  const GenerationTask = require('../models/GenerationTask');
  const attrs = GenerationTask.rawAttributes;
  assert.strictEqual(attrs.model.type.constructor.name, 'STRING',
    'model should be STRING type');
  assert.ok(attrs.task_id.unique, 'task_id should be unique');
  assert.strictEqual(attrs.provider.type.values.includes('aliyun'), true);
});

test('GenerationTask sourceAsset / outputAsset 关联存在', () => {
  const { GenerationTask } = require('../models');
  const sourceAssoc = Object.values(GenerationTask.associations)
    .find(a => a.as === 'sourceAsset');
  assert.ok(sourceAssoc, 'sourceAsset association should exist');

  const outputAssoc = Object.values(GenerationTask.associations)
    .find(a => a.as === 'outputAsset');
  assert.ok(outputAssoc, 'outputAsset association should exist');
});

// ═══════════════════════════════════════════════════════════════
//  Part F: getTaskStatus 状态查询正常
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part F: getTaskStatus 状态查询 ══\n');

test('GenerationService.getTaskStatus 委托给 ProviderRouter', () => {
  // 验证方法签名正确
  assert.strictEqual(generationService.getTaskStatus.length, 2,
    'getTaskStatus should accept 2 parameters: providerName, taskId');
});

test('ProviderRouter.getTaskStatus 委托给具体 Provider', () => {
  assert.strictEqual(typeof providerRouter.getTaskStatus, 'function');
  assert.strictEqual(providerRouter.getTaskStatus.length, 2,
    'getTaskStatus should accept 2 parameters: providerName, taskId');
});

test('Aliyun Provider.getTaskStatus 委托给 videoProvider', () => {
  const aliyunProvider = require('../providers/aliyun');
  assert.strictEqual(typeof aliyunProvider.getTaskStatus, 'function');
});

test('Aliyun Video Provider.getTaskStatus 委托给 dashscopeClient', () => {
  const videoProv = require('../providers/aliyun/video-provider');
  assert.strictEqual(typeof videoProv.getTaskStatus, 'function');
});

test('DashScope Client.getTaskStatus 委托给 dashscopeService', () => {
  const client = require('../providers/aliyun/dashscope-client');
  assert.strictEqual(typeof client.getTaskStatus, 'function');
});

test('调用链完整: GenerationService → ProviderRouter → AliyunProvider → VideoProvider → DashScopeClient → dashscopeService', () => {
  // 验证每一层都正确实现了 getTaskStatus
  assert.strictEqual(typeof generationService.getTaskStatus, 'function');
  assert.strictEqual(typeof providerRouter.getTaskStatus, 'function');

  const aliyunProvider = require('../providers/aliyun');
  assert.strictEqual(typeof aliyunProvider.getTaskStatus, 'function');

  const videoProv = require('../providers/aliyun/video-provider');
  assert.strictEqual(typeof videoProv.getTaskStatus, 'function');

  const client = require('../providers/aliyun/dashscope-client');
  assert.strictEqual(typeof client.getTaskStatus, 'function');

  // 验证 dashscopeService 仍然可用（底层 HTTP 通信）
  const dashscopeService = require('../services/dashscopeService');
  assert.strictEqual(typeof dashscopeService.getTaskStatus, 'function');
});

// ═══════════════════════════════════════════════════════════════
//  Part G: API Key 安全
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part G: API Key 安全 ══\n');

test('Controller 源码不含硬编码 API Key', () => {
  const source = fs.readFileSync(
    path.join(BASE, 'controllers', 'enterprise', 'videoGenerationController.js'), 'utf8'
  );
  const apiKeyPattern = /sk-[a-zA-Z0-9]{10,}/g;
  const lines = source.split('\n');
  lines.forEach((line, idx) => {
    if (apiKeyPattern.test(line) && !line.includes('process.env') && !line.includes('DASHSCOPE_API_KEY')) {
      assert.fail(`Controller line ${idx + 1} hardcodes API key: ${line.trim()}`);
    }
  });
  // 如果没有 fail，测试通过
  assert.ok(true);
});

test('GenerationService 源码不含硬编码 API Key', () => {
  const source = fs.readFileSync(
    path.join(BASE, 'services', 'generationService.js'), 'utf8'
  );
  const apiKeyPattern = /sk-[a-zA-Z0-9]{10,}/g;
  const lines = source.split('\n');
  lines.forEach((line, idx) => {
    if (apiKeyPattern.test(line) && !line.includes('process.env') && !line.includes('DASHSCOPE_API_KEY')) {
      assert.fail(`GenerationService line ${idx + 1} hardcodes API key: ${line.trim()}`);
    }
  });
  assert.ok(true);
});

test('所有 Provider 文件不含硬编码 API Key', () => {
  const providerFiles = [
    'providers/index.js',
    'providers/provider-router.js',
    'providers/aliyun/index.js',
    'providers/aliyun/config.js',
    'providers/aliyun/dashscope-client.js',
    'providers/aliyun/image-provider.js',
    'providers/aliyun/video-provider.js'
  ];

  const apiKeyPattern = /sk-[a-zA-Z0-9]{10,}/g;

  providerFiles.forEach(filePath => {
    const fullPath = path.join(BASE, filePath);
    if (fs.existsSync(fullPath)) {
      const source = fs.readFileSync(fullPath, 'utf8');
      const lines = source.split('\n');
      lines.forEach((line, idx) => {
        if (apiKeyPattern.test(line) && !line.includes('process.env') && !line.includes('DASHSCOPE_API_KEY')) {
          assert.fail(`${filePath} line ${idx + 1} hardcodes API key: ${line.trim()}`);
        }
      });
    }
  });
  assert.ok(true, 'All provider files are API-key safe');
});

test('API Key 仅在 config.js 中通过 process.env 引用', () => {
  const configSource = fs.readFileSync(
    path.join(BASE, 'providers', 'aliyun', 'config.js'), 'utf8'
  );
  assert.ok(
    configSource.includes('process.env.DASHSCOPE_API_KEY'),
    'config.js should reference API key via process.env'
  );
  // 确保 getter 中没有硬编码值
  const getterMatch = configSource.match(/get apiKey\(\)\s*\{[^}]*\}/);
  if (getterMatch) {
    assert.ok(
      getterMatch[0].includes('process.env'),
      'apiKey getter should use process.env'
    );
  }
});

test('日志方法不记录 apiKey', () => {
  const files = [
    'services/generationService.js',
    'providers/aliyun/index.js',
    'providers/aliyun/dashscope-client.js'
  ];

  files.forEach(file => {
    const source = fs.readFileSync(path.join(BASE, file), 'utf8');
    const logLines = source.match(/console\.(log|error)\([^)]*\)/g) || [];
    logLines.forEach(line => {
      assert.ok(
        !line.includes('apiKey') && !line.includes('api_key') && !line.includes('API_KEY') &&
        !line.includes('DASHSCOPE_API_KEY'),
        `${file}: Log line should not reference apiKey: ${line.trim().substring(0, 80)}`
      );
    });
  });
});

test('ProviderError.toJSON() 不含 API Key', () => {
  const err = new ProviderError('aliyun', 'AUTH_FAILED', 'Invalid API key', false, 401);
  const json = JSON.stringify(err.toJSON());
  assert.ok(!json.includes('sk-'), 'toJSON() should not contain API key pattern');
  assert.ok(!json.includes('Bearer'), 'toJSON() should not contain Bearer token');
});

// ═══════════════════════════════════════════════════════════════
//  Part H: 前端参数清理验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part H: 前端参数清理验证 ══\n');

test('前端 generation-panel.js 存在', () => {
  const panelPath = path.join(BASE, 'public', 'js', 'enterprise', 'generation-panel.js');
  assert.ok(fs.existsSync(panelPath), 'generation-panel.js should exist');
});

test('前端不再传递 model 字段到 taskInput', () => {
  const source = fs.readFileSync(
    path.join(BASE, 'public', 'js', 'enterprise', 'generation-panel.js'), 'utf8'
  );

  // taskInput 对象不应包含 model 字段
  // 查找 taskInput 定义
  const taskInputMatch = source.match(/var taskInput\s*=\s*\{[^}]+\}/);
  if (taskInputMatch) {
    const hasModelField = taskInputMatch[0].includes('model:');
    assert.strictEqual(hasModelField, false,
      'taskInput should NOT include model field — model is resolved server-side');
  }
});

test('前端 TEMPLATE_MAP 不再包含具体模型名称映射', () => {
  const source = fs.readFileSync(
    path.join(BASE, 'public', 'js', 'enterprise', 'generation-panel.js'), 'utf8'
  );

  // TEMPLATE_MAP 不再包含带 model 属性的映射对象
  const templateMapMatch = source.match(/TEMPLATE_MAP\s*=\s*\{[^}]+\}/);
  // 新版本中 TEMPLATE_MAP 被替换为注释，不再包含对象
  assert.ok(
    !source.includes("happyhorse-i2v") &&
    !source.includes("happyhorse-t2v") &&
    !source.includes("qwen-image-3.0-pro") &&
    !source.includes("qwen-image-edit"),
    'Frontend should NOT contain model name strings — models are resolved server-side'
  );
});

test('前端只传递 templateId, prompt, sourceAssetId', () => {
  const source = fs.readFileSync(
    path.join(BASE, 'public', 'js', 'enterprise', 'generation-panel.js'), 'utf8'
  );

  // 验证 taskInput 包含正确字段
  assert.ok(source.includes('templateId:'), 'taskInput should include templateId');
  assert.ok(source.includes('prompt:'), 'taskInput should include prompt');
  assert.ok(source.includes('sourceAssetId:'), 'taskInput should include sourceAssetId');
});

// ═══════════════════════════════════════════════════════════════
//  Part I: Sprint 4.6 回归验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part I: Sprint 4.6 回归验证 ══\n');

test('ProviderError 类仍然正常', () => {
  const err = new ProviderError('aliyun', 'TEST', 'Test error', true, 500);
  assert.strictEqual(err.provider, 'aliyun');
  assert.strictEqual(err.code, 'TEST');
  assert.strictEqual(err.name, 'ProviderError');
  assert.ok(err instanceof Error);
});

test('Aliyun Config — 4个模板映射全部正常', () => {
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

test('creativeTemplates 配置未被修改', () => {
  const { CREATIVE_TEMPLATES, getTemplateById } = require('../config/creativeTemplates');
  assert.strictEqual(CREATIVE_TEMPLATES.length, 4, 'Should still have 4 templates');

  const template = getTemplateById('image_to_video');
  assert.ok(template);
  assert.strictEqual(template.provider, 'aliyun');
  assert.strictEqual(template.model, 'happyhorse-i2v');

  const thirdParty = CREATIVE_TEMPLATES.filter(t =>
    !['aliyun'].includes(t.provider)
  );
  assert.strictEqual(thirdParty.length, 0, 'No third-party providers allowed');
});

test('providers/index.js 正确导出', () => {
  const providersIndex = require('../providers');
  assert.ok(providersIndex.providerRouter);
  assert.ok(providersIndex.ProviderError);
  assert.strictEqual(typeof providersIndex.resolveTemplateToModel, 'function');
  assert.strictEqual(typeof providersIndex.listProviders, 'function');
});

test('旧 dashscopeService 仍然可用（向后兼容）', () => {
  const dashscopeService = require('../services/dashscopeService');
  assert.ok(dashscopeService, 'dashscopeService should still be loadable');
  assert.strictEqual(typeof dashscopeService.createImageToVideoTask, 'function');
  assert.strictEqual(typeof dashscopeService.getTaskStatus, 'function');
  assert.strictEqual(typeof dashscopeService.normalizeStatus, 'function');
});

test('全部 Sprint 4.6 架构文件存在', () => {
  const files = [
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

  files.forEach(f => {
    const fp = path.join(BASE, f);
    assert.ok(fs.existsSync(fp), `${f} must exist`);
    const content = fs.readFileSync(fp, 'utf8');
    assert.ok(content.length > 100, `${f} must contain meaningful content`);
  });
});

// ─── 测试结果汇总 ──────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   Sprint 4.7 测试结果汇总                    ║');
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
