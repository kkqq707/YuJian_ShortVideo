/**
 * Script Controller — 脚本草稿 API 控制器
 *
 * Phase DigitalHuman-Rebuild-004 Step5-C5
 *
 * 职责：
 *   1. 接收 HTTP 请求、解析并校验参数
 *   2. 读取 req.user.enterpriseId / req.user.userId（来自 JWT）
 *   3. 调用 scriptService 完成数据访问（不直接访问 Model）
 *   4. 返回统一响应信封（res.success / res.fail）
 *
 * 规则：
 *   - source_type 仅允许 pipeline / ai / manual，非法 → 400
 *   - 严格企业隔离（ScriptRecord.enterprise_id NOT NULL，无「全局」脚本）
 *   - 禁止调用 AI Provider / 生成脚本（不提供 /scripts/generate）
 *
 * 禁止范围：
 *   ❌ 直接访问 Model
 *   ❌ 调用 Provider / Pipeline / Orchestrator
 *   ❌ 调用脚本 Provider / 生成服务 / 流水线编排器（不生成脚本）
 */

const scriptService = require('../../services/scriptService');

/**
 * ScriptRecord 合法来源类型（对齐 Model source_type ENUM）
 */
const VALID_SOURCE_TYPES = ['pipeline', 'ai', 'manual'];

/**
 * ScriptRecord 合法状态（对齐 Model status ENUM，列表 status 过滤白名单）
 */
const VALID_STATUSES = ['draft', 'reviewed', 'approved', 'rejected'];

/**
 * 将 ScriptRecord instance 格式化为最小安全响应对象（snake_case）
 *
 * structured_script 为 TEXT 列存 JSON：字符串入参在响应中尝试 JSON.parse 返回对象，
 * 解析失败则原样返回字符串。
 *
 * 不返回 enterprise_id / user_id / pipeline_task_id / episode_id / version / deleted_at / updated_at。
 *
 * @param {Object} row - ScriptRecord Sequelize instance
 * @returns {Object|null}
 */
function formatScript(row) {
  if (!row) return null;

  let structuredScript = null;
  if (row.structured_script != null) {
    try {
      structuredScript = typeof row.structured_script === 'string'
        ? JSON.parse(row.structured_script)
        : row.structured_script;
    } catch (_) {
      structuredScript = row.structured_script;
    }
  }

  return {
    id: row.id,
    title: row.title || null,
    source_type: row.source_type,
    full_script: row.full_script || null,
    structured_script: structuredScript,
    estimated_duration: row.estimated_duration != null ? row.estimated_duration : null,
    total_words: row.total_words != null ? row.total_words : 0,
    status: row.status,
    created_at: row.createdAt || null
  };
}

/**
 * GET /api/enterprise/scripts — 脚本草稿列表（严格企业隔离）
 *
 * query: source_type(pipeline/ai/manual)、status(逗号分隔 draft/reviewed/approved/rejected)、page、pageSize
 */
exports.list = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const sourceType = req.query.source_type;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));

    // source_type 过滤：存在则校验枚举，非法 → 400
    if (sourceType && !VALID_SOURCE_TYPES.includes(sourceType)) {
      return res.fail('无效的来源类型', 400);
    }

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

    const { count, rows } = await scriptService.listScripts({
      enterpriseId,
      sourceType,
      statusFilter: statusFilter || undefined,
      page,
      pageSize
    });

    return res.success({
      total: count,
      page,
      pageSize,
      items: rows.map(formatScript)
    });
  } catch (error) {
    console.error(
      `[ScriptController] list ERROR | ` +
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
 * GET /api/enterprise/scripts/:id — 脚本草稿详情（严格企业隔离）
 */
exports.detail = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const id = parseInt(req.params.id);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的脚本 ID', 400);
    }

    const record = await scriptService.getScript(id, enterpriseId);
    if (!record) {
      return res.fail('脚本不存在', 404);
    }

    return res.success(formatScript(record));
  } catch (error) {
    console.error(
      `[ScriptController] detail ERROR | ` +
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
 * POST /api/enterprise/scripts — 创建脚本草稿（统一落库入口）
 *
 * body(snake_case)：source_type(必填，pipeline/ai/manual)、title、full_script、
 *   structured_script(对象/字符串)、pipeline_task_id、estimated_duration、total_words、
 *   character_count、scene_count、status
 *
 * 仅落库，不调用 AI Provider，不生成脚本。
 */
exports.create = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const userId = req.user.userId;
    const {
      source_type,
      title,
      full_script,
      structured_script,
      pipeline_task_id,
      estimated_duration,
      total_words,
      character_count,
      scene_count,
      status
    } = req.body;

    // ── 参数校验 ────────────────────────────────────────────────
    if (!source_type || !VALID_SOURCE_TYPES.includes(source_type)) {
      return res.fail('无效的来源类型', 400);
    }

    const record = await scriptService.createScript({
      enterpriseId,
      userId,
      sourceType: source_type,
      title,
      fullScript: full_script,
      structuredScript: structured_script,
      pipelineTaskId: pipeline_task_id,
      estimatedDuration: estimated_duration,
      totalWords: total_words,
      characterCount: character_count,
      sceneCount: scene_count,
      status
    });

    return res.success(formatScript(record));
  } catch (error) {
    console.error(
      `[ScriptController] create ERROR | ` +
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
 * PUT /api/enterprise/scripts/:id — 更新脚本草稿（部分更新，严格企业隔离）
 *
 * body 字段由 Service 白名单过滤（title/full_script/structured_script/status/
 * estimated_duration/total_words/source_type）。
 */
exports.update = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const id = parseInt(req.params.id);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的脚本 ID', 400);
    }

    // source_type 若提交则校验枚举，非法 → 400
    if (req.body.source_type && !VALID_SOURCE_TYPES.includes(req.body.source_type)) {
      return res.fail('无效的来源类型', 400);
    }

    const updated = await scriptService.updateScript(id, enterpriseId, req.body);

    return res.success(formatScript(updated));
  } catch (error) {
    console.error(
      `[ScriptController] update ERROR | ` +
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
        return res.fail('脚本不存在', 404);
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
 * DELETE /api/enterprise/scripts/:id — 软删除脚本草稿（严格企业隔离）
 */
exports.remove = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const id = parseInt(req.params.id);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的脚本 ID', 400);
    }

    const deleted = await scriptService.softDeleteScript(id, enterpriseId);

    return res.success({ id: deleted.id, deleted_at: deleted.deleted_at }, '删除成功');
  } catch (error) {
    console.error(
      `[ScriptController] remove ERROR | ` +
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
        return res.fail('脚本不存在', 404);
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
