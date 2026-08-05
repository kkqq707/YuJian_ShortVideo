/**
 * YuJian Editor — Timeline Component
 * Phase 2-D-3: 时间轴交互
 *
 * 功能：
 *   1. Clip 选择 — 点击选中，更新 timeline.selectedClipId
 *   2. Playhead  — 播放头同步 timeline.currentTime ↔ 播放器
 *   3. Clip 拖动 — 鼠标拖动片段改变位置
 *   4. 缩放控制   — 1x / 2x / 4x 离散缩放
 *   5. 切割       — 在 currentTime 处拆分 Clip
 *   6. 删除       — Delete 键删除选中片段
 *
 * 读取：YJ.state.editor.timeline
 * 依赖：YJ.Editor (editor-state.js), YJ.EditorPlayer
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  var state = YJ.state;

  /** Base pixels per second (at 1x zoom) */
  var BASE_PX_PER_SECOND = 80;

  /** Supported zoom levels */
  var ZOOM_LEVELS = [0.5, 1, 2, 4];

  /** Track type display config */
  var TRACK_CONFIG = {
    video:    { icon: 'fa-video',   label: '视频',   cls: '--video' },
    audio:    { icon: 'fa-music',   label: '音频',   cls: '--audio' },
    subtitle: { icon: 'fa-font',    label: '字幕',   cls: '--subtitle' },
    effect:   { icon: 'fa-magic',   label: '特效',   cls: '--effect' }
  };

  // ═══════════════════════════════════════════════════════════════
  // Drag State (module-private, survives re-renders through
  // re-binding but is reset on each new drag)
  // ═══════════════════════════════════════════════════════════════
  var _drag = null;

  /**
   * Reset drag state
   */
  function resetDrag() {
    _drag = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // ═══════════════════════════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get current px per second (base × zoom)
   * @returns {number}
   */
  function pxPerSec() {
    return BASE_PX_PER_SECOND * (state.editor.timeline.zoom || 1);
  }

  /**
   * 渲染时间轴 HTML
   * @returns {string}
   */
  function renderTimeline() {
    var ed = state.editor;
    var tl = ed.timeline;
    var tracks = tl.tracks || [];
    var zoom = tl.zoom || 1;
    var pps = pxPerSec();

    return ''
      + '<div class="yj-editor-timeline">'
      // Header
      + '<div class="yj-editor-timeline-header">'
      +   '<span class="yj-editor-timeline-header-label">时间轴</span>'
      +   '<span class="yj-editor-timeline-header-info">' + formatTime(tl.duration) + '</span>'
      +   renderZoomControls(zoom)
      + '</div>'

      // Ruler
      + '<div class="yj-editor-timeline-ruler" id="yjEditorRuler">'
      +   '<div class="yj-editor-timeline-ruler-inner" style="position:relative;width:' + Math.max(tl.duration * pps, 400) + 'px">'
      +     renderRulerMarks(tl.duration, pps)
      +     renderPlayhead(tl.currentTime || tl.playheadPosition || 0, pps)
      +   '</div>'
      + '</div>'

      // Track list
      + '<div class="yj-editor-timeline-tracks-wrapper">'
      +   '<div class="yj-editor-timeline-tracks" id="yjEditorTracks"'
      +     ' style="min-width:' + Math.max(tl.duration * pps, 400) + 'px">'
      +     (tracks.length > 0
          ? tracks.map(function (track) { return renderTrack(track, pps); }).join('')
          : '<div class="yj-editor-timeline-empty">暂无轨道，请创建项目或添加素材</div>')
      +   '</div>'
      + '</div>'
      + '</div>';
  }

  /**
   * 渲染缩放控件
   * @param {number} currentZoom
   * @returns {string}
   */
  function renderZoomControls(currentZoom) {
    var html = '<span class="yj-editor-timeline-zoom-group">';
    for (var i = 0; i < ZOOM_LEVELS.length; i++) {
      var z = ZOOM_LEVELS[i];
      var isActive = (Math.abs(currentZoom - z) < 0.01);
      html += '<button class="yj-editor-timeline-zoom-btn'
        + (isActive ? ' yj-editor-timeline-zoom-btn--active' : '') + '"'
        + ' data-zoom="' + z + '"'
        + ' title="' + z + 'x 缩放">'
        + (z >= 1 ? Math.round(z) + 'x' : z + 'x')
        + '</button>';
    }
    html += '</span>';
    return html;
  }

  /**
   * 渲染单个轨道
   * @param {Object} track
   * @param {number} pps - pixels per second
   * @returns {string}
   */
  function renderTrack(track, pps) {
    var cfg = TRACK_CONFIG[track.type] || TRACK_CONFIG.video;
    var clips = track.clips || [];
    var trackHeight = track.height || 56;

    return ''
      + '<div class="yj-editor-timeline-track" data-track-id="' + escAttr(track.id) + '" style="min-height:' + trackHeight + 'px">'
      // Label
      + '<div class="yj-editor-timeline-track-label">'
      +   '<span class="yj-editor-timeline-track-icon yj-editor-timeline-track-icon' + cfg.cls + '">'
      +     '<i class="fas ' + cfg.icon + '"></i>'
      +   '</span>'
      +   '<span class="yj-editor-timeline-track-name">' + escHtml(track.name) + '</span>'
      + '</div>'
      // Clips region
      + '<div class="yj-editor-timeline-track-clips" style="position:relative">'
      +   clips.map(function (clip) { return renderClip(clip, pps); }).join('')
      + '</div>'
      + '</div>';
  }

  /**
   * 渲染单个 Clip
   * @param {Object} clip
   * @param {number} pps
   * @returns {string}
   */
  function renderClip(clip, pps) {
    var left = clip.position * pps;
    var width = Math.max(clip.duration * pps, 8);
    var tl = state.editor.timeline;
    var selectedId = tl.selectedClipId || state.editor.ui.selectedClipId;
    var isSelected = selectedId === clip.id;

    var typeCls = '';
    switch (clip.type) {
      case 'video':    typeCls = '--video'; break;
      case 'audio':    typeCls = '--audio'; break;
      case 'subtitle': typeCls = '--subtitle'; break;
      case 'effect':   typeCls = '--effect'; break;
    }

    return ''
      + '<div class="yj-editor-timeline-clip yj-editor-timeline-clip' + typeCls
      + (isSelected ? ' yj-editor-timeline-clip--selected' : '') + '"'
      + ' data-clip-id="' + escAttr(clip.id) + '"'
      + ' data-track-id="' + escAttr(clip.trackId) + '"'
      + ' style="left:' + left + 'px;width:' + width + 'px"'
      + ' title="' + escAttr(clip.name) + ' (' + formatTime(clip.duration) + ')">'
      +   escHtml(truncateText(clip.name, 20)) + ' · ' + formatTimeShort(clip.duration)
      + '</div>';
  }

  /**
   * 渲染时间尺刻度
   * @param {number} duration - 总时长（秒）
   * @param {number} pps
   * @returns {string}
   */
  function renderRulerMarks(duration, pps) {
    if (duration <= 0) return '';
    var html = '';
    var interval = calcRulerInterval(pps);
    var totalWidth = duration * pps;

    for (var t = 0; t <= duration + interval; t += interval) {
      var x = t * pps;
      html += '<div class="yj-editor-timeline-ruler-tick" style="left:' + x + 'px"></div>';
      html += '<div class="yj-editor-timeline-ruler-mark" style="left:' + x + 'px">' + formatTimeShort(t) + '</div>';
    }
    return html;
  }

  /**
   * 计算合适的刻度间隔
   * @param {number} pps
   * @returns {number}
   */
  function calcRulerInterval(pps) {
    var minPxBetween = 50;
    var intervals = [0.5, 1, 2, 5, 10, 30, 60];
    for (var i = 0; i < intervals.length; i++) {
      if (intervals[i] * pps >= minPxBetween) return intervals[i];
    }
    return 60;
  }

  /**
   * 渲染播放头指示器
   * @param {number} position - 时间（秒）
   * @param {number} pps
   * @returns {string}
   */
  function renderPlayhead(position, pps) {
    var x = position * pps;
    return ''
      + '<div class="yj-editor-timeline-playhead" id="yjEditorPlayhead" style="left:' + x + 'px">'
      +   '<div class="yj-editor-timeline-playhead-head"></div>'
      +   '<div class="yj-editor-timeline-playhead-line"></div>'
      + '</div>';
  }

  // ═══════════════════════════════════════════════════════════════
  // Event Binding
  // ═══════════════════════════════════════════════════════════════

  /** Phase 2-D-4.5: Guard flags to prevent stacking global listeners */
  var _deleteKeyBound = false;
  var _cutButtonBound = false;

  /**
   * 绑定所有时间轴事件（在每次 re-render 后调用）
   */
  function bindTimelineEvents() {
    bindClipClick();
    bindRulerClick();
    bindZoomButtons();
    bindClipDrag();
    bindDeleteKey();
    bindCutButton();
    bindScrollSync();
    bindTimelineDropZone(); // Phase 2-D-4: 素材拖放到时间轴
  }

  /**
   * 1. Clip 选择 — 点击剪辑片段，更新 selectedClipId
   */
  function bindClipClick() {
    var tracksContainer = document.getElementById('yjEditorTracks');
    if (!tracksContainer) return;

    // Remove old listener by cloning (simple approach: add once via a flag)
    // Instead, use a fresh listener each bind (since DOM is replaced)
    tracksContainer.addEventListener('click', function (e) {
      var clipEl = e.target.closest('.yj-editor-timeline-clip');
      if (!clipEl) {
        // Click on empty track area → deselect
        selectClip(null, null);
        return;
      }

      var clipId = clipEl.getAttribute('data-clip-id');
      var trackId = clipEl.getAttribute('data-track-id');
      selectClip(clipId, trackId);
    });
  }

  /**
   * 选中 Clip（更新状态 + 刷新 UI）
   * @param {string|null} clipId
   * @param {string|null} trackId
   */
  function selectClip(clipId, trackId) {
    state.editor.timeline.selectedClipId = clipId;
    state.editor.ui.selectedClipId = clipId;
    state.editor.ui.selectedTrackId = trackId || null;

    // Phase 2-D-4.5: Update visual selection state on existing DOM
    var allClips = document.querySelectorAll('.yj-editor-timeline-clip--selected');
    for (var i = 0; i < allClips.length; i++) {
      allClips[i].classList.remove('yj-editor-timeline-clip--selected');
    }
    if (clipId) {
      var newSelected = document.querySelector('.yj-editor-timeline-clip[data-clip-id="' + escAttrForSelector(clipId) + '"]');
      if (newSelected) {
        newSelected.classList.add('yj-editor-timeline-clip--selected');
      }
    }

    // Refresh inspector to show clip properties
    if (YJ.EditorInspector && YJ.EditorInspector.refresh) {
      YJ.EditorInspector.refresh();
    }
  }

  /**
   * 2. Ruler 点击 → 移动 Playhead（同步播放器）
   */
  function bindRulerClick() {
    var ruler = document.getElementById('yjEditorRuler');
    if (!ruler) return;

    ruler.addEventListener('click', function (e) {
      // Ignore if clicking on the playhead itself (it overlaps)
      if (e.target.closest('.yj-editor-timeline-playhead')) return;

      var rect = ruler.getBoundingClientRect();
      var x = e.clientX - rect.left + ruler.scrollLeft;
      var pps = pxPerSec();
      var time = x / pps;

      seekPlayhead(Math.max(0, time));
    });
  }

  /**
   * 设置播放头位置（同步 timeline + preview + player）
   * @param {number} time - 时间（秒）
   */
  function seekPlayhead(time) {
    var tl = state.editor.timeline;
    var maxTime = tl.duration || 0;
    time = Math.max(0, Math.min(time, maxTime));

    // Update state
    tl.currentTime = time;
    tl.playheadPosition = time;
    state.editor.preview.currentTime = time;

    // Sync video element
    if (YJ.EditorPlayer && YJ.EditorPlayer.seekTo) {
      YJ.EditorPlayer.seekTo(time);
    }

    // Refresh timeline to move playhead visually
    updatePlayheadPosition();
    YJ.EditorApp.refresh();
  }

  /**
   * 仅更新播放头 CSS 位置（不重新渲染）
   */
  function updatePlayheadPosition() {
    var playhead = document.getElementById('yjEditorPlayhead');
    if (!playhead) return;
    var pps = pxPerSec();
    var time = state.editor.timeline.currentTime || state.editor.timeline.playheadPosition || 0;
    playhead.style.left = (time * pps) + 'px';
  }

  /**
   * 3. Clip 拖动 — 鼠标拖动改变片段位置
   */
  function bindClipDrag() {
    var tracksContainer = document.getElementById('yjEditorTracks');
    if (!tracksContainer) return;

    tracksContainer.addEventListener('mousedown', function (e) {
      var clipEl = e.target.closest('.yj-editor-timeline-clip');
      if (!clipEl) return;

      // Only left mouse button
      if (e.button !== 0) return;

      e.preventDefault();

      var clipId = clipEl.getAttribute('data-clip-id');
      var trackId = clipEl.getAttribute('data-track-id');

      // Find the clip to get its data
      var clip = findClipById(trackId, clipId);
      if (!clip) return;

      var pps = pxPerSec();
      var startMouseX = e.clientX;
      var startClipPosition = clip.position;

      // Select on mousedown
      selectClip(clipId, trackId);

      _drag = {
        clipId: clipId,
        trackId: trackId,
        clip: clip,
        startMouseX: startMouseX,
        startClipPosition: startClipPosition,
        pps: pps,
        hasMoved: false
      };

      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      // Add dragging class to clip
      clipEl.classList.add('yj-editor-timeline-clip--dragging');
    });
  }

  /**
   * 全局 mousemove — 处理拖拽
   */
  document.addEventListener('mousemove', function (e) {
    if (!_drag) return;

    var dx = e.clientX - _drag.startMouseX;
    var dt = dx / _drag.pps;
    var newPosition = Math.max(0, _drag.startClipPosition + dt);

    // Snap to grid (0.1s increments when zoom >= 2)
    var zoom = state.editor.timeline.zoom || 1;
    if (zoom >= 2) {
      newPosition = Math.round(newPosition * 10) / 10;
    } else {
      newPosition = Math.round(newPosition * 5) / 5;
    }

    _drag.newPosition = newPosition;
    _drag.hasMoved = true;

    // Update clip position visually (without re-render for performance)
    var clipEl = document.querySelector(
      '.yj-editor-timeline-clip[data-clip-id="' + escAttrForSelector(_drag.clipId) + '"]'
    );
    if (clipEl) {
      clipEl.style.left = (newPosition * _drag.pps) + 'px';
    }
  });

  /**
   * 全局 mouseup — 结束拖拽
   */
  document.addEventListener('mouseup', function (e) {
    if (!_drag) return;

    if (_drag.hasMoved && _drag.newPosition !== undefined) {
      // Commit the move
      YJ.Editor.moveClip(_drag.trackId, _drag.clipId, _drag.newPosition);
    }

    // Remove dragging class
    var clipEl = document.querySelector(
      '.yj-editor-timeline-clip[data-clip-id="' + escAttrForSelector(_drag.clipId) + '"]'
    );
    if (clipEl) {
      clipEl.classList.remove('yj-editor-timeline-clip--dragging');
    }

    resetDrag();
    YJ.EditorApp.refresh();
  });

  /**
   * 4. 缩放控制 — 1x / 2x / 4x 按钮
   */
  function bindZoomButtons() {
    var header = document.querySelector('.yj-editor-timeline-header');
    if (!header) return;

    // Use event delegation on the header
    header.addEventListener('click', function (e) {
      var btn = e.target.closest('.yj-editor-timeline-zoom-btn');
      if (!btn) return;

      var zoom = parseFloat(btn.getAttribute('data-zoom'));
      if (isNaN(zoom)) return;

      setZoom(zoom);
    });
  }

  /**
   * 设置缩放级别
   * @param {number} zoom - 1, 2, or 4
   */
  function setZoom(zoom) {
    state.editor.timeline.zoom = zoom;
    state.editor.ui.zoom = zoom;
    YJ.EditorApp.refreshTimeline();
  }

  /**
   * 获取当前缩放级别
   * @returns {number}
   */
  function getZoom() {
    return state.editor.timeline.zoom || 1;
  }

  /**
   * 5. 切割 Clip — 在当前播放头位置拆分选中的片段
   */
  function cutClipAtPlayhead() {
    var tl = state.editor.timeline;
    var clipId = tl.selectedClipId || state.editor.ui.selectedClipId;
    var trackId = state.editor.ui.selectedTrackId;

    if (!clipId || !trackId) {
      var showToast = (YJ.utils && YJ.utils.showToast) || window.showToast;
      if (typeof showToast === 'function') {
        showToast('请先选择要切割的片段', 'info');
      }
      return;
    }

    var currentTime = tl.currentTime || tl.playheadPosition || 0;
    var result = YJ.Editor.splitClip(trackId, clipId, currentTime);

    if (result) {
      var showToast = (YJ.utils && YJ.utils.showToast) || window.showToast;
      if (typeof showToast === 'function') {
        showToast('片段已切割', 'success');
      }
      YJ.EditorApp.refreshTimeline();
    } else {
      var showToast2 = (YJ.utils && YJ.utils.showToast) || window.showToast;
      if (typeof showToast2 === 'function') {
        showToast2('切割点不在选中片段范围内', 'warning');
      }
    }
  }

  /**
   * 绑定切割按钮
   */
  function bindCutButton() {
    // Phase 2-D-4.5: Only bind once — #yjEditorContainer persists across re-renders
    if (_cutButtonBound) return;
    _cutButtonBound = true;

    // Listen for toolbar cut button (delegated)
    var container = document.getElementById('yjEditorContainer');
    if (!container) return;

    container.addEventListener('click', function (e) {
      var btn = e.target.closest('#yjEditorCutBtn, [data-action="cut"]');
      if (!btn) return;
      cutClipAtPlayhead();
    });
  }

  /**
   * 6. Delete 键 — 删除选中的 Clip
   */
  function bindDeleteKey() {
    // Phase 2-D-4.5: Only bind once to prevent keydown listener stacking
    if (_deleteKeyBound) return;
    _deleteKeyBound = true;

    // Global keyboard handler (combined with existing shortcuts)
    document.addEventListener('keydown', function (e) {
      // Only when editor is visible
      var editorContainer = document.getElementById('yjEditorContainer');
      if (!editorContainer) return;
      if (editorContainer.offsetParent === null && getComputedStyle(editorContainer).display === 'none') return;

      // Don't delete when typing in inputs
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

      // Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        var clipId = state.editor.timeline.selectedClipId || state.editor.ui.selectedClipId;
        if (!clipId) return;

        e.preventDefault();
        if (YJ.Editor.deleteSelectedClip()) {
          var showToast = (YJ.utils && YJ.utils.showToast) || window.showToast;
          if (typeof showToast === 'function') {
            showToast('片段已删除', 'info');
          }
          YJ.EditorApp.refreshTimeline();
        }
      }
    });
  }

  /**
   * 同步 Ruler 和 Tracks 的水平滚动
   */
  function bindScrollSync() {
    var ruler = document.getElementById('yjEditorRuler');
    var tracksWrapper = document.querySelector('.yj-editor-timeline-tracks-wrapper');
    if (!ruler || !tracksWrapper) return;

    var syncing = false;

    ruler.addEventListener('scroll', function () {
      if (syncing) return;
      syncing = true;
      tracksWrapper.scrollLeft = ruler.scrollLeft;
      syncing = false;
    });

    tracksWrapper.addEventListener('scroll', function () {
      if (syncing) return;
      syncing = true;
      ruler.scrollLeft = tracksWrapper.scrollLeft;
      syncing = false;
    });
  }

  /**
   * Phase 2-D-4: 素材拖放到时间轴
   *
   * 监听时间轴区域的 dragover/drop 事件，
   * 解析拖放数据中的素材信息并生成 Clip
   */
  function bindTimelineDropZone() {
    var timeline = document.querySelector('.yj-editor-timeline');
    if (!timeline) return;

    // Track the drop position indicator
    var _dropIndicator = null;

    /**
     * 获取或创建放置位置指示器
     */
    function getDropIndicator() {
      if (!_dropIndicator) {
        _dropIndicator = document.createElement('div');
        _dropIndicator.className = 'yj-editor-timeline-drop-indicator';
        _dropIndicator.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;'
          + 'background:#6366f1;z-index:30;pointer-events:none;display:none;'
          + 'box-shadow:0 0 6px rgba(99,102,241,0.6);';
        var tracksEl = document.getElementById('yjEditorTracks');
        if (tracksEl) {
          tracksEl.style.position = 'relative';
          tracksEl.appendChild(_dropIndicator);
        }
      }
      return _dropIndicator;
    }

    // ── dragover: show visual feedback + calculate drop position ──
    timeline.addEventListener('dragover', function (e) {
      // Check if this is an editor asset drag
      var hasAsset = false;
      try {
        var types = e.dataTransfer.types || [];
        for (var t = 0; t < types.length; t++) {
          if (types[t] === 'application/yj-editor-asset') { hasAsset = true; break; }
        }
      } catch (ex) {
        // Cross-origin drag — check for files
        hasAsset = (e.dataTransfer.files && e.dataTransfer.files.length > 0);
      }

      if (!hasAsset) {
        // Also accept files dropped from OS
        if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      // Show drop indicator at calculated position
      var tracksWrapper = document.querySelector('.yj-editor-timeline-tracks-wrapper');
      if (tracksWrapper) {
        var rect = tracksWrapper.getBoundingClientRect();
        var x = e.clientX - rect.left + tracksWrapper.scrollLeft;
        var pps = pxPerSec();
        var dropTime = Math.max(0, x / pps);

        var indicator = getDropIndicator();
        if (indicator) {
          indicator.style.left = x + 'px';
          indicator.style.display = 'block';
        }
      }

      // Add visual drop-active class
      timeline.classList.add('yj-editor-timeline--drop-active');
    });

    // ── dragleave: remove visual feedback ──
    timeline.addEventListener('dragleave', function (e) {
      // Only remove when actually leaving the timeline
      if (!timeline.contains(e.relatedTarget)) {
        timeline.classList.remove('yj-editor-timeline--drop-active');
        var indicator = getDropIndicator();
        if (indicator) indicator.style.display = 'none';
      }
    });

    // ── drop: create clip at drop position ──
    timeline.addEventListener('drop', function (e) {
      e.preventDefault();
      timeline.classList.remove('yj-editor-timeline--drop-active');
      var indicator = getDropIndicator();
      if (indicator) indicator.style.display = 'none';

      // Calculate drop time position
      var tracksWrapper = document.querySelector('.yj-editor-timeline-tracks-wrapper');
      var dropTime = 0;
      if (tracksWrapper) {
        var rect = tracksWrapper.getBoundingClientRect();
        var pps = pxPerSec();
        dropTime = Math.max(0, (e.clientX - rect.left + tracksWrapper.scrollLeft) / pps);
        // Snap to grid
        var zoom = state.editor.timeline.zoom || 1;
        if (zoom >= 2) {
          dropTime = Math.round(dropTime * 10) / 10;
        } else {
          dropTime = Math.round(dropTime * 5) / 5;
        }
      }

      // ── Handle editor asset drag ──
      var assetData = null;
      try {
        var raw = e.dataTransfer.getData('application/yj-editor-asset');
        if (raw) assetData = JSON.parse(raw);
      } catch (ex) {
        // Not JSON data — try files below
      }

      if (assetData) {
        // Add asset from editor media panel
        if (YJ.EditorMedia && YJ.EditorMedia.addAssetToTimeline) {
          // We need to set position override
          addAssetWithPosition(assetData, dropTime);
        }
        return;
      }

      // ── Handle external file drop ──
      var files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleExternalFileDropToTimeline(files, dropTime);
      }
    });
  }

  /**
   * Phase 2-D-4: 以指定位置添加素材到时间轴
   * @param {Object} assetData - 拖放的素材数据
   * @param {number} position  - 放置位置（秒）
   */
  function addAssetWithPosition(assetData, position) {
    var ed = state.editor;
    var tracks = ed.timeline.tracks || [];

    // Map asset type to track type
    var trackTypeMap = {
      video: 'video', image: 'video', audio: 'audio',
      subtitle: 'subtitle', other: 'video'
    };
    var targetType = trackTypeMap[assetData.type] || 'video';

    // Find matching unlocked track
    var targetTrack = null;
    for (var j = 0; j < tracks.length; j++) {
      if (tracks[j].type === targetType && !tracks[j].locked) {
        targetTrack = tracks[j];
        break;
      }
    }

    if (!targetTrack) {
      // Auto-create track
      var trackNames = { video: '视频轨道', audio: '音频轨道', subtitle: '字幕轨道' };
      targetTrack = YJ.Editor.addTrack({
        type: targetType,
        name: (trackNames[targetType] || '轨道') + ' ' + (tracks.length + 1),
        index: tracks.length
      });
    }

    // Create clip with specified position
    var clip = YJ.Editor.CLIP.fromAsset(assetData, {
      trackId: targetTrack.id,
      position: position,
      duration: assetData.duration || 5
    });

    var result = YJ.Editor.addClipToTrack(targetTrack.id, clip);
    if (result) {
      YJ.EditorApp.refreshTimeline();
      var showToast = (YJ.utils && YJ.utils.showToast) || window.showToast;
      if (typeof showToast === 'function') {
        showToast('已添加素材到 ' + formatTime(position), 'success');
      }
    }
  }

  /**
   * Phase 2-D-4: 处理外部文件拖入时间轴
   * @param {FileList} files
   * @param {number} dropTime - 放置位置（秒）
   */
  function handleExternalFileDropToTimeline(files, dropTime) {
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var assetType = detectFileType(file);
      var assetUrl = URL.createObjectURL(file);

      var asset = {
        id: 'ext_' + Date.now().toString(36) + '_' + i,
        name: file.name,
        type: assetType,
        url: assetUrl,
        thumbnailUrl: assetType === 'image' ? assetUrl : '',
        duration: assetType === 'image' ? 5 : 0,
        size: file.size
      };

      // Add to mediaBin
      YJ.Editor.addToMediaBin(asset);

      // For video/audio, get actual duration
      if (assetType === 'video' || assetType === 'audio') {
        getMediaDurationFromFile(assetUrl, assetType, function (duration) {
          asset.duration = duration || 5;
        });
      }

      // Add to timeline at drop position, spaced for multiple files
      addAssetWithPosition(asset, dropTime + i * (asset.duration || 5));
    }
  }

  /**
   * Phase 2-D-4: 检测文件类型
   * @param {File} file
   * @returns {string}
   */
  function detectFileType(file) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    var videoExts = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'wmv', 'm4v'];
    var imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff'];
    var audioExts = ['mp3', 'wav', 'aac', 'ogg', 'flac', 'wma', 'm4a', 'opus'];
    var subtitleExts = ['srt', 'ass', 'vtt', 'sub', 'sbv'];

    if (videoExts.indexOf(ext) !== -1) return 'video';
    if (imageExts.indexOf(ext) !== -1) return 'image';
    if (audioExts.indexOf(ext) !== -1) return 'audio';
    if (subtitleExts.indexOf(ext) !== -1) return 'subtitle';
    return 'other';
  }

  /**
   * Phase 2-D-4: 获取音频/视频文件时长
   * @param {string} url
   * @param {string} type
   * @param {Function} callback
   */
  function getMediaDurationFromFile(url, type, callback) {
    var el = document.createElement(type);
    el.preload = 'metadata';
    el.onloadedmetadata = function () {
      callback(el.duration || 0);
      URL.revokeObjectURL(url);
    };
    el.onerror = function () {
      callback(0);
    };
    el.src = url;
  }

  /**
   * 在轨道中查找 Clip
   * @param {string} trackId
   * @param {string} clipId
   * @returns {Object|null}
   */
  function findClipById(trackId, clipId) {
    var tracks = state.editor.timeline.tracks || [];
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].id === trackId) {
        var clips = tracks[i].clips || [];
        for (var j = 0; j < clips.length; j++) {
          if (clips[j].id === clipId) return clips[j];
        }
      }
    }
    return null;
  }

  // ─── Formatting ────────────────────────────────────────────

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    var ms = Math.floor((seconds % 1) * 10);
    return pad2(m) + ':' + pad2(s) + '.' + ms;
  }

  function formatTimeShort(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return pad2(m) + ':' + pad2(s);
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function escHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  function escAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escAttrForSelector(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function truncateText(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
  }

  // ─── Expose ─────────────────────────────────────────────────
  YJ.EditorTimeline = {
    render: renderTimeline,
    bindEvents: bindTimelineEvents,
    selectClip: selectClip,
    seekPlayhead: seekPlayhead,
    cutClipAtPlayhead: cutClipAtPlayhead,
    setZoom: setZoom,
    getZoom: getZoom,
    pxPerSec: pxPerSec,
    BASE_PX_PER_SECOND: BASE_PX_PER_SECOND,
    ZOOM_LEVELS: ZOOM_LEVELS,
    // Phase 2-D-4: 素材拖放到时间轴
    addAssetWithPosition: addAssetWithPosition,
    handleExternalFileDropToTimeline: handleExternalFileDropToTimeline,
    detectFileType: detectFileType
  };

  window.YJ = YJ;
  console.log('[Enterprise/EditorTimeline] Phase 2-D-3 timeline interaction initialized');
})();
