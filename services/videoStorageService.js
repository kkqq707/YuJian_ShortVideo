const https = require('https');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ossService = require('./ossService');

/**
 * 视频存储服务
 *
 * Sprint 2.5 Step 3.3 + Sprint 2.5 Patch
 *
 * 职责：
 *   1. 从 DashScope 返回的视频 URL 下载视频
 *   2. 校验 URL、Content-Type、文件大小（最小/最大）
 *   3. 上传到项目自有 OSS
 *   4. 返回 OSS 存储信息（含 cover 预留字段）
 *
 * 安全：
 *   - 不记录完整签名 URL（仅 hostname + pathname 摘要）
 *   - 不记录 Authorization 头
 *   - 不记录 OSS Secret、DashScope Key
 *   - 不打印完整视频签名 URL
 */

// ─── 配置常量 ────────────────────────────────────────────────────
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
const MIN_VIDEO_SIZE = 10 * 1024;         // 10KB — 避免错误页面/空文件被保存为 mp4
const DOWNLOAD_TIMEOUT = 120000;           // 2分钟下载超时
const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-matroska',
  'video/mpeg'
];

// ─── 明确拒绝的 MIME 类型 ────────────────────────────────────────
// 这些类型表明下载到的不是真实视频（错误页面、JSON 响应、空响应等）
const REJECTED_MIME_TYPES = [
  'text/html',
  'application/json',
  'text/plain',
  'application/xml',
  'text/xml'
];

// ─── 明确拒绝的 URL 协议 ─────────────────────────────────────────
const REJECTED_URL_PREFIXES = [
  'file://',
  'ftp://',
  'smb://',
  '\\\\'   // UNC 路径
];

// ─── URL 安全摘要（日志用，仅记录 hostname + pathname 摘要）─────
function safeUrlSummary(urlStr) {
  if (!urlStr) return '(empty)';
  try {
    const u = new URL(urlStr);
    // 只记录 hostname 和 pathname 的前 40 个字符
    const pathPreview = u.pathname.length > 40
      ? u.pathname.substring(0, 40) + '...'
      : u.pathname;
    return `${u.protocol}//${u.hostname}${pathPreview}`;
  } catch (_) {
    return '(invalid url)';
  }
}

// ─── 检查是否为非法 URL ─────────────────────────────────────────
function isRejectedUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return true;
  const trimmed = urlStr.trim().toLowerCase();
  if (!trimmed) return true;

  // 拒绝 file:// 等本地协议
  for (const prefix of REJECTED_URL_PREFIXES) {
    if (trimmed.startsWith(prefix)) return true;
  }

  // 拒绝 Windows 绝对路径
  if (/^[a-z]:\\/i.test(trimmed)) return true;

  // 拒绝 Unix 绝对路径
  if (trimmed.startsWith('/') && !trimmed.startsWith('http')) return true;

  return false;
}

// ─── 生成唯一文件名 ──────────────────────────────────────────────
function generateOssKey(enterpriseId, mimeType) {
  const date = new Date();
  const dateStr = date.getFullYear()
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0');
  const uuid = crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).substring(2, 10);

  let ext = '.mp4';
  if (mimeType) {
    const parts = mimeType.split('/');
    if (parts[1]) ext = '.' + parts[1].replace('quicktime', 'mov').replace('x-matroska', 'mkv');
  }

  return `enterprises/${enterpriseId}/videos/${dateStr}/${uuid}${ext}`;
}

/**
 * 生成封面 OSS Key
 */
function generateCoverOssKey(enterpriseId) {
  const date = new Date();
  const dateStr = date.getFullYear()
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0');
  const uuid = crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).substring(2, 10);

  return `enterprises/${enterpriseId}/covers/${dateStr}/${uuid}-cover.jpg`;
}

// ─── ffmpeg 可用性缓存 ──────────────────────────────────────────
let _ffmpegAvailable = null;
let _ffmpegCheckTime = 0;
const FFMPEG_CHECK_TTL = 60000; // 1分钟内不重复检查

/**
 * 检查 ffmpeg 是否可用（带缓存）
 * @returns {Promise<boolean>}
 */
