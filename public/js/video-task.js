/**
 * YuJian VideoTask — 图生视频任务创建、轮询、结果展示
 *
 * Sprint 3.1: 更新为使用新接口 /enterprise/video-generation/tasks
 *
 * 依赖：YuJianAPI (public/js/api.js)，需在 api.js 之后引入
 *
 * 使用方式：
 *   const task = await YuJianVideoTask.createImageToVideoTask({
 *     sourceAssetId, prompt, model, duration
 *   });
 *   YuJianVideoTask.pollTaskStatus(taskId, {
 *     onUpdate(task), onSuccess(task), onError(task, err)
 *   });
 *   YuJianVideoTask.stopPolling();
 */

(function () {
  'use strict';

  const api = window.YuJianAPI;

  // ─── 常量 ────────────────────────────────────────────────
  const POLL_INTERVAL = 2000;           // Sprint 5.7: 轮询间隔 2 秒（实时进度显示）
  const BACKGROUND_POLL_INTERVAL = 8000; // 后台轮询间隔 8 秒
  const MAX_POLL_COUNT = 60;            // 最大轮询次数（3秒×60=3分钟）
  const MAX_POLL_DURATION = 3 * 60 * 1000; // 最大轮询时长 3 分钟（与 MAX_POLL_COUNT 一致）
  const MAX_RETRIES = 5;                // 网络错误最大重试
  const RETRY_BASE_DELAY = 2000;         // 基础退避延迟

  const STATUS_MAP = {
    pending: '排队中',
    processing: '生成中',
    success: '生成成功',
    failed: '生成失败'
  };

  const TERMINAL_STATUSES = ['success', 'failed'];

  // ─── 内部状态 ────────────────────────────────────────────
  let pollingTimer = null;
  let pollingAbortController = null;
  let isPolling = false;
  let pollStartTime = 0;
  let pollCount = 0;
  let retryCount = 0;

  // ─── 提示词校验 ──────────────────────────────────────────

  /**
   * 校验提示词
   * @param {string} prompt
   * @returns {{valid: boolean, error?: string, cleaned?: string}}
   */
  function validatePrompt(prompt) {
    if (typeof prompt !== 'string') {
      return { valid: false, error: '请输入提示词' };
    }

    const cleaned = prompt.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();

    if (!cleaned) {
      return { valid: false, error: '提示词不能为空' };
    }

    if (cleaned.length < 2) {
      return { valid: false, error: '提示词过短，请至少输入 2 个字符' };
    }

    if (cleaned.length > 2000) {
      return { valid: false, error: `提示词过长 (${cleaned.length}字)，最多支持 2000 字` };
    }

    return { valid: true, cleaned };
  }

  // ─── 创建图生视频任务 ────────────────────────────────────

  /**
   * 创建图生视频任务
   *
   * Sprint 3.1: 使用新接口 POST /enterprise/video-generation/tasks
   * 参数从 image_url 迁移到 sourceAssetId（Asset 记录 ID）
   *
   * @param {{
   *   sourceAssetId: number,
   *   prompt: string,
   *   negativePrompt?: string,
   *   model?: string,
   *   modelId?: string,
   *   duration?: number,
   *   params?: object
   * }} input
   * @param {AbortSignal} signal
   * @returns {Promise<{id: number, task_id: string, status: string, created_at: string}>}
   */
  async function createImageToVideoTask(input, signal) {
    const { sourceAssetId, prompt, negativePrompt, model, modelId, duration, params } = input;

    // 校验
    if (!sourceAssetId) {
      throw new api.ApiError({
        code: 'VALIDATION',
        message: '请先上传图片',
        status: 400,
        retryable: false,
        raw: null
      });
    }

    const promptCheck = validatePrompt(prompt);
    if (!promptCheck.valid) {
      throw new api.ApiError({
        code: 'VALIDATION',
        message: promptCheck.error,
        status: 400,
        retryable: false,
        raw: null
      });
    }

    // 构建请求体（Sprint 3.1: 使用 sourceAssetId + prompt，不再传 image_url）
    const body = {
      sourceAssetId,
      prompt: promptCheck.cleaned
    };

    if (negativePrompt) body.negativePrompt = negativePrompt.trim();
    if (model || modelId) body.model = model || modelId;
    if (duration !== undefined && duration !== null) body.duration = parseInt(duration) || 5;
    if (params && typeof params === 'object') body.params = params;

    const result = await api.post('/enterprise/video-generation/tasks', body, {
      signal
    });
    // result = { id, task_id, status, created_at }

    // 保存任务信息用于任务恢复
    savePendingTask(result);

    return result;
  }

  // ─── 查询任务状态 ────────────────────────────────────────

  /**
   * 查询任务状态
   *
   * Sprint 3.1: 使用新接口 GET /enterprise/video-generation/tasks/:id
   *
   * @param {number} taskId — 本地数据库主键 (GenerationTask.id)
   * @returns {Promise<object>}
   */
  async function getTaskStatus(taskId) {
    return api.get(`/enterprise/video-generation/tasks/${taskId}`);
  }

  // ─── 轮询 ────────────────────────────────────────────────

  /**
   * 开始轮询任务状态
   *
   * Sprint 3.1: 轮询使用新接口，获取视频转存后的 OSS URL 和 Asset 关联
   *
   * @param {number} taskId
   * @param {{
   *   onUpdate?: Function,   // (task) — 每次状态更新
   *   onSuccess?: Function,  // (task) — 任务成功
   *   onFailed?: Function,   // (task) — 任务失败
   *   onTimeout?: Function,  // ()    — 轮询超时
   *   onError?: Function     // (error)— 查询出错
   * }} callbacks
   */
  function pollTaskStatus(taskId, callbacks = {}) {
    // 停止之前的轮询
    stopPolling();

    const { onUpdate, onSuccess, onFailed, onTimeout, onError } = callbacks;

    pollingAbortController = new AbortController();
    isPolling = true;
    pollStartTime = Date.now();
    pollCount = 0;
    retryCount = 0;

    // 监听页面可见性，降低后台频率
    let currentInterval = POLL_INTERVAL;
    const visibilityHandler = function () {
      currentInterval = document.hidden ? BACKGROUND_POLL_INTERVAL : POLL_INTERVAL;
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    async function poll() {
      if (!isPolling) return;

      pollCount++;

      // 检查轮询次数上限
      if (pollCount > MAX_POLL_COUNT) {
        stopPolling();
        document.removeEventListener('visibilitychange', visibilityHandler);
        if (onTimeout) onTimeout();
        return;
      }

      // 检查总时长
      if (Date.now() - pollStartTime > MAX_POLL_DURATION) {
        stopPolling();
        document.removeEventListener('visibilitychange', visibilityHandler);
        if (onTimeout) onTimeout();
        return;
      }

      try {
        const task = await getTaskStatus(taskId);

        retryCount = 0; // 成功后重置重试计数

        if (onUpdate) onUpdate(task);

        if (task.status === 'success') {
          stopPolling();
          document.removeEventListener('visibilitychange', visibilityHandler);
          clearPendingTask();
          if (onSuccess) onSuccess(task);
          return;
        }

        if (task.status === 'failed') {
          stopPolling();
          document.removeEventListener('visibilitychange', visibilityHandler);
          clearPendingTask();
          if (onFailed) onFailed(task);
          return;
        }

        // 继续轮询
        pollingTimer = setTimeout(poll, currentInterval);

      } catch (err) {
        // 401 — 停止轮询
        if (err.status === 401) {
          stopPolling();
          document.removeEventListener('visibilitychange', visibilityHandler);
          if (onError) onError(err);
          return;
        }

        // 网络错误 — 有限重试
        if (err.retryable && retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = Math.min(RETRY_BASE_DELAY * Math.pow(2, retryCount - 1), 30000);
          console.error('[VideoTask] 查询任务状态失败，第', retryCount, '次重试，延迟', delay, 'ms', err);
          pollingTimer = setTimeout(poll, delay);
        } else {
          // 不可恢复错误或重试耗尽
          console.error('[VideoTask] 查询任务状态失败', err);
          if (onError) onError(err);
          // 仍继续轮询（非致命错误），使用退避间隔
          pollingTimer = setTimeout(poll, Math.min(currentInterval * 2, 30000));
        }
      }
    }

    // 立即执行第一次查询
    poll();
  }

  /**
   * 停止轮询
   */
  function stopPolling() {
    isPolling = false;
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }
    if (pollingAbortController) {
      pollingAbortController.abort();
      pollingAbortController = null;
    }
  }

  // ─── 任务恢复 ────────────────────────────────────────────

  const PENDING_TASK_KEY = 'yj_pending_task';

  function savePendingTask(taskResult) {
    try {
      sessionStorage.setItem(PENDING_TASK_KEY, JSON.stringify({
        localTaskId: taskResult.id || taskResult.task_id,
        createdAt: Date.now(),
        taskType: 'image2video'
      }));
    } catch (_) {
      // sessionStorage 不可用
    }
  }

  function getPendingTask() {
    try {
      const raw = sessionStorage.getItem(PENDING_TASK_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function clearPendingTask() {
    try {
      sessionStorage.removeItem(PENDING_TASK_KEY);
    } catch (_) {
      // ignore
    }
  }

  /**
   * 检查并恢复未完成任务（从 sessionStorage）
   * @param {{onUpdate, onSuccess, onFailed}} callbacks
   * @returns {boolean} — 是否有待恢复的任务
   */
  function resumePendingTask(callbacks) {
    if (!api.isAuthenticated()) return false;

    const pending = getPendingTask();
    if (!pending) return false;

    // 只恢复 1 小时内的任务
    if (Date.now() - pending.createdAt > 60 * 60 * 1000) {
      clearPendingTask();
      return false;
    }

    if (pending.taskType === 'image2video' && pending.localTaskId) {
      console.log('[VideoTask] 恢复未完成任务:', pending.localTaskId);
      pollTaskStatus(pending.localTaskId, callbacks);
      return true;
    }

    return false;
  }

  /**
   * 从数据库恢复所有未完成任务（pending / processing）
   *
   * 刷新页面后自动调用，查询数据库中所有未完成的任务并恢复轮询。
   * 相比 sessionStorage 方案，此方法能恢复多个任务且不依赖浏览器存储。
   *
   * @param {{
   *   onUpdate?: Function,   // (task) — 每次状态更新
   *   onSuccess?: Function,  // (task) — 任务成功
   *   onFailed?: Function,   // (task) — 任务失败
   *   onTimeout?: Function,  // ()    — 轮询超时
   *   onError?: Function     // (error)— 查询出错
   * }} callbacks
   * @returns {Promise<Array>} 恢复的任务 ID 列表
   */
  async function recoverIncompleteTasks(callbacks = {}) {
    if (!api.isAuthenticated()) {
      console.log('[VideoTask] 未登录，跳过任务恢复');
      return [];
    }

    try {
      const data = await api.get('/enterprise/video-generation/tasks?status=pending,processing&pageSize=50');
      const tasks = data.items || [];

      if (tasks.length === 0) {
        console.log('[VideoTask] 没有需要恢复的未完成任务');
        return [];
      }

      console.log('[VideoTask] 从数据库恢复 ' + tasks.length + ' 个未完成任务');
      tasks.forEach(function (task) {
        console.log('[VideoTask] 恢复任务:', task.id, 'status:', task.status, 'progress:', task.progress);
        pollTaskStatus(task.id, callbacks);
      });

      return tasks;
    } catch (err) {
      console.error('[VideoTask] 恢复未完成任务失败:', err);
      // 降级：尝试 sessionStorage 恢复
      if (resumePendingTask(callbacks)) {
        return ['sessionStorage'];
      }
      return [];
    }
  }

  // ─── 暴露到全局 ──────────────────────────────────────────
  window.YuJianVideoTask = {
    // 创建与查询
    createImageToVideoTask,
    getTaskStatus,
    validatePrompt,

    // 轮询
    pollTaskStatus,
    stopPolling,
    isPolling: function () { return isPolling; },
    getPollCount: function () { return pollCount; },

    // 任务恢复
    getPendingTask,
    savePendingTask,
    clearPendingTask,
    resumePendingTask,
    recoverIncompleteTasks,

    // 常量
    STATUS_MAP,
    TERMINAL_STATUSES,
    POLL_INTERVAL,
    MAX_POLL_COUNT,
    MAX_POLL_DURATION
  };

})();
