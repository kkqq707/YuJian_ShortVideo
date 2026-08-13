/**
 * Avatar Service — 数字人形象数据访问层
 *
 * Phase DigitalHuman-Rebuild-004 Step5-C4
 *
 * 职责：
 *   1. 官方形象（enterprise_id IS NULL）与我的形象（enterprise_id = 企业）双层目录查询
 *   2. 创建「我的形象」（source 固定 'uploaded'，avatar_uuid 用 crypto.randomUUID()）
 *   3. 更新「我的形象」（owned-only，部分更新 + 白名单）
 *   4. 软删除「我的形象」（deleted_at 置为当前时间；官方形象不删除仅 disabled，由 Controller 403 保护）
 *
 * 设计原则：
 *   - 纯数据访问层：只负责 Avatar Model 的 create / findOne / findAndCountAll / update / 软删除
 *   - 不调用 Provider / Pipeline / Orchestrator / OSS / Asset 创建 / 审核 / 积分 / 权限
 *   - 统一企业隔离（get/update/delete 均以 owned-only 或 Op.or 明确范围）
 *   - 使用 ProviderError 进行参数校验与错误包装
 *
 * 禁止范围：
 *   ❌ 不创建 source='official'（官方形象由种子注入，本 Service 硬编码 'uploaded' 作数据面兜底）
 *   ❌ 不调用 digital-human-provider / generationService / pipelineOrchestrator
 *   ❌ 不触碰 HTTP 参数解析、响应信封、路由、鉴权（属 C5 Controller / C6 Route）
 */

const crypto = require('crypto');
const { Op } = require('sequelize');
const { Avatar } = require('../models');
const ProviderError = require('../utils/ProviderError');

/**
 * Avatar 合法来源（对齐 Model source ENUM）
 */
const VALID_SOURCES = ['official', 'uploaded'];

/**
 * Avatar 合法性别（对齐 Model gender ENUM）
 */
const VALID_GENDERS = ['male', 'female', 'unknown'];

/**
 * Avatar 合法状态（对齐 Model status ENUM）
 */
const VALID_STATUSES = ['active', 'disabled'];

class AvatarService {
  // ───────────────────────────────────────────────────────────────────
  // 1. 列表查询（官方 / 我的 双层目录）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 查询 Avatar 列表（官方形象 / 我的形象）
   *
   * @param {Object}   params
   * @param {number}   params.enterpriseId  — 企业 ID（source='uploaded' 时必填）
   * @param {string}   [params.source]      — 目录来源：'official'（默认，全局）| 'uploaded'（我的）
   * @param {string[]} [params.statusFilter]— 状态过滤（string[]，已由 Controller 校验合法性）
   * @param {number}   [params.page]        — 页码（默认 1）
   * @param {number}   [params.pageSize]    — 每页条数（默认 20）
   * @returns {Promise<{count: number, rows: Object[]}>} { count, rows }
   */
  async listAvatars({ enterpriseId, source, statusFilter, page, pageSize } = {}) {
    const dirSource = source || 'official';

    if (!VALID_SOURCES.includes(dirSource)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid source: "${dirSource}". Must be one of: ${VALID_SOURCES.join(', ')}`,
        false
      );
    }
    if (dirSource === 'uploaded' && !enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    // 双层目录：official = 全局（enterprise_id IS NULL）；uploaded = 我的（enterprise_id = 企业）
    const where = dirSource === 'official'
      ? { enterprise_id: null, source: 'official', deleted_at: null }
      : { enterprise_id: enterpriseId, source: 'uploaded', deleted_at: null };

    if (statusFilter && statusFilter.length > 0) {
      where.status = statusFilter.length === 1 ? statusFilter[0] : { [Op.in]: statusFilter };
    }

    const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
    const safePageSize = Number.isInteger(pageSize) && pageSize >= 1 ? pageSize : 20;

    try {
      const { count, rows } = await Avatar.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        offset: (safePage - 1) * safePageSize,
        limit: safePageSize
      });

      console.log(
        `[AvatarService] listAvatars | ` +
        `source=${dirSource} | count=${count} | ` +
        `enterpriseId=${enterpriseId || 'N/A'} | ` +
        `time=${new Date().toISOString()}`
      );

      return { count, rows };
    } catch (error) {
      console.error(
        `[AvatarService] listAvatars FAILED | ` +
        `source=${dirSource} | enterpriseId=${enterpriseId || 'N/A'} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'QUERY_FAILED',
        `Failed to list Avatars: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 2. 详情查询（官方全局 + 我的）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 按主键 ID 查询 Avatar 详情（官方形象全局可见 + 本企业形象）
   *
   * 越权（他企业形象）落在 Op.or 范围之外 → 返回 null（由 Controller 归一为 404，不泄露存在性）
   *
   * @param {number} id           — Avatar 主键 ID
   * @param {number} enterpriseId — 企业 ID
   * @returns {Promise<Object|null>} Avatar instance 或 null
   */
  async getAvatar(id, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'Avatar ID is required', false);
    }
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    try {
      const avatar = await Avatar.findOne({
        where: {
          id,
          deleted_at: null,
          [Op.or]: [
            { enterprise_id: enterpriseId },
            { enterprise_id: null }
          ]
        }
      });

      return avatar;
    } catch (error) {
      console.error(
        `[AvatarService] getAvatar FAILED | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'QUERY_FAILED',
        `Failed to query Avatar: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 3. 创建「我的形象」
  // ───────────────────────────────────────────────────────────────────

  /**
   * 创建「我的形象」（source 固定 'uploaded'）
   *
   * @param {Object}  params
   * @param {number}  params.enterpriseId  — 企业 ID（必填）
   * @param {number}  params.userId        — 用户 ID（必填）
   * @param {string}  params.name          — 形象名称（必填）
   * @param {string}  [params.imageUrl]    — 形象主图 URL（与 assetId 二选一必填）
   * @param {number}  [params.assetId]     — 关联素材 ID（与 imageUrl 二选一必填）
   * @param {string}  [params.description] — 形象描述
   * @param {string}  [params.gender]      — 性别（male/female/unknown）
   * @param {string}  [params.thumbnailUrl]— 缩略图 URL
   * @returns {Promise<Object>} 创建后的 Avatar instance
   */
  async createAvatar(params) {
    const {
      enterpriseId,
      userId,
      name,
      imageUrl,
      assetId,
      description,
      gender,
      thumbnailUrl
    } = params || {};

    // ── 参数校验 ────────────────────────────────────────────────
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }
    if (!userId) {
      throw new ProviderError('system', 'VALIDATION', 'User ID is required', false);
    }
    if (!name || !String(name).trim()) {
      throw new ProviderError('system', 'VALIDATION', '形象名称不能为空', false);
    }
    // 契约 §4.5：image_url 与 asset_id 二选一必填；两者都给时以 image_url 为准
    if (!imageUrl && !assetId) {
      throw new ProviderError('system', 'VALIDATION', '形象图片不能为空', false);
    }
    if (gender && !VALID_GENDERS.includes(gender)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid gender: "${gender}". Must be one of: ${VALID_GENDERS.join(', ')}`,
        false
      );
    }

