/**
 * Pipeline Observability Service — 数字人流水线可观察能力
 *
 * Phase DigitalHuman-Rebuild-004 Step4-F1 (Pipeline Observability)
 *
 * 职责：
 *   1. Pipeline Timeline 查询（getPipelineTimeline）
 *   2. 关键节点记录（recordNode → pipelineLogger）
 *   3. 错误诊断记录与查询（recordError / getErrorDiagnosis）
 *   4. 事件查询（getTimelineEvents）
 *
 * 设计原则：
 *   - 纯新增能力，不修改现有业务流程
 *   - 只读取 PipelineTask 已有字段推导 timeline，不新增 DB 表 / migration
 *   - 不修改 Pipeline 状态机、Provider、callback 业务逻辑、API 返回格式
 *   - 记录能力由 pipelineLogger（内存）提供，供未来步骤接线
 *
 * 禁止范围：
 *   ❌ 修改 models / migrations
 *   ❌ 修改 Provider
 *   ❌ 修改 callback 业务逻辑
 *   ❌ 修改 Pipeline 状态机
 *   ❌ 新增 Controller / Route（不产生新接口）
 */

const { PipelineTask } = require('../models');
const pipelineLogger = require('../utils/pipelineLogger');

// ─── 层顺序（canonical） ────────────────────────────────────────
const LAYER_ORDER = ['vision', 'script', 'tts', 'dh'];

// PipelineTask.status 中表示「当前在某层执行」的状态 → canonical layer
const STATUS_TO_LAYER = {
  vision: 'vision',
  script: 'script',
  tts: 'tts',
  digital_human: 'dh'
};

