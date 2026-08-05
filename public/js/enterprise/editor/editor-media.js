/**
 * YuJian Editor — Media Panel Component
 * Phase 2-D-2: 素材面板
 *
 * 读取：YJ.state.editor.mediaBin
 * 显示：视频、图片、音频、字幕分类
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  var state = YJ.state;

  var _activeTab = 'all';

  var TAB_CONFIG = [
    { key: 'all',      icon: 'fa-th-large', label: '全部' },
    { key: 'video',    icon: 'fa-video',    label: '视频' },
    { key: 'image',    icon: 'fa-image',    label: '图片' },
    { key: 'audio',    icon: 'fa-music',    label: '音频' },
    { key: 'other',    icon: 'fa-file',     label: '其他' }
  ];

  /**
   * 渲染素材面板 HTML
   * @returns {string}
   */
  function renderMedia() {
    var mb = state.editor.mediaBin;
    var items = mb.items || [];

    return ''
      + '<div class="yj-editor-media">'
      // Header
      + '<div class="yj-editor-media-header">'
      +   '素材库'
      +   '<span style="font-size:11px;color:#475569">' + items.length + '</span>'
      + '</div>'

      // Tabs
      + '<div class="yj-editor-media-tabs">'
      +   TAB_CONFIG.map(function (tab) {
          return '<button class="yj-editor-media-tab'
            + (_activeTab === tab.key ? ' yj-editor-media-tab--active' : '')
            + '" data-tab="' + tab.key + '">'
            + tab.label + '</button>';
        }).join('')
      + '</div>'

      // List
      + '<div class="yj-editor-media-list" id="yjEditorMediaList">'
      +   (items.length > 0 ? renderMediaItems(items) : renderEmpty())
      + '</div>'
      + '</div>';
  }

  /**
   * 渲染素材列表项
   * @param {Array} items
   * @returns {string}
   */
  function renderMediaItems(items) {
    var filtered = filterByTab(items, _activeTab);
    if (filtered.length === 0) return renderEmpty();

    return filtered.map(function (item) {
      var isSelected = (state.editor.mediaBin.selectedIds || []).indexOf(item.id) !== -1;
      var typeIcon = getTypeIcon(item.type);
      return ''
        + '<div class="yj-editor-media-item'
        + (isSelected ? ' yj-editor-media-item--selected' : '')
        + '" data-asset-id="' + escAttr(item.id) + '">'
        + '<div class="yj-editor-media-item-thumb">'
        +   (item.thumbnailUrl
            ? '<img src="' + escAttr(item.thumbnailUrl) + '" alt="" loading="lazy">'
            : '<i class="fas ' + typeIcon + '"></i>')
        + '</div>'
        + '<div class="yj-editor-media-item-info">'
        +   '<div class="yj-editor-media-item-name">' + escHtml(item.name) + '</div>'
        +   '<div class="yj-editor-media-item-meta">'
        +     (item.duration ? formatTime(item.duration) + ' · ' : '')
        +     formatSize(item.size)
        +   '</div>'
        + '</div>'
        + '<span class="yj-editor-media-item-type">' + escHtml(getTypeBadge(item.type)) + '</span>'
        + '</div>';
    }).join('');
  }

  function renderEmpty() {
    return ''
      + '<div class="yj-editor-media-empty">'
      + '<i class="fas fa-folder-open"></i>'
      + '<span>素材库为空</span>'
      + '<span style="font-size:11px;color:#475569;margin-top:4px">从资产管理中选择素材发送到编辑器</span>'
      + '</div>';
  }

  /** 按 tab 过滤 */
  function filterByTab(items, tab) {
    if (tab === 'all') return items;
    return items.filter(function (item) { return item.type === tab; });
  }

  /**
   * 绑定素材面板事件
   */
  function bindMediaEvents() {
    var list = document.getElementById('yjEditorMediaList');

    // Tab clicks
    var tabs = document.querySelectorAll('.yj-editor-media-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        _activeTab = this.getAttribute('data-tab');
        // Update active state
        tabs.forEach(function (t) { t.classList.remove('yj-editor-media-tab--active'); });
        this.classList.add('yj-editor-media-tab--active');
        // Re-render list
        refreshList();
      });
    });

    // Item click → select & add to timeline
    if (list) {
      list.addEventListener('click', function (e) {
        var itemEl = e.target.closest('.yj-editor-media-item');
        if (!itemEl) return;
        var assetId = itemEl.getAttribute('data-asset-id');
        selectMediaItem(assetId);
      });

      // Double-click → add to timeline
      list.addEventListener('dblclick', function (e) {
        var itemEl = e.target.closest('.yj-editor-media-item');
        if (!itemEl) return;
        var assetId = itemEl.getAttribute('data-asset-id');
        addMediaToTimeline(assetId);
      });
    }
  }

  /**
   * 选中素材
   * @param {string} assetId
   */
  function selectMediaItem(assetId) {
    var mb = state.editor.mediaBin;
    var selected = mb.selectedIds || [];
    var idx = selected.indexOf(assetId);
    if (idx !== -1) {
      selected.splice(idx, 1);
    } else {
      selected.push(assetId);
    }
    mb.selectedIds = selected;
    refreshList();
  }

  /**
   * 双击添加素材到时间轴
   * @param {string} assetId
   */
  function addMediaToTimeline(assetId) {
    var mb = state.editor.mediaBin;
    var asset = null;
    for (var i = 0; i < mb.items.length; i++) {
      if (mb.items[i].id === assetId) { asset = mb.items[i]; break; }
    }
    if (!asset) return;

    // Find matching track type
    var ed = state.editor;
    var tracks = ed.timeline.tracks || [];
    var targetType = asset.type === 'image' ? 'video' : (asset.type === 'audio' ? 'audio' : 'video');
    var targetTrack = null;

    for (var j = 0; j < tracks.length; j++) {
      if (tracks[j].type === targetType && !tracks[j].locked) {
        targetTrack = tracks[j];
        break;
      }
    }

    if (targetTrack) {
      var clip = YJ.Editor.addClipToTrack(targetTrack.id, asset);
      if (clip) {
        YJ.EditorApp.refresh();
        var showToast = (YJ.utils && YJ.utils.showToast) || window.showToast;
        if (typeof showToast === 'function') {
          showToast('已添加: ' + asset.name, 'success');
        }
      }
    } else {
      var showToast = (YJ.utils && YJ.utils.showToast) || window.showToast;
      if (typeof showToast === 'function') {
        showToast('没有可用的' + (targetType === 'video' ? '视频' : '音频') + '轨道', 'warning');
      }
    }
  }

  /** 刷新素材列表（局部更新） */
  function refreshList() {
    var list = document.getElementById('yjEditorMediaList');
    if (!list) return;
    var items = state.editor.mediaBin.items || [];
    list.innerHTML = items.length > 0 ? renderMediaItems(items) : renderEmpty();
  }

  /** 外部刷新 */
  function refresh() {
    _activeTab = 'all';
    var list = document.getElementById('yjEditorMediaList');
    if (!list) return;
    var items = state.editor.mediaBin.items || [];
    list.innerHTML = items.length > 0 ? renderMediaItems(items) : renderEmpty();

    // Update count
    var header = document.querySelector('.yj-editor-media-header span');
    if (header) header.textContent = items.length;

    // Reset tabs
    var tabs = document.querySelectorAll('.yj-editor-media-tab');
    tabs.forEach(function (t) { t.classList.remove('yj-editor-media-tab--active'); });
    var allTab = document.querySelector('.yj-editor-media-tab[data-tab="all"]');
    if (allTab) allTab.classList.add('yj-editor-media-tab--active');
  }

  // ─── Helpers ─────────────────────────────────────────────────

  function getTypeIcon(type) {
    var map = { video: 'fa-video', image: 'fa-image', audio: 'fa-music', other: 'fa-file' };
    return map[type] || 'fa-file';
  }

  function getTypeBadge(type) {
    var map = { video: 'MP4', image: 'IMG', audio: 'MP3', other: 'FILE' };
    return map[type] || 'FILE';
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds <= 0) return '';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / 1048576).toFixed(1) + 'MB';
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  function escAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Expose ─────────────────────────────────────────────────
  YJ.EditorMedia = {
    render: renderMedia,
    bindEvents: bindMediaEvents,
    refresh: refresh,
    refreshList: refreshList
  };

  window.YJ = YJ;
})();