    // 生成对外唯一标识（主流约定：Node 内置 crypto.randomUUID()）
    const avatarUuid = crypto.randomUUID();

    try {
      const avatar = await Avatar.create({
        avatar_uuid: avatarUuid,
        enterprise_id: enterpriseId,
        user_id: userId,
        name,
        description: description || null,
        image_url: imageUrl || null,
        thumbnail_url: thumbnailUrl || null,
        asset_id: assetId || null,
        source: 'uploaded',          // 数据面兜底：禁止创建官方形象
        gender: gender || 'unknown',
        status: 'active',
        sort: 0
      });

      console.log(
        `[AvatarService] Avatar created | ` +
        `id=${avatar.id} | uuid=${avatarUuid} | ` +
        `enterpriseId=${enterpriseId} | userId=${userId} | ` +
        `time=${new Date().toISOString()}`
      );

      return avatar;
    } catch (error) {
      console.error(
        `[AvatarService] createAvatar FAILED | ` +
        `enterpriseId=${enterpriseId} | userId=${userId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'CREATE_FAILED',
        `Failed to create Avatar: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 4. 更新「我的形象」（部分更新）
  // ───────────────────────────────────────────────────────────────────

  /**
   * 更新「我的形象」（owned-only，天然排除官方形象与他企业形象）
   *
   * 字段白名单（仅模型真实字段）：name / description / image_url / thumbnail_url / asset_id / gender / status
   *
   * @param {number} id           — Avatar 主键 ID
   * @param {number} enterpriseId — 企业 ID（隔离校验）
   * @param {Object} fields       — 待更新字段（部分更新）
   * @returns {Promise<Object>} 更新后的 Avatar instance
   */
  async updateAvatar(id, enterpriseId, fields) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'Avatar ID is required', false);
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
      const avatar = await Avatar.findOne({
        where: { id, enterprise_id: enterpriseId, deleted_at: null }
      });
      if (!avatar) {
        throw new ProviderError('system', 'NOT_FOUND', `Avatar id=${id} not found`, false);
      }

      const updateFields = {};
      const whitelist = ['name', 'description', 'image_url', 'thumbnail_url', 'asset_id', 'gender', 'status'];
      for (const field of whitelist) {
        if (input[field] !== undefined) {
          updateFields[field] = input[field];
        }
      }

      await avatar.update(updateFields);

      console.log(
        `[AvatarService] Avatar updated | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `fields=${JSON.stringify(Object.keys(updateFields))} | ` +
        `time=${new Date().toISOString()}`
      );

      return avatar;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[AvatarService] updateAvatar FAILED | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'UPDATE_FAILED',
        `Failed to update Avatar: ${error.message}`,
        false, null, error
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 5. 软删除「我的形象」
  // ───────────────────────────────────────────────────────────────────

  /**
   * 软删除「我的形象」（owned-only，置 deleted_at；官方形象不删除仅 disabled，由 Controller 403 保护）
   *
   * @param {number} id           — Avatar 主键 ID
   * @param {number} enterpriseId — 企业 ID（隔离校验）
   * @returns {Promise<Object>} 软删除后的 Avatar instance
   */
  async softDeleteAvatar(id, enterpriseId) {
    if (!id) {
      throw new ProviderError('system', 'VALIDATION', 'Avatar ID is required', false);
    }
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }

    try {
      const avatar = await Avatar.findOne({
        where: { id, enterprise_id: enterpriseId, deleted_at: null }
      });
      if (!avatar) {
        throw new ProviderError('system', 'NOT_FOUND', `Avatar id=${id} not found`, false);
      }

      await avatar.update({ deleted_at: new Date() });

      console.log(
        `[AvatarService] Avatar soft-deleted | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `time=${new Date().toISOString()}`
      );

      return avatar;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error(
        `[AvatarService] softDeleteAvatar FAILED | ` +
        `id=${id} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'DELETE_FAILED',
        `Failed to soft-delete Avatar: ${error.message}`,
        false, null, error
      );
    }
  }
}

module.exports = new AvatarService();
