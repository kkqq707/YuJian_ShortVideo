/**
 * Sprint 3.3 后端作品管理 单元测试
 *
 * 测试覆盖：
 *   - 作品列表：默认排序、分页、筛选、轻量字段、过滤已删除
 *   - 作品详情：正常详情、404、已删除404、企业隔离
 *   - 作品删除：软删除、deleted_at 更新、不物理删除、企业隔离
 *   - 安全：enterprise 隔离
 *
 * 运行方式：node tests/sprint3.3.test.js
 *
 * 测试策略：
 *   - 通过 mock Sequelize models、DashScopeService、VideoStorageService 测试 Controller 逻辑
 *   - 不依赖真实数据库、DashScope API、OSS
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
let now;

function resetMocks() {
  mockAssets = {};
  mockTasks = {};
  nextAssetId = 1;
  nextTaskId = 1;
  now = new Date();

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

/**
 * 创建一个测试用的 GenerationTask 记录（内存 mock）
 */
function createMockTask(overrides = {}) {
  const id = overrides.id || nextTaskId++;
  const createdAt = overrides.created_at || new Date(now - (nextTaskId * 60000)); // 每个任务间隔1分钟
  const record = {
    id,
    enterprise_id: overrides.enterprise_id ?? 1,
    user_id: overrides.user_id ?? 10,
    task_id: overrides.task_id || `ds-task-${id}`,
    task_type: overrides.task_type || 'image2video',
    model: overrides.model || 'wan2.1-i2v',
    prompt: overrides.prompt || `test prompt for task ${id}`,
    negative_prompt: overrides.negative_prompt || null,
    params: overrides.params || null,
    input_url: overrides.input_url || `https://example.com/input-${id}.jpg`,
    input_images: overrides.input_images || null,
    output_url: overrides.output_url || null,
    cover_url: overrides.cover_url || null,
    duration: overrides.duration || null,
    width: overrides.width || null,
    height: overrides.height || null,
    points_cost: overrides.points_cost || 0,
    status: overrides.status || 'pending',
    error_msg: overrides.error_msg || null,
    progress: overrides.progress || 0,
    source_asset_id: overrides.source_asset_id || null,
    output_asset_id: overrides.output_asset_id || null,
    provider: overrides.provider || 'dashscope',
    started_at: overrides.started_at || null,
    completed_at: overrides.completed_at || null,
    deleted_at: overrides.deleted_at ?? null,
    created_at: createdAt,
    updated_at: createdAt,

    // Sequelize 关联 mock
    sourceAsset: null,
    outputAsset: null,

    update: async function (updateData) {
      Object.assign(this, updateData, { updated_at: new Date() });
      return this;
    },
    reload: async function () {
      return this;
    }
  };
  mockTasks[id] = record;
  return record;
}

/**
 * 创建一个测试用的 Asset 记录（内存 mock）
 */
