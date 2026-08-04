/**
 * Sprint 3.3.2 前端作品中心 验证测试
 *
 * 验证范围：
 *   - 页面渲染函数存在性
 *   - API 调用模式正确性
 *   - taskType / status 映射完整性
 *   - 安全性：Token 携带、错误处理
 *   - HTML 结构与 nav 项
 *
 * 运行方式：node tests/sprint3.3.2-frontend.test.js
 *
 * 注意：此测试验证 enterprise.html 中代码的结构和逻辑正确性，
 *       而非浏览器 E2E 测试。浏览器交互测试需手动验证。
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

// ─── 加载 enterprise.html ──────────────────────────────────────
const htmlPath = path.join(__dirname, '..', 'public', 'enterprise.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const jsPath = path.join(__dirname, '..', 'public', 'js', 'api.js');
const apiJs = fs.readFileSync(jsPath, 'utf8');

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   Sprint 3.3.2 前端作品中心 验证测试        ║');
console.log('╚══════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════
//  Part A: 页面结构 — 函数存在性
// ═══════════════════════════════════════════════════════════════

console.log('══ Part A: 页面结构 — 函数存在性 ══\n');

test('PASS 页面加载 — renderMyWorks 函数存在', () => {
  assert.ok(html.includes('function renderMyWorks()'),
    'renderMyWorks function must exist');
});

test('PASS 获取作品列表 — loadMyWorks 函数存在', () => {
  assert.ok(html.includes('function loadMyWorks(page)'),
    'loadMyWorks function must exist');
});

test('PASS 删除作品 — deleteWork 函数存在', () => {
  assert.ok(html.includes('function deleteWork(taskId, title)'),
    'deleteWork function must exist');
});

test('PASS 视频播放 — playVideo 函数存在', () => {
  assert.ok(html.includes('function playVideo(videoUrl, title)'),
    'playVideo function must exist');
});

test('PASS 关闭播放器 — closeVideoPlayer 函数存在', () => {
  assert.ok(html.includes('function closeVideoPlayer()'),
    'closeVideoPlayer function must exist');
});

test('PASS 作品详情 — showWorkDetail 函数存在', () => {
  assert.ok(html.includes('function showWorkDetail(taskId)'),
    'showWorkDetail function must exist');
});

test('PASS 路由注册 — myworks case 存在', () => {
  assert.ok(html.includes("case 'myworks'"),
    'myworks case must be in render switch');
});

test('PASS 导航项 — myworks nav-item 存在', () => {
  assert.ok(html.includes('data-page="myworks"'),
    'myworks nav-item must exist in sidebar');
});

// ═══════════════════════════════════════════════════════════════
//  Part B: API 调用模式
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part B: API 调用模式 ══\n');

test('PASS GET 列表 — 调用正确端点', () => {
  // 验证使用 YuJianAPI.get 调用 /enterprise/video-generation/tasks
  assert.ok(html.includes("YuJianAPI.get('/enterprise/video-generation/tasks"),
    'Must call GET /enterprise/video-generation/tasks');
  assert.ok(html.includes('page=') && html.includes('pageSize='),
    'Must include page and pageSize query params');
});

test('PASS DELETE — 调用正确端点和方法', () => {
  // 验证使用 YuJianAPI.request 调用 DELETE
  assert.ok(html.includes("YuJianAPI.request('/enterprise/video-generation/tasks/'"),
    'Must call DELETE /enterprise/video-generation/tasks/:id');
  assert.ok(html.includes("method: 'DELETE'"),
    'Must use DELETE method');
});

test('PASS GET 详情 — 调用正确端点', () => {
  assert.ok(html.includes("YuJianAPI.get('/enterprise/video-generation/tasks/' + taskId"),
    'Must call GET /enterprise/video-generation/tasks/:id for detail');
});

// ═══════════════════════════════════════════════════════════════
//  Part C: Token 携带
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part C: Token 携带 ══\n');

test('PASS Token携带 — API 封装自动注入 Authorization 头', () => {
  assert.ok(apiJs.includes("'Authorization'"),
    'API client must send Authorization header');
  assert.ok(apiJs.includes('Bearer'),
    'Authorization header must use Bearer scheme');
  assert.ok(apiJs.includes('getToken()'),
    'Token must be retrieved from sessionStorage');
});

test('PASS Token存储 — 使用 sessionStorage', () => {
  assert.ok(apiJs.includes('sessionStorage'),
    'Token must be stored in sessionStorage');
  assert.ok(apiJs.includes('yj_token'),
    'Token key must be yj_token');
});

test('PASS 401处理 — 自动清除 Token', () => {
  assert.ok(apiJs.includes('clearToken()') && apiJs.includes('401'),
    'Must clear token on 401 response');
});

// ═══════════════════════════════════════════════════════════════
//  Part D: taskType 显示映射
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part D: taskType 显示映射 ══\n');

test('PASS taskType显示 — image2video 映射为 图生视频', () => {
  assert.ok(html.includes("'image2video': '图生视频'"),
    'image2video must map to 图生视频');
});

test('PASS taskType显示 — text2video 映射为 文生视频', () => {
  assert.ok(html.includes("'text2video': '文生视频'"),
    'text2video must map to 文生视频');
});

test('PASS taskType显示 — video_extend 映射为 视频扩展', () => {
  assert.ok(html.includes("'video_extend': '视频扩展'"),
    'video_extend must map to 视频扩展');
});

test('PASS taskType显示 — video_style_transfer 映射为 视频风格转换', () => {
  assert.ok(html.includes("'video_style_transfer': '视频风格转换'"),
    'video_style_transfer must map to 视频风格转换');
});

test('PASS taskType显示 — 未知类型兜底为 AI视频', () => {
  // 验证 formatTaskType 函数有兜底逻辑
  assert.ok(html.includes("'AI视频'"),
    'Unknown taskType must fallback to AI视频');
  assert.ok(html.includes('TASKTYPE_MAP[taskType]'),
    'Must use TASKTYPE_MAP lookup with fallback');
});

// ═══════════════════════════════════════════════════════════════
//  Part E: status 显示映射
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part E: status 显示映射 ══\n');

test('PASS status显示 — success 映射为 生成完成', () => {
  assert.ok(html.includes("'success': '生成完成'"),
    'success must map to 生成完成');
});

test('PASS status显示 — processing 映射为 生成中', () => {
  assert.ok(html.includes("'processing': '生成中'"),
    'processing must map to 生成中');
});

test('PASS status显示 — pending 映射为 等待生成', () => {
  assert.ok(html.includes("'pending': '等待生成'"),
    'pending must map to 等待生成');
});

test('PASS status显示 — failed 映射为 生成失败', () => {
  assert.ok(html.includes("'failed': '生成失败'"),
    'failed must map to 生成失败');
});

// ═══════════════════════════════════════════════════════════════
//  Part F: 删除确认与错误处理
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part F: 删除确认与错误处理 ══\n');

test('PASS 删除确认 — 使用 confirm 弹窗', () => {
  assert.ok(html.includes("confirm('确定要删除"),
    'Must use confirm() for delete confirmation');
  assert.ok(html.includes('作品将从列表隐藏'),
    'Must show "作品将从列表隐藏" message');
});

test('PASS 删除刷新 — 成功后调用 loadMyWorks', () => {
  // 验证 deleteWork 成功后调用 loadMyWorks（刷新列表）
  assert.ok(html.includes("loadMyWorks(WORKS_STATE.currentPage)"),
    'Must refresh list after successful delete');
});

test('PASS 删除404 — 提示作品不存在', () => {
  // 验证 404 错误处理：提示"作品不存在"
  assert.ok(html.includes("作品不存在或已删除"),
    'Must handle 404 with "作品不存在" message');
});

test('PASS 401 — 提示登录过期', () => {
  // 验证多处 401 处理
  assert.ok(html.includes("'登录已过期"),
    'Must show "登录已过期" on 401');
});

test('PASS 网络错误 — 显示重试按钮非原始错误', () => {
  // 错误处理不暴露原始错误详情
  assert.ok(html.includes('重新加载'),
    'Must show retry button on error');
  assert.ok(html.includes('加载失败，请稍后重试'),
    'Must show user-friendly error message');
});

// ═══════════════════════════════════════════════════════════════
//  Part G: 分页
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part G: 分页 ══\n');

test('PASS 分页 — renderPagination 函数存在', () => {
  assert.ok(html.includes('function renderPagination'),
    'renderPagination function must exist');
});

test('PASS 分页 — 上一页/下一页 按钮', () => {
  assert.ok(html.includes('上一页') && html.includes('下一页'),
    'Must have prev/next page buttons');
});

test('PASS 分页 — 显示总数和当前页', () => {
  assert.ok(html.includes('共 ') && html.includes('第 ') && html.includes(' 页'),
    'Must display total count and current page');
});

test('PASS 分页 — 按钮禁用逻辑（边界条件）', () => {
  // 验证禁用逻辑 — page > 1 时启用上一页
  assert.ok(html.includes('page > 1'),
    'Must check page > 1 for prev button');
  assert.ok(html.includes('page < totalPages'),
    'Must check page < totalPages for next button');
});

// ═══════════════════════════════════════════════════════════════
//  Part H: 视频播放
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part H: 视频播放 ══\n');

test('PASS 视频播放 — 使用 HTML5 video 标签', () => {
  assert.ok(html.includes('<video ') && html.includes('controls'),
    'Must use HTML5 video tag with controls');
  assert.ok(html.includes('autoplay'),
    'Must enable autoplay');
});

test('PASS 视频播放 — 全屏支持', () => {
  assert.ok(html.includes('requestFullscreen'),
    'Must support fullscreen API');
});

test('PASS 视频播放 — ESC 关闭', () => {
  assert.ok(html.includes("key === 'Escape'") && html.includes('closeVideoPlayer'),
    'Must close on ESC key');
});

test('PASS 视频播放 — 点击背景关闭', () => {
  assert.ok(html.includes('e.target === overlay'),
    'Must close on background click');
});

test('PASS 视频播放 — 仅 success 状态显示播放按钮', () => {
  assert.ok(html.includes("status === 'success'"),
    'Must only show play button for successful tasks');
});

// ═══════════════════════════════════════════════════════════════
//  Part I: 缩略图
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part I: 缩略图 ══\n');

test('PASS 缩略图 — thumbnailUrl 或 coverUrl 显示', () => {
  assert.ok(html.includes('thumbnailUrl') && html.includes('coverUrl'),
    'Must use thumbnailUrl or coverUrl for thumbnails');
});

test('PASS 缩略图 — 加载失败降级（onerror 兜底）', () => {
  assert.ok(html.includes('onerror'),
    'Must handle image load error with fallback');
});

// ═══════════════════════════════════════════════════════════════
//  Part J: 空状态与加载状态
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part J: 空状态与加载状态 ══\n');

test('PASS 空状态 — 无作品时显示提示', () => {
  assert.ok(html.includes('暂无作品'),
    'Must show "暂无作品" when list is empty');
});

test('PASS 加载状态 — 显示加载动画', () => {
  assert.ok(html.includes('fa-spinner') && html.includes('fa-pulse'),
    'Must show spinner during loading');
});

// ═══════════════════════════════════════════════════════════════
//  Part K: 详情弹窗
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part K: 详情弹窗 ══\n');

test('PASS 详情 — 使用现有 openModal 基础设施', () => {
  assert.ok(html.includes('openModal('),
    'Must reuse existing openModal for detail view');
});

test('PASS 详情 — 显示完整字段', () => {
  const detailMatch = html.match(/async function showWorkDetail[\s\S]*?^[\t ]*}/m);
  assert.ok(detailMatch, 'showWorkDetail function must exist');
  const detailFn = detailMatch[0];
  assert.ok(detailFn.includes('类型'), 'Must show task type');
  assert.ok(detailFn.includes('状态'), 'Must show status');
  assert.ok(detailFn.includes('模型'), 'Must show model');
  assert.ok(detailFn.includes('创建时间'), 'Must show creation time');
  assert.ok(detailFn.includes('提示词'), 'Must show prompt');
});

// ═══════════════════════════════════════════════════════════════
//  Part L: Sprint 3.3.2 Patch — 登录恢复验证
// ═══════════════════════════════════════════════════════════════

console.log('\n══ Part L: 登录恢复验证 ══\n');

test('PASS 手机号输入框恢复 — loginPhone 存在', () => {
  assert.ok(html.includes('id="loginPhone"'),
    'loginPhone input must exist');
  assert.ok(!html.includes('id="loginEmail"'),
    'loginEmail input must be removed');
});

test('PASS 手机号输入框恢复 — type="tel"', () => {
  assert.ok(html.includes('type="tel"'),
    'Input type must be tel for phone number');
});

test('PASS 密码输入框恢复 — loginPassword 存在', () => {
  assert.ok(html.includes('id="loginPassword"'),
    'loginPassword input must exist');
  assert.ok(html.includes('type="password"'),
    'Password input type must be password');
});

test('PASS 登录接口正常 — 调用 /auth/enterprise/login', () => {
  const authJs = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'auth.js'), 'utf8'
  );
  assert.ok(authJs.includes("/auth/enterprise/login"),
    'Must call /auth/enterprise/login endpoint');
  assert.ok(authJs.includes('email: phone'),
    'Must map phone value to email field for backend compatibility');
});

test('PASS JWT正常 — Token 保存到 sessionStorage', () => {
  const authJs = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'auth.js'), 'utf8'
  );
  assert.ok(authJs.includes("setToken(result.token)"),
    'Token must be saved via setToken');
  assert.ok(authJs.includes("sessionStorage.setItem('yj_user'"),
    'User info must be saved to sessionStorage');
});

test('PASS 登录成功进入企业首页 — hideLogin 调用', () => {
  assert.ok(html.includes('hideLogin()'),
    'Must call hideLogin on success');
  assert.ok(html.includes("'登录成功，欢迎回来！'"),
    'Must show success toast');
});

test('PASS 我的作品入口仍存在', () => {
  assert.ok(html.includes('data-page="myworks"'),
    'myworks nav item must still exist');
  assert.ok(html.includes("case 'myworks'"),
    'myworks case must still exist in render switch');
  assert.ok(html.includes('function renderMyWorks'),
    'renderMyWorks must still exist');
});

test('PASS Sprint 3.3.2功能不受影响 — 所有作品函数存在', () => {
  assert.ok(html.includes('function loadMyWorks'),
    'loadMyWorks must still exist');
  assert.ok(html.includes('function renderWorkCard'),
    'renderWorkCard must still exist');
  assert.ok(html.includes('function deleteWork'),
    'deleteWork must still exist');
  assert.ok(html.includes('function playVideo'),
    'playVideo must still exist');
  assert.ok(html.includes('function closeVideoPlayer'),
    'closeVideoPlayer must still exist');
  assert.ok(html.includes('function showWorkDetail'),
    'showWorkDetail must still exist');
});

test('PASS 登录弹窗UI — 手机号标签和提示文案', () => {
  assert.ok(html.includes('>手机号<'),
    'Label must show 手机号');
  assert.ok(html.includes('请输入手机号'),
    'Placeholder must show 请输入手机号');
  assert.ok(html.includes('请使用企业账号手机号登录创作平台'),
    'Subtitle must mention 手机号');
});

test('PASS handleLogin 使用 loginPhone 输入', () => {
  assert.ok(html.includes("getElementById('loginPhone')"),
    'handleLogin must read from loginPhone');
  assert.ok(html.includes('请输入手机号'),
    'Validation must say 请输入手机号');
});

test('PASS 无 loginEmail 残留引用', () => {
  assert.ok(!html.includes('loginEmail'),
    'No loginEmail references should remain');
  assert.ok(!html.includes('企业邮箱'),
    'No 企业邮箱 references should remain');
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
