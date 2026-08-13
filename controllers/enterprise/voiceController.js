/**
 * Voice Controller — 音色 API 控制器
 *
 * Phase DigitalHuman-Rebuild-004 Step5-C5
 *
 * 职责：
 *   1. 接收 HTTP 请求、解析并校验参数
 *   2. 读取 req.user.enterpriseId / req.user.userId（来自 JWT）
 *   3. 调用 voiceService 完成数据访问（不直接访问 Model）
 *   4. 返回统一响应信封（res.success / res.fail）
 *
 * 规则：
 *   - voice_key 必须由调用方提供，禁止写入默认值
 *   - 禁止出现废弃音色体系的默认 voice_key（不写入任何历史遗留默认音色 ID）
 *   - 禁止调用 TTS Provider（只管理音色数据，不做合成）
 *   - 系统音色（enterprise_id IS NULL）禁止修改 / 删除（PUT/DELETE 预检 403）
 *
 * 禁止范围：
 *   ❌ 直接访问 Model
 *   ❌ 调用 Provider / Pipeline / Orchestrator
 */

const voiceService = require('../../services/voiceService');

/**
 * Voice 合法状态（对齐 Model status ENUM，列表 status 过滤白名单）
 */
const VALID_STATUSES = ['active', 'disabled'];

/**
 * 将 Voice instance 格式化为最小安全响应对象（snake_case）
 *
 * 不返回 enterprise_id / user_id / sample_audio_asset_id / sort / deleted_at / updated_at，
 * 避免暴露租户内部字段。
 *
 * @param {Object} row - Voice Sequelize instance
 * @returns {Object|null}
 */
function formatVoice(row) {
  if (!row) return null;
  return {
    id: row.id,
    voice_uuid: row.voice_uuid,
    name: row.name,
    voice_key: row.voice_key,
    model_id: row.model_id || null,
    provider: row.provider,
    gender: row.gender,
    language: row.language,
    sample_audio_url: row.sample_audio_url || null,
    description: row.description || null,
    source: row.source,
    status: row.status,
    created_at: row.createdAt || null
  };
}

/**
 * GET /api/enterprise/voices — 音色列表（系统 / 我的 双层目录）
 *
 * query: source(缺省 system)、gender、status(逗号分隔 active,disabled)、page、pageSize
 */
exports.list = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const source = req.query.source;
    const gender = req.query.gender;
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

    const { count, rows } = await voiceService.listVoices({
      enterpriseId,
      source,
      gender,
      statusFilter: statusFilter || undefined,
      page,
      pageSize
    });

    return res.success({
      total: count,
      page,
      pageSize,
      items: rows.map(formatVoice)
    });
  } catch (error) {
    console.error(
      `[VoiceController] list ERROR | ` +
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
 * GET /api/enterprise/voices/:id — 音色详情
 *
 * 系统音色全局可见，我的声音仅本企业；不存在 / 越权统一 404。
 */
exports.detail = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const id = parseInt(req.params.id);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的音色 ID', 400);
    }

    const voice = await voiceService.getVoice(id, enterpriseId);
    if (!voice) {
      return res.fail('音色不存在', 404);
    }

    return res.success(formatVoice(voice));
  } catch (error) {
    console.error(
      `[VoiceController] detail ERROR | ` +
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
 * POST /api/enterprise/voices — 创建「我的声音」
 *
 * body(snake_case)：name(必填)、voice_key(必填，无默认)、model_id、provider、gender、
 *   language、sample_audio_url、sample_audio_asset_id、description
 */
exports.create = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const userId = req.user.userId;
    const {
      name,
      voice_key,
      model_id,
      provider,
      gender,
      language,
      sample_audio_url,
      sample_audio_asset_id,
      description
    } = req.body;

    // ── 参数校验 ────────────────────────────────────────────────
    if (!name || !String(name).trim()) {
      return res.fail('音色名称不能为空', 400);
    }
    if (!voice_key || !String(voice_key).trim()) {
      return res.fail('音色标识不能为空', 400);
    }

    const voice = await voiceService.createVoice({
      enterpriseId,
      userId,
      name: String(name).trim(),
      voiceKey: String(voice_key).trim(),
      modelId: model_id,
      provider,
      gender,
      language,
      sampleAudioUrl: sample_audio_url,
      sampleAudioAssetId: sample_audio_asset_id,
      description
    });

    return res.success(formatVoice(voice));
  } catch (error) {
    console.error(
      `[VoiceController] create ERROR | ` +
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
 * PUT /api/enterprise/voices/:id — 更新「我的声音」（部分更新）
 *
 * 系统音色（enterprise_id IS NULL）禁止修改 → 403；
 * 不存在 / 他企业声音 → 404（不泄露存在性）。
 * body 字段由 Service 白名单过滤（name/model_id/voice_key/gender/language/
 * sample_audio_url/sample_audio_asset_id/description/status）。
 */
exports.update = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const id = parseInt(req.params.id);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的音色 ID', 400);
    }

    // ── 预检：区分 404（不存在/他企业）与 403（系统音色）───────
    const existing = await voiceService.getVoice(id, enterpriseId);
    if (!existing) {
      return res.fail('音色不存在', 404);
    }
    if (existing.enterprise_id === null) {
      return res.fail('无权操作该音色', 403);
    }

    const updated = await voiceService.updateVoice(id, enterpriseId, req.body);

    return res.success(formatVoice(updated));
  } catch (error) {
    console.error(
      `[VoiceController] update ERROR | ` +
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
        return res.fail('音色不存在', 404);
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
 * DELETE /api/enterprise/voices/:id — 软删除「我的声音」
 *
 * 系统音色（enterprise_id IS NULL）禁止删除 → 403；
 * 不存在 / 他企业声音 → 404。
 */
exports.remove = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const id = parseInt(req.params.id);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的音色 ID', 400);
    }

    // ── 预检：区分 404（不存在/他企业）与 403（系统音色）───────
    const existing = await voiceService.getVoice(id, enterpriseId);
    if (!existing) {
      return res.fail('音色不存在', 404);
    }
    if (existing.enterprise_id === null) {
      return res.fail('无权操作该音色', 403);
    }

    const deleted = await voiceService.softDeleteVoice(id, enterpriseId);

    return res.success({ id: deleted.id, deleted_at: deleted.deleted_at }, '删除成功');
  } catch (error) {
    console.error(
      `[VoiceController] remove ERROR | ` +
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
        return res.fail('音色不存在', 404);
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