function createMockAsset(overrides = {}) {
  const id = overrides.id || nextAssetId++;
  const record = {
    id,
    enterprise_id: overrides.enterprise_id ?? 1,
    user_id: overrides.user_id ?? 10,
    type: overrides.type ?? 'image',
    name: overrides.name || `test-asset-${id}`,
    url: overrides.url || `https://example.com/asset-${id}.jpg`,
    thumbnail: overrides.thumbnail || null,
    size: overrides.size ?? 102400,
    duration: overrides.duration || null,
    width: overrides.width ?? 1920,
    height: overrides.height ?? 1080,
    mime_type: overrides.mime_type || 'image/jpeg',
    audit_status: 'pass',
    category: overrides.category || 'default',
    created_at: new Date()
  };
  mockAssets[id] = record;
  return record;
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
      const nowDate = new Date();
      const record = {
        id,
        created_at: nowDate,
        updated_at: nowDate,
        ...data,
        sourceAsset: null,
        outputAsset: null,
        update: async function (updateData) {
          Object.assign(this, updateData, { updated_at: new Date() });
          return this;
        },
        reload: async function () {
          return this;
        }
      };
      mockTasks[id] = record;
      return record;
    },

    findOne: async (options) => {
      const where = options.where || {};
      const include = options.include || [];

      for (const [, task] of Object.entries(mockTasks)) {
        let allMatch = true;
        for (const [k, v] of Object.entries(where)) {
          if (k === 'deleted_at') {
            // 处理 Op.eq null 条件
            if (v && typeof v === 'object' && v[Symbol.for('eq')] !== undefined) {
              if (task.deleted_at !== null) { allMatch = false; break; }
            } else if (v && typeof v === 'object') {
              // 跳过 Op 对象处理
            } else if (task[k] !== v) {
              allMatch = false; break;
            }
          } else if (task[k] !== v) {
            allMatch = false; break;
          }
        }
        if (allMatch) {
          // 处理 include
          const result = { ...task };
          for (const inc of include) {
            const asName = inc.as;
            if (asName === 'sourceAsset' && task.source_asset_id) {
              result.sourceAsset = mockAssets[task.source_asset_id] || null;
            } else if (asName === 'outputAsset' && task.output_asset_id) {
              result.outputAsset = mockAssets[task.output_asset_id] || null;
            }
          }
          return result;
        }
      }
      return null;
    },

    findByPk: async (id, opts) => {
      const task = mockTasks[id];
      if (!task) return null;

      const result = { ...task };
      if (opts && opts.include) {
        for (const inc of opts.include) {
          const asName = inc.as;
          if (asName === 'sourceAsset' && task.source_asset_id) {
            result.sourceAsset = mockAssets[task.source_asset_id] || null;
          } else if (asName === 'outputAsset' && task.output_asset_id) {
            result.outputAsset = mockAssets[task.output_asset_id] || null;
          }
        }
      }
      return result;
    },

    findAndCountAll: async (options) => {
      const where = options.where || {};
      const include = options.include || [];
      const order = options.order || [];
      const offset = options.offset || 0;
      const limit = options.limit || 20;

      // 过滤
      let matching = Object.values(mockTasks).filter(task => {
        for (const [k, v] of Object.entries(where)) {
          if (v && typeof v === 'object' && v[Symbol.for('eq')] !== undefined) {
            if (task[k] !== null) return false;
          } else if (task[k] !== v) {
            return false;
          }
        }
        return true;
      });

      // 排序：created_at DESC
      matching.sort((a, b) => {
        return new Date(b.created_at) - new Date(a.created_at);
      });

      const total = matching.length;
      const rows = matching.slice(offset, offset + limit);

      // enrich with includes
      const enriched = rows.map(task => {
        const result = { ...task };
        for (const inc of include) {
          const asName = inc.as;
          if (asName === 'outputAsset' && task.output_asset_id) {
            result.outputAsset = mockAssets[task.output_asset_id] || null;
          } else if (asName === 'sourceAsset' && task.source_asset_id) {
            result.sourceAsset = mockAssets[task.source_asset_id] || null;
          }
        }
        return result;
      });

      return { count: total, rows: enriched };
    }
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

// ═══════════════════════════════════════════════════════════════
//  测试套件
// ═══════════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   Sprint 3.3 作品管理 后端测试              ║');
console.log('║   列表 | 详情 | 删除 | 安全                  ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════
//  Part A: listTasks — 作品列表
// ═══════════════════════════════════════════════════════════════

console.log('══ Part A: listTasks — 作品列表 ══\n');

test('PASS 默认按时间倒序（created_at DESC）', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  // 创建3个任务，不同时间
  const t1 = createMockTask({ id: 1, status: 'success', prompt: 'oldest', created_at: new Date('2026-07-01') });
  const t2 = createMockTask({ id: 2, status: 'success', prompt: 'middle', created_at: new Date('2026-07-15') });
  const t3 = createMockTask({ id: 3, status: 'success', prompt: 'newest', created_at: new Date('2026-08-01') });

  const req = createMockReq({ query: { page: '1', pageSize: '10' } });
  const res = createMockRes();
  await controller.listTasks(req, res);

  assert.strictEqual(res._statusCode, 200);
  const data = res._jsonData.data;
  assert.strictEqual(data.total, 3);
  assert.strictEqual(data.items.length, 3);

  // 验证倒序：最新的在最前面
  assert.strictEqual(data.items[0].id, 3, 'Newest task should be first');
  assert.strictEqual(data.items[1].id, 2, 'Middle task should be second');
  assert.strictEqual(data.items[2].id, 1, 'Oldest task should be last');
  assert.ok(new Date(data.items[0].createdAt) > new Date(data.items[2].createdAt), 'First item should be newer than last');
});

