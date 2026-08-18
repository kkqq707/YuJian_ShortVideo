/**
 * YuJian Enterprise — Projects Page Render
 *
 * DigitalHuman-Rebuild-006: Projects 页面真实化（A 类方案）
 *
 * 数据源（全部为已有接口，不新增）：
 *   GET    /api/enterprise/video-generation/tasks      → 作品列表
 *   GET    /api/enterprise/video-generation/tasks/:id  → 作品详情
 *   DELETE /api/enterprise/video-generation/tasks/:id  → 删除作品（管理员）
 *
 * 列表展示：标题(prompt截断) / 类型 / 状态 / 创建时间 / 封面 / 进度 / 时长
 *   —— 不再展示 materialCount / shotCount / generatedVideos（无真实来源）
 *
 * 筛选（服务端查询参数，基于真实数据）：
 *   类型  text2video / image2video / ref2video / digital_human / text2image / video_edit
 *   状态  pending / processing / success / failed
 *
 * 状态机：loading / ready(empty) / error + 重新加载按钮；接口失败不白屏。
 *
 * 本模块自包含（不再使用 enterprise.html 内部 projects 函数），
 * 由 app.js 路由 case 'projects' / 'project-detail' 分发到 renderProjects / renderProjectDetail。
 */

(function () {
    'use strict';

    // ─── 类型 / 状态 中文映射 ──────────────────────────────
    var TYPE_LABELS = {
        text2video: '文生视频',
        image2video: '图生视频',
        ref2video: '参考生视频',
        digital_human: '数字人',
        text2image: '文生图',
        video_edit: '视频编辑'
    };

    var TYPE_CSS = {
        text2video: 'yj-project-type-text2video',
        image2video: 'yj-project-type-image2video',
        ref2video: 'yj-project-type-ref2video',
        digital_human: 'yj-project-type-digitalhuman',
        text2image: 'yj-project-type-text2image',
        video_edit: 'yj-project-type-video-edit'
    };

    function typeLabel(t) { return TYPE_LABELS[t] || t || '未知类型'; }
    function typeCss(t) { return TYPE_CSS[t] || 'yj-project-type-text2video'; }

    function statusInfo(s) {
        switch (s) {
            case 'success':    return { label: '已完成', cls: 'yj-project-status-completed' };
            case 'processing': return { label: '处理中', cls: 'yj-project-status-processing' };
            case 'pending':    return { label: '排队中', cls: 'yj-project-status-generating' };
            case 'failed':     return { label: '失败',   cls: 'yj-project-status-failed' };
            default:           return { label: esc(s || '未知'), cls: 'yj-project-status-draft' };
        }
    }

    // ─── 工具函数 ──────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function pad(x) { return (x < 10 ? '0' : '') + x; }

    // createdAt → YYYY-MM-DD HH:mm
    function fmtDate(v) {
        if (!v) return '--';
        var d = new Date(v);
        if (isNaN(d.getTime())) return esc(String(v));
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
            + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    // 时长 → 5s / 1m30s
    function fmtDuration(sec) {
        if (!sec && sec !== 0) return '--';
        if (sec < 60) return sec + 's';
        var m = Math.floor(sec / 60);
        var s = Math.round(sec % 60);
        return m + 'm' + (s > 0 ? s + 's' : '');
    }

    // 用于 onclick 属性中单引号 JS 字符串上下文的安全转义
    function jsq(v) {
        return "'" + String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    }

    function isAdmin() {
        var u = (window.YuJianAuth && typeof YuJianAuth.getUserInfo === 'function')
            ? YuJianAuth.getUserInfo() : null;
        return !!(u && u.role === 'admin');
    }

    // 图片任务识别（与后端 toListItem 的 mediaType 逻辑一致）
    function isImageTask(item) {
        return item.taskType === 'text2image'
            || item.mediaType === 'image'
            || (item.outputAsset && item.outputAsset.type === 'image');
    }

    // 封面 URL 解析：thumbnailUrl → coverUrl → outputAsset.url
    function thumbUrl(item) {
        return item.thumbnailUrl || item.coverUrl
            || (item.outputAsset && item.outputAsset.url) || null;
    }

    // ─── 状态块（loading / empty / error）─────────────────
    function loadingBlock(text) {
        return '<div class="yj-project-loading">'
            + '<div class="yj-project-loading-spinner"></div>'
            + '<div class="yj-project-loading-text">' + esc(text || '正在加载作品...') + '</div>'
            + '</div>';
    }

    function emptyBlock() {
        return '<div class="yj-project-empty">'
            + '<div class="yj-project-empty-icon"><i class="fas fa-film"></i></div>'
            + '<div class="yj-project-empty-title">还没有作品</div>'
            + '<div class="yj-project-empty-desc">前往 AI 创作中心生成你的第一个作品吧</div>'
            + '</div>';
    }

    function errorBlock(err) {
        var is401 = err && err.status === 401;
        var title = is401 ? '登录已过期' : '加载失败';
        var icon = is401 ? 'fa-lock' : 'fa-exclamation-triangle';
        var desc = is401
            ? '请刷新页面重新登录'
            : ((err && err.message) ? esc(err.message) : '接口请求失败，请稍后重试');
        return '<div class="yj-project-empty">'
            + '<div class="yj-project-empty-icon"><i class="fas ' + icon + '"></i></div>'
            + '<div class="yj-project-empty-title">' + title + '</div>'
            + '<div class="yj-project-empty-desc">' + desc + '</div>'
            + '<button class="btn btn-outline" onclick="YJ.pages.projects.reload()" style="margin-top:12px">'
            + '<i class="fas fa-redo"></i> 重新加载</button>'
            + '</div>';
    }

    // ─── 列表卡片 ─────────────────────────────────────────
    function cardHtml(p) {
        var st = statusInfo(p.status);
        var tl = typeLabel(p.taskType);
        var tc = typeCss(p.taskType);
        var isImg = isImageTask(p);
        var fallbackIcon = isImg ? 'fa-image' : 'fa-video';
        var img = thumbUrl(p);

        // 占位图标垫底 + 封面图覆盖；图加载失败时隐藏 img 露出图标（不破坏徽章/删除按钮）
        var coverHtml = '<i class="fas ' + fallbackIcon + ' yj-project-card-cover-icon"></i>'
            + (img
                ? '<img src="' + esc(img) + '" alt="封面" loading="lazy" '
                  + 'onerror="this.onerror=null;this.style.display=\'none\'">'
                : '');

        var statusBadge = '<div class="yj-project-card-status-badge">'
            + '<span class="yj-project-status ' + st.cls + '">' + st.label + '</span>'
            + '</div>';

        var delBtn = isAdmin()
            ? '<button class="yj-project-card-delete" '
              + 'onclick="event.stopPropagation();YJ.pages.projects.deleteTask(' + jsq(p.id) + ')" title="删除作品">'
              + '<i class="fas fa-trash"></i></button>'
            : '';

        var promptText = p.prompt || '未命名作品';

        // 进度条（pending / processing）
        var progressHtml = '';
        if (p.status === 'pending' || p.status === 'processing') {
            var prog = Math.min(100, Math.max(0, p.progress || 0));
            progressHtml = '<div class="yj-project-card-progress">'
                + '<div class="yj-project-progress-track">'
                + '<div class="yj-project-progress-fill" style="width:' + prog + '%"></div>'
                + '</div>'
                + '<span class="yj-project-progress-text">' + st.label + ' ' + prog + '%</span>'
                + '</div>';
        }

        // 失败原因（failed 且有错误信息）
        var errorHtml = '';
        if (p.status === 'failed' && p.errorMsg) {
            errorHtml = '<div class="yj-project-card-error" title="' + esc(p.errorMsg) + '">'
                + '<i class="fas fa-exclamation-circle"></i> 生成失败</div>';
        }

        var created = fmtDate(p.createdAt);
        var dur = isImg ? '' : fmtDuration(p.duration);

        return '<div class="yj-project-card" '
            + 'onclick="YJ.pages.projects.openDetail(' + jsq(p.id) + ')" title="查看作品详情">'
            + '<div class="yj-project-card-cover">' + coverHtml + statusBadge + delBtn + '</div>'
            + '<div class="yj-project-card-body">'
            + '<div class="yj-project-card-title" title="' + esc(promptText) + '">' + esc(promptText) + '</div>'
            + '<div class="yj-project-card-meta">'
            + '<span class="yj-project-card-type ' + tc + '"><i class="fas fa-tag"></i> ' + esc(tl) + '</span>'
            + '</div>'
            + progressHtml
            + errorHtml
            + '<div class="yj-project-card-stats">'
            + '<span class="yj-project-card-stat"><i class="fas fa-clock"></i> ' + esc(created) + '</span>'
            + (dur !== '--' ? '<span class="yj-project-card-stat"><i class="fas fa-film"></i> ' + esc(dur) + '</span>' : '')
            + '</div>'
            + '</div>'
            + '</div>';
    }

    // ─── 页面壳（工具栏 + 网格容器）───────────────────────
    function pageShell(gridHtml) {
        function opt(value, label, current) {
            return '<option value="' + value + '"' + (String(current) === value ? ' selected' : '') + '>' + label + '</option>';
        }

        return '<div class="yj-project-page">'
            + '<div class="yj-project-toolbar">'
            + '<div class="yj-project-toolbar-left">'
            + '<select class="yj-project-filter" onchange="YJ.pages.projects.setType(this.value)">'
            + opt('', '全部类型', _typeFilter)
            + opt('text2video', '文生视频', _typeFilter)
            + opt('image2video', '图生视频', _typeFilter)
            + opt('ref2video', '参考生视频', _typeFilter)
            + opt('digital_human', '数字人', _typeFilter)
            + opt('text2image', '文生图', _typeFilter)
            + opt('video_edit', '视频编辑', _typeFilter)
            + '</select>'
            + '<select class="yj-project-filter" onchange="YJ.pages.projects.setStatus(this.value)">'
            + opt('', '全部状态', _statusFilter)
            + opt('pending', '排队中', _statusFilter)
            + opt('processing', '处理中', _statusFilter)
            + opt('success', '已完成', _statusFilter)
            + opt('failed', '失败', _statusFilter)
            + '</select>'
            + '</div>'
            + '<div class="yj-project-toolbar-right">'
            + '<button class="btn btn-outline" onclick="YJ.pages.projects.reload()" title="刷新列表">'
            + '<i class="fas fa-redo"></i> 刷新</button>'
            + '</div>'
            + '</div>'
            + '<div id="yjProjectGridContainer">' + gridHtml + '</div>'
            + '</div>';
    }

    // ─── 数据加载（loading → ready/empty/error）────────────
    var _seq = 0;
    var _items = [];
    var _state = 'loading';
    var _errorMsg = '';
    var _typeFilter = '';
    var _statusFilter = '';

    function loadProjects() {
        var seq = ++_seq;
        _state = 'loading';
        var container = document.getElementById('yjProjectGridContainer');
        if (!container) return;
        // 离开 projects 页后丢弃过期响应，避免覆盖其它页面
        var isActive = function () {
            return seq === _seq && window.APP && window.APP.currentPage === 'projects';
        };
        var fill = function (html) {
            if (!isActive()) return;
            var c = document.getElementById('yjProjectGridContainer');
            if (c) c.innerHTML = html;
        };

        fill(loadingBlock());

        var q = '/enterprise/video-generation/tasks?page=1&pageSize=100';
        if (_statusFilter) q += '&status=' + encodeURIComponent(_statusFilter);
        if (_typeFilter) q += '&task_type=' + encodeURIComponent(_typeFilter);

        YuJianAPI.get(q)
            .then(function (data) {
                if (!isActive()) return;
                _items = (data && Array.isArray(data.items)) ? data.items : [];
                _state = 'ready';
                _errorMsg = '';
                fillGrid();
            })
            .catch(function (err) {
                if (!isActive()) return;
                console.error('[Projects] 作品列表加载失败:', err);
                _items = [];
                _state = 'error';
                _errorMsg = (err && err.message) || '';
                fill(errorBlock(err));
            });
    }

    function fillGrid() {
        var container = document.getElementById('yjProjectGridContainer');
        if (!container) return;
        if (!_items.length) {
            container.innerHTML = emptyBlock();
            return;
        }
        container.innerHTML = '<div class="yj-project-grid">' + _items.map(cardHtml).join('') + '</div>';
    }

    // 筛选（服务端查询参数）
    function setType(t) {
        _typeFilter = (t == null) ? '' : String(t);
        loadProjects();
    }

    function setStatus(s) {
        _statusFilter = (s == null) ? '' : String(s);
        loadProjects();
    }

    // ─── 详情页 ───────────────────────────────────────────
    // 卡片点击 → 进入 project-detail 路由（app.js case 'project-detail' 分发）
    function openDetail(id) {
        var tid = String(id);
        if (window.APP) window.APP.currentProjectId = tid;
        if (window.navigateTo) window.navigateTo('project-detail');
    }

    function renderProjectDetail(projectId) {
        var id = (projectId == null && window.APP) ? window.APP.currentProjectId : projectId;
        setTimeout(function () { loadDetail(id); }, 0);
        return '<div class="yj-project-detail">'
            + '<div class="yj-project-detail-back" onclick="navigateTo(\'projects\')">'
            + '<i class="fas fa-arrow-left"></i> 返回项目列表</div>'
            + '<div id="yjProjectDetailContainer">' + loadingBlock('正在加载作品详情...') + '</div>'
            + '</div>';
    }

    function loadDetail(id) {
        var container = document.getElementById('yjProjectDetailContainer');
        if (!container) return;
        if (id == null) {
            container.innerHTML = detailError({ status: 404, message: '作品不存在' });
            return;
        }
        var isActive = function () {
            return window.APP && window.APP.currentPage === 'project-detail'
                && String(window.APP.currentProjectId) === String(id);
        };

        YuJianAPI.get('/enterprise/video-generation/tasks/' + id)
            .then(function (task) {
                if (!isActive()) return;
                container.innerHTML = detailHtml(task);
            })
            .catch(function (err) {
                if (!isActive()) return;
                console.error('[Projects] 作品详情加载失败:', err);
                container.innerHTML = detailError(err);
            });
    }

    function infoRow(label, valueHtml) {
        return '<div class="yj-project-info-row">'
            + '<span class="yj-project-info-row-label">' + esc(label) + '</span>'
            + '<span class="yj-project-info-row-value">' + valueHtml + '</span>'
            + '</div>';
    }

    function detailHtml(task) {
        if (!task || !task.id) {
            return detailError({ status: 404, message: '作品数据为空' });
        }
        var st = statusInfo(task.status);
        var tl = typeLabel(task.taskType);
        var tc = typeCss(task.taskType);
        var isImg = isImageTask(task);
        var promptText = task.prompt || '未命名作品';
        var created = fmtDate(task.createdAt);
        var completed = fmtDate(task.completedAt);
        var dur = fmtDuration(task.duration);
        var model = task.model || '--';
        var isBusy = task.status === 'pending' || task.status === 'processing';

        // 媒体区：成功且为视频 → 播放器；有封面 → 图片；否则占位
        var vurl = (task.status === 'success' && !isImg)
            ? (task.playUrl || task.videoUrl || (task.outputAsset && task.outputAsset.play_url)) : null;
        var cov = task.coverUrl
            || (task.outputAsset && task.outputAsset.thumbnail)
            || (task.outputAsset && task.outputAsset.url)
            || null;

        var mediaHtml;
        if (vurl) {
            mediaHtml = '<div class="yj-project-media">'
                + '<video controls preload="metadata"' + (cov ? ' poster="' + esc(cov) + '"' : '') + '>'
                + '<source src="' + esc(vurl) + '" type="video/mp4"></video></div>';
        } else if (cov) {
            mediaHtml = '<div class="yj-project-media"><img src="' + esc(cov) + '" alt="作品封面" '
                + 'onerror="this.onerror=null;this.style.display=\'none\'"></div>';
        } else {
            mediaHtml = '<div class="yj-project-media yj-project-media-empty">'
                + '<i class="fas ' + (isImg ? 'fa-image' : 'fa-video') + '"></i>'
                + '<span>暂无预览</span></div>';
        }

        var rows = '';
        rows += infoRow('模型', esc(model));
        rows += infoRow('状态', '<span class="yj-project-status ' + st.cls + '">' + st.label + '</span>');
        rows += infoRow('创建时间', esc(created));
        if (completed !== '--') rows += infoRow('完成时间', esc(completed));
        if (dur !== '--') rows += infoRow('时长', esc(dur));
        if (task.width && task.height) rows += infoRow('分辨率', esc(task.width + ' × ' + task.height));
        if (isBusy) {
            var prog = Math.min(100, Math.max(0, task.progress || 0));
            rows += infoRow('进度',
                '<div class="yj-project-progress-track" style="width:140px;display:inline-block;vertical-align:middle">'
                + '<div class="yj-project-progress-fill" style="width:' + prog + '%"></div></div>'
                + ' <span style="color:var(--text-muted)">' + prog + '%</span>');
        }
        if (task.status === 'failed' && task.errorMsg) {
            rows += infoRow('失败原因', '<span style="color:var(--danger)">' + esc(task.errorMsg) + '</span>');
        }

        var delHtml = isAdmin()
            ? '<button class="btn btn-outline btn-danger" '
              + 'onclick="YJ.pages.projects.deleteTask(' + jsq(task.id) + ')">'
              + '<i class="fas fa-trash"></i> 删除作品</button>'
            : '';

        return '<div class="yj-project-detail-header">'
            + '<div class="yj-project-detail-title-group">'
            + '<h2 class="yj-project-detail-title">' + esc(promptText) + '</h2>'
            + '<div class="yj-project-detail-subtitle">'
            + '<span class="yj-project-type-tag ' + tc + '">' + esc(tl) + '</span>'
            + '<span class="yj-project-status ' + st.cls + '">' + st.label + '</span>'
            + '<span style="color:var(--text-muted)">创建于 ' + esc(created) + '</span>'
            + '</div>'
            + '</div>'
            + (delHtml ? '<div class="yj-project-detail-actions">' + delHtml + '</div>' : '')
            + '</div>'
            + mediaHtml
            + '<div class="yj-project-info-grid">'
            + '<div class="yj-project-info-card">'
            + '<div class="yj-project-info-card-header"><span class="yj-project-info-card-title">基本信息</span></div>'
            + '<div class="yj-project-info-card-body">' + rows + '</div>'
            + '</div>'
            + '<div class="yj-project-info-card">'
            + '<div class="yj-project-info-card-header"><span class="yj-project-info-card-title">创作描述</span></div>'
            + '<div class="yj-project-info-card-body">'
            + '<p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:var(--leading-relaxed);margin:0">'
            + esc(promptText) + '</p>'
            + (task.negative_prompt
                ? '<p style="font-size:var(--text-xs);color:var(--text-muted);margin:8px 0 0">负向提示：' + esc(task.negative_prompt) + '</p>'
                : '')
            + '</div>'
            + '</div>'
            + '</div>';
    }

    function detailError(err) {
        var is401 = err && err.status === 401;
        var title = is401 ? '登录已过期' : '作品未找到';
        var desc = is401
            ? '请刷新页面重新登录'
            : ((err && err.message) ? esc(err.message) : '该项目可能已被删除或不存在');
        return '<div class="yj-project-empty">'
            + '<div class="yj-project-empty-icon"><i class="fas fa-exclamation-circle"></i></div>'
            + '<div class="yj-project-empty-title">' + title + '</div>'
            + '<div class="yj-project-empty-desc">' + desc + '</div>'
            + '<button class="btn btn-outline" onclick="navigateTo(\'projects\')" style="margin-top:12px">'
            + '<i class="fas fa-arrow-left"></i> 返回项目列表</button>'
            + '</div>';
    }

    // ─── 删除（仅管理员入口可见；成功后刷新列表）──────────
    function deleteTask(id) {
        if (typeof confirm === 'function' && !confirm('确定要删除该作品吗？删除后将从列表隐藏。')) {
            return;
        }
        YuJianAPI.request('/enterprise/video-generation/tasks/' + id, { method: 'DELETE' })
            .then(function () {
                if (typeof showToast === 'function') showToast('删除成功', 'success');
                // 详情页删除 → 返回列表并刷新；列表页删除 → 直接刷新
                if (window.APP && window.APP.currentPage === 'project-detail') {
                    if (window.navigateTo) window.navigateTo('projects');
                } else {
                    loadProjects();
                }
            })
            .catch(function (err) {
                console.error('[Projects] 删除作品失败:', err);
                if (typeof showToast === 'function') {
                    if (err.status === 401) showToast('登录已过期，请刷新页面重新登录', 'error');
                    else if (err.status === 404) showToast('作品不存在或已删除', 'warning');
                    else showToast('删除失败，请稍后重试', 'error');
                }
            });
    }

    // ─── 入口（保持签名，app.js render() 分发不变）────────
    function renderProjects() {
        // 先渲染 loading 骨架，再异步拉取真实数据；不阻塞页面
        setTimeout(loadProjects, 0);
        return pageShell(loadingBlock());
    }

    // ─── Expose to YJ.pages ───────────────────────────────
    window.YJ = window.YJ || {};
    window.YJ.pages = window.YJ.pages || {};
    window.YJ.pages.projects = {
        render: renderProjects,
        renderDetail: renderProjectDetail,
        reload: loadProjects,
        setType: setType,
        setStatus: setStatus,
        openDetail: openDetail,
        deleteTask: deleteTask
    };

    // ─── Backward Compatibility Bridge ────────────────────
    window.renderProjects = renderProjects;
    window.renderProjectDetail = renderProjectDetail;

})();
