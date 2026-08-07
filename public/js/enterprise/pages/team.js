/**
 * YuJian Enterprise — Team Page Render
 *
 * Phase 2-D-2-A-3: 从 enterprise.html inline 提取
 */

(function () {
    'use strict';

    function renderTeam() {
        var APP = window.APP;
        return `
                <div class="toolbar">
                    <div class="search-box"><i class="fas fa-search"></i><input type="text" placeholder="搜索成员..."></div>
                    <button class="btn btn-primary" onclick="openModal('邀请成员', '${encodeURIComponent(`<div class="form-group"><label>成员邮箱</label><input type="email" placeholder="输入邮箱发送邀请"></div><div class="form-group"><label>成员角色</label><select><option>创作者</option><option>管理员</option><option>查看者</option></select></div><div style="font-size:12px;color:var(--text-sub);background:var(--primary-bg);padding:10px;border-radius:8px">邀请链接将发送至对方邮箱，对方接受后加入团队</div>`)}')">
                        <i class="fas fa-user-plus"></i> 邀请成员
                    </button>
                </div>
                <div class="card">
                    <div class="table-wrap">
                        <table>
                            <thead><tr><th>成员</th><th>角色</th><th>加入时间</th><th>状态</th><th>操作</th></tr></thead>
                            <tbody>
                                ${APP.members.map(m => `
                                    <tr>
                                        <td>
                                            <div style="display:flex;align-items:center;gap:10px">
                                                <div class="avatar-circle" style="width:32px;height:32px;font-size:12px">${m.name[0]}</div>
                                                <strong>${m.name}</strong>
                                            </div>
                                        </td>
                                        <td><span class="status-badge status-active">${m.role}</span></td>
                                        <td style="color:var(--text-sub)">${m.joined}</td>
                                        <td><span class="status-badge status-${m.status}">${m.status === 'active' ? '在线' : '离线'}</span></td>
                                        <td>
                                            <button class="btn btn-sm btn-outline">编辑角色</button>
                                            <button class="btn btn-sm btn-outline btn-danger">移除</button>
                                        </td>
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
    window.YJ.pages.team = {
        render: renderTeam
    };

    // ─── Backward Compatibility Bridge ────────────────────
    window.renderTeam = renderTeam;

})();