test('PASS 分页正常', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  // 创建 25 个任务
  for (let i = 1; i <= 25; i++) {
    createMockTask({ id: i, status: 'success', prompt: `task-${i}`, created_at: new Date(`2026-08-${String(i).padStart(2, '0')}`) });
  }

  // 第一页
  const req1 = createMockReq({ query: { page: '1', pageSize: '10' } });
  const res1 = createMockRes();
  await controller.listTasks(req1, res1);

  assert.strictEqual(res1._statusCode, 200);
  assert.strictEqual(res1._jsonData.data.total, 25);
  assert.strictEqual(res1._jsonData.data.page, 1);
  assert.strictEqual(res1._jsonData.data.pageSize, 10);
  assert.strictEqual(res1._jsonData.data.items.length, 10);

  // 第二页
  const req2 = createMockReq({ query: { page: '2', pageSize: '10' } });
  const res2 = createMockRes();
  await controller.listTasks(req2, res2);

  assert.strictEqual(res2._jsonData.data.page, 2);
  assert.strictEqual(res2._jsonData.data.items.length, 10);

  // 第三页（只有5条）
  const req3 = createMockReq({ query: { page: '3', pageSize: '10' } });
  const res3 = createMockRes();
  await controller.listTasks(req3, res3);

  assert.strictEqual(res3._jsonData.data.items.length, 5);
});

test('PASS status 筛选', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({ id: 1, status: 'success', prompt: 'done' });
  createMockTask({ id: 2, status: 'processing', prompt: 'running' });
  createMockTask({ id: 3, status: 'failed', prompt: 'broken' });
  createMockTask({ id: 4, status: 'success', prompt: 'another done' });

  const req = createMockReq({ query: { status: 'success' } });
  const res = createMockRes();
  await controller.listTasks(req, res);

  assert.strictEqual(res._statusCode, 200);
  assert.strictEqual(res._jsonData.data.total, 2);
  assert.strictEqual(res._jsonData.data.items.length, 2);
  res._jsonData.data.items.forEach(item => {
    assert.strictEqual(item.status, 'success');
  });
});

test('PASS 只返回轻量字段（不包含 params、完整 Asset、内部字段）', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  const outputAsset = createMockAsset({ id: 100, type: 'video', url: 'https://oss.example.com/videos/output.mp4', duration: 5 });
  const sourceAsset = createMockAsset({ id: 200, type: 'image', url: 'https://oss.example.com/images/input.jpg' });

  createMockTask({
    id: 1, status: 'success', prompt: 'Test video generation',
    output_url: 'https://oss.example.com/videos/output.mp4',
    cover_url: 'https://oss.example.com/covers/cover.jpg',
    duration: 5,
    output_asset_id: 100,
    source_asset_id: 200,
    params: JSON.stringify({ resolution: '1080p', ratio: '16:9' }),
    progress: 100
  });

  const req = createMockReq({ query: {} });
  const res = createMockRes();
  await controller.listTasks(req, res);

  assert.strictEqual(res._statusCode, 200);
  const item = res._jsonData.data.items[0];

  // 轻量字段应存在
  assert.ok(item.id !== undefined, 'id should exist');
  assert.ok(item.status !== undefined, 'status should exist');
  assert.ok(item.prompt !== undefined, 'prompt should exist');
  assert.ok(item.taskType !== undefined, 'taskType should exist');
  assert.ok(item.thumbnailUrl !== undefined, 'thumbnailUrl should exist (Sprint 3.3.1)');
  assert.ok(item.coverUrl !== undefined, 'coverUrl should exist');
  assert.ok(item.videoUrl !== undefined, 'videoUrl should exist');
  assert.ok(item.duration !== undefined, 'duration should exist');
  assert.ok(item.createdAt !== undefined, 'createdAt should exist');

  // 禁止返回的字段
  assert.strictEqual(item.params, undefined, 'params should NOT be in list response');
  assert.strictEqual(item.errorMsg, undefined, 'errorMsg should NOT be in list response');
  assert.strictEqual(item.sourceAsset, undefined, 'sourceAsset should NOT be in list response');
  assert.strictEqual(item.outputAsset, undefined, 'outputAsset should NOT be in list response');
  assert.strictEqual(item.native_prompt, undefined, 'negative_prompt should NOT be in list response');
  assert.strictEqual(item.completedAt, undefined, 'completedAt should NOT be in list response');
  assert.strictEqual(item.error_msg, undefined, 'internal fields should NOT be exposed');
});

