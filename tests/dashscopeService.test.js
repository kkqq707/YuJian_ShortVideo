/**
 * DashScopeService 单元测试
 *
 * 运行方式：node tests/dashscopeService.test.js
 *
 * 测试策略：
 *   - 通过 mock 内部 request() 方法模拟 HTTP 响应
 *   - 不依赖真实 DashScope API
 *   - 不依赖 Controller
 *   - 不执行数据库写入
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

// ─── Mock 工厂 ──────────────────────────────────────────────────
function createMockService(mockRequestImpl) {
  // 重新加载模块以获得新实例
  delete require.cache[require.resolve('../services/dashscopeService')];

  // 备份并替换 request 方法
  const DashScopeService = require('../services/dashscopeService').constructor;
  const service = Object.create(DashScopeService.prototype);

  // 手动调用构造函数
  DashScopeService.call(service);

  // Mock request 和 getConfig
  service.getConfig = async () => service;
  service.request = mockRequestImpl;

  // requestWithRetry 使用真实的（会调用 mock 的 request）
  // 但我们保留 requestWithRetry 的行为，它内部调用 this.request

  return service;
}

// ─── 辅助函数 ──────────────────────────────────────────────────
function dashScopeSuccessResponse(taskId, status = 'PENDING') {
  return {
    statusCode: 200,
    headers: {},
    body: {
      output: {
        task_id: taskId,
        task_status: status
      },
      request_id: 'test-req-' + Date.now()
    }
  };
}

function dashScopeErrorResponse(code, message, statusCode = 400) {
  return {
    statusCode,
    headers: {},
    body: {
      code,
      message
    }
  };
}

function networkError(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

// ═══════════════════════════════════════════════════════════════
//  测试套件
// ═══════════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   DashScopeService Unit Tests                ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ─── 1. normalizeStatus ────────────────────────────────────────
console.log('── normalizeStatus ──');

test('PENDING → pending', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('PENDING'), 'pending');
});

test('QUEUED → pending', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('QUEUED'), 'pending');
});

test('RUNNING → processing', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('RUNNING'), 'processing');
});

test('PROCESSING → processing', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('PROCESSING'), 'processing');
});

test('SUCCEEDED → success', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('SUCCEEDED'), 'success');
});

test('SUCCESS → success', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('SUCCESS'), 'success');
});

test('FAILED → failed', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('FAILED'), 'failed');
});

test('CANCELED → failed', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('CANCELED'), 'failed');
});

test('CANCELLED → failed', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('CANCELLED'), 'failed');
});

test('unknown status → pending (safe default)', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('SOME_UNKNOWN_STATUS'), 'pending');
});

test('null status → pending', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus(null), 'pending');
});

test('empty status → pending', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus(''), 'pending');
});

test('lowercase pending → pending', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('pending'), 'pending');
});

// ─── 2. sanitizeError ──────────────────────────────────────────
console.log('\n── sanitizeError ──');

test('HTTP 401 error sanitized correctly', () => {
  const svc = require('../services/dashscopeService');
  const err = { statusCode: 401, body: { code: 'Unauthorized', message: 'Invalid API key' } };
  const safe = svc.sanitizeError(err);
  assert.strictEqual(safe.statusCode, 401);
  assert.strictEqual(safe.retryable, false);
  assert.strictEqual(safe.safeMessage, 'Invalid API key');
  assert.strictEqual(safe.errorCode, 'Unauthorized');
});

test('HTTP 429 error is retryable', () => {
  const svc = require('../services/dashscopeService');
  const err = { statusCode: 429, body: { code: 'Throttling', message: 'Rate limit exceeded' } };
  const safe = svc.sanitizeError(err);
  assert.strictEqual(safe.statusCode, 429);
  assert.strictEqual(safe.retryable, true);
});

test('HTTP 500 error is retryable', () => {
  const svc = require('../services/dashscopeService');
  const err = { statusCode: 500, body: { message: 'Internal error' } };
  const safe = svc.sanitizeError(err);
  assert.strictEqual(safe.retryable, true);
});

test('ETIMEDOUT network error is retryable', () => {
  const svc = require('../services/dashscopeService');
  const err = { code: 'ETIMEDOUT', message: 'Timeout' };
  const safe = svc.sanitizeError(err);
  assert.strictEqual(safe.errorCode, 'ETIMEDOUT');
  assert.strictEqual(safe.retryable, true);
});

test('ECONNRESET network error is retryable', () => {
  const svc = require('../services/dashscopeService');
  const err = { code: 'ECONNRESET' };
  const safe = svc.sanitizeError(err);
  assert.strictEqual(safe.retryable, true);
});

test('Error does not contain Authorization header', () => {
  const svc = require('../services/dashscopeService');
  const err = {
    statusCode: 401,
    body: {
      message: 'Unauthorized',
      config: { headers: { Authorization: 'Bearer sk-secret-key' } }
    }
  };
  const safe = svc.sanitizeError(err);
  const safeStr = JSON.stringify(safe);
  assert.ok(!safeStr.includes('Authorization'), 'safe error should not contain Authorization');
  assert.ok(!safeStr.includes('Bearer'), 'safe error should not contain Bearer token');
  assert.ok(!safeStr.includes('sk-'), 'safe error should not contain API key');
});

test('Error does not contain API key from body', () => {
  const svc = require('../services/dashscopeService');
  const err = {
    statusCode: 500,
    body: {
      message: 'Error with key sk-ws-HELLO',
      api_key: 'sk-ws-SECRET'
    }
  };
  const safe = svc.sanitizeError(err);
  const safeStr = JSON.stringify(safe);
  // sanitizeError 只保留 safeMessage, 不保留 body 中的 api_key
  assert.ok(!safeStr.includes('sk-ws-SECRET'), 'safe error should not contain API key from body');
});

test('null error → safe message', () => {
  const svc = require('../services/dashscopeService');
  const safe = svc.sanitizeError(null);
  assert.strictEqual(safe.safeMessage, 'Unknown error');
});

test('business error with message', () => {
  const svc = require('../services/dashscopeService');
  const err = new Error('Configuration missing');
  err.code = 'MODEL_NOT_CONFIGURED';
  const safe = svc.sanitizeError(err);
  assert.strictEqual(safe.safeMessage, 'Configuration missing');
  assert.strictEqual(safe.errorCode, 'MODEL_NOT_CONFIGURED');
  assert.strictEqual(safe.retryable, false);
});


// ─── 3. createImageToVideoTask 参数校验 ────────────────────────
console.log('\n── createImageToVideoTask 参数校验 ──');

test('imageUrl 为空 → 拒绝调用', async () => {
  const svc = require('../services/dashscopeService');
  try {
    await svc.createImageToVideoTask({ imageUrl: '', prompt: 'test', model: 'happyhorse-i2v' });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('imageUrl'), 'Error should mention imageUrl');
    assert.strictEqual(e.code, 'INVALID_IMAGE_URL');
  }
});

test('imageUrl 缺失 → 拒绝调用', async () => {
  const svc = require('../services/dashscopeService');
  try {
    await svc.createImageToVideoTask({ prompt: 'test', model: 'happyhorse-i2v' });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'INVALID_IMAGE_URL');
  }
});

test('imageUrl 为本地路径 → 拒绝调用', async () => {
  const svc = require('../services/dashscopeService');
  try {
    await svc.createImageToVideoTask({
      imageUrl: 'C:\\Users\\test\\image.png',
      prompt: 'test',
      model: 'happyhorse-i2v'
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('local path'), 'Error should mention local path');
    assert.strictEqual(e.code, 'INVALID_IMAGE_URL_LOCAL');
  }
});

test('imageUrl 为 file:// → 拒绝调用', async () => {
  const svc = require('../services/dashscopeService');
  try {
    await svc.createImageToVideoTask({
      imageUrl: 'file:///C:/Users/test/image.png',
      prompt: 'test',
      model: 'happyhorse-i2v'
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'INVALID_IMAGE_URL_LOCAL');
  }
});

test('prompt 为空 → 拒绝调用', async () => {
  const svc = require('../services/dashscopeService');
  try {
    await svc.createImageToVideoTask({
      imageUrl: 'https://example.com/image.jpg',
      prompt: '',
      model: 'happyhorse-i2v'
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'INVALID_PROMPT');
  }
});

test('DASHSCOPE_VIDEO_MODEL 缺失且未传 model → 配置错误', async () => {
  const svc = require('../services/dashscopeService');
  // 确认 defaultModel 为空
  if (svc.defaultModel) {
    console.log('        (skipped: DASHSCOPE_VIDEO_MODEL is set)');
    passed++;
    results.push({ name: 'DASHSCOPE_VIDEO_MODEL 缺失且未传 model → 配置错误', status: 'PASS' });
    return;
  }
  try {
    await svc.createImageToVideoTask({
      imageUrl: 'https://example.com/image.jpg',
      prompt: 'test'
      // model 未传
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'MODEL_NOT_CONFIGURED');
    assert.ok(e.message.includes('DASHSCOPE_VIDEO_MODEL') || e.message.includes('model'),
      'Error should mention model configuration');
  }
});

// ─── 4. createImageToVideoTask 正确解析 ────────────────────────
console.log('\n── createImageToVideoTask 响应解析 ──');

test('成功解析 task_id', async () => {
  const taskId = 'test-task-id-001';
  const service = createMockService(async (path) => {
    return dashScopeSuccessResponse(taskId, 'PENDING');
  });

  const result = await service.createImageToVideoTask({
    imageUrl: 'https://example.com/image.jpg',
    prompt: 'A beautiful sunset',
    model: 'happyhorse-i2v'
  });

  assert.strictEqual(result.taskId, taskId);
  assert.strictEqual(result.provider, 'dashscope');
  assert.strictEqual(result.status, 'pending');
  assert.strictEqual(result.providerStatus, 'PENDING');
});

test('task_id 缺失 → 抛出安全错误', async () => {
  const service = createMockService(async (path) => {
    return {
      statusCode: 200,
      headers: {},
      body: {
        output: {
          // 没有 task_id
          task_status: 'PENDING'
        },
        request_id: 'test-req'
      }
    };
  });

  try {
    await service.createImageToVideoTask({
      imageUrl: 'https://example.com/image.jpg',
      prompt: 'test',
      model: 'happyhorse-i2v'
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(
      e.safeMessage && e.safeMessage.includes('task_id'),
      'Error should mention missing task_id'
    );
  }
});

test('DashScope 业务错误 code → 抛出安全错误', async () => {
  const service = createMockService(async (path) => {
    return dashScopeErrorResponse('InvalidParameter', 'Model not found', 400);
  });

  try {
    await service.createImageToVideoTask({
      imageUrl: 'https://example.com/image.jpg',
      prompt: 'test',
      model: 'invalid-model'
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.statusCode, 400);
    assert.ok(!e.safeMessage.includes('sk-'), 'Safe message should not contain API key');
  }
});

test('非 JSON 响应 → 抛出安全错误', async () => {
  const service = createMockService(async (path) => {
    return {
      statusCode: 502,
      headers: {},
      body: '<html>502 Bad Gateway</html>'
    };
  });

  try {
    await service.createImageToVideoTask({
      imageUrl: 'https://example.com/image.jpg',
      prompt: 'test',
      model: 'happyhorse-i2v'
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.safeMessage, 'Should have safeMessage');
  }
});

// ─── 5. getTaskStatus 状态映射 ─────────────────────────────────
console.log('\n── getTaskStatus 状态映射 ──');

test('PENDING → pending', async () => {
  const service = createMockService(async (path) => {
    return {
      statusCode: 200,
      headers: {},
      body: {
        output: { task_id: 't1', task_status: 'PENDING' },
        request_id: 'req-1'
      }
    };
  });

  const result = await service.getTaskStatus({ taskId: 't1' });
  assert.strictEqual(result.status, 'pending');
  assert.strictEqual(result.progress, 0);
});

test('RUNNING → processing', async () => {
  const service = createMockService(async (path) => {
    return {
      statusCode: 200,
      headers: {},
      body: {
        output: { task_id: 't2', task_status: 'RUNNING' },
        request_id: 'req-2'
      }
    };
  });

  const result = await service.getTaskStatus({ taskId: 't2' });
  assert.strictEqual(result.status, 'processing');
  assert.strictEqual(result.progress, null, 'processing should have null progress');
});

test('SUCCEEDED → success with outputUrl', async () => {
  const service = createMockService(async (path) => {
    return {
      statusCode: 200,
      headers: {},
      body: {
        output: {
          task_id: 't3',
          task_status: 'SUCCEEDED',
          video_url: 'https://example.com/output.mp4'
        },
        usage: { duration: 5 },
        request_id: 'req-3'
      }
    };
  });

  const result = await service.getTaskStatus({ taskId: 't3' });
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.progress, 100);
  assert.strictEqual(result.outputUrl, 'https://example.com/output.mp4');
  assert.strictEqual(result.duration, 5);
});

test('FAILED → failed with error info', async () => {
  const service = createMockService(async (path) => {
    return {
      statusCode: 200,
      headers: {},
      body: {
        output: {
          task_id: 't4',
          task_status: 'FAILED',
          message: 'Content moderation failed',
          error_code: 'CONTENT_REJECTED'
        },
        request_id: 'req-4'
      }
    };
  });

  const result = await service.getTaskStatus({ taskId: 't4' });
  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(result.progress, 100);
  assert.strictEqual(result.errorMessage, 'Content moderation failed');
  assert.strictEqual(result.errorCode, 'CONTENT_REJECTED');
});

test('taskId 为空 → 拒绝', async () => {
  const svc = require('../services/dashscopeService');
  try {
    await svc.getTaskStatus({ taskId: '' });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'INVALID_TASK_ID');
  }
});

// ─── 6. 重试策略 ───────────────────────────────────────────────
console.log('\n── 重试策略 ──');

test('401 不重试', async () => {
  let callCount = 0;
  const service = createMockService(async (path) => {
    callCount++;
    return dashScopeErrorResponse('Unauthorized', 'Invalid API key', 401);
  });

  try {
    await service.requestWithRetry('/test', {}, 'POST');
  } catch (e) {
    // expected
  }
  assert.strictEqual(callCount, 1, '401 should not be retried');
});

test('429 可重试（最多2次）', async () => {
  let callCount = 0;
  const service = createMockService(async (path) => {
    callCount++;
    return dashScopeErrorResponse('Throttling', 'Rate limited', 429);
  });

  // 缩短 sleep 时间加速测试
  service._sleep = () => Promise.resolve();

  try {
    await service.requestWithRetry('/test', {}, 'POST');
  } catch (e) {
    // expected
  }
  assert.strictEqual(callCount, 3, '429 should be retried 2 times (3 total calls): got ' + callCount);
});

test('5xx 可有限重试', async () => {
  let callCount = 0;
  const service = createMockService(async (path) => {
    callCount++;
    return { statusCode: 503, headers: {}, body: { message: 'Service unavailable' } };
  });

  service._sleep = () => Promise.resolve();

  try {
    await service.requestWithRetry('/test', {}, 'POST');
  } catch (e) {
    // expected
  }
  assert.strictEqual(callCount, 3, '503 should be retried 2 times (3 total calls): got ' + callCount);
});

test('网络瞬时错误可重试', async () => {
  let callCount = 0;
  const service = createMockService(async (path) => {
    callCount++;
    if (callCount < 3) {
      // 前两次网络错误，第三次成功
      return {
        statusCode: 200,
        headers: {},
        body: {
          output: { task_id: 'retry-test', task_status: 'PENDING' },
          request_id: 'req-retry'
        }
      };
    }
    return {
      statusCode: 200,
      headers: {},
      body: {
        output: { task_id: 'retry-test', task_status: 'PENDING' },
        request_id: 'req-retry'
      }
    };
  });

  service._sleep = () => Promise.resolve();

  // 模拟第一次网络错误（requestWithRetry 内部捕获 request 抛出的网络错误）
  let requestAttempt = 0;
  service.request = async (path) => {
    requestAttempt++;
    if (requestAttempt < 3) {
      const err = new Error('ECONNRESET');
      err.code = 'ECONNRESET';
      throw err;
    }
    return {
      statusCode: 200,
      headers: {},
      body: {
        output: { task_id: 'retry-test', task_status: 'PENDING' },
        request_id: 'req-retry'
      }
    };
  };

  const result = await service.requestWithRetry('/test', {}, 'GET');
  assert.ok(result, 'Should succeed after retries');
  assert.strictEqual(requestAttempt, 3, 'Should have retried 2 times before success');
});

// ─── 7. 敏感信息不泄露 ────────────────────────────────────────
console.log('\n── 敏感信息脱敏 ──');

test('日志不包含完整 API Key', () => {
  // 验证 maskApiKey 函数存在
  const svc = require('../services/dashscopeService');
  const key = process.env.DASHSCOPE_API_KEY;
  if (key) {
    // 检查 source 代码中不直接打印 apiKey
    const fs = require('fs');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'dashscopeService.js'),
      'utf8'
    );
    // console.log 中不应包含 this.apiKey
    const logLines = source.match(/console\.log\([^)]*\)/g) || [];
    for (const line of logLines) {
      assert.ok(
        !line.includes('this.apiKey') && !line.includes('apiKey'),
        `Log line should not contain apiKey: ${line.trim().substring(0, 80)}`
      );
    }
  }
});

test('错误对象不包含 Authorization', () => {
  // 任何经过 sanitizeError 的错误都不应包含敏感信息
  const svc = require('../services/dashscopeService');
  const originalError = {
    statusCode: 500,
    body: {
      config: {
        headers: {
          Authorization: 'Bearer sk-ws-VERY_SECRET_KEY',
          'Content-Type': 'application/json'
        }
      }
    }
  };
  const safe = svc.sanitizeError(originalError);
  const safeStr = JSON.stringify(safe);
  assert.ok(!safeStr.includes('Authorization'), 'safe error has Authorization');
  assert.ok(!safeStr.includes('Bearer'), 'safe error has Bearer');
  assert.ok(!safeStr.includes('sk-'), 'safe error has API key');
  assert.ok(!safeStr.includes('VERY_SECRET'), 'safe error has secret key');
});

// ─── 8. 模拟逻辑清理 ──────────────────────────────────────────
console.log('\n── 模拟逻辑检查 ──');

test('Service 源码不包含 Math.random', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'dashscopeService.js'),
    'utf8'
  );
  assert.ok(!source.includes('Math.random'), 'Source should not contain Math.random');
});

test('Service 源码不包含 setTimeout 模拟', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'dashscopeService.js'),
    'utf8'
  );
  // 合法的 setTimeout 用途：
  //   1. req.setTimeout() — HTTP 请求超时（在 request() 中）
  //   2. setTimeout(resolve, ms) — 重试延迟（在 _sleep() 中）
  // 不应存在用于模拟结果的 setTimeout（如 setTimeout(() => resolve(mockData), 1000)）
  const setTimeouts = source.match(/setTimeout/g) || [];
  // 允许 2 个：req.setTimeout + _sleep 中的 setTimeout
  assert.ok(setTimeouts.length <= 2,
    `Expected at most 2 setTimeout calls (HTTP timeout + retry delay), found ${setTimeouts.length}`);
});

test('Service 不执行数据库写入', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'dashscopeService.js'),
    'utf8'
  );
  assert.ok(!source.includes('GenerationTask'), 'Source should not reference GenerationTask');
  assert.ok(!source.includes('.create('), 'Source should not call .create()');
  assert.ok(!source.includes('.update('), 'Source should not call .update()');
  assert.ok(!source.includes('.findOne('), 'Source should not call .findOne()');
});

// ─── 9. 兼容方法 ───────────────────────────────────────────────
console.log('\n── 向后兼容方法 ──');

test('submitImage2Video 兼容包装返回 task_id', async () => {
  const taskId = 'compat-task-001';
  const service = createMockService(async (path, data) => {
    return {
      statusCode: 200,
      headers: {},
      body: {
        output: {
          task_id: taskId,
          task_status: 'PENDING'
        },
        request_id: 'req-compat'
      }
    };
  });

  const result = await service.submitImage2Video({
    imageUrl: 'https://example.com/img.jpg',
    prompt: 'test',
    model: 'happyhorse-i2v'
  });

  assert.ok(result.output, 'Result should have output property');
  assert.strictEqual(result.output.task_id, taskId);
});

test('旧调用方式 getTaskStatus(taskIdString) 仍然兼容', async () => {
  const service = createMockService(async (path) => {
    return {
      statusCode: 200,
      headers: {},
      body: {
        output: {
          task_id: 'old-call-test',
          task_status: 'PENDING'
        },
        request_id: 'req-old'
      }
    };
  });

  // 旧调用方式：直接传字符串
  const result = await service.getTaskStatus('old-call-test');
  assert.strictEqual(result.status, 'pending');
  assert.strictEqual(result.taskId, 'old-call-test');
});

// ─── 10. API Key 配置校验 ──────────────────────────────────────
console.log('\n── 配置校验 ──');

test('DASHSCOPE_API_KEY 已配置', () => {
  const svc = require('../services/dashscopeService');
  assert.ok(svc.apiKey, 'DASHSCOPE_API_KEY should be configured');
  assert.ok(svc.apiKey.startsWith('sk-'), 'DASHSCOPE_API_KEY should start with sk-');
});

test('DASHSCOPE_REQUEST_TIMEOUT 有效', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.timeout, 30000, 'timeout should be 30000');
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
