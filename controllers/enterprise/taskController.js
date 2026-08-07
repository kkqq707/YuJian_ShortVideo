const { Op } = require('sequelize');
const { GenerationTask, Enterprise } = require('../../models');
const dashscopeService = require('../../services/dashscopeService');
const { adjustEnterpriseQuota } = require('../../utils/quota');
const registry = require('../../config/ai-model-registry');
const { getModelsByCapability } = registry;

/**
 * Sprint 4.4 Patch3: 统一使用阿里云百炼 provider
 * 所有 task 创建时 provider 统一为 'aliyun'，model 由创作模板自动匹配
 */

// 文生视频
exports.text2Video = async (req, res) => {
  const { prompt, model, size, duration } = req.body;
  if (!prompt) return res.fail('提示词不能为空');

  // 使用 ai-model-registry 获取模型
  const textModels = getModelsByCapability('text_to_video');
  const resolvedModel = model || (textModels.length > 0 ? textModels[0].apiModelName : registry.getApiModelName('wan2.1-t2v'));

  const enterprise = await Enterprise.findByPk(req.user.enterpriseId);
  const pointsPerSecond = await dashscopeService.getPointsPerSecond(resolvedModel);
  const estimatedPoints = Math.ceil((duration || 5) * pointsPerSecond);

  if (enterprise.quota_balance < estimatedPoints) {
    return res.fail('积分余额不足，请先充值');
  }

  const result = await dashscopeService.submitText2Video({
    prompt,
    model: resolvedModel,
    size: size || '1080p',
    duration: duration || 5
  });

  if (!result.output?.task_id) {
    return res.fail(result.message || '提交失败');
  }

  const task = await GenerationTask.create({
    enterprise_id: req.user.enterpriseId,
    user_id: req.user.userId,
    task_id: result.output.task_id,
    task_type: 'text2video',
    model: resolvedModel,
    prompt,
    status: 'pending',
    provider: 'aliyun',
    duration: duration || 5
  });

  res.success({ task_id: task.id, dashscope_task_id: result.output.task_id, provider: 'aliyun' });
};

// 图生视频
exports.image2Video = async (req, res) => {
  const { image_url, prompt, model, duration } = req.body;

  // 输入校验
  if (!image_url) return res.fail('图片地址不能为空');
  if (!prompt || !prompt.trim()) return res.fail('提示词不能为空');
  if (prompt.trim().length > 2000) return res.fail('提示词不能超过2000字');

  // 动态从 registry 获取图生视频模型列表（Phase 2-C-1-E-5）
  const imgModels = getModelsByCapability('image_to_video');
  const validApiModelNames = imgModels.map(m => m.apiModelName);
  const defaultModel = imgModels.length > 0 ? imgModels[0].apiModelName : registry.getApiModelName('wan2.1-i2v');
  const selectedModel = model || defaultModel;
  if (!validApiModelNames.includes(selectedModel)) {
    return res.fail('不支持的模型，仅支持阿里云百炼模型');
  }

  const selectedDuration = Math.min(Math.max(parseInt(duration) || 5, 2), 15);

  // 检查协议安全
  if (!/^https?:\/\//.test(image_url)) {
    return res.fail('图片地址格式不合法');
  }

  // 积分校验
  const enterprise = await Enterprise.findByPk(req.user.enterpriseId);
  const pointsPerSecond = await dashscopeService.getPointsPerSecond(selectedModel);
  const estimatedPoints = Math.ceil(selectedDuration * pointsPerSecond);

  if (enterprise.quota_balance < estimatedPoints) {
    return res.fail('积分余额不足，请先充值');
  }

  const result = await dashscopeService.submitImage2Video({
    imageUrl: image_url,
    prompt: prompt.trim(),
    model: selectedModel,
    duration: selectedDuration
  });

  if (!result.output?.task_id) {
    return res.fail(result.message || '提交失败');
  }

  const task = await GenerationTask.create({
    enterprise_id: req.user.enterpriseId,
    user_id: req.user.userId,
    task_id: result.output.task_id,
    task_type: 'image2video',
    model: selectedModel,
    prompt: prompt.trim(),
    input_url: image_url,
    status: 'pending',
    provider: 'aliyun',
    duration: selectedDuration,
    points_cost: estimatedPoints
  });

  res.success({
    id: task.id,
    task_id: task.id,
    dashscope_task_id: result.output.task_id,
    status: task.status,
    provider: 'aliyun',
    created_at: task.created_at
  });
};

