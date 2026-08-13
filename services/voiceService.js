/**
 * Voice Service — 音色数据访问层
 *
 * Phase DigitalHuman-Rebuild-004 Step5-C4
 *
 * 职责：
 *   1. 系统音色（enterprise_id IS NULL）与我的声音（enterprise_id = 企业）双层目录查询
 *   2. 创建「我的声音」（source 固定 'custom'，voice_key 由调用方提供，voice_uuid 用 crypto.randomUUID()）
 *   3. 更新「我的声音」（owned-only，部分更新 + 白名单）
 *   4. 软删除「我的声音」（deleted_at 置为当前时间；系统音色不删除仅 disabled，由 Controller 403 保护）
 *
 * 设计原则：
 *   - 纯数据访问层：只负责 Voice Model 的 create / findOne / findAndCountAll / update / 软删除
 *   - 不调用 TTS Provider / Pipeline / Orchestrator / OSS / Asset 创建 / 审核 / 积分 / 权限
 *   - 使用 ProviderError 进行参数校验与错误包装
 *
 * 硬性红线：
 *   ❌ 禁止自动生成 / 写入默认 voice_key（voice_key 必须由调用方提供）
 *   ❌ 禁止使用任何废弃音色体系的默认 voice_key（历史遗留的废弃音色 ID 一律不得写入）
 *   ❌ 禁止调用 TTS Provider（本 Service 只管理音色数据，不做合成）
 *   ❌ 不创建 source='system'（系统音色由种子注入，本 Service 硬编码 'custom' 作数据面兜底）
 */

const crypto = require('crypto');
const { Op } = require('sequelize');
const { Voice } = require('../models');
const ProviderError = require('../utils/ProviderError');

/**
 * Voice 合法来源（对齐 Model source ENUM）
 */
const VALID_SOURCES = ['system', 'custom'];

/**
 * Voice 合法性别（对齐 Model gender ENUM）
 */
const VALID_GENDERS = ['male', 'female', 'unknown'];

/**
 * Voice 合法状态（对齐 Model status ENUM）
 */
const VALID_STATUSES = ['active', 'disabled'];

