/**
 * Pipeline Logger — 数字人流水线结构化日志与关键节点记录
 *
 * Phase DigitalHuman-Rebuild-004 Step4-F1 (Pipeline Observability)
 *
 * 职责：
 *   1. 记录流水线关键节点（PIPELINE_CREATED / VISION_STARTED / ... / PIPELINE_FAILED）
 *   2. 记录错误诊断信息（error_code / failed_layer / retry_count / provider_message）
 *   3. 幂等：同一 pipeline 同一节点重复记录只保留一条
 *   4. 输出结构化日志（供日志采集系统抓取，禁止输出敏感信息）
 *
 * 设计原则：
 *   - 纯新增可观察能力，不修改现有业务流程
 *   - 内存存储（本阶段不新增 DB 表 / migration）
 *   - 进程内事件日志，由 pipelineObservabilityService 对外提供查询
 *   - 禁止输出敏感信息（API Key、完整用户内容等）
 */

// ─── 关键节点事件名（唯一事实来源） ─────────────────────────────
const EVENTS = Object.freeze({
  PIPELINE_CREATED: 'PIPELINE_CREATED',
  VISION_STARTED: 'VISION_STARTED',
  SCRIPT_STARTED: 'SCRIPT_STARTED',
  TTS_STARTED: 'TTS_STARTED',
  DH_STARTED: 'DH_STARTED',
  DH_CALLBACK: 'DH_CALLBACK',
  ASSET_CREATED: 'ASSET_CREATED',
  PIPELINE_COMPLETED: 'PIPELINE_COMPLETED',
  PIPELINE_FAILED: 'PIPELINE_FAILED'
});

const EVENT_NAMES = Object.values(EVENTS);

// ─── 敏感字段（存储时脱敏） ──────────────────────────────────────
const SENSITIVE_KEY_PATTERN = /key|token|secret|password|credential|authorization/i;

class PipelineLogger {
  constructor() {
    /** @type {Map<number|string, Array<Object>>} pipelineId → 事件记录数组（按 seq 升序） */
    this._events = new Map();
    /** @type {Map<number|string, Object>} pipelineId → 最新错误诊断记录（latest-wins） */
    this._diagnostics = new Map();
    /** 全局递增序号，保证事件顺序可判定 */
    this._seq = 0;
  }

