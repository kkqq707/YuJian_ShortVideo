/**
 * Script Service — 脚本草稿数据访问层
 *
 * Phase DigitalHuman-Rebuild-004 Step5-C4
 *
 * 职责：
 *   1. 创建脚本草稿（统一落库入口，含 pipeline 内部落库与独立 AI/手写草稿）
 *   2. 查询脚本草稿（严格企业隔离）
 *   3. 更新脚本草稿（owned-only，部分更新 + 白名单）
 *   4. 软删除脚本草稿（deleted_at 置为当前时间）
 *
 * 关键差异（与 Avatar/Voice 双层目录不同）：
 *   - ScriptRecord.enterprise_id / user_id 均为 NOT NULL，无「全局」脚本概念
 *   - 所有查询严格 enterprise_id = enterpriseId
 *
 * 设计原则：
 *   - 纯数据访问层：只负责 ScriptRecord Model 的 create / findOne / findAndCountAll / update / 软删除
 *   - 不调用 script-provider（AI 生成逻辑属 C5 Controller + Provider，本 Service 只负责「生成结果落库」）
 *   - 使用 ProviderError 进行参数校验与错误包装
 *
 * 硬性红线：
 *   ❌ source_type 仅 pipeline / ai / manual，不得自行扩展枚举
 *   ❌ 不调用 script-provider / generationService / pipelineOrchestrator
 *   ❌ 不触碰 HTTP 参数解析、响应信封、路由、鉴权（属 C5 Controller / C6 Route）
 */

const { Op } = require('sequelize');
const { ScriptRecord } = require('../models');
const ProviderError = require('../utils/ProviderError');

/**
 * ScriptRecord 合法来源类型（对齐 Model source_type ENUM，不扩展）
 */
const VALID_SOURCE_TYPES = ['pipeline', 'ai', 'manual'];

/**
 * ScriptRecord 合法状态（对齐 Model status ENUM）
 */
const VALID_STATUSES = ['draft', 'reviewed', 'approved', 'rejected'];