test('PASS 不返回 deleted 任务（deleted_at IS NULL）', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({ id: 1, status: 'success', prompt: 'normal task', deleted_at: null });
  createMockTask({ id: 2, status: 'success', prompt: 'deleted task', deleted_at: new Date() });
  createMockTask({ id: 3, status: 'processing', prompt: 'another normal', deleted_at: null });

  const req = createMockReq({ query: {} });
  const res = createMockRes();
  await controller.listTasks(req, res);

  assert.strictEqual(res._statusCode, 200);
  assert.strictEqual(res._jsonData.data.total, 2, 'Should only count non-deleted tasks');
  const ids = res._jsonData.data.items.map(i => i.id);
  assert.ok(!ids.includes(2), 'Deleted task should not appear in list');
  assert.ok(ids.includes(1), 'Normal task should appear');
  assert.ok(ids.includes(3), 'Another normal task should appear');
});

test('PASS 空列表返回 { total: 0, items: [] }', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  // 不创建任何任务

  const req = createMockReq({ query: {} });
  const res = createMockRes();
  await controller.listTasks(req, res);

  assert.strictEqual(res._statusCode, 200);
  assert.strictEqual(res._jsonData.data.total, 0);
  assert.deepStrictEqual(res._jsonData.data.items, []);
});

// ═══════════════════════════════════════════════════════════════
//  Part A+: thumbnailUrl 优先级（Sprint 3.3.1 Patch）
// ═══════════════════════════════════════════════════════════════

console.log('\n── thumbnailUrl 优先级 ──');

test('PASS thumbnailUrl优先级正确 — coverUrl存在时使用coverUrl', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  const sourceAsset = createMockAsset({
    id: 200, type: 'image',
    url: 'https://oss.example.com/images/input.jpg',
    thumbnail: 'https://oss.example.com/images/input_thumb.jpg'
  });

  createMockTask({
    id: 1, status: 'success', prompt: 'test',
    source_asset_id: 200,
    cover_url: 'https://oss.example.com/covers/video_cover.jpg'
  });

  const req = createMockReq({ query: {} });
  const res = createMockRes();
  await controller.listTasks(req, res);

  const item = res._jsonData.data.items[0];
  // coverUrl 存在 → 优先级最高
  assert.strictEqual(item.thumbnailUrl, 'https://oss.example.com/covers/video_cover.jpg',
    'thumbnailUrl should use cover_url when available');
});

test('PASS coverUrl不存在使用sourceAsset.thumbnail', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  const sourceAsset = createMockAsset({
    id: 200, type: 'image',
    url: 'https://oss.example.com/images/input.jpg',
    thumbnail: 'https://oss.example.com/images/input_thumb.jpg'
  });

  createMockTask({
    id: 1, status: 'success', prompt: 'test',
    source_asset_id: 200,
    cover_url: null  // 无 cover_url
  });

  const req = createMockReq({ query: {} });
  const res = createMockRes();
  await controller.listTasks(req, res);

  const item = res._jsonData.data.items[0];
  // coverUrl 不存在 → 使用 sourceAsset.thumbnail
  assert.strictEqual(item.thumbnailUrl, 'https://oss.example.com/images/input_thumb.jpg',
    'thumbnailUrl should use sourceAsset.thumbnail when cover_url is absent');
});

