/**
 * YuJian Upload — 图片校验、本地预览、OSS 直传
 *
 * 依赖：YuJianAPI (public/js/api.js)，需在 api.js 之后引入
 *
 * 流程：
 *   1. validateImage(file) — 前端校验
 *   2. createPreview(file) — 本地预览
 *   3. uploadImage(file, {onProgress, signal}) — 完整上传流程
 *      → 获取 OSS 上传签名
 *      → 浏览器直传 OSS
 *      → 创建 Asset 记录
 *      → 返回 { assetId, url, name, size, mimeType, width, height }
 */

(function () {
  'use strict';

  const api = window.YuJianAPI;

  // ─── 常量配置 ─────────────────────────────────────────────
  // 图片大小限制：10MB（OSS 签名限制为 100MB，此处取更保守的值）
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
  const MAX_DIMENSION = 4096; // 最大单边像素
  const MAX_PIXELS = 4096 * 4096; // 最大总像素 ~16.7M

  // ─── 校验 ──────────────────────────────────────────────

  /**
   * 校验图片文件
   * @param {File} file
   * @returns {Promise<{valid: boolean, error?: string, meta?: object}>}
   */
  function validateImage(file) {
    return new Promise((resolve) => {
      // 文件存在
      if (!file) {
        return resolve({ valid: false, error: '请选择一个图片文件' });
      }

      // 文件大小
      if (file.size === 0) {
        return resolve({ valid: false, error: '文件为空，请重新选择' });
      }

      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        return resolve({
          valid: false,
          error: `文件过大 (${sizeMB}MB)，最大支持 10MB`
        });
      }

      // MIME 类型
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return resolve({
          valid: false,
          error: '不支持的图片格式，请选择 JPEG、PNG 或 WebP 格式'
        });
      }

      // 扩展名校验（辅助）
      const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return resolve({
          valid: false,
          error: '不支持的图片格式，请选择 JPG、PNG 或 WebP 格式'
        });
      }

      // 图片加载校验（检查是否真实可加载）
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = function () {
        URL.revokeObjectURL(url);

        if (img.width === 0 || img.height === 0) {
          return resolve({
            valid: false,
            error: '图片尺寸无效，请选择有效的图片文件'
          });
        }

        if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
          return resolve({
            valid: false,
            error: `图片尺寸过大 (${img.width}×${img.height})，最大支持 ${MAX_DIMENSION}×${MAX_DIMENSION}`
          });
        }

        if (img.width * img.height > MAX_PIXELS) {
          return resolve({
            valid: false,
            error: `图片分辨率过高 (${(img.width * img.height / 1000000).toFixed(1)}MP)，最大支持 ~16MP`
          });
        }

        resolve({
          valid: true,
          meta: {
            width: img.width,
            height: img.height,
            mimeType: file.type,
            size: file.size,
            name: file.name,
            ext: ext
          }
        });
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve({
          valid: false,
          error: '图片无法加载，文件可能已损坏'
        });
      };

      img.src = url;
    });
  }

  // ─── 本地预览 ────────────────────────────────────────────

  /**
   * 创建本地预览 URL
   * @param {File} file
   * @returns {{url: string, revoke: Function}}
   */
  function createPreview(file) {
    const url = URL.createObjectURL(file);
    return {
      url,
      revoke: function () {
        URL.revokeObjectURL(url);
      }
    };
  }

  // ─── OSS 上传签名 ────────────────────────────────────────

  async function getUploadSignature() {
    return api.get('/enterprise/assets/upload-signature?type=image');
    // 返回：{ accessKeyId, host, policy, signature, dir, expire }
  }

  // ─── OSS 直传 ────────────────────────────────────────────

  /**
   * OSS 浏览器直传（使用 XMLHttpRequest 以支持进度）
   * @param {File} file
   * @param {object} signatureData - 上传签名响应
   * @param {function} onProgress - 进度回调 (percent: number)
   * @param {AbortSignal} signal
   * @returns {Promise<{ossUrl: string, ossKey: string}>}
   */
  function uploadToOss(file, signatureData, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const { host, policy, signature, dir, accessKeyId } = signatureData;

      // 生成唯一文件名以避免冲突
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const safeName = file.name.replace(/[^一-龥a-zA-Z0-9._-]/g, '_');
      const key = `${dir}${timestamp}_${randomStr}_${safeName}`;

      const formData = new FormData();
      formData.append('key', key);
      formData.append('policy', policy);
      formData.append('OSSAccessKeyId', accessKeyId);
      formData.append('signature', signature);
      formData.append('success_action_status', '200');
      formData.append('file', file);

      const xhr = new XMLHttpRequest();

      if (signal) {
        signal.addEventListener('abort', function () {
          xhr.abort();
        });
      }

      xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      });

      xhr.addEventListener('load', function () {
        if (xhr.status === 200 || xhr.status === 204) {
          const ossUrl = `${host}/${key}`;
          resolve({ ossUrl, ossKey: key });
        } else {
          reject(new api.ApiError({
            code: 'OSS_UPLOAD_FAILED',
            message: `OSS 上传失败 (${xhr.status})`,
            status: xhr.status,
            retryable: true,
            raw: xhr.responseText
          }));
        }
      });

      xhr.addEventListener('error', function () {
        reject(new api.ApiError({
          code: 'OSS_NETWORK_ERROR',
          message: 'OSS 上传网络异常，请重试',
          status: 0,
          retryable: true,
          raw: null
        }));
      });

      xhr.addEventListener('abort', function () {
        reject(new api.ApiError({
          code: 'OSS_UPLOAD_ABORTED',
          message: '上传已取消',
          status: 0,
          retryable: false,
          raw: null
        }));
      });

      xhr.open('POST', host);
      xhr.send(formData);
    });
  }

  // ─── 创建素材记录 ────────────────────────────────────────

  async function createAssetRecord({ name, url, type, size, width, height, mimeType }) {
    return api.post('/enterprise/assets', {
      name,
      url,
      type: type || 'image',
      size,
      width,
      height,
      mime_type: mimeType
    });
    // 返回完整 asset 对象，包含 id
  }

  // ─── 完整上传流程 ────────────────────────────────────────

  /**
   * 完整上传流程：校验 → 获取签名 → OSS直传 → 创建记录
   * @param {File} file
   * @param {{onProgress?: Function, signal?: AbortSignal}} options
   * @returns {Promise<{assetId: number, url: string, name: string, size: number, mimeType: string, width: number, height: number}>}
   */
  async function uploadImage(file, options = {}) {
    const { onProgress, signal } = options;

    // 1. 校验
    const validation = await validateImage(file);
    if (!validation.valid) {
      throw new api.ApiError({
        code: 'IMAGE_VALIDATION',
        message: validation.error,
        status: 400,
        retryable: false,
        raw: null
      });
    }
    const meta = validation.meta;

    // 2. 获取 OSS 签名
    let signatureData;
    try {
      signatureData = await getUploadSignature();
    } catch (err) {
      throw new api.ApiError({
        code: 'SIGNATURE_FAILED',
        message: '获取上传凭证失败，请重试',
        status: err.status || 500,
        retryable: true,
        raw: err
      });
    }

    // 3. OSS 直传
    let ossResult;
    try {
      ossResult = await uploadToOss(file, signatureData, onProgress, signal);
    } catch (err) {
      throw err; // 已在 uploadToOss 中格式化
    }

    // 4. 创建 Asset 记录
    let assetRecord;
    try {
      assetRecord = await createAssetRecord({
        name: meta.name,
        url: ossResult.ossUrl,
        type: 'image',
        size: meta.size,
        width: meta.width,
        height: meta.height,
        mimeType: meta.mimeType
      });
    } catch (err) {
      // 文件已上传但记录创建失败 — 记录日志但不阻塞
      console.error('[Upload] 素材记录创建失败，文件已上传至:', ossResult.ossUrl, err);
      throw new api.ApiError({
        code: 'ASSET_RECORD_FAILED',
        message: '文件已上传但记录保存失败，请稍后刷新素材库确认',
        status: err.status || 500,
        retryable: false,
        raw: { ossUrl: ossResult.ossUrl, ossKey: ossResult.ossKey, err }
      });
    }

    return {
      assetId: assetRecord.id,
      url: ossResult.ossUrl,
      name: meta.name,
      size: meta.size,
      mimeType: meta.mimeType,
      width: meta.width,
      height: meta.height
    };
  }

  // ─── 暴露到全局 ──────────────────────────────────────────
  window.YuJianUpload = {
    validateImage,
    createPreview,
    uploadImage,
    getUploadSignature,
    uploadToOss,
    createAssetRecord,
    // 常量
    MAX_FILE_SIZE,
    ALLOWED_MIME_TYPES,
    ALLOWED_EXTENSIONS,
    MAX_DIMENSION,
    MAX_PIXELS
  };

})();
