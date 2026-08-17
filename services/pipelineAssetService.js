/**
 * Pipeline Asset Service — 流水线素材持久化
 *
 * Phase DigitalHuman-Rebuild-004 Step4-D5
 *
 * 职责：
 *   1. TTS Audio → Asset(type=audio) → PipelineTask.audio_asset_id
 *   2. DigitalHuman Video → Asset(type=video) → PipelineTask.output_asset_id
 *   3. 桥接 assetStorageService + pipelineTaskService
 *
 * 设计原则：
 *   - 只负责 pipeline Asset 创建流程
 *   - 不直接调用 OSS（由 assetStorageService / videoStorageService 处理）
 *   - 不修改 PipelineTask 状态（只更新 asset_id 字段）
 *   - Asset 创建失败不中断流水线（降级为日志告警）
 *
 * 允许：
 *   ✅ 调用 assetStorageService.createAsset()
 *   ✅ 调用 videoStorageService.downloadAndStore()
 *   ✅ 调用 pipelineTaskService.updateAssetId()
 *
 * 禁止：
 *   ❌ OSS 直接操作
 *   ❌ PipelineTask 状态修改
 *   ❌ Provider 调用
 *   ❌ Controller / Route 操作
 */

const assetStorageService = require('./assetStorageService');
const videoStorageService = require('./videoStorageService');
const pipelineTaskService = require('./pipelineTaskService');