class PipelineObservabilityService {
  /** @type {Object} 关键节点事件名常量 */
  get EVENTS() {
    return pipelineLogger.EVENTS;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  1. Pipeline Timeline 查询
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 查询 Pipeline 执行时间线
   *
   * 只读取 PipelineTask 已有字段（status / progress / current_layer /
   * failed_layer / intermediate_results / layer_timings / layer_retry_counts），
   * 推导出四层（vision/script/tts/dh）执行时间线，不新增 DB 结构。
   *
   * @param {number} pipelineId — PipelineTask 主键 ID
   * @returns {Promise<{
   *   pipeline_uuid: string|null,
   *   status: string,
   *   progress: number,
   *   layers: Array<{
   *     layer: string,
   *     status: 'pending'|'running'|'success'|'failed'|'skipped',
   *     generation_task_id: number|null,
   *     asset_id: number|null,
   *     started_at: string|null,
   *     completed_at: string|null,
   *     duration_ms: number|null,
   *     retry_count: number
   *   }>
   * }|null>} 时间线对象；任务不存在时返回 null
   */
  async getPipelineTimeline(pipelineId) {
    if (pipelineId == null) {
      throw new Error('[PipelineObservabilityService] pipelineId is required');
    }

    const task = await PipelineTask.findByPk(pipelineId);
    if (!task) {
      return null;
    }

    return {
      pipeline_uuid: task.pipeline_uuid || null,
      status: task.status,
      progress: task.progress != null ? task.progress : 0,
      layers: this._deriveLayers(task)
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  2. 关键节点记录
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 记录流水线关键节点（幂等）
   *
   * @param {number|string} pipelineId — PipelineTask 主键 ID
   * @param {string} event             — EVENTS 之一（如 DH_CALLBACK）
   * @param {Object} [meta]            — 附加信息
   * @returns {{ recorded: boolean, deduped: boolean, event: string }}
   */
  recordNode(pipelineId, event, meta = {}) {
    return pipelineLogger.recordEvent(pipelineId, event, meta);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  3. 错误诊断记录 / 查询
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 记录错误诊断信息（error_code / failed_layer / retry_count / provider_message）
   *
   * @param {number|string} pipelineId
   * @param {Object} info — { errorCode, failedLayer, retryCount, providerMessage }
   * @returns {Object} 已存储的诊断记录
   */
  recordError(pipelineId, info = {}) {
    return pipelineLogger.recordError(pipelineId, info);
  }

  /**
   * 查询某 pipeline 的最新错误诊断
   *
   * @param {number|string} pipelineId
   * @returns {Object|null} { error_code, failed_layer, retry_count, provider_message, timestamp }
   */
  getErrorDiagnosis(pipelineId) {
    return pipelineLogger.getDiagnostics(pipelineId);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  4. 事件查询
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 查询某 pipeline 的已记录关键节点事件
   *
   * @param {number|string} pipelineId
   * @returns {Array<Object>}
   */
  getTimelineEvents(pipelineId) {
    return pipelineLogger.getEvents(pipelineId);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  内部：层状态推导
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 由 PipelineTask 现有字段推导四层执行时间线
   */
  _deriveLayers(task) {
    const status = task.status;
    const intermediate = this._parseJson(task.intermediate_results) || {};
    const timings = this._parseJson(task.layer_timings) || {};
    const layerRetries = this._parseJson(task.layer_retry_counts) || {};

    const failedLayer = this._normalizeLayer(task.failed_layer);
    const activeLayer = STATUS_TO_LAYER[status] || null;
    const currentLayer = this._normalizeLayer(task.current_layer);

    const failedIdx = failedLayer ? LAYER_ORDER.indexOf(failedLayer) : -1;
    const activeIdx = activeLayer ? LAYER_ORDER.indexOf(activeLayer) : -1;

    return LAYER_ORDER.map((layer, i) => {
      const ir = intermediate[layer] || null;
      const timing = timings[layer] || null;
      const retryCount = layerRetries[layer] != null ? layerRetries[layer] : 0;

      return {
        layer,
        status: this._deriveLayerStatus({
          status,
          i,
          failedIdx,
          activeIdx,
          currentLayer,
          layer,
          hasResult: !!ir
        }),
        generation_task_id: ir && ir.generationTaskId != null ? ir.generationTaskId : null,
        asset_id: this._extractAssetId(layer, ir, task),
        started_at: timing && timing.started ? this._asIso(timing.started) : null,
        completed_at: timing && timing.completed
          ? this._asIso(timing.completed)
          : (ir && ir.completedAt ? ir.completedAt : null),
        duration_ms: timing && timing.duration_ms != null ? timing.duration_ms : null,
        retry_count: retryCount
      };
    });
  }

  /**
   * 推导单个 layer 的状态
   *
   * 规则（按优先级）：
   *   1. status=failed 且该层为 failed_layer          → failed
   *   2. status=success                              → 有中间结果 success，否则 skipped
   *   3. status 正好在该层执行                        → running
   *   4. status 在某层执行（activeIdx 已知）：
   *        - 该层之前 → 有中间结果 success，否则 skipped
   *        - 该层之后 → pending
   *   5. status=failed 且 failed_layer 已知：
   *        - 失败层之前 → 有中间结果 success，否则 skipped
   *        - 失败层之后 → pending
   *   6. status=running 且 current_layer 命中        → running
   *   7. 其余（pending / cancelled / running 无 current_layer）→ pending
   */
  _deriveLayerStatus({ status, i, failedIdx, activeIdx, currentLayer, layer, hasResult }) {
    if (status === 'failed' && failedIdx === i) return 'failed';
    if (status === 'success') return hasResult ? 'success' : 'skipped';
    if (activeIdx === i) return 'running';
    if (activeIdx >= 0) return i < activeIdx ? (hasResult ? 'success' : 'skipped') : 'pending';
    if (status === 'failed' && failedIdx >= 0) {
      return i < failedIdx ? (hasResult ? 'success' : 'skipped') : 'pending';
    }
    if (status === 'running' && currentLayer === layer) return 'running';
    return 'pending';
  }

  /**
   * 提取层的 Asset ID：
   *   - tts → intermediate_results.tts.audioAssetId（回退 task.audio_asset_id）
   *   - dh  → intermediate_results.dh.outputAssetId（回退 task.output_asset_id）
   */
  _extractAssetId(layer, ir, task) {
    if (layer === 'tts') {
      return (ir && ir.audioAssetId != null)
        ? ir.audioAssetId
        : (task.audio_asset_id != null ? task.audio_asset_id : null);
    }
    if (layer === 'dh') {
      return (ir && ir.outputAssetId != null)
        ? ir.outputAssetId
        : (task.output_asset_id != null ? task.output_asset_id : null);
    }
    return null;
  }

  /** 归一化层名（'digital_human' → 'dh'） */
  _normalizeLayer(layer) {
    if (!layer) return null;
    if (layer === 'digital_human') return 'dh';
    if (LAYER_ORDER.includes(layer)) return layer;
    return null;
  }

  /** 安全解析 JSON 字段（兼容 string 与 object） */
  _parseJson(value) {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  /** 时间值归一化为 ISO 字符串 */
  _asIso(value) {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return String(value);
  }
}

module.exports = new PipelineObservabilityService();
