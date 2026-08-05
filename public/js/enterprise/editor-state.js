/**
 * YuJian Enterprise — Editor State Management
 *
 * Phase 2-D-1-B: 视频剪辑器数据基础
 *
 * 提供：
 *   - Clip / Track / Timeline 数据模型
 *   - Undo / Redo 历史管理
 *   - MediaBin 素材库管理
 *   - Studio → Editor 数据桥接 (openEditorWithAsset)
 *   - 预览与导出状态管理
 *
 * 使用方式：
 *   YJ.Editor.createProject(params)
 *   YJ.Editor.addClipToTrack(trackId, clipData)
 *   YJ.Editor.pushHistory()
 *   YJ.Editor.undo()
 *   YJ.Editor.redo()
 *   YJ.Editor.openEditorWithAsset(asset)
 *
 * 依赖：state.js（需先加载）
 */

(function () {
  'use strict';

  var state = (window.YJ && window.YJ.state) || {};
  var utils = (window.YJ && window.YJ.utils) || {};
  var showToast = utils.showToast || window.showToast;

  // ═══════════════════════════════════════════════════════════════
  // 1. Data Model Factories
  // ═══════════════════════════════════════════════════════════════

  /** Unique ID generator for editor entities */
  var _idCounter = 0;
  function uid(prefix) {
    _idCounter++;
    return (prefix || 'e') + '_' + Date.now().toString(36) + '_' + _idCounter;
  }

  /**
   * Clip Data Model
   *
   * 支持的轨道类型：
   *   - video    : 视频片段
   *   - audio    : 音频片段
   *   - subtitle : 字幕片段
   *   - effect   : 特效片段（转场、滤镜等）
   */
  var CLIP = {
    /**
     * 创建标准 Clip 对象
     * @param {Object} opts
     * @param {string} opts.type          - 'video' | 'audio' | 'subtitle' | 'effect'
     * @param {string} opts.name          - 片段名称
     * @param {string} [opts.sourceAssetId] - 关联素材 ID
     * @param {string} [opts.sourceUrl]   - 素材 URL
     * @param {number} [opts.duration]    - 时长（秒）
     * @param {number} [opts.startTime]   - 源素材起始裁剪点（秒）
     * @param {number} [opts.endTime]     - 源素材结束裁剪点（秒）
     * @param {number} [opts.position]    - 时间轴上的位置（秒）
     * @param {string} [opts.trackId]     - 所属轨道 ID
     * @returns {Object} Clip
     */
    create: function (opts) {
      opts = opts || {};
      var now = new Date().toISOString();
      return {
        id: uid('clip'),
        type: opts.type || 'video',
        name: opts.name || '未命名片段',
        sourceAssetId: opts.sourceAssetId || null,
        sourceUrl: opts.sourceUrl || '',
        duration: opts.duration || 0,
        startTime: opts.startTime || 0,
        endTime: opts.endTime || (opts.duration || 0),
        trackId: opts.trackId || null,
        position: opts.position || 0,
        properties: {
          // 通用
          volume: (opts.properties && opts.properties.volume !== undefined) ? opts.properties.volume : 1,
          speed: (opts.properties && opts.properties.speed) || 1,
          opacity: (opts.properties && opts.properties.opacity !== undefined) ? opts.properties.opacity : 1,
          scale: (opts.properties && opts.properties.scale) || 1,
          posX: (opts.properties && opts.properties.posX) || 0,
          posY: (opts.properties && opts.properties.posY) || 0,
          rotation: (opts.properties && opts.properties.rotation) || 0,
          // 字幕专属
          text: (opts.properties && opts.properties.text) || '',
          fontSize: (opts.properties && opts.properties.fontSize) || 24,
          fontColor: (opts.properties && opts.properties.fontColor) || '#ffffff',
          fontFamily: (opts.properties && opts.properties.fontFamily) || 'sans-serif',
          // 特效专属
          effectType: (opts.properties && opts.properties.effectType) || '',
          effectParams: (opts.properties && opts.properties.effectParams) || {}
        },
        createdAt: now,
        updatedAt: now
      };
    },

    /**
     * 从素材创建 Clip
     * @param {Object} asset  - 素材对象（来自 assets 列表）
     * @param {Object} [opts] - 覆盖选项
     * @returns {Object} Clip
     */
    fromAsset: function (asset, opts) {
      opts = opts || {};
      var type = asset.type || 'video';
      // Map asset types to track types
      var trackTypeMap = { video: 'video', image: 'video', audio: 'audio', other: 'video' };
      return CLIP.create({
        type: trackTypeMap[type] || 'video',
        name: asset.name || asset.filename || asset.originalname || '素材片段',
        sourceAssetId: asset.id || null,
        sourceUrl: asset.url || asset.fileUrl || '',
        duration: asset.duration || opts.duration || 5,
        position: opts.position || 0,
        trackId: opts.trackId || null,
        properties: opts.properties || {}
      });
    },

    /**
     * 创建字幕 Clip
     * @param {string} text      - 字幕文本
     * @param {number} startTime - 字幕开始时间（秒）
     * @param {number} duration  - 字幕持续时间（秒）
     * @returns {Object} Clip
     */
    createSubtitle: function (text, startTime, duration) {
      return CLIP.create({
        type: 'subtitle',
        name: '字幕: ' + (text || '').substring(0, 20),
        position: startTime || 0,
        duration: duration || 3,
        properties: {
          text: text || '',
          fontSize: 24,
          fontColor: '#ffffff',
          fontFamily: 'sans-serif'
        }
      });
    },

    /**
     * 创建特效 Clip
     * @param {string} effectType - 特效类型
     * @param {number} startTime  - 起始时间
     * @param {number} duration   - 持续时长
     * @returns {Object} Clip
     */
    createEffect: function (effectType, startTime, duration) {
      return CLIP.create({
        type: 'effect',
        name: '特效: ' + (effectType || ''),
        position: startTime || 0,
        duration: duration || 1,
        properties: {
          effectType: effectType || '',
          effectParams: {}
        }
      });
    },

    /**
     * 深拷贝 Clip（用于历史快照）
     * @param {Object} clip
     * @returns {Object}
     */
    clone: function (clip) {
      return JSON.parse(JSON.stringify(clip));
    },

    /**
     * 更新 Clip 属性（返回新对象）
     * @param {Object} clip
     * @param {Object} updates
     * @returns {Object}
     */
    update: function (clip, updates) {
      var c = CLIP.clone(clip);
      var keys = Object.keys(updates);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === 'properties') {
          c.properties = Object.assign(c.properties, updates.properties);
        } else {
          c[k] = updates[k];
        }
      }
      c.updatedAt = new Date().toISOString();
      return c;
    }
  };

  /**
   * Track Data Model
   *
   * 轨道类型：
   *   - video    : 主视频轨道
   *   - audio    : 音频轨道
   *   - subtitle : 字幕轨道
   *   - effect   : 特效轨道
   */
  var TRACK = {
    TYPES: ['video', 'audio', 'subtitle', 'effect'],

    /**
     * 创建轨道
     * @param {Object} opts
     * @param {string} opts.type     - 'video' | 'audio' | 'subtitle' | 'effect'
     * @param {string} [opts.name]   - 轨道名称
     * @param {number} [opts.index]  - 轨道排序索引
     * @param {number} [opts.height] - 轨道高度（px）
     * @returns {Object} Track
     */
    create: function (opts) {
      opts = opts || {};
      return {
        id: uid('track'),
        type: opts.type || 'video',
        name: opts.name || TRACK._defaultName(opts.type),
        index: opts.index !== undefined ? opts.index : 0,
        locked: opts.locked || false,
        visible: opts.visible !== undefined ? opts.visible : true,
        muted: opts.muted || false,
        clips: opts.clips || [],
        height: opts.height || 80,
        createdAt: new Date().toISOString()
      };
    },

    _defaultName: function (type) {
      var names = { video: '视频轨道', audio: '音频轨道', subtitle: '字幕轨道', effect: '特效轨道' };
      return names[type] || '轨道';
    },

    /** 在轨道中添加 Clip（按 position 排序） */
    addClip: function (track, clip) {
      var t = JSON.parse(JSON.stringify(track));
      clip.trackId = t.id;
      t.clips.push(clip);
      t.clips.sort(function (a, b) { return a.position - b.position; });
      return t;
    },

    /** 从轨道中移除 Clip */
    removeClip: function (track, clipId) {
      var t = JSON.parse(JSON.stringify(track));
      t.clips = t.clips.filter(function (c) { return c.id !== clipId; });
      return t;
    },

    /** 更新轨道中的 Clip */
    updateClip: function (track, clipId, updates) {
      var t = JSON.parse(JSON.stringify(track));
      for (var i = 0; i < t.clips.length; i++) {
        if (t.clips[i].id === clipId) {
          t.clips[i] = CLIP.update(t.clips[i], updates);
          break;
        }
      }
      return t;
    },

    /** 深拷贝轨道 */
    clone: function (track) {
      return JSON.parse(JSON.stringify(track));
    }
  };

  /**
   * Timeline Data Model
   */
  var TIMELINE = {
    /**
     * 创建时间轴
     * @param {Object} opts
     * @returns {Object} Timeline
     */
    create: function (opts) {
      opts = opts || {};
      return {
        duration: opts.duration || 0,
        fps: opts.fps || 30,
        resolution: opts.resolution || { width: 1920, height: 1080 },
        tracks: opts.tracks || [],
        playheadPosition: 0,
        zoom: 1,
        scrollLeft: 0
      };
    },

    /** 添加轨道到时间轴 */
    addTrack: function (timeline, track) {
      var tl = JSON.parse(JSON.stringify(timeline));
      tl.tracks.push(track);
      // 按类型分组排序：video → audio → subtitle → effect
      var typeOrder = { video: 0, audio: 1, subtitle: 2, effect: 3 };
      tl.tracks.sort(function (a, b) {
        return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0) || a.index - b.index;
      });
      tl.duration = TIMELINE.calculateDuration(tl);
      return tl;
    },

    /** 移除轨道 */
    removeTrack: function (timeline, trackId) {
      var tl = JSON.parse(JSON.stringify(timeline));
      tl.tracks = tl.tracks.filter(function (t) { return t.id !== trackId; });
      tl.duration = TIMELINE.calculateDuration(tl);
      return tl;
    },

    /** 计算时间轴总时长（基于所有 Clip 的最大结束位置） */
    calculateDuration: function (timeline) {
      var maxEnd = 0;
      var tracks = timeline.tracks || [];
      for (var i = 0; i < tracks.length; i++) {
        var clips = tracks[i].clips || [];
        for (var j = 0; j < clips.length; j++) {
          var end = clips[j].position + clips[j].duration;
          if (end > maxEnd) maxEnd = end;
        }
      }
      return maxEnd;
    },

    /** 设置播放头位置 */
    setPlayhead: function (timeline, time) {
      var tl = JSON.parse(JSON.stringify(timeline));
      tl.playheadPosition = Math.max(0, Math.min(time, tl.duration || Infinity));
      return tl;
    },

    /** 深拷贝 */
    clone: function (timeline) {
      return JSON.parse(JSON.stringify(timeline));
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // 2. Undo / Redo (History Stack)
  // ═══════════════════════════════════════════════════════════════

  /**
   * 将当前编辑器状态推入历史栈
   *
   * 快照范围：
   *   - project (浅层)
   *   - timeline (完整 track + clip 快照)
   *
   * 不在快照范围（实时/UI 状态）：
   *   - preview (播放状态)
   *   - ui (选中、缩放等)
   *   - export (导出进度)
   *   - mediaBin (素材缓存，通过 sourceAssetId 引用)
   */
  function pushHistory() {
    var ed = state.editor;
    var hist = ed.history;

    // 序列化当前状态
    var snapshot = {
      project: JSON.parse(JSON.stringify(ed.project)),
      timeline: JSON.parse(JSON.stringify(ed.timeline))
    };

    // 推入 past 栈
    hist.past.push(snapshot);

    // 裁剪超出 maxSteps 的历史
    if (hist.past.length > hist.maxSteps) {
      hist.past.shift();
    }

    // 新操作后清空 future（redo 路径失效）
    hist.future = [];

    if (typeof showToast === 'function') {
      // Silent push — not user-facing
    }
  }

  /**
   * 撤销：回到上一个状态
   * @returns {boolean} 是否成功
   */
  function undo() {
    var ed = state.editor;
    var hist = ed.history;

    if (hist.past.length === 0) {
      if (typeof showToast === 'function') showToast('没有可撤销的操作', 'info');
      return false;
    }

    // 当前状态推入 future（用于 redo）
    var currentSnapshot = {
      project: JSON.parse(JSON.stringify(ed.project)),
      timeline: JSON.parse(JSON.stringify(ed.timeline))
    };
    hist.future.push(currentSnapshot);

    // 从 past 弹出上一个状态
    var prevSnapshot = hist.past.pop();

    // 恢复状态
    ed.project = prevSnapshot.project;
    ed.timeline = prevSnapshot.timeline;

    console.log('[Editor/Undo] 已撤销到:', hist.past.length, '步前');
    return true;
  }

  /**
   * 重做：恢复到撤销前的状态
   * @returns {boolean} 是否成功
   */
  function redo() {
    var ed = state.editor;
    var hist = ed.history;

    if (hist.future.length === 0) {
      if (typeof showToast === 'function') showToast('没有可恢复的操作', 'info');
      return false;
    }

    // 当前状态推入 past
    var currentSnapshot = {
      project: JSON.parse(JSON.stringify(ed.project)),
      timeline: JSON.parse(JSON.stringify(ed.timeline))
    };
    hist.past.push(currentSnapshot);

    // 从 future 弹出
    var nextSnapshot = hist.future.pop();

    // 恢复状态
    ed.project = nextSnapshot.project;
    ed.timeline = nextSnapshot.timeline;

    console.log('[Editor/Redo] 已重做到:', hist.future.length, '步剩余');
    return true;
  }

  /** 清空所有历史 */
  function clearHistory() {
    state.editor.history.past = [];
    state.editor.history.future = [];
  }

  /** 获取历史状态 */
  function getHistoryState() {
    var hist = state.editor.history;
    return {
      canUndo: hist.past.length > 0,
      canRedo: hist.future.length > 0,
      pastSteps: hist.past.length,
      futureSteps: hist.future.length
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. Editor API
  // ═══════════════════════════════════════════════════════════════

  /**
   * 初始化/创建编辑器项目
   * @param {Object} opts
   * @param {string} [opts.name]       - 项目名称
   * @param {Object} [opts.resolution]  - 分辨率 { width, height }
   * @param {number} [opts.fps]        - 帧率
   */

  function createProject(opts) {
    opts = opts || {};
    var now = new Date().toISOString();
    var ed = state.editor;

    ed.project.id = uid('proj');
    ed.project.name = opts.name || '未命名项目';
    ed.project.createdAt = now;
    ed.project.updatedAt = now;
    ed.project.duration = 0;
    ed.project.resolution = opts.resolution || { width: 1920, height: 1080 };
    ed.project.fps = opts.fps || 30;

    // 初始化默认轨道
    ed.timeline = TIMELINE.create({
      fps: ed.project.fps,
      resolution: ed.project.resolution,
      tracks: [
        TRACK.create({ type: 'video', name: '视频轨道 1', index: 0, height: 90 }),
        TRACK.create({ type: 'audio', name: '音频轨道 1', index: 0, height: 60 }),
        TRACK.create({ type: 'subtitle', name: '字幕轨道 1', index: 0, height: 50 }),
        TRACK.create({ type: 'effect', name: '特效轨道 1', index: 0, height: 40 })
      ]
    });

    // 清空历史
    clearHistory();

    // 推入初始快照
    pushHistory();

    console.log('[Editor] 项目已创建:', ed.project.name, ed.project.resolution);
    return ed.project;
  }

  /**
   * 向指定轨道添加 Clip
   * @param {string} trackId   - 轨道 ID
   * @param {Object} clipData  - Clip 创建参数或已创建的 Clip
   * @returns {Object|null}    添加的 Clip，失败返回 null
   */
  function addClipToTrack(trackId, clipData) {
    var ed = state.editor;
    var tracks = ed.timeline.tracks;

    // 如果是素材对象，先转换为 Clip
    var clip;
    if (clipData.id && clipData.type) {
      // 已经是 Clip 对象
      clip = CLIP.clone(clipData);
    } else if (clipData.url || clipData.fileUrl || clipData.sourceAssetId) {
      // 是素材对象
      clip = CLIP.fromAsset(clipData, { trackId: trackId });
    } else {
      // 是参数对象
      clip = CLIP.create(Object.assign({}, clipData, { trackId: trackId }));
    }

    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].id === trackId) {
        var oldTrack = tracks[i];
        pushHistory(); // 添加前记录快照
        tracks[i] = TRACK.addClip(oldTrack, clip);
        ed.timeline.duration = TIMELINE.calculateDuration(ed.timeline);
        ed.project.updatedAt = new Date().toISOString();
        console.log('[Editor] Clip 已添加:', clip.name, '→ 轨道:', tracks[i].name);
        return clip;
      }
    }

    console.warn('[Editor] 轨道未找到:', trackId);
    return null;
  }

  /**
   * 从轨道中移除 Clip
   * @param {string} trackId - 轨道 ID
   * @param {string} clipId  - Clip ID
   * @returns {boolean}
   */
  function removeClipFromTrack(trackId, clipId) {
    var ed = state.editor;
    var tracks = ed.timeline.tracks;

    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].id === trackId) {
        pushHistory();
        tracks[i] = TRACK.removeClip(tracks[i], clipId);
        ed.timeline.duration = TIMELINE.calculateDuration(ed.timeline);
        ed.project.updatedAt = new Date().toISOString();
        return true;
      }
    }
    return false;
  }

  /**
   * 更新 Clip 属性
   * @param {string} trackId - 轨道 ID
   * @param {string} clipId  - Clip ID
   * @param {Object} updates - 要更新的属性
   * @returns {boolean}
   */
  function updateClip(trackId, clipId, updates) {
    var ed = state.editor;
    var tracks = ed.timeline.tracks;

    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].id === trackId) {
        pushHistory();
        tracks[i] = TRACK.updateClip(tracks[i], clipId, updates);
        ed.timeline.duration = TIMELINE.calculateDuration(ed.timeline);
        ed.project.updatedAt = new Date().toISOString();
        return true;
      }
    }
    return false;
  }

  /**
   * 向时间轴添加新轨道
   * @param {Object} trackOpts - 轨道参数
   * @returns {Object} 创建的 Track
   */
  function addTrack(trackOpts) {
    var ed = state.editor;
    pushHistory();
    var track = TRACK.create(trackOpts);
    ed.timeline = TIMELINE.addTrack(ed.timeline, track);
    ed.project.updatedAt = new Date().toISOString();
    return track;
  }

  /**
   * 移除轨道
   * @param {string} trackId
   * @returns {boolean}
   */
  function removeTrack(trackId) {
    var ed = state.editor;
    pushHistory();
    ed.timeline = TIMELINE.removeTrack(ed.timeline, trackId);
    ed.project.updatedAt = new Date().toISOString();
    return true;
  }

  // ── MediaBin 操作 ──────────────────────────────────────────

  /**
   * 向 MediaBin 添加素材
   * @param {Object|Array} assets - 单个素材或素材数组
   */
  function addToMediaBin(assets) {
    if (!Array.isArray(assets)) assets = [assets];
    var ed = state.editor;
    for (var i = 0; i < assets.length; i++) {
      var asset = assets[i];
      // 避免重复
      var exists = ed.mediaBin.items.some(function (item) {
        return item.id === asset.id;
      });
      if (!exists) {
        ed.mediaBin.items.push({
          id: asset.id,
          name: asset.name || asset.filename || '素材',
          type: asset.type || 'video',
          url: asset.url || asset.fileUrl || '',
          thumbnailUrl: asset.thumbnailUrl || '',
          duration: asset.duration || 0,
          size: asset.size || 0,
          addedAt: new Date().toISOString()
        });
      }
    }
  }

  /** 从 MediaBin 移除素材 */
  function removeFromMediaBin(assetId) {
    var ed = state.editor;
    ed.mediaBin.items = ed.mediaBin.items.filter(function (item) {
      return item.id !== assetId;
    });
  }

  // ── Preview 状态 ───────────────────────────────────────────

  function setPreviewPlaying(isPlaying) {
    state.editor.preview.isPlaying = !!isPlaying;
    state.editor.ui.isPlaying = !!isPlaying;
  }

  function setPreviewTime(time) {
    state.editor.preview.currentTime = Math.max(0, time);
    state.editor.timeline.playheadPosition = state.editor.preview.currentTime;
  }

  function setPreviewVolume(volume) {
    state.editor.preview.volume = Math.max(0, Math.min(1, volume));
    state.editor.preview.isMuted = (state.editor.preview.volume === 0);
  }

  // ── Export 状态 ────────────────────────────────────────────

  function setExportStatus(status, progress) {
    state.editor.export.status = status || 'idle';
    if (progress !== undefined) state.editor.export.progress = progress;
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. Studio → Editor Bridge (openEditorWithAsset)
  // ═══════════════════════════════════════════════════════════════

  /**
   * 从 Studio 打开编辑器并加载素材
   *
   * 流程：
   *   1. 重置编辑器状态（新建项目）
   *   2. 将素材添加到 MediaBin
   *   3. 根据素材类型创建对应的 Clip 并添加到默认轨道
   *   4. 导航到编辑器页面
   *
   * @param {Object} asset  - 素材对象（必须包含 id, type, url/thumbnailUrl）
   * @param {Object} [opts] - 选项
   * @param {boolean} [opts.replaceExisting] - 是否替换现有项目（默认 true）
   */
  function openEditorWithAsset(asset, opts) {
    opts = opts || {};
    if (!asset || !asset.id) {
      console.warn('[Editor/Bridge] 无效的素材对象');
      if (typeof showToast === 'function') showToast('无法打开编辑器：素材数据无效', 'error');
      return;
    }

    // 1. 重置编辑器状态
    if (opts.replaceExisting !== false) {
      if (typeof state.resetEditorState === 'function') {
        state.resetEditorState();
      }
    }

    // 2. 创建项目
    createProject({
      name: (asset.name || asset.filename || '素材') + ' 剪辑项目',
      fps: 30
    });

    // 3. 添加素材到 MediaBin
    addToMediaBin(asset);

    // 4. 根据素材类型创建 Clip
    var mainTrack = state.editor.timeline.tracks[0]; // 第一个视频轨道
    if (mainTrack && mainTrack.type === 'video') {
      var clip = CLIP.fromAsset(asset, {
        trackId: mainTrack.id,
        position: 0,
        duration: asset.duration || 5
      });

      // 直接操作 timeline（不走 addClipToTrack 以避免重复 pushHistory）
      mainTrack.clips.push(clip);
      mainTrack.clips.sort(function (a, b) { return a.position - b.position; });
      state.editor.timeline.duration = TIMELINE.calculateDuration(state.editor.timeline);
      state.editor.project.updatedAt = new Date().toISOString();
      state.editor.ui.selectedClipId = clip.id;

      console.log('[Editor/Bridge] 素材已加载到编辑器:', asset.name, '→ Clip:', clip.id);
    }

    // 5. 重建初始历史快照
    clearHistory();
    pushHistory();

    // 6. 导航到编辑器
    var navigateTo = (window.YJ && window.YJ.app && window.YJ.app.navigateTo) || window.navigateTo;
    if (typeof navigateTo === 'function') {
      navigateTo('editor');
    }

    if (typeof showToast === 'function') {
      showToast('素材已加载到编辑器', 'success');
    }
  }

  /**
   * 从任意页面跳转到编辑器（不加载素材）
   * 保留当前编辑器状态
   */
  function openEditor() {
    var navigateTo = (window.YJ && window.YJ.app && window.YJ.app.navigateTo) || window.navigateTo;
    if (typeof navigateTo === 'function') {
      navigateTo('editor');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. Expose to Global
  // ═══════════════════════════════════════════════════════════════

  var YJ = window.YJ || {};

  YJ.Editor = {
    // Data Models
    CLIP: CLIP,
    TRACK: TRACK,
    TIMELINE: TIMELINE,

    // History
    pushHistory: pushHistory,
    undo: undo,
    redo: redo,
    clearHistory: clearHistory,
    getHistoryState: getHistoryState,

    // Project
    createProject: createProject,

    // Track & Clip
    addTrack: addTrack,
    removeTrack: removeTrack,
    addClipToTrack: addClipToTrack,
    removeClipFromTrack: removeClipFromTrack,
    updateClip: updateClip,

    // MediaBin
    addToMediaBin: addToMediaBin,
    removeFromMediaBin: removeFromMediaBin,

    // Preview
    setPreviewPlaying: setPreviewPlaying,
    setPreviewTime: setPreviewTime,
    setPreviewVolume: setPreviewVolume,

    // Export
    setExportStatus: setExportStatus,

    // Bridge
    openEditorWithAsset: openEditorWithAsset,
    openEditor: openEditor
  };

  window.YJ = YJ;

  // ─── Backward-compatible global aliases ───────────────────
  window.EditorState = {
    pushHistory: pushHistory,
    undo: undo,
    redo: redo,
    getHistoryState: getHistoryState,
    openEditorWithAsset: openEditorWithAsset,
    createEditorProject: createProject
  };

  console.log('[Enterprise/EditorState] Editor state management initialized');
  console.log('[Enterprise/EditorState] Models: Clip, Track, Timeline | History: undo/redo | Bridge: openEditorWithAsset');
})();
