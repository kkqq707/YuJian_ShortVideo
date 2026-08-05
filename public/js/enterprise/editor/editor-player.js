/**
 * YuJian Editor — Player Component
 * Phase 2-D-2: HTML5 视频播放器
 *
 * 绑定：YJ.state.editor.preview
 * 功能：播放、暂停、时间显示、进度条
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  var state = YJ.state;

  var _videoEl = null;
  var _animationId = null;

  /**
   * 渲染播放器 HTML
   * @returns {string}
   */
  function renderPlayer() {
    var ed = state.editor;
    var preview = ed.preview;
    var hasSource = findPlayableClip() !== null;

    return ''
      + '<div class="yj-editor-player">'
      // Viewport
      + '<div class="yj-editor-player-viewport" id="yjEditorViewport">'
      +   (hasSource
          ? '<video id="yjEditorVideo" src="' + escAttr(findPlayableClip().sourceUrl) + '" preload="metadata"></video>'
          : '<div class="yj-editor-player-placeholder">'
          +   '<i class="fas fa-film"></i>'
          +   '<span>选择素材或添加片段到时间轴</span>'
          + '</div>')
      + '</div>'

      // Controls bar
      + '<div class="yj-editor-player-controls">'
      +   '<button class="yj-editor-player-btn yj-editor-player-btn--play" id="yjEditorPlayPauseBtn" title="播放/暂停">'
      +     '<i class="fas fa-' + (preview.isPlaying ? 'pause' : 'play') + '"></i>'
      +   '</button>'
      +   '<span class="yj-editor-player-time">'
      +     '<span class="yj-editor-player-time-current" id="yjEditorTimeCurrent">' + formatTime(preview.currentTime) + '</span>'
      +     ' / '
      +     '<span id="yjEditorTimeTotal">' + formatTime(ed.timeline.duration) + '</span>'
      +   '</span>'
      +   '<div class="yj-editor-player-progress" id="yjEditorProgress">'
      +     '<div class="yj-editor-player-progress-track">'
      +       '<div class="yj-editor-player-progress-fill" id="yjEditorProgressFill" style="width:' + progressPercent() + '%"></div>'
      +     '</div>'
      +   '</div>'
      +   '<button class="yj-editor-player-btn" id="yjEditorVolumeBtn" title="' + (preview.isMuted ? '取消静音' : '静音') + '">'
      +     '<i class="fas fa-volume-' + (preview.isMuted || preview.volume === 0 ? 'mute' : preview.volume < 0.5 ? 'down' : 'up') + '"></i>'
      +   '</button>'
      + '</div>'
      + '</div>';
  }

  /**
   * 在时间轴中寻找第一个可播放的视频 Clip
   * @returns {Object|null}
   */
  function findPlayableClip() {
    var ed = state.editor;
    var tracks = ed.timeline.tracks || [];
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].type === 'video') {
        var clips = tracks[i].clips || [];
        for (var j = 0; j < clips.length; j++) {
          if (clips[j].sourceUrl) return clips[j];
        }
      }
    }
    return null;
  }

  /**
   * 计算进度百分比
   * @returns {number}
   */
  function progressPercent() {
    var ed = state.editor;
    var dur = ed.timeline.duration || 1;
    return Math.min(100, (ed.preview.currentTime / dur) * 100);
  }

  /**
   * 格式化时间为 mm:ss.ms
   * @param {number} seconds
   * @returns {string}
   */
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    var ms = Math.floor((seconds % 1) * 10);
    return pad2(m) + ':' + pad2(s) + '.' + ms;
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /**
   * 绑定播放器事件
   */
  function bindPlayerEvents() {
    _videoEl = document.getElementById('yjEditorVideo');
    var playPauseBtn = document.getElementById('yjEditorPlayPauseBtn');
    var progressBar = document.getElementById('yjEditorProgress');
    var volumeBtn = document.getElementById('yjEditorVolumeBtn');

    // Play/Pause button
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', function () {
        togglePlay();
      });
    }

    // Click video viewport to toggle play
    var viewport = document.getElementById('yjEditorViewport');
    if (viewport) {
      viewport.addEventListener('click', function (e) {
        if (e.target === viewport || e.target.tagName === 'VIDEO') {
          togglePlay();
        }
      });
    }

    // Progress bar click to seek
    if (progressBar) {
      progressBar.addEventListener('click', function (e) {
        var rect = progressBar.getBoundingClientRect();
        var ratio = (e.clientX - rect.left) / rect.width;
        var ed = state.editor;
        var newTime = ratio * (ed.timeline.duration || 0);
        seekTo(newTime);
      });
    }

    // Volume toggle
    if (volumeBtn) {
      volumeBtn.addEventListener('click', function () {
        var preview = state.editor.preview;
        if (preview.isMuted) {
          YJ.Editor.setPreviewVolume(1);
        } else {
          YJ.Editor.setPreviewVolume(0);
        }
        YJ.EditorApp.refresh();
      });
    }

    // Video element events
    if (_videoEl) {
      _videoEl.addEventListener('timeupdate', function () {
        if (state.editor.preview.isPlaying) {
          YJ.Editor.setPreviewTime(_videoEl.currentTime);
          updateTimeDisplay();
          updateProgressFill();
        }
      });

      _videoEl.addEventListener('loadedmetadata', function () {
        updateTimeDisplay();
      });

      _videoEl.addEventListener('ended', function () {
        YJ.Editor.setPreviewPlaying(false);
        YJ.EditorApp.refresh();
      });
    }
  }

  /**
   * 切换播放/暂停
   */
  function togglePlay() {
    var preview = state.editor.preview;
    if (preview.isPlaying) {
      // Pause
      if (_videoEl) _videoEl.pause();
      YJ.Editor.setPreviewPlaying(false);
    } else {
      // Play
      if (_videoEl) {
        // Sync video time to playhead
        _videoEl.currentTime = preview.currentTime;
        _videoEl.play().catch(function () {
          // Autoplay blocked, ignore
        });
      }
      YJ.Editor.setPreviewPlaying(true);
    }
    updatePlayButton();
  }

  /**
   * 跳转到指定时间
   * @param {number} time
   */
  function seekTo(time) {
    YJ.Editor.setPreviewTime(time);
    if (_videoEl && _videoEl.readyState >= 1) {
      _videoEl.currentTime = time;
    }
    updateTimeDisplay();
    updateProgressFill();
    YJ.EditorApp.refreshTimeline();
  }

  /**
   * 更新播放按钮图标
   */
  function updatePlayButton() {
    var btn = document.getElementById('yjEditorPlayPauseBtn');
    if (!btn) return;
    var icon = btn.querySelector('i');
    if (!icon) return;
    if (state.editor.preview.isPlaying) {
      icon.className = 'fas fa-pause';
    } else {
      icon.className = 'fas fa-play';
    }
  }

  /**
   * 更新时间显示
   */
  function updateTimeDisplay() {
    var current = document.getElementById('yjEditorTimeCurrent');
    var total = document.getElementById('yjEditorTimeTotal');
    var preview = state.editor.preview;
    if (current) current.textContent = formatTime(preview.currentTime);
    if (total) total.textContent = formatTime(state.editor.timeline.duration);
  }

  /**
   * 更新进度条
   */
  function updateProgressFill() {
    var fill = document.getElementById('yjEditorProgressFill');
    if (fill) {
      fill.style.width = progressPercent() + '%';
    }
  }

  /**
   * 外部触发刷新（从 YJ.EditorApp.refresh）
   */
  function refresh() {
    updatePlayButton();
    updateTimeDisplay();
    updateProgressFill();
  }

  // ─── Expose ─────────────────────────────────────────────────
  YJ.EditorPlayer = {
    render: renderPlayer,
    bindEvents: bindPlayerEvents,
    refresh: refresh,
    togglePlay: togglePlay,
    seekTo: seekTo,
    findPlayableClip: findPlayableClip
  };

  window.YJ = YJ;

  function escAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