  /** @type {Object} 关键节点事件名常量 */
  get EVENTS() {
    return EVENTS;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  1. 记录关键节点
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 记录一个流水线关键节点（幂等）
   *
   * 同一 (pipelineId, event, dedupKey) 只保留一条：
   *   - 首次记录 → { recorded: true, deduped: false }
   *   - 重复记录 → { recorded: false, deduped: true }（不追加、不报错）
   *
   * @param {number|string} pipelineId — PipelineTask 主键 ID
   * @param {string} event             — 事件名（必须是 EVENTS 之一）
   * @param {Object} [meta]            — 附加信息（generationTaskId / layer / assetId / errorCode 等）
   * @param {string} [meta.dedupKey]   — 自定义去重键（默认使用 event 名）
   * @returns {{ recorded: boolean, deduped: boolean, event: string }}
   */
  recordEvent(pipelineId, event, meta = {}) {
    if (pipelineId == null) {
      throw new Error('[PipelineLogger] pipelineId is required');
    }
    if (!EVENT_NAMES.includes(event)) {
      throw new Error(
        `[PipelineLogger] Unknown pipeline event: "${event}". ` +
        `Valid events: ${EVENT_NAMES.join(', ')}`
      );
    }

    const dedupKey = (meta && meta.dedupKey != null) ? `${event}:${meta.dedupKey}` : event;
    const safeMeta = this._sanitizeMeta(meta);
    delete safeMeta.dedupKey; // 控制字段不入库，仅用于去重

    const events = this._events.get(pipelineId) || [];
    if (events.some(e => e.dedupKey === dedupKey)) {
      console.log(
        `[PipelineLogger] recordEvent DEDUPED | ` +
        `pipelineId=${pipelineId} | event=${event} | ` +
        `time=${new Date().toISOString()}`
      );
      return { recorded: false, deduped: true, event };
    }

    const record = {
      seq: ++this._seq,
      pipelineId,
      event,
      timestamp: new Date().toISOString(),
      dedupKey,
      meta: safeMeta
    };
    events.push(record);
    this._events.set(pipelineId, events);

    console.log(
      `[PipelineLogger] ${event} | ` +
      `pipelineId=${pipelineId} | ` +
      `metaKeys=${Object.keys(safeMeta).join(',') || 'N/A'} | ` +
      `time=${record.timestamp}`
    );

    return { recorded: true, deduped: false, event };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  2. 查询事件
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 返回某 pipeline 的已记录事件（按记录顺序）
   * @param {number|string} pipelineId
   * @returns {Array<Object>} 事件记录数组（副本）
   */
  getEvents(pipelineId) {
    return [...(this._events.get(pipelineId) || [])];
  }

  // ═══════════════════════════════════════════════════════════════════
  //  3. 记录错误诊断
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 记录错误诊断信息（latest-wins，天然幂等）
   *
   * 同一 pipeline 重复记录诊断只保留最新一条（不产生重复记录）。
   *
   * @param {number|string} pipelineId
   * @param {Object} info
   * @param {string|null} [info.errorCode]       — 错误码（如 'TIMEOUT' / 'VALIDATION' / provider error code）
   * @param {string|null} [info.failedLayer]     — 失败层（vision|script|tts|dh）
   * @param {number}      [info.retryCount]      — 重试次数
   * @param {string|null} [info.providerMessage] — Provider 错误信息（已脱敏）
   * @returns {Object} 已存储的诊断记录
   */
  recordError(pipelineId, info = {}) {
    if (pipelineId == null) {
      throw new Error('[PipelineLogger] pipelineId is required');
    }

    const record = {
      pipelineId,
      error_code: info.errorCode != null ? info.errorCode : null,
      failed_layer: info.failedLayer != null ? info.failedLayer : null,
      retry_count: info.retryCount != null ? info.retryCount : 0,
      provider_message: info.providerMessage != null ? info.providerMessage : null,
      timestamp: new Date().toISOString()
    };

    this._diagnostics.set(pipelineId, record);

    console.log(
      `[PipelineLogger] recordError | ` +
      `pipelineId=${pipelineId} | ` +
      `errorCode=${record.error_code || 'N/A'} | ` +
      `failedLayer=${record.failed_layer || 'N/A'} | ` +
      `retryCount=${record.retry_count} | ` +
      `time=${record.timestamp}`
    );

    return record;
  }

  /**
   * 返回某 pipeline 的最新错误诊断记录
   * @param {number|string} pipelineId
   * @returns {Object|null}
   */
  getDiagnostics(pipelineId) {
    return this._diagnostics.get(pipelineId) || null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  4. 清理（测试 / 内存回收）
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 清理事件/诊断记录
   * @param {number|string} [pipelineId] — 指定 pipeline 时仅清理该 pipeline；省略时清空全部
   */
  clear(pipelineId) {
    if (pipelineId != null) {
      this._events.delete(pipelineId);
      this._diagnostics.delete(pipelineId);
    } else {
      this._events.clear();
      this._diagnostics.clear();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  内部：meta 脱敏
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 脱敏 meta：移除敏感字段（API Key / token / 完整内容），返回浅拷贝。
   * 日志输出只打印键名，不打印值。
   */
  _sanitizeMeta(meta) {
    if (!meta || typeof meta !== 'object') return {};
    const safe = {};
    for (const [key, value] of Object.entries(meta)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) continue;
      safe[key] = value;
    }
    return safe;
  }
}

module.exports = new PipelineLogger();