class PipelineAssetService {
  // ═══════════════════════════════════════════════════════════════════════
  //  TTS Audio Asset
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 保存 TTS 音频 Asset
   *
   * 流程:
   *   TTS result (audioUrl, fileSize, duration, format)
   *     → assetStorageService.createAsset(type=audio)
   *     → pipelineTaskService.updateAssetId(audio_asset_id)
   *     → AudioResult
   *
   * 注意:
   *   - TTS Provider 已将音频上传到项目自有 OSS
   *   - audioUrl 已经是持久化 URL
   *   - 本方法只创建 Asset 数据库记录
   *
   * @param {Object}  pipelineTask — PipelineTask instance
   * @param {Object}  ttsResult    — TTS synthesis result
   * @param {Object}  [opts]
   * @param {string}  [opts.audioUrl]   — 覆盖 ttsResult.audioUrl
   * @param {number}  [opts.fileSize]   — 覆盖 ttsResult.fileSize
   * @param {number}  [opts.duration]   — 覆盖 ttsResult.duration
   * @param {string}  [opts.format]     — 覆盖 ttsResult.format
   * @returns {Promise<{ assetId: number, audioUrl: string, fileSize: number, format: string }>}
   */
  async saveAudioAsset(pipelineTask, ttsResult, opts = {}) {
    const enterpriseId = pipelineTask.enterprise_id;
    const userId = pipelineTask.user_id;
    const pipelineId = pipelineTask.id;

    // ── 1. 校验 TTS 结果 ────────────────────────────────────────
    const audioUrl = opts.audioUrl || ttsResult.audioUrl;
    if (!audioUrl) {
      console.warn(
        `[PipelineAssetService] saveAudioAsset SKIP — no audioUrl | ` +
        `pipelineId=${pipelineId}`
      );
      return { assetId: null, audioUrl: null, fileSize: 0, format: null };
    }

    console.log(
      `[PipelineAssetService] saveAudioAsset START | ` +
      `pipelineId=${pipelineId} | ` +
      `fileSize=${(ttsResult.fileSize || 0) / 1024}KB | ` +
      `time=${new Date().toISOString()}`
    );

    try {
      // ── 2. 构建 Asset 参数 ───────────────────────────────────
      const assetParams = assetStorageService.buildAudioAssetParams(
        { ...ttsResult, audioUrl },
        enterpriseId,
        userId
      );

      // ── 3. 创建 Asset 记录 ───────────────────────────────────
      const asset = await assetStorageService.createAsset(assetParams);

      // ── 4. 更新 PipelineTask.audio_asset_id ─────────────────
      await pipelineTaskService.updateAssetId(pipelineId, 'audio_asset_id', asset.id);

      console.log(
        `[PipelineAssetService] saveAudioAsset SUCCESS | ` +
        `pipelineId=${pipelineId} | ` +
        `assetId=${asset.id} | ` +
        `fileSize=${assetParams.size} | ` +
        `time=${new Date().toISOString()}`
      );

      return {
        assetId: asset.id,
        audioUrl: asset.url,
        fileSize: assetParams.size,
        format: ttsResult.format || 'mp3'
      };

    } catch (error) {
      // Asset 创建失败不中断流水线 — 降级为日志告警
      console.error(
        `[PipelineAssetService] saveAudioAsset FAILED (non-blocking) | ` +
        `pipelineId=${pipelineId} | ` +
        `error=${error.message} | ` +
        `time=${new Date().toISOString()}`
      );

      return {
        assetId: null,
        audioUrl: audioUrl,
        fileSize: ttsResult.fileSize || 0,
        format: ttsResult.format || 'mp3'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DigitalHuman Video Asset
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 保存 DigitalHuman 视频 Asset（从已有 videoUrl）
   *
   * 适用场景:
   *   - DH 同步返回 videoUrl
   *   - 轮询完成后的 videoUrl
   *
   * 流程:
   *   DH result (videoUrl, duration, resolution, coverUrl, ...)
   *     → assetStorageService.createAsset(type=video)
   *     → pipelineTaskService.updateAssetId(output_asset_id)
   *     → VideoResult
   *
   * @param {Object}  pipelineTask — PipelineTask instance
   * @param {Object}  videoData    — Video data from DH result
   * @param {string}  videoData.videoUrl    — Video URL (required)
   * @param {number}  [videoData.duration]  — Duration in seconds
   * @param {number}  [videoData.fileSize]  — File size in bytes
   * @param {Object}  [videoData.resolution] — { width, height }
   * @param {string}  [videoData.coverUrl]  — Cover/thumbnail URL
   * @param {string}  [videoData.mimeType]  — MIME type
   * @returns {Promise<{ assetId: number, videoUrl: string, duration: number, resolution: string }>}
   */
  async saveVideoAsset(pipelineTask, videoData) {
    const enterpriseId = pipelineTask.enterprise_id;
    const userId = pipelineTask.user_id;
    const pipelineId = pipelineTask.id;

    // ── 1. 校验 videoUrl ──────────────────────────────────────
    const videoUrl = videoData.videoUrl || videoData.video?.url;
    if (!videoUrl) {
      console.warn(
        `[PipelineAssetService] saveVideoAsset SKIP — no videoUrl | ` +
        `pipelineId=${pipelineId}`
      );
      return { assetId: null, videoUrl: null, duration: 0, resolution: null };
    }

    console.log(
      `[PipelineAssetService] saveVideoAsset START | ` +
      `pipelineId=${pipelineId} | ` +
      `duration=${videoData.duration || 0}s | ` +
      `time=${new Date().toISOString()}`
    );

    try {
      // ── 2. 构建 Asset 参数 ──────────────────────────────────
      const assetParams = assetStorageService.buildVideoAssetParams(videoData, enterpriseId, userId);

      // ── 3. 创建 Asset 记录 ──────────────────────────────────
      const asset = await assetStorageService.createAsset(assetParams);

      // ── 4. 更新 PipelineTask.output_asset_id ────────────────
      await pipelineTaskService.updateAssetId(pipelineId, 'output_asset_id', asset.id);

      const resolution = (assetParams.width && assetParams.height)
        ? `${assetParams.width}x${assetParams.height}`
        : null;

      console.log(
        `[PipelineAssetService] saveVideoAsset SUCCESS | ` +
        `pipelineId=${pipelineId} | ` +
        `assetId=${asset.id} | ` +
        `resolution=${resolution || 'N/A'} | ` +
        `time=${new Date().toISOString()}`
      );

      return {
        assetId: asset.id,
        videoUrl: asset.url,
        duration: assetParams.duration,
        resolution
      };

    } catch (error) {
      // Asset 创建失败不中断流水线 — 降级为日志告警
      console.error(
        `[PipelineAssetService] saveVideoAsset FAILED (non-blocking) | ` +
        `pipelineId=${pipelineId} | ` +
        `error=${error.message} | ` +
        `time=${new Date().toISOString()}`
      );

      return {
        assetId: null,
        videoUrl,
        duration: videoData.duration || 0,
        resolution: null
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DigitalHuman Video Download + Asset (从临时 URL)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 下载并保存 DigitalHuman 视频（从临时 URL 完整流程）
   *
   * 适用场景:
   *   - DashScope 返回的 temporary video_url（24h 有效期）
   *   - 需要下载 + 重新上传到项目自有 OSS
   *
   * 流程:
   *   temporary video_url
   *     → videoStorageService.downloadAndStore()
   *     → assetStorageService.createAsset(type=video)
   *     → pipelineTaskService.updateAssetId(output_asset_id)
   *     → VideoResult
   *
   * @param {Object}  pipelineTask    — PipelineTask instance
   * @param {string}  temporaryVideoUrl — Temporary video URL (24h expiry)
   * @param {Object}  [meta]          — Additional metadata
   * @param {number}  [meta.duration] — Video duration in seconds
   * @param {string}  [meta.mimeType] — Expected MIME type
   * @returns {Promise<{ assetId: number, videoUrl: string, duration: number, resolution: string }>}
   */
  async downloadAndSaveVideoAsset(pipelineTask, temporaryVideoUrl, meta = {}) {
    const enterpriseId = pipelineTask.enterprise_id;
    const userId = pipelineTask.user_id;
    const pipelineId = pipelineTask.id;

    if (!temporaryVideoUrl || typeof temporaryVideoUrl !== 'string') {
      console.warn(
        `[PipelineAssetService] downloadAndSaveVideoAsset SKIP — invalid videoUrl | ` +
        `pipelineId=${pipelineId}`
      );
      return { assetId: null, videoUrl: null, duration: 0, resolution: null };
    }

    console.log(
      `[PipelineAssetService] downloadAndSaveVideoAsset START | ` +
      `pipelineId=${pipelineId} | ` +
      `enterpriseId=${enterpriseId} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 幂等守卫（Step6-E3B）：已有 output_asset_id → 复用，不重复下载/OSS/建 Asset ──
    if (pipelineTask.output_asset_id) {
      console.log(
        `[PipelineAssetService] downloadAndSaveVideoAsset SKIP (asset exists) | ` +
        `pipelineId=${pipelineId} | existingAssetId=${pipelineTask.output_asset_id} | ` +
        `time=${new Date().toISOString()}`
      );
      return {
        assetId: pipelineTask.output_asset_id,
        videoUrl: null,
        duration: meta.duration || 0,
        resolution: null,
        coverUrl: null,
        reused: true
      };
    }

    try {
      // ── 1. 下载 + 上传 OSS ──────────────────────────────────
      const storeResult = await videoStorageService.downloadAndStore({
        videoUrl: temporaryVideoUrl,
        enterpriseId,
        mimeType: meta.mimeType
      });

      // ── 2. 构建 Asset 参数 ──────────────────────────────────
      const assetParams = assetStorageService.buildVideoAssetParams(
        {
          ...storeResult,
          duration: meta.duration || null
        },
        enterpriseId,
        userId
      );

      // ── 3. 创建 Asset 记录 ──────────────────────────────────
      const asset = await assetStorageService.createAsset(assetParams);

      // ── 4. 更新 PipelineTask.output_asset_id ────────────────
      await pipelineTaskService.updateAssetId(pipelineId, 'output_asset_id', asset.id);

      const resolution = (assetParams.width && assetParams.height)
        ? `${assetParams.width}x${assetParams.height}`
        : null;

      console.log(
        `[PipelineAssetService] downloadAndSaveVideoAsset SUCCESS | ` +
        `pipelineId=${pipelineId} | ` +
        `assetId=${asset.id} | ` +
        `size=${(storeResult.size / 1024 / 1024).toFixed(1)}MB | ` +
        `time=${new Date().toISOString()}`
      );

      return {
        assetId: asset.id,
        videoUrl: asset.url,
        duration: meta.duration || assetParams.duration,
        resolution,
        coverUrl: assetParams.thumbnail || null
      };

    } catch (error) {
      console.error(
        `[PipelineAssetService] downloadAndSaveVideoAsset FAILED (non-blocking) | ` +
        `pipelineId=${pipelineId} | ` +
        `error=${error.message} | ` +
        `time=${new Date().toISOString()}`
      );

      return {
        assetId: null,
        videoUrl: temporaryVideoUrl,
        duration: meta.duration || 0,
        resolution: null,
        coverUrl: null
      };
    }
  }
}

module.exports = new PipelineAssetService();
