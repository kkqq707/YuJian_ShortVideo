/**
 * YuJian Studio — Tasks Detail Page
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D4 / Step7-E
 *
 * 职责：生成任务详情页面（薄壳桥接层 + 数字人成品视频区）——
 *   1. 复用企业端流水线详情整页能力：把 YJ.pages.pipeline（渲染 + 轮询 + 四组件）桥接进 Studio 壳。
 *   2. 新增「数字人成品视频」区：读取 YJ.state.pipeline.timeline.layers 中
 *      key === 'digital_human' 的层，取 layer.assetId → api.asset.playUrl(assetId) →
 *      渲染 <video controls playsinline preload="metadata"> + 下载按钮。
 *   - render()：产出外层容器（流水线内容锚点 + 数字人视频区锚点）
 *   - init(params)：先插入 YJ.pages.pipeline.render() 产物，再调 YJ.pages.pipeline.init(params.id)；
 *     之后启动数字人视频区视图同步（state 无订阅，页面主动轮读 YJ.state.pipeline.timeline）
 *   - destroy()：委托 YJ.pages.pipeline.destroy()（停轮询）+ 停视频区同步 + 清闭包引用

 * 数据边界（严格遵守，违规即返工）：
 *   ❌ 不直接 fetch / 不拼 URL / 不解析错误文案（一切经 YJ.state.pipeline + YJ.pipelineAdapter + YJ.studio.api）
 *   ❌ 不新增 state / 组件 / 轮询机制（复用 YJ.state.pipeline 全量管理 + pipelineAdapter.fetchTimeline 兜底）
 *   ❌ 不复制 pipeline 页面逻辑（整页复用 YJ.pages.pipeline，不局部重写）
 *   ❌ 不调用 YJ.studio.state（详情不经过 studio 的 cache/selection；播放 URL 走 YJ.studio.api.asset.playUrl）
 *   ✅ vanilla JS + IIFE + window.YJ，暴露 render(params)/init(params)/destroy()
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  if (!YJ.studio) YJ.studio = {};
  if (!YJ.studio.pages) YJ.studio.pages = {};

  // 复用的企业端流水线详情页（脚本加载序保证已就绪；防御性判空避免误配序时硬崩）
  var pipelinePage = (YJ.pages && YJ.pages.pipeline) || {};

  // 播放 URL 唯一入口（经 Studio API Adapter，禁止直接 fetch）
  var api = (YJ.studio && YJ.studio.api) || {};

  // ── 常量 ────────────────────────────────────────────────
  var STYLE_ID = 'studio-dh-video-style';
  var VIDEO_SECTION_ID = 'studio-dh-video';

  // 数字人成品视频区视图同步间隔（毫秒）：state 无订阅，页面以固定节拍轮读 timeline
  // 并渲染视频；与 pipeline 页面的轮询节拍（2000ms）错开，确保成品快照及时上屏。
  var VIDEO_SYNC_INTERVAL = 1000;

  // 数字人 canonical 层键（与 YJ.pipelineAdapter.LAYER_ORDER 对齐，仅用于命中成品视频层）
  var DH_LAYER_KEY = 'digital_human';

  // 视频区提示文案（固定文案，页面自控，不经过 handleError 文案映射）
  var HINT_GENERATING = '数字人视频生成中，完成后将自动展示';
  var HINT_LOADING = '正在加载视频…';
  var HINT_ERROR = '视频加载失败，请稍后重试';
  var HINT_NO_URL = '视频资源暂不可用';

  // ── 页面闭包瞬时状态（destroy 释放，不写 state）──
  var els = {};                 // 页面容器引用（content / video）
  var currentId = null;         // 当前 pipeline id（params.id，用于兜底重拉时间线）
  var dhVideoTimer = null;      // 视频区视图同步定时器句柄
  var handledAssetId = null;    // 已处理 assetId（成功或失败），防重复 playUrl
  var fetching = false;         // playUrl 进行中（防并发）
  var fallbackDone = false;     // 终态成功时时间线兜底重拉是否已完成（单次防抖）
  var renderedState = '';       // 当前已渲染状态标识（video:<id> / hint:<text>），幂等防抖

  // ═══════════════════════════════════════════════════════════════════
  //  页面作用域样式（幂等注入，仅引用 design-tokens 语义令牌，无 hex）
  // ═══════════════════════════════════════════════════════════════════

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.studio-dh-video{display:flex;flex-direction:column;gap:var(--space-3);',
      '  padding:var(--space-4);border-radius:var(--radius-lg);',
      '  border:1px solid var(--border-subtle);background:var(--bg-surface);}',
      '.studio-dh-video[hidden]{display:none;}',
      '.studio-dh-video__title{margin:0;font-size:var(--text-md);font-weight:var(--font-semibold);',
      '  color:var(--text-primary);}',
      '.studio-dh-video__player{width:100%;border-radius:var(--radius-md);overflow:hidden;',
      '  background:var(--bg-base);}',
      '.studio-dh-video__el{display:block;width:100%;max-height:480px;aspect-ratio:16/9;',
      '  background:var(--bg-base);}',
      '.studio-dh-video__actions{display:flex;flex-wrap:wrap;gap:var(--space-2);}',
      '.studio-dh-video__hint{display:flex;align-items:center;gap:var(--space-2);',
      '  min-height:44px;padding:var(--space-3) var(--space-4);',
      '  color:var(--text-secondary);font-size:var(--text-sm);}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  生命周期（render 纯字符串 / init 桥接 / destroy 委托销毁）
  // ═══════════════════════════════════════════════════════════════════

  function render(params) {
    ensureStyles();
    return '' +
      '<div class="studio-page studio-tasks-detail">' +
        '<div class="studio-tasks-detail__content"></div>' +
        '<section class="studio-dh-video" id="' + VIDEO_SECTION_ID + '" hidden></section>' +
      '</div>';
  }

  function init(params) {
    cacheEls();

    // 桥接（契约顺序）：先插入整页壳（YJ.pages.pipeline.init 依赖 #yjp-pipeline-page 已存在），
    // 再 init —— 由其内部驱动 load + startPoll + 视图同步。
    if (els.content && typeof pipelinePage.render === 'function') {
      els.content.innerHTML = pipelinePage.render();
    }
    if (typeof pipelinePage.init === 'function') {
      pipelinePage.init(params && params.id);
    }

    // 数字人成品视频区：重置闭包态后启动视图同步
    currentId = (params && params.id) || null;
    handledAssetId = null;
    fetching = false;
    fallbackDone = false;
    renderedState = '';
    startDhVideoSync();
  }

  function destroy() {
    // 停视频区视图同步（先停自建定时器，再委托流水线页面销毁）
    stopDhVideoSync();

    // 委托销毁：停轮询 + 停视图同步 + 解绑事件 + 清引用，避免切页后残留轮询/定时器
    if (typeof pipelinePage.destroy === 'function') {
      pipelinePage.destroy();
    }

    currentId = null;
    handledAssetId = null;
    fetching = false;
    fallbackDone = false;
    renderedState = '';
    els = {};
  }

  function cacheEls() {
    els.content = document.querySelector('#studio-main .studio-tasks-detail__content');
    els.video = document.getElementById(VIDEO_SECTION_ID);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  数字人成品视频区 — 视图同步（state 无订阅，主动轮读并渲染）
  // ═══════════════════════════════════════════════════════════════════

  function startDhVideoSync() {
    stopDhVideoSync();
    renderDhVideo(); // 立即渲染一次
    dhVideoTimer = setInterval(renderDhVideo, VIDEO_SYNC_INTERVAL);
  }

  function stopDhVideoSync() {
    if (dhVideoTimer) {
      clearInterval(dhVideoTimer);
      dhVideoTimer = null;
    }
  }

  /** 读取唯一数据源（缺失时返回空对象，避免 NPE） */
  function getPipelineState() {
    return (window.YJ && window.YJ.state && window.YJ.state.pipeline) || {};
  }

  /** 命中数字人层（canonical key === 'digital_human'），否则 null */
  function findDigitalHumanLayer(timeline) {
    var layers = (timeline && timeline.layers) || [];
    for (var i = 0; i < layers.length; i++) {
      if (layers[i] && layers[i].key === DH_LAYER_KEY) return layers[i];
    }
    return null;
  }

  /** 流水线是否已达终态 success（detail.statusMeta.terminal 亦可用，直接比较 status 更直白） */
  function isPipelineSuccess(pipelineState) {
    var detail = pipelineState && pipelineState.detail;
    return !!(detail && detail.status === 'success');
  }

  /**
   * 视频区状态机（每 tick 调用，幂等）：
   *   1. 数字人层已产出 assetId → playUrl + 渲染 <video> + 下载
   *   2. 终态成功但时间线尚无 assetId（进入页面时可能仍在生成）→ 兜底重拉一次时间线
   *   3. 生成中 → 占位提示
   */
  function renderDhVideo() {
    if (!els.video) return;
    var pipelineState = getPipelineState();

    // 时间线尚未加载（初始 isLoading）→ 保持隐藏，等 load 完成后的下一次 tick
    if (!pipelineState.timeline) return;

    var layer = findDigitalHumanLayer(pipelineState.timeline);

    if (layer && layer.assetId != null) {
      if (layer.assetId !== handledAssetId) {
        loadAndRenderVideo(layer.assetId);
      }
      return;
    }

    if (isPipelineSuccess(pipelineState)) {
      refreshTimelineFallback();
      return;
    }

    renderDhHint(HINT_GENERATING);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  数字人成品视频区 — 播放 URL 拉取 + 渲染
  // ═══════════════════════════════════════════════════════════════════

  /** 拉取播放 URL（唯一入口 YJ.studio.api.asset.playUrl），成功后渲染视频 + 下载 */
  function loadAndRenderVideo(assetId) {
    if (fetching) return;
    if (!api.asset || typeof api.asset.playUrl !== 'function') {
      renderDhHint(HINT_ERROR);
      return;
    }

    fetching = true;
    renderDhHint(HINT_LOADING);

    api.asset.playUrl(assetId).then(function (result) {
      fetching = false;
      if (!els.video) return; // 已切页，丢弃过期结果
      handledAssetId = assetId;
      if (result && result.url) {
        renderVideoPlayer(result.url, result.type, assetId);
      } else {
        renderDhHint(HINT_NO_URL);
      }
    }).catch(function () {
      fetching = false;
      if (!els.video) return;
      handledAssetId = assetId;
      renderDhHint(HINT_ERROR);
    });
  }

  /** 渲染 <video controls playsinline preload="metadata"> + 下载按钮 */
  function renderVideoPlayer(url, type, assetId) {
    var stateKey = 'video:' + assetId;
    if (renderedState === stateKey) return;
    renderedState = stateKey;

    els.video.hidden = false;
    els.video.innerHTML = '';

    var title = document.createElement('h2');
    title.className = 'studio-dh-video__title';
    title.textContent = '数字人成品视频';

    var player = document.createElement('div');
    player.className = 'studio-dh-video__player';

    var video = document.createElement('video');
    video.className = 'studio-dh-video__el';
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;
    player.appendChild(video);

    var actions = document.createElement('div');
    actions.className = 'studio-dh-video__actions';

    var download = document.createElement('a');
    download.className = 'yj-btn yj-btn-primary';
    download.href = url;
    // 跨域签名 URL 下 download 属性可能被忽略，target=_blank 兜底不离开应用
    download.setAttribute('download', 'digital-human-' + assetId + '.mp4');
    download.setAttribute('target', '_blank');
    download.setAttribute('rel', 'noopener');

    var icon = document.createElement('i');
    icon.className = 'fas fa-download';
    icon.setAttribute('aria-hidden', 'true');
    var span = document.createElement('span');
    span.textContent = '下载视频';
    download.appendChild(icon);
    download.appendChild(span);
    actions.appendChild(download);

    els.video.appendChild(title);
    els.video.appendChild(player);
    els.video.appendChild(actions);
  }

  /** 渲染提示态（生成中 / 加载中 / 失败 / 无资源），幂等防抖 */
  function renderDhHint(text) {
    var stateKey = 'hint:' + text;
    if (renderedState === stateKey) return;
    renderedState = stateKey;

    els.video.hidden = false;
    els.video.innerHTML = '' +
      '<div class="studio-dh-video__hint">' +
        '<i class="fas fa-film" aria-hidden="true"></i>' +
        '<span>' + text + '</span>' +
      '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  兜底：终态成功但时间线滞后（进入页面时仍在生成，poll 只更新 detail 不更新 timeline）
  //  经 YJ.pipelineAdapter.fetchTimeline 重拉一次时间线，命中 assetId 后走正常渲染
  // ═══════════════════════════════════════════════════════════════════

  function refreshTimelineFallback() {
    if (fallbackDone || fetching) return;
    if (currentId == null) { fallbackDone = true; return; }

    var adapter = (window.YJ && window.YJ.pipelineAdapter) || {};
    if (typeof adapter.fetchTimeline !== 'function') { fallbackDone = true; return; }

    fallbackDone = true; // 单次兜底，避免每 tick 重拉

    adapter.fetchTimeline(currentId).then(function (freshTimeline) {
      if (!els.video) return;
      var layer = findDigitalHumanLayer(freshTimeline);
      if (layer && layer.assetId != null) {
        loadAndRenderVideo(layer.assetId);
      } else {
        renderDhHint(HINT_NO_URL);
      }
    }).catch(function () {
      if (els.video) renderDhHint(HINT_ERROR);
    });
  }

  YJ.studio.pages['tasks-detail'] = {
    render: render,
    init: init,
    destroy: destroy
  };

  window.YJ = YJ;
})();
