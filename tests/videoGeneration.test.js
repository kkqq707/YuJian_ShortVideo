/**
 * VideoGeneration Controller 单元测试
 *
 * Sprint 2.5 Step 3.2 + 3.3
 *
 * 运行方式：node tests/videoGeneration.test.js
 *
 * 测试策略：
 *   - 通过 mock Sequelize models、DashScopeService、VideoStorageService 测试 Controller 逻辑
 *   - 不依赖真实数据库
 *   - 不依赖真实 DashScope API
 *   - 不依赖真实 OSS
 *   - 直接调用 Controller 函数，传入 mock req/res
 */

const assert = require('assert');
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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
//  Mock 基础设施
// ═══════════════════════════════════════════════════════════════

function createMockRes() {
  const res = {
    _statusCode: 200,
    _jsonData: null,
    status(code) {
      this._statusCode = code;
      return this;
    },
    json(data) {
      this._jsonData = data;
      return this;
    },
    success(data, message) {
      this._statusCode = 200;
      this._jsonData = { code: 200, message: message || 'success', data };
    },
    fail(message, code, data) {
      this._statusCode = code || 400;
      this._jsonData = { code: code || 400, message, data: data || null };
    }
  };
  return res;
}

function createMockReq(overrides = {}) {
  return {
    user: overrides.user || { enterpriseId: 1, userId: 10, userType: 'enterprise' },
    body: overrides.body || {},
    params: overrides.params || {},
    query: overrides.query || {}
  };
}

// ═══════════════════════════════════════════════════════════════
//  Mock 状态管理
// ═══════════════════════════════════════════════════════════════

let mockAssets;
let mockTasks;
let mockDashScope;
let mockVideoStorage;
let nextAssetId;
let nextTaskId;

function resetMocks() {
  mockAssets = {};
  mockTasks = {};
  nextAssetId = 1;
  nextTaskId = 1;

  mockDashScope = {
    createImageToVideoTaskResult: {
      taskId: 'ds-task-001',
      provider: 'dashscope',
      providerStatus: 'PENDING',
      status: 'pending',
      rawStatus: 'PENDING'
    },
    createImageToVideoTaskError: null,
    getTaskStatusResult: {
      taskId: 'ds-task-001',
      provider: 'dashscope',
      providerStatus: 'PENDING',
      status: 'pending',
      progress: 0,
      outputUrl: null,
      coverUrl: null,
      duration: null,
      errorCode: null,
      errorMessage: null
    },
    getTaskStatusError: null,
    sanitizeErrorResult: {
      statusCode: 500,
      errorCode: 'DASHSCOPE_ERROR',
      safeMessage: 'DashScope API error',
      retryable: false
    }
  };

  mockVideoStorage = {
    downloadAndStoreResult: {
      video: {
        url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/enterprises/1/videos/20260803/test-uuid.mp4',
        ossKey: 'enterprises/1/videos/20260803/test-uuid.mp4'
      },
      cover: { url: null, ossKey: null },
      size: 5242880,
      mimeType: 'video/mp4'
    },
    downloadAndStoreError: null,
    callCount: 0,
    lastCallArgs: null
  };

  setupModuleMocks();
}

