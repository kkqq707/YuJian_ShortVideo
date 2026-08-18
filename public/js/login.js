/**
 * YuJian Enterprise 登录页增强 — Auth-Rebuild-004
 *
 * 依赖：YuJianAPI (public/js/api.js)、YuJianAuth (public/js/auth.js)，需在两者之后引入
 *
 * 职责（全部为本阶段新增 UI 逻辑，不触碰 Studio / Admin / Agent 登录）：
 *   1. 账号密码登录 / 验证码登录 Tab 切换
 *   2. 获取验证码按钮 60s 倒计时（倒计时期间禁止再次点击 / 重复发送）
 *   3. 验证码登录
 *   4. 忘记密码弹窗（手机号 + 验证码 + 新密码）
 *   5. 首次设置密码弹窗（登录接口返回 needSetPassword=true 时触发）
 *
 * 错误文案全部直接透传后端 message，前端不重新定义。
 */

(function () {
  'use strict';

  var CODE_COOLDOWN_SEC = 60; // 获取验证码倒计时（秒）

  // ─── 记住该账户（Auth-Rebuild-005） ──────────────────────────────────
  // 仅把账号标识（手机号）写入 localStorage；绝不保存 password / token / userInfo。
  var REMEMBER_KEY = 'yj_remembered_account';

  function readRememberedAccount() {
    try {
      var raw = localStorage.getItem(REMEMBER_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      return (data && typeof data.phone === 'string' && data.phone) ? data : null;
    } catch (_) {
      return null;
    }
  }

  // phone 为空 → 移除存储（未勾选即显式清除曾记忆的账号）
  function saveRememberedAccount(phone) {
    try {
      if (phone) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ phone: phone }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch (_) { /* storage 异常静默降级，不阻塞登录 */ }
  }

  // 登录成功统一钩子：读取当前活跃登录 Tab 的手机号 + 勾选态，落存储。
  // 仅在 handleLoginSuccess 走到完整成功分支（已跳过 needSetPassword）后调用。
  function persistRememberedAccountAfterLogin() {
    var remember = document.getElementById('rememberAccount');
    if (!remember) return;
    var paneCode = document.getElementById('loginPaneCode');
    var useCode = paneCode && paneCode.style.display !== 'none';
    var phoneEl = document.getElementById(useCode ? 'codeLoginPhone' : 'loginPhone');
    var phone = phoneEl ? (phoneEl.value || '').trim() : '';
    saveRememberedAccount(remember.checked ? phone : '');
  }

  // 页面加载时：有记忆 → 恢复勾选态并预填两 Tab 手机号；无 → 勾选框置空
  window.applyRememberedAccount = function () {
    var remember = document.getElementById('rememberAccount');
    var data = readRememberedAccount();
    if (remember) remember.checked = !!data;
    if (data) {
      var loginPhone = document.getElementById('loginPhone');
      var codeLoginPhone = document.getElementById('codeLoginPhone');
      if (loginPhone && !loginPhone.value) loginPhone.value = data.phone;
      if (codeLoginPhone && !codeLoginPhone.value) codeLoginPhone.value = data.phone;
    }
  };

  // ─── 登录成功后的统一处理（账号密码 / 验证码两条登录链路共用） ──────────
  // 被 enterprise.html 内联 handleLogin 与下方 handleCodeLogin 调用。
  window.handleLoginSuccess = function (result) {
    // 首次设置密码：登录接口返回 needSetPassword=true（Auth-Rebuild-003 预留接入点）
    if (result && result.needSetPassword === true) {
      showSetPasswordModal();
      return;
    }
    hideLogin();
    showToast('登录成功，欢迎回来！', 'success');
    updateUserDisplay(result.userInfo);
    recoverPendingTasks();
    // Auth-Rebuild-005: 确认登录成功后才落「记住该账户」（仅手机号）
    persistRememberedAccountAfterLogin();
  };

  // 恢复未完成任务（与内联旧逻辑保持一致）
  function recoverPendingTasks() {
    if (!window.YuJianVideoTask || typeof YuJianVideoTask.recoverIncompleteTasks !== 'function') return;
    try {
      YuJianVideoTask.recoverIncompleteTasks({
        onUpdate: function (t) { if (typeof updateTaskStatusDisplay === 'function') updateTaskStatusDisplay(t); if (typeof refreshMyWorksIfActive === 'function') refreshMyWorksIfActive(); },
        onSuccess: function (t) { if (typeof handleTaskSuccess === 'function') handleTaskSuccess(t); if (typeof refreshMyWorksIfActive === 'function') refreshMyWorksIfActive(); },
        onFailed: function (t) { if (typeof handleTaskFailed === 'function') handleTaskFailed(t); if (typeof refreshMyWorksIfActive === 'function') refreshMyWorksIfActive(); }
      });
    } catch (_) { /* 恢复失败不影响登录 */ }
  }

  // ─── Tab 切换：账号密码登录 / 验证码登录 ────────────────────────────────
  window.switchLoginTab = function (tab) {
    var isPassword = tab === 'password';
    var tabPw = document.getElementById('tabPassword');
    var tabCode = document.getElementById('tabCode');
    var panePw = document.getElementById('loginPanePassword');
    var paneCode = document.getElementById('loginPaneCode');
    if (tabPw) tabPw.classList.toggle('active', isPassword);
    if (tabCode) tabCode.classList.toggle('active', !isPassword);
    if (panePw) panePw.style.display = isPassword ? '' : 'none';
    if (paneCode) paneCode.style.display = isPassword ? 'none' : '';
    clearLoginErrors();
  };

  function clearLoginErrors() {
    var e = document.getElementById('loginError');
    if (e) e.textContent = '';
    var e2 = document.getElementById('codeLoginError');
    if (e2) e2.textContent = '';
  }

  // ─── 获取验证码：60s 倒计时 ─────────────────────────────────────────────
  function startCountdown(btnId) {
    var btn = document.getElementById(btnId);
    if (!btn || btn.disabled) return; // 倒计时期间禁止再次点击
    var remaining = CODE_COOLDOWN_SEC;
    btn.disabled = true;
    btn.textContent = remaining + 's';
    var timer = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = '重新获取';
      } else {
        btn.textContent = remaining + 's';
      }
    }, 1000);
  }

  // 验证码登录 · 获取验证码（purpose=login）
  window.handleGetLoginCode = async function () {
    var phoneEl = document.getElementById('codeLoginPhone');
    var errEl = document.getElementById('codeLoginError');
    var phone = (phoneEl.value || '').trim();
    if (!phone) { errEl.textContent = '请输入手机号'; return; }
    errEl.textContent = '';
    try {
      await YuJianAuth.sendCode({ phone: phone, purpose: 'login' });
      startCountdown('getCodeBtn');
      showToast('验证码已发送', 'success');
    } catch (err) {
      errEl.textContent = err.message || '验证码发送失败';
    }
  };

  // 忘记密码 · 获取验证码（purpose=reset）
  window.handleGetForgotCode = async function () {
    var phoneEl = document.getElementById('forgotPhone');
    var errEl = document.getElementById('forgotError');
    var phone = (phoneEl.value || '').trim();
    if (!phone) { errEl.textContent = '请输入手机号'; return; }
    errEl.textContent = '';
    try {
      await YuJianAuth.sendCode({ phone: phone, purpose: 'reset' });
      startCountdown('forgotGetCodeBtn');
      showToast('验证码已发送', 'success');
    } catch (err) {
      errEl.textContent = err.message || '验证码发送失败';
    }
  };

  // ─── 验证码登录 ─────────────────────────────────────────────────────────
  window.handleCodeLogin = async function () {
    var btn = document.getElementById('codeLoginBtn');
    var phoneEl = document.getElementById('codeLoginPhone');
    var codeEl = document.getElementById('codeLoginCode');
    var errEl = document.getElementById('codeLoginError');

    var phone = (phoneEl.value || '').trim();
    var code = (codeEl.value || '').trim();

    if (!phone) { errEl.textContent = '请输入手机号'; return; }
    if (!code) { errEl.textContent = '请输入验证码'; return; }

    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = '登录中...';

    try {
      var result = await YuJianAuth.loginByCode({ phone: phone, code: code });
      handleLoginSuccess(result);
    } catch (err) {
      console.error('[Auth] 验证码登录失败', err);
      errEl.textContent = err.message || '登录失败，请重试';
    } finally {
      btn.disabled = false;
      btn.textContent = '登 录';
    }
  };

  // ─── 忘记密码弹窗 ───────────────────────────────────────────────────────
  window.showForgotModal = function () {
    var overlay = document.getElementById('forgotOverlay');
    if (overlay) overlay.classList.add('show');
  };

  window.closeForgotModal = function () {
    var overlay = document.getElementById('forgotOverlay');
    if (overlay) overlay.classList.remove('show');
    var e = document.getElementById('forgotError');
    if (e) e.textContent = '';
    var p = document.getElementById('forgotPassword');
    if (p) p.value = '';
  };

  window.handleForgotPassword = async function () {
    var btn = document.getElementById('forgotBtn');
    var phoneEl = document.getElementById('forgotPhone');
    var codeEl = document.getElementById('forgotCode');
    var passwordEl = document.getElementById('forgotPassword');
    var errEl = document.getElementById('forgotError');

    var phone = (phoneEl.value || '').trim();
    var code = (codeEl.value || '').trim();
    var password = passwordEl.value || '';

    if (!phone) { errEl.textContent = '请输入手机号'; return; }
    if (!code) { errEl.textContent = '请输入验证码'; return; }
    if (!password) { errEl.textContent = '请输入新密码'; return; }

    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = '提交中...';

    try {
      var result = await YuJianAuth.forgotPassword({ phone: phone, code: code, password: password });
      closeForgotModal();
      showToast(result.message || '密码重置成功', 'success'); // 后端返回：密码重置成功
    } catch (err) {
      console.error('[Auth] 忘记密码失败', err);
      errEl.textContent = err.message || '密码重置失败';
    } finally {
      btn.disabled = false;
      btn.textContent = '确 认';
    }
  };

  // ─── 首次设置密码弹窗 ───────────────────────────────────────────────────
  window.showSetPasswordModal = function () {
    var overlay = document.getElementById('setPasswordOverlay');
    if (overlay) overlay.classList.add('show');
    var input = document.getElementById('setPasswordInput');
    if (input) input.focus();
  };

  window.closeSetPasswordModal = function () {
    var overlay = document.getElementById('setPasswordOverlay');
    if (overlay) overlay.classList.remove('show');
    var e = document.getElementById('setPasswordError');
    if (e) e.textContent = '';
    var input = document.getElementById('setPasswordInput');
    if (input) input.value = '';
  };

  window.handleSetPassword = async function () {
    var btn = document.getElementById('setPasswordBtn');
    var input = document.getElementById('setPasswordInput');
    var errEl = document.getElementById('setPasswordError');
    var password = input.value || '';

    if (!password) { errEl.textContent = '请输入新密码'; return; }

    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = '提交中...';

    try {
      var result = await YuJianAuth.setPassword({ password: password });
      closeSetPasswordModal();
      // 密码设置成功，继续登录流程
      hideLogin();
      showToast(result.message || '密码设置成功', 'success');
      var userInfo = YuJianAuth.getUserInfo();
      if (userInfo) updateUserDisplay(userInfo);
      recoverPendingTasks();
    } catch (err) {
      console.error('[Auth] 设置密码失败', err);
      errEl.textContent = err.message || '密码设置失败';
    } finally {
      btn.disabled = false;
      btn.textContent = '确 认';
    }
  };

  // ─── 键盘回车支持（与内联旧逻辑风格一致） ───────────────────────────────
  function bindEnter(elId, handler) {
    var el = document.getElementById(elId);
    if (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handler();
        }
      });
    }
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    applyRememberedAccount(); // Auth-Rebuild-005: 打开页面时恢复勾选态并预填手机号
    bindEnter('codeLoginPhone', function () { var c = document.getElementById('codeLoginCode'); if (c) c.focus(); });
    bindEnter('codeLoginCode', window.handleCodeLogin);
    bindEnter('forgotPhone', function () { var c = document.getElementById('forgotCode'); if (c) c.focus(); });
    bindEnter('forgotCode', function () { var p = document.getElementById('forgotPassword'); if (p) p.focus(); });
    bindEnter('forgotPassword', window.handleForgotPassword);
    bindEnter('setPasswordInput', window.handleSetPassword);
  });

})();
