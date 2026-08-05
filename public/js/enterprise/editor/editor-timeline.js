/**
 * YuJian Editor — Timeline Component
 * Phase 2-D-2: 时间轴渲染
 *
 * 读取：YJ.state.editor.timeline
 * 显示：视频轨、音频轨、字幕轨、特效轨
 * 只渲染，不拖拽
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  var state = YJ.state;

  /** Pixels per second (affected by zoom) */
  var PX_PER_SECOND = 80;

  /** Track type display config */
  var TRACK_CONFIG = {
    video:    { icon: 'fa-video',   label: '视频',   cls: '--video' },
    audio:    { icon: 'fa-music',   label: '音频',   cls: '--audio' },
    subtitle: { icon: 'fa-font',    label: '字幕',   cls: '--subtitle' },
    effect:   { icon: 'fa-magic',   label: '特效',   cls: '--effect' }
  };

  /**
   * 渲染时间轴 HTML
   * @returns {string}
   */
  function renderTimeline() {
    var ed = state.editor;
    var tl = ed.timeline;
    var tracks = tl.tracks || [];
    var zoom = tl.zoom || 1;
    var pxPerSec = PX_PER_SECOND * zoom;

    return ''
      + '<div class="yj-editor-timeline">'
      // Header
      + '<div class="yj-editor-timeline-header">'
      +   '<span class="yj-editor-timeline-header-label">时间轴</span>'
      +   '<span class="yj-editor-timeline-header-actions">'
      +     '<span style="font-size:11px;color:#64748b;margin-right:4px">' + formatTime(tl.duration) + '</span>'
      +     '<button class="yj-editor-timeline-header-btn" id="yjEditorZoomOut" title="缩小"><i class="fas fa-search-minus"></i></button>'
      +     '<span style="font-size:11px;color:#64748b;min-width:32px;text-align:center">' + Math.round(zoom * 100) + '%</span>'
      +     '<button class="yj-editor-timeline-header-btn" id="yjEditorZoomIn" title="放大"><i class="fas fa-search-plus"></i></button>'
      +   '</span>'
      + '</div>'

      // Ruler
      + '<div class="yj-editor-timeline-ruler" id="yjEditorRuler" style="position:relative">'
      +   renderRulerMarks(tl.duration, pxPerSec)
      +   renderPlayhead(tl.playheadPosition, pxPerSec)
      + '</div>'

      // Track list
      + '<div class="yj-editor-timeline-tracks" id="yjEditorTracks">'
      +   (tracks.length > 0
          ? tracks.map(function (track) { return renderTrack(track, pxPerSec); }).join('')
          : '<div style="padding:20px;text-align:center;color:#475569;font-size:13px">暂无轨道，请创建项目</div>')
      + '</div>'
      + '</div>';
  }

  /**
   * 渲染单个轨道
   * @param {Object} track
   * @param {number} pxPerSec
   * @returns {string}
   */
  function renderTrack(track, pxPerSec) {
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
      +   clips.map(function (clip) { return renderClip(clip, pxPerSec); }).join('')
      + '</div>'
      + '</div>';
  }

  /**
   * 渲染单个 Clip
   * @param {Object} clip
   * @param {number} pxPerSec
   * @returns {string}
   */
  function renderClip(clip, pxPerSec) {
    var left = clip.position * pxPerSec;
    var width = Math.max(clip.duration * pxPerSec, 4);
    var isSelected = state.editor.ui.selectedClipId === clip.id;

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
   * @param {number} pxPerSec
   * @returns {string}
   */
  function renderRulerMarks(duration, pxPerSec) {
    if (duration <= 0) return '';
    var html = '';
    var interval = calcRulerInterval(pxPerSec); // seconds between marks
    var totalWidth = duration * pxPerSec;

    for (var t = 0; t <= duration; t += interval) {
      var x = t * pxPerSec;
      html += '<div class="yj-editor-timeline-ruler-tick" style="left:' + x + 'px"></div>';
      html += '<div class="yj-editor-timeline-ruler-mark" style="left:' + x + 'px">' + formatTimeShort(t) + '</div>';
    }
    return html;
  }

  /**
   * 计算合适的刻度间隔
   * @param {number} pxPerSec
   * @returns {number}
   */
  function calcRulerInterval(pxPerSec) {
    var minPxBetween = 50;
    var intervals = [0.5, 1, 2, 5, 10, 30, 60];
    for (var i = 0; i < intervals.length; i++) {
      if (intervals[i] * pxPerSec >= minPxBetween) return intervals[i];
    }
    return 60;
  }

  /**
   * 渲染播放头指示器
   * @param {number} position
   * @param {number} pxPerSec
   * @returns {string}
   */
  function renderPlayhead(position, pxPerSec) {
    var x = position * pxPerSec;
    return '<div class="yj-editor-timeline-playhead" style="left:' + x + 'px"></div>';
  }

  /**
   * 绑定时间轴事件
   */
  function bindTimelineEvents() {
    // Track clip click → select
    var tracksContainer = document.getElementById('yjEditorTracks');
    if (tracksContainer) {
      tracksContainer.addEventListener('click', function (e) {
        var clipEl = e.target.closest('.yj-editor-timeline-clip');
        if (clipEl) {
          var clipId = clipEl.getAttribute('data-clip-id');
          var trackId = clipEl.getAttribute('data-track-id');
          selectClip(clipId, trackId);
          return;
        }
      });
    }

    // Ruler click → seek
    var ruler = document.getElementById('yjEditorRuler');
    if (ruler) {
      ruler.addEventListener('click', function (e) {
        var rect = ruler.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var zoom = state.editor.timeline.zoom || 1;
        var pxPerSec = PX_PER_SECOND * zoom;
        var time = x / pxPerSec;
        if (YJ.EditorPlayer && YJ.EditorPlayer.seekTo) {
          YJ.EditorPlayer.seekTo(Math.max(0, time));
        }
        YJ.EditorApp.refreshTimeline();
      });
    }

    // Zoom buttons
    var zoomInBtn = document.getElementById('yjEditorZoomIn');
    var zoomOutBtn = document.getElementById('yjEditorZoomOut');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', function () {
        var newZoom = Math.min(4, (state.editor.timeline.zoom || 1) * 1.25);
        state.editor.timeline.zoom = newZoom;
        state.editor.ui.zoom = newZoom;
        YJ.EditorApp.refreshTimeline();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', function () {
        var newZoom = Math.max(0.25, (state.editor.timeline.zoom || 1) / 1.25);
        state.editor.timeline.zoom = newZoom;
        state.editor.ui.zoom = newZoom;
        YJ.EditorApp.refreshTimeline();
      });
    }
  }

  /**
   * 选中 Clip
   * @param {string} clipId
   * @param {string} trackId
   */
  function selectClip(clipId, trackId) {
    state.editor.ui.selectedClipId = clipId;
    state.editor.ui.selectedTrackId = trackId;
    YJ.EditorApp.refresh();
  }

  // ─── Helpers ─────────────────────────────────────────────────

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

  function truncateText(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
  }

  // ─── Expose ─────────────────────────────────────────────────
  YJ.EditorTimeline = {
    render: renderTimeline,
    bindEvents: bindTimelineEvents,
    selectClip: selectClip,
    PX_PER_SECOND: PX_PER_SECOND
  };

  window.YJ = YJ;
})();
