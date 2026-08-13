/**
 * PipelineController — 数字人流水线 API 接入层
 *
 * Phase DigitalHuman-Rebuild-004 Step4-D4
 *
 * 职责：
 *   1. 接收 HTTP 请求，参数校验
 *   2. 调用 pipelineTaskService 管理任务生命周期
 *   3. 启动 pipelineOrchestrator 异步执行流水线
 *   4. 返回标准 JSON 响应
 *
 * 依赖：
 *   - pipelineTaskService   — PipelineTask CRUD
 *   - pipelineOrchestrator   — 流水线编排执行
 *
 * 安全策略：
 *   - enterprise_id 隔离：所有查询限定 enterprise_id（来自 JWT）
 *   - 参数校验：必填字段在 Controller 层拦截
 *   - 错误信息脱敏：不暴露内部堆栈
 *   - 禁止输出 API Key、用户完整内容、音频/视频内容
 *
 * 禁止范围：
 *   ❌ 直接调用 generationService / Provider / Model
 *   ❌ Asset 创建 / OSS 操作
 *   ❌ 等待流水线完成（异步执行）
 *   ❌ 数据库直接操作（通过 Service 层）
 */

const pipelineTaskService = require('../services/pipelineTaskService');
const pipelineOrchestrator = require('../services/pipelineOrchestrator');
const pipelineObservabilityService = require('../services/pipelineObservabilityService');

// ═══════════════════════════════════════════════════════════════════════
//  辅助函数
// ═══════════════════════════════════════════════════════════════════════

/**
 * 将 PipelineTask instance 格式化为 API 响应 data
 *
 * @param {Object} task - PipelineTask Sequelize instance
 * @returns {Object} 格式化的 data 对象
 */