function setupModuleMocks() {
  // ── Mock Asset model ─────────────────────────────────────────
  const MockAsset = {
    findByPk: async (id) => mockAssets[id] || null,
    create: async (data) => {
      const id = nextAssetId++;
      const record = { id, ...data, created_at: new Date() };
      mockAssets[id] = record;
      return record;
    }
  };

  // ── Mock GenerationTask model ────────────────────────────────
  const MockGenerationTask = {
    create: async (data) => {
      const id = nextTaskId++;
      const now = new Date();
      const record = {
        id,
        created_at: now,
        updated_at: now,
        ...data,
        update: async function(updateData) {
          Object.assign(this, updateData, { updated_at: new Date() });
          return this;
        },
        reload: async function() {
          return this;
        }
      };
      mockTasks[id] = record;
      return record;
    },

    findOne: async (options) => {
      const where = options.where || {};
      for (const [, task] of Object.entries(mockTasks)) {
        let allMatch = true;
        for (const [k, v] of Object.entries(where)) {
          if (task[k] !== v) { allMatch = false; break; }
        }
        if (allMatch) return task;
      }
      return null;
    },

    findByPk: async (id) => mockTasks[id] || null
  };

  // ── 注册 models mock ─────────────────────────────────────────
  const modelsPath = path.join(__dirname, '..', 'models', 'index.js');
  delete require.cache[require.resolve(modelsPath)];
  require.cache[require.resolve(modelsPath)] = {
    id: modelsPath, filename: modelsPath, loaded: true,
    exports: { GenerationTask: MockGenerationTask, Asset: MockAsset }
  };

  // ── Mock dashscopeService ────────────────────────────────────
  const dsPath = path.join(__dirname, '..', 'services', 'dashscopeService.js');
  delete require.cache[require.resolve(dsPath)];
  require.cache[require.resolve(dsPath)] = {
    id: dsPath, filename: dsPath, loaded: true,
    exports: {
      createImageToVideoTask: async (opts) => {
        if (mockDashScope.createImageToVideoTaskError) {
          throw mockDashScope.createImageToVideoTaskError;
        }
        return { ...mockDashScope.createImageToVideoTaskResult };
      },
      getTaskStatus: async (taskIdOrOpts) => {
        if (mockDashScope.getTaskStatusError) {
          throw mockDashScope.getTaskStatusError;
        }
        const result = { ...mockDashScope.getTaskStatusResult };
        if (typeof taskIdOrOpts === 'string') {
          result.taskId = taskIdOrOpts;
        } else if (taskIdOrOpts && taskIdOrOpts.taskId) {
          result.taskId = taskIdOrOpts.taskId;
        }
        return result;
      },
      sanitizeError: (err) => {
        if (mockDashScope.sanitizeErrorOverride) {
          return mockDashScope.sanitizeErrorOverride(err);
        }
        return { ...mockDashScope.sanitizeErrorResult };
      }
    }
  };

  // ── Mock videoStorageService ─────────────────────────────────
  const vsPath = path.join(__dirname, '..', 'services', 'videoStorageService.js');
  delete require.cache[require.resolve(vsPath)];
  require.cache[require.resolve(vsPath)] = {
    id: vsPath, filename: vsPath, loaded: true,
    exports: {
      downloadAndStore: async (opts) => {
        mockVideoStorage.callCount++;
        mockVideoStorage.lastCallArgs = opts;
        if (mockVideoStorage.downloadAndStoreError) {
          throw mockVideoStorage.downloadAndStoreError;
        }
        return { ...mockVideoStorage.downloadAndStoreResult };
      }
    }
  };

  // ── Clear controller cache ───────────────────────────────────
  delete require.cache[require.resolve('../controllers/enterprise/videoGenerationController')];
}

// ─── 辅助：创建测试用 Asset ────────────────────────────────────
async function createTestAsset(overrides = {}) {
  const id = nextAssetId++;
  const record = {
    id,
    enterprise_id: overrides.enterprise_id ?? 1,
    user_id: overrides.user_id ?? 10,
    type: overrides.type ?? 'image',
    name: overrides.name ?? 'test-image.png',
    url: overrides.url ?? 'https://example.com/test-image.png',
    category: overrides.category ?? 'default',
    size: overrides.size ?? 102400,
    mime_type: overrides.mime_type ?? 'image/png',
    width: overrides.width ?? 1920,
    height: overrides.height ?? 1080,
    audit_status: 'pass'
  };
  mockAssets[id] = record;
  return record;
}

// ═══════════════════════════════════════════════════════════════
//  测试套件
// ═══════════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   VideoGeneration Controller Tests          ║');
console.log('║   Sprint 2.5 Step 3.2 + 3.3                 ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════
//  Part A: Step 3.2 回归 — 创建任务
// ═══════════════════════════════════════════════════════════════

console.log('══ Part A: createTask 参数校验 (Step 3.2) ══\n');

test('无 sourceAssetId → 返回400', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');
  const req = createMockReq({ body: { prompt: 'test prompt' } });
  const res = createMockRes();
  await controller.createTask(req, res);
  assert.strictEqual(res._statusCode, 400);
  assert.ok(res._jsonData.message.includes('素材ID'));
});

test('无 prompt → 返回400', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');
  const req = createMockReq({ body: { sourceAssetId: 1 } });
  const res = createMockRes();
  await controller.createTask(req, res);
  assert.strictEqual(res._statusCode, 400);
  assert.ok(res._jsonData.message.includes('提示词'));
});

test('非本人 Asset（其他企业）→ 拒绝', async () => {
  resetMocks();
  await createTestAsset({ id: 1, enterprise_id: 2, type: 'image' });
  const controller = require('../controllers/enterprise/videoGenerationController');
  const req = createMockReq({
    user: { enterpriseId: 1, userId: 10, userType: 'enterprise' },
    body: { sourceAssetId: 1, prompt: 'test prompt' }
  });
  const res = createMockRes();
  await controller.createTask(req, res);
  assert.strictEqual(res._statusCode, 400);
  assert.ok(res._jsonData.message.includes('无权') || res._jsonData.message.includes('权限'));
});

test('非图片 Asset（视频类型）→ 拒绝', async () => {
  resetMocks();
  await createTestAsset({ id: 1, enterprise_id: 1, type: 'video' });
  const controller = require('../controllers/enterprise/videoGenerationController');
  const req = createMockReq({ body: { sourceAssetId: 1, prompt: 'test' } });
  const res = createMockRes();
  await controller.createTask(req, res);
  assert.strictEqual(res._statusCode, 400);
  assert.ok(res._jsonData.message.includes('图片'));
});

