/**
 * YuJian Enterprise — Pipeline Adapter
 *
 * Phase DigitalHuman-Rebuild-004 Step4-G4
 *
 * 职责（Pipeline API 唯一消费入口 + 唯一映射层 + 唯一容错层）：
 *   1. 请求层：safeFetch 调用三个只读接口（detail / timeline / errors）
 *      —— 响应已由 api.js 解包（无 { code, message, data }），拿到即 data 对象，
 *         业务层禁止二次解包（禁止 result.data.data）。
 *   2. 规范化层：snake_case → camelCase；dh → digital_human（canonical）
 *      —— 组件禁止看到 snake_case 与 'dh' 字符串。
 *   3. 容错层：error=null → hasError:false；可空字段 → null 哨兵，不丢字段不臆造。
 *
 * 禁止：
 *   ❌ 组件直接 fetch（一切经本 Adapter）
 *   ❌ 组件字符串比较 'dh' / 'digital_human' / snake_case
 *   ❌ 硬编码十六进制色值（tone 仅映射 design-tokens 语义令牌）
 *   ❌ Object.keys() / sort() 遍历层（固定 LAYER_ORDER 顺序）
 */

(function () {
  'use strict';

  var utils = (window.YJ && window.YJ.utils) || {};
  var safeFetch = utils.safeFetch || window.safeFetch;

  // ═══════════════════════════════════════════════════════════════════
  //  映射表（唯一权威，禁止散落组件）
  // ═══════════════════════════════════════════════════════════════════

  // canonical 层键（固定顺序，禁止按返回顺序排序 / 禁止对象键遍历）
  var LAYER_ORDER = ['vision', 'script', 'tts', 'digital_human'];

  // API 层名 → canonical（唯一处理 'dh' 的地方）
  // 注：后端 observability._normalizeLayer 显式兼容 current_layer / failed_layer
  // 可能写入全称 'digital_human'，此处幂等映射为同一 canonical，避免漏配。
  var API_LAYER_TO_CANONICAL = {
    vision: 'vision',
    script: 'script',
    tts: 'tts',
    dh: 'digital_human',
    digital_human: 'digital_human'
  };

  // canonical → 展示标签
  var LAYER_LABELS = {
    vision: '视觉',
    script: '脚本',
    tts: '配音',
    digital_human: '数字人'
  };

  // 流水线状态（9 值）→ 展示 / 终态 / 语义 tone
  // 独立于「层状态」，仅用于流水线整体；禁止复用 formatWorkStatus。
  var PIPELINE_STATUS_MAP = {
    pending:       { label: '等待中',     terminal: false, tone: 'muted'   },
    running:       { label: '运行中',     terminal: false, tone: 'info'    },
    vision:        { label: '视觉生成中', terminal: false, tone: 'info'    },
    script:        { label: '脚本生成中', terminal: false, tone: 'info'    },
    tts:           { label: '配音生成中', terminal: false, tone: 'info'    },
    digital_human: { label: '数字人生成中', terminal: false, tone: 'info'  },
    success:       { label: '已完成',     terminal: true,  tone: 'success' },
    failed:        { label: '失败',       terminal: true,  tone: 'danger'  },
    cancelled:     { label: '已取消',     terminal: true,  tone: 'muted'   }
  };

  // 流水线终态集（轮询停止条件）
  var PIPELINE_TERMINAL_STATUSES = ['success', 'failed', 'cancelled'];

  // 层状态（5 值）→ 展示 / 语义 tone
  // 独立于「流水线状态」，仅用于 timeline_summary / layers 层粒度。
  var LAYER_STATUS_MAP = {
    pending: { label: '待执行', tone: 'muted'   },
    running: { label: '执行中', tone: 'info'    },
    success: { label: '已完成', tone: 'success' },
    failed:  { label: '失败',   tone: 'danger'  },
    skipped: { label: '已跳过', tone: 'muted'   }
  };

  // tone → design-tokens 语义令牌（禁止 hex 颜色、禁止新增颜色）
  // muted 无对应 --muted 语义色，显式映射到：
  //   文本 --text-muted / 背景 --bg-surface / 边框 --border-subtle
  var TONE_TOKENS = {
    muted:   { text: 'var(--text-muted)', bg: 'var(--bg-surface)', border: 'var(--border-subtle)' },
    info:    { text: 'var(--info)',       bg: 'var(--info-bg)',    border: 'var(--border-subtle)' },
    success: { text: 'var(--success)',    bg: 'var(--success-bg)', border: 'var(--border-subtle)' },
    danger:  { text: 'var(--danger)',     bg: 'var(--danger-bg)',  border: 'var(--border-subtle)' }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  内部辅助（不出现在组件，不污染全局）
  // ═══════════════════════════════════════════════════════════════════

  /** 归一化 progress：0–100 整数（null → 0，越界裁剪） */
  function normalizeProgress(progress) {
    var n = (typeof progress === 'number' && isFinite(progress)) ? progress : 0;
    n = Math.round(n);
    if (n < 0) n = 0;
    if (n > 100) n = 100;
    return n;
  }

  /** 派生当前层 canonical key（消除 status === layer 直接比较） */
  function deriveCurrentLayerKey(pipelineStatus, currentLayerField) {
    // 1. status 命中某个执行层（vision/script/tts/digital_human）→ 即当前层
    if (LAYER_ORDER.indexOf(pipelineStatus) !== -1) {
      return pipelineStatus;
    }
    // 2. current_layer（契约字段，可为 null，值可能为 'dh' 或全称）→ canonical
    if (currentLayerField) {
      return API_LAYER_TO_CANONICAL[currentLayerField] || null;
    }
    return null;
  }

  /** 流水线状态 → statusMeta（label/tone/terminal，返回新对象防共享引用突变） */
  function resolvePipelineStatusMeta(status) {
    var meta = PIPELINE_STATUS_MAP[status];
    if (!meta) {
      return { label: status || '未知', tone: 'muted', terminal: false };
    }
    return { label: meta.label, tone: meta.tone, terminal: meta.terminal };
  }

  /** 层状态 → statusMeta（label/tone） */
  function resolveLayerStatusMeta(status) {
    var meta = LAYER_STATUS_MAP[status];
    if (!meta) {
      return { label: status || '未知', tone: 'muted' };
    }
    return { label: meta.label, tone: meta.tone };
  }

  /** 将 API 层数组（layer 可能为 'dh'）按 LAYER_ORDER 固定顺序归并为 canonical 键 → 元素 */
  function indexByLayer(items) {
    var index = {};
    if (Array.isArray(items)) {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item && item.layer) {
          var canonical = API_LAYER_TO_CANONICAL[item.layer];
          if (canonical) index[canonical] = item;
        }
      }
    }
    return index;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  规范化层（snake_case → camelCase + dh → digital_human + 容错）
  // ═══════════════════════════════════════════════════════════════════

  /**
   * normalizeDetail(data) → ViewModel.detail
   *
   * 契约 data: { id, pipeline_uuid, status, progress, current_layer, timeline_summary[] }
   * ViewModel: { id, pipelineUuid, status, statusMeta, progress, currentLayerKey, steps[] }
   */
  function normalizeDetail(data) {
    data = data || {};

    var status = data.status == null ? 'pending' : data.status;
    var summary = indexByLayer(data.timeline_summary);
    var currentLayerKey = deriveCurrentLayerKey(status, data.current_layer);

    var steps = [];
    for (var i = 0; i < LAYER_ORDER.length; i++) {
      var key = LAYER_ORDER[i];
      var layerStatus = (summary[key] && summary[key].status) || 'pending';
      steps.push({
        key: key,
        label: LAYER_LABELS[key],
        status: layerStatus,
        statusMeta: resolveLayerStatusMeta(layerStatus),
        isCurrent: key === currentLayerKey
      });
    }

    return {
      id: data.id != null ? data.id : null,
      pipelineUuid: data.pipeline_uuid != null ? data.pipeline_uuid : null,
      status: status,
      statusMeta: resolvePipelineStatusMeta(status),
      progress: normalizeProgress(data.progress),
      currentLayerKey: currentLayerKey,
      steps: steps
    };
  }

  /**
   * normalizeTimeline(data) → ViewModel.timeline
   *
   * 契约 data: { pipeline_uuid, status, progress, layers[] }
   *   layers[]: { layer, status, generation_task_id, asset_id, started_at,
   *               completed_at, duration_ms, retry_count }
   * ViewModel: { pipelineUuid, status, statusMeta, progress, layers[] }
   */
  function normalizeTimeline(data) {
    data = data || {};

    var status = data.status == null ? 'pending' : data.status;
    var index = indexByLayer(data.layers);

    var layers = [];
    for (var i = 0; i < LAYER_ORDER.length; i++) {
      var key = LAYER_ORDER[i];
      var raw = index[key] || {};
      var layerStatus = raw.status || 'pending';
      layers.push({
        key: key,
        label: LAYER_LABELS[key],
        status: layerStatus,
        statusMeta: resolveLayerStatusMeta(layerStatus),
        generationTaskId: raw.generation_task_id != null ? raw.generation_task_id : null,
        assetId: raw.asset_id != null ? raw.asset_id : null,
        startedAt: raw.started_at != null ? raw.started_at : null,
        completedAt: raw.completed_at != null ? raw.completed_at : null,
        durationMs: raw.duration_ms != null ? raw.duration_ms : null,
        retryCount: raw.retry_count != null ? raw.retry_count : 0
      });
    }

    return {
      pipelineUuid: data.pipeline_uuid != null ? data.pipeline_uuid : null,
      status: status,
      statusMeta: resolvePipelineStatusMeta(status),
      progress: normalizeProgress(data.progress),
      layers: layers
    };
  }

  /**
   * normalizeErrors(data) → ViewModel.diagnostic
   *
   * 契约 data: { pipeline_id, error: { error_code, failed_layer, retry_count,
   *                                     provider_message, timestamp } | null }
   * ViewModel: { hasError, error: {...} | null }
   *   —— error=null → hasError:false，禁止直接访问 error.error_code
   */
  function normalizeErrors(data) {
    data = data || {};
    var err = data.error;

    if (err == null) {
      return { hasError: false, error: null };
    }

    var failedLayerKey = err.failed_layer
      ? (API_LAYER_TO_CANONICAL[err.failed_layer] || null)
      : null;

    return {
      hasError: true,
      error: {
        code: err.error_code != null ? err.error_code : 'UNKNOWN',
        failedLayerKey: failedLayerKey,
        failedLayerLabel: failedLayerKey ? (LAYER_LABELS[failedLayerKey] || null) : null,
        retryCount: err.retry_count != null ? err.retry_count : 0,
        providerMessage: err.provider_message != null ? err.provider_message : null,
        timestamp: err.timestamp != null ? err.timestamp : null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  请求层（唯一消费 Pipeline API 的代码）
  //  返回完整规范化 ViewModel，不返回原始响应
  // ═══════════════════════════════════════════════════════════════════

  /** 拉取流水线概览（轻量，供轮询） */
  function fetchDetail(id) {
    return safeFetch('/enterprise/pipelines/' + id + '/detail').then(normalizeDetail);
  }

  /** 拉取完整执行时间线（进入层详情时按需调用） */
  function fetchTimeline(id) {
    return safeFetch('/enterprise/pipelines/' + id + '/timeline').then(normalizeTimeline);
  }

  /** 拉取最新错误诊断（进入 failed 终态时调用） */
  function fetchErrors(id) {
    return safeFetch('/enterprise/pipelines/' + id + '/errors').then(normalizeErrors);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  暴露到全局（仅挂载 YJ.pipelineAdapter，不新增顶层全局）
  // ═══════════════════════════════════════════════════════════════════

  var YJ = window.YJ || {};
  YJ.pipelineAdapter = {
    fetchDetail: fetchDetail,
    fetchTimeline: fetchTimeline,
    fetchErrors: fetchErrors,
    normalizeDetail: normalizeDetail,
    normalizeTimeline: normalizeTimeline,
    normalizeErrors: normalizeErrors,
    LAYER_ORDER: LAYER_ORDER,
    LAYER_LABELS: LAYER_LABELS,
    PIPELINE_TERMINAL_STATUSES: PIPELINE_TERMINAL_STATUSES,
    TONE_TOKENS: TONE_TOKENS
  };
  window.YJ = YJ;

  console.log('[Enterprise/Pipeline/Adapter] Pipeline Adapter initialized (Phase DigitalHuman-Rebuild-004 Step4-G4)');
})();
