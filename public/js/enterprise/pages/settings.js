/**
 * YuJian Enterprise — Personal Center (个人中心) Page Render
 *
 * Auth-Rebuild-010-A: 「个人中心」简化为单页面（纵向三卡片，深色玻璃拟态）
 *   卡片1 个人信息（企业Logo / 企业名称 / 手机号 / 套餐 / 有效期）
 *   卡片2 修改密码（Auth-Rebuild-011 全量实现：弹窗 → 校验 → POST 改密 → toast，保持登录）
 *   卡片3 退出登录（confirm → YuJianAuth.logout() → showLogin() → toast）
 * 唯一事实源：本文件（enterprise.html 内联 renderSettings 已删除）
 *
 * 布局：去除左侧二级菜单（个人资料/账户安全/积分中心/我的作品），改为单列卡片。
 *   - 删除：switchSub 子页切换、积分中心子页（billing 独立存在）、我的作品跳转（myworks 独立存在）
 *
 * 数据接入（均为已存在接口，零新增）：
 *   GET /api/enterprise/settings         → 个人信息（企业基本信息 + 企业Logo）
 *   GET /api/enterprise/quota/plans      → 套餐名映射（只读辅助，失败静默降级）
 *   手机号 → sessionStorage.yj_user.phone（YuJianAuth.getUserInfo()，脱敏显示）
 *
 * 退出登录：YuJianAuth.logout() → 清理页面状态 → showLogin()
 * 修改密码：POST /api/auth/enterprise/change-password（YuJianAPI.post 直连，不改 auth.js/login.js）
 *   弹窗 changePasswordOverlay 复用 login-overlay/login-modal 视觉；成功后关闭弹窗 + toast，保持登录
 */

