const express = require('express');
const router = express.Router();
const controller = require('../../controllers/enterprise/videoGenerationController');

// GET  /api/enterprise/video-generation/templates   — 创作模板列表（Sprint 4.4 Patch3）
//      参数: outputType (可选: image | video)
//      返回: [{ id, name, description, capability, category, categoryLabel, icon, outputType, sort, providerLabel }]
router.get('/templates', controller.getTemplates);

// GET  /api/enterprise/video-generation/tasks      — 作品列表（Sprint 3.3）
//      参数: page, pageSize, status, task_type
//      排序: created_at DESC
//      返回: { total, page, pageSize, items: [...] }
router.get('/tasks', controller.listTasks);

// GET  /api/enterprise/video-generation/tasks/:id  — 作品详情（Sprint 3.3 增强）
//      返回完整信息含 sourceAsset/outputAsset
router.get('/tasks/:id', controller.getTask);

// POST /api/enterprise/video-generation/tasks      — 创建视频生成任务（Sprint 2.5）
router.post('/tasks', controller.createTask);

// POST /api/enterprise/video-generation/text-to-image — 图片生成任务（Phase UI-AICreation-02-B-1-A）
router.post('/text-to-image', controller.createImageTask);

// POST /api/enterprise/video-generation/text-to-video — 文生视频任务（Phase UI-AICreation-07-B）
router.post('/text-to-video', controller.createTextToVideoTask);

// POST /api/enterprise/video-generation/ref-to-video — 参考生视频任务（Phase UI-AICreation-07-E）
router.post('/ref-to-video', controller.createRefToVideoTask);

// DELETE /api/enterprise/video-generation/tasks/:id — 软删除作品（Sprint 3.3）
//      更新 deleted_at=NOW()，不物理删除、不删 Asset、不删 OSS 文件
router.delete('/tasks/:id', controller.deleteTask);

// ===================================================================
//  Sprint 4.7 Patch2: 旧 API 兼容重定向
//
//  旧前端可能仍调用以下路径（无 /tasks 前缀），返回 301 重定向到新路径：
//    GET /video-generation?page=1&pageSize=20  -> /video-generation/tasks?page=1&pageSize=20
//    GET /video-generation/:id                  -> /video-generation/tasks/:id
//
//  这些路由放在最后，确保 /tasks、/templates 等新路径优先匹配
// ===================================================================

// GET /api/enterprise/video-generation?page=&pageSize=  -> 301 -> /tasks
router.get('/', (req, res) => {
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  return res.redirect(301, `/api/enterprise/video-generation/tasks${qs}`);
});

// GET /api/enterprise/video-generation/:id  -> 301 -> /tasks/:id
// 仅匹配非已知子路径（tasks/templates 等精确路由优先于 :id）
router.get('/:id', (req, res) => {
  return res.redirect(301, `/api/enterprise/video-generation/tasks/${req.params.id}`);
});

module.exports = router;
