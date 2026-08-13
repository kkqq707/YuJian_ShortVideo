/**
 * PipelineTask Service — 数字人流水线任务生命周期管理
 *
 * Phase DigitalHuman-Rebuild-004 Step4-D2
 *
 * 职责：
 *   1. 创建 PipelineTask（初始状态 pending）
 *   2. 查询 PipelineTask（企业隔离）
 *   3. 更新 PipelineTask 状态（含白名单校验）
 *   4. 保存 intermediate_results（按层 merge）
 *   5. 更新 progress（0-100 边界校验）
 *   6. 记录失败信息（status=failed, failed_layer, error_msg, completed_at）
 *
 * 设计原则：
 *   - 只负责 PipelineTask CRUD，不涉及 Provider 调用
 *   - 不调用 generationService / aliyunProvider
 *   - 不编排 Vision → Script → TTS → DigitalHuman 流程
 *   - 统一企业隔离
 *   - 使用 ProviderError 进行参数校验
 *
 * 禁止范围：
 *   ❌ pipelineOrchestrator
 *   ❌ digitalHumanPipelineService
 *   ❌ Vision → Script → TTS → DigitalHuman 流程编排
 *   ❌ Provider 调用
 *   ❌ generationService 调用
 *   ❌ Asset / OSS / Controller / Route
 */

const { PipelineTask } = require('../models');
const ProviderError = require('../utils/ProviderError');

/**
 * PipelineTask 允许的状态白名单
 * 必须与 Model ENUM 定义保持一致:
 *   pending, running, vision, script, tts, digital_human, success, failed, cancelled
 */
const VALID_STATUSES = [
  'pending',
  'running',
  'vision',
  'script',
  'tts',
  'digital_human',
  'success',
  'failed',
  'cancelled'
];

/**
 * intermediate_results 的合法 layer key
 * 与 Model 定义的 JSON 结构一致: { vision, script, tts, dh }
 */
const VALID_LAYERS = ['vision', 'script', 'tts', 'dh'];

class PipelineTaskService {
  // ─── 常量 ──────────────────────────────────────────────────────────

  /** @type {string[]} 合法状态列表 */
  get VALID_STATUSES() {
    return VALID_STATUSES;
  }

  /** @type {string[]} 合法中间结果层 */
  get VALID_LAYERS() {
    return VALID_LAYERS;
  }

  // ───────────────────────────────────────────────────────────────────
  // 1. 创建 PipelineTask
  // ───────────────────────────────────────────────────────────────────

  /**
   * 创建 PipelineTask
   *
   * 默认状态: pending
   * 默认进度: 0
   *
   * @param {Object}  params
   * @param {number}  params.enterpriseId   — 企业 ID（必填）
   * @param {number}  params.userId         — 用户 ID（必填）
   * @param {number}  [params.dramaProjectId] — 关联短剧项目 ID
   * @param {Object}  [params.inputParams]  — 用户输入参数 { image_url, theme, style, voice_id, ... }
   * @param {Object}  [params.runConfig]    — 运行配置 { mode, tier, max_retries, ... }
   * @returns {Promise<Object>} PipelineTask instance (plain object)
   */
  async createPipelineTask(params) {
    const { enterpriseId, userId, dramaProjectId, inputParams, runConfig } = params || {};

    // ── 参数校验 ────────────────────────────────────────────────
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }
    if (!userId) {
      throw new ProviderError('system', 'VALIDATION', 'User ID is required', false);
    }

    // ── 生成 pipeline_uuid ──────────────────────────────────────
    const { v4: uuidv4 } = require('uuid');
    const pipelineUuid = uuidv4();

