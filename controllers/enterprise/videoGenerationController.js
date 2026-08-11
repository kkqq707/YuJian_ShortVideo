const { Op } = require('sequelize');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { GenerationTask, Asset } = require('../../models');
const dashscopeService = require('../../services/dashscopeService');
const generationService = require('../../services/generationService');
const videoStorageService = require('../../services/videoStorageService');
const ossService = require('../../services/ossService');
const { getTemplatesByOutput, getModelConfig } = require('../../config/ai-model-registry');

/**
 * 视频生成任务控制器
 *
 * Sprint 2.5 Step 3.2 + 3.3: 图生视频任务的创建、查询和结果 OSS 永久存储
 * Sprint 3.3: 任务列表、详情、软删除
 *
 * 安全策略：
 *   - enterprise_id 隔离：所有查询均限定 enterprise_id
 *   - Asset 归属校验：仅允许访问本企业素材
 *   - 错误信息脱敏：DashScope 错误经 sanitizeError 处理后仅暴露安全消息
 *   - 不泄露 OSS_SECRET、DashScope_KEY
 *   - 列表/详情数据分离：列表返回轻量字段，详情返回完整信息
 */

// ─── 辅助函数 ────────────────────────────────────────────────────

/**
 * 将 error_code 和 message 合并存入 error_msg 字段
 * 格式：[CODE] message
 */
function formatErrorMsg(code, message) {
  if (code) {
    return `[${code}] ${message || ''}`;
  }
  return message || '未知错误';
}

/**
 * 从视频文件名生成友好名称
 */
function generateVideoName(task) {
  const date = new Date().toISOString().slice(0, 10);
  const promptSnippet = (task.prompt || 'video').substring(0, 30).replace(/[^a-zA-Z0-9一-鿿]/g, '_');
  return `AI视频_${promptSnippet}_${date}`;
}

/**
 * 从图片生成任务创建友好名称
 */
function generateImageName(task) {
  const date = new Date().toISOString().slice(0, 10);
  const promptSnippet = (task.prompt || 'image').substring(0, 30).replace(/[^a-zA-Z0-9一-鿿]/g, '_');
  return `AI图片_${promptSnippet}_${date}`;
}

/**
 * 构建轻量列表项
 * 用于 GET /api/enterprise/video-generation/tasks
 *
 * 只暴露前端列表需要的最小字段集，不返回 params、完整 Asset、error 详情等内部字段
 */
function toListItem(task) {
  // Sprint 5.6: 视频资产使用签名 play_url
  const outputAsset = task.outputAsset || null;
  const playUrl = (outputAsset && outputAsset.dataValues && outputAsset.dataValues.play_url)
    || (outputAsset && outputAsset.play_url)
    || null;

  // Phase UI-AICreation-02-B-1-G-P: 识别图片任务，避免前端误判为视频
  const isImageTask = task.task_type === 'text2image' || task.task_type === 'image_generation'
    || (outputAsset && outputAsset.type === 'image');
  const isImageOutput = outputAsset && outputAsset.type === 'image';

  return {
    id: task.id,
    status: task.status,
    prompt: task.prompt ? (task.prompt.length > 80 ? task.prompt.substring(0, 80) + '...' : task.prompt) : '',
    taskType: task.task_type || null,
    model: task.model,
    thumbnailUrl: task._signedThumbnail || computeThumbnailUrl(task),
    coverUrl: task._signedThumbnail || task.cover_url || (outputAsset ? outputAsset.url : null) || null,
    // 图片任务的 videoUrl/playUrl 应为 null，不提供视频播放入口
    videoUrl: isImageTask ? null : (playUrl || task.output_url || null),
    playUrl: isImageTask ? null : (playUrl || task.output_url || null),
    duration: task.duration || null,
    progress: task.progress || 0,
    errorMsg: task.error_msg || null,
    createdAt: task.created_at,
    // Phase UI-AICreation-02-B-1-G-P: 图片输出资产增加 mediaType / mime 字段
    mediaType: isImageOutput ? 'image' : (outputAsset ? outputAsset.type : null),
    mime: isImageOutput ? (outputAsset.mime_type || 'image/png') : null,
    outputAsset: outputAsset ? {
      id: outputAsset.id,
      url: outputAsset.url,
      play_url: isImageOutput ? null : (playUrl || outputAsset.url),
      thumbnail: outputAsset.thumbnail,
      type: outputAsset.type,
      mediaType: outputAsset.type === 'image' ? 'image' : (outputAsset.type || null),
      mime: outputAsset.type === 'image' ? (outputAsset.mime_type || 'image/png') : null,
      duration: outputAsset.duration
    } : null
  };
}

/**
 * 计算列表缩略图 URL
 *
 * 优先级：coverUrl > sourceAsset.thumbnail > sourceAsset.url > null
 * 不修改数据库结构，纯计算字段
 */
function computeThumbnailUrl(task) {
  // 1. outputAsset.thumbnail（Sprint 5.7: ffmpeg 生成的封面）
  if (task.outputAsset && task.outputAsset.thumbnail) {
    return task.outputAsset.thumbnail;
  }
  // 2. cover_url 存在时直接使用
  if (task.cover_url) {
    return task.cover_url;
  }
  // 3. sourceAsset.thumbnail
  if (task.sourceAsset && task.sourceAsset.thumbnail) {
    return task.sourceAsset.thumbnail;
  }
  // 4. sourceAsset.url
  if (task.sourceAsset && task.sourceAsset.url) {
    return task.sourceAsset.url;
  }
  // 5. 无缩略图
  return null;
}

/**
 * Sprint 5.6: 为 task 注入视频签名 play_url 后调用 toDetail
 *
 * @param {Object} task - GenerationTask 实例（含 outputAsset 关联）
 * @returns {Object} toDetail 格式化结果
 */