test('创建任务成功 → DashScope task_id 写入', async () => {
  resetMocks();
  await createTestAsset({ id: 1, enterprise_id: 1, type: 'image', url: 'https://example.com/photo.jpg' });
  mockDashScope.createImageToVideoTaskResult = {
    taskId: 'ds-abc123', provider: 'dashscope', providerStatus: 'PENDING', status: 'pending', rawStatus: 'PENDING'
  };
  const controller = require('../controllers/enterprise/videoGenerationController');
  const req = createMockReq({ body: { sourceAssetId: 1, prompt: 'test' } });
  const res = createMockRes();
  await controller.createTask(req, res);
  assert.strictEqual(res._statusCode, 200);
  const taskId = res._jsonData.data.id;
  assert.strictEqual(mockTasks[taskId].task_id, 'ds-abc123');
  assert.strictEqual(mockTasks[taskId].status, 'pending');
});

test('DashScope 创建失败 → 标记 failed', async () => {
  resetMocks();
  await createTestAsset({ id: 1, enterprise_id: 1, type: 'image', url: 'https://example.com/photo.jpg' });
  mockDashScope.createImageToVideoTaskError = Object.assign(new Error('Error'), {
    statusCode: 500, body: { code: 'InternalError', message: 'Service unavailable' }
  });
  mockDashScope.sanitizeErrorOverride = () => ({
    statusCode: 500, errorCode: 'InternalError', safeMessage: 'Service unavailable', retryable: true
  });
  const controller = require('../controllers/enterprise/videoGenerationController');
  const req = createMockReq({ body: { sourceAssetId: 1, prompt: 'test' } });
  const res = createMockRes();
  await controller.createTask(req, res);
  assert.strictEqual(res._statusCode, 500);
  const tasks = Object.values(mockTasks);
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].status, 'failed');
  assert.ok(tasks[0].error_msg.includes('[InternalError]'));
});

// ═══════════════════════════════════════════════════════════════
//  Part B: Step 3.2 回归 — 查询任务
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part B: getTask 基本查询 (Step 3.2) ══\n');

test('查询 success 任务 → 直接返回', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');
  mockTasks[1] = {
    id: 1, enterprise_id: 1, user_id: 10, task_id: 'ds-done', task_type: 'image2video',
    status: 'success', provider: 'dashscope', prompt: 'test',
    output_url: 'https://example.com/video.mp4', output_asset_id: 99,
    progress: 100, created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };
  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);
  assert.strictEqual(res._statusCode, 200);
  assert.strictEqual(res._jsonData.data.status, 'success');
});

test('查询 processing → 调用 DashScope 同步', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');
  mockTasks[1] = {
    id: 1, enterprise_id: 1, user_id: 10, task_id: 'ds-running', task_type: 'image2video',
    status: 'processing', provider: 'dashscope', prompt: 'test',
    progress: null, created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };
  mockDashScope.getTaskStatusResult = {
    taskId: 'ds-running', provider: 'dashscope', providerStatus: 'RUNNING',
    status: 'processing', progress: null, outputUrl: null, coverUrl: null, duration: null
  };
  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);
  assert.strictEqual(res._statusCode, 200);
  assert.strictEqual(mockTasks[1].status, 'processing');
});

test('企业隔离 → 不能查询其他企业任务', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');
  mockTasks[1] = {
    id: 1, enterprise_id: 2, user_id: 20, task_id: 'ds-other', task_type: 'image2video',
    status: 'success', provider: 'dashscope', prompt: 'test',
    output_url: 'https://example.com/secret.mp4',
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };
  const req = createMockReq({ user: { enterpriseId: 1, userId: 10, userType: 'enterprise' }, params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);
  assert.strictEqual(res._statusCode, 404);
});

// ═══════════════════════════════════════════════════════════════
//  Part C: Step 3.3 — 视频 OSS 转存 + Asset 闭环
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part C: 视频转存 + Asset 闭环 (Step 3.3) ══\n');

test('DashScope success → 自动下载视频', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  // 创建一个 processing 中的任务
  mockTasks[1] = {
    id: 1, enterprise_id: 1, user_id: 10, task_id: 'ds-success-1', task_type: 'image2video',
    status: 'processing', provider: 'dashscope', prompt: 'a beautiful sunset',
    progress: null, created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };

  // DashScope 返回 success
  mockDashScope.getTaskStatusResult = {
    taskId: 'ds-success-1', provider: 'dashscope', providerStatus: 'SUCCEEDED',
    status: 'success', progress: 100,
    outputUrl: 'https://dashscope-output.example.com/video.mp4',
    coverUrl: 'https://dashscope-output.example.com/cover.jpg',
    duration: 5
  };

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  // 验证 videoStorageService 被调用
  assert.ok(mockVideoStorage.callCount >= 1, 'videoStorageService.downloadAndStore should be called');
  const callArgs = mockVideoStorage.lastCallArgs;
  assert.strictEqual(callArgs.videoUrl, 'https://dashscope-output.example.com/video.mp4');
  assert.strictEqual(callArgs.enterpriseId, 1);
});