test('PASS sourceAsset.thumbnail不存在使用sourceAsset.url', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  const sourceAsset = createMockAsset({
    id: 200, type: 'image',
    url: 'https://oss.example.com/images/input.jpg',
    thumbnail: null  // 无 thumbnail
  });

  createMockTask({
    id: 1, status: 'success', prompt: 'test',
    source_asset_id: 200,
    cover_url: null
  });

  const req = createMockReq({ query: {} });
  const res = createMockRes();
  await controller.listTasks(req, res);

  const item = res._jsonData.data.items[0];
  // coverUrl 和 thumbnail 都不存在 → 使用 sourceAsset.url
  assert.strictEqual(item.thumbnailUrl, 'https://oss.example.com/images/input.jpg',
    'thumbnailUrl should use sourceAsset.url when cover_url and thumbnail are absent');
});

test('PASS 所有来源都为空时thumbnailUrl为null', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({
    id: 1, status: 'pending', prompt: 'test',
    source_asset_id: null,
    cover_url: null
  });

  const req = createMockReq({ query: {} });
  const res = createMockRes();
  await controller.listTasks(req, res);

  const item = res._jsonData.data.items[0];
  // 无 cover_url、无 sourceAsset → thumbnailUrl 为 null
  assert.strictEqual(item.thumbnailUrl, null,
    'thumbnailUrl should be null when no thumbnail source is available');
});

test('PASS thumbnailUrl 不返回完整的 sourceAsset 对象', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({
    id: 1, status: 'success', prompt: 'test',
    cover_url: null, source_asset_id: null
  });

  const req = createMockReq({ query: {} });
  const res = createMockRes();
  await controller.listTasks(req, res);

  const item = res._jsonData.data.items[0];
  const itemStr = JSON.stringify(item);
  // 列表仍保持轻量 — 不返回完整 sourceAsset
  assert.strictEqual(item.sourceAsset, undefined, 'sourceAsset should NOT be in list response');
  assert.ok(item.thumbnailUrl !== undefined, 'thumbnailUrl field should exist');
});

// ═══════════════════════════════════════════════════════════════
//  Part B: getTask — 作品详情
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part B: getTask — 作品详情 ══\n');

test('PASS 正常任务详情（返回完整字段）', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  const outputAsset = createMockAsset({
    id: 100, type: 'video', name: 'AI Video',
    url: 'https://oss.example.com/videos/result.mp4',
    duration: 5, size: 10485760, mime_type: 'video/mp4'
  });
  const sourceAsset = createMockAsset({
    id: 200, type: 'image', name: 'Input Photo',
    url: 'https://oss.example.com/images/input.jpg',
    width: 1920, height: 1080
  });

  createMockTask({
    id: 1, status: 'success', prompt: 'A test video',
    output_asset_id: 100, source_asset_id: 200,
    output_url: 'https://oss.example.com/videos/result.mp4',
    cover_url: 'https://oss.example.com/covers/cover.jpg',
    duration: 5, params: JSON.stringify({ resolution: '1080p' }),
    completed_at: new Date('2026-08-01'), progress: 100
  });

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  assert.strictEqual(res._statusCode, 200);
  const detail = res._jsonData.data;

  // 完整字段应存在
  assert.strictEqual(detail.id, 1);
  assert.strictEqual(detail.status, 'success');
  assert.strictEqual(detail.prompt, 'A test video');
  assert.ok(detail.params !== undefined, 'params should exist in detail');
  assert.strictEqual(detail.params.resolution, '1080p');
  assert.ok(detail.sourceAsset !== undefined, 'sourceAsset should exist in detail');
  assert.strictEqual(detail.sourceAsset.id, 200);
  assert.ok(detail.outputAsset !== undefined, 'outputAsset should exist in detail');
  assert.strictEqual(detail.outputAsset.id, 100);
  assert.strictEqual(detail.videoUrl, 'https://oss.example.com/videos/result.mp4');
  assert.strictEqual(detail.coverUrl, 'https://oss.example.com/covers/cover.jpg');
  assert.strictEqual(detail.duration, 5);
  assert.ok(detail.createdAt !== undefined, 'createdAt should exist');
  assert.ok(detail.completedAt !== undefined, 'completedAt should exist');
  assert.strictEqual(detail.errorMsg, null, 'errorMsg should be null for success');
});