async function toDetailWithPlayUrl(task) {
  // Sprint 5.6: 签名视频播放 URL
  if (task.outputAsset && task.outputAsset.type === 'video' && task.outputAsset.url) {
    try {
      const playUrl = await ossService.generateSignedUrl(
        task.outputAsset.url, 3600, { contentType: 'video/mp4' }
      );
      if (playUrl && task.outputAsset.dataValues) {
        task.outputAsset.dataValues.play_url = playUrl;
      }
    } catch (err) {
      console.error(
        `[VideoGeneration] toDetailWithPlayUrl failed for asset ${task.outputAsset.id}: ${err.message}`
      );
    }
  }

  // Phase UI-AICreation-02-B-1-G-O: 签名图片输出 URL（私有 Bucket 需签名 URL 才能预览）
  if (task.outputAsset && task.outputAsset.type === 'image' && task.outputAsset.url) {
    try {
      const signedUrl = await ossService.getSignedUrl(task.outputAsset.url);
      if (signedUrl && task.outputAsset.dataValues) {
        task.outputAsset.dataValues.url = signedUrl;
      }
    } catch (err) {
      console.error(
        `[VideoGeneration] toDetailWithPlayUrl image URL sign failed for task ${task.id}: ${err.message}`
      );
    }

    if (task.outputAsset.thumbnail) {
      try {
        const signedThumb = await ossService.getSignedUrl(task.outputAsset.thumbnail);
        if (signedThumb && task.outputAsset.dataValues) {
          task.outputAsset.dataValues.thumbnail = signedThumb;
        }
      } catch (err) {
        console.error(
          `[VideoGeneration] toDetailWithPlayUrl image thumbnail sign failed for task ${task.id}: ${err.message}`
        );
      }
    }
  }

  // Sprint 5.9: 签名缩略图 URL（与 computeThumbnailUrl 逻辑一致）
  const thumbUrl = computeThumbnailUrl(task);
  if (thumbUrl) {
    try {
      const signedThumb = await ossService.getSignedUrl(thumbUrl);
      if (signedThumb) {
        task._signedThumbnail = signedThumb;
      }
    } catch (err) {
      console.warn(
        `[VideoGeneration] toDetailWithPlayUrl thumbnail sign failed for task ${task.id}: ${err.message}`
      );
    }
  }

  return toDetail(task);
}

/**
 * 构建详情
 * 用于 GET /api/enterprise/video-generation/tasks/:id
 *
 * 返回完整信息，含 params、sourceAsset、outputAsset、errorMsg 等
 */
function toDetail(task) {
  const outputAsset = task.outputAsset || null;
  // Sprint 5.6: 视频资产使用签名 play_url
  const outputPlayUrl = (outputAsset && outputAsset.dataValues && outputAsset.dataValues.play_url)
    || (outputAsset && outputAsset.play_url)
    || (outputAsset ? outputAsset.url : null);

  const result = {
    id: task.id,
    status: task.status,
    taskType: task.task_type || null,
    model: task.model,
    prompt: task.prompt || '',
    negative_prompt: task.negative_prompt || null,
    params: task.params ? (typeof task.params === 'string' ? JSON.parse(task.params) : task.params) : null,
    videoUrl: outputPlayUrl || task.output_url || null,
    playUrl: outputPlayUrl || task.output_url || null,
    coverUrl: task.cover_url || (outputAsset ? outputAsset.thumbnail : null) || null,
    duration: task.duration || null,
    width: task.width || null,
    height: task.height || null,
    progress: task.progress || 0,
    errorMsg: task.error_msg || null,
    provider: task.provider,
    createdAt: task.created_at,
    completedAt: task.completed_at || null
  };

  // 关联 sourceAsset（仅暴露安全字段）
  if (task.sourceAsset) {
    result.sourceAsset = {
      id: task.sourceAsset.id,
      name: task.sourceAsset.name,
      url: task.sourceAsset.url,
      thumbnail: task.sourceAsset.thumbnail,
      type: task.sourceAsset.type,
      width: task.sourceAsset.width,
      height: task.sourceAsset.height
    };
  } else {
    result.sourceAsset = null;
  }

  // 关联 outputAsset（仅暴露安全字段，Sprint 5.6: 含 play_url）
  if (task.outputAsset) {
    result.outputAsset = {
      id: task.outputAsset.id,
      name: task.outputAsset.name,
      url: task.outputAsset.url,
      play_url: outputPlayUrl,
      thumbnail: task.outputAsset.thumbnail,
      type: task.outputAsset.type,
      duration: task.outputAsset.duration,
      width: task.outputAsset.width,
      height: task.outputAsset.height,
      size: task.outputAsset.size,
      mime_type: task.outputAsset.mime_type
    };
  } else {
    result.outputAsset = null;
  }

  return result;
}

/**
 * Sprint 5.6: 为视频 Asset 生成带签名的临时播放 URL
 *
 * 私有 OSS Bucket 需要签名 URL 才能直接播放视频。
 * 签名 URL 有效期 1 小时，浏览器可直接使用。
 *
 * @param {Object} asset - Asset 实例（需有 url 和 type 字段）
 * @returns {Promise<string|null>} 签名播放 URL，非视频或生成失败返回 null
 */
async function generateVideoPlayUrl(asset) {
  if (!asset || asset.type !== 'video' || !asset.url) return null;
  try {
    return await ossService.generateSignedUrl(asset.url, 3600, { contentType: 'video/mp4' });
  } catch (err) {
    console.error(`[VideoGeneration] generateVideoPlayUrl failed for asset ${asset.id}: ${err.message}`);
    return null;
  }
}

/**
 * 软删除条件：所有列表查询默认增加 deleted_at IS NULL
 */
function notDeleted() {
  return { deleted_at: { [Op.eq]: null } };
}

// ═══════════════════════════════════════════════════════════════════
//  内部函数：图片 OSS 存储 + Asset 闭环
// ═══════════════════════════════════════════════════════════════════

/**
 * 从 URL 下载图片，返回 buffer、mimeType、size
 *
 * @param {string} imageUrl - 图片 URL
 * @returns {Promise<{ buffer: Buffer, mimeType: string, size: number }>}
 */