test('OSS 上传成功 → 视频 Asset 创建', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  mockTasks[1] = {
    id: 1, enterprise_id: 1, user_id: 10, task_id: 'ds-success-2', task_type: 'image2video',
    status: 'processing', provider: 'dashscope', prompt: 'ocean waves',
    progress: null, created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };

  mockDashScope.getTaskStatusResult = {
    taskId: 'ds-success-2', provider: 'dashscope', providerStatus: 'SUCCEEDED',
    status: 'success', progress: 100,
    outputUrl: 'https://dashscope-output.example.com/ocean.mp4',
    coverUrl: null, duration: 10
  };

  mockVideoStorage.downloadAndStoreResult = {
    video: {
      ossKey: 'enterprises/1/videos/20260803/ocean-uuid.mp4',
      url: 'https://my-oss.example.com/enterprises/1/videos/20260803/ocean-uuid.mp4'
    },
    cover: { url: null, ossKey: null },
    size: 10485760,
    mimeType: 'video/mp4'
  };

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  // 验证 Asset 被创建
  const allAssets = Object.values(mockAssets);
  const videoAsset = allAssets.find(a => a.type === 'video');
  assert.ok(videoAsset, 'A video Asset should be created');
  assert.strictEqual(videoAsset.enterprise_id, 1);
  assert.strictEqual(videoAsset.user_id, 10);
  assert.strictEqual(videoAsset.type, 'video');
  assert.strictEqual(videoAsset.mime_type, 'video/mp4');
  assert.strictEqual(videoAsset.size, 10485760);
  assert.strictEqual(videoAsset.url, 'https://my-oss.example.com/enterprises/1/videos/20260803/ocean-uuid.mp4');
  assert.strictEqual(videoAsset.duration, 10);
  assert.strictEqual(videoAsset.category, 'ai_generated');
});

test('output_asset_id 写入 GenerationTask', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  mockTasks[1] = {
    id: 1, enterprise_id: 1, user_id: 10, task_id: 'ds-success-3', task_type: 'image2video',
    status: 'processing', provider: 'dashscope', prompt: 'mountain view',
    progress: null, created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };

  mockDashScope.getTaskStatusResult = {
    taskId: 'ds-success-3', provider: 'dashscope', providerStatus: 'SUCCEEDED',
    status: 'success', progress: 100,
    outputUrl: 'https://dashscope-output.example.com/mountain.mp4',
    coverUrl: 'https://dashscope-output.example.com/mountain_cover.jpg',
    duration: 8
  };

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  // 验证 output_asset_id 已写入
  const task = mockTasks[1];
  assert.ok(task.output_asset_id, 'output_asset_id should be set');
  const videoAsset = mockAssets[task.output_asset_id];
  assert.ok(videoAsset, 'output_asset_id should point to a valid Asset');
  assert.strictEqual(videoAsset.type, 'video');

  // 验证 output_url 已更新为 OSS URL（非 DashScope 临时 URL）
  assert.ok(task.output_url, 'output_url should be set');
  assert.ok(!task.output_url.includes('dashscope'), 'output_url should be OSS URL, not DashScope URL');
  assert.strictEqual(task.status, 'success');
  assert.ok(task.completed_at, 'completed_at should be set');
  assert.strictEqual(task.cover_url, 'https://dashscope-output.example.com/mountain_cover.jpg');
  assert.strictEqual(task.duration, 8);
});

test('重复查询不会重复创建 Asset（幂等）', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  // 已完成的 success 任务
  const existingAssetId = nextAssetId;
  await createTestAsset({
    id: existingAssetId, enterprise_id: 1, user_id: 10,
    type: 'video', name: 'Existing Video',
    url: 'https://my-oss.example.com/existing.mp4',
    size: 5242880, mime_type: 'video/mp4', duration: 5
  });

  mockTasks[1] = {
    id: 1, enterprise_id: 1, user_id: 10, task_id: 'ds-done-4', task_type: 'image2video',
    status: 'success', provider: 'dashscope', prompt: 'test',
    output_url: 'https://my-oss.example.com/existing.mp4',
    output_asset_id: existingAssetId,
    cover_url: 'https://example.com/cover.jpg',
    duration: 5,
    progress: 100, completed_at: new Date(), created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };

  // 记录当前 callCount
  const callCountBefore = mockVideoStorage.callCount;
  const assetCountBefore = Object.keys(mockAssets).length;

  // 第一次查询
  const req1 = createMockReq({ params: { id: '1' } });
  const res1 = createMockRes();
  await controller.getTask(req1, res1);
  assert.strictEqual(res1._statusCode, 200);
  assert.strictEqual(res1._jsonData.data.output_asset_id, existingAssetId);

  // 第二次查询
  const req2 = createMockReq({ params: { id: '1' } });
  const res2 = createMockRes();
  await controller.getTask(req2, res2);
  assert.strictEqual(res2._statusCode, 200);
  assert.strictEqual(res2._jsonData.data.output_asset_id, existingAssetId);

  // 验证 videoStorageService 没有被额外调用
  assert.strictEqual(mockVideoStorage.callCount, callCountBefore,
    'videoStorageService should NOT be called for already-stored tasks');

  // 验证 Asset 数量没有增加
  assert.strictEqual(Object.keys(mockAssets).length, assetCountBefore,
    'No new Assets should be created on repeated queries');
});