// 参考生视频
exports.ref2Video = async (req, res) => {
  const { images, prompt, model, duration } = req.body;
  if (!images || images.length < 2) return res.fail('参考生视频至少需要2张参考图片');
  if (images.length > 5) return res.fail('参考生视频最多支持5张参考图片');

  const refModels = getModelsByCapability('reference_to_video');
  const resolvedModel = model || (refModels.length > 0 ? refModels[0].apiModelName : registry.getApiModelName('wan2.1-i2v'));
  const selectedDuration = duration || 5;

  // 积分校验
  const enterprise = await Enterprise.findByPk(req.user.enterpriseId);
  const pointsPerSecond = await dashscopeService.getPointsPerSecond(resolvedModel);
  const estimatedPoints = Math.ceil(selectedDuration * pointsPerSecond);

  if (enterprise.quota_balance < estimatedPoints) {
    return res.fail('积分余额不足，请先充值');
  }

  const result = await dashscopeService.submitRef2Video({
    images,
    prompt,
    model: resolvedModel,
    duration: selectedDuration
  });

  if (!result.output?.task_id) {
    return res.fail(result.message || '提交失败');
  }

  const task = await GenerationTask.create({
    enterprise_id: req.user.enterpriseId,
    user_id: req.user.userId,
    task_id: result.output.task_id,
    task_type: 'ref2video',
    model: resolvedModel,
    prompt,
    input_images: JSON.stringify(images),
    status: 'pending',
    provider: 'aliyun',
    duration: selectedDuration,
    points_cost: estimatedPoints
  });

  res.success({ task_id: task.id, dashscope_task_id: result.output.task_id, provider: 'aliyun' });
};

// 数字人口播
exports.digitalHuman = async (req, res) => {
  const { image_url, text, voice } = req.body;
  if (!image_url || !text) return res.fail('图片和文本不能为空');

  const result = await dashscopeService.submitDigitalHuman({
    imageUrl: image_url,
    text,
    voice: voice || 'zhiyan_emo'
  });

  if (!result.output?.task_id) {
    return res.fail(result.message || '提交失败');
  }

  const task = await GenerationTask.create({
    enterprise_id: req.user.enterpriseId,
    user_id: req.user.userId,
    task_id: result.output.task_id,
    task_type: 'digital_human',
    model: registry.getApiModelName('wanx-digital-human'),
    prompt: text,
    input_url: image_url,
    status: 'pending',
    provider: 'aliyun'
  });

  res.success({ task_id: task.id, dashscope_task_id: result.output.task_id, provider: 'aliyun' });
};

// 查询任务状态
exports.getStatus = async (req, res) => {
  const task = await GenerationTask.findOne({
    where: {
      id: req.params.id,
      enterprise_id: req.user.enterpriseId
    }
  });
  if (!task) return res.fail('任务不存在');

  // 如果还在处理中，同步查询一下
  if (task.status === 'pending' || task.status === 'processing') {
    try {
      const remoteStatus = await dashscopeService.getTaskStatus(task.task_id);
      if (remoteStatus.output?.task_status) {
        const statusMap = {
          PENDING: 'pending',
          RUNNING: 'processing',
          SUCCEEDED: 'success',
          FAILED: 'failed'
        };
        const newStatus = statusMap[remoteStatus.output.task_status] || task.status;
        if (newStatus !== task.status) {
          await task.update({ status: newStatus });
        }
      }
    } catch (e) {
      console.log('查询任务状态失败', e);
    }
  }

  res.success(task);
};

// 我的任务列表
exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const taskType = req.query.task_type;
  const status = req.query.status;

  const where = { enterprise_id: req.user.enterpriseId };
  if (taskType) where.task_type = taskType;
  if (status) where.status = status;

  const { count, rows } = await GenerationTask.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize
  });

  res.success({ list: rows, total: count, page, pageSize });
};
