/**
 * YuJian Editor — Toolbar Component
 * Phase 2-D-2: 编辑器工具栏（撤销/重做/项目名称/操作按钮）
 *
 * 依赖：YJ.state.editor, YJ.Editor
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  var state = YJ.state;

  /**
   * 渲染工具栏 HTML
   * @returns {string}
   */
  function renderToolbar() {
    var ed = state.editor;
    var hist = YJ.Editor.getHistoryState();
    var projectName = ed.project.name || '未命名项目';

    return ''
      + '<div class="yj-editor-toolbar">'
      // Left: project name + undo/redo
      + '<div class="yj-editor-toolbar-left">'
      +   '<span class="yj-editor-toolbar-title">' + escHtml(projectName) + '</span>'
      +   '<span class="yj-editor-toolbar-divider"></span>'
      +   '<button class="yj-editor-toolbar-btn" id="yjEditorUndoBtn" title="撤销 (Ctrl+Z)"'
      +     (hist.canUndo ? '' : ' disabled') + '>'
      +     '<i class="fas fa-undo"></i>'
      +   '</button>'
      +   '<button class="yj-editor-toolbar-btn" id="yjEditorRedoBtn" title="重做 (Ctrl+Y)"'
      +     (hist.canRedo ? '' : ' disabled') + '>'
      +     '<i class="fas fa-redo"></i>'
      +   '</button>'
      + '</div>'

      // Center: transport controls (play, stop) + edit actions (cut)
      + '<div class="yj-editor-toolbar-center">'
      +   '<button class="yj-editor-toolbar-btn" id="yjEditorPlayBtn" title="播放/暂停 (Space)">'
      +     '<i class="fas fa-play"></i>'
      +   '</button>'
      +   '<button class="yj-editor-toolbar-btn" id="yjEditorStopBtn" title="停止">'
      +     '<i class="fas fa-stop"></i>'
      +   '</button>'
      +   '<span class="yj-editor-toolbar-divider"></span>'
      +   '<button class="yj-editor-toolbar-btn" id="yjEditorCutBtn" title="切割 (在当前播放头位置拆分选中片段)">'
      +     '<i class="fas fa-cut"></i> 切割'
      +   '</button>'
      +   '<button class="yj-editor-toolbar-btn yj-editor-toolbar-btn--danger" id="yjEditorDeleteBtn" title="删除选中片段 (Delete)">'
      +     '<i class="fas fa-trash-alt"></i>'
      +   '</button>'
      + '</div>'

      // Right: actions
      + '<div class="yj-editor-toolbar-right">'
      +   '<button class="yj-editor-toolbar-btn" id="yjEditorImportBtn" title="导入素材">'
      +     '<i class="fas fa-folder-open"></i> 导入素材'
      +   '</button>'
      +   '<button class="yj-editor-toolbar-btn yj-editor-toolbar-btn--primary" id="yjEditorExportBtn" title="导出视频">'
      +     '<i class="fas fa-download"></i> 导出视频'
      +   '</button>'
      + '</div>'
      + '</div>';
  }

  /**
   * 绑定工具栏事件
   */
  function bindToolbarEvents() {
    // Undo
    var undoBtn = document.getElementById('yjEditorUndoBtn');
    if (undoBtn) {
      undoBtn.addEventListener('click', function () {
        if (YJ.Editor.undo()) {
          YJ.EditorApp.refresh();
        }
      });
    }

    // Redo
    var redoBtn = document.getElementById('yjEditorRedoBtn');
    if (redoBtn) {
      redoBtn.addEventListener('click', function () {
        if (YJ.Editor.redo()) {
          YJ.EditorApp.refresh();
        }
      });
    }

    // Play / Pause toggle
    var playBtn = document.getElementById('yjEditorPlayBtn');
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        var isPlaying = !state.editor.preview.isPlaying;
        YJ.Editor.setPreviewPlaying(isPlaying);
        YJ.EditorApp.refresh();
      });
    }

    // Stop
    var stopBtn = document.getElementById('yjEditorStopBtn');
    if (stopBtn) {
      stopBtn.addEventListener('click', function () {
        YJ.Editor.setPreviewPlaying(false);
        YJ.Editor.setPreviewTime(0);
        YJ.EditorApp.refresh();
      });
    }

    // Import
    var importBtn = document.getElementById('yjEditorImportBtn');
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        // Navigate back to assets page for importing
        if (typeof navigateTo === 'function') {
          navigateTo('assets');
        }
        var showToast = (YJ.utils && YJ.utils.showToast) || window.showToast;
        if (typeof showToast === 'function') {
          showToast('请在资产管理中选择素材后发送到编辑器', 'info');
        }
      });
    }

    // Cut — split selected clip at current playhead position
    var cutBtn = document.getElementById('yjEditorCutBtn');
    if (cutBtn) {
      cutBtn.addEventListener('click', function () {
        if (YJ.EditorTimeline && YJ.EditorTimeline.cutClipAtPlayhead) {
          YJ.EditorTimeline.cutClipAtPlayhead();
        }
      });
    }

    // Delete selected clip
    var deleteBtn = document.getElementById('yjEditorDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        if (YJ.Editor.deleteSelectedClip()) {
          var showToast = (YJ.utils && YJ.utils.showToast) || window.showToast;
          if (typeof showToast === 'function') {
            showToast('片段已删除', 'info');
          }
          YJ.EditorApp.refreshTimeline();
        }
      });
    }

    // Export placeholder
    var exportBtn = document.getElementById('yjEditorExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        var showToast = (YJ.utils && YJ.utils.showToast) || window.showToast;
        if (typeof showToast === 'function') {
          showToast('导出功能将在后续版本中实现', 'info');
        }
      });
    }
  }

  /** Keyboard shortcuts */
  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      // Only when editor is visible
      var editorContainer = document.getElementById('yjEditorContainer');
      if (!editorContainer) return;
      // Check if container is in the DOM and visible
      if (editorContainer.offsetParent === null && getComputedStyle(editorContainer).display === 'none') return;

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (YJ.Editor.undo()) {
          YJ.EditorApp.refresh();
        }
      }

      // Ctrl+Y or Ctrl+Shift+Z: Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (YJ.Editor.redo()) {
          YJ.EditorApp.refresh();
        }
      }

      // Space: Play/Pause (only if not in input)
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        var isPlaying = !state.editor.preview.isPlaying;
        YJ.Editor.setPreviewPlaying(isPlaying);
        YJ.EditorApp.refresh();
      }
    });
  }

  // ─── Expose ─────────────────────────────────────────────────
  YJ.EditorToolbar = {
    render: renderToolbar,
    bindEvents: bindToolbarEvents,
    bindKeyboardShortcuts: bindKeyboardShortcuts
  };

  window.YJ = YJ;

  /** Escape HTML entities */
  function escHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }
})();
