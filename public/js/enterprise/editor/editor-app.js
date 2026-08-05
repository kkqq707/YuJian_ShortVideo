/**
 * YuJian Editor — App Orchestrator
 * Phase 2-D-2: 编辑器主应用组件
 *
 * 职责：
 *   - 渲染整体编辑器布局
 *   - 协调子组件（Toolbar, Player, Timeline, Media, Inspector）
 *   - 提供统一的 refresh() 入口
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

    // Auto-create project if none exists
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
  function initEditor() {
    if (YJ.EditorToolbar && YJ.EditorToolbar.bindEvents) {
      YJ.EditorToolbar.bindEvents();
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
    console.log('[Editor/App] Editor initialized');
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

    // Full timeline re-render (positional, harder to patch)
    // For now, refresh timeline only when explicitly called
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

  // ─── Expose ─────────────────────────────────────────────────
  YJ.EditorApp = {
    renderEditor: renderEditor,
    initEditor: initEditor,
    refresh: refresh,
    refreshTimeline: refreshTimeline
  };

  window.YJ = YJ;

  // ─── Override global renderEditor for app.js compatibility ───
  window.renderEditor = renderEditor;

  console.log('[Enterprise/EditorApp] Editor app orchestrator initialized');
})();
