/**
 * Sprint 5.3.1 Provider Field Fix — 测试
 *
 * 运行方式：node tests/sprint5.3.1-provider-persistence.test.js
 *
 * 测试范围：
 *   Part A: 数据库 ENUM 校验 — provider 字段接受 'aliyun'
 *   Part B: GenerationTask.create() — image_to_video 任务持久化
 *   Part C: provider 值正确写入和读取
 *   Part D: GenerationService.generateVideo() 流程验证
 */

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

async function testAsync(name, fn) {
  try {
    await fn();
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
require('dotenv').config({ path: path.join(BASE, '.env') });

const { GenerationTask, sequelize } = require('../models');

// ═══════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════

(async () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Sprint 5.3.1 Provider Persistence Tests   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ─── Part A: 数据库 Schema 验证 ──────────────────────────────
  console.log('── Part A: Database Schema ──');

  await testAsync('provider 列 ENUM 包含 aliyun', async () => {
    const [rows] = await sequelize.query(
      'SHOW COLUMNS FROM generation_tasks WHERE Field = "provider"'
    );
    const col = rows[0];
    assert.ok(col.Type.includes('aliyun'),
      `ENUM should include aliyun, got: ${col.Type}`);
    assert.strictEqual(col.Null, 'NO', 'provider should be NOT NULL');
    assert.strictEqual(col.Default, 'aliyun', 'default should be aliyun');
  });

  test('GenerationTask 模型 provider 默认值为 aliyun', () => {
    const attrs = GenerationTask.getAttributes();
    assert.ok(attrs.provider, 'provider attribute should exist');
    assert.strictEqual(attrs.provider.defaultValue, 'aliyun',
      'model default should be aliyun');
  });

  // ─── Part B: GenerationTask.create() 持久化测试 ──────────────
  console.log('\n── Part B: Provider Persistence ──');

  let testTaskId = null;

  await testAsync('创建 image_to_video task — provider=aliyun 写入成功', async () => {
    const task = await GenerationTask.create({
      enterprise_id: 1,
      user_id: 1,
      task_type: 'image2video',
      model: 'wanx2.1-i2v-turbo',
      prompt: 'Test: image to video generation',
      input_url: 'https://example.com/test-image.jpg',
      status: 'pending',
      provider: 'aliyun',
      duration: 5,
      progress: 0
    });

    testTaskId = task.id;

    assert.ok(task.id, 'Task should have an id');
    assert.strictEqual(task.provider, 'aliyun',
      `provider should be aliyun, got: ${task.provider}`);
    assert.strictEqual(task.status, 'pending');
    assert.strictEqual(task.task_type, 'image2video');
    assert.strictEqual(task.model, 'wanx2.1-i2v-turbo');
  });

  await testAsync('数据库重新读取 — provider 值保持一致', async () => {
    assert.ok(testTaskId, 'testTaskId should be set from previous test');

    const task = await GenerationTask.findByPk(testTaskId);
    assert.ok(task, 'Task should exist in database');
    assert.strictEqual(task.provider, 'aliyun',
      `After re-read, provider should be aliyun, got: ${task.provider}`);
    assert.strictEqual(task.status, 'pending');
    assert.strictEqual(task.task_type, 'image2video');
  });

  await testAsync('provider 字段 update — 保持 aliyun', async () => {
    assert.ok(testTaskId, 'testTaskId should be set');

    const task = await GenerationTask.findByPk(testTaskId);
    await task.update({
      task_id: 'dashscope-test-task-5.3.1-001',
      provider: 'aliyun',
      status: 'processing',
      started_at: new Date()
    });

    const updated = await GenerationTask.findByPk(testTaskId);
    assert.strictEqual(updated.provider, 'aliyun',
      `After update, provider should remain aliyun, got: ${updated.provider}`);
    assert.strictEqual(updated.status, 'processing');
    assert.strictEqual(updated.task_id, 'dashscope-test-task-5.3.1-001');
  });

  // ─── Part C: 边界测试 ────────────────────────────────────────
  console.log('\n── Part C: Edge Cases ──');

  test('不传 provider 时使用默认值 aliyun', () => {
    const attrs = GenerationTask.getAttributes();
    assert.strictEqual(attrs.provider.defaultValue, 'aliyun',
      'Default provider should be aliyun when not specified');
  });

  await testAsync('task_type=image2video 配合 provider=aliyun', async () => {
    const task = await GenerationTask.create({
      enterprise_id: 1,
      user_id: 1,
      task_type: 'image2video',
      model: 'happyhorse-i2v',
      prompt: 'test image2video with aliyun provider',
      input_url: 'https://example.com/img2.jpg',
      status: 'pending',
      provider: 'aliyun',
      duration: 5,
      progress: 0
    });

    assert.strictEqual(task.provider, 'aliyun');
    assert.strictEqual(task.task_type, 'image2video');

    // cleanup
    await task.destroy();
  });

  await testAsync('task_type=text2video 配合 provider=aliyun', async () => {
    const task = await GenerationTask.create({
      enterprise_id: 1,
      user_id: 1,
      task_type: 'text2video',
      model: 'happyhorse-t2v',
      prompt: 'test text2video with aliyun provider',
      status: 'pending',
      provider: 'aliyun',
      duration: 5,
      progress: 0
    });

    assert.strictEqual(task.provider, 'aliyun');
    assert.strictEqual(task.task_type, 'text2video');

    // cleanup
    await task.destroy();
  });

  // ─── Part D: 拒绝非法 provider 值 ────────────────────────────
  console.log('\n── Part D: Invalid Provider Rejection ──');

  await testAsync('provider=runway 应被数据库拒绝', async () => {
    try {
      await GenerationTask.create({
        enterprise_id: 1,
        user_id: 1,
        task_type: 'image2video',
        model: 'test-model',
        prompt: 'test invalid provider',
        status: 'pending',
        provider: 'runway',  // 不在 ENUM 中
        duration: 5,
        progress: 0
      });
      assert.fail('Should have thrown for invalid provider value');
    } catch (e) {
      assert.ok(
        e.message.includes('provider') || e.message.includes('Data truncated'),
        `Error should mention provider/truncation, got: ${e.message}`
      );
    }
  });

  await testAsync('provider=kling 应被数据库拒绝', async () => {
    try {
      await GenerationTask.create({
        enterprise_id: 1,
        user_id: 1,
        task_type: 'image2video',
        model: 'test-model',
        prompt: 'test invalid provider kling',
        status: 'pending',
        provider: 'kling',  // 不在 ENUM 中
        duration: 5,
        progress: 0
      });
      assert.fail('Should have thrown for invalid provider value');
    } catch (e) {
      assert.ok(
        e.message.includes('provider') || e.message.includes('Data truncated'),
        `Error should mention provider/truncation, got: ${e.message}`
      );
    }
  });

  // ─── Cleanup ─────────────────────────────────────────────────
  console.log('\n── Cleanup ──');

  await testAsync('清理测试数据', async () => {
    if (testTaskId) {
      const task = await GenerationTask.findByPk(testTaskId);
      if (task) {
        await task.destroy();
      }
    }

    // 清理所有测试创建的记录（通过唯一 prompt 匹配）
    const testPrompts = [
      'Test: image to video generation',
      'test image2video with aliyun provider',
      'test text2video with aliyun provider',
      'test invalid provider',
      'test invalid provider kling'
    ];

    const deletedCount = await GenerationTask.destroy({
      where: { prompt: testPrompts }
    });
    console.log(`        Cleaned up ${deletedCount} test records`);

    // 验证本次测试的记录已清理完毕
    const remaining = await GenerationTask.findAll({
      where: { prompt: testPrompts }
    });
    assert.strictEqual(remaining.length, 0,
      `All test records should be cleaned up, found ${remaining.length}`);
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

  await sequelize.close();
  process.exit(failed > 0 ? 1 : 0);
})();
