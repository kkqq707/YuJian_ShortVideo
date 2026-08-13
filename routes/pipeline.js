const express = require('express');
const router = express.Router();
const controller = require('../controllers/pipelineController');

// POST /api/enterprise/pipelines/execute — 创建并启动数字人流水线
//      请求体: { image_url, images?, theme?, style?, voice_id?, resolution?, duration?, product_name? }
//      返回: { pipeline_id, pipeline_uuid, status: "pending" }
router.post('/execute', controller.execute);

// GET  /api/enterprise/pipelines/uuid/:uuid — 按 UUID 查询流水线状态
//      返回完整 PipelineTask 信息（状态、进度、当前层、中间结果等）
router.get('/uuid/:uuid', controller.getByUUID);

// GET  /api/enterprise/pipelines/:id — 按主键 ID 查询流水线状态
//      返回完整 PipelineTask 信息（状态、进度、当前层、中间结果等）
router.get('/:id', controller.getById);

// GET  /api/enterprise/pipelines/:id/detail — 查询流水线概览
//      返回 { id, pipeline_uuid, status, progress, current_layer, timeline_summary[] }
router.get('/:id/detail', controller.getPipelineDetail);

// GET  /api/enterprise/pipelines/:id/timeline — 查询流水线执行时间线
//      返回 { pipeline_uuid, status, progress, layers[] }
router.get('/:id/timeline', controller.getPipelineTimeline);

// GET  /api/enterprise/pipelines/:id/errors — 查询流水线错误诊断
//      返回 { pipeline_id, error: {...} | null }
router.get('/:id/errors', controller.getPipelineErrors);

module.exports = router;