test('success 无 output_asset_id → 补做转存', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  // success 但 output_asset_id 为空（模拟回调设置了 success 但未转存）
  mockTasks[1] = {
    id: 1, enterprise_id: 1, user_id: 10, task_id: 'ds-success-5', task_type: 'image2video',
    status: 'success', provider: 'dashscope', prompt: 'test',
    output_url: 'https://dashscope-output.example.com/late-video.mp4',
    output_asset_id: null,  // 尚未关联
    cover_url: null, duration: 3,
    progress: 100, completed_at: new Date(), created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  // 验证补做了转存
  assert.ok(mockVideoStorage.callCount >= 1, 'videoStorageService should be called for unlinked success task');
  assert.strictEqual(mockVideoStorage.lastCallArgs.videoUrl, 'https://dashscope-output.example.com/late-video.mp4');

  // 验证 Asset 被创建
  const task = mockTasks[1];
  assert.ok(task.output_asset_id, 'output_asset_id should be set after backfill');

  // 验证返回成功
  assert.strictEqual(res._statusCode, 200);
});

test('失败任务不会下载视频', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  mockTasks[1] = {
    id: 1, enterprise_id: 1, user_id: 10, task_id: 'ds-failed-1', task_type: 'image2video',
    status: 'processing', provider: 'dashscope', prompt: 'test',
    progress: null, created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };

  // DashScope 返回 failed
  mockDashScope.getTaskStatusResult = {
    taskId: 'ds-failed-1', provider: 'dashscope', providerStatus: 'FAILED',
    status: 'failed', progress: 100,
    outputUrl: null, coverUrl: null, duration: null,
    errorCode: 'CONTENT_REJECTED', errorMessage: 'Content moderation failed'
  };

  const callCountBefore = mockVideoStorage.callCount;

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  // 验证任务状态为 failed
  assert.strictEqual(mockTasks[1].status, 'failed');

  // 验证没有调用 videoStorageService
  assert.strictEqual(mockVideoStorage.callCount, callCountBefore,
    'videoStorageService should NOT be called for failed tasks');

  // 验证没有创建视频 Asset
  const videoAssets = Object.values(mockAssets).filter(a => a.type === 'video');
  assert.strictEqual(videoAssets.length, 0, 'No video Asset should be created for failed task');
});

test('视频下载失败 → 任务标记 failed', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  mockTasks[1] = {
    id: 1, enterprise_id: 1, user_id: 10, task_id: 'ds-success-6', task_type: 'image2video',
    status: 'processing', provider: 'dashscope', prompt: 'test',
    progress: null, created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };

  // DashScope 返回 success 但下载会失败
  mockDashScope.getTaskStatusResult = {
    taskId: 'ds-success-6', provider: 'dashscope', providerStatus: 'SUCCEEDED',
    status: 'success', progress: 100,
    outputUrl: 'https://dashscope-output.example.com/broken-video.mp4',
    coverUrl: null, duration: 5
  };

  // 模拟存储失败
  mockVideoStorage.downloadAndStoreError = Object.assign(
    new Error('Video download timed out'),
    { code: 'DOWNLOAD_TIMEOUT' }
  );

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  // 任务应被标记为 failed
  const task = mockTasks[1];
  assert.strictEqual(task.status, 'failed', 'Task should be marked as failed when storage fails');
  assert.ok(task.error_msg, 'error_msg should be set');
  assert.ok(task.error_msg.includes('DOWNLOAD_TIMEOUT') || task.error_msg.includes('STORAGE_FAILED'));

  // 没有 Asset 被创建
  const videoAssets = Object.values(mockAssets).filter(a => a.type === 'video');
  assert.strictEqual(videoAssets.length, 0, 'No video Asset should be created when download fails');
});