class VoiceService {
  // ───────────────────────────────────────────────────────────────────
  // 1. 列表查询（系统音色 / 我的声音 双层目录）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 查询 Voice 列表（系统音色 / 我的声音）
   *
   * @param {Object}   params
   * @param {number}   params.enterpriseId  — 企业 ID（source='custom' 时必填）
   * @param {string}   [params.source]      — 目录来源：'system'（默认，全局）| 'custom'（我的）
   * @param {string}   [params.gender]      — 性别过滤（male/female/unknown）
   * @param {string[]} [params.statusFilter]— 状态过滤（string[]，已由 Controller 校验合法性）
   * @param {number}   [params.page]        — 页码（默认 1）
   * @param {number}   [params.pageSize]    — 每页条数（默认 20）
   * @returns {Promise<{count: number, rows: Object[]}>} { count, rows }
   */
  async listVoices({ enterpriseId, source, gender, statusFilter, page, pageSize } = {}) {
    const dirSource = source || 'system';

    if (!VALID_SOURCES.includes(dirSource)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid source: "${dirSource}". Must be one of: ${VALID_SOURCES.join(', ')}`,
        false
      );
    }
    if (dirSource === 'custom' && !enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    // 双层目录：system = 全局（enterprise_id IS NULL）；custom = 我的（enterprise_id = 企业）
    const where = dirSource === 'system'
      ? { enterprise_id: null, source: 'system', deleted_at: null }
      : { enterprise_id: enterpriseId, source: 'custom', deleted_at: null };

    if (gender) {
      if (!VALID_GENDERS.includes(gender)) {
        throw new ProviderError(
          'system', 'VALIDATION',
          `Invalid gender: "${gender}". Must be one of: ${VALID_GENDERS.join(', ')}`,
          false
        );
      }
      where.gender = gender;
    }

    if (statusFilter && statusFilter.length > 0) {
      where.status = statusFilter.length === 1 ? statusFilter[0] : { [Op.in]: statusFilter };
    }

    const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
    const safePageSize = Number.isInteger(pageSize) && pageSize >= 1 ? pageSize : 20;

    try {
      const { count, rows } = await Voice.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        offset: (safePage - 1) * safePageSize,
        limit: safePageSize
      });

      console.log(
        `[VoiceService] listVoices | ` +
        `source=${dirSource} | count=${count} | ` +
        `enterpriseId=${enterpriseId || 'N/A'} | ` +
        `time=${new Date().toISOString()}`
      );

      return { count, rows };
    } catch (error) {
      console.error(
        `[VoiceService] listVoices FAILED | ` +
        `source=${dirSource} | enterpriseId=${enterpriseId || 'N/A'} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'QUERY_FAILED',
        `Failed to list Voices: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 2. 详情查询（系统全局 + 我的）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 按主键 ID 查询 Voice 详情（系统音色全局可见 + 本企业声音）
   *
   * 越权（他企业声音）落在 Op.or 范围之外 → 返回 null（由 Controller 归一为 404，不泄露存在性）
   *
   * @param {number} id           — Voice 主键 ID
   * @param {number} enterpriseId — 企业 ID
   * @returns {Promise<Object|null>} Voice instance 或 null
   */
  async getVoice(id, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'Voice ID is required', false);
    }
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    try {
      const voice = await Voice.findOne({
        where: {
          id,
          deleted_at: null,
          [Op.or]: [
            { enterprise_id: enterpriseId },
            { enterprise_id: null }
          ]
        }
      });

      return voice;
    } catch (error) {
      console.error(
        `[VoiceService] getVoice FAILED | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'QUERY_FAILED',
        `Failed to query Voice: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 3. 创建「我的声音」
  // ───────────────────────────────────────────────────────────────────

  /**
   * 创建「我的声音」（source 固定 'custom'）
   *
   * @param {Object}  params
   * @param {number}  params.enterpriseId        — 企业 ID（必填）
   * @param {number}  params.userId              — 用户 ID（必填）
   * @param {string}  params.name                — 音色展示名（必填）
   * @param {string}  params.voiceKey            — Provider 音色 ID（必填，由调用方提供）
   * @param {string}  [params.modelId]           — 归属 TTS 模型 ID
   * @param {string}  [params.provider]          — 提供方（默认 'aliyun'）
   * @param {string}  [params.gender]            — 音色性别（male/female/unknown）
   * @param {string}  [params.language]          — 语言（默认 'zh'）
   * @param {string}  [params.sampleAudioUrl]    — 试听音频 URL
   * @param {number}  [params.sampleAudioAssetId]— 试听音频关联 Asset ID
   * @param {string}  [params.description]       — 描述
   * @returns {Promise<Object>} 创建后的 Voice instance
   */
  async createVoice(params) {
    const {
      enterpriseId,
      userId,
      name,
      voiceKey,
      modelId,
      provider,
      gender,
      language,
      sampleAudioUrl,
      sampleAudioAssetId,
      description
    } = params || {};

    // ── 参数校验 ────────────────────────────────────────────────
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }
    if (!userId) {
      throw new ProviderError('system', 'VALIDATION', 'User ID is required', false);
    }
    if (!name || !String(name).trim()) {
      throw new ProviderError('system', 'VALIDATION', '音色名称不能为空', false);
    }
    // 红线：voice_key 必须由调用方提供，禁止自动生成 / 写入默认值
    if (!voiceKey || !String(voiceKey).trim()) {
      throw new ProviderError('system', 'VALIDATION', '音色标识不能为空', false);
    }
    if (gender && !VALID_GENDERS.includes(gender)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid gender: "${gender}". Must be one of: ${VALID_GENDERS.join(', ')}`,
        false
      );
    }

    // 生成对外唯一标识（主流约定：Node 内置 crypto.randomUUID()）
    const voiceUuid = crypto.randomUUID();

