/**
 * YuJian Enterprise — Team Page Render
 *
 * DigitalHuman-Rebuild-005-B: 团队管理真实化（P0）
 *   - 数据来源：GET    /api/enterprise/team      → EnterpriseUser[]
 *   - 编辑角色：PUT    /api/enterprise/team/:id  → { role }
 *   - 删除成员：DELETE /api/enterprise/team/:id  （后端含"不能删除自己"保护）
 *   - 保留 renderTeam() / YJ.pages.team 入口（app.js render() case 'team' 分发不变），仅替换数据来源。
 *   - 增加 loading / empty / error 状态 + 重新加载按钮，接口失败不白屏。
 *   - 管理员（YuJianAuth.getUserInfo().role === 'admin'）显示 编辑角色/删除；
 *     普通成员隐藏操作按钮。
 *   - 本地搜索（姓名/邮箱实时过滤，不新增接口）；所有用户字段经 esc() 转义防 XSS。
 */

(function () {
    'use strict';

    // ─── 角色 / 状态 中文映射（沿用 status-badge 体系） ─────
    var ROLE_LABELS = { admin: '管理员', creator: '创作者', viewer: '查看者' };
    var ROLE_BADGES = { admin: 'danger', creator: 'processing', viewer: 'inactive' };

    function roleLabel(r) { return ROLE_LABELS[r] || r || '—'; }
    function roleBadge(r) { return ROLE_BADGES[r] || 'inactive'; }

    // status: 1 → 在线（绿）/ 0 → 离线（灰）
    function statusInfo(s) {
        return (s === 1 || String(s) === '1')
            ? { text: '在线', cls: 'active' }
            : { text: '离线', cls: 'inactive' };
    }

    // ─── 工具函数 ──────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function pad(x) { return (x < 10 ? '0' : '') + x; }

    // createdAt → YYYY-MM-DD
    function fmtDate(v) {
        if (!v) return '--';
        var d = new Date(v);
        if (isNaN(d.getTime())) return esc(String(v));
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    // 当前登录用户是否为管理员
    function isAdmin() {
        var u = (window.YuJianAuth && typeof YuJianAuth.getUserInfo === 'function')
            ? YuJianAuth.getUserInfo() : null;
        return !!(u && u.role === 'admin');
    }

    // 邀请弹窗内容（保持既有 openModal 行为，未改动）
    var INVITE_CONTENT = encodeURIComponent(
        '<div class="form-group"><label>成员邮箱</label><input type="email" placeholder="输入邮箱发送邀请"></div>'
        + '<div class="form-group"><label>成员角色</label><select><option>创作者</option><option>管理员</option><option>查看者</option></select></div>'
        + '<div style="font-size:12px;color:var(--text-sub);background:var(--primary-bg);padding:10px;border-radius:8px">邀请链接将发送至对方邮箱，对方接受后加入团队</div>'
    );

    // ─── 状态行（loading / empty / error） ─────────────────
    function loadingRow() {
        return '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-sub)"><i class="fas fa-spinner fa-spin"></i> 加载中...</td></tr>';
    }

    function emptyRow() {
        return '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-sub)"><i class="fas fa-users"></i> 暂无团队成员</td></tr>';
    }

    function emptySearchRow() {
        return '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-sub)"><i class="fas fa-search"></i> 未找到匹配的成员</td></tr>';
    }

    function errorRow(errMsg) {
        return '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-sub)">'
            + '<div style="margin-bottom:12px"><i class="fas fa-exclamation-triangle"></i> 加载失败'
            + (errMsg ? '：' + esc(errMsg) : '') + '</div>'
            + '<button class="btn btn-outline" onclick="YJ.pages.team.reload()"><i class="fas fa-redo"></i> 重新加载</button>'
            + '</td></tr>';
    }

    // ─── 成员行 ────────────────────────────────────────────
    function memberRow(m, admin) {
        var name = esc(m.name || m.email || '未命名成员');
        var initial = esc(String(m.name || '?').trim().charAt(0) || '?');
        var email = esc(m.email || '');
        var st = statusInfo(m.status);
        var actions = admin
            ? '<button class="btn btn-sm btn-outline" onclick="YJ.pages.team.openRoleModal(' + m.id + ')"><i class="fas fa-user-edit"></i> 编辑角色</button>'
            + ' <button class="btn btn-sm btn-outline btn-danger" onclick="YJ.pages.team.deleteMember(' + m.id + ')"><i class="fas fa-user-minus"></i> 删除</button>'
            : '<span style="color:var(--text-sub);font-size:12px">—</span>';
        return '<tr>'
            + '<td><div style="display:flex;align-items:center;gap:10px">'
            + '<div class="avatar-circle" style="width:32px;height:32px;font-size:12px">' + initial + '</div>'
            + '<div><strong>' + name + '</strong>'
            + (email ? '<div style="font-size:12px;color:var(--text-sub)">' + email + '</div>' : '')
            + '</div></div></td>'
            + '<td><span class="status-badge status-' + roleBadge(m.role) + '">' + esc(roleLabel(m.role)) + '</span></td>'
            + '<td style="color:var(--text-sub)">' + fmtDate(m.createdAt) + '</td>'
            + '<td><span class="status-badge status-' + st.cls + '">' + st.text + '</span></td>'
            + '<td>' + actions + '</td>'
            + '</tr>';
    }

    // ─── 页面壳（工具栏 + 表格，tbody 随状态刷新） ──────────
    function pageShell(tbodyHtml) {
        return '<div class="yj-team-page"><div class="toolbar">'
            + '<div class="search-box"><i class="fas fa-search"></i><input type="text" placeholder="搜索姓名 / 邮箱..." oninput="YJ.pages.team.filter(this.value)"></div>'
            + '<button class="btn btn-primary" onclick="openModal(\'邀请成员\', \'' + INVITE_CONTENT + '\')">'
            + '<i class="fas fa-user-plus"></i> 邀请成员'
            + '</button>'
            + '</div>'
            + '<div class="card">'
            + '<div class="table-wrap">'
            + '<table>'
            + '<thead><tr><th>成员</th><th>角色</th><th>加入时间</th><th>状态</th><th>操作</th></tr></thead>'
            + '<tbody id="teamTableBody">' + tbodyHtml + '</tbody>'
            + '</table>'
            + '</div>'
            + '</div>';
    }

    // ─── 数据加载（loading → ready/empty/error） ───────────
    var _seq = 0;
    var _members = [];
    var _state = 'loading';   // 'loading' | 'ready' | 'error'
    var _errorMsg = '';
    var _query = '';

    function loadTeam() {
        var seq = ++_seq;
        _state = 'loading';
        _query = '';
        var container = document.getElementById('mainContent');
        if (!container) return;
        // 离开团队页后丢弃过期响应，避免覆盖其它页面
        var isActive = function () {
            return seq === _seq && window.APP && window.APP.currentPage === 'team';
        };

        container.innerHTML = pageShell(loadingRow());

        YuJianAPI.get('/enterprise/team')
            .then(function (list) {
                if (!isActive()) return;
                _members = Array.isArray(list) ? list : [];
                _state = 'ready';
                fillTable();
            })
            .catch(function (err) {
                if (!isActive()) return;
                console.error('[Team] 成员数据加载失败:', err);
                _members = [];
                _state = 'error';
                _errorMsg = (err && err.message) || '';
                fillTable();
            });
    }

    function fillTable() {
        var tbody = document.getElementById('teamTableBody');
        if (!tbody) return;
        if (_state === 'loading') { tbody.innerHTML = loadingRow(); return; }
        if (_state === 'error') { tbody.innerHTML = errorRow(_errorMsg); return; }
        // ready
        var admin = isAdmin();
        var list = filterMembers(_members, _query);
        if (!list.length) {
            tbody.innerHTML = _members.length ? emptySearchRow() : emptyRow();
            return;
        }
        tbody.innerHTML = list.map(function (m) { return memberRow(m, admin); }).join('');
    }

    // 本地搜索（姓名 / 邮箱，实时过滤，不新增接口）
    function filterMembers(members, q) {
        if (!q) return members;
        return members.filter(function (m) {
            var name = String(m.name || '').toLowerCase();
            var email = String(m.email || '').toLowerCase();
            return name.indexOf(q) !== -1 || email.indexOf(q) !== -1;
        });
    }

    function filter(q) {
        _query = (q == null ? '' : String(q)).trim().toLowerCase();
        fillTable();
    }

    function findMember(id) {
        var target = String(id);
        for (var i = 0; i < _members.length; i++) {
            if (String(_members[i].id) === target) return _members[i];
        }
        return null;
    }

    // ─── 编辑角色（仅管理员入口可见） ──────────────────────
    function openRoleModal(id) {
        var m = findMember(id);
        if (!m) return;
        var name = esc(m.name || m.email || '该成员');
        var content = '<div class="form-group"><label>为成员「' + name + '」选择新角色</label>'
            + '<select id="teamRoleSelect">'
            + roleOption('admin', m.role, '管理员')
            + roleOption('creator', m.role, '创作者')
            + roleOption('viewer', m.role, '查看者')
            + '</select></div>';
        if (window.YJ && window.YJ.components && window.YJ.components.modal) {
            window.YJ.components.modal.open({
                title: '编辑角色',
                content: content,
                confirmText: '保存',
                onConfirm: function () {
                    var sel = document.getElementById('teamRoleSelect');
                    var role = sel ? sel.value : '';
                    if (!role) return false;
                    updateMemberRole(id, role);
                    return false; // 保持弹窗，等待接口返回后统一关闭
                }
            });
        }
    }

    function roleOption(value, current, label) {
        return '<option value="' + value + '"' + (String(current) === value ? ' selected' : '') + '>' + label + '</option>';
    }

    function updateMemberRole(id, role) {
        YuJianAPI.request('/enterprise/team/' + id, { method: 'PUT', body: { role: role } })
            .then(function () {
                if (typeof closeModal === 'function') closeModal();
                if (typeof showToast === 'function') showToast('角色已更新', 'success');
                loadTeam();
            })
            .catch(function (err) {
                if (typeof closeModal === 'function') closeModal();
                console.error('[Team] 编辑角色失败:', err);
                if (typeof showToast === 'function') showToast((err && err.message) || '编辑角色失败', 'error');
            });
    }

    // ─── 删除成员（仅管理员入口可见；后端含"不能删除自己"保护） ──
    function deleteMember(id) {
        var m = findMember(id);
        var who = (m && (m.name || m.email)) || '该成员';
        if (typeof confirm === 'function' && !confirm('确定要删除成员「' + who + '」吗？')) return;
        YuJianAPI.request('/enterprise/team/' + id, { method: 'DELETE' })
            .then(function () {
                if (typeof showToast === 'function') showToast('已删除成员', 'success');
                loadTeam();
            })
            .catch(function (err) {
                console.error('[Team] 删除成员失败:', err);
                if (typeof showToast === 'function') showToast((err && err.message) || '删除成员失败', 'error');
            });
    }

    // ─── 入口（保持签名，app.js render() 分发不变） ─────────
    function renderTeam() {
        // 先渲染 loading 骨架，再异步拉取真实数据；不阻塞页面
        setTimeout(loadTeam, 0);
        return pageShell(loadingRow());
    }

    // ─── Expose to YJ.pages ───────────────────────────────
    window.YJ = window.YJ || {};
    window.YJ.pages = window.YJ.pages || {};
    window.YJ.pages.team = {
        render: renderTeam,
        reload: loadTeam,
        filter: filter,
        openRoleModal: openRoleModal,
        deleteMember: deleteMember
    };

    // ─── Backward Compatibility Bridge ────────────────────
    window.renderTeam = renderTeam;

})();