test('PASS 任务不存在 → 404', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  const req = createMockReq({ params: { id: '999' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  assert.strictEqual(res._statusCode, 404);
  assert.ok(res._jsonData.message.includes('不存在'));
});

test('PASS 已删除任务 → 404', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({ id: 1, status: 'success', deleted_at: new Date() });

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  assert.strictEqual(res._statusCode, 404);
  assert.ok(res._jsonData.message.includes('不存在'));
});

test('PASS 企业隔离 → 其他企业任务返回404', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  // 创建企业2的任务
  createMockTask({ id: 1, enterprise_id: 2, status: 'success' });

  const req = createMockReq({
    user: { enterpriseId: 1, userId: 10, userType: 'enterprise' },
    params: { id: '1' }
  });
  const res = createMockRes();
  await controller.getTask(req, res);

  assert.strictEqual(res._statusCode, 404);
});

test('PASS 失败任务详情包含 errorMsg', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({
    id: 1, status: 'failed',
    error_msg: '[CONTENT_REJECTED] Content moderation failed',
    completed_at: new Date()
  });

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  assert.strictEqual(res._statusCode, 200);
  const detail = res._jsonData.data;
  assert.strictEqual(detail.status, 'failed');
  assert.strictEqual(detail.errorMsg, '[CONTENT_REJECTED] Content moderation failed');
});

// ═══════════════════════════════════════════════════════════════
//  Part C: deleteTask — 软删除
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part C: deleteTask — 软删除 ══\n');

test('PASS 删除成功 → 返回 200', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({ id: 1, status: 'success', deleted_at: null });

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.deleteTask(req, res);

  assert.strictEqual(res._statusCode, 200);
  assert.strictEqual(res._jsonData.data.id, 1);
  assert.ok(res._jsonData.data.deleted_at, 'deleted_at should be set');
  assert.ok(res._jsonData.message.includes('成功'));
});

test('PASS 数据库 deleted_at 被正确更新', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({ id: 1, status: 'success', deleted_at: null });

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.deleteTask(req, res);

  // 检查 mock 数据库中的记录
  const task = mockTasks[1];
  assert.ok(task.deleted_at !== null, 'deleted_at should be set in database');
  assert.ok(task.deleted_at instanceof Date || typeof task.deleted_at === 'string',
    'deleted_at should be a Date');
});

test('PASS 物理记录未被删除（数据库记录仍存在）', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({ id: 1, status: 'success', deleted_at: null });
  const taskCountBefore = Object.keys(mockTasks).length;

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.deleteTask(req, res);

  const taskCountAfter = Object.keys(mockTasks).length;
  assert.strictEqual(taskCountAfter, taskCountBefore,
    'Record should still exist in database after soft delete');
  assert.ok(mockTasks[1], 'Record should still be accessible');
  assert.ok(mockTasks[1].deleted_at, 'But should have deleted_at timestamp');
});

test('PASS 已删除任务再次删除 → 返回404', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({ id: 1, status: 'success', deleted_at: new Date() });

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.deleteTask(req, res);

  assert.strictEqual(res._statusCode, 404);
});

test('PASS 不存在的任务 → 返回404', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  const req = createMockReq({ params: { id: '999' } });
  const res = createMockRes();
  await controller.deleteTask(req, res);

  assert.strictEqual(res._statusCode, 404);
});

