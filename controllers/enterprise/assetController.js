const { Op } = require('sequelize');
const { Asset } = require('../../models');
const ossService = require('../../services/ossService');
const videoStorageService = require('../../services/videoStorageService');

/**
 * GET /api/assets/:id/play-url
 *
 * Sprint 5.7: 为视频资产生成带签名的临时播放 URL
 * Sprint 5.8: 扩展支持图片类型资产签名
 *
 * 私有 OSS Bucket 需要签名 URL 才能直接访问资源。
 * 签名 URL 有效期 1 小时（3600 秒），浏览器可直接使用。
 *
 * 返回格式：
 *   { url: string, expires: number, type: string }
 *
 * 安全：
 *   - enterprise_id 隔离
 *   - 视频/图片均可获取签名 URL
 */
exports.playUrl = async (req, res) => {
  try {
    const asset = await Asset.findOne({
      where: {
        id: req.params.id,
        enterprise_id: req.user.enterpriseId,
        deleted_at: { [Op.eq]: null }
      }
    });

    if (!asset) return res.fail('素材不存在', 404);

    // Sprint 5.8: 支持 video 和 image 类型
    if (!['video', 'image'].includes(asset.type)) {
      return res.fail('该素材类型不支持播放URL', 400);
    }

    // 确定要签名的 URL：图片优先用 thumbnail，视频用 url
    const targetUrl = asset.type === 'image'
      ? (asset.thumbnail || asset.url)
      : asset.url;

    if (!targetUrl) {
      return res.fail('资源 URL 不存在', 404);
    }

    // Sprint 5.7: 历史数据兼容 — 旧格式 URL（非 OSS）直接返回，不签名
    const ossBucket = process.env.OSS_BUCKET;
    const isOssUrl = ossBucket && targetUrl.includes(ossBucket);

    if (!isOssUrl && !ossService.extractKeyFromUrl(targetUrl)) {
      // 非 OSS URL 且无法提取 key，可能是旧格式外部 URL，直接返回
      return res.success({
        url: targetUrl,
        expires: 0,
        type: asset.type
      });
    }

    // 生成签名 URL（1 小时有效）
    // 视频：强制 video/mp4 Content-Type 确保浏览器正确播放
    // 图片：不加 Content-Type 覆盖，让 OSS 自动检测
    const signOptions = asset.type === 'video'
      ? { contentType: 'video/mp4' }
      : {};
    const signedUrl = await ossService.generateSignedUrl(targetUrl, 3600, signOptions);

    if (!signedUrl) {
      // 降级：返回原始 URL
      return res.success({
        url: targetUrl,
        expires: 0,
        type: asset.type
      });
    }

    return res.success({
      url: signedUrl,
      expires: 3600,
      type: asset.type
    });
  } catch (error) {
    console.error('[AssetController] playUrl error:', error.message);
    return res.fail('服务器内部错误', 500);
  }
};

exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const type = req.query.type;
  const keyword = req.query.keyword;
  const sort = req.query.sort || 'newest';

  const where = { enterprise_id: req.user.enterpriseId, deleted_at: { [Op.eq]: null } };
  if (type) where.type = type;
  if (keyword) {
    where.name = { [Op.like]: `%${keyword}%` };
  }

  // Sprint 4.1 Patch4: 排序支持 newest / oldest / size
  const SORT_MAP = {
    newest: ['id', 'DESC'],
    oldest: ['id', 'ASC'],
    size: ['size', 'DESC']
  };
  const order = SORT_MAP[sort] || SORT_MAP.newest;

  const { count, rows } = await Asset.findAndCountAll({
    where,
    order: [order],
    offset: (page - 1) * pageSize,
    limit: pageSize
  });

  // 映射为标准返回结构
  const items = rows.map(asset => ({
    id: asset.id,
    type: asset.type,
    name: asset.name,
    url: asset.url,
    thumbnailUrl: asset.thumbnail || asset.url,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    mime_type: asset.mime_type,
    createdAt: asset.createdAt
  }));

  // Sprint 4.1 Patch1: 将原始OSS URL转换为临时签名URL
  // OSS Bucket为private权限，前端img直接访问会403
  // 签名URL有效期默认1小时，前端每次刷新列表重新获取
  const signedItems = await Promise.all(items.map(async (item) => {
    const [signedUrl, signedThumb] = await Promise.all([
      ossService.getSignedUrl(item.url).catch(() => null),
      ossService.getSignedUrl(item.thumbnailUrl).catch(() => null)
    ]);
    return {
      ...item,
      url: signedUrl || item.url,
      thumbnailUrl: signedThumb || item.thumbnailUrl
    };
  }));

  res.success({ items: signedItems, total: count, page, pageSize, sort });
};

exports.uploadSignature = async (req, res) => {
  try {
    const { type } = req.query;
    const signature = await ossService.generateUploadPolicy(type || 'image', 'enterprise/' + req.user.enterpriseId);
    res.success(signature);
  } catch (err) {
    if (err.message === 'OSS_NOT_CONFIGURED') {
      return res.fail('OSS 对象存储未配置，请联系管理员', 503);
    }
    throw err;
  }
};

exports.addRecord = async (req, res) => {
  const { name, url, type, size, thumbnail, width, height, mime_type } = req.body;

  const asset = await Asset.create({
    enterprise_id: req.user.enterpriseId,
    user_id: req.user.userId,
    name,
    url,
    type: type || 'image',
    size,
    thumbnail,
    width,
    height,
    mime_type
  });

  res.success(asset);
};

