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
 *   - generate()（C8）经 scriptService.generateScript() 间接触发 AI 生成；其余 CRUD 方法不调用 AI
 *
 * 禁止范围：
 *   ❌ 直接访问 Model
 *   ❌ 调用 Provider / Pipeline / Orchestrator
 *   ❌ 直接调用脚本 Provider / 生成服务 / 流水线编排器（脚本生成由 scriptService.generateScript 承担）
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
 * AI 脚本生成合法风格（对齐 script-provider STYLES 枚举）
 */
const VALID_STYLES = ['professional', 'casual', 'energetic', 'warm'];

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
 * 将 AI 生成的 ScriptRecord instance 格式化为生成结果响应（snake_case ViewModel）
 *
 * 数据来源（对齐 Step5-C8 设计）：
 *   - script_record_id / total_words / status / created_at 取自 record
 *   - title / full_text / segments / estimated_duration / style 取自 structured_script（camelCase ScriptResult）
 *
 * structured_script 解析失败时沿用 formatScript 的容错：原样保留，title/full_text/estimated_duration
 * 分别兜底 record.title / record.full_script / record.estimated_duration。
 *
 * 不返回 enterprise_id / user_id / pipeline_task_id / episode_id / version / deleted_at / updated_at。
 *
 * @param {Object} record - ScriptRecord Sequelize instance
 * @returns {Object|null}
 */
function formatGeneratedScript(record) {
  if (!record) return null;

  let structured = null;
  if (record.structured_script != null) {
    try {
      structured = typeof record.structured_script === 'string'
        ? JSON.parse(record.structured_script)
        : record.structured_script;
    } catch (_) {
      structured = record.structured_script;
    }
  }

  const parsed = structured && typeof structured === 'object' ? structured : {};

  return {
    script_record_id: record.id,
    title: parsed.title != null ? parsed.title : (record.title || null),
    full_text: parsed.fullText != null ? parsed.fullText : (record.full_script || null),
    segments: Array.isArray(parsed.segments) ? parsed.segments : [],
    total_words: record.total_words != null ? record.total_words : 0,
    estimated_duration: parsed.estimatedDuration != null
      ? parsed.estimatedDuration
      : (record.estimated_duration != null ? record.estimated_duration : null),
    style: parsed.style != null ? parsed.style : null,
    status: record.status,
    created_at: record.createdAt || null
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
 * POST /api/enterprise/scripts/generate — AI 独立生成脚本（Step5-C8）
 *
 * body：theme(必填)、style(可选，默认 professional)、duration(可选，默认 30)、
 *   product_name(可选)、scene_context(可选)
 *
 * 身份仅取 req.user.enterpriseId / req.user.userId（禁止信任 body/query）。
 * 仅负责参数解析/校验、调用 scriptService.generateScript()、响应映射；不直连 Provider / Model。
 */
exports.generate = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const userId = req.user.userId;

    // ── theme 必填，trim 后非空 ────────────────────────────────
    const theme = typeof req.body.theme === 'string' ? req.body.theme.trim() : '';
    if (!theme) {
      return res.fail('脚本主题不能为空', 400);
    }

    // ── style 可选，默认 professional，须在 4 枚举内 ────────────
    const style = req.body.style || 'professional';
    if (!VALID_STYLES.includes(style)) {
      return res.fail('无效的脚本风格', 400);
    }

    // ── duration 可选，默认 30；若提供须为 1-300 整数 ───────────
    let duration = req.body.duration;
    if (duration !== undefined && duration !== null) {
      const parsed = Number(duration);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 300) {
        return res.fail('时长需在1-300秒之间', 400);
      }
      duration = parsed;
    }

    const productName = req.body.product_name;
    const sceneContext = req.body.scene_context;

    const record = await scriptService.generateScript({
      enterpriseId,
      userId,
      theme,
      style,
      duration,
      productName,
      sceneContext
    });

    return res.success(formatGeneratedScript(record));
  } catch (error) {
    console.error(
      `[ScriptController] generate ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      // VALIDATION → 400；其余（含 SCRIPT_FAILED / Provider 内部异常）→ 500 脱敏，不透传英文
      if (error.code === 'VALIDATION') {
        return res.fail(error.message, 400);
      }
      return res.fail('服务器内部错误', 500);
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