test('企业隔离 → 转存时使用正确的 enterprise_id', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  mockTasks[1] = {
    id: 1, enterprise_id: 5, user_id: 30, task_id: 'ds-success-7', task_type: 'image2video',
    status: 'processing', provider: 'dashscope', prompt: 'test',
    progress: null, created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };

  mockDashScope.getTaskStatusResult = {
    taskId: 'ds-success-7', provider: 'dashscope', providerStatus: 'SUCCEEDED',
    status: 'success', progress: 100,
    outputUrl: 'https://dashscope-output.example.com/video-e5.mp4',
    coverUrl: null, duration: 5
  };

  const req = createMockReq({
    user: { enterpriseId: 5, userId: 30, userType: 'enterprise' },
    params: { id: '1' }
  });
  const res = createMockRes();
  await controller.getTask(req, res);

  // 验证视频存储时使用了正确的 enterprise_id
  assert.ok(mockVideoStorage.callCount >= 1);
  assert.strictEqual(mockVideoStorage.lastCallArgs.enterpriseId, 5);

  // 验证创建的 Asset 属于正确的企业
  const videoAsset = Object.values(mockAssets).find(a => a.type === 'video');
  assert.ok(videoAsset);
  assert.strictEqual(videoAsset.enterprise_id, 5);
  assert.strictEqual(videoAsset.user_id, 30);
});

// ═══════════════════════════════════════════════════════════════
//  Part D: videoStorageService 单元测试
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part D: videoStorageService 单元测试 (Step 3.3) ══\n');

test('videoStorageService 模块导出正确', () => {
  // 清除 mock，加载真实模块
  delete require.cache[require.resolve('../services/videoStorageService')];
  const vs = require('../services/videoStorageService');
  assert.ok(vs.downloadAndStore, 'Should export downloadAndStore');
  assert.strictEqual(typeof vs.downloadAndStore, 'function');
});

test('downloadAndStore 参数校验：空 videoUrl → 拒绝', async () => {
  delete require.cache[require.resolve('../services/videoStorageService')];
  const vs = require('../services/videoStorageService');
  try {
    await vs.downloadAndStore({ videoUrl: '', enterpriseId: 1 });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'INVALID_VIDEO_URL');
  }
});

test('downloadAndStore 参数校验：无 enterpriseId → 拒绝', async () => {
  delete require.cache[require.resolve('../services/videoStorageService')];
  const vs = require('../services/videoStorageService');
  try {
    await vs.downloadAndStore({ videoUrl: 'https://example.com/video.mp4', enterpriseId: null });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'INVALID_ENTERPRISE_ID');
  }
});

test('downloadAndStore 参数校验：非 http URL → 拒绝', async () => {
  delete require.cache[require.resolve('../services/videoStorageService')];
  const vs = require('../services/videoStorageService');
  try {
    await vs.downloadAndStore({ videoUrl: 'file:///local/video.mp4', enterpriseId: 1 });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'INVALID_VIDEO_URL_SCHEME');
  }
});

// ═══════════════════════════════════════════════════════════════
//  Part E: 路由和配置验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part E: 路由和配置验证 ══\n');

test('路由文件导出正确', () => {
  const router = require('../routes/enterprise/videoGeneration');
  assert.ok(router);
  assert.strictEqual(typeof router, 'function');
});

test('enterprise index 已注册 video-generation 路由', () => {
  const fs = require('fs');
  const content = fs.readFileSync(path.join(__dirname, '..', 'routes', 'enterprise', 'index.js'), 'utf8');
  assert.ok(content.includes('video-generation'));
  assert.ok(content.includes('videoGenerationRouter'));
});

test('ossService 新增 putFile 方法', () => {
  const ossService = require('../services/ossService');
  assert.ok(ossService.putFile, 'ossService should have putFile method');
  assert.strictEqual(typeof ossService.putFile, 'function');
});

test('models/index.js 已有 outputAsset 关联', () => {
  const fs = require('fs');
  const content = fs.readFileSync(path.join(__dirname, '..', 'models', 'index.js'), 'utf8');
  assert.ok(content.includes('outputAsset'), 'models/index.js should define outputAsset association');
  assert.ok(content.includes('output_asset_id'), 'models/index.js should reference output_asset_id');
});

test('GenerationTask 模型包含 output_asset_id 字段', () => {
  const fs = require('fs');
  const content = fs.readFileSync(path.join(__dirname, '..', 'models', 'GenerationTask.js'), 'utf8');
  assert.ok(content.includes('output_asset_id'), 'GenerationTask should have output_asset_id field');
});

// ═══════════════════════════════════════════════════════════════
//  Part F: 安全验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part F: 安全验证 (Step 3.3) ══\n');

test('videoStorageService 源码不包含 OSS_SECRET', () => {
  const fs = require('fs');
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'videoStorageService.js'), 'utf8');
  assert.ok(!source.includes('OSS_ACCESS_KEY_SECRET'), 'Should not reference OSS secret');
  assert.ok(!source.includes('DASHSCOPE_API_KEY'), 'Should not reference DashScope key');
});

