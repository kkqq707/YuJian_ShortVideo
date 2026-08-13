/**
 * YuJian Enterprise — Pipeline State
 *
 * Phase DigitalHuman-Rebuild-004 Step4-G5
 *
 * 职责（Pipeline Dashboard 状态层，唯一数据源 `YJ.state.pipeline`）：
 *   1. 快照：detail（概览）/ timeline（执行时间线）/ diagnostic（错误诊断）
 *   2. 加载：isLoading / loadError（仅请求错误，业务诊断归 diagnostic，二者禁止混合）
 *   3. 轮询：startPoll / stopPoll（定时器句柄 + AbortController + 终态判定 + 页面离开清理）
 *
 * 依赖：YJ.pipelineAdapter（本文件在 adapter.js 之后加载）
 *   一切 API 请求只经 Adapter，禁止直接 fetch、禁止访问 snake_case 字段、
 *   禁止 'dh' 字符串判断、禁止 status 字符串映射 UI（状态语义由 Adapter 的
 *   statusMeta.terminal / status 派生）。
 *
 * 终态集：success / failed / cancelled（与 Adapter 的 PIPELINE_STATUS_MAP.terminal
 *   对齐，仅这三个 status 的 statusMeta.terminal === true）。
 *   命中 failed → 额外调用一次 fetchErrors() 拉取业务诊断。
 *
 * 错误区分（严格，不可合并）：
 *   - 请求错误（safeFetch reject，含 401 / 超时 / 网络）→ loadError
 *   - 业务诊断（GET /errors 的 data.error 对象或 null）→ diagnostic
 */