function downloadImage(imageUrl) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new (require('url').URL)(imageUrl);
    } catch (_) {
      reject(new Error('Invalid image URL: cannot parse'));
      return;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      reject(new Error(`Invalid image URL scheme: ${parsedUrl.protocol}`));
      return;
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.get(imageUrl, { timeout: 60000 }, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImage(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Image download failed: HTTP ${res.statusCode}`));
        return;
      }

      const contentType = (res.headers['content-type'] || 'image/png')
        .toLowerCase().split(';')[0].trim();

      // 校验是否为图片类型
      if (!contentType.startsWith('image/')) {
        reject(new Error(`Invalid image content type: ${contentType}`));
        return;
      }

      const chunks = [];
      let totalSize = 0;

      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > 50 * 1024 * 1024) { // 50MB max
          req.destroy();
          reject(new Error('Image too large: exceeded 50MB'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          reject(new Error('Downloaded image is empty'));
          return;
        }
        resolve({ buffer, mimeType: contentType, size: buffer.length });
      });

      res.on('error', (err) => {
        reject(new Error(`Image download stream error: ${err.message}`));
      });
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Image download timeout'));
    });

    req.on('error', (err) => {
      reject(new Error(`Image download request error: ${err.message}`));
    });
  });
}

/**
 * 生成图片 OSS 存储 key
 */
function generateImageOssKey(enterpriseId, mimeType) {
  const date = new Date();
  const dateStr = date.getFullYear()
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0');
  const uuid = crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).substring(2, 10);

  let ext = '.png';
  if (mimeType) {
    const parts = mimeType.split('/');
    if (parts[1]) ext = '.' + parts[1].replace('jpeg', 'jpg');
  }

  return `enterprises/${enterpriseId}/images/${dateStr}/${uuid}${ext}`;
}

/**
 * 将 DashScope 图片转存到自有 OSS，创建 Asset 并关联 GenerationTask
 *
 * 幂等：若 task 已有 output_asset_id 则跳过
 *
 * @param {Object} task - GenerationTask 实例（含 update/reload 方法）
 * @param {number} enterpriseId
 * @param {number} userId
 * @param {string} imageUrl - DashScope 返回的图片 URL
 * @returns {Promise<Object>} 更新后的 task
 */
async function storeImageAndCreateAsset(task, enterpriseId, userId, imageUrl) {
  // ── 幂等检查：已有关联 Asset 则直接返回 ──────────────────────
  if (task.output_asset_id) {
    return task;
  }

  // ── 1. 下载图片 ──────────────────────────────────────────────
  let downloadResult;
  try {
    downloadResult = await downloadImage(imageUrl);
  } catch (downloadError) {
    console.error(`[VideoGeneration] Image download failed for task ${task.id}: ${downloadError.message}`);
    await task.update({
      status: 'failed',
      error_msg: formatErrorMsg('IMAGE_DOWNLOAD_FAILED', downloadError.message),
      completed_at: new Date()
    });
    await task.reload();
    return task;
  }

  // ── 2. 上传 OSS ──────────────────────────────────────────────
  const ossKey = generateImageOssKey(enterpriseId, downloadResult.mimeType);
  try {
    await ossService.putFile(ossKey, downloadResult.buffer, downloadResult.mimeType);
  } catch (ossError) {
    console.error(`[VideoGeneration] Image OSS upload failed for task ${task.id}: ${ossError.message}`);
    await task.update({
      status: 'failed',
      error_msg: formatErrorMsg('OSS_UPLOAD_FAILED', 'Failed to upload image to storage'),
      completed_at: new Date()
    });
    await task.reload();
    return task;
  }

  const accessUrl = ossService.getFileUrl(ossKey);

  // ── 3. 创建图片 Asset ───────────────────────────────────────
  let asset;
  try {
    asset = await Asset.create({
      enterprise_id: enterpriseId,
      user_id: userId,
      type: 'image',
      name: generateImageName(task),
      url: accessUrl,
      thumbnail: accessUrl,
      size: downloadResult.size,
      mime_type: downloadResult.mimeType,
      width: task.width || null,
      height: task.height || null,
      category: 'ai_generated',
      audit_status: 'pass'
    });
  } catch (assetError) {
    console.error(`[VideoGeneration] Image Asset creation failed for task ${task.id}: ${assetError.message}`);
    await task.update({
      status: 'failed',
      error_msg: formatErrorMsg('ASSET_CREATE_FAILED', 'Failed to create image asset'),
      completed_at: new Date()
    });
    await task.reload();
    return task;
  }

  // ── 4. 更新 GenerationTask 关联 ─────────────────────────────
  await task.update({
    output_asset_id: asset.id,
    output_url: accessUrl,
    status: 'success',
    progress: 100,
    completed_at: new Date()
  });
  await task.reload();

  return task;
}

// ═══════════════════════════════════════════════════════════════════
//  内部函数：视频 OSS 存储 + Asset 闭环
// ═══════════════════════════════════════════════════════════════════

/**
 * 将 DashScope 视频转存到自有 OSS，创建 Asset 并关联 GenerationTask
 *
 * 幂等：若 task 已有 output_asset_id 则跳过
 *
 * @param {Object} task - GenerationTask 实例（含 update/reload 方法）
 * @param {number} enterpriseId
 * @param {number} userId
 * @param {string} videoUrl - DashScope 返回的视频 URL
 * @param {string} coverUrl - 视频封面 URL（可选）
 * @param {number} duration - 视频时长（可选）
 * @returns {Promise<Object>} 更新后的 task
 */
async function storeVideoAndCreateAsset(task, enterpriseId, userId, videoUrl, coverUrl, duration) {
  // ── 幂等检查：已有关联 Asset 则直接返回 ──────────────────────
  if (task.output_asset_id) {
    return task;
  }

  // ── 1. 下载视频 + 上传 OSS ──────────────────────────────────
  let storageResult;
  try {
    storageResult = await videoStorageService.downloadAndStore({
      videoUrl,
      enterpriseId
    });
  } catch (storageError) {
    // 存储失败时标记任务为 failed
    console.error(`[VideoGeneration] Storage failed for task ${task.id}: ${storageError.message}`);
    await task.update({
      status: 'failed',
      error_msg: formatErrorMsg(storageError.code || 'STORAGE_FAILED', storageError.message),
      completed_at: new Date()
    });
    await task.reload();
    return task;
  }

  // ── 2. 创建视频 Asset ───────────────────────────────────────
  let asset;
  try {
    asset = await Asset.create({
      enterprise_id: enterpriseId,
      user_id: userId,
      type: 'video',
      name: generateVideoName(task),
      url: storageResult.video.url,
      thumbnail: storageResult.cover.ossKey || storageResult.cover.url || null,
      size: storageResult.size,
      mime_type: storageResult.mimeType,
      duration: duration || null,
      width: task.width || null,
      height: task.height || null,
      category: 'ai_generated',
      audit_status: 'pass'
    });
  } catch (assetError) {
    console.error(`[VideoGeneration] Asset creation failed for task ${task.id}: ${assetError.message}`);
    await task.update({
      status: 'failed',
      error_msg: formatErrorMsg('ASSET_CREATE_FAILED', 'Failed to create video asset'),
      completed_at: new Date()
    });
    await task.reload();
    return task;
  }

  // ── 3. 更新 GenerationTask 关联 ─────────────────────────────
  // Sprint 5.7: cover_url 优先使用 videoStorageService 生成的封面
  const finalCoverUrl = storageResult.cover.ossKey || storageResult.cover.url || coverUrl || null;

  await task.update({
    output_asset_id: asset.id,
    output_url: storageResult.video.url,
    cover_url: finalCoverUrl,
    duration: duration || null,
    status: 'success',
    progress: 100,
    completed_at: new Date()
  });
  await task.reload();

  return task;
}

// ═══════════════════════════════════════════════════════════════════
//  公开接口
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/enterprise/video-generation/tasks
 *
 * Sprint 4.7: 切换到 GenerationService → Provider Router → Aliyun Provider 架构
 *
 * Controller 只负责：参数校验、权限检查、返回结果
 * 禁止：Controller 直接调用 dashscopeService 或具体 Provider
 *
 * 请求体：
 *   sourceAssetId  - 图片素材ID（必填）
 *   prompt         - 正向提示词（必填）
 *   negativePrompt - 负向提示词（可选）
 *   templateId     - 创作模板ID（可选，默认 image_to_video）
 *   model          - 模型ID（可选，用于覆盖模板默认模型）
 *   duration       - 视频时长（可选）
 *   params         - 扩展参数（可选）
 *
 * 流程：
 *   Controller
 *     ↓ (参数校验 + 权限检查)
 *   GenerationService.createGenerationTask()
 *     ↓ (模板解析 + 任务创建)
 *   Provider Router
 *     ↓ (provider 路由)
 *   Aliyun Provider
 *     ↓ (模型匹配 + API 调用)
 *   DashScope Client (dashscope-client.js)
 *     ↓ (HTTP 通信)
 *   DashScope API
 */
exports.createTask = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const userId = req.user.userId;
    const { sourceAssetId, prompt, negativePrompt, templateId, duration, params, model } = req.body;

    // ── 1. 参数校验（Controller 层）─────────────────────────────
    if (!sourceAssetId) {
      return res.fail('素材ID不能为空');
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.fail('提示词不能为空');
    }
    if (prompt.trim().length > 2000) {
      return res.fail('提示词不能超过2000字');
    }

    // ── 2. 权限检查：Asset 归属校验 ─────────────────────────────
    const asset = await Asset.findByPk(sourceAssetId);
    if (!asset) {
      return res.fail('素材不存在');
    }
    if (asset.enterprise_id !== enterpriseId) {
      return res.fail('无权访问该素材');
    }

    // ── 3. 获取图片可访问 URL（私有Bucket需签名URL）─────────────
    const imageUrl = await ossService.getSignedUrl(asset.url) || asset.url;
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      return res.fail('素材URL无效');
    }

    // ── 4. 调用 GenerationService 创建任务 ──────────────────────
    //     业务逻辑（模板解析、Provider 调用、任务持久化）由 Service 层处理

    // Sprint 5.3: 增强日志 - 记录请求摘要
    console.log(
      `[VideoGeneration] createTask REQUEST | ` +
      `enterpriseId=${enterpriseId} | ` +
      `sourceAssetId=${sourceAssetId} | ` +
      `templateId=${templateId || 'image_to_video'} | ` +
      `prompt_len=${prompt.trim().length} | ` +
      `has_negative=${!!negativePrompt} | ` +
      `model=${model || 'N/A'} | ` +
      `imageUrl=${imageUrl ? imageUrl.substring(0, 80) + '...' : '(missing)'} | ` +
      `duration=${duration || 'N/A'} | ` +
      `has_params=${!!params} | ` +
      `time=${new Date().toISOString()}`
    );

    const result = await generationService.createGenerationTask({
      enterpriseId,
      userId,
      templateId: templateId || 'image_to_video',
      prompt: prompt.trim(),
      negativePrompt,
      imageUrl: imageUrl.trim(),
      sourceAssetId,
      duration,
      model,
      options: params
    });

    // ── 5. 返回结果 ────────────────────────────────────────────
    return res.success({
      id: result.id,
      task_id: result.taskId,
      status: result.status,
      provider: result.provider,
      model: result.model,
      created_at: result.createdAt
    });
  } catch (error) {
    // Sprint 5.3: 增强错误日志 - 记录完整错误上下文
    console.error(
      `[VideoGeneration] createTask ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `code=${error.code || 'N/A'} | ` +
      `statusCode=${error.statusCode || 'N/A'} | ` +
      `provider=${error.provider || 'N/A'} | ` +
      `retryable=${error.retryable !== undefined ? error.retryable : 'N/A'} | ` +
      `stack=${(error.stack || '').split('\n').slice(0, 3).join(' | ')} | ` +
      `time=${new Date().toISOString()}`
    );

    // ProviderError 返回脱敏后的错误信息
    if (error.name === 'ProviderError') {
      return res.fail(error.message, error.statusCode || 500);
    }

    return res.fail('服务器内部错误', 500);
  }
};