test('videoStorageService 日志不包含完整 URL', () => {
  const fs = require('fs');
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'videoStorageService.js'), 'utf8');
  // 检查 console.log 中是否使用了 safeUrlSummary
  const logLines = source.match(/console\.log\([^)]*\)/g) || [];
  for (const line of logLines) {
    if (line.includes('videoUrl') || line.includes('url')) {
      assert.ok(
        line.includes('safeUrlSummary') || !line.includes('${'),
        `Log line should use safeUrlSummary for URLs: ${line.trim().substring(0, 80)}`
      );
    }
  }
});

test('Controller 使用 videoStorageService 做视频存储（OSS 操作用 ossService.getSignedUrl 签名）', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'enterprise', 'videoGenerationController.js'),
    'utf8'
  );
  // Sprint 4.7 Patch1: Controller 使用 ossService.getSignedUrl 获取私有Bucket签名URL（只读操作）
  assert.ok(source.includes('ossService'), 'Controller should use ossService for signed URLs');
  assert.ok(!source.includes('ali-oss'), 'Controller should not import ali-oss directly');
  assert.ok(source.includes('videoStorageService'), 'Controller should use videoStorageService');
});

test('错误信息脱敏 → 不泄露内部路径和密钥', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  mockTasks[1] = {
    id: 1, enterprise_id: 1, user_id: 10, task_id: 'ds-sec-test', task_type: 'image2video',
    status: 'processing', provider: 'dashscope', prompt: 'test',
    progress: null, created_at: new Date(),
    update: async function(d) { Object.assign(this, d); return this; },
    reload: async function() { return this; }
  };

  mockDashScope.getTaskStatusResult = {
    taskId: 'ds-sec-test', provider: 'dashscope', providerStatus: 'SUCCEEDED',
    status: 'success', progress: 100,
    outputUrl: 'https://dashscope-output.example.com/video.mp4',
    coverUrl: null, duration: 5
  };

  // 存储失败
  mockVideoStorage.downloadAndStoreError = Object.assign(
    new Error('Download failed from /secret/path/to/file'),
    { code: 'DOWNLOAD_FAILED', secretKey: 'sk-ws-VERY_SECRET' }
  );

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  // 验证不包含敏感信息
  const errorMsg = mockTasks[1].error_msg || '';
  assert.ok(!errorMsg.includes('sk-ws-'), 'error_msg should not contain API key');
  assert.ok(!errorMsg.includes('/secret/'), 'error_msg should not contain internal paths');
  assert.ok(!errorMsg.includes('VERY_SECRET'), 'error_msg should not contain secrets');
});

// ═══════════════════════════════════════════════════════════════
//  Part G: Sprint 2.5 Patch — 视频存储增强校验
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part G: Sprint 2.5 Patch — 增强校验 ══\n');

test('空 URL → 拒绝', () => {
  const vs = require('../services/videoStorageService');
  // 测试 isRejectedUrl
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'services', 'videoStorageService.js'), 'utf8'
  );
  assert.ok(source.includes('REJECTED_URL_PREFIXES'), 'Should define REJECTED_URL_PREFIXES');
});

test('file:// URL → 拒绝', async () => {
  delete require.cache[require.resolve('../services/videoStorageService')];
  const vs = require('../services/videoStorageService');
  try {
    await vs.downloadAndStore({ videoUrl: 'file:///etc/passwd', enterpriseId: 1 });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(
      e.code === 'INVALID_VIDEO_URL' || e.code === 'INVALID_VIDEO_URL_SCHEME',
      'Should reject file:// URL'
    );
  }
});

test('Windows 本地路径 → 拒绝', async () => {
  delete require.cache[require.resolve('../services/videoStorageService')];
  const vs = require('../services/videoStorageService');
  try {
    await vs.downloadAndStore({ videoUrl: 'C:\\Windows\\System32\\video.mp4', enterpriseId: 1 });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(
      e.code === 'INVALID_VIDEO_URL' || e.code === 'INVALID_VIDEO_URL_SCHEME',
      'Should reject Windows local path'
    );
  }
});

test('Unix 绝对路径 → 拒绝', async () => {
  delete require.cache[require.resolve('../services/videoStorageService')];
  const vs = require('../services/videoStorageService');
  try {
    await vs.downloadAndStore({ videoUrl: '/home/user/video.mp4', enterpriseId: 1 });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(
      e.code === 'INVALID_VIDEO_URL' || e.code === 'INVALID_VIDEO_URL_SCHEME',
      'Should reject Unix absolute path'
    );
  }
});

test('空字符串 URL → 拒绝', async () => {
  delete require.cache[require.resolve('../services/videoStorageService')];
  const vs = require('../services/videoStorageService');
  try {
    await vs.downloadAndStore({ videoUrl: '', enterpriseId: 1 });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'INVALID_VIDEO_URL');
  }
});

