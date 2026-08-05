/**
 * YuJian Editor — App Orchestrator
 * Phase 2-D-4: 编辑器主应用组件 (Project绑定)
 *
 * 职责：
 *   - 渲染整体编辑器布局
 *   - 协调子组件（Toolbar, Player, Timeline, Media, Inspector）
 *   - 提供统一的 refresh() 入口
 *   - Phase 2-D-4: projectId 绑定 & 项目保存
 *
 * 依赖：state.js, editor-state.js, 以及所有 editor/ 子组件
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  var state = YJ.state;

  /**
   * 主渲染函数 — 替换原有的 renderEditor()
   * 由 app.js: case 'editor' 调用
   */
  function renderEditor() {
    var ed = state.editor;

    // Phase 2-D-4: Auto-create project if none exists
    if (!ed.project.id) {
      YJ.Editor.createProject({ name: '新剪辑项目' });
    }

    return ''
      + '<div class="yj-editor-container" id="yjEditorContainer">'
      // Toolbar (top)
      +   (YJ.EditorToolbar ? YJ.EditorToolbar.render() : '')
      // Main area: Media | Player | Inspector
      +   '<div class="yj-editor-main">'
      +     (YJ.EditorMedia ? YJ.EditorMedia.render() : '')
      +     (YJ.EditorPlayer ? YJ.EditorPlayer.render() : '')
      +     (YJ.EditorInspector ? YJ.EditorInspector.render() : '')
      +   '</div>'
      // Timeline (bottom)
      +   (YJ.EditorTimeline ? YJ.EditorTimeline.render() : '')
      + '</div>';
  }

  /**
   * 初始化编辑器（在 HTML 渲染后调用）
   * 绑定所有子组件事件
   */
  /** Guard flag: prevent double-init of global listeners */
  var _editorInitialized = false;

  function initEditor() {
    var isFirstInit = !_editorInitialized;

    if (YJ.EditorToolbar && YJ.EditorToolbar.bindEvents) {
      YJ.EditorToolbar.bindEvents();
    }
    // Keyboard shortcuts: document-level — bind once only
    if (isFirstInit && YJ.EditorToolbar && YJ.EditorToolbar.bindKeyboardShortcuts) {
      YJ.EditorToolbar.bindKeyboardShortcuts();
    }

    if (YJ.EditorPlayer && YJ.EditorPlayer.bindEvents) {
      YJ.EditorPlayer.bindEvents();
    }
    if (YJ.EditorTimeline && YJ.EditorTimeline.bindEvents) {
      YJ.EditorTimeline.bindEvents();
    }
    if (YJ.EditorMedia && YJ.EditorMedia.bindEvents) {
      YJ.EditorMedia.bindEvents();
    }
    if (YJ.EditorInspector && YJ.EditorInspector.bindEvents) {
      YJ.EditorInspector.bindEvents();
    }

    // Phase 2-D-4: 项目自动保存定时器
    startAutoSave();

    // Phase 2-D-4.5: Seed demo media if mediaBin is empty (for testing)
    if (isFirstInit && (!state.editor.mediaBin.items || state.editor.mediaBin.items.length === 0)) {
      seedDemoMedia();
    }

    _editorInitialized = true;

    console.log('[Editor/App] Editor initialized (first=' + isFirstInit + ')');
  }

  /**
   * Phase 2-D-4.5: 填充演示素材数据（以便测试媒体面板交互）
   */
  function seedDemoMedia() {
    var demoItems = [
      { id: 'demo_video_1', name: '产品展示视频.mp4', type: 'video', url: '', thumbnailUrl: '', duration: 15.5, size: 25165824, addedAt: new Date().toISOString() },
      { id: 'demo_video_2', name: '品牌宣传片.mp4', type: 'video', url: '', thumbnailUrl: '', duration: 30.0, size: 50331648, addedAt: new Date().toISOString() },
      { id: 'demo_image_1', name: '产品封面图.png', type: 'image', url: '', thumbnailUrl: '', duration: 5, size: 2097152, addedAt: new Date().toISOString() },
      { id: 'demo_image_2', name: '品牌Logo.png', type: 'image', url: '', thumbnailUrl: '', duration: 5, size: 524288, addedAt: new Date().toISOString() },
      { id: 'demo_audio_1', name: '背景音乐.mp3', type: 'audio', url: '', thumbnailUrl: '', duration: 60.0, size: 4194304, addedAt: new Date().toISOString() },
      { id: 'demo_audio_2', name: '配音旁白.mp3', type: 'audio', url: '', thumbnailUrl: '', duration: 25.0, size: 2097152, addedAt: new Date().toISOString() }
    ];
    state.editor.mediaBin.items = demoItems;
    console.log('[Editor/App] Demo media seeded (' + demoItems.length + ' items)');
  }

  /**
   * 全局刷新 — 重新渲染整个编辑器
   * 子组件可通过 YJ.EditorApp.refresh() 调用
   */
  function refresh() {
    var container = document.getElementById('yjEditorContainer');
    if (!container) {
      // Full re-render via app navigation
      var mainContent = document.getElementById('mainContent');
      if (mainContent && YJ.EditorApp.renderEditor) {
        mainContent.innerHTML = YJ.EditorApp.renderEditor();
        YJ.EditorApp.initEditor();
      }
      return;
    }

    // Partial refresh: update sub-components
    var ed = state.editor;

    // Refresh toolbar (undo/redo state)
    refreshToolbar();

    // Refresh player controls
    if (YJ.EditorPlayer && YJ.EditorPlayer.refresh) {
      YJ.EditorPlayer.refresh();
    }

    // Refresh inspector
    if (YJ.EditorInspector && YJ.EditorInspector.refresh) {
      YJ.EditorInspector.refresh();
    }

    // Refresh media panel (to show/hide preview)
    refreshMediaPanel();
  }

  /**
   * 仅刷新时间轴（因为 clip 位置变化等需要完全重绘）
   */
  function refreshTimeline() {
    var container = document.getElementById('yjEditorContainer');
    if (!container) return;

    // Replace timeline section
    var oldTimeline = container.querySelector('.yj-editor-timeline');
    if (oldTimeline && YJ.EditorTimeline) {
      var tempDiv = document.createElement('div');
      tempDiv.innerHTML = YJ.EditorTimeline.render();
      var newTimeline = tempDiv.firstChild;
      oldTimeline.parentNode.replaceChild(newTimeline, oldTimeline);
      YJ.EditorTimeline.bindEvents();
    }

    // Also refresh player time display
    if (YJ.EditorPlayer && YJ.EditorPlayer.refresh) {
      YJ.EditorPlayer.refresh();
    }

    // Refresh inspector (may reference selected clip)
    if (YJ.EditorInspector && YJ.EditorInspector.refresh) {
      YJ.EditorInspector.refresh();
    }
  }

  /**
   * 局部刷新媒体面板（保留预览状态）
   */
  function refreshMediaPanel() {
    var container = document.getElementById('yjEditorContainer');
    if (!container) return;

    var oldMedia = container.querySelector('.yj-editor-media');
    if (oldMedia && YJ.EditorMedia) {
      var tempDiv = document.createElement('div');
      tempDiv.innerHTML = YJ.EditorMedia.render();
      var newMedia = tempDiv.firstChild;
      oldMedia.parentNode.replaceChild(newMedia, oldMedia);
      YJ.EditorMedia.bindEvents();
    }
  }

  /**
   * 局部刷新工具栏按钮状态
   */
  function refreshToolbar() {
    var hist = YJ.Editor.getHistoryState();
    var undoBtn = document.getElementById('yjEditorUndoBtn');
    var redoBtn = document.getElementById('yjEditorRedoBtn');
    if (undoBtn) {
      if (hist.canUndo) undoBtn.removeAttribute('disabled');
      else undoBtn.setAttribute('disabled', '');
    }
    if (redoBtn) {
      if (hist.canRedo) redoBtn.removeAttribute('disabled');
      else redoBtn.setAttribute('disabled', '');
    }

    // Update project name in toolbar
    var titleEl = document.querySelector('.yj-editor-toolbar-title');
    if (titleEl) {
      titleEl.textContent = state.editor.project.name || '未命名项目';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 2-D-4: Project Binding & Save
  // ═══════════════════════════════════════════════════════════════

  /**
   * 加载已存在的项目（通过 projectId）
   *
   * 流程：
   *   1. 验证 projectId
   *   2. 尝试从本地存储恢复（localStorage）
   *   3. 尝试从远程 API 加载
   *   4. 失败则创建新项目
   *
   * @param {string} projectId - 项目 ID
   * @returns {Promise<Object>} 项目对象
   */
  function loadProject(projectId) {
    return new Promise(function (resolve, reject) {
      if (!projectId) {
        // No projectId → create new
        var proj = YJ.Editor.createProject({ name: '新剪辑项目' });
        resolve(proj);
        return;
      }

      // Try localStorage first
      var savedKey = 'yj_editor_project_' + projectId;
      try {
        var saved = localStorage.getItem(savedKey);
        if (saved) {
          var data = JSON.parse(saved);
          if (data && data.project && data.timeline) {
            // Restore project state
            var ed = state.editor;
            ed.project = data.project;
            ed.timeline = data.timeline;
            ed.mediaBin = data.mediaBin || { items: [], selectedIds: [], selectedAsset: null };
            ed.project.updatedAt = new Date().toISOString();

            console.log('[Editor/Project] 已从本地恢复项目:', projectId);
            resolve(ed.project);
            return;
          }
        }
      } catch (e) {
        console.warn('[Editor/Project] 本地存储读取失败:', e.message);
      }

      // Try remote API (if available)
      if (YJ.api && typeof YJ.api.getProject === 'function') {
        YJ.api.getProject(projectId).then(function (remoteData) {
          if (remoteData) {
            var ed = state.editor;
            ed.project = remoteData.project || ed.project;
            ed.timeline = remoteData.timeline || ed.timeline;
            ed.mediaBin = remoteData.mediaBin || { items: [], selectedIds: [], selectedAsset: null };
            ed.project.updatedAt = new Date().toISOString();

            // Save to localStorage for offline
            saveProjectLocal();

            console.log('[Editor/Project] 已从远程加载项目:', projectId);
            resolve(ed.project);
          } else {
            // No remote data, create new
            var proj = YJ.Editor.createProject({ name: '新剪辑项目' });
            resolve(proj);
          }
        }).catch(function () {
          // Fallback: create new
          var proj = YJ.Editor.createProject({ name: '新剪辑项目' });
          resolve(proj);
        });
      } else {
        // No API, create new
        var proj = YJ.Editor.createProject({ name: '新剪辑项目' });
        resolve(proj);
      }
    });
  }

  /**
   * 保存当前项目
   *
   * 保存范围：
   *   - project (基本信息、名称)
   *   - timeline (完整 track + clip 数据)
   *   - mediaBin (素材引用)
   *
   * @returns {Object} 保存结果 { success, savedAt }
   */
  function saveProject() {
    var ed = state.editor;
    var result = { success: false, savedAt: null };

    if (!ed.project.id) {
      // Auto-create project ID
      ed.project.id = 'proj_' + Date.now().toString(36);
    }

    var now = new Date().toISOString();
    ed.project.updatedAt = now;

    // Save to localStorage
    saveProjectLocal();

    // Save to remote (if available)
    if (YJ.api && typeof YJ.api.saveProject === 'function') {
      YJ.api.saveProject({
        projectId: ed.project.id,
        project: ed.project,
        timeline: ed.timeline,
        mediaBin: ed.mediaBin
      }).then(function () {
        console.log('[Editor/Project] 已保存到远程:', ed.project.name);
      }).catch(function (err) {
        console.warn('[Editor/Project] 远程保存失败:', err.message);
      });
    }

    result.success = true;
    result.savedAt = now;
    console.log('[Editor/Project] 项目已保存:', ed.project.name);

    return result;
  }

  /**
   * 保存到 localStorage
   */
  function saveProjectLocal() {
    var ed = state.editor;
    if (!ed.project.id) return;
    try {
      var key = 'yj_editor_project_' + ed.project.id;
      var data = {
        project: JSON.parse(JSON.stringify(ed.project)),
        timeline: JSON.parse(JSON.stringify(ed.timeline)),
        mediaBin: {
          // Only save references, not binary data
          items: (ed.mediaBin.items || []).map(function (item) {
            return {
              id: item.id,
              name: item.name,
              type: item.type,
              url: item.url,
              thumbnailUrl: item.thumbnailUrl,
              duration: item.duration,
              size: item.size,
              addedAt: item.addedAt
            };
          }),
          selectedIds: [],
          selectedAsset: null
        },
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn('[Editor/Project] 本地保存失败:', e.message);
    }
  }

  /**
   * 自动保存（每 30 秒）
   */
  var _autoSaveInterval = null;

  function startAutoSave() {
    stopAutoSave();
    _autoSaveInterval = setInterval(function () {
      // Only save if project has changes
      var ed = state.editor;
      if (ed.project.id && ed.timeline.tracks.length > 0) {
        saveProjectLocal();
      }
    }, 30000); // 30 seconds
  }

  function stopAutoSave() {
    if (_autoSaveInterval) {
      clearInterval(_autoSaveInterval);
      _autoSaveInterval = null;
    }
  }

  /**
   * 获取当前项目 ID
   * @returns {string|null}
   */
  function getProjectId() {
    return state.editor.project.id;
  }

  /**
   * 获取项目摘要（用于列表展示）
   * @returns {Object}
   */
  function getProjectSummary() {
    var ed = state.editor;
    var totalClips = 0;
    var tracks = ed.timeline.tracks || [];
    for (var i = 0; i < tracks.length; i++) {
      totalClips += (tracks[i].clips || []).length;
    }

    return {
      id: ed.project.id,
      name: ed.project.name,
      duration: ed.timeline.duration,
      trackCount: tracks.length,
      clipCount: totalClips,
      assetCount: (ed.mediaBin.items || []).length,
      resolution: ed.project.resolution,
      updatedAt: ed.project.updatedAt
    };
  }

  /**
   * 列出 localStorage 中所有已保存的项目
   * @returns {Array}
   */
  function listSavedProjects() {
    var projects = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('yj_editor_project_') === 0) {
          try {
            var data = JSON.parse(localStorage.getItem(key));
            if (data && data.project) {
              projects.push({
                id: data.project.id,
                name: data.project.name,
                duration: data.project.duration,
                savedAt: data.savedAt,
                updatedAt: data.project.updatedAt
              });
            }
          } catch (e) { /* skip invalid entries */ }
        }
      }
    } catch (e) {
      console.warn('[Editor/Project] 无法列举项目:', e.message);
    }
    // Sort by savedAt descending
    projects.sort(function (a, b) {
      return (b.savedAt || '').localeCompare(a.savedAt || '');
    });
    return projects;
  }

  // ─── Expose ─────────────────────────────────────────────────
  YJ.EditorApp = {
    renderEditor: renderEditor,
    initEditor: initEditor,
    refresh: refresh,
    refreshTimeline: refreshTimeline,
    refreshMediaPanel: refreshMediaPanel,
    // Phase 2-D-4: Project binding
    loadProject: loadProject,
    saveProject: saveProject,
    getProjectId: getProjectId,
    getProjectSummary: getProjectSummary,
    listSavedProjects: listSavedProjects,
    startAutoSave: startAutoSave,
    stopAutoSave: stopAutoSave
  };

  window.YJ = YJ;

  // ─── Override global renderEditor for app.js compatibility ───
  window.renderEditor = renderEditor;

  console.log('[Enterprise/EditorApp] Phase 2-D-4 editor app orchestrator initialized (project binding)');
})();