/**
 * POST /api/enterprise/video-generation/text-to-video
 *
 * Phase UI-AICreation-07-B: 文生视频专用接口
 *
 * 复用 generationService.createGenerationTask() 新架构，
 * 支持 prompt、negativePrompt、duration、params、model。
 *
 * 与 createTask（图生视频）的区别：
 *   - 不要求 sourceAssetId（文生视频无需输入图片）
 *   - 默认 templateId = 'text_to_video'
 *
 * 请求体：
 *   prompt         - 正向提示词（必填）
 *   negativePrompt - 负向提示词（可选）
 *   duration       - 视频时长（可选，默认 5s）
 *   params         - 扩展参数（可选）：aspectRatio, motionStrength, cameraMovement, quality
 *   model          - 模型ID（可选，用于覆盖模板默认模型）
 *
 * 流程：
 *   Controller
 *     ↓ (参数校验)
 *   GenerationService.createGenerationTask()
 *     ↓ (模板解析 + 任务创建)
 *   Aliyun Provider → video-provider._createTextToVideo()
 *     ↓ (模型匹配 + API 调用)
 *   DashScope Client → dashscopeService.submitText2Video()
 *     ↓ (HTTP 通信)
 *   DashScope API
 */
exports.createTextToVideoTask = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const userId = req.user.userId;
    const { prompt, negativePrompt, duration, params, model } = req.body;

    // ── 1. 参数校验（Controller 层）─────────────────────────────
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.fail('提示词不能为空');
    }
    if (prompt.trim().length > 2000) {
      return res.fail('提示词不能超过2000字');
    }

    // ── 2. 调用 GenerationService 创建任务 ──────────────────────
    console.log(
      `[VideoGeneration] createTextToVideoTask REQUEST | ` +
      `enterpriseId=${enterpriseId} | ` +
      `prompt_len=${prompt.trim().length} | ` +
      `has_negative=${!!negativePrompt} | ` +
      `model=${model || 'N/A'} | ` +
      `duration=${duration || 'N/A'} | ` +
      `has_params=${!!params} | ` +
      `time=${new Date().toISOString()}`
    );

    const result = await generationService.createGenerationTask({
      enterpriseId,
      userId,
      templateId: 'text_to_video',
      prompt: prompt.trim(),
      negativePrompt,
      duration,
      model,
      options: params
    });

    // ── 3. 返回结果 ────────────────────────────────────────────
    return res.success({
      id: result.id,
      task_id: result.taskId,
      status: result.status,
      provider: result.provider,
      model: result.model,
      created_at: result.createdAt
    });
  } catch (error) {
    console.error(
      `[VideoGeneration] createTextToVideoTask ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `code=${error.code || 'N/A'} | ` +
      `statusCode=${error.statusCode || 'N/A'} | ` +
      `provider=${error.provider || 'N/A'} | ` +
      `retryable=${error.retryable !== undefined ? error.retryable : 'N/A'} | ` +
      `time=${new Date().toISOString()}`
    );

    // ProviderError 返回脱敏后的错误信息
    if (error.name === 'ProviderError') {
      return res.fail(error.message, error.statusCode || 500);
    }

    return res.fail('服务器内部错误', 500);
  }
};

/**
 * POST /api/enterprise/video-generation/text-to-image
 *
 * Phase UI-AICreation-02-B-1-A: 图片生成接口
 *
 * Controller 只负责：参数校验、权限检查、调用 generationService.generateImage()
 *
 * 请求体（来自前端 studioStartGenerate imageGen 分支）：
 *   prompt   - 正向提示词（必填）
 *   style    - 图片风格（可选，默认 'realistic'）
 *   ratio    - 画面比例（可选，默认 '16:9'）
 *   count    - 生成数量（可选，默认 4）
 *   modelId  - 模型 ID，用作 templateId（可选）
 *
 * 流程：
 *   Controller
 *     ↓ (参数校验)
 *   GenerationService.generateImage()
 *     ↓ (模板解析 + 任务创建)
 *   Aliyun Provider
 *     ↓ (API 调用)
 *   DashScope API
 */
exports.createImageTask = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const userId = req.user.userId;
    const { prompt, style, ratio, modelId, templateId } = req.body;

    // ── 1. 参数校验（Controller 层）─────────────────────────────
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.fail('提示词不能为空');
    }
    if (prompt.trim().length > 2000) {
      return res.fail('提示词不能超过2000字');
    }

    // ── 2. 组装 options ──────────────────────────────────────────
    // Phase UI-AICreation-02-B-1-G-M-E: 文生图像固定生成1张图片
    // qwen-image-3.0-pro multimodal-generation 端点每次生成1张（同步）
    // Phase UI-AICreation-02-B-1-G-M-I: 传递 modelId 用于备用模型选择
    const options = {
      style: style || 'realistic',
      ratio: ratio || '16:9',
      modelId: modelId || null
    };

    // ── 3. 调用 GenerationService.generateImage() ────────────────
    console.log(
      `[VideoGeneration] createImageTask REQUEST | ` +
      `enterpriseId=${enterpriseId} | ` +
      `templateId=${templateId || 'image_generation'} | ` +
      `prompt_len=${prompt.trim().length} | ` +
      `style=${options.style} | ` +
      `ratio=${options.ratio} | ` +
      `time=${new Date().toISOString()}`
    );

    const result = await generationService.generateImage({
      enterpriseId,
      userId,
      templateId: templateId || 'image_generation',
      prompt: prompt.trim(),
      options
    });

    // ── 4. 返回结果 ────────────────────────────────────────────
    // Phase UI-AICreation-02-B-1-G-M-G: 返回 results 和 output_url 给前端
    const responsePayload = {
      id: result.id,
      task_id: result.taskId,
      status: result.status,
      provider: result.provider,
      model: result.model,
      created_at: result.createdAt,
      results: result.results || [],
      output_url: result.results?.[0]?.url || null
    };

    return res.success(responsePayload);
  } catch (error) {
    console.error(
      `[VideoGeneration] createImageTask ERROR | ` +
      `name=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `code=${error.code || 'N/A'} | ` +
      `statusCode=${error.statusCode || 'N/A'} | ` +
      `provider=${error.provider || 'N/A'} | ` +
      `retryable=${error.retryable !== undefined ? error.retryable : 'N/A'} | ` +
      `time=${new Date().toISOString()}`
    );

    if (error.name === 'ProviderError') {
      return res.fail(error.message, error.statusCode || 500);
    }

    return res.fail('服务器内部错误', 500);
  }
};

