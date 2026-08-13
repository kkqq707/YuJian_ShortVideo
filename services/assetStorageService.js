/**
 * Asset Storage Service — 通用 Asset 持久化层
 *
 * Phase DigitalHuman-Rebuild-004 Step4-D5
 *
 * 职责：
 *   1. 创建 Asset 记录（封装 Asset.create）
 *   2. 参数校验与类型映射
 *   3. 统一的错误处理
 *
 * 设计原则：
 *   - 纯持久化层，不涉及 OSS 上传
 *   - 不操作 PipelineTask
 *   - 不调用 Provider
 *   - 参数白名单校验
 *
 * 禁止：
 *   ❌ OSS 操作（由调用方在调用前完成）
 *   ❌ PipelineTask 操作
 *   ❌ Provider 调用
 */

const { Asset } = require('../models');
const ProviderError = require('../utils/ProviderError');

// ─── 允许的 Asset 类型 ──────────────────────────────────────────────
const VALID_TYPES = ['image', 'video', 'audio', 'other'];

class AssetStorageService {
  /**
   * 创建 Asset 记录
   *
   * @param {Object}  params
   * @param {number}  params.enterpriseId  — 企业 ID（必填）
   * @param {number}  params.userId        — 用户 ID（必填）
   * @param {string}  params.type          — 素材类型: 'audio' | 'video' | 'image' | 'other'（必填）
   * @param {string}  params.url           — OSS 访问 URL（必填）
   * @param {string}  [params.name]        — 文件名
   * @param {number}  [params.size]        — 文件大小(bytes)
   * @param {number}  [params.duration]    — 时长(秒)
   * @param {number}  [params.width]       — 宽度
   * @param {number}  [params.height]      — 高度
   * @param {string}  [params.mimeType]    — MIME 类型
   * @param {string}  [params.thumbnail]   — 缩略图/封面 URL
   * @param {string}  [params.category]    — 分类（默认 'digital-human'）
   * @returns {Promise<Object>} Asset instance (plain object)
   * @throws {ProviderError}
   */
  async createAsset(params) {
    const {
      enterpriseId, userId, type, url,
      name, size, duration, width, height,
      mimeType, thumbnail, category
    } = params || {};

    // ── 1. 必填参数校验 ──────────────────────────────────────────
    if (!enterpriseId) {
      throw new ProviderError('system', 'VALIDATION', 'Enterprise ID is required', false);
    }
    if (!userId) {
      throw new ProviderError('system', 'VALIDATION', 'User ID is required', false);
    }
    if (!type || !VALID_TYPES.includes(type)) {
      throw new ProviderError(
        'system', 'VALIDATION',
        `Invalid asset type: "${type}". Must be one of: ${VALID_TYPES.join(', ')}`,
        false
      );
    }
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new ProviderError('system', 'VALIDATION', 'Asset URL is required', false);
    }

    // ── 2. 构建 Asset 数据 ──────────────────────────────────────
    const assetData = {
      enterprise_id: enterpriseId,
      user_id: userId,
      type,
      url: url.trim(),
      category: category || 'digital-human',
      name: name || null,
      size: size || 0,
      duration: duration || null,
      width: width || null,
      height: height || null,
      mime_type: mimeType || null,
      thumbnail: thumbnail || null,
      audit_status: 'pending'
    };

    // ── 3. 创建 Asset 记录 ──────────────────────────────────────
    try {
      const asset = await Asset.create(assetData);

      console.log(
        `[AssetStorageService] Asset created | ` +
        `id=${asset.id} | type=${type} | ` +
        `size=${assetData.size} | ` +
        `time=${new Date().toISOString()}`
      );

      return asset;
    } catch (error) {
      console.error(
        `[AssetStorageService] createAsset FAILED | ` +
        `type=${type} | enterpriseId=${enterpriseId} | ` +
        `error=${error.message} | time=${new Date().toISOString()}`
      );
      throw new ProviderError(
        'system', 'ASSET_CREATE_FAILED',
        `Failed to create Asset: ${error.message}`,
        false, null, error
      );
    }
  }

  /**
   * 从 TTS 结果构建 Audio Asset 参数
   *
   * @param {Object} ttsResult — TTS synthesis result
   * @param {number} enterpriseId
   * @param {number} userId
   * @returns {Object} 可用于 createAsset() 的参数
   */
  buildAudioAssetParams(ttsResult, enterpriseId, userId) {
    return {
      enterpriseId,
      userId,
      type: 'audio',
      url: ttsResult.audioUrl || '',
      name: `tts_audio_${Date.now()}.${ttsResult.format || 'mp3'}`,
      size: ttsResult.fileSize || 0,
      duration: ttsResult.duration || null,
      mimeType: ttsResult.format === 'pcm'
        ? 'audio/pcm'
        : ttsResult.format === 'wav'
          ? 'audio/wav'
          : 'audio/mpeg',
      category: 'digital-human'
    };
  }

  /**
   * 从视频存储结果构建 Video Asset 参数
   *
   * @param {Object} videoResult  — videoStorageService.downloadAndStore 返回
   * @param {number} enterpriseId
   * @param {number} userId
   * @returns {Object} 可用于 createAsset() 的参数
   */
  buildVideoAssetParams(videoResult, enterpriseId, userId) {
    return {
      enterpriseId,
      userId,
      type: 'video',
      url: videoResult.video?.url || videoResult.videoUrl || '',
      name: videoResult.name || `dh_video_${Date.now()}.mp4`,
      size: videoResult.fileSize || videoResult.size || 0,
      duration: videoResult.duration || null,
      width: videoResult.width || videoResult.resolution?.width || null,
      height: videoResult.height || videoResult.resolution?.height || null,
      mimeType: videoResult.mimeType || 'video/mp4',
      thumbnail: videoResult.cover?.url || videoResult.coverUrl || null,
      category: 'digital-human'
    };
  }
}

module.exports = new AssetStorageService();
