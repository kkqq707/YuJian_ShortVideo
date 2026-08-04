/**
 * Sprint 5.7 — Historical Data Backfill: Video Covers
 *
 * 用途：
 *   为已有视频 Asset 补生成封面缩略图。
 *
 * 场景：
 *   - 旧视频 Asset 的 thumbnail 字段为空（Sprint 5.7 之前生成）
 *   - 使用 ffmpeg 从 OSS 下载视频 → 提取第一帧 → 上传封面 → 更新 Asset
 *
 * 执行方式：
 *   node migrations/sprint5.7-backfill-covers.js
 *
 * 安全：
 *   - 跳过已有 thumbnail 的 Asset（幂等）
 *   - 封面生成失败不阻塞（记录警告并继续）
 *   - 只处理 type='video' 且 deleted_at IS NULL 的 Asset
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

// ─── 动态导入项目模块 ────────────────────────────────────────
let ossService;
let Asset;

async function init() {
  ossService = require('../services/ossService');
  const models = require('../models');
  Asset = models.Asset;
}

// ─── 下载 OSS 文件到 buffer ──────────────────────────────────
function downloadFile(fileUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(fileUrl);
    const transport = parsed.protocol === 'https:' ? https : http;

    transport.get(fileUrl, { timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── 提取封面帧 ──────────────────────────────────────────────
function extractCoverFrame(videoBuffer) {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir();
    const inputFile = path.join(tmpDir, `backfill_input_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
    const outputFile = path.join(tmpDir, `backfill_cover_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`);

    try { fs.writeFileSync(inputFile, videoBuffer); } catch (e) {
      return reject(new Error(`Temp write: ${e.message}`));
    }

    execFile('ffmpeg', [
      '-ss', '0', '-i', inputFile,
      '-vframes', '1', '-q:v', '2', '-y', outputFile
    ], { timeout: 30000 }, (err) => {
      try { fs.unlinkSync(inputFile); } catch (_) {}
      if (err) {
        try { fs.unlinkSync(outputFile); } catch (_) {}
        return reject(new Error(`ffmpeg: ${err.message}`));
      }

      let buf;
      try { buf = fs.readFileSync(outputFile); } catch (e) {
        try { fs.unlinkSync(outputFile); } catch (_) {}
        return reject(new Error(`Read: ${e.message}`));
      }
      try { fs.unlinkSync(outputFile); } catch (_) {}

      if (buf.length < 100) return reject(new Error(`Too small: ${buf.length}B`));
      resolve(buf);
    });
  });
}

// ─── 主流程 ───────────────────────────────────────────────────
async function main() {
  await init();
  console.log('[Sprint5.7 Backfill] Starting video cover backfill...\n');

  // ── 1. 查询需要补生成的 Asset ──────────────────────────────
  const assets = await Asset.findAll({
    where: {
      type: 'video',
      thumbnail: null,
      deleted_at: null
    }
  });

  console.log(`[Sprint5.7 Backfill] Found ${assets.length} video assets without covers\n`);

  if (assets.length === 0) {
    console.log('[Sprint5.7 Backfill] Nothing to do. Exiting.');
    process.exit(0);
  }

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  // ── 2. 逐个处理 ────────────────────────────────────────────
  for (const asset of assets) {
    const assetId = asset.id;
    const assetUrl = asset.url;

    console.log(`[Sprint5.7 Backfill] Processing asset #${assetId}...`);

    // 检查 URL 是否有效
    if (!assetUrl || typeof assetUrl !== 'string') {
      console.log(`  → SKIP: No valid URL`);
      skipCount++;
      continue;
    }

    try {
      // 尝试获取签名 URL 以便下载
      let downloadUrl;
      try {
        downloadUrl = await ossService.getSignedUrl(assetUrl, 300);
      } catch (_) {
        // 如果签名失败，尝试直接使用原始 URL
        downloadUrl = assetUrl;
      }

      // 下载视频
      console.log(`  → Downloading video...`);
      const videoBuffer = await downloadFile(downloadUrl);
      console.log(`  → Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB`);

      // 提取封面
      console.log(`  → Extracting cover frame...`);
      const coverBuffer = await extractCoverFrame(videoBuffer);
      console.log(`  → Cover extracted: ${(coverBuffer.length / 1024).toFixed(1)}KB`);

      // 上传封面到 OSS
      const date = new Date();
      const dateStr = date.getFullYear()
        + String(date.getMonth() + 1).padStart(2, '0')
        + String(date.getDate()).padStart(2, '0');
      const uuid = crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
      const coverKey = `enterprises/${asset.enterprise_id}/covers/${dateStr}/${uuid}-cover.jpg`;

      await ossService.putFile(coverKey, coverBuffer, 'image/jpeg');
      console.log(`  → Cover uploaded: ${coverKey}`);

      // 更新 Asset
      await asset.update({ thumbnail: coverKey });
      console.log(`  → Asset #${assetId} updated ✓`);
      successCount++;

    } catch (err) {
      console.error(`  → FAILED: ${err.message}`);
      failCount++;
    }
  }

  // ── 3. 汇总报告 ────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('[Sprint5.7 Backfill] Complete');
  console.log(`  Total:  ${assets.length}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Skipped: ${skipCount}`);
  console.log(`  Failed:  ${failCount}`);
  console.log('═══════════════════════════════════════════\n');

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[Sprint5.7 Backfill] Fatal error:', err);
  process.exit(1);
});