exports.remove = async (req, res) => {
  const asset = await Asset.findByPk(req.params.id);
  if (!asset) return res.fail('素材不存在', 404);
  if (asset.enterprise_id !== req.user.enterpriseId) return res.fail('无权限');
  if (asset.deleted_at) return res.fail('素材不存在', 404);

  // Sprint 4.1 Patch2: 软删除 — 设置 deleted_at，不删除OSS文件，不影响关联的GenerationTask
  await asset.update({ deleted_at: new Date() });
  res.success({ message: '删除成功' });
};

exports.detail = async (req, res) => {
  const { Asset, GenerationTask } = require('../../models');
  const ossService = require('../../services/ossService');

  const asset = await Asset.findOne({
    where: {
      id: req.params.id,
      enterprise_id: req.user.enterpriseId,
      deleted_at: { [Op.eq]: null }
    }
  });

  if (!asset) return res.fail('素材不存在', 404);

  // 统计该素材被用于生成视频的次数
  const usageCount = await GenerationTask.count({
    where: {
      source_asset_id: asset.id,
      enterprise_id: req.user.enterpriseId,
      deleted_at: { [Op.eq]: null }
    }
  });

  // 签名 OSS URL
  const [signedUrl, signedThumb] = await Promise.all([
    ossService.getSignedUrl(asset.url).catch(() => null),
    asset.thumbnail
      ? ossService.getSignedUrl(asset.thumbnail).catch(() => null)
      : Promise.resolve(null)
  ]);

  const TYPE_LABELS = { image: '图片', video: '视频', audio: '音频', other: '其他' };

  res.success({
    id: asset.id,
    type: asset.type,
    typeLabel: TYPE_LABELS[asset.type] || '其他',
    name: asset.name,
    url: signedUrl || asset.url,
    thumbnailUrl: signedThumb || asset.thumbnail || signedUrl || asset.url,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    mime_type: asset.mime_type,
    createdAt: asset.createdAt,
    usageCount
  });
};

exports.history = async (req, res) => {
  const { Asset, GenerationTask } = require('../../models');
  const ossService = require('../../services/ossService');

  try {
    const asset = await Asset.findOne({
      where: {
        id: req.params.id,
        enterprise_id: req.user.enterpriseId,
        deleted_at: { [Op.eq]: null }
      }
    });

    if (!asset) return res.fail('素材不存在', 404);

    // Sprint 4.4 Patch1: GenerationTask 查询失败不阻塞，返回空列表
    let tasks = [];
    try {
      tasks = await GenerationTask.findAll({
        where: {
          source_asset_id: asset.id,
          enterprise_id: req.user.enterpriseId,
          deleted_at: { [Op.eq]: null }
        },
        order: [['createdAt', 'DESC']]
      });
    } catch (taskErr) {
      console.error('[AssetHistory] GenerationTask query failed:', taskErr.message);
      // tasks 保持为空数组，继续返回基础信息
    }

    // Sprint 4.4 Patch1: 收集输出资产ID（安全处理 null/undefined）
    const outputAssetIds = tasks
      .map(t => t.output_asset_id)
      .filter(Boolean);

    // Sprint 4.4 Patch1: 批量查询输出资产（失败降级为空数组）
    let outputAssets = [];
    if (outputAssetIds.length > 0) {
      try {
        outputAssets = await Asset.findAll({
          where: {
            id: { [Op.in]: [...new Set(outputAssetIds)] },
            enterprise_id: req.user.enterpriseId,
            deleted_at: { [Op.eq]: null }
          }
        });
      } catch (outputErr) {
        console.error('[AssetHistory] OutputAsset query failed:', outputErr.message);
        // outputAssets 保持为空数组
      }
    }

    const outputAssetMap = {};
    for (const oa of outputAssets) {
      outputAssetMap[oa.id] = oa;
    }

    // Sprint 4.4 Patch1: 逐项签名输出资产URL（单项失败不影响其他）
    const signedUrlCache = {};
    for (const oa of outputAssets) {
      if (oa.url) {
        try {
          signedUrlCache[oa.id] = await ossService.getSignedUrl(oa.url);
        } catch (signErr) {
          console.error('[AssetHistory] OSS sign failed for asset', oa.id, ':', signErr.message);
          signedUrlCache[oa.id] = oa.url; // 使用原始 URL 降级
        }
      }
    }

    // Sprint 4.4 Patch1: 构建生成任务列表（安全访问 outputAsset 字段）
    const generationTasks = tasks.map((task) => {
      const outputAsset = task.output_asset_id ? outputAssetMap[task.output_asset_id] : null;
      return {
        id: task.id,
        taskType: task.task_type,
        prompt: task.prompt,
        status: task.status,
        model: task.model,
        provider: task.provider,
        createdAt: task.createdAt,
        completedAt: task.completed_at,
        outputAsset: outputAsset ? {
          id: outputAsset.id,
          type: outputAsset.type,
          name: outputAsset.name,
          url: signedUrlCache[outputAsset.id] || outputAsset.url || '',
          thumbnailUrl: outputAsset.thumbnail || outputAsset.url || '',
          duration: outputAsset.duration
        } : null
      };
    });

    res.success({
      asset: {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        url: asset.url
      },
      usageCount: tasks.length,
      generationTasks
    });
  } catch (error) {
    console.error('[AssetHistory] Unexpected error:', error.message);
    // Sprint 4.4 Patch1: 返回空历史而非 500，让前端优雅降级
    res.success({
      asset: { id: req.params.id, name: '', type: '' },
      usageCount: 0,
      generationTasks: []
    });
  }
};

exports.batchRemove = async (req, res) => {
  const { ids } = req.body;
  // Sprint 4.1 Patch2: 软删除
  await Asset.update(
    { deleted_at: new Date() },
    {
      where: {
        id: ids,
        enterprise_id: req.user.enterpriseId,
        deleted_at: { [Op.eq]: null }
      }
    }
  );
  res.success({ message: '批量删除成功' });
};