    try {
      const task = await PipelineTask.create({
        pipeline_uuid: pipelineUuid,
        enterprise_id: enterpriseId,
        user_id: userId,
        drama_project_id: dramaProjectId || null,
        input_params: inputParams ? JSON.stringify(inputParams) : '{}',
        run_config: runConfig ? JSON.stringify(runConfig) : null,
        status: 'pending',
        progress: 0,
        intermediate_results: null
      });

      console.log(
        `[PipelineTaskService] PipelineTask created | ` +
        `id=${task.id} | uuid=${pipelineUuid} | ` +
        `enterpriseId=${enterpriseId} | userId=${userId} | ` +
        `time=${new Date().toISOString()}`
      );

      return task;
    } catch (error) {
      console.error(
        `[PipelineTaskService] createPipelineTask FAILED | ` +
        `enterpriseId=${enterpriseId} | userId=${userId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'CREATE_FAILED',
        `Failed to create PipelineTask: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 2. 查询 PipelineTask
  // ───────────────────────────────────────────────────────────────────

  /**
   * 按主键 ID 查询 PipelineTask（企业隔离）
   *
   * @param {number} id           — PipelineTask 主键 ID
   * @param {number} enterpriseId — 企业 ID（隔离校验）
   * @returns {Promise<Object|null>} PipelineTask instance 或 null
   */
  async getPipelineTask(id, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'PipelineTask ID is required', false);
    }
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    try {
      const task = await PipelineTask.findOne({
        where: {
          id,
          enterprise_id: enterpriseId
        }
      });

      return task;
    } catch (error) {
      console.error(
        `[PipelineTaskService] getPipelineTask FAILED | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'QUERY_FAILED',
        `Failed to query PipelineTask: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 3. 按 UUID 查询 PipelineTask
  // ───────────────────────────────────────────────────────────────────

  /**
   * 按 pipeline_uuid 查询 PipelineTask（企业隔离）
   *
   * @param {string} uuid         — PipelineTask pipeline_uuid
   * @param {number} enterpriseId — 企业 ID（隔离校验）
   * @returns {Promise<Object|null>} PipelineTask instance 或 null
   */
  async getPipelineTaskByUUID(uuid, enterpriseId) {
    if (!uuid || typeof uuid !== 'string') {
      throw new ProviderError('system', 'VALIDATION', 'PipelineTask UUID is required', false);
    }
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    try {
      const task = await PipelineTask.findOne({
        where: {
          pipeline_uuid: uuid,
          enterprise_id: enterpriseId
        }
      });

      return task;
    } catch (error) {
      console.error(
        `[PipelineTaskService] getPipelineTaskByUUID FAILED | ` +
        `uuid=${uuid} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'QUERY_FAILED',
        `Failed to query PipelineTask by UUID: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 4. 更新状态
  // ───────────────────────────────────────────────────────────────────

  /**
   * 更新 PipelineTask 状态
   *
   * 支持状态:
   *   pending, running, vision, script, tts, digital_human,
   *   success, failed, cancelled
   *
   * 禁止修改为不存在的状态。
   *
   * @param {number} id     — PipelineTask 主键 ID
   * @param {string} status — 新状态（必须在 VALID_STATUSES 中）
   * @param {Object} [extra] — 额外更新的字段（如 current_layer, started_at）
   * @param {number} [enterpriseId] — 企业 ID（可选；提供时按企业隔离校验，防止越权修改）
   * @returns {Promise<Object>} 更新后的 PipelineTask instance
   */
  async updateStatus(id, status, extra = {}, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'PipelineTask ID is required', false);
    }
    if (!status || !VALID_STATUSES.includes(status)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid status: "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
        false
      );
    }

    try {
      // Step4-E2 任务4：提供 enterpriseId 时按企业作用域查询（纵深防御）
      const where = { id };
      if (enterpriseId != null) where.enterprise_id = enterpriseId;
      const task = await PipelineTask.findOne({ where });
      if (!task) {
        throw new ProviderError(
          'system', 'NOT_FOUND',
          `PipelineTask id=${id} not found`,
          false
        );
      }

      const updateFields = { status };

      // 合并额外字段（白名单：current_layer, started_at, completed_at）
      if (extra.current_layer !== undefined) {
        updateFields.current_layer = extra.current_layer;
      }
      if (extra.started_at !== undefined) {
        updateFields.started_at = extra.started_at;
      }
      if (extra.completed_at !== undefined) {
        updateFields.completed_at = extra.completed_at;
      }

      await task.update(updateFields);

      console.log(
        `[PipelineTaskService] Status updated | ` +
        `id=${id} | status=${status} | ` +
        `extra=${JSON.stringify(Object.keys(extra))} | ` +
        `time=${new Date().toISOString()}`
      );

      return task;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[PipelineTaskService] updateStatus FAILED | ` +
        `id=${id} | status=${status} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'UPDATE_FAILED',
        `Failed to update PipelineTask status: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 5. 更新进度
  // ───────────────────────────────────────────────────────────────────

  /**
   * 更新 PipelineTask 进度
   *
   * 自动限制到 0-100 范围。
   *
   * @param {number} id       — PipelineTask 主键 ID
   * @param {number} progress — 进度值（会被 clamp 到 0-100）
   * @param {number} [enterpriseId] — 企业 ID（可选；提供时按企业隔离校验，防止越权修改）
   * @returns {Promise<Object>} 更新后的 PipelineTask instance
   */
  async updateProgress(id, progress, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'PipelineTask ID is required', false);
    }
    if (progress == null || typeof progress !== 'number') {
      throw new ProviderError('system', 'VALIDATION', 'Progress must be a number', false);
    }

    // 边界限制 0-100
    const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));

    try {
      // Step4-E2 任务4：提供 enterpriseId 时按企业作用域查询（纵深防御）
      const where = { id };
      if (enterpriseId != null) where.enterprise_id = enterpriseId;
      const task = await PipelineTask.findOne({ where });
      if (!task) {
        throw new ProviderError(
          'system', 'NOT_FOUND',
          `PipelineTask id=${id} not found`,
          false
        );
      }

      await task.update({ progress: clampedProgress });

      return task;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[PipelineTaskService] updateProgress FAILED | ` +
        `id=${id} | progress=${progress} | clamped=${clampedProgress} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'UPDATE_FAILED',
        `Failed to update PipelineTask progress: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 6. 保存中间结果
  // ───────────────────────────────────────────────────────────────────

  /**
   * 保存某层的中间结果到 intermediate_results JSON
   *
   * 合并策略:
   *   - 只更新指定 layer 的内容，不覆盖其他 layer
   *   - 如果 intermediate_results 为 null，初始化为 {}
   *   - 使用浅合并：`{ ...current, [layer]: result }`
   *
   * 合法 layer:
   *   'vision' | 'script' | 'tts' | 'dh'
   *
   * @param {number} id     — PipelineTask 主键 ID
   * @param {string} layer  — 层名称（vision | script | tts | dh）
   * @param {Object} result — 该层的结果数据
   * @param {number} [enterpriseId] — 企业 ID（可选；提供时按企业隔离校验，防止越权修改）
   * @returns {Promise<Object>} 更新后的 PipelineTask instance
   */
  async saveIntermediateResult(id, layer, result, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'PipelineTask ID is required', false);
    }
    if (!layer || !VALID_LAYERS.includes(layer)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid layer: "${layer}". Must be one of: ${VALID_LAYERS.join(', ')}`,
        false
      );
    }
    if (result === undefined || result === null) {
      throw new ProviderError('system', 'VALIDATION', 'Result data is required', false);
    }

    try {
      // Step4-E2 任务4：提供 enterpriseId 时按企业作用域查询（纵深防御）
      const where = { id };
      if (enterpriseId != null) where.enterprise_id = enterpriseId;
      const task = await PipelineTask.findOne({ where });
      if (!task) {
        throw new ProviderError(
          'system', 'NOT_FOUND',
          `PipelineTask id=${id} not found`,
          false
        );
      }

      // 解析当前 intermediate_results，若为 null 则初始化为 {}
      let current;
      try {
        current = task.intermediate_results
          ? JSON.parse(task.intermediate_results)
          : {};
      } catch (parseError) {
        console.warn(
          `[PipelineTaskService] intermediate_results parse warning, resetting to {} | ` +
          `id=${id} | error=${parseError.message}`
        );
        current = {};
      }

      // 合并：只更新指定 layer
      const updated = { ...current, [layer]: result };

      await task.update({
        intermediate_results: JSON.stringify(updated)
      });

      console.log(
        `[PipelineTaskService] Intermediate result saved | ` +
        `id=${id} | layer=${layer} | ` +
        `time=${new Date().toISOString()}`
      );

      return task;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[PipelineTaskService] saveIntermediateResult FAILED | ` +
        `id=${id} | layer=${layer} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'UPDATE_FAILED',
        `Failed to save intermediate result: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 7. 更新 Asset 关联
  // ───────────────────────────────────────────────────────────────────

  /**
   * 更新 PipelineTask 的 Asset 关联字段
   *
   * 支持字段:
   *   'audio_asset_id' — TTS 音频 Asset
   *   'output_asset_id' — 最终数字人视频 Asset
   *
   * @param {number} id    — PipelineTask 主键 ID
   * @param {string} field — 字段名: 'audio_asset_id' | 'output_asset_id'
   * @param {number} assetId — Asset 主键 ID
   * @param {number} [enterpriseId] — 企业 ID（可选；提供时按企业隔离校验，防止越权修改）
   * @returns {Promise<Object>} 更新后的 PipelineTask instance
   */
  async updateAssetId(id, field, assetId, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'PipelineTask ID is required', false);
    }

    const VALID_ASSET_FIELDS = ['audio_asset_id', 'output_asset_id'];
    if (!field || !VALID_ASSET_FIELDS.includes(field)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid asset field: "${field}". Must be one of: ${VALID_ASSET_FIELDS.join(', ')}`,
        false
      );
    }
    if (assetId == null || typeof assetId !== 'number' || assetId <= 0) {
      throw new ProviderError('system', 'VALIDATION', 'Valid Asset ID is required', false);
    }

    try {
      // Step4-E2 任务4：提供 enterpriseId 时按企业作用域查询（纵深防御）
      const where = { id };
      if (enterpriseId != null) where.enterprise_id = enterpriseId;
      const task = await PipelineTask.findOne({ where });
      if (!task) {
        throw new ProviderError(
          'system', 'NOT_FOUND',
          `PipelineTask id=${id} not found`,
          false
        );
      }

      await task.update({ [field]: assetId });

      console.log(
        `[PipelineTaskService] Asset ID updated | ` +
        `id=${id} | field=${field} | assetId=${assetId} | ` +
        `time=${new Date().toISOString()}`
      );

      return task;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[PipelineTaskService] updateAssetId FAILED | ` +
        `id=${id} | field=${field} | assetId=${assetId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'UPDATE_FAILED',
        `Failed to update PipelineTask asset ID: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 8. 记录失败信息（原 7）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 标记 PipelineTask 为失败
   *
   * 更新:
   *   - status = 'failed'
   *   - failed_layer = layer
   *   - error_msg = error (string)
   *   - completed_at = new Date()
   *
   * @param {number} id     — PipelineTask 主键 ID
   * @param {string} layer  — 失败的层名称（vision | script | tts | dh | null）
   * @param {string} error  — 错误描述信息
   * @param {number} [enterpriseId] — 企业 ID（可选；提供时按企业隔离校验，防止越权修改）
   * @returns {Promise<Object>} 更新后的 PipelineTask instance
   */
  async markFailed(id, layer, error, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'PipelineTask ID is required', false);
    }

    // layer 可选，但若提供则需校验
    if (layer && !VALID_LAYERS.includes(layer)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid failed_layer: "${layer}". Must be one of: ${VALID_LAYERS.join(', ')}`,
        false
      );
    }

    // error 转为字符串
    const errorMsg = error
      ? (typeof error === 'string' ? error : (error.message || JSON.stringify(error)))
      : 'Unknown error';

    try {
      // Step4-E2 任务4：提供 enterpriseId 时按企业作用域查询（纵深防御）
      const where = { id };
      if (enterpriseId != null) where.enterprise_id = enterpriseId;
      const task = await PipelineTask.findOne({ where });
      if (!task) {
        throw new ProviderError(
          'system', 'NOT_FOUND',
          `PipelineTask id=${id} not found`,
          false
        );
      }

      await task.update({
        status: 'failed',
        failed_layer: layer || null,
        error_msg: errorMsg,
        completed_at: new Date()
      });

      console.log(
        `[PipelineTaskService] PipelineTask marked as failed | ` +
        `id=${id} | failed_layer=${layer || 'N/A'} | ` +
        `error=${errorMsg.substring(0, 200)} | ` +
        `time=${new Date().toISOString()}`
      );

      return task;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[PipelineTaskService] markFailed FAILED | ` +
        `id=${id} | layer=${layer} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'UPDATE_FAILED',
        `Failed to mark PipelineTask as failed: ${error.message}`,
        false, null, error
      );
    }
  }
}

module.exports = new PipelineTaskService();
