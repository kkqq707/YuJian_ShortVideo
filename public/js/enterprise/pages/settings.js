/**
 * YuJian Enterprise — Settings Page Render
 *
 * Phase 2-D-2-A-2: 从 enterprise.html inline 提取
 */

(function () {
    'use strict';

    function renderSettings() {
        var APP = window.APP;
        const e = APP.enterprise;
        return `
                <div class="card">
                    <div class="card-header"><h3>🏢 企业基本信息</h3></div>
                    <div class="card-body">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                            <div class="form-group"><label>企业名称</label><input type="text" value="${e.name}" disabled></div>
                            <div class="form-group"><label>联系人</label><input type="text" value="${e.contact}" disabled></div>
                            <div class="form-group"><label>手机号</label><input type="text" value="${e.phone}" disabled></div>
                            <div class="form-group"><label>套餐</label><input type="text" value="${e.plan}" disabled></div>
                        </div>
                        <div style="margin-top:12px;font-size:12px;color:var(--text-sub)">
                            <i class="fas fa-info-circle"></i> 企业信息由代理商统一配置，如需修改请联系您的代理商
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><h3>🎨 品牌设置</h3></div>
                    <div class="card-body">
                        <div class="form-group"><label>企业Logo</label><input type="file" accept="image/*" disabled></div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                            <div class="form-group"><label>品牌名称</label><input type="text" value="${e.name} SaaS创作平台" disabled></div>
                        </div>
                        <div style="margin-top:12px;font-size:12px;color:var(--text-sub)">
                            <i class="fas fa-info-circle"></i> 品牌贴牌由代理商统一配置，如需修改请联系您的代理商
                        </div>
                    </div>
                </div>
            `;
    }

    // ─── Expose to YJ.pages ───────────────────────────────
    window.YJ = window.YJ || {};
    window.YJ.pages = window.YJ.pages || {};
    window.YJ.pages.settings = {
        render: renderSettings
    };

    // ─── Backward Compatibility Bridge ────────────────────
    window.renderSettings = renderSettings;

})();