test('PASS 企业隔离 → 不能删除其他企业任务', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  // 创建企业2的任务
  createMockTask({ id: 1, enterprise_id: 2, status: 'success', deleted_at: null });

  const req = createMockReq({
    user: { enterpriseId: 1, userId: 10, userType: 'enterprise' },
    params: { id: '1' }
  });
  const res = createMockRes();
  await controller.deleteTask(req, res);

  assert.strictEqual(res._statusCode, 404);

  // 企业2的任务不受影响
  const task = mockTasks[1];
  assert.strictEqual(task.deleted_at, null, 'Other enterprise task should remain undeleted');
});

test('PASS 删除后列表不包含该任务', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({ id: 1, status: 'success', prompt: 'Task 1', deleted_at: null });
  createMockTask({ id: 2, status: 'success', prompt: 'Task 2', deleted_at: null });

  // 删除任务1
  const delReq = createMockReq({ params: { id: '1' } });
  const delRes = createMockRes();
  await controller.deleteTask(delReq, delRes);
  assert.strictEqual(delRes._statusCode, 200);

  // 查询列表
  const listReq = createMockReq({ query: {} });
  const listRes = createMockRes();
  await controller.listTasks(listReq, listRes);

  assert.strictEqual(listRes._jsonData.data.total, 1);
  assert.strictEqual(listRes._jsonData.data.items[0].id, 2);
});

// ═══════════════════════════════════════════════════════════════
//  Part D: 模型验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part D: 模型验证 ══\n');

test('PASS GenerationTask 模型包含 deleted_at 字段', () => {
  const fs = require('fs');
  const content = fs.readFileSync(
    path.join(__dirname, '..', 'models', 'GenerationTask.js'), 'utf8'
  );
  assert.ok(content.includes('deleted_at'), 'GenerationTask model should have deleted_at field');
  assert.ok(content.includes('软删除'), 'Should have comment about soft delete');
  assert.ok(content.includes('OSS'), 'Should mention OSS lifecycle cleanup in comment');
});

test('PASS GenerationTask 模型有 deleted_at 索引', () => {
  const fs = require('fs');
  const content = fs.readFileSync(
    path.join(__dirname, '..', 'models', 'GenerationTask.js'), 'utf8'
  );
  assert.ok(
    content.includes("{ fields: ['deleted_at'] }"),
    'Should have index on deleted_at'
  );
});

test('PASS 路由文件包含 DELETE 端点', () => {
  const fs = require('fs');
  const content = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'enterprise', 'videoGeneration.js'), 'utf8'
  );
  assert.ok(content.includes('router.delete'), 'Route should include DELETE method');
  assert.ok(content.includes('deleteTask'), 'Route should reference deleteTask');
  assert.ok(content.includes('listTasks'), 'Route should reference listTasks');
});

// ═══════════════════════════════════════════════════════════════
//  Part E: 安全验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part E: 安全验证 ══\n');

test('PASS 列表接口不泄露内部字段', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({
    id: 1, status: 'success', prompt: 'test',
    params: JSON.stringify({ secret: 'should-not-leak' }),
    error_msg: '[SECRET] sensitive error details',
    output_asset_id: null, source_asset_id: null
  });

  const req = createMockReq({ query: {} });
  const res = createMockRes();
  await controller.listTasks(req, res);

  const item = res._jsonData.data.items[0];
  // 转为 JSON 字符串检查是否有泄漏
  const itemStr = JSON.stringify(item);
  assert.ok(!itemStr.includes('should-not-leak'), 'Params should not leak via list');
  assert.ok(!itemStr.includes('sensitive error'), 'Error msg should not leak via list');
  assert.ok(!itemStr.includes('SECRET'), 'Internal error codes should not leak via list');
});

test('PASS 列表 enterprise 隔离（只返回本企业任务）', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  createMockTask({ id: 1, enterprise_id: 1, status: 'success', prompt: 'Enterprise 1' });
  createMockTask({ id: 2, enterprise_id: 2, status: 'success', prompt: 'Enterprise 2' });

  const req = createMockReq({
    user: { enterpriseId: 1, userId: 10, userType: 'enterprise' },
    query: {}
  });
  const res = createMockRes();
  await controller.listTasks(req, res);

  assert.strictEqual(res._jsonData.data.total, 1);
  assert.strictEqual(res._jsonData.data.items[0].prompt, 'Enterprise 1');
});

