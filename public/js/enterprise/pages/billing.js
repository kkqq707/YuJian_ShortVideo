/**
 * YuJian Enterprise — Billing Page Render
 *
 * DigitalHuman-Rebuild-005-A: 数据来源真实化（P0）
 *   - 余额：GET /api/enterprise/quota/balance        → { balance, plan_id, expire_at }
 *   - 明细：GET /api/enterprise/quota/logs?page&pageSize → { list, total, page, pageSize }
 *   - 保留 renderBilling() 入口（app.js render() 分发不变），仅替换数据来源。
 *   - 增加 loading / empty / error 状态 + 重新加载按钮，接口失败不白屏。
 */

(function () {
    'use strict';

    // ─── change_type 中文映射 ─────────────────────────────
    var TYPE_LABELS = { recharge: '充值', consume: '使用', adjust: '调整', refund: '退款', order: '订单' };
    // 徽章样式映射（沿用 status-badge 体系：active 绿 / pending 橙 / processing 蓝 / danger 红 / inactive 灰）
    var TYPE_BADGES = { recharge: 'active', consume: 'pending', adjust: 'processing', refund: 'danger', order: 'inactive' };

    // ─── 工具函数 ─────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function fmtNum(v) {
        var n = Number(v);
        return isNaN(n) ? '--' : n.toLocaleString('en-US');
    }

    function pad(x) { return (x < 10 ? '0' : '') + x; }

    function fmtDate(v) {
        if (!v) return '--';
        var d = new Date(v);
        if (isNaN(d.getTime())) return String(v);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
            + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function fmtExpire(v) {
        if (!v) return '永久有效';
        return fmtDate(v);
    }

    function typeLabel(t) { return TYPE_LABELS[t] || t || '—'; }
    function typeBadge(t) { return TYPE_BADGES[t] || 'inactive'; }

    // 积分变化：正数 +（绿）/ 负数 -（红）
    function signPoints(p) {
        var n = Number(p) || 0;
        return { text: (n > 0 ? '+' : '') + n.toLocaleString('en-US'), positive: n > 0 };
    }

    // ─── 状态行（loading / empty / error） ─────────────────
    function loadingRow() {
        return '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-sub)"><i class="fas fa-spinner fa-spin"></i> 加载中...</td></tr>';
    }

    function emptyRow() {
        return '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-sub)">暂无明细</td></tr>';
    }

    function errorRow(errMsg) {
        return '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-sub)">'
            + '<div style="margin-bottom:12px"><i class="fas fa-exclamation-triangle"></i> 加载失败'
            + (errMsg ? '：' + esc(errMsg) : '') + '</div>'
            + '<button class="btn btn-outline" onclick="YJ.pages.billing.reload()"><i class="fas fa-redo"></i> 重新加载</button>'
            + '</td></tr>';
    }

    // ─── 积分明细行 ────────────────────────────────────────
    function logRow(r) {
        var sp = signPoints(r.points_change);
        return '<tr>'
            + '<td><span class="status-badge status-' + typeBadge(r.change_type) + '">' + esc(typeLabel(r.change_type)) + '</span></td>'
            + '<td>' + esc(r.remark || '—') + '</td>'
            + '<td style="color:' + (sp.positive ? '#16a34a' : '#dc2626') + ';font-weight:600">' + esc(sp.text) + '</td>'
            + '<td style="color:var(--text-sub)">' + esc(fmtDate(r.created_at)) + '</td>'
            + '</tr>';
    }

    // ─── 统计卡片（余额来自真实接口） ───────────────────────
    function statCards(balance, expireAt) {
        function card(label, value, color) {
            return '<div class="card" style="padding:20px;margin:0">'
                + '<div class="stat-label" style="font-size:13px;color:var(--text-sub);margin-bottom:8px">' + label + '</div>'
                + '<div style="font-size:22px;font-weight:700;' + (color ? 'color:' + color + ';' : '') + '">' + esc(value) + '</div>'
                + '</div>';
        }
        return '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px">'
            + card('💰 当前余额', fmtNum(balance), 'var(--success)')
            + card('⏰ 有效期', fmtExpire(expireAt), null)
            + '</div>';
    }

    // ─── 充值套餐（静态展示；对齐 /quota/plans 属 P2，本阶段不动） ──
    function planCards() {
        return '' +
            '<div class="card" style="margin-bottom:24px">' +
            '<div class="card-header"><h3>🛒 积分充值</h3><span style="font-size:13px;color:var(--text-sub)">多买多送，即时到账</span></div>' +
            '<div class="card-body">' +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">' +
            '<div class="plan-card" style="padding:20px;border:1px solid var(--border-glass);border-radius:12px;cursor:pointer;transition:all 0.2s;text-align:center;background:rgba(255,255,255,0.02)">' +
            '<div style="font-size:24px;font-weight:700;margin-bottom:4px">1,000</div><div style="font-size:13px;color:var(--text-sub);margin-bottom:12px">积分</div>' +
            '<div style="font-size:20px;font-weight:700;color:var(--primary);margin-bottom:12px">¥99</div>' +
            '<button class="btn btn-outline" style="width:100%">立即购买</button></div>' +
            '<div class="plan-card" style="padding:20px;border:1px solid var(--primary);border-radius:12px;cursor:pointer;transition:all 0.2s;text-align:center;background:rgba(99,102,241,0.08);position:relative">' +
            '<div style="position:absolute;top:-10px;right:12px;background:var(--primary);color:#fff;font-size:11px;padding:2px 8px;border-radius:10px">热门</div>' +
            '<div style="font-size:24px;font-weight:700;margin-bottom:4px">31,500</div><div style="font-size:13px;color:var(--text-sub);margin-bottom:12px">积分</div>' +
            '<div style="font-size:20px;font-weight:700;color:var(--primary);margin-bottom:12px">¥2,999</div>' +
            '<button class="btn btn-primary" style="width:100%">立即购买</button></div>' +
            '<div class="plan-card" style="padding:20px;border:1px solid var(--border-glass);border-radius:12px;cursor:pointer;transition:all 0.2s;text-align:center;background:rgba(255,255,255,0.02)">' +
            '<div style="font-size:24px;font-weight:700;margin-bottom:4px">330,000</div><div style="font-size:13px;color:var(--text-sub);margin-bottom:12px">积分</div>' +
            '<div style="font-size:20px;font-weight:700;color:var(--primary);margin-bottom:12px">¥30,000</div>' +
            '<button class="btn btn-outline" style="width:100%">立即购买</button></div>' +
            '<div class="plan-card" style="padding:20px;border:1px solid var(--border-glass);border-radius:12px;cursor:pointer;transition:all 0.2s;text-align:center;background:rgba(255,255,255,0.02)">' +
            '<div style="font-size:24px;font-weight:700;margin-bottom:4px">1,150,000</div><div style="font-size:13px;color:var(--text-sub);margin-bottom:12px">积分</div>' +
            '<div style="font-size:20px;font-weight:700;color:var(--primary);margin-bottom:12px">¥100,000</div>' +
            '<button class="btn btn-outline" style="width:100%">立即购买</button></div>' +
            '</div></div></div>';
    }

    // ─── 页面拼装 ──────────────────────────────────────────
    function pageHtml(state) {
        var bal = state.balance || {};
        var logs = state.logs || {};
        var list = logs.list || [];
        var rows;
        if (state.state === 'loading') {
            rows = loadingRow();
        } else if (state.state === 'error') {
            rows = errorRow(state.message);
        } else if (list.length) {
            rows = list.map(logRow).join('');
        } else {
            rows = emptyRow();
        }

        return statCards(bal.balance, bal.expire_at)
            + planCards()
            + '<div class="card">'
            + '<div class="card-header"><h3>📋 积分明细</h3></div>'
            + '<div class="table-wrap">'
            + '<table>'
            + '<thead><tr><th>类型</th><th>描述</th><th>积分变化</th><th>时间</th></tr></thead>'
            + '<tbody>' + rows + '</tbody>'
            + '</table>'
            + '</div>'
            + '</div>';
    }

    // ─── 数据加载（loading → ready/empty/error） ───────────
    var _seq = 0;

    function loadBilling() {
        var seq = ++_seq;
        var container = document.getElementById('mainContent');
        if (!container) return;
        // 离开 billing 页面后丢弃过期响应，避免覆盖其它页面
        var isActive = function () {
            return seq === _seq && window.APP && window.APP.currentPage === 'billing';
        };

        container.innerHTML = pageHtml({ state: 'loading' });

        var balanceP = YuJianAPI.get('/enterprise/quota/balance');
        var logsP = YuJianAPI.get('/enterprise/quota/logs?page=1&pageSize=20');

        Promise.all([balanceP, logsP])
            .then(function (results) {
                if (!isActive()) return;
                container.innerHTML = pageHtml({
                    state: 'ready',
                    balance: results[0] || {},
                    logs: results[1] || {}
                });
            })
            .catch(function (err) {
                if (!isActive()) return;
                console.error('[Billing] 数据加载失败:', err);
                container.innerHTML = pageHtml({
                    state: 'error',
                    message: (err && err.message) || ''
                });
            });
    }

    // ─── 入口（保持签名，app.js render() 分发不变） ─────────
    function renderBilling() {
        // 先渲染 loading 骨架，再异步拉取真实数据；不阻塞页面
        setTimeout(loadBilling, 0);
        return pageHtml({ state: 'loading' });
    }

    // ─── Expose to YJ.pages ───────────────────────────────
    window.YJ = window.YJ || {};
    window.YJ.pages = window.YJ.pages || {};
    window.YJ.pages.billing = {
        render: renderBilling,
        reload: loadBilling
    };

    // ─── Backward Compatibility Bridge ────────────────────
    window.renderBilling = renderBilling;

})();