function checkFfmpegAvailable() {
  const now = Date.now();
  if (_ffmpegAvailable !== null && (now - _ffmpegCheckTime) < FFMPEG_CHECK_TTL) {
    return Promise.resolve(_ffmpegAvailable);
  }
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], { timeout: 5000 }, (err) => {
      _ffmpegAvailable = !err;
      _ffmpegCheckTime = now;
      if (err) {
        console.error(`[VideoStorage] ffmpeg not available: ${err.message}`);
      }
      resolve(_ffmpegAvailable);
    });
  });
}

/**
 * 使用 ffmpeg 从视频 buffer 中提取第一帧作为封面
 *
 * 流程：
 *   1. 检查 ffmpeg 是否可用
 *   2. 将 buffer 写入临时文件
 *   3. 调用 ffmpeg 提取第一帧
 *   4. 读取输出的 jpg
 *   5. 清理临时文件
 *
 * @param {Buffer} videoBuffer - 视频数据
 * @param {Object} [options] - 可选参数
 * @param {number} [options.startTime=0] - 提取起始时间（秒），默认第 0 秒
 * @returns {Promise<Buffer>} 封面图片 buffer (jpg)
 */
function extractCoverFrame(videoBuffer, options = {}) {
  const startTime = options.startTime || 0;

  return new Promise((resolve, reject) => {
    // ── 0. 检查 ffmpeg 可用性 ──────────────────────────────────
    checkFfmpegAvailable().then((available) => {
      if (!available) {
        return reject(Object.assign(
          new Error('ffmpeg is not installed or not available in PATH'),
          { code: 'FFMPEG_NOT_FOUND' }
        ));
      }

      _doExtract();
    }).catch(reject);

    function _doExtract() {
      const tmpDir = os.tmpdir();
      const rand = Math.random().toString(36).substring(2, 6);
      const inputFile = path.join(tmpDir, `vsc_input_${Date.now()}_${rand}.mp4`);
      const outputFile = path.join(tmpDir, `vsc_cover_${Date.now()}_${rand}.jpg`);

      // ── 1. 写入临时文件 ──────────────────────────────────────
      try {
        fs.writeFileSync(inputFile, videoBuffer);
      } catch (writeErr) {
        return reject(Object.assign(
          new Error(`Failed to write temp video file: ${writeErr.message}`),
          { code: 'COVER_TEMP_WRITE_FAILED' }
        ));
      }

      // ── 2. 调用 ffmpeg 提取帧 ─────────────────────────────────
      // -ss N: 从第 N 秒开始
      // -vframes 1: 只提取 1 帧
      // -q:v 2: 高质量 jpg（1-31，越小质量越高）
      const ssValue = String(startTime);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[VideoStorage] ffmpeg extract cover | ss=${ssValue}s | inputSize=${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB`);
      }
      execFile('ffmpeg', [
        '-ss', ssValue,
        '-i', inputFile,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputFile
      ], { timeout: 30000 }, (err, stdout, stderr) => {
        // ── 清理输入文件（无论成功失败）────────────────────────
        try { fs.unlinkSync(inputFile); } catch (_) { /* ignore */ }

        if (err) {
          // 清理可能的输出文件
          try { fs.unlinkSync(outputFile); } catch (_) { /* ignore */ }

          // 记录 ffmpeg stderr 便于排查格式兼容性问题
          const stderrPreview = stderr ? stderr.substring(0, 200).replace(/\n/g, ' | ') : '(no stderr)';
          const errCode = err.killed ? 'COVER_EXTRACTION_TIMEOUT' : 'COVER_EXTRACTION_FAILED';
          console.error(
            `[VideoStorage] ffmpeg cover extraction error | ` +
            `code=${errCode} | ` +
            `killed=${!!err.killed} | ` +
            `signal=${err.signal || 'N/A'} | ` +
            `message=${err.message} | ` +
            `stderr=${stderrPreview}`
          );
          return reject(Object.assign(
            new Error(`ffmpeg cover extraction failed [${errCode}]: ${err.message}`),
            { code: errCode }
          ));
        }

        // ── 3. 读取输出封面 ────────────────────────────────────
        let coverBuffer;
        try {
          coverBuffer = fs.readFileSync(outputFile);
        } catch (readErr) {
          try { fs.unlinkSync(outputFile); } catch (_) { /* ignore */ }
          return reject(Object.assign(
            new Error(`Failed to read cover image: ${readErr.message}`),
            { code: 'COVER_READ_FAILED' }
          ));
        }

        // ── 4. 清理输出文件 ────────────────────────────────────
        try { fs.unlinkSync(outputFile); } catch (_) { /* ignore */ }

        // ── 5. 校验 ────────────────────────────────────────────
        if (coverBuffer.length < 100) {
          return reject(Object.assign(
            new Error(`Cover image too small: ${coverBuffer.length} bytes`),
            { code: 'COVER_TOO_SMALL' }
          ));
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(`[VideoStorage] ffmpeg cover extracted: ${(coverBuffer.length / 1024).toFixed(1)}KB`);
        }

        resolve(coverBuffer);
      });
    }
  });
}

/**
 * 下载视频文件
 *
 * 校验内容：
 *   - URL 合法性（拒绝 file://、本地路径、空 URL）
 *   - HTTP 状态码
 *   - Content-Type（拒绝 text/html、application/json 等非视频类型）
 *   - 文件大小上限（流式检查）
 *
 * @param {string} videoUrl - 视频 URL
 * @returns {Promise<{buffer: Buffer, mimeType: string, size: number}>}
 */
function downloadVideo(videoUrl) {
  return new Promise((resolve, reject) => {
    // ── URL 合法性前置校验 ─────────────────────────────────────
    if (isRejectedUrl(videoUrl)) {
      const err = new Error('Invalid video URL: local paths and non-http protocols are not allowed');
      err.code = 'INVALID_VIDEO_URL';
      reject(err);
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(videoUrl);
    } catch (_) {
      const err = new Error('Invalid video URL: cannot parse');
      err.code = 'INVALID_VIDEO_URL';
      reject(err);
      return;
    }

    // 必须 http/https
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      const err = new Error(`Invalid video URL scheme: ${parsedUrl.protocol}, only http/https allowed`);
      err.code = 'INVALID_VIDEO_URL_SCHEME';
      reject(err);
      return;
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.get(videoUrl, { timeout: DOWNLOAD_TIMEOUT }, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 安全日志：不记录完整重定向 URL
        if (process.env.NODE_ENV === 'development') {
          console.log(`[VideoStorage] Following redirect (${res.statusCode}) → ${safeUrlSummary(res.headers.location)}`);
        }
        downloadVideo(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        const err = new Error(`Download failed: HTTP ${res.statusCode}`);
        err.statusCode = res.statusCode;
        err.code = 'DOWNLOAD_FAILED';
        reject(err);
        return;
      }

      const contentType = (res.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
      const contentLength = parseInt(res.headers['content-length']) || 0;

      // ── 校验 Content-Type：明确拒绝非视频类型 ─────────────────
      if (contentType) {
        // 检查是否在拒绝列表中
        for (const rejected of REJECTED_MIME_TYPES) {
          if (contentType === rejected || contentType.startsWith(rejected.split('/')[0] + '/')) {
            const err = new Error(`Rejected content type: ${contentType} (expected video/*)`);
            err.code = 'INVALID_CONTENT_TYPE';
            err.contentType = contentType;
            reject(err);
            return;
          }
        }

        // 必须为 video/* 或 application/octet-stream
        if (!contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
          const err = new Error(`Invalid content type: ${contentType} (expected video/*)`);
          err.code = 'INVALID_CONTENT_TYPE';
          err.contentType = contentType;
          reject(err);
          return;
        }
      } else {
        // Content-Type 为空，可能是异常响应
        const err = new Error('Missing Content-Type header, response may not be a video');
        err.code = 'MISSING_CONTENT_TYPE';
        reject(err);
        return;
      }

      // ── 校验 Content-Length 上限 ──────────────────────────────
      if (contentLength > MAX_VIDEO_SIZE) {
        const err = new Error(`Video too large: ${(contentLength / 1024 / 1024).toFixed(1)}MB (max ${MAX_VIDEO_SIZE / 1024 / 1024}MB)`);
        err.code = 'VIDEO_TOO_LARGE';
        reject(err);
        return;
      }

      // ── 如果 Content-Length < 10KB，提前警告但继续（流式下载后还会校验）──

      const chunks = [];
      let totalSize = 0;

      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_VIDEO_SIZE) {
          req.destroy();
          const err = new Error(`Video too large: exceeded ${MAX_VIDEO_SIZE / 1024 / 1024}MB during download`);
          err.code = 'VIDEO_TOO_LARGE';
          reject(err);
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const resolvedMimeType = contentType || 'video/mp4';

        // ── 下载后最小大小校验 ──────────────────────────────────
        // 避免错误页面、空文件、异常响应被保存为 mp4
        if (buffer.length < MIN_VIDEO_SIZE) {
          const err = new Error(
            `Downloaded file too small: ${(buffer.length / 1024).toFixed(1)}KB ` +
            `(minimum ${MIN_VIDEO_SIZE / 1024}KB). The response may be an error page or empty file.`
          );
          err.code = 'VIDEO_TOO_SMALL';
          err.downloadedSize = buffer.length;
          reject(err);
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(`[VideoStorage] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB, type=${resolvedMimeType}`);
        }

        resolve({ buffer, mimeType: resolvedMimeType, size: buffer.length });
      });

      res.on('error', (err) => {
        // 安全：不泄露下载 URL
        const safeErr = new Error(`Download stream error: ${err.message}`);
        safeErr.code = 'DOWNLOAD_STREAM_ERROR';
        reject(safeErr);
      });
    });

    req.setTimeout(DOWNLOAD_TIMEOUT, () => {
      req.destroy();
      const err = new Error('Video download timeout');
      err.code = 'DOWNLOAD_TIMEOUT';
      reject(err);
    });

    req.on('error', (err) => {
      const safeErr = new Error(`Download request error: ${err.message}`);
      safeErr.code = err.code || 'DOWNLOAD_REQUEST_ERROR';
      reject(safeErr);
    });
  });
}

/**
 * 下载视频、校验、上传 OSS
 *
 * Sprint 2.5 Patch: 增强校验 + cover 字段准备
 *
 * @param {Object} opts
 * @param {string} opts.videoUrl    - DashScope 返回的视频 URL
 * @param {number} opts.enterpriseId - 企业 ID
 * @param {string} [opts.mimeType]  - 预期 MIME 类型（可选）
 * @returns {Promise<{
 *   video: { url: string, ossKey: string },
 *   cover: { url: string | null, ossKey: null },
 *   size: number,
 *   mimeType: string
 * }>}
 */
async function downloadAndStore({ videoUrl, enterpriseId, mimeType }) {
  // ── 1. 校验参数 ──────────────────────────────────────────────
  if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.trim()) {
    throw Object.assign(new Error('videoUrl is required'), { code: 'INVALID_VIDEO_URL' });
  }

  if (!/^https?:\/\//i.test(videoUrl.trim())) {
    throw Object.assign(new Error('videoUrl must be an http or https URL'), { code: 'INVALID_VIDEO_URL_SCHEME' });
  }

  if (isRejectedUrl(videoUrl)) {
    throw Object.assign(new Error('videoUrl contains invalid protocol or local path'), { code: 'INVALID_VIDEO_URL' });
  }

  if (!enterpriseId) {
    throw Object.assign(new Error('enterpriseId is required'), { code: 'INVALID_ENTERPRISE_ID' });
  }

  // ── 2. 日志（脱敏：仅 hostname + pathname 摘要）────────────────
  if (process.env.NODE_ENV === 'development') {
    console.log(`[VideoStorage] downloadAndStore | url=${safeUrlSummary(videoUrl)} | enterprise=${enterpriseId}`);
  }

  // ── 3. 下载视频 ──────────────────────────────────────────────
  let downloadResult;
  try {
    downloadResult = await downloadVideo(videoUrl.trim());
  } catch (err) {
    // 脱敏错误信息 — 不泄露完整 URL
    const safeMsg = err.code === 'DOWNLOAD_TIMEOUT'
      ? 'Video download timed out'
      : err.code === 'VIDEO_TOO_LARGE'
        ? 'Video exceeds maximum size'
        : err.code === 'VIDEO_TOO_SMALL'
          ? 'Downloaded file is too small (possible error page)'
          : err.code === 'INVALID_CONTENT_TYPE'
            ? `Invalid video content type${err.contentType ? ': ' + err.contentType : ''}`
            : err.code === 'MISSING_CONTENT_TYPE'
              ? 'Response missing Content-Type header'
              : err.code === 'INVALID_VIDEO_URL' || err.code === 'INVALID_VIDEO_URL_SCHEME'
                ? 'Invalid video URL'
                : `Video download failed: ${err.message || 'unknown error'}`;

    console.error(`[VideoStorage] Download error: ${safeMsg}`);
    throw Object.assign(new Error(safeMsg), {
      code: err.code || 'DOWNLOAD_FAILED',
      originalError: undefined // 不泄露原始错误对象
    });
  }

  // ── 4. 校验下载结果 ──────────────────────────────────────────
  if (!downloadResult.buffer || !Buffer.isBuffer(downloadResult.buffer)) {
    throw Object.assign(new Error('Downloaded video buffer is invalid'), { code: 'INVALID_BUFFER' });
  }

  if (downloadResult.size === 0 || downloadResult.buffer.length === 0) {
    throw Object.assign(new Error('Downloaded video is empty'), { code: 'EMPTY_VIDEO' });
  }

  // 二次确认：buffer 大小与记录的 size 一致
  if (downloadResult.buffer.length !== downloadResult.size) {
    console.warn(
      `[VideoStorage] Buffer size mismatch: recorded=${downloadResult.size}, ` +
      `actual=${downloadResult.buffer.length}`
    );
    downloadResult.size = downloadResult.buffer.length;
  }

  // ── 5. 上传 OSS 前最终确认 ────────────────────────────────────
  if (downloadResult.size < MIN_VIDEO_SIZE) {
    throw Object.assign(
      new Error(`Video too small for upload: ${(downloadResult.size / 1024).toFixed(1)}KB`),
      { code: 'VIDEO_TOO_SMALL' }
    );
  }

  // ── 6. 上传 OSS ──────────────────────────────────────────────
  const resolvedMimeType = mimeType || downloadResult.mimeType;
  const ossKey = generateOssKey(enterpriseId, resolvedMimeType);

  try {
    await ossService.putFile(ossKey, downloadResult.buffer, resolvedMimeType);
  } catch (ossError) {
    console.error(`[VideoStorage] OSS upload error: ${ossError.message}`);
    throw Object.assign(new Error('Failed to upload video to storage'), {
      code: 'OSS_UPLOAD_FAILED'
    });
  }

  // ── 7. 生成封面（Sprint 5.7: ffmpeg 提取第一帧，带一次重试）──
  let coverOssKey = null;
  let coverUrl = null;

  const COVER_RETRY_DELAY_MS = 500;

  /**
   * 尝试提取封面并上传 OSS
   * @param {number} startTime - ffmpeg 起始时间（秒）
   * @returns {Promise<boolean>} 是否成功
   */
  async function attemptCoverExtraction(startTime) {
    try {
      const coverBuffer = await extractCoverFrame(downloadResult.buffer, { startTime });
      coverOssKey = generateCoverOssKey(enterpriseId);
      await ossService.putFile(coverOssKey, coverBuffer, 'image/jpeg');
      coverUrl = ossService.getFileUrl(coverOssKey);
      return true;
    } catch (coverErr) {
      console.warn(
        `[VideoStorage] Cover attempt ss=${startTime}s failed | ` +
        `message=${coverErr.message} | ` +
        `code=${coverErr.code || 'N/A'}`
      );
      return false;
    }
  }

  // 第一次尝试：提取第 0 秒帧
  let coverOk = await attemptCoverExtraction(0);

  // 重试：提取第 1 秒帧（跳过可能的全黑/损坏首帧）
  if (!coverOk) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[VideoStorage] Cover retry after ${COVER_RETRY_DELAY_MS}ms delay...`);
    }
    await new Promise(r => setTimeout(r, COVER_RETRY_DELAY_MS));
    coverOk = await attemptCoverExtraction(1);
  }

  if (!coverOk) {
    console.warn(
      `[VideoStorage] Cover generation failed after 2 attempts (non-blocking) | ` +
      `videoOssKey=${ossKey}`
    );
    // coverOssKey / coverUrl 保持 null
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`[VideoStorage] Cover generated: ${coverOssKey}`);
  }

  // ── 8. 生成访问 URL ──────────────────────────────────────────
  const accessUrl = ossService.getFileUrl(ossKey);

  // ── 9. 日志 ──────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    console.log(`[VideoStorage] Stored: ${ossKey} (${(downloadResult.size / 1024 / 1024).toFixed(1)}MB)`);
  }

  // ── 10. 返回结果 ──────────────────────────────────────────────
  return {
    video: {
      url: accessUrl,
      ossKey
    },
    cover: {
      url: coverUrl,
      ossKey: coverOssKey
    },
    size: downloadResult.size,
    mimeType: resolvedMimeType
  };
}

module.exports = { downloadAndStore, downloadVideo, extractCoverFrame, generateCoverOssKey };
