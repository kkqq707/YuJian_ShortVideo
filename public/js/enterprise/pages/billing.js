/**
 * YuJian Enterprise — Billing Page Render
 *
 * Phase 2-D-2-A-1: 从 enterprise.html inline 提取
 */

(function () {
    'use strict';

    function renderBilling() {
        var APP = window.APP;
        const e = APP.enterprise;
        const usagePercent = Math.round(e.usedQuota / e.totalQuota * 100);
        return `
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
                    <div class="card" style="padding:20px;margin:0">
                        <div class="stat-label" style="font-size:13px;color:var(--text-sub);margin-bottom:8px">💰 账户积分</div>
                        <div style="font-size:22px;font-weight:700;color:var(--success)">${(e.totalQuota - e.usedQuota).toLocaleString()}</div>
                    </div>
                    <div class="card" style="padding:20px;margin:0">
                        <div class="stat-label" style="font-size:13px;color:var(--text-sub);margin-bottom:8px">📊 已使用</div>
                        <div style="font-size:22px;font-weight:700">${e.usedQuota.toLocaleString()}</div>
                    </div>
                    <div class="card" style="padding:20px;margin:0">
                        <div class="stat-label" style="font-size:13px;color:var(--text-sub);margin-bottom:8px">📈 累计充值</div>
                        <div style="font-size:22px;font-weight:700">${e.totalQuota.toLocaleString()}</div>
                        <div class="progress-bar" style="margin-top:8px"><div class="fill" style="width:${usagePercent}%"></div></div>
                    </div>
                    <div class="card" style="padding:20px;margin:0">
                        <div class="stat-label" style="font-size:13px;color:var(--text-sub);margin-bottom:8px">⏰ 有效期</div>
                        <div style="font-size:22px;font-weight:700">永久有效</div>
                    </div>
                </div>

                <div class="card" style="margin-bottom:24px">
                    <div class="card-header">
                        <h3>🛒 积分充值</h3>
                        <span style="font-size:13px;color:var(--text-sub)">多买多送，即时到账</span>
                    </div>
                    <div class="card-body">
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
                            <div class="plan-card" style="padding:20px;border:1px solid var(--border-glass);border-radius:12px;cursor:pointer;transition:all 0.2s;text-align:center;background:rgba(255,255,255,0.02)">
                                <div style="font-size:24px;font-weight:700;margin-bottom:4px">1,000</div>
                                <div style="font-size:13px;color:var(--text-sub);margin-bottom:12px">积分</div>
                                <div style="font-size:20px;font-weight:700;color:var(--primary);margin-bottom:12px">¥99</div>
                                <button class="btn btn-outline" style="width:100%">立即购买</button>
                            </div>
                            <div class="plan-card" style="padding:20px;border:1px solid var(--primary);border-radius:12px;cursor:pointer;transition:all 0.2s;text-align:center;background:rgba(99,102,241,0.08);position:relative">
                                <div style="position:absolute;top:-10px;right:12px;background:var(--primary);color:#fff;font-size:11px;padding:2px 8px;border-radius:10px">热门</div>
                                <div style="font-size:24px;font-weight:700;margin-bottom:4px">31,500</div>
                                <div style="font-size:13px;color:var(--text-sub);margin-bottom:12px">积分</div>
                                <div style="font-size:20px;font-weight:700;color:var(--primary);margin-bottom:12px">¥2,999</div>
                                <button class="btn btn-primary" style="width:100%">立即购买</button>
                            </div>
                            <div class="plan-card" style="padding:20px;border:1px solid var(--border-glass);border-radius:12px;cursor:pointer;transition:all 0.2s;text-align:center;background:rgba(255,255,255,0.02)">
                                <div style="font-size:24px;font-weight:700;margin-bottom:4px">330,000</div>
                                <div style="font-size:13px;color:var(--text-sub);margin-bottom:12px">积分</div>
                                <div style="font-size:20px;font-weight:700;color:var(--primary);margin-bottom:12px">¥30,000</div>
                                <button class="btn btn-outline" style="width:100%">立即购买</button>
                            </div>
                            <div class="plan-card" style="padding:20px;border:1px solid var(--border-glass);border-radius:12px;cursor:pointer;transition:all 0.2s;text-align:center;background:rgba(255,255,255,0.02)">
                                <div style="font-size:24px;font-weight:700;margin-bottom:4px">1,150,000</div>
                                <div style="font-size:13px;color:var(--text-sub);margin-bottom:12px">积分</div>
                                <div style="font-size:20px;font-weight:700;color:var(--primary);margin-bottom:12px">¥100,000</div>
                                <button class="btn btn-outline" style="width:100%">立即购买</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><h3>📋 积分明细</h3></div>
                    <div class="table-wrap">
                        <table>
                            <thead><tr><th>类型</th><th>描述</th><th>积分变化</th><th>时间</th></tr></thead>
                            <tbody>
                                ${APP.billingRecords.map(r => `
                                    <tr>
                                        <td><span class="status-badge status-${r.type === '使用' ? 'pending' : 'active'}">${r.type}</span></td>
                                        <td>${r.desc || r.plan + ' 充值'}</td>
                                        <td style="color:${r.type === '使用' ? '#dc2626' : '#16a34a'};font-weight:600">${r.type === '使用' ? '-' : '+'}${r.amount}</td>
                                        <td style="color:var(--text-sub)">${r.time}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
    }

    // ─── Expose to YJ.pages ───────────────────────────────
    window.YJ = window.YJ || {};
    window.YJ.pages = window.YJ.pages || {};
    window.YJ.pages.billing = {
        render: renderBilling
    };

    // ─── Backward Compatibility Bridge ────────────────────
    window.renderBilling = renderBilling;

})();