/**
 * GET /api/enterprise/video-generation/tasks
 *
 * Sprint 3.3: 作品列表接口
 * Sprint 4.7 Patch1: 强化错误处理，确保不调用 Provider/GenerationService
 *
 * 查询参数：
 *   page     - 页码，默认 1
 *   pageSize - 每页条数，默认 20
 *   status   - 按状态筛选（可选）：pending | processing | success | failed
 *   task_type- 按任务类型筛选（可选）
 *
 * 排序：created_at DESC（最新任务排最前）
 *
 * 返回轻量结构：
 *   { total, page, pageSize, items: [{ id, status, prompt, task_type, coverUrl, videoUrl, duration, progress, createdAt }] }
 *
 * 自动过滤软删除记录（deleted_at IS NULL）
 *
 * 设计约束：
 *   - 仅查询 GenerationTask 表 + Asset 关联
 *   - 不调用 GenerationService / Provider Router / Aliyun API
 *   - 不写入数据库
 *   - 只读操作，幂等
 */
exports.listTasks = async (req, res) => {
  try {
    // ── 1. 身份校验 ────────────────────────────────────────────
    const enterpriseId = req.user?.enterpriseId;
    if (!enterpriseId) {
      return res.fail('用户身份信息缺失', 401);
    }

    // ── 2. 参数解析与校验 ──────────────────────────────────────
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const status = req.query.status || null;
    const taskType = req.query.task_type || null;

    // 校验 status 合法值（支持逗号分隔的多状态查询，如 ?status=pending,processing）
    const VALID_STATUSES = ['pending', 'processing', 'success', 'failed'];
    let statusFilter = null;
    if (status) {
      statusFilter = status.split(',').map(s => s.trim()).filter(s => VALID_STATUSES.includes(s));
      if (statusFilter.length === 0) {
        return res.fail('无效的状态筛选参数', 400);
      }
    }

    // ── 3. 构建查询条件 ────────────────────────────────────────
    const where = {
      enterprise_id: enterpriseId,
      ...notDeleted()
    };

    if (statusFilter) {
      where.status = statusFilter.length === 1 ? statusFilter[0] : { [Op.in]: statusFilter };
    }

    if (taskType) {
      where.task_type = taskType;
    }

    // ── 4. 数据库查询（只读，不调用任何 Provider/外部 API）────
    const { count, rows } = await GenerationTask.findAndCountAll({
      where,
      include: [
        {
          model: Asset,
          as: 'sourceAsset',
          attributes: ['id', 'url', 'thumbnail', 'type'],
          required: false
        },
        {
          model: Asset,
          as: 'outputAsset',
          attributes: ['id', 'url', 'thumbnail', 'type', 'duration', 'mime_type'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize
    });

    // ── 5. Sprint 5.6: 为视频输出资产动态生成签名播放 URL ────
    //     私有 OSS Bucket 需要签名 URL，前端直接用签名 URL 播放视频
    //     Sprint 5.9: 同时为缩略图 URL 生成签名，确保私有 Bucket 下图片可加载
    for (const row of rows) {
      // 5a. 签名视频播放 URL
      if (row.outputAsset && row.outputAsset.type === 'video' && row.outputAsset.url) {
        try {
          const playUrl = await ossService.generateSignedUrl(
            row.outputAsset.url, 3600, { contentType: 'video/mp4' }
          );
          if (playUrl) {
            row.outputAsset.dataValues.play_url = playUrl;
          }
        } catch (err) {
          console.error(
            `[VideoGeneration] listTasks signed URL failed for asset ${row.outputAsset.id}: ${err.message}`
          );
        }
      }

      // 5b. Phase UI-AICreation-02-B-1-G-O: 签名图片输出 URL（私有 Bucket 需签名 URL 才能预览）
      if (row.outputAsset && row.outputAsset.type === 'image' && row.outputAsset.url) {
        try {
          const signedUrl = await ossService.getSignedUrl(row.outputAsset.url);
          if (signedUrl) {
            row.outputAsset.dataValues.url = signedUrl;
          }
        } catch (err) {
          // 降级：签名失败时使用原始 URL（不影响列表渲染）
          console.warn(
            `[VideoGeneration] listTasks image URL sign failed for asset ${row.outputAsset.id}: ${err.message}`
          );
        }

        if (row.outputAsset.thumbnail) {
          try {
            const signedThumb = await ossService.getSignedUrl(row.outputAsset.thumbnail);
            if (signedThumb) {
              row.outputAsset.dataValues.thumbnail = signedThumb;
            }
          } catch (err) {
            console.warn(
              `[VideoGeneration] listTasks image thumbnail sign failed: ${err.message}`
            );
          }
        }
      }

      // 5c. Sprint 5.9: 签名缩略图 URL（与 computeThumbnailUrl 逻辑一致）
      const thumbUrl = computeThumbnailUrl(row);
      if (thumbUrl) {
        try {
          const signedThumb = await ossService.getSignedUrl(thumbUrl);
          if (signedThumb) {
            row._signedThumbnail = signedThumb;
          }
        } catch (err) {
          // 降级：签名失败时使用原始 URL（不影响列表渲染）
          console.warn(
            `[VideoGeneration] listTasks thumbnail sign failed for task ${row.id}: ${err.message}`
          );
        }
      }
    }

    // ── 6. 转换为轻量列表结构 ──────────────────────────────────
    const items = rows.map(toListItem);

    res.success({
      total: count,
      page,
      pageSize,
      items
    });
  } catch (error) {
    // ── 错误日志（脱敏，不记录用户数据）────────────────────────
    console.error(
      `[VideoGeneration] listTasks error | ` +
      `type=${error.name || 'Unknown'} | ` +
      `message=${error.message || '(no message)'} | ` +
      `time=${new Date().toISOString()}`
    );

    // 区分数据库错误和其他错误
    if (error.name === 'SequelizeDatabaseError') {
      return res.fail('数据库查询异常，请联系管理员', 500);
    }
    if (error.name === 'SequelizeConnectionError' || error.name === 'SequelizeConnectionRefusedError') {
      return res.fail('数据库连接失败，请稍后重试', 500);
    }

    return res.fail('服务器内部错误', 500);
  }
};

/**
 * GET /api/enterprise/video-generation/tasks/:id
 *
 * Sprint 2.5 + Sprint 3.3: 作品详情接口
 *
 * 流程：
 *   1. 根据 GenerationTask.id + enterprise_id 查询任务
 *   2. 若 deleted_at 不为空 → 返回 404
 *   3. 若 success 且有 output_asset_id → 返回格式化详情
 *   4. 若 success 但无 output_asset_id → 补做视频转存 + Asset 创建
 *   5. 若 failed → 返回格式化详情
 *   6. 若 pending / processing → 调用 DashScope 同步状态
 *      - 同步为 success → 下载视频 → 上传 OSS → 创建 Asset → 关联 → 返回
 *      - 同步为 failed → 更新错误信息 → 返回
 *      - 同步仍 pending/processing → 更新进度 → 返回
 *
 * 返回完整详情（toDetail 格式化）
 *
 * 幂等：
 *   - 同一个任务不会重复上传视频或创建 Asset
 *
 * 安全：
 *   - enterprise_id 隔离，不能查询其他企业任务
 *   - 已删除任务返回 404
 */
exports.getTask = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const userId = req.user.userId;
    const taskId = req.params.id;

    // ── 1. 查询任务（企业隔离）──────────────────────────────────
    const task = await GenerationTask.findOne({
      where: {
        id: taskId,
        enterprise_id: enterpriseId
      },
      include: [
        { model: Asset, as: 'sourceAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'width', 'height'], required: false },
        { model: Asset, as: 'outputAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'duration', 'width', 'height', 'size', 'mime_type'], required: false }
      ]
    });

    if (!task) {
      return res.fail('任务不存在', 404);
    }

    // ── Sprint 3.3: 已删除任务返回 404 ─────────────────────────
    if (task.deleted_at) {
      return res.fail('任务不存在', 404);
    }

    // ── 2. success 且有 output_asset_id → 返回格式化详情（终态）─
    if (task.status === 'success' && task.output_asset_id) {
      return res.success(await toDetailWithPlayUrl(task));
    }

    // ── 3. success 但无 output_asset_id → 补做存储闭环 ─────────
    if (task.status === 'success' && !task.output_asset_id) {
      // Phase UI-AICreation-02-B-1-G-N: 图片任务 → 图片存储闭环
      if (task.task_type === 'text2image' || task.task_type === 'image_generation') {
        if (task.output_url) {
          const storedTask = await storeImageAndCreateAsset(
            task, enterpriseId, userId, task.output_url
          );
          const reloaded = await GenerationTask.findByPk(storedTask.id, {
            include: [
              { model: Asset, as: 'sourceAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'width', 'height'], required: false },
              { model: Asset, as: 'outputAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'duration', 'width', 'height', 'size', 'mime_type'], required: false }
            ]
          });
          return res.success(await toDetailWithPlayUrl(reloaded || storedTask));
        }
        return res.success(await toDetailWithPlayUrl(task));
      }
      if (task.output_url) {
        const storedTask = await storeVideoAndCreateAsset(
          task, enterpriseId, userId,
          task.output_url, task.cover_url, task.duration
        );
        // 重新加载关联
        const reloaded = await GenerationTask.findByPk(storedTask.id, {
          include: [
            { model: Asset, as: 'sourceAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'width', 'height'], required: false },
            { model: Asset, as: 'outputAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'duration', 'width', 'height', 'size', 'mime_type'], required: false }
          ]
        });
        return res.success(await toDetailWithPlayUrl(reloaded || storedTask));
      }
      // 无 output_url 则无法转存，直接返回
      return res.success(await toDetailWithPlayUrl(task));
    }

    // ── 4. failed → 返回格式化详情 ──────────────────────────────
    if (task.status === 'failed') {
      return res.success(await toDetailWithPlayUrl(task));
    }

    // ── 5. pending / processing → 同步 DashScope 状态 ───────────
    if (task.status === 'pending' || task.status === 'processing') {
      // 无 task_id 时无法同步，直接返回 DB 状态
      if (!task.task_id) {
        return res.success(await toDetailWithPlayUrl(task));
      }

      try {
        // Sprint 4.7: 通过 GenerationService → Provider Router → Aliyun Provider 查询状态
        const statusResult = await generationService.getTaskStatus(task.provider, task.task_id);

        const updateData = {};

        // 状态更新
        if (statusResult.status && statusResult.status !== task.status) {
          updateData.status = statusResult.status;
        }

        // Sprint 5.7: 真实进度估算
        // DashScope 不提供百分比进度，使用时间估算：
        //   pending → 0%，processing → 10-90%（基于已用时间），success → 100%
        if (statusResult.status === 'pending') {
          updateData.progress = 0;
        } else if (statusResult.status === 'processing') {
          const elapsed = task.started_at
            ? Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000)
            : 0;
          // 预估总时间：60-180 秒（取决于视频时长和复杂度）
          const estTotal = Math.max(60, Math.min(180, (task.duration || 5) * 15));
          // 保留 10% 给排队阶段，80% 给实际生成
          const genProgress = elapsed > 0 ? Math.min(80, Math.floor((elapsed / estTotal) * 80)) : 0;
          updateData.progress = Math.max(10, Math.min(90, 10 + genProgress));
        } else if (statusResult.status === 'success') {
          updateData.progress = 100;
        }
        // 如果 Provider 已经返回了有效进度，则优先使用 Provider 的进度
        if (statusResult.progress !== null && statusResult.progress !== undefined && statusResult.progress > 0) {
          updateData.progress = statusResult.progress;
        }

        // 输出 URL（DashScope 返回的临时 URL）
        if (statusResult.outputUrl) {
          updateData.output_url = statusResult.outputUrl;
        }

        // 封面 URL
        if (statusResult.coverUrl) {
          updateData.cover_url = statusResult.coverUrl;
        }

        // 时长
        if (statusResult.duration) {
          updateData.duration = statusResult.duration;
        }

        // 失败信息
        if (statusResult.status === 'failed') {
          updateData.error_msg = formatErrorMsg(
            statusResult.errorCode,
            statusResult.errorMessage
          );
          updateData.completed_at = new Date();
        }

        // 先写 DB
        if (Object.keys(updateData).length > 0) {
          await task.update(updateData);
          await task.reload();
        }

        // ── 同步结果为 success → 转存到自有 OSS ──────────────
        if (task.status === 'success' && !task.output_asset_id) {
          // Phase UI-AICreation-02-B-1-G-N: 图片任务 → 图片存储闭环
          if (task.task_type === 'text2image' || task.task_type === 'image_generation') {
            const imageUrl = task.output_url || statusResult.outputUrl;
            if (imageUrl) {
              const storedTask = await storeImageAndCreateAsset(
                task, enterpriseId, userId, imageUrl
              );
              const reloaded = await GenerationTask.findByPk(storedTask.id, {
                include: [
                  { model: Asset, as: 'sourceAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'width', 'height'], required: false },
                  { model: Asset, as: 'outputAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'duration', 'width', 'height', 'size', 'mime_type'], required: false }
                ]
              });
              return res.success(await toDetailWithPlayUrl(reloaded || storedTask));
            }
            const reloaded = await GenerationTask.findByPk(task.id, {
              include: [
                { model: Asset, as: 'sourceAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'width', 'height'], required: false },
                { model: Asset, as: 'outputAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'duration', 'width', 'height', 'size', 'mime_type'], required: false }
              ]
            });
            return res.success(await toDetailWithPlayUrl(reloaded || task));
          }
          const videoUrl = task.output_url || statusResult.outputUrl;
          if (videoUrl) {
            const storedTask = await storeVideoAndCreateAsset(
              task, enterpriseId, userId,
              videoUrl,
              task.cover_url || statusResult.coverUrl,
              task.duration || statusResult.duration
            );
            // 重新加载关联
            const reloaded = await GenerationTask.findByPk(storedTask.id, {
              include: [
                { model: Asset, as: 'sourceAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'width', 'height'], required: false },
                { model: Asset, as: 'outputAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'duration', 'width', 'height', 'size', 'mime_type'], required: false }
              ]
            });
            return res.success(await toDetailWithPlayUrl(reloaded || storedTask));
          }
        }

        // 重新加载带关联
        const reloaded = await GenerationTask.findByPk(task.id, {
          include: [
            { model: Asset, as: 'sourceAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'width', 'height'], required: false },
            { model: Asset, as: 'outputAsset', attributes: ['id', 'name', 'url', 'thumbnail', 'type', 'duration', 'width', 'height', 'size', 'mime_type'], required: false }
          ]
        });
        return res.success(await toDetailWithPlayUrl(reloaded || task));
      } catch (syncError) {
        // 同步失败不阻塞，返回当前 DB 状态
        console.error('[VideoGeneration] getTask sync error:', syncError.message);
        return res.success(await toDetailWithPlayUrl(task));
      }
    }

    // ── 兜底返回 ────────────────────────────────────────────────
    return res.success(await toDetailWithPlayUrl(task));
  } catch (error) {
    console.error('[VideoGeneration] getTask error:', error.message);
    return res.fail('服务器内部错误', 500);
  }
};

/**
 * DELETE /api/enterprise/video-generation/tasks/:id
 *
 * Sprint 3.3: 软删除作品
 *
 * 删除逻辑：
 *   1. JWT 鉴权 → 验证 enterprise_id
 *   2. 查询任务，验证归属
 *   3. 若已删除 → 返回 404
 *   4. 更新 deleted_at = NOW()
 *
 * 不执行物理删除。
 * 不删除关联的 GenerationTask 记录。
 * 不删除关联的 Asset 记录。
 * 不删除 OSS 上的视频文件。
 *
 * 设计理由（注释保留以供未来参考）：
 *   当前采用软删除。未来增加 OSS 生命周期清理任务。
 *   避免：误删除、数据恢复困难、审计困难。
 *   待未来 Sprint 实现：定时任务扫描 expired_at 超过保留期的记录，逐条清理 OSS 文件后再物理删除。
 */
exports.deleteTask = async (req, res) => {
  try {
    const enterpriseId = req.user.enterpriseId;
    const taskId = req.params.id;

    // ── 1. 查询任务（企业隔离）──────────────────────────────────
    const task = await GenerationTask.findOne({
      where: {
        id: taskId,
        enterprise_id: enterpriseId
      }
    });

    if (!task) {
      return res.fail('任务不存在', 404);
    }

    // ── 2. 已删除的任务返回 404 ─────────────────────────────────
    if (task.deleted_at) {
      return res.fail('任务不存在', 404);
    }

    // ── 3. 软删除：设置 deleted_at ──────────────────────────────
    await task.update({ deleted_at: new Date() });

    return res.success({ id: task.id, deleted_at: task.deleted_at }, '删除成功');
  } catch (error) {
    console.error('[VideoGeneration] deleteTask error:', error.message);
    return res.fail('服务器内部错误', 500);
  }
};

/**
 * GET /api/enterprise/video-generation/templates
 *
 * Sprint 4.4 Patch3: 获取可用创作模板列表
 *
 * 查询参数：
 *   outputType - 按输出类型筛选（可选）：'image' | 'video'
 *
 * 返回全部阿里云百炼创作模板，不包含第三方模型。
 * 前端不直接展示模型名称，仅展示创作类型。
 */
exports.getTemplates = async (req, res) => {
  try {
    const outputType = req.query.outputType || null;
    const templates = getTemplatesByOutput(outputType);

    // 返回安全字段（不暴露内部实现细节）
    const safeTemplates = templates.map(t => {
      const model = getModelConfig(t.modelId);
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        capability: model ? model.capability : null,
        category: model ? model.category : null,
        categoryLabel: model ? model.categoryLabel : null,
        icon: t.icon,
        outputType: model ? model.outputType : null,
        sort: t.sort,
        providerLabel: '阿里云百炼'
      };
    });

    return res.success(safeTemplates);
  } catch (error) {
    console.error('[VideoGeneration] getTemplates error:', error.message);
    return res.fail('服务器内部错误', 500);
  }
};
