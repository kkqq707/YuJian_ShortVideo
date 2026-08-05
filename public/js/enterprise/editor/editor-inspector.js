/**
 * YuJian Editor — Inspector Component
 * Phase 2-D-2: 参数面板（右侧）
 *
 * 显示选中 Clip 或 Project 的属性
 * 读取：YJ.state.editor.ui.selectedClipId
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  var state = YJ.state;

  /**
   * 渲染参数面板 HTML
   * @returns {string}
   */
  function renderInspector() {
    var ed = state.editor;
    var selectedClip = findSelectedClip();

    return ''
      + '<div class="yj-editor-inspector">'
      + '<div class="yj-editor-inspector-header">属性面板</div>'
      + '<div class="yj-editor-inspector-body" id="yjEditorInspectorBody">'
      +   (selectedClip ? renderClipInspector(selectedClip) : renderProjectInspector())
      + '</div>'
      + '</div>';
  }

  /**
   * 找到当前选中的 Clip
   * @returns {Object|null}
   */
  function findSelectedClip() {
    var clipId = state.editor.ui.selectedClipId;
    if (!clipId) return null;
    var tracks = state.editor.timeline.tracks || [];
    for (var i = 0; i < tracks.length; i++) {
      var clips = tracks[i].clips || [];
      for (var j = 0; j < clips.length; j++) {
        if (clips[j].id === clipId) return clips[j];
      }
    }
    return null;
  }

  /**
   * 渲染 Clip 属性面板
   * @param {Object} clip
   * @returns {string}
   */
  function renderClipInspector(clip) {
    var props = clip.properties || {};

    var html = '';

    // Basic info
    html += renderGroup('基本信息', [
      { label: '名称', value: escHtml(clip.name) },
      { label: '类型', value: typeLabel(clip.type) },
      { label: '时长', value: formatTime(clip.duration) },
      { label: '起始位置', value: formatTime(clip.position) }
    ]);

    // Source info
    if (clip.sourceUrl) {
      html += renderGroup('源素材', [
        { label: '裁剪起点', value: formatTime(clip.startTime) },
        { label: '裁剪终点', value: formatTime(clip.endTime) }
      ]);
    }

    // Transform properties (video tracks only)
    if (clip.type === 'video' || clip.type === 'image') {
      html += renderGroup('变换', [
        { label: '缩放', value: Math.round(props.scale * 100) + '%', isRange: true, key: 'scale', min: 10, max: 300, step: 1 },
        { label: '不透明度', value: Math.round(props.opacity * 100) + '%', isRange: true, key: 'opacity', min: 0, max: 100, step: 1 },
        { label: '音量', value: Math.round(props.volume * 100) + '%', isRange: true, key: 'volume', min: 0, max: 200, step: 1 },
        { label: '速度', value: props.speed + 'x', isRange: true, key: 'speed', min: 25, max: 400, step: 5 }
      ]);
    }

    // Audio properties
    if (clip.type === 'audio') {
      html += renderGroup('音频', [
        { label: '音量', value: Math.round(props.volume * 100) + '%', isRange: true, key: 'volume', min: 0, max: 200, step: 1 },
        { label: '速度', value: props.speed + 'x', isRange: true, key: 'speed', min: 25, max: 400, step: 5 }
      ]);
    }

    // Subtitle properties
    if (clip.type === 'subtitle') {
      html += renderGroup('字幕内容', [
        { label: '文本', value: escHtml(props.text || '(空)', true) },
        { label: '字号', value: props.fontSize + 'px' },
        { label: '颜色', value: '<span style="display:inline-block;width:14px;height:14px;border-radius:2px;background:' + escAttr(props.fontColor) + ';vertical-align:middle"></span> ' + (props.fontColor || '#ffffff') },
        { label: '字体', value: props.fontFamily }
      ]);
    }

    // Effect properties
    if (clip.type === 'effect') {
      html += renderGroup('特效', [
        { label: '特效类型', value: escHtml(props.effectType || '(未设置)') }
      ]);
    }

    return html;
  }

  /**
   * 渲染项目属性面板
   * @returns {string}
   */
  function renderProjectInspector() {
    var proj = state.editor.project;
    var html = '';
    html += renderGroup('项目信息', [
      { label: '名称', value: escHtml(proj.name) },
      { label: '分辨率', value: proj.resolution.width + ' × ' + proj.resolution.height },
      { label: '帧率', value: proj.fps + ' fps' },
      { label: '总时长', value: formatTime(state.editor.timeline.duration) }
    ]);

    html += renderGroup('轨道统计', renderTrackStats());

    html += renderGroup('历史状态', [
      { label: '可撤销', value: state.editor.history.past.length + ' 步' },
      { label: '可重做', value: state.editor.history.future.length + ' 步' }
    ]);

    html += ''
      + '<div class="yj-editor-inspector-empty" style="padding:16px;margin-top:8px">'
      + '<i class="fas fa-hand-pointer"></i>'
      + '<span>点击时间轴上的片段查看属性</span>'
      + '</div>';

    return html;
  }

  /** 统计各轨道 Clip 数量 */
  function renderTrackStats() {
    var tracks = state.editor.timeline.tracks || [];
    return tracks.map(function (t) {
      return { label: t.name, value: (t.clips || []).length + ' 个片段' };
    });
  }

  /**
   * 渲染属性分组
   * @param {string} title
   * @param {Array} fields - [{label, value, isRange, key, min, max, step}]
   * @returns {string}
   */
  function renderGroup(title, fields) {
    var html = '<div class="yj-editor-inspector-group">';
    html += '<div class="yj-editor-inspector-group-title">' + escHtml(title) + '</div>';

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.isRange) {
        // Slider input
        var rawVal = getRangeRawValue(f);
        html += '<div class="yj-editor-inspector-field">'
          + '<span class="yj-editor-inspector-label">' + escHtml(f.label) + '</span>'
          + '<span class="yj-editor-inspector-value" style="min-width:40px">' + f.value + '</span>'
          + '</div>'
          + '<div class="yj-editor-inspector-field">'
          + '<input class="yj-editor-inspector-input" type="range"'
          + ' data-prop-key="' + escAttr(f.key) + '"'
          + ' min="' + (f.min || 0) + '" max="' + (f.max || 100) + '" step="' + (f.step || 1) + '"'
          + ' value="' + rawVal + '">'
          + '</div>';
      } else {
        html += '<div class="yj-editor-inspector-field">'
          + '<span class="yj-editor-inspector-label">' + escHtml(f.label) + '</span>'
          + '<span class="yj-editor-inspector-value">' + f.value + '</span>'
          + '</div>';
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * 获取 range 输入的原始值
   * For special keys like speed (stored as 1, but range uses 25-400 for 0.25x-4x)
   */
  function getRangeRawValue(field) {
    if (field.key === 'speed') {
      // speed stored as 1, range goes 25-400 (0.25x - 4x)
      var clip = findSelectedClip();
      if (clip && clip.properties) {
        return Math.round(clip.properties.speed * 100);
      }
      return 100;
    }
    if (field.key === 'volume' || field.key === 'opacity') {
      var c = findSelectedClip();
      if (c && c.properties) {
        return Math.round(c.properties[field.key] * 100);
      }
      return 100;
    }
    if (field.key === 'scale') {
      var cl = findSelectedClip();
      if (cl && cl.properties) {
        return Math.round(cl.properties.scale * 100);
      }
      return 100;
    }
    return 50;
  }

  /**
   * 绑定 Inspector 事件（slider 变化）
   */
  function bindInspectorEvents() {
    var body = document.getElementById('yjEditorInspectorBody');
    if (!body) return;

    body.addEventListener('input', function (e) {
      var slider = e.target.closest('.yj-editor-inspector-input[type="range"]');
      if (!slider) return;

      var propKey = slider.getAttribute('data-prop-key');
      if (!propKey) return;

      var selectedClip = findSelectedClip();
      if (!selectedClip) return;

      var rawValue = parseFloat(slider.value);
      var actualValue = rawValue;

      // Convert range values back to stored values
      if (propKey === 'speed') actualValue = rawValue / 100;
      if (propKey === 'volume' || propKey === 'opacity') actualValue = rawValue / 100;
      if (propKey === 'scale') actualValue = rawValue / 100;

      // Update clip property
      var trackId = selectedClip.trackId;
      var clipId = selectedClip.id;

      var updates = { properties: {} };
      updates.properties[propKey] = actualValue;

      YJ.Editor.updateClip(trackId, clipId, updates);
      YJ.EditorApp.refresh();
    });
  }

  /** 外部刷新 */
  function refresh() {
    var body = document.getElementById('yjEditorInspectorBody');
    if (!body) return;
    var selectedClip = findSelectedClip();
    body.innerHTML = selectedClip ? renderClipInspector(selectedClip) : renderProjectInspector();
  }

  // ─── Helpers ─────────────────────────────────────────────────

  function typeLabel(type) {
    var map = { video: '视频', audio: '音频', subtitle: '字幕', effect: '特效' };
    return map[type] || type;
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    var ms = Math.floor((seconds % 1) * 10);
    return pad2(m) + ':' + pad2(s) + '.' + ms;
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function escHtml(str, isLong) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  function escAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Expose ─────────────────────────────────────────────────
  YJ.EditorInspector = {
    render: renderInspector,
    bindEvents: bindInspectorEvents,
    refresh: refresh,
    findSelectedClip: findSelectedClip
  };

  window.YJ = YJ;
})();
