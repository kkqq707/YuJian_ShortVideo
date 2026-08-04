const { Op, Sequelize } = require('sequelize');
const { Asset, GenerationTask } = require('../../models');
const ossService = require('../../services/ossService');

/**
 * Sprint 4.4: Asset Workspace Controller
 *
 * 为前端资产工作区提供增强数据：
 *  - 资产状态标签（原始素材 / AI处理中 / 已生成作品 / 已归档）
 *  - 关联作品数量
 *  - 生成历史时间线
 *  - AI创作入口（sourceAssetId绑定）
 *
 * 隔离策略：
 *  - enterprise_id 隔离（复用现有 Asset / GenerationTask 模型）
 *  - 不修改 Asset 数据结构
 *  - 不执行 OSS / 删除 / 写入操作
 */

// ─── 资产状态推导 ────────────────────────────────────────────────
// 根据关联 GenerationTask 的状态推导资产状态标签
function deriveAssetStatus(asset, generationSummary) {
  if (asset.category === 'archived') return 'archived';

  // generationSummary: { total, pending, processing, success, failed }
  const summary = generationSummary || { total: 0, pending: 0, processing: 0, success: 0, failed: 0 };

  if (summary.processing > 0 || summary.pending > 0) {
    return 'processing';
  }
  if (summary.success > 0) {
    return 'generated';
  }
  // 原始素材：没有任何生成任务
  return 'raw';
}

const STATUS_LABELS = {
  raw: '原始素材',
  processing: 'AI处理中',
  generated: '已生成作品',
  archived: '已归档'
};

const STATUS_COLORS = {
  raw: '#6b7280',
  processing: '#f59e0b',
  generated: '#10b981',
  archived: '#9ca3af'
};

// ═══════════════════════════════════════════════════════════════════
//  公开接口
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/enterprise/workspace/assets
 *
 * 查询参数（与现有 asset list 兼容）：
 *   page     - 页码，默认 1
 *   pageSize - 每页条数，默认 20
 *   type     - 按类型筛选（可选）
 *   keyword  - 按名称搜索（可选）
 *   sort     - newest | oldest | size
 *   status   - 按资产状态筛选（可选）：raw | processing | generated | archived
 *
 * 返回增强列表：
 *   items: [{ ...asset, status, statusLabel, statusColor, generationCount }]
 */
exports.listAssets = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const type = req.query.type;
    const keyword = req.query.keyword;
    const sort = req.query.sort || 'newest';
    const statusFilter = req.query.status;

    // ── 1. 查询资产 ────────────────────────────────────────────
    const where = {
      enterprise_id: enterpriseId,
      deleted_at: { [Op.eq]: null }
    };
    if (type) where.type = type;
    if (keyword) {
      where.name = { [Op.like]: `%${keyword}%` };
    }

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

    if (rows.length === 0) {
      return res.success({
        items: [],
        total: count,
        page,
        pageSize,
        sort
      });
    }

    // ── 2. 批量查询每项资产的生成任务统计 ──────────────────────
    // Sprint 4.4 Patch1: GenerationTask 查询失败不阻塞资产列表返回
    const assetIds = rows.map(a => a.id);
    let summaryMap = {};

    try {
      // 按 source_asset_id 分组统计各状态数量
      const stats = await GenerationTask.findAll({
        attributes: [
          'source_asset_id',
          'status',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
        ],
        where: {
          source_asset_id: { [Op.in]: assetIds },
          enterprise_id: enterpriseId,
          deleted_at: { [Op.eq]: null }
        },
        group: ['source_asset_id', 'status'],
        raw: true
      });

      // 构建 assetId → { pending, processing, success, failed, total }
      for (const s of stats) {
        const aid = s.source_asset_id;
        if (!summaryMap[aid]) {
          summaryMap[aid] = { total: 0, pending: 0, processing: 0, success: 0, failed: 0 };
        }
        summaryMap[aid][s.status] = parseInt(s.count) || 0;
        summaryMap[aid].total += parseInt(s.count) || 0;
      }
    } catch (statsError) {
      // Sprint 4.4 Patch1: 统计查询失败时使用空 summary，不阻塞资产列表
      console.error('[Workspace] GenerationTask stats query failed:', statsError.message);
      // summaryMap 保持为空，后续 renderAssetCard 使用安全默认值
    }

    // ── 3. 映射为标准返回结构 + 状态信息 ─────────────────────
    let items = rows.map(asset => {
      const summary = summaryMap[asset.id] || { total: 0, pending: 0, processing: 0, success: 0, failed: 0 };
      const status = deriveAssetStatus(asset, summary);

      return {
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
        createdAt: asset.createdAt,
        // Sprint 4.4 新增
        status,
        statusLabel: STATUS_LABELS[status] || '未知',
        statusColor: STATUS_COLORS[status] || '#6b7280',
        generationCount: summary.total,
        generationSummary: {
          pending: summary.pending,
          processing: summary.processing,
          success: summary.success,
          failed: summary.failed
        }
      };
    });

    // ── 4. 按资产状态筛选（内存筛选，因为状态是计算字段）───
    if (statusFilter) {
      items = items.filter(item => item.status === statusFilter);
    }

    // ── 5. 签名 OSS URL（Sprint 4.4 Patch1: 单项失败不影响其他项）──
    const signedItems = await Promise.all(items.map(async (item) => {
      try {
        const [signedUrl, signedThumb] = await Promise.all([
          ossService.getSignedUrl(item.url).catch(() => null),
          ossService.getSignedUrl(item.thumbnailUrl).catch(() => null)
        ]);
        return {
          ...item,
          url: signedUrl || item.url,
          thumbnailUrl: signedThumb || item.thumbnailUrl
        };
      } catch (signError) {
        // 单个资源签名失败不影响列表
        console.error('[Workspace] OSS sign failed for asset', item.id, ':', signError.message);
        return {
          ...item,
          url: item.url,
          thumbnailUrl: item.thumbnailUrl
        };
      }
    }));

    res.success({
      items: signedItems,
      total: items.length,
      totalUnfiltered: count,
      page,
      pageSize,
      sort
    });
  } catch (error) {
    console.error('[Workspace] listAssets error:', error.message);
    return res.fail('服务器内部错误', 500);
  }
};

