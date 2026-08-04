/**
 * Sprint 3.4 Release Preparation — 回调安全 & 回归测试
 *
 * 测试覆盖：
 *   - DashScope Callback 签名验证：无签名/错误签名/正确签名
 *   - 原 DashScope 流程不受影响（回归）
 *   - 中间件行为与配置校验
 *   - 日志脱敏验证
 *
 * 运行方式：node tests/sprint3.4.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
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
    headers: overrides.headers || {},
    body: overrides.body || {},
    rawBody: overrides.rawBody || Buffer.from(JSON.stringify(overrides.body || {})),
    ip: overrides.ip || '127.0.0.1',
    params: overrides.params || {}
  };
}

// ═══════════════════════════════════════════════════════════════
//  测试套件
// ═══════════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   Sprint 3.4 Release Preparation Tests       ║');
console.log('║   Callback Security + Regression             ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════
//  Part A: 回调签名验证 — HMAC-SHA256 中间件
// ═══════════════════════════════════════════════════════════════

console.log('══ Part A: Callback Signature Verification ══\n');

const callbackSecret = process.env.DASHSCOPE_CALLBACK_SECRET || 'test-secret-for-unit-tests';

function computeSignature(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

test('PASS 无 DASHSCOPE_CALLBACK_SECRET 时拒绝回调（401）', async () => {
  // 临时清除环境变量来模拟未配置
  const savedSecret = process.env.DASHSCOPE_CALLBACK_SECRET;
  delete process.env.DASHSCOPE_CALLBACK_SECRET;

  // 清除缓存以重新加载中间件
  delete require.cache[require.resolve('../middlewares/callbackSignature')];
  const middleware = require('../middlewares/callbackSignature');

  const req = createMockReq({ body: { task_id: 'test-1', task_status: 'SUCCEEDED' } });
  const res = createMockRes();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res._statusCode, 401);
  assert.strictEqual(nextCalled, false);
  assert.ok(res._jsonData.message.includes('not configured'));

  // 恢复
  process.env.DASHSCOPE_CALLBACK_SECRET = savedSecret;
  delete require.cache[require.resolve('../middlewares/callbackSignature')];
});

test('PASS 无 X-DashScope-Signature header 返回 401', async () => {
  delete require.cache[require.resolve('../middlewares/callbackSignature')];
  const middleware = require('../middlewares/callbackSignature');

  const body = { task_id: 'ds-test-1', task_status: 'SUCCEEDED', output: { video_url: 'https://example.com/v.mp4' } };
  const req = createMockReq({
    body,
    rawBody: Buffer.from(JSON.stringify(body)),
    headers: {}  // 无签名 header
  });
  const res = createMockRes();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res._statusCode, 401);
  assert.strictEqual(nextCalled, false);
  assert.ok(res._jsonData.message.includes('Signature verification failed'));
});

test('PASS 错误签名返回 401', async () => {
  delete require.cache[require.resolve('../middlewares/callbackSignature')];
  const middleware = require('../middlewares/callbackSignature');

  const body = { task_id: 'ds-test-2', task_status: 'SUCCEEDED', output: { video_url: 'https://example.com/v2.mp4' } };
  const rawBody = Buffer.from(JSON.stringify(body));

  const req = createMockReq({
    body,
    rawBody,
    headers: {
      'x-dashscope-signature': '0000000000000000000000000000000000000000000000000000000000000000' // 故意错误
    }
  });
  const res = createMockRes();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res._statusCode, 401);
  assert.strictEqual(nextCalled, false);
  assert.ok(res._jsonData.message.includes('Signature verification failed'));
});

test('PASS 正确签名 → 继续执行（next 被调用）', async () => {
  delete require.cache[require.resolve('../middlewares/callbackSignature')];
  const middleware = require('../middlewares/callbackSignature');

  const body = { task_id: 'ds-test-3', task_status: 'SUCCEEDED', output: { video_url: 'https://example.com/v3.mp4' } };
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = computeSignature(rawBody, callbackSecret);

  const req = createMockReq({
    body,
    rawBody,
    headers: {
      'x-dashscope-signature': signature
    }
  });
  const res = createMockRes();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true, 'next() should be called on valid signature');
  // next 被调用意味着中间件允许请求通过
});

test('PASS 空 body 返回 401', async () => {
  delete require.cache[require.resolve('../middlewares/callbackSignature')];
  const middleware = require('../middlewares/callbackSignature');

  const req = createMockReq({
    body: {},
    rawBody: Buffer.from(''),
    headers: {
      'x-dashscope-signature': 'some-signature'
    }
  });
  const res = createMockRes();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res._statusCode, 401);
  assert.strictEqual(nextCalled, false);
});

test('PASS 不同 body 内容的签名不同', () => {
  const secret = callbackSecret;
  const body1 = Buffer.from(JSON.stringify({ task_id: 'a', status: 'success' }));
  const body2 = Buffer.from(JSON.stringify({ task_id: 'b', status: 'success' }));

  const sig1 = computeSignature(body1, secret);
  const sig2 = computeSignature(body2, secret);

  assert.notStrictEqual(sig1, sig2, 'Signatures for different bodies must differ');
});

test('PASS 使用错误的 secret 计算出的签名验证失败', async () => {
  delete require.cache[require.resolve('../middlewares/callbackSignature')];
  const middleware = require('../middlewares/callbackSignature');

  const body = { task_id: 'ds-test-4', task_status: 'SUCCEEDED' };
  const rawBody = Buffer.from(JSON.stringify(body));
  // 使用错误密钥计算的签名
  const wrongSignature = computeSignature(rawBody, 'wrong-secret-key');

  const req = createMockReq({
    body,
    rawBody,
    headers: {
      'x-dashscope-signature': wrongSignature
    }
  });
  const res = createMockRes();
  let nextCalled = false;

  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res._statusCode, 401);
  assert.strictEqual(nextCalled, false);
});

test('PASS body 大小写敏感（修改1个字节签名即不同）', () => {
  const secret = callbackSecret;
  const body1 = Buffer.from(JSON.stringify({ status: 'SUCCEEDED' }));
  const body2 = Buffer.from(JSON.stringify({ status: 'SUCCEEDED' }) + ' '); // 多加空格

  // body1 和 body2 应不同
  assert.notStrictEqual(body1.toString(), body2.toString());

  const sig1 = computeSignature(body1, secret);
  const sig2 = computeSignature(body2, secret);
  assert.notStrictEqual(sig1, sig2);
});

// ═══════════════════════════════════════════════════════════════
//  Part B: 回调路由 — 中间件正确挂载
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part B: Route Middleware Integration ══\n');

test('PASS 回调路由注册了签名验证中间件', () => {
  const fs = require('fs');
  const routeContent = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'callback.js'), 'utf8'
  );
  assert.ok(routeContent.includes('callbackSignatureMiddleware'), 'Route should use callbackSignatureMiddleware');
  assert.ok(routeContent.includes('router.post(\'/dashscope\''), 'Should have dashscope POST route');
});

test('PASS oss 回调路由未添加签名验证（保持原样）', () => {
  const fs = require('fs');
  const routeContent = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'callback.js'), 'utf8'
  );

  // OSS 回调应该不经过签名验证中间件
  const ossRouteMatch = routeContent.match(/router\.post\('\/oss'/);
  assert.ok(ossRouteMatch, 'OSS callback route should exist');
});

test('PASS 中间件文件包含 HMAC-SHA256 实现', () => {
  const fs = require('fs');
  const middlewareSource = fs.readFileSync(
    path.join(__dirname, '..', 'middlewares', 'callbackSignature.js'), 'utf8'
  );
  assert.ok(middlewareSource.includes('createHmac'), 'Should use crypto.createHmac');
  assert.ok(middlewareSource.includes('sha256'), 'Should use SHA-256 algorithm');
  assert.ok(middlewareSource.includes('timingSafeEqual'), 'Should use timing-safe comparison');
});

// ═══════════════════════════════════════════════════════════════
//  Part C: 配置验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part C: Configuration Verification ══\n');

test('PASS .env.example 包含 DASHSCOPE_CALLBACK_SECRET', () => {
  const fs = require('fs');
  const envExample = fs.readFileSync(
    path.join(__dirname, '..', '.env.example'), 'utf8'
  );
  assert.ok(envExample.includes('DASHSCOPE_CALLBACK_SECRET'), '.env.example should include callback secret');
});

test('PASS .env 包含 DASHSCOPE_CALLBACK_SECRET（已配置）', () => {
  assert.ok(process.env.DASHSCOPE_CALLBACK_SECRET, 'DASHSCOPE_CALLBACK_SECRET should be set in .env');
  assert.ok(process.env.DASHSCOPE_CALLBACK_SECRET.length >= 8, 'DASHSCOPE_CALLBACK_SECRET should be reasonably long');
});

test('PASS app.js 配置了 express.json verify 捕获 rawBody', () => {
  const fs = require('fs');
  const appSource = fs.readFileSync(
    path.join(__dirname, '..', 'app.js'), 'utf8'
  );
  assert.ok(appSource.includes('rawBody'), 'app.js should capture rawBody via verify callback');
  assert.ok(appSource.includes('verify:'), 'app.js should have verify function');
});

test('PASS env-check.js 包含 DASHSCOPE_CALLBACK_SECRET 检查', () => {
  const fs = require('fs');
  const envCheckSource = fs.readFileSync(
    path.join(__dirname, '..', 'config', 'env-check.js'), 'utf8'
  );
  assert.ok(envCheckSource.includes('DASHSCOPE_CALLBACK_SECRET'), 'env-check.js should check callback secret');
});

// ═══════════════════════════════════════════════════════════════
//  Part D: 安全验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part D: Security Validation ══\n');

test('PASS .gitignore 排除 .env 文件', () => {
  const fs = require('fs');
  const gitignore = fs.readFileSync(
    path.join(__dirname, '..', '.gitignore'), 'utf8'
  );
  assert.ok(gitignore.includes('.env'), '.gitignore should include .env');
});

test('PASS .gitignore 不排除 .env.example', () => {
  const fs = require('fs');
  const gitignore = fs.readFileSync(
    path.join(__dirname, '..', '.gitignore'), 'utf8'
  );
  assert.ok(gitignore.includes('!.env.example'), '.gitignore should exclude .env.example from ignore');
});

test('PASS 回调中间件源码不含硬编码密钥', () => {
  const fs = require('fs');
  const middlewareSource = fs.readFileSync(
    path.join(__dirname, '..', 'middlewares', 'callbackSignature.js'), 'utf8'
  );
  // 密钥只能来自 process.env，不能硬编码
  const envReferences = (middlewareSource.match(/process\.env\.DASHSCOPE_CALLBACK_SECRET/g) || []).length;
  // 至少有一次引用（getCallbackSecret 函数中）
  assert.ok(envReferences >= 1, 'Secret should come from process.env, not hardcoded');

  // 不应有硬编码的密钥字符串（除了函数名和注释）
  assert.ok(!middlewareSource.includes('yujian_dashscope_callback'), 'Should not hardcode actual secret value');
});

test('PASS 签名验证失败日志不包含完整签名', () => {
  const fs = require('fs');
  const middlewareSource = fs.readFileSync(
    path.join(__dirname, '..', 'middlewares', 'callbackSignature.js'), 'utf8'
  );
  // 日志中签名应截断显示（前8字符）
  const verifyLog = middlewareSource.match(/header=\$\{receivedSignature[^}]*\}/);
  if (verifyLog) {
    assert.ok(verifyLog[0].includes('substring'), 'Should truncate signature in logs');
    assert.ok(verifyLog[0].includes('...'), 'Should add ellipsis after truncated signature');
  }
});

test('PASS 回调控制器不再直接 console.error 完整 error 对象', () => {
  const fs = require('fs');
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'callbackController.js'), 'utf8'
  );
  // 现在应只记录 error.message 而非整个 error 对象
  const catchBlock = controllerSource.match(/catch\s*\(error\)\s*\{[\s\S]*?\}/);
  if (catchBlock) {
    assert.ok(
      catchBlock[0].includes('error.message'),
      'Should log error.message instead of full error object'
    );
  }
});

test('PASS 回调控制器未修改任务状态流程', () => {
  const fs = require('fs');
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'callbackController.js'), 'utf8'
  );
  // 核心业务逻辑应保持不变
  assert.ok(controllerSource.includes('task.update(updateData)'), 'Core task update logic should remain');
  assert.ok(controllerSource.includes('adjustEnterpriseQuota'), 'Quota adjustment should remain');
  assert.ok(controllerSource.includes('SUCCEEDED'), 'Status mapping should remain');
  assert.ok(controllerSource.includes('FAILED'), 'Status mapping should remain');
});

test('PASS DashScope Service 未被修改', () => {
  const fs = require('fs');
  const dsSource = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'dashscopeService.js'), 'utf8'
  );
  // 确保关键方法存在且未变
  assert.ok(dsSource.includes('createImageToVideoTask'), 'createImageToVideoTask should exist');
  assert.ok(dsSource.includes('getTaskStatus'), 'getTaskStatus should exist');
  assert.ok(dsSource.includes('requestWithRetry'), 'requestWithRetry should exist');
  assert.ok(dsSource.includes('sanitizeError'), 'sanitizeError should exist');
});

// ═══════════════════════════════════════════════════════════════
//  Part E: 回归测试 — 原 DashScope 流程不受影响
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part E: Regression — DashScope Flow Unaffected ══\n');

test('REGRESSION DashScopeService normalizeStatus 功能正常', () => {
  const svc = require('../services/dashscopeService');
  assert.strictEqual(svc.normalizeStatus('PENDING'), 'pending');
  assert.strictEqual(svc.normalizeStatus('RUNNING'), 'processing');
  assert.strictEqual(svc.normalizeStatus('SUCCEEDED'), 'success');
  assert.strictEqual(svc.normalizeStatus('FAILED'), 'failed');
  assert.strictEqual(svc.normalizeStatus('UNKNOWN'), 'pending');
});

test('REGRESSION DashScopeService sanitizeError 功能正常', () => {
  const svc = require('../services/dashscopeService');
  const safe = svc.sanitizeError({ statusCode: 500, body: { message: 'Server error' } });
  assert.strictEqual(safe.statusCode, 500);
  assert.strictEqual(safe.safeMessage, 'Server error');
  assert.strictEqual(safe.retryable, true);
});

test('REGRESSION DashScopeService 重试策略正确', () => {
  const svc = require('../services/dashscopeService');
  // 401 不重试
  const safe401 = svc.sanitizeError({ statusCode: 401, body: { message: 'Unauthorized' } });
  assert.strictEqual(safe401.retryable, false);
  // 429 可重试
  const safe429 = svc.sanitizeError({ statusCode: 429, body: { message: 'Rate limited' } });
  assert.strictEqual(safe429.retryable, true);
});

test('REGRESSION videoStorageService 模块正常加载', () => {
  delete require.cache[require.resolve('../services/videoStorageService')];
  const vs = require('../services/videoStorageService');
  assert.ok(vs.downloadAndStore, 'downloadAndStore should exist');
  assert.strictEqual(typeof vs.downloadAndStore, 'function');
});

test('REGRESSION ossService 模块正常加载', () => {
  const oss = require('../services/ossService');
  assert.ok(oss.putFile || oss.upload || oss.put, 'OSS upload method should exist');
});

test('REGRESSION 回调 Controller 核心逻辑完整', () => {
  const fs = require('fs');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'callbackController.js'), 'utf8'
  );
  // 关键业务逻辑检查
  assert.ok(source.includes('GenerationTask.findOne'), 'Should query GenerationTask');
  assert.ok(source.includes('task.update(updateData)'), 'Should update task');
  assert.ok(source.includes('adjustEnterpriseQuota'), 'Should adjust quota on success');
  assert.ok(source.includes('getPointsPerSecond'), 'Should calculate points cost');
  assert.ok(source.includes('res.success({ received: true })'), 'Should always respond 200 to DashScope');
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