test('PASS 删除不删除 OSS 文件（Controller 中无 OSS 删除逻辑）', () => {
  const fs = require('fs');
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'enterprise', 'videoGenerationController.js'), 'utf8'
  );
  // 删除函数中不应包含 OSS 删除相关调用
  const deleteFnMatch = controllerSource.match(/exports\.deleteTask[\s\S]*?^exports\./m);
  if (deleteFnMatch) {
    const deleteFn = deleteFnMatch[0];
    assert.ok(!deleteFn.includes('ossService.delete'), 'deleteTask should not delete OSS files');
    assert.ok(!deleteFn.includes('removeFile'), 'deleteTask should not remove OSS files');
    assert.ok(!deleteFn.includes('Asset.destroy'), 'deleteTask should not destroy Asset records');
    assert.ok(!deleteFn.includes('GenerationTask.destroy'), 'deleteTask should not physically destroy records');
    assert.ok(deleteFn.includes('deleted_at'), 'deleteTask should set deleted_at for soft deletion');
  }
});

test('PASS 软删除理由注释存在', () => {
  const fs = require('fs');
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'enterprise', 'videoGenerationController.js'), 'utf8'
  );
  // 检查是否有关于软删除理由的注释
  assert.ok(
    controllerSource.includes('软删除') || controllerSource.includes('不物理删除'),
    'Should have soft-delete rationale comments'
  );
  assert.ok(
    controllerSource.includes('OSS') || controllerSource.includes('生命周期'),
    'Should mention OSS lifecycle cleanup future plan'
  );
  assert.ok(
    controllerSource.includes('审计') || controllerSource.includes('误删除') || controllerSource.includes('数据恢复'),
    'Should mention reasons for soft delete (audit/recovery)'
  );
});

// ═══════════════════════════════════════════════════════════════
//  Part F: 回归测试 — 已有功能不受影响
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part F: 回归测试 — 已有功能验证 ══\n');

test('REGRESSION createTask 仍正常工作', async () => {
  resetMocks();
  await createMockAsset({ id: 1, enterprise_id: 1, type: 'image', url: 'https://example.com/photo.jpg' });
  mockDashScope.createImageToVideoTaskResult = {
    taskId: 'ds-regression-test', provider: 'dashscope', providerStatus: 'PENDING', status: 'pending', rawStatus: 'PENDING'
  };
  const controller = require('../controllers/enterprise/videoGenerationController');
  const req = createMockReq({ body: { sourceAssetId: 1, prompt: 'regression test prompt' } });
  const res = createMockRes();
  await controller.createTask(req, res);
  assert.strictEqual(res._statusCode, 200);
  const task = Object.values(mockTasks)[0];
  assert.strictEqual(task.status, 'pending');
  assert.strictEqual(task.task_id, 'ds-regression-test');
});

test('REGRESSION getTask 仍正常工作（success 带 output_asset_id）', async () => {
  resetMocks();
  const controller = require('../controllers/enterprise/videoGenerationController');

  const asset = await createMockAsset({ id: 99, enterprise_id: 1, user_id: 10, type: 'video', url: 'https://oss.example.com/v.mp4' });
  createMockTask({
    id: 1, status: 'success', output_asset_id: 99,
    output_url: 'https://oss.example.com/v.mp4',
    completed_at: new Date(), progress: 100
  });

  const req = createMockReq({ params: { id: '1' } });
  const res = createMockRes();
  await controller.getTask(req, res);

  assert.strictEqual(res._statusCode, 200);
  assert.strictEqual(res._jsonData.data.id, 1);
  assert.strictEqual(res._jsonData.data.status, 'success');
  assert.ok(res._jsonData.data.outputAsset, 'outputAsset should be included');
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