function formatTaskResponse(task) {
  if (!task) return null;

  // 安全解析 JSON 字段
  let intermediateResults = null;
  if (task.intermediate_results) {
    try {
      intermediateResults = typeof task.intermediate_results === 'string'
        ? JSON.parse(task.intermediate_results)
        : task.intermediate_results;
    } catch (_) {
      intermediateResults = null;
    }
  }

  let inputParams = null;
  if (task.input_params) {
    try {
      inputParams = typeof task.input_params === 'string'
        ? JSON.parse(task.input_params)
        : task.input_params;
    } catch (_) {
      inputParams = null;
    }
  }

  return {
    id: task.id,
    pipeline_uuid: task.pipeline_uuid,
    status: task.status,
    progress: task.progress,
    current_layer: task.current_layer || null,
    error_msg: task.error_msg || null,
    failed_layer: task.failed_layer || null,
    input_params: inputParams,
    intermediate_results: intermediateResults,
    started_at: task.started_at || null,
    completed_at: task.completed_at || null,
    created_at: task.createdAt || null
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  API 1: POST /api/enterprise/pipelines/execute — 创建并启动流水线
// ═══════════════════════════════════════════════════════════════════════

/**
 * 创建 PipelineTask 并异步启动 Orchestrator
 *
 * 请求体:
 *   image_url    - 产品图片 URL（必填）
 *   images       - 多图 URL 数组（可选）
 *   theme        - 创作主题（可选）
 *   style        - 风格（可选）
 *   voice_id     - TTS 音色 ID（可选）
 *   resolution   - 视频分辨率（可选）
 *   duration     - 目标时长（可选）
 *   product_name - 产品名称（可选）
 *
 * 流程:
 *   1. 参数校验（image_url 必填）
 *   2. pipelineTaskService.createPipelineTask() — 同步创建任务
 *   3. pipelineOrchestrator.executePipeline()   — 异步启动（不 await）
 *   4. 立即返回 pipeline_id + pipeline_uuid + status: pending
 */
exports.execute = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const userId = req.user.userId;

    const {
      image_url,
      images,
      theme,
      style,
      voice_id,
      resolution,
      duration,
      product_name
    } = req.body;

    // ── 1. 参数校验 ────────────────────────────────────────────────
    if (!image_url || typeof image_url !== 'string' || !image_url.trim()) {
      return res.fail('产品图片URL不能为空', 400);
    }

    // ── 2. 构造 inputParams ────────────────────────────────────────
    const inputParams = {
      image_url: image_url.trim(),
      images: images || null,
      theme: theme || null,
      style: style || null,
      voice_id: voice_id || null,
      resolution: resolution || null,
      duration: duration || null,
      product_name: product_name || null
    };

    // ── 3. 创建 PipelineTask ───────────────────────────────────────
    console.log(
      `[PipelineController] execute REQUEST | ` +
      `enterpriseId=${enterpriseId} | userId=${userId} | ` +
      `has_image_url=${!!image_url} | ` +
      `has_images=${!!(images && images.length)} | ` +
      `theme=${theme || 'N/A'} | ` +
      `style=${style || 'N/A'} | ` +
      `has_voice_id=${!!voice_id} | ` +
      `resolution=${resolution || 'N/A'} | ` +
      `duration=${duration || 'N/A'} | ` +
      `product_name=${product_name || 'N/A'} | ` +
      `time=${new Date().toISOString()}`
    );

    const task = await pipelineTaskService.createPipelineTask({
      enterpriseId,
      userId,
      inputParams
    });

    // ── 4. 异步启动 Orchestrator（不 await，不阻塞响应）───────────
    //     使用 .catch 确保 Promise rejection 不会成为 unhandled rejection
    pipelineOrchestrator.executePipeline(task.id, enterpriseId)
      .then(result => {
        console.log(
          `[PipelineController] Orchestrator completed | ` +
          `pipelineId=${task.id} | status=${result.status} | ` +
          `time=${new Date().toISOString()}`
        );
      })
      .catch(err => {
        console.error(
          `[PipelineController] Orchestrator FAILED | ` +
          `pipelineId=${task.id} | ` +
          `error=${err.message || 'Unknown error'} | ` +
          `time=${new Date().toISOString()}`
        );
      });

    // ── 5. 立即返回（不等待 Pipeline 完成）─────────────────────────
    console.log(
      `[PipelineController] execute RESPONSE | ` +
      `pipelineId=${task.id} | pipelineUuid=${task.pipeline_uuid} | ` +
      `status=pending | time=${new Date().toISOString()}`
    );

    return res.success({
      pipeline_id: task.id,
      pipeline_uuid: task.pipeline_uuid,
      status: 'pending'
    });

  } catch (error) {
    console.error(
      `[PipelineController] execute ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    // ProviderError 返回脱敏后的错误信息
    if (error.name === 'ProviderError') {
      // Step4-E2 任务2：只暴露业务错误描述，屏蔽内部 DB/Provider 失败细节
      // （SQL / Sequelize / stack / provider 内部错误）。内部日志已在上方
      // console.error 中保留完整 error.message。
      const isInternalFailure =
        error.provider === 'system' &&
        typeof error.code === 'string' &&
        error.code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  API 2: GET /api/enterprise/pipelines/:id — 按主键 ID 查询
// ═══════════════════════════════════════════════════════════════════════

/**
 * 查询 PipelineTask 状态（按主键 ID）
 *
 * 路径参数:
 *   id - PipelineTask 主键 ID
 *
 * 返回:
 *   完整 PipelineTask 信息（状态、进度、当前层、中间结果等）
 */
exports.getById = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const pipelineId = req.params.id;

    // ── 1. 参数校验 ────────────────────────────────────────────────
    const id = parseInt(pipelineId);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的 Pipeline ID', 400);
    }

    // ── 2. 查询（企业隔离）─────────────────────────────────────────
    console.log(
      `[PipelineController] getById REQUEST | ` +
      `pipelineId=${id} | enterpriseId=${enterpriseId} | ` +
      `time=${new Date().toISOString()}`
    );

    const task = await pipelineTaskService.getPipelineTask(id, enterpriseId);

    if (!task) {
      return res.fail('流水线任务不存在', 404);
    }

    // ── 3. 格式化返回 ──────────────────────────────────────────────
    return res.success(formatTaskResponse(task));

  } catch (error) {
    console.error(
      `[PipelineController] getById ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      // Step4-E2 任务2：只暴露业务错误描述，屏蔽内部 DB/Provider 失败细节
      // （SQL / Sequelize / stack / provider 内部错误）。内部日志已在上方
      // console.error 中保留完整 error.message。
      const isInternalFailure =
        error.provider === 'system' &&
        typeof error.code === 'string' &&
        error.code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  API 3: GET /api/enterprise/pipelines/uuid/:uuid — 按 UUID 查询
// ═══════════════════════════════════════════════════════════════════════

/**
 * 查询 PipelineTask 状态（按 pipeline_uuid）
 *
 * 路径参数:
 *   uuid - PipelineTask pipeline_uuid
 *
 * 返回:
 *   完整 PipelineTask 信息（状态、进度、当前层、中间结果等）
 */
exports.getByUUID = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const pipelineUuid = req.params.uuid;

    // ── 1. 参数校验 ────────────────────────────────────────────────
    if (!pipelineUuid || typeof pipelineUuid !== 'string' || !pipelineUuid.trim()) {
      return res.fail('无效的 Pipeline UUID', 400);
    }

    // ── 2. 查询（企业隔离）─────────────────────────────────────────
    console.log(
      `[PipelineController] getByUUID REQUEST | ` +
      `pipelineUuid=${pipelineUuid} | enterpriseId=${enterpriseId} | ` +
      `time=${new Date().toISOString()}`
    );

    const task = await pipelineTaskService.getPipelineTaskByUUID(
      pipelineUuid.trim(), enterpriseId
    );

    if (!task) {
      return res.fail('流水线任务不存在', 404);
    }

    // ── 3. 格式化返回 ──────────────────────────────────────────────
    return res.success(formatTaskResponse(task));

  } catch (error) {
    console.error(
      `[PipelineController] getByUUID ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      // Step4-E2 任务2：只暴露业务错误描述，屏蔽内部 DB/Provider 失败细节
      // （SQL / Sequelize / stack / provider 内部错误）。内部日志已在上方
      // console.error 中保留完整 error.message。
      const isInternalFailure =
        error.provider === 'system' &&
        typeof error.code === 'string' &&
        error.code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  API 4: GET /api/enterprise/pipelines/:id/detail — 查询流水线概览
// ═══════════════════════════════════════════════════════════════════════

/**
 * 查询流水线概览（基本状态、进度、当前层、timeline 摘要）
 *
 * 路径参数:
 *   id - PipelineTask 主键 ID
 *
 * 返回:
 *   { id, pipeline_uuid, status, progress, current_layer, timeline_summary[] }
 *
 * timeline_summary 为四层（vision/script/tts/dh）的紧凑摘要（layer + status）。
 */
exports.getPipelineDetail = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const pipelineId = req.params.id;

    // ── 1. 参数校验 ────────────────────────────────────────────────
    const id = parseInt(pipelineId);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的 Pipeline ID', 400);
    }

    // ── 2. 企业隔离校验（不存在 / 越权均返回 404，不泄露存在性）─────
    const task = await pipelineTaskService.getPipelineTask(id, enterpriseId);
    if (!task) {
      return res.fail('流水线任务不存在', 404);
    }

    // ── 3. 调用 observability service 获取 timeline 摘要 ──────────
    const timeline = await pipelineObservabilityService.getPipelineTimeline(id);
    const timelineSummary = timeline && timeline.layers
      ? timeline.layers.map(l => ({ layer: l.layer, status: l.status }))
      : [];

    // ── 4. 返回概览 ────────────────────────────────────────────────
    return res.success({
      id: task.id,
      pipeline_uuid: task.pipeline_uuid || null,
      status: task.status,
      progress: task.progress != null ? task.progress : 0,
      current_layer: task.current_layer || null,
      timeline_summary: timelineSummary
    });

  } catch (error) {
    console.error(
      `[PipelineController] getPipelineDetail ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      const isInternalFailure =
        error.provider === 'system' &&
        typeof error.code === 'string' &&
        error.code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  API 5: GET /api/enterprise/pipelines/:id/timeline — 查询流水线执行时间线
// ═══════════════════════════════════════════════════════════════════════

/**
 * 查询流水线执行时间线（四层状态、耗时、重试、资产回填）
 *
 * 路径参数:
 *   id - PipelineTask 主键 ID
 *
 * 返回:
 *   { pipeline_uuid, status, progress, layers[] }（由 getPipelineTimeline 推导）
 */
exports.getPipelineTimeline = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const pipelineId = req.params.id;

    // ── 1. 参数校验 ────────────────────────────────────────────────
    const id = parseInt(pipelineId);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的 Pipeline ID', 400);
    }

    // ── 2. 企业隔离校验（不存在 / 越权均返回 404，不泄露存在性）─────
    const task = await pipelineTaskService.getPipelineTask(id, enterpriseId);
    if (!task) {
      return res.fail('流水线任务不存在', 404);
    }

    // ── 3. 调用 observability service 获取时间线 ──────────────────
    const timeline = await pipelineObservabilityService.getPipelineTimeline(id);
    if (!timeline) {
      return res.fail('流水线任务不存在', 404);
    }

    return res.success(timeline);

  } catch (error) {
    console.error(
      `[PipelineController] getPipelineTimeline ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      const isInternalFailure =
        error.provider === 'system' &&
        typeof error.code === 'string' &&
        error.code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  API 6: GET /api/enterprise/pipelines/:id/errors — 查询流水线错误诊断
// ═══════════════════════════════════════════════════════════════════════

/**
 * 查询流水线最新错误诊断
 *
 * 路径参数:
 *   id - PipelineTask 主键 ID
 *
 * 返回:
 *   { pipeline_id, error: { error_code, failed_layer, retry_count,
 *                           provider_message, timestamp } | null }
 */
exports.getPipelineErrors = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const pipelineId = req.params.id;

    // ── 1. 参数校验 ────────────────────────────────────────────────
    const id = parseInt(pipelineId);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的 Pipeline ID', 400);
    }

    // ── 2. 企业隔离校验（不存在 / 越权均返回 404，不泄露存在性）─────
    const task = await pipelineTaskService.getPipelineTask(id, enterpriseId);
    if (!task) {
      return res.fail('流水线任务不存在', 404);
    }

    // ── 3. 调用 observability service 获取错误诊断 ────────────────
    const diagnosis = pipelineObservabilityService.getErrorDiagnosis(id);

    // ── 4. 返回（诊断记录为内存实现，无记录时 error 为 null）──────
    const error = diagnosis
      ? {
          error_code: diagnosis.error_code,
          failed_layer: diagnosis.failed_layer,
          retry_count: diagnosis.retry_count,
          provider_message: diagnosis.provider_message,
          timestamp: diagnosis.timestamp
        }
      : null;

    return res.success({
      pipeline_id: id,
      error
    });

  } catch (error) {
    console.error(
      `[PipelineController] getPipelineErrors ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      const isInternalFailure =
        error.provider === 'system' &&
        typeof error.code === 'string' &&
        error.code.endsWith('_FAILED');
      return res.fail(
        isInternalFailure ? '服务器内部错误' : error.message,
        error.statusCode || 500
      );
    }

    return res.fail('服务器内部错误', 500);
  }
};
