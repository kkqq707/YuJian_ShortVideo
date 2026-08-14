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

/**
 * 从 input_params JSON 中摘取列表摘要（白名单：product_name / image_url）
 *
 * 安全约束：列表接口只暴露这两个字段，禁止输出完整 input_params、
 * intermediate_results、run_config、error_msg、enterprise_id、user_id 等敏感内容。
 *
 * @param {string|Object|null} inputParams — PipelineTask.input_params
 * @returns {Object|null} { product_name, image_url }；解析失败返回 null
 */
function buildInputSummary(inputParams) {
  if (!inputParams) return null;

  let params = inputParams;
  if (typeof inputParams === 'string') {
    try {
      params = JSON.parse(inputParams);
    } catch (_) {
      return null;
    }
  }

  if (!params || typeof params !== 'object') return null;

  return {
    product_name: params.product_name != null ? params.product_name : null,
    image_url: params.image_url != null ? params.image_url : null
  };
}

/**
 * 构建 Pipeline 列表轻量项（仅白名单字段）
 *
 * 不复用 formatTaskResponse（它会带出 intermediate_results / 完整 input_params 等敏感字段）。
 *
 * @param {Object} task — PipelineTask instance
 * @returns {Object} 轻量列表项
 */
function toPipelineListItem(task) {
  return {
    id: task.id,
    pipeline_uuid: task.pipeline_uuid,
    status: task.status,
    progress: task.progress != null ? task.progress : 0,
    current_layer: task.current_layer || null,
    failed_layer: task.failed_layer || null,
    input_summary: buildInputSummary(task.input_params),
    created_at: task.created_at || null,
    completed_at: task.completed_at || null
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
      product_name,
      script_id
    } = req.body;

    // ── 1. 参数校验 ────────────────────────────────────────────────
    if (!image_url || typeof image_url !== 'string' || !image_url.trim()) {
      return res.fail('产品图片URL不能为空', 400);
    }

    // ── script_id 可选校验（提供则须正整数；不提供保持原自动生成流程）──
    let scriptId = null;
    if (script_id != null && script_id !== '') {
      const parsedScriptId = parseInt(script_id, 10);
      if (isNaN(parsedScriptId) || parsedScriptId <= 0) {
        return res.fail('无效的脚本 ID', 400);
      }
      scriptId = parsedScriptId;
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
      product_name: product_name || null,
      script_id: scriptId || null
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
      `has_script_id=${!!scriptId} | ` +
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
//  API: GET /api/enterprise/pipelines — 查询企业 Pipeline 列表
// ═══════════════════════════════════════════════════════════════════════

/**
 * 查询企业 PipelineTask 列表（分页 / 状态过滤 / 时间过滤 / 软删除）
 *
 * 查询参数:
 *   page        — 页码（默认 1）
 *   pageSize    — 每页条数（默认 20，上限 100）
 *   status      — 逗号分隔多状态（如 ?status=success,pending）
 *   start_date  — created_at 下限（ISO，可选）
 *   end_date    — created_at 上限（ISO，可选）
 *
 * 返回:
 *   { total, page, pageSize, items[] }
 *   items 元素为轻量白名单字段，不含 intermediate_results / 完整 input_params
 */
exports.listPipelines = async (req, res) => {
  try {
    // ── 1. 身份校验 ────────────────────────────────────────────────
    const enterpriseId = req.user.enterpriseId;
    if (!enterpriseId) {
      return res.fail('用户身份信息缺失', 401);
    }

    // ── 2. 分页参数解析 ────────────────────────────────────────────
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));

    // ── 3. 状态过滤校验（复用 Service 白名单常量）──────────────────
    const statusParam = req.query.status || null;
    let statusFilter = null;
    if (statusParam) {
      statusFilter = statusParam
        .split(',')
        .map(s => s.trim())
        .filter(s => pipelineTaskService.VALID_STATUSES.includes(s));
      if (statusFilter.length === 0) {
        return res.fail('无效的状态筛选参数', 400);
      }
    }

    // ── 4. 时间范围解析（可选，非法则 400）────────────────────────
    let startDate = null;
    let endDate = null;
    if (req.query.start_date) {
      startDate = new Date(req.query.start_date);
      if (isNaN(startDate.getTime())) {
        return res.fail('无效的时间范围参数', 400);
      }
    }
    if (req.query.end_date) {
      endDate = new Date(req.query.end_date);
      if (isNaN(endDate.getTime())) {
        return res.fail('无效的时间范围参数', 400);
      }
    }

    // ── 5. 查询（企业隔离在 Service 层强制注入）────────────────────
    console.log(
      `[PipelineController] listPipelines REQUEST | ` +
      `enterpriseId=${enterpriseId} | page=${page} | pageSize=${pageSize} | ` +
      `status=${statusParam || 'N/A'} | ` +
      `start_date=${req.query.start_date || 'N/A'} | ` +
      `end_date=${req.query.end_date || 'N/A'} | ` +
      `time=${new Date().toISOString()}`
    );

    const { count, rows } = await pipelineTaskService.listPipelineTasks({
      enterpriseId,
      statusFilter,
      startDate,
      endDate,
      page,
      pageSize
    });

    // ── 6. 轻量映射（不复用 formatTaskResponse）────────────────────
    const items = rows.map(toPipelineListItem);

    console.log(
      `[PipelineController] listPipelines RESPONSE | ` +
      `enterpriseId=${enterpriseId} | total=${count} | items=${items.length} | ` +
      `time=${new Date().toISOString()}`
    );

    return res.success({
      total: count,
      page,
      pageSize,
      items
    });

  } catch (error) {
    console.error(
      `[PipelineController] listPipelines ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      // Step4-E2 任务2：只暴露业务错误描述，屏蔽内部 DB/Provider 失败细节
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

// ═══════════════════════════════════════════════════════════════════════
//  API 7: DELETE /api/enterprise/pipelines/:id — 删除 PipelineTask（Step5-G1.1：删除 = 终止）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 删除流水线任务（企业隔离；进行中任务删除即终止后台执行）
 *
 * 路径参数:
 *   id - PipelineTask 主键 ID
 *
 * 返回:
 *   { id, status, deleted_at }
 *   - 非终态任务删除 → status='cancelled'（文案「任务已终止」）
 *   - 终态任务删除 → 原 status 不变（文案「删除成功」）
 */
exports.remove = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const pipelineId = req.params.id;

    // ── 1. 参数校验 ────────────────────────────────────────────────
    const id = parseInt(pipelineId);
    if (!id || isNaN(id) || id <= 0) {
      return res.fail('无效的 Pipeline ID', 400);
    }

    // ── 2. 软删除 + 终止（企业隔离；不存在/他企业/已删除均 404，不泄露存在性）─
    console.log(
      `[PipelineController] remove REQUEST | ` +
      `pipelineId=${id} | enterpriseId=${enterpriseId} | ` +
      `time=${new Date().toISOString()}`
    );

    const deleted = await pipelineTaskService.softDeletePipelineTask(id, enterpriseId);

    const terminated = deleted.status === 'cancelled';
    return res.success(
      { id: deleted.id, status: deleted.status, deleted_at: deleted.deleted_at },
      terminated ? '任务已终止' : '删除成功'
    );

  } catch (error) {
    console.error(
      `[PipelineController] remove ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      if (error.code === 'NOT_FOUND') {
        return res.fail('流水线任务不存在', 404);
      }
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