    try {
      const voice = await Voice.create({
        voice_uuid: voiceUuid,
        enterprise_id: enterpriseId,
        user_id: userId,
        name,
        voice_key: voiceKey,
        model_id: modelId || null,
        provider: provider || 'aliyun',
        gender: gender || 'unknown',
        language: language || 'zh',
        sample_audio_url: sampleAudioUrl || null,
        sample_audio_asset_id: sampleAudioAssetId || null,
        source: 'custom',            // 数据面兜底：禁止创建系统音色
        status: 'active',
        description: description || null,
        sort: 0
      });

      console.log(
        `[VoiceService] Voice created | ` +
        `id=${voice.id} | uuid=${voiceUuid} | ` +
        `enterpriseId=${enterpriseId} | userId=${userId} | ` +
        `time=${new Date().toISOString()}`
      );

      return voice;
    } catch (error) {
      console.error(
        `[VoiceService] createVoice FAILED | ` +
        `enterpriseId=${enterpriseId} | userId=${userId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'CREATE_FAILED',
        `Failed to create Voice: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 4. 更新「我的声音」（部分更新）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 更新「我的声音」（owned-only，天然排除系统音色与他企业声音）
   *
   * 字段白名单（仅模型真实字段）：name / model_id / voice_key / gender / language /
   *   sample_audio_url / sample_audio_asset_id / description / status
   *
   * @param {number} id           — Voice 主键 ID
   * @param {number} enterpriseId — 企业 ID（隔离校验）
   * @param {Object} fields       — 待更新字段（部分更新）
   * @returns {Promise<Object>} 更新后的 Voice instance
   */
  async updateVoice(id, enterpriseId, fields) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'Voice ID is required', false);
    }
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    const input = fields || {};

    if (input.gender && !VALID_GENDERS.includes(input.gender)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid gender: "${input.gender}". Must be one of: ${VALID_GENDERS.join(', ')}`,
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
      const voice = await Voice.findOne({
        where: { id, enterprise_id: enterpriseId, deleted_at: null }
      });
      if (!voice) {
        throw new ProviderError('system', 'NOT_FOUND', `Voice id=${id} not found`, false);
      }

      const updateFields = {};
      const whitelist = [
        'name',
        'model_id',
        'voice_key',
        'gender',
        'language',
        'sample_audio_url',
        'sample_audio_asset_id',
        'description',
        'status'
      ];
      for (const field of whitelist) {
        if (input[field] !== undefined) {
          updateFields[field] = input[field];
        }
      }

      await voice.update(updateFields);

      console.log(
        `[VoiceService] Voice updated | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `fields=${JSON.stringify(Object.keys(updateFields))} | ` +
        `time=${new Date().toISOString()}`
      );

      return voice;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[VoiceService] updateVoice FAILED | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'UPDATE_FAILED',
        `Failed to update Voice: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 5. 软删除「我的声音」
  // ───────────────────────────────────────────────────────────────────

  /**
   * 软删除「我的声音」（owned-only，置 deleted_at；系统音色不删除仅 disabled，由 Controller 403 保护）
   *
   * @param {number} id           — Voice 主键 ID
   * @param {number} enterpriseId — 企业 ID（隔离校验）
   * @returns {Promise<Object>} 软删除后的 Voice instance
   */
  async softDeleteVoice(id, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'Voice ID is required', false);
    }
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    try {
      const voice = await Voice.findOne({
        where: { id, enterprise_id: enterpriseId, deleted_at: null }
      });
      if (!voice) {
        throw new ProviderError('system', 'NOT_FOUND', `Voice id=${id} not found`, false);
      }

      await voice.update({ deleted_at: new Date() });

      console.log(
        `[VoiceService] Voice soft-deleted | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `time=${new Date().toISOString()}`
      );

      return voice;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[VoiceService] softDeleteVoice FAILED | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'DELETE_FAILED',
        `Failed to soft-delete Voice: ${error.message}`,
        false, null, error
      );
    }
  }
}

module.exports = new VoiceService();
