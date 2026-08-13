/**
 * Avatar Controller — 数字人形象 API 控制器
 *
 * Phase DigitalHuman-Rebuild-004 Step5-C5
 *
 * 职责：
 *   1. 接收 HTTP 请求、解析并校验参数
 *   2. 读取 req.user.enterpriseId / req.user.userId（来自 JWT）
 *   3. 调用 avatarService 完成数据访问（不直接访问 Model）
 *   4. 返回统一响应信封（res.success / res.fail）
 *
 * 规则：
 *   - 官方数字人（enterprise_id IS NULL）禁止修改 / 删除（PUT/DELETE 预检 403）
 *   - POST 创建要求 image_url 必填
 *   - 禁止修改 avatar_uuid / enterprise_id / source
 *
 * 禁止范围：
 *   ❌ 直接访问 Model
 *   ❌ 调用 Provider / Pipeline / Orchestrator
 */

const avatarService = require('../../services/avatarService');

/**
 * Avatar 合法状态（对齐 Model status ENUM，列表 status 过滤白名单）
 */
const VALID_STATUSES = ['active', 'disabled'];

/**
 * 将 Avatar instance 格式化为最小安全响应对象（snake_case）
 *
 * 不返回 enterprise_id / user_id / asset_id / sort / deleted_at / updated_at，
 * 避免暴露租户内部字段。
 *
 * @param {Object} row - Avatar Sequelize instance
 * @returns {Object|null}
 */
function formatAvatar(row) {
  if (!row) return null;
  return {
    id: row.id,
    avatar_uuid: row.avatar_uuid,
    name: row.name,
    description: row.description || null,
    image_url: row.image_url || null,
    thumbnail_url: row.thumbnail_url || null,
    source: row.source,
    gender: row.gender,
    status: row.status,
    created_at: row.createdAt || null
  };
}

/**
 * GET /api/enterprise/avatars — 形象列表（官方 / 我的 双层目录）
 *
 * query: source(缺省 official)、status(逗号分隔 active,disabled)、page、pageSize
 */
exports.list = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const source = req.query.source;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));

    // status 逗号分隔 → 白名单过滤；全非法 → 400
    let statusFilter = null;
    if (req.query.status) {
      statusFilter = String(req.query.status)
        .split(',')
        .map(s => s.trim())
        .filter(s => VALID_STATUSES.includes(s));
      if (statusFilter.length === 0) {
        return res.fail('无效的状态筛选参数', 400);
      }
    }

    const { count, rows } = await avatarService.listAvatars({
      enterpriseId,
      source,
      statusFilter: statusFilter || undefined,
      page,
      pageSize
    });

    return res.success({
      total: count,
      page,
      pageSize,
      items: rows.map(formatAvatar)
    });
  } catch (error) {
    console.error(
      `[AvatarController] list ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      const code = error.code;
      if (code === 'VALIDATION') {
        return res.fail(error.message, 400);
      }
      const isInternalFailure =
        error.provider === 'system' &&
        typeof code === 'string' &&
        code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};

/**
 * GET /api/enterprise/avatars/:id — 形象详情
 *
 * 官方形象全局可见，我的形象仅本企业；不存在 / 越权统一 404。
 */
exports.detail = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const id = parseInt(req.params.id);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的形象 ID', 400);
    }

    const avatar = await avatarService.getAvatar(id, enterpriseId);
    if (!avatar) {
      return res.fail('形象不存在', 404);
    }

    return res.success(formatAvatar(avatar));
  } catch (error) {
    console.error(
      `[AvatarController] detail ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      const code = error.code;
      if (code === 'VALIDATION') {
        return res.fail(error.message, 400);
      }
      const isInternalFailure =
        error.provider === 'system' &&
        typeof code === 'string' &&
        code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};

/**
 * POST /api/enterprise/avatars — 创建「我的形象」
 *
 * body(snake_case)：name(必填)、image_url(必填)、asset_id、description、gender、thumbnail_url
 */
exports.create = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const userId = req.user.userId;
    const { name, image_url, asset_id, description, gender, thumbnail_url } = req.body;

    // ── 参数校验 ────────────────────────────────────────────────
    if (!name || !String(name).trim()) {
      return res.fail('形象名称不能为空', 400);
    }
    if (!image_url || !String(image_url).trim()) {
      return res.fail('形象图片不能为空', 400);
    }

    const avatar = await avatarService.createAvatar({
      enterpriseId,
      userId,
      name: String(name).trim(),
      imageUrl: String(image_url).trim(),
      assetId: asset_id,
      description,
      gender,
      thumbnailUrl: thumbnail_url
    });

    return res.success(formatAvatar(avatar));
  } catch (error) {
    console.error(
      `[AvatarController] create ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      const code = error.code;
      if (code === 'VALIDATION') {
        return res.fail(error.message, 400);
      }
      const isInternalFailure =
        error.provider === 'system' &&
        typeof code === 'string' &&
        code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};

/**
 * PUT /api/enterprise/avatars/:id — 更新「我的形象」（部分更新）
 *
 * 官方形象（enterprise_id IS NULL）禁止修改 → 403；
 * 不存在 / 他企业形象 → 404（不泄露存在性）。
 * body 字段由 Service 白名单过滤（name/description/image_url/thumbnail_url/asset_id/gender/status），
 * avatar_uuid / enterprise_id / source 不在白名单，天然禁止修改。
 */
exports.update = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const id = parseInt(req.params.id);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的形象 ID', 400);
    }

    // ── 预检：区分 404（不存在/他企业）与 403（官方形象）───────
    const existing = await avatarService.getAvatar(id, enterpriseId);
    if (!existing) {
      return res.fail('形象不存在', 404);
    }
    if (existing.enterprise_id === null) {
      return res.fail('无权操作该形象', 403);
    }

    const updated = await avatarService.updateAvatar(id, enterpriseId, req.body);

    return res.success(formatAvatar(updated));
  } catch (error) {
    console.error(
      `[AvatarController] update ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      const code = error.code;
      if (code === 'VALIDATION') {
        return res.fail(error.message, 400);
      }
      if (code === 'NOT_FOUND') {
        return res.fail('形象不存在', 404);
      }
      const isInternalFailure =
        error.provider === 'system' &&
        typeof code === 'string' &&
        code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};

/**
 * DELETE /api/enterprise/avatars/:id — 软删除「我的形象」
 *
 * 官方形象（enterprise_id IS NULL）禁止删除 → 403；
 * 不存在 / 他企业形象 → 404。
 */
exports.remove = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const id = parseInt(req.params.id);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的形象 ID', 400);
    }

    // ── 预检：区分 404（不存在/他企业）与 403（官方形象）───────
    const existing = await avatarService.getAvatar(id, enterpriseId);
    if (!existing) {
      return res.fail('形象不存在', 404);
    }
    if (existing.enterprise_id === null) {
      return res.fail('无权操作该形象', 403);
    }

    const deleted = await avatarService.softDeleteAvatar(id, enterpriseId);

    return res.success({ id: deleted.id, deleted_at: deleted.deleted_at }, '删除成功');
  } catch (error) {
    console.error(
      `[AvatarController] remove ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      const code = error.code;
      if (code === 'VALIDATION') {
        return res.fail(error.message, 400);
      }
      if (code === 'NOT_FOUND') {
        return res.fail('形象不存在', 404);
      }
      const isInternalFailure =
        error.provider === 'system' &&
        typeof code === 'string' &&
        code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};
