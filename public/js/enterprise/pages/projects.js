/**
 * YuJian Enterprise — Projects Page Render
 *
 * Phase 2-D-2-A-4: 从 enterprise.html inline 提取
 * 包含 renderProjects() 和 renderProjectDetail(projectId)
 */

(function () {
    'use strict';

    function renderProjects() {
        var APP = window.APP;
        var projects = APP.projects || [];
        var emptyHtml = '' +
          '<div class="yj-project-empty">' +
            '<div class="yj-project-empty-icon"><i class="fas fa-folder-open"></i></div>' +
            '<div class="yj-project-empty-title">还没有项目</div>' +
            '<div class="yj-project-empty-desc">点击"新建项目"开始你的第一个AI视频创作吧</div>' +
          '</div>';

        var gridHtml = projects.length === 0 ? emptyHtml : '' +
          '<div class="yj-project-grid">' +
            projects.map(function(p) {
              var statusClass = 'yj-project-status-' + (p.status || 'draft');
              var typeClass = 'yj-project-type-' + (p.type || 'text2video');
              return '' +
                '<div class="yj-project-card" onclick="navigateToProjectDetail(' + p.id + ')" title="查看项目详情">' +
                  '<div class="yj-project-card-cover">' +
                    '<i class="fas ' + (p.typeIcon || 'fa-video') + '"></i>' +
                    '<div class="yj-project-card-status-badge">' +
                      '<span class="yj-project-status ' + statusClass + '">' + (p.statusLabel || p.status) + '</span>' +
                    '</div>' +
                  '</div>' +
                  '<div class="yj-project-card-body">' +
                    '<div class="yj-project-card-title">' + escapeJsString(p.name) + '</div>' +
                    '<div class="yj-project-card-meta">' +
                      '<span class="yj-project-card-type"><i class="fas ' + (p.typeIcon || 'fa-video') + '"></i> ' + (p.typeLabel || p.type) + '</span>' +
                    '</div>' +
                    '<div class="yj-project-card-stats">' +
                      '<span class="yj-project-card-stat"><i class="fas fa-folder-open"></i> <span class="yj-project-card-stat-value">' + (p.materialCount || 0) + '</span> 素材</span>' +
                      '<span class="yj-project-card-stat"><i class="fas fa-clapperboard"></i> <span class="yj-project-card-stat-value">' + (p.shotCount || 0) + '</span> 镜头</span>' +
                      '<span class="yj-project-card-time">' + (p.time || '') + '</span>' +
                    '</div>' +
                  '</div>' +
                '</div>';
            }).join('') +
          '</div>';

        return '' +
          '<div class="yj-project-page">' +
            '<div class="yj-project-toolbar">' +
              '<div class="yj-project-toolbar-left">' +
                '<div class="yj-project-search">' +
                  '<i class="fas fa-search"></i>' +
                  '<input type="text" placeholder="搜索项目名称..." oninput="filterProjects(this.value)">' +
                '</div>' +
                '<select class="yj-project-filter" onchange="filterProjectsByType(this.value)">' +
                  '<option value="">全部类型</option>' +
                  '<option value="text2video">文生视频</option>' +
                  '<option value="image2video">图生视频</option>' +
                  '<option value="storyboard">故事板</option>' +
                  '<option value="digitalhuman">数字人</option>' +
                '</select>' +
                '<select class="yj-project-filter" onchange="filterProjectsByStatus(this.value)">' +
                  '<option value="">全部状态</option>' +
                  '<option value="draft">草稿</option>' +
                  '<option value="generating">生成中</option>' +
                  '<option value="processing">处理中</option>' +
                  '<option value="completed">已完成</option>' +
                  '<option value="failed">失败</option>' +
                '</select>' +
              '</div>' +
              '<div class="yj-project-toolbar-right">' +
                '<button class="yj-project-create-btn" onclick="createNewProject()">' +
                  '<i class="fas fa-plus"></i> 新建项目' +
                '</button>' +
              '</div>' +
            '</div>' +
            '<div id="yjProjectGridContainer">' + gridHtml + '</div>' +
          '</div>';
    }

    function renderProjectDetail(projectId) {
        var APP = window.APP;
        var projects = APP.projects || [];
        var project = null;
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId) { project = projects[i]; break; }
        }
        if (!project) {
            return '' +
              '<div class="yj-project-empty">' +
                '<div class="yj-project-empty-icon"><i class="fas fa-exclamation-circle"></i></div>' +
                '<div class="yj-project-empty-title">项目未找到</div>' +
                '<div class="yj-project-empty-desc">该项目可能已被删除或不存在</div>' +
                '<button class="yj-project-create-btn" onclick="navigateTo(\'projects\')" style="margin-top:12px">返回项目列表</button>' +
              '</div>';
        }

        var statusClass = 'yj-project-status-' + (project.status || 'draft');
        var typeClass = 'yj-project-type-' + (project.type || 'text2video');

        return '' +
          '<div class="yj-project-detail">' +
            // 返回链接
            '<div class="yj-project-detail-back" onclick="navigateTo(\'projects\')">' +
              '<i class="fas fa-arrow-left"></i> 返回项目列表' +
            '</div>' +
            // 标题行
            '<div class="yj-project-detail-header">' +
              '<div class="yj-project-detail-title-group">' +
                '<h2 class="yj-project-detail-title">' + escapeJsString(project.name) + '</h2>' +
                '<div class="yj-project-detail-subtitle">' +
                  '<span class="yj-project-type-tag ' + typeClass + '">' + (project.typeLabel || project.type) + '</span>' +
                  '<span class="yj-project-status ' + statusClass + '">' + (project.statusLabel || project.status) + '</span>' +
                  '<span style="color:var(--text-muted)">创建于 ' + (project.time || '--') + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="yj-project-detail-actions">' +
                '<button class="btn btn-outline" onclick="navigateTo(\'editor\')"><i class="fas fa-ellipsis-h"></i> 更多操作</button>' +
              '</div>' +
            '</div>' +
            // 项目概览
            '<div class="yj-project-overview">' +
              '<div class="yj-project-overview-card">' +
                '<i class="fas fa-folder-open yj-project-overview-icon"></i>' +
                '<span class="yj-project-overview-label">素材数量</span>' +
                '<span class="yj-project-overview-value">' + (project.materialCount || 0) + '</span>' +
              '</div>' +
              '<div class="yj-project-overview-card">' +
                '<i class="fas fa-clapperboard yj-project-overview-icon"></i>' +
                '<span class="yj-project-overview-label">镜头数量</span>' +
                '<span class="yj-project-overview-value">' + (project.shotCount || 0) + '</span>' +
              '</div>' +
              '<div class="yj-project-overview-card">' +
                '<i class="fas fa-film yj-project-overview-icon"></i>' +
                '<span class="yj-project-overview-label">已生成视频</span>' +
                '<span class="yj-project-overview-value">' + (project.generatedVideos || 0) + '</span>' +
              '</div>' +
              '<div class="yj-project-overview-card">' +
                '<i class="fas fa-clock yj-project-overview-icon"></i>' +
                '<span class="yj-project-overview-label">项目状态</span>' +
                '<span class="yj-project-overview-value-sm">' + (project.statusLabel || project.status) + '</span>' +
              '</div>' +
            '</div>' +
            // 快捷入口
            '<div style="margin-top:4px">' +
              '<h3 style="font-size:var(--text-base);font-weight:var(--font-semibold);margin-bottom:var(--space-4);color:var(--text-primary)">快捷入口</h3>' +
              '<div class="yj-project-quick-actions">' +
                '<div class="yj-project-quick-action" onclick="navigateTo(\'studio\')">' +
                  '<i class="fas fa-wand-magic-sparkles"></i>' +
                  '<span class="yj-project-quick-action-label">进入AI创作</span>' +
                  '<span class="yj-project-quick-action-desc">文生视频 / 图生视频</span>' +
                '</div>' +
                '<div class="yj-project-quick-action" onclick="navigateTo(\'storyboard\')">' +
                  '<i class="fas fa-clapperboard"></i>' +
                  '<span class="yj-project-quick-action-label">进入故事板</span>' +
                  '<span class="yj-project-quick-action-desc">分镜编辑与批量生成</span>' +
                '</div>' +
                '<div class="yj-project-quick-action" onclick="navigateTo(\'editor\')">' +
                  '<i class="fas fa-scissors"></i>' +
                  '<span class="yj-project-quick-action-label">进入视频剪辑</span>' +
                  '<span class="yj-project-quick-action-desc">剪辑、转场与导出</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            // 项目信息
            '<div class="yj-project-info-grid" style="margin-top:4px">' +
              '<div class="yj-project-info-card">' +
                '<div class="yj-project-info-card-header">' +
                  '<span class="yj-project-info-card-title">基本信息</span>' +
                '</div>' +
                '<div class="yj-project-info-card-body">' +
                  '<div class="yj-project-info-row">' +
                    '<span class="yj-project-info-row-label">项目名称</span>' +
                    '<span class="yj-project-info-row-value">' + escapeJsString(project.name) + '</span>' +
                  '</div>' +
                  '<div class="yj-project-info-row">' +
                    '<span class="yj-project-info-row-label">项目类型</span>' +
                    '<span class="yj-project-info-row-value">' + (project.typeLabel || project.type) + '</span>' +
                  '</div>' +
                  '<div class="yj-project-info-row">' +
                    '<span class="yj-project-info-row-label">创建时间</span>' +
                    '<span class="yj-project-info-row-value">' + (project.time || '--') + '</span>' +
                  '</div>' +
                  '<div class="yj-project-info-row">' +
                    '<span class="yj-project-info-row-label">项目状态</span>' +
                    '<span class="yj-project-info-row-value"><span class="yj-project-status ' + statusClass + '">' + (project.statusLabel || project.status) + '</span></span>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="yj-project-info-card">' +
                '<div class="yj-project-info-card-header">' +
                  '<span class="yj-project-info-card-title">项目描述</span>' +
                '</div>' +
                '<div class="yj-project-info-card-body">' +
                  '<p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:var(--leading-relaxed);margin:0">' + (project.description || '暂无描述信息') + '</p>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
    }

    // ─── Expose to YJ.pages ───────────────────────────────
    window.YJ = window.YJ || {};
    window.YJ.pages = window.YJ.pages || {};
    window.YJ.pages.projects = {
        render: renderProjects,
        renderDetail: renderProjectDetail
    };

    // ─── Backward Compatibility Bridge ────────────────────
    window.renderProjects = renderProjects;
    window.renderProjectDetail = renderProjectDetail;

})();