class ScriptService {
  // ───────────────────────────────────────────────────────────────────
  // 1. 创建脚本草稿（统一落库入口）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 创建脚本草稿（统一落库入口）
   *
   * @param {Object}  params
   * @param {number}  params.enterpriseId      — 企业 ID（必填）
   * @param {number}  params.userId            — 用户 ID（必填）
   * @param {string}  params.sourceType        — 来源类型（必填：pipeline | ai | manual）
   * @param {string}  [params.title]           — 脚本标题
   * @param {string}  [params.fullScript]      — 完整脚本文本
   * @param {Object|string} [params.structuredScript] — 结构化脚本（对象 → JSON.stringify；字符串原样存）
   * @param {number}  [params.pipelineTaskId]  — 关联 PipelineTask ID（pipeline 场景）
   * @param {number}  [params.estimatedDuration] — 预估时长（秒，INTEGER）
   * @param {number}  [params.totalWords]      — 总字数
   * @param {number}  [params.characterCount]  — 角色数量
   * @param {number}  [params.sceneCount]      — 场景数量
   * @param {string}  [params.status]          — 状态（默认 'draft'）
   * @returns {Promise<Object>} 创建后的 ScriptRecord instance
   */
  async createScript(params) {
    const {
      enterpriseId,
      userId,
      sourceType,
      title,
      fullScript,
      structuredScript,
      pipelineTaskId,
      estimatedDuration,
      totalWords,
      characterCount,
      sceneCount,
      status
    } = params || {};

    // ── 参数校验 ────────────────────────────────────────────────
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }
    if (!userId) {
      throw new ProviderError('system', 'VALIDATION', 'User ID is required', false);
    }
    // 红线：source_type 仅 pipeline / ai / manual，非法值 → VALIDATION
    if (!sourceType || !VALID_SOURCE_TYPES.includes(sourceType)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid source_type: "${sourceType}". Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`,
        false
      );
    }
    if (status && !VALID_STATUSES.includes(status)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid status: "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
        false
      );
    }

    // structured_script 是 TEXT 列存 JSON：对象入参序列化，字符串原样存，空值存 null
    let structuredScriptJson = null;
    if (structuredScript != null) {
      structuredScriptJson = typeof structuredScript === 'string'
        ? structuredScript
        : JSON.stringify(structuredScript);
    }

    try {
      const record = await ScriptRecord.create({
        pipeline_task_id: pipelineTaskId || null,
        source_type: sourceType,
        episode_id: null,
        enterprise_id: enterpriseId,
        user_id: userId,
        title: title || null,
        full_script: fullScript || null,
        structured_script: structuredScriptJson,
        character_count: characterCount != null ? characterCount : 0,
        scene_count: sceneCount != null ? sceneCount : 0,
        estimated_duration: estimatedDuration != null ? estimatedDuration : null,
        total_words: totalWords != null ? totalWords : 0,
        version: 1,
        status: status || 'draft'
      });

      console.log(
        `[ScriptService] ScriptRecord created | ` +
        `id=${record.id} | sourceType=${sourceType} | ` +
        `enterpriseId=${enterpriseId} | userId=${userId} | ` +
        `pipelineTaskId=${pipelineTaskId || 'N/A'} | ` +
        `time=${new Date().toISOString()}`
      );

      return record;
    } catch (error) {
      console.error(
        `[ScriptService] createScript FAILED | ` +
        `sourceType=${sourceType} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'CREATE_FAILED',
        `Failed to create ScriptRecord: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 2. 详情查询（严格企业隔离）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 按主键 ID 查询脚本草稿（严格企业隔离）
   *
   * @param {number} id           — ScriptRecord 主键 ID
   * @param {number} enterpriseId — 企业 ID（隔离校验）
   * @returns {Promise<Object|null>} ScriptRecord instance 或 null
   */
  async getScript(id, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'Script ID is required', false);
    }
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    try {
      const record = await ScriptRecord.findOne({
        where: { id, enterprise_id: enterpriseId, deleted_at: null }
      });

      return record;
    } catch (error) {
      console.error(
        `[ScriptService] getScript FAILED | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'QUERY_FAILED',
        `Failed to query ScriptRecord: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 3. 列表查询（严格企业隔离）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 查询脚本草稿列表（严格企业隔离）
   *
   * @param {Object}   params
   * @param {number}   params.enterpriseId  — 企业 ID（必填）
   * @param {string}   [params.sourceType]  — 来源类型过滤（pipeline/ai/manual）
   * @param {string[]} [params.statusFilter]— 状态过滤（string[]，已由 Controller 校验合法性）
   * @param {number}   [params.page]        — 页码（默认 1）
   * @param {number}   [params.pageSize]    — 每页条数（默认 20）
   * @returns {Promise<{count: number, rows: Object[]}>} { count, rows }
   */
  async listScripts({ enterpriseId, sourceType, statusFilter, page, pageSize } = {}) {
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    const where = { enterprise_id: enterpriseId, deleted_at: null };

    if (sourceType) {
      if (!VALID_SOURCE_TYPES.includes(sourceType)) {
        throw new ProviderError(
          'system', 'VALIDATION',
          `Invalid source_type: "${sourceType}". Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`,
          false
        );
      }
      where.source_type = sourceType;
    }

    if (statusFilter && statusFilter.length > 0) {
      where.status = statusFilter.length === 1 ? statusFilter[0] : { [Op.in]: statusFilter };
    }

    const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
    const safePageSize = Number.isInteger(pageSize) && pageSize >= 1 ? pageSize : 20;

    try {
      const { count, rows } = await ScriptRecord.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        offset: (safePage - 1) * safePageSize,
        limit: safePageSize
      });

      console.log(
        `[ScriptService] listScripts | ` +
        `enterpriseId=${enterpriseId} | count=${count} | ` +
        `sourceType=${sourceType || 'N/A'} | ` +
        `time=${new Date().toISOString()}`
      );

      return { count, rows };
    } catch (error) {
      console.error(
        `[ScriptService] listScripts FAILED | ` +
        `enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'QUERY_FAILED',
        `Failed to list ScriptRecords: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 4. 更新脚本草稿（部分更新）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 更新脚本草稿（owned-only，严格企业隔离）
   *
   * 字段白名单（仅模型真实字段）：title / full_script / structured_script / status /
   *   estimated_duration / total_words / source_type
   *
   * @param {number} id           — ScriptRecord 主键 ID
   * @param {number} enterpriseId — 企业 ID（隔离校验）
   * @param {Object} fields       — 待更新字段（部分更新）
   * @returns {Promise<Object>} 更新后的 ScriptRecord instance
   */
  async updateScript(id, enterpriseId, fields) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'Script ID is required', false);
    }
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    const input = fields || {};

    if (input.source_type && !VALID_SOURCE_TYPES.includes(input.source_type)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid source_type: "${input.source_type}". Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`,
        false
      );
    }
    if (input.status && !VALID_STATUSES.includes(input.status)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid status: "${input.status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
        false
      );
    }

    try {
      const record = await ScriptRecord.findOne({
        where: { id, enterprise_id: enterpriseId, deleted_at: null }
      });
      if (!record) {
        throw new ProviderError('system', 'NOT_FOUND', `ScriptRecord id=${id} not found`, false);
      }

      const updateFields = {};
      const whitelist = [
        'title',
        'full_script',
        'structured_script',
        'status',
        'estimated_duration',
        'total_words',
        'source_type'
      ];
      for (const field of whitelist) {
        if (input[field] !== undefined) {
          updateFields[field] = input[field];
        }
      }

      // structured_script 是 TEXT 列存 JSON：对象入参序列化
      if (input.structured_script != null) {
        updateFields.structured_script = typeof input.structured_script === 'string'
          ? input.structured_script
          : JSON.stringify(input.structured_script);
      }

      await record.update(updateFields);

      console.log(
        `[ScriptService] ScriptRecord updated | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `fields=${JSON.stringify(Object.keys(updateFields))} | ` +
        `time=${new Date().toISOString()}`
      );

      return record;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[ScriptService] updateScript FAILED | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'UPDATE_FAILED',
        `Failed to update ScriptRecord: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 5. 软删除脚本草稿
  // ───────────────────────────────────────────────────────────────────

  /**
   * 软删除脚本草稿（owned-only，置 deleted_at）
   *
   * @param {number} id           — ScriptRecord 主键 ID
   * @param {number} enterpriseId — 企业 ID（隔离校验）
   * @returns {Promise<Object>} 软删除后的 ScriptRecord instance
   */
  async softDeleteScript(id, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'Script ID is required', false);
    }
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    try {
      const record = await ScriptRecord.findOne({
        where: { id, enterprise_id: enterpriseId, deleted_at: null }
      });
      if (!record) {
        throw new ProviderError('system', 'NOT_FOUND', `ScriptRecord id=${id} not found`, false);
      }

      await record.update({ deleted_at: new Date() });

      console.log(
        `[ScriptService] ScriptRecord soft-deleted | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `time=${new Date().toISOString()}`
      );

      return record;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[ScriptService] softDeleteScript FAILED | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'DELETE_FAILED',
        `Failed to soft-delete ScriptRecord: ${error.message}`,
        false, null, error
      );
    }
  }
}

module.exports = new ScriptService();