(function () {
    'use strict';

    // ─── 工具函数 ──────────────────────────────────────────
    function esc(v) {
        if (v === null || v === undefined) return '';
        if (typeof escapeHtml === 'function') return escapeHtml(v);
        return String(v);
    }

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    // 日期格式：YYYY-MM-DD
    function formatDate(v) {
        if (!v) return '永久有效';
        var d = new Date(v);
        if (isNaN(d.getTime())) return esc(v);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    // 手机号脱敏：138****8888
    function maskPhone(phone) {
        if (!phone) return '未绑定';
        var s = String(phone);
        if (s.length >= 7) return s.slice(0, 3) + '****' + s.slice(-4);
        return s;
    }

    // 套餐 id → 名称（plans 来自 /api/enterprise/quota/plans，只读辅助）
    function mapPlanName(plans, planId) {
        if (planId === null || planId === undefined) return '—';
        if (plans && plans.length) {
            for (var i = 0; i < plans.length; i++) {
                if (String(plans[i].id) === String(planId)) {
                    return plans[i].name || ('套餐 #' + planId);
                }
            }
        }
        return '套餐 #' + planId;
    }

    // ─── 页面壳：单列三卡片（个人信息 / 修改密码 / 退出登录） ──
    function render() {
        return `
            <div class="yj-settings-page"><div class="yj-pc-layout">
                <div class="yj-pc-content">
                    ${renderProfileCard()}
                    ${renderPasswordCard()}
                    ${renderLogoutCard()}
                </div>
            </div></div>
        `;
    }

    // 卡片1：个人信息（企业Logo / 企业名称 / 手机号 / 套餐 / 有效期）
    function renderProfileCard() {
        return `
                <div class="card">
                    <div class="card-header"><h3>👤 个人信息</h3></div>
                    <div class="card-body" id="yjProfileInfo">
                        <div class="loading-skeleton"><i class="fas fa-spinner fa-pulse"></i> 加载中...</div>
                    </div>
                </div>
            `;
    }

    // 卡片2：修改密码（Auth-Rebuild-011：弹窗改密，POST /api/auth/enterprise/change-password）
    function renderPasswordCard() {
        return `
                <div class="card">
                    <div class="card-header"><h3>🔑 修改密码</h3></div>
                    <div class="card-body">
                        <div class="form-group">
                            <label>登录密码</label>
                            <div style="display:flex;align-items:center;gap:12px">
                                <input type="text" value="●●●●●●●●" disabled style="flex:1">
                                <button type="button" class="btn btn-outline" onclick="YJ.pages.settings.openChangePassword()">
                                    <i class="fas fa-key"></i> 修改密码
                                </button>
                            </div>
                        </div>
                        <div style="margin-top:12px;font-size:12px;color:var(--text-sub)">
                            <i class="fas fa-info-circle"></i> 修改后请使用新密码登录
                        </div>
                    </div>
                </div>
            `;
    }

    // 卡片3：退出登录（YuJianAuth.logout()）
    function renderLogoutCard() {
        return `
                <div class="yj-settings-danger card"></div>
                    <div class="card-body">
                        <div class="form-group">
                            <label>退出当前账号</label>
                            <button type="button" class="btn btn-outline btn-danger" onclick="YJ.pages.settings.logout()">
                                <i class="fas fa-right-from-bracket"></i> 退出登录
                            </button>
                        </div>
                        <div style="margin-top:12px;font-size:12px;color:var(--text-sub)">
                            <i class="fas fa-info-circle"></i> 退出后需重新登录才能继续使用
                        </div>
                    </div>
                </div>
            `;
    }

    // 进入页面时初始化：加载个人信息数据
    function init() {
        loadProfile();
    }

    // ─── 个人信息（GET /api/enterprise/settings） ──────────
    function loadProfile() {
        var infoEl = document.getElementById('yjProfileInfo');
        if (!infoEl) return;
        infoEl.innerHTML = '<div class="loading-skeleton"><i class="fas fa-spinner fa-pulse"></i> 加载中...</div>';
        var settingsPromise = YuJianAPI.get('/enterprise/settings');
        // 套餐名映射为只读辅助：失败静默降级，不影响主体数据展示
        var plansPromise = YuJianAPI.get('/enterprise/quota/plans').catch(function () { return []; });

        Promise.all([settingsPromise, plansPromise])
            .then(function (results) {
                var settings = results[0] || {};
                var plans = results[1] || [];
                infoEl.innerHTML = renderProfileInfo(settings, plans);
            })
            .catch(function (err) {
                console.error('[PersonalCenter] 个人信息加载失败:', err);
                infoEl.innerHTML = renderError('个人信息加载失败');
            });
    }

    function renderProfileInfo(s, plans) {
        var companyName = esc(s.company_name || '');
        var brandLogo = s.brand_logo || '';
        var planName = esc(mapPlanName(plans, s.plan_id));
        var expireAt = formatDate(s.expire_at);
        var userInfo = (window.YuJianAuth && YuJianAuth.getUserInfo) ? YuJianAuth.getUserInfo() : null;
        var phone = (userInfo && userInfo.phone) ? maskPhone(userInfo.phone) : '未绑定';

        return `
                    <div class="form-group"><label>企业Logo</label>
                        ${brandLogo
                            ? '<img src="' + esc(brandLogo) + '" alt="企业Logo" style="max-height:48px;border-radius:8px;border:1px solid var(--border-glass)">'
                            : '<input type="text" value="未设置" disabled>'}
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                        <div class="form-group"><label>企业名称</label><input type="text" value="${companyName || '—'}" disabled></div>
                        <div class="form-group"><label>手机号</label><input type="text" value="${phone}" disabled></div>
                        <div class="form-group"><label>套餐</label><input type="text" value="${planName}" disabled></div>
                        <div class="form-group"><label>有效期</label><input type="text" value="${expireAt}" disabled></div>
                    </div>
                    <div style="margin-top:12px;font-size:12px;color:var(--text-sub)">
                        <i class="fas fa-info-circle"></i> 企业信息由代理商统一配置，如需修改请联系您的代理商
                    </div>
                `;
    }

    // ─── 修改密码（POST /api/auth/enterprise/change-password） ────
    // 弹窗（changePasswordOverlay）复用 login-overlay/login-modal 既有视觉；
    // 提交走 YuJianAPI.post 直连（自动携带 Bearer token），不改 auth.js/login.js。
    function openChangePassword() {
        var overlay = document.getElementById('changePasswordOverlay');
        if (overlay) overlay.classList.add('show');
        var first = document.getElementById('changeOldPassword');
        if (first) first.focus();
    }

    function closeChangePassword() {
        var overlay = document.getElementById('changePasswordOverlay');
        if (overlay) overlay.classList.remove('show');
        ['changeOldPassword', 'changeNewPassword', 'changeConfirmPassword'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        var e = document.getElementById('changePasswordError');
        if (e) e.textContent = '';
    }

    // 前端校验：非空 → 新密码 ≥6 位 → 两次一致；全部通过才发请求
    function submitChangePassword() {
        var btn = document.getElementById('changePasswordBtn');
        var oldEl = document.getElementById('changeOldPassword');
        var newEl = document.getElementById('changeNewPassword');
        var confirmEl = document.getElementById('changeConfirmPassword');
        var errEl = document.getElementById('changePasswordError');
        if (!btn || !oldEl || !newEl || !confirmEl || !errEl) return;

        var old_password = (oldEl.value || '').trim();
        var new_password = newEl.value || '';
        var confirm_password = confirmEl.value || '';

        if (!old_password) { errEl.textContent = '请输入原密码'; return; }
        if (!new_password) { errEl.textContent = '请输入新密码'; return; }
        if (new_password.length < 6) { errEl.textContent = '新密码至少6位'; return; }
        if (new_password !== confirm_password) { errEl.textContent = '两次输入的新密码不一致'; return; }

        errEl.textContent = '';
        btn.disabled = true;
        btn.textContent = '提交中...';

        YuJianAPI.post('/auth/enterprise/change-password', {
            old_password: old_password,
            new_password: new_password,
            confirm_password: confirm_password
        })
            .then(function (result) {
                // 成功：关闭弹窗 + toast，保持登录（服务端不重新签发 JWT）
                closeChangePassword();
                if (typeof showToast === 'function') {
                    showToast((result && result.message) || '密码修改成功', 'success');
                }
            })
            .catch(function (err) {
                console.error('[PersonalCenter] 修改密码失败', err);
                // 失败：内联直传后端 message，前端不重定义文案
                errEl.textContent = (err && err.message) || '密码修改失败';
            })
            .finally(function () {
                btn.disabled = false;
                btn.textContent = '确 认';
            });
    }

    // ─── 退出登录 ─────────────────────────────────────────
    function logout() {
        if (typeof confirm === 'function' && !confirm('确定要退出登录吗？')) return;

        // 清理凭证（yj_token / yj_user / yj_pending_task）
        try {
            if (window.YuJianAuth && YuJianAuth.logout) {
                YuJianAuth.logout();
            } else if (window.YuJianAPI) {
                YuJianAPI.clearToken();
                sessionStorage.removeItem('yj_user');
                sessionStorage.removeItem('yj_pending_task');
            }
        } catch (e) { /* 清理异常不影响退出 */ }

        // Auth-Rebuild-012: 退出登录后重置顶部/侧边栏用户标识与积分占位
        if (typeof resetUserDisplay === 'function') resetUserDisplay();

        // 清理页面状态
        if (window.APP) window.APP.currentPage = 'dashboard';
        try {
            if (typeof PageState !== 'undefined' && PageState.save) PageState.save('dashboard');
        } catch (e) { /* ignore */ }
        var content = document.getElementById('mainContent');
        if (content) content.innerHTML = '';
        document.querySelectorAll('.nav-item').forEach(function (el) { el.classList.remove('active'); });

        // 显示登录弹窗
        if (typeof showLogin === 'function') {
            showLogin();
            if (typeof showToast === 'function') showToast('已退出登录', 'success');
        }
    }

    // ─── 加载失败提示（含重试） ──────────────────────────
    function renderError(message) {
        return `
                <div class="empty-works">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>${esc(message)}</p>
                    <p class="sub-text"><button class="btn btn-outline btn-sm" onclick="YJ.pages.settings.reload()" style="margin-top:12px">重新加载</button></p>
                </div>
            `;
    }

    // 个人信息数据重新加载（供失败重试按钮使用）
    function reload() {
        loadProfile();
    }

    // ─── Expose to YJ.pages ───────────────────────────────
    window.YJ = window.YJ || {};
    window.YJ.pages = window.YJ.pages || {};
    window.YJ.pages.settings = {
        render: render,
        init: init,
        reload: reload,
        logout: logout,
        openChangePassword: openChangePassword,
        closeChangePassword: closeChangePassword,
        submitChangePassword: submitChangePassword
    };

    // ─── Backward Compatibility Bridge ────────────────────
    // enterprise.html 内联 render() 已收敛到 YJ.pages.settings.render；
    // 保留 window.renderSettings 以兼容 app.js（允许范围外，未修改）的
    // case 'settings' 分发（app.js:229 调用 renderSettings()），
    // 同时覆盖 app.js 初始渲染路径（其不调用 init，此处延迟补调默认子页）。
    window.renderSettings = function () {
        var html = render();
        setTimeout(function () { init(); }, 0);
        return html;
    };

})();