(function () {
  'use strict';

  var adapter = (window.YJ && window.YJ.pipelineAdapter) || {};
  var fetchDetail = adapter.fetchDetail;
  var fetchTimeline = adapter.fetchTimeline;
  var fetchErrors = adapter.fetchErrors;

  // ─── 常量 ────────────────────────────────────────────────
  var POLL_INTERVAL = 2000;    // 轮询间隔（毫秒）
  var FAILED_STATUS = 'failed'; // 唯一需要字符串判定的终态（触发 fetchErrors）

  // ─── Pipeline 状态（唯一数据源，挂载到 YJ.state.pipeline）─────
  var pipelineState = {
    id: null,          // 当前 pipeline id（load / startPoll 传入）
    detail: null,      // 概览快照（normalizeDetail 结果）
    timeline: null,    // 时间线快照（normalizeTimeline 结果）
    diagnostic: null,  // 错误诊断快照（normalizeErrors 结果，hasError / error）
    isLoading: false,  // 初始加载中（load 三接口进行中）
    loadError: null,   // 请求错误（safeFetch reject），业务诊断不写此处
    polling: {
      isPolling: false,      // 是否正在轮询
      timer: null,           // 定时器句柄（setTimeout 返回）
      abortController: null, // AbortController（停止/离开页面时 abort）
      count: 0               // 已轮询次数（可观测性）
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  内部请求封装（各自捕获请求错误 → loadError，互不影响，业务诊断归 diagnostic）
  // ═══════════════════════════════════════════════════════════════════

  /** 拉取概览 → detail；请求失败 → loadError */
  function loadDetail(id) {
    return fetchDetail(id).then(function (detail) {
      pipelineState.detail = detail;
      return detail;
    }).catch(function (err) {
      pipelineState.loadError = err || null;
      return null;
    });
  }

  /** 拉取时间线 → timeline；请求失败 → loadError */
  function loadTimeline(id) {
    return fetchTimeline(id).then(function (timeline) {
      pipelineState.timeline = timeline;
      return timeline;
    }).catch(function (err) {
      pipelineState.loadError = err || null;
      return null;
    });
  }

  /** 拉取错误诊断 → diagnostic；请求失败 → loadError（绝不写 diagnostic，二者禁止混合） */
  function loadErrors(id) {
    return fetchErrors(id).then(function (diagnostic) {
      pipelineState.diagnostic = diagnostic;
      return diagnostic;
    }).catch(function (err) {
      pipelineState.loadError = err || null;
      return null;
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  load(id) — 一次性完整加载（detail + timeline + errors）
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 加载一条流水线的完整快照。
   *
   * @param {string|number} id — pipeline id
   * @returns {Promise<Object>} 解析为 pipelineState（不 reject，请求错误落 loadError）
   */
  function load(id) {
    if (!adapterReady()) return Promise.resolve(pipelineState);

    pipelineState.id = id;
    pipelineState.isLoading = true;
    pipelineState.loadError = null;

    // 三个接口独立容错：任一失败只写 loadError，不阻断其余两个
    return Promise.all([
      loadDetail(id),
      loadTimeline(id),
      loadErrors(id)
    ]).then(function () {
      pipelineState.isLoading = false;
      return pipelineState;
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  轮询（参考 video-task.js 范式，终态集改为 success/failed/cancelled）
  // ═══════════════════════════════════════════════════════════════════

  /** 单次轮询：拉 detail，判定终态，命中 failed 额外拉 errors，否则安排下一次 */
  function poll() {
    if (!pipelineState.polling.isPolling) return;

    var id = pipelineState.id;
    var controller = pipelineState.polling.abortController;

    if (id == null) {
      stopPoll();
      return;
    }

    pipelineState.polling.count++;

    fetchDetail(id).then(function (detail) {
      // 已停止 / 已 abort → 丢弃过期结果，防止竞态写入
      if (!pipelineState.polling.isPolling) return;
      if (controller && controller.signal.aborted) return;

      pipelineState.detail = detail;
      pipelineState.loadError = null; // 本次请求成功，清除请求错误

      // 终态判定：仅 success / failed / cancelled 的 statusMeta.terminal === true
      var isTerminal = !!(detail.statusMeta && detail.statusMeta.terminal);

      if (isTerminal) {
        // 命中 failed → 额外拉取一次错误诊断（业务诊断归 diagnostic）
        if (detail.status === FAILED_STATUS) {
          loadErrors(id);
        }
        stopPoll();
        return;
      }

      // 非终态 → 继续轮询
      scheduleNext();
    }).catch(function (err) {
      if (!pipelineState.polling.isPolling) return;
      if (controller && controller.signal.aborted) return;

      // 401 → 停止轮询（不继续），请求错误落 loadError
      if (err && err.status === 401) {
        pipelineState.loadError = err;
        stopPoll();
        return;
      }

      // 其他请求错误（超时 / 网络 / 5xx）→ 落 loadError，继续轮询（不停止）
      pipelineState.loadError = err || null;
      scheduleNext();
    });
  }

  /** 安排下一次轮询，保存定时器句柄 */
  function scheduleNext() {
    if (!pipelineState.polling.isPolling) return;
    pipelineState.polling.timer = setTimeout(poll, POLL_INTERVAL);
  }

  /**
   * 开始轮询流水线概览。
   *
   * - 防止重复启动（同 id 已轮询则直接返回）
   * - 保存 timer 句柄 + AbortController
   * - 注册页面离开清理（beforeunload / pagehide）
   *
   * @param {string|number} id — pipeline id
   */
  function startPoll(id) {
    if (!adapterReady()) return;
    if (id == null) return;

    // 防止重复启动：同 id 已在轮询 → 幂等返回
    if (pipelineState.polling.isPolling && pipelineState.id === id) {
      return;
    }

    // 停止旧轮询（不同 id 或首次），避免多重轮询
    stopPoll();

    pipelineState.id = id;
    pipelineState.polling.isPolling = true;
    pipelineState.polling.count = 0;
    pipelineState.polling.abortController = new AbortController();

    registerCleanup();

    // 立即执行第一次轮询（参考 video-task.js）
    poll();
  }

  /**
   * 停止轮询。
   * 清理定时器句柄 + AbortController（存在即清理）。
   * 也可直接作为 beforeunload / pagehide 事件处理器（忽略事件参数）。
   */
  function stopPoll() {
    var p = pipelineState.polling;
    p.isPolling = false;

    if (p.timer) {
      clearTimeout(p.timer);
      p.timer = null;
    }
    if (p.abortController) {
      p.abortController.abort();
      p.abortController = null;
    }
  }

  // ─── 页面离开清理（只注册一次）───────────────────────────
  var cleanupRegistered = false;

  function registerCleanup() {
    if (cleanupRegistered) return;
    cleanupRegistered = true;
    window.addEventListener('beforeunload', stopPoll);
    window.addEventListener('pagehide', stopPoll);
  }

  /** Adapter 就绪校验（脚本加载顺序异常时的防御） */
  function adapterReady() {
    if (typeof fetchDetail !== 'function' ||
        typeof fetchTimeline !== 'function' ||
        typeof fetchErrors !== 'function') {
      pipelineState.loadError = { code: 'ADAPTER_UNAVAILABLE', message: 'Pipeline Adapter 未加载' };
      return false;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  暴露到全局（仅挂载 YJ.state.pipeline，不新增顶层全局）
  // ═══════════════════════════════════════════════════════════════════

  pipelineState.load = load;
  pipelineState.startPoll = startPoll;
  pipelineState.stopPoll = stopPoll;

  var YJ = window.YJ || {};
  if (!YJ.state) YJ.state = {};
  YJ.state.pipeline = pipelineState;
  window.YJ = YJ;

  console.log('[Enterprise/Pipeline/State] Pipeline state initialized (Phase DigitalHuman-Rebuild-004 Step4-G5)');
})();