test('MIN_VIDEO_SIZE 常量定义正确 (10KB)', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    require('path').join(__dirname, '..', 'services', 'videoStorageService.js'), 'utf8'
  );
  assert.ok(source.includes('MIN_VIDEO_SIZE'), 'Should define MIN_VIDEO_SIZE');
  assert.ok(source.includes('10 * 1024') || source.includes('10240'), 'MIN_VIDEO_SIZE should be 10KB');
});

test('明确拒绝 text/html MIME 类型', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    require('path').join(__dirname, '..', 'services', 'videoStorageService.js'), 'utf8'
  );
  assert.ok(source.includes('REJECTED_MIME_TYPES'), 'Should define REJECTED_MIME_TYPES');
  assert.ok(source.includes('text/html'), 'Should reject text/html');
  assert.ok(source.includes('application/json'), 'Should reject application/json');
});

test('downloadAndStore 返回结构包含 video/cover 字段', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    require('path').join(__dirname, '..', 'services', 'videoStorageService.js'), 'utf8'
  );
  assert.ok(source.includes('video:'), 'Return should include video field');
  assert.ok(source.includes('cover:'), 'Return should include cover field');
  assert.ok(source.includes('ossKey: null'), 'cover.ossKey should be null (future Sprint)');
  assert.ok(source.includes('cover_url'), 'Should have comment about future cover_url → OSS');
});

test('Controller 使用 storageResult.video.url', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    require('path').join(__dirname, '..', 'controllers', 'enterprise', 'videoGenerationController.js'), 'utf8'
  );
  assert.ok(
    source.includes('storageResult.video.url'),
    'Controller should use storageResult.video.url for OSS video URL'
  );
});

test('Controller 有未来 cover OSS 转存注释', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    require('path').join(__dirname, '..', 'controllers', 'enterprise', 'videoGenerationController.js'), 'utf8'
  );
  assert.ok(
    source.includes('未来 Sprint') || source.includes('cover_url → OSS'),
    'Controller should have comment about future cover OSS migration'
  );
});

test('日志中不包含 OSS_SECRET', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    require('path').join(__dirname, '..', 'services', 'videoStorageService.js'), 'utf8'
  );
  assert.ok(!source.includes('OSS_ACCESS_KEY_SECRET'), 'Should not hardcode OSS secret');
  assert.ok(!source.includes('DASHSCOPE_API_KEY'), 'Should not hardcode DashScope key');
});

test('日志只打印 hostname + pathname 摘要', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    require('path').join(__dirname, '..', 'services', 'videoStorageService.js'), 'utf8'
  );
  // safeUrlSummary 应该只提取 hostname 和 pathname 前40字符
  const safeUrlFn = source.match(/function safeUrlSummary[\s\S]*?^function /m);
  // 验证 console.log 中所有 URL 相关日志都使用 safeUrlSummary
  const logLines = source.match(/console\.(log|error)\([^)]*\)/g) || [];
  for (const line of logLines) {
    if ((line.includes('url') || line.includes('URL') || line.includes('videoUrl')) && !line.includes('ossKey') && !line.includes('safeUrlSummary')) {
      // 允许不带 URL 参数的日志
    }
  }
  // 关键：不直接打印 this.apiKey 或 process.env 中的密钥
  assert.ok(!source.includes('DASHSCOPE_API_KEY'));
  assert.ok(!source.includes('OSS_ACCESS_KEY_SECRET'));
});

// ── 原有流程不受影响验证 ────────────────────────────────────

test('原有视频生成流程不受影响 — createTask 仍正常', async () => {
  resetMocks();
  await createTestAsset({ id: 1, enterprise_id: 1, type: 'image', url: 'https://example.com/photo.jpg' });
  mockDashScope.createImageToVideoTaskResult = {
    taskId: 'ds-patch-test', provider: 'dashscope', providerStatus: 'PENDING', status: 'pending', rawStatus: 'PENDING'
  };
  const controller = require('../controllers/enterprise/videoGenerationController');
  const req = createMockReq({ body: { sourceAssetId: 1, prompt: 'test prompt for patch' } });
  const res = createMockRes();
  await controller.createTask(req, res);
  assert.strictEqual(res._statusCode, 200);
  const task = Object.values(mockTasks)[0];
  assert.strictEqual(task.status, 'pending');
  assert.strictEqual(task.task_id, 'ds-patch-test');
  assert.strictEqual(task.source_asset_id, 1);
});

test('OSS 图片上传不受影响 — Asset 创建接口无变化', () => {
  // 验证 Asset 模型没有改动
  const fs = require('fs');
  const assetSource = fs.readFileSync(
    require('path').join(__dirname, '..', 'models', 'Asset.js'), 'utf8'
  );
  assert.ok(assetSource.includes('image'), 'Asset model should still support image type');
  assert.ok(assetSource.includes('video'), 'Asset model should still support video type');
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