/**
 * GET /api/enterprise/workspace/assets/:id/generations
 *
 * 获取资产关联的所有生成任务（时间线格式）
 *
 * 返回：
 *   asset: { id, name, type }
 *   generations: [{ id, taskType, prompt, model, status, outputAsset, createdAt, completedAt }]
 *   summary: { total, pending, processing, success, failed }
 */
exports.getAssetGenerations = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const assetId = req.params.id;

    // ── 1. 验证资产归属 ────────────────────────────────────────
    const asset = await Asset.findOne({
      where: {
        id: assetId,
        enterprise_id: enterpriseId,
        deleted_at: { [Op.eq]: null }
      }
    });

    if (!asset) {
      return res.fail('素材不存在', 404);
    }

    // ── 2. 查询生成任务（Sprint 4.4 Patch1: 失败时返回空列表）───
    let tasks = [];
    try {
      tasks = await GenerationTask.findAll({
        where: {
          source_asset_id: asset.id,
          enterprise_id: enterpriseId,
          deleted_at: { [Op.eq]: null }
        },
        order: [['createdAt', 'DESC']]
      });
    } catch (taskError) {
      console.error('[Workspace] GenerationTask query failed for asset', assetId, ':', taskError.message);
      // 返回空列表，不阻塞
    }

    // ── 3. 收集输出资产并签名（Sprint 4.4 Patch1: 单项失败不影响其他）──
    const outputAssetIds = [...new Set(tasks.map(t => t.output_asset_id).filter(Boolean))];

    let outputAssets = [];
    if (outputAssetIds.length > 0) {
      try {
        outputAssets = await Asset.findAll({
          where: {
            id: { [Op.in]: outputAssetIds },
            enterprise_id: enterpriseId,
            deleted_at: { [Op.eq]: null }
          }
        });
      } catch (outputError) {
        console.error('[Workspace] OutputAsset query failed:', outputError.message);
        // outputAssets 保持为空数组
      }
    }

    const outputAssetMap = {};
    for (const oa of outputAssets) {
      outputAssetMap[oa.id] = oa;
    }

    // 逐项签名，单项失败不影响其他
    const signedUrlCache = {};
    for (const oa of outputAssets) {
      if (oa.url) {
        try {
          signedUrlCache[oa.id] = await ossService.getSignedUrl(oa.url);
        } catch (signErr) {
          console.error('[Workspace] OSS sign failed for output asset', oa.id, ':', signErr.message);
          signedUrlCache[oa.id] = oa.url; // 使用原始 URL 作为降级
        }
      }
    }

    // ── 4. 构建时间线 ──────────────────────────────────────────
    const generations = tasks.map(task => {
      const outputAsset = task.output_asset_id ? outputAssetMap[task.output_asset_id] : null;
      return {
        id: task.id,
        taskType: task.task_type,
        prompt: task.prompt,
        model: task.model,
        provider: task.provider,
        status: task.status,
        errorMsg: task.error_msg,
        progress: task.progress,
        createdAt: task.createdAt,
        completedAt: task.completed_at,
        outputAsset: outputAsset ? {
          id: outputAsset.id,
          type: outputAsset.type,
          name: outputAsset.name,
          url: signedUrlCache[outputAsset.id] || outputAsset.url,
          thumbnailUrl: outputAsset.thumbnail || outputAsset.url,
          duration: outputAsset.duration,
          width: outputAsset.width,
          height: outputAsset.height
        } : null
      };
    });

    // ── 5. 统计摘要 ────────────────────────────────────────────
    const summary = {
      total: generations.length,
      pending: generations.filter(g => g.status === 'pending').length,
      processing: generations.filter(g => g.status === 'processing').length,
      success: generations.filter(g => g.status === 'success').length,
      failed: generations.filter(g => g.status === 'failed').length
    };

    res.success({
      asset: { id: asset.id, name: asset.name, type: asset.type },
      generations,
      summary
    });
  } catch (error) {
    console.error('[Workspace] getAssetGenerations error:', error.message);
    return res.fail('服务器内部错误', 500);
  }
};
