const OSS = require('ali-oss');
const { ApiConfig } = require('../models');

class OssService {
  constructor() {
    this.client = null;
  }

  async init() {
    if (this.client) return this.client;

    const config = await ApiConfig.getConfig('oss') || {};

    const accessKeyId = config.access_key_id || process.env.OSS_ACCESS_KEY_ID;
    const accessKeySecret = config.access_key_secret || process.env.OSS_ACCESS_KEY_SECRET;
    const bucket = config.bucket || process.env.OSS_BUCKET;
    const region = config.region || process.env.OSS_REGION;

    if (!accessKeyId || !accessKeySecret || !bucket || !region) {
      throw new Error('OSS_NOT_CONFIGURED');
    }

    this.client = new OSS({
      accessKeyId,
      accessKeySecret,
      region,
      bucket,
      secure: true
    });

    return this.client;
  }

  // 生成前端直传签名
  async generateUploadPolicy(type = 'image', directory = 'uploads') {
    await this.init();

    const date = new Date();
    const dateStr = date.getFullYear() +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0');

    const dir = `${directory}/${type}/${dateStr}/`;

    const policy = {
      expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      conditions: [
        ['content-length-range', 0, 100 * 1024 * 1024],
        ['starts-with', '$key', dir]
      ]
    };

    const result = this.client.calculatePostSignature(policy);

    return {
      accessKeyId: result.OSSAccessKeyId,
      host: `https://${this.client.options.bucket}.${this.client.options.region}.aliyuncs.com`,
      policy: result.policy,
      signature: result.Signature,
      dir,
      expire: Math.floor(Date.now() / 1000) + 30 * 60
    };
  }

  // 获取文件访问URL（原始URL，非签名）
  getFileUrl(key) {
    const domain = process.env.OSS_DOMAIN;
    if (domain) {
      // Sprint 5.4 Fix: 如果 domain 已包含协议前缀，不再重复添加
      if (/^https?:\/\//i.test(domain)) {
        return `${domain}/${key}`;
      }
      return `https://${domain}/${key}`;
    }
    const bucket = process.env.OSS_BUCKET;
    const region = process.env.OSS_REGION;
    return `https://${bucket}.${region}.aliyuncs.com/${key}`;
  }

  // 从完整OSS URL中提取object key
  // 输入: https://bucket.region.aliyuncs.com/path/to/file.jpg
  // 输出: path/to/file.jpg
  extractKeyFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      // pathname 以 / 开头，去掉首字符
      return parsed.pathname.substring(1);
    } catch {
      // 不是合法URL，可能本身就是key
      return url;
    }
  }

  // 获取临时签名URL（用于private bucket图片预览）
  // keyOrUrl: OSS object key 或完整OSS URL
  // expires: 签名有效期（秒），默认3600秒（1小时）
  async getSignedUrl(keyOrUrl, expires = 3600) {
    await this.init();
    const key = this.extractKeyFromUrl(keyOrUrl);
    if (!key) return null;
    return this.client.signatureUrl(key, { expires });
  }

  /**
   * 生成带签名的临时访问URL（Sprint 5.6: Private OSS Video Playback）
   *
   * 与 getSignedUrl 的区别：支持 response 参数设置强制响应头，
   * 确保浏览器能正确识别视频 MIME 类型进行播放。
   *
   * @param {string} keyOrUrl  - OSS object key 或完整OSS URL
   * @param {number} [expires=3600] - 签名有效期（秒），默认1小时
   * @param {Object} [options] - 额外选项
   * @param {string} [options.contentType] - 强制响应 Content-Type（如 'video/mp4'）
   * @returns {Promise<string|null>} 签名后的临时访问URL
   */
  async generateSignedUrl(keyOrUrl, expires = 3600, options = {}) {
    await this.init();
    const key = this.extractKeyFromUrl(keyOrUrl);
    if (!key) return null;

    const signOptions = { expires };

    // 支持强制设置响应 Content-Type（解决浏览器视频播放 MIME 识别问题）
    if (options.contentType) {
      signOptions.response = {
        'content-type': options.contentType
      };
    }

    return this.client.signatureUrl(key, signOptions);
  }

  // 服务端上传文件（视频存储等场景）
  async putFile(key, buffer, mimeType) {
    await this.init();

    const options = {};
    if (mimeType) {
      options.mime = mimeType;
      options.headers = {
        'Content-Type': mimeType
      };
    }

    const result = await this.client.put(key, buffer, options);
    return result;
  }

  // 删除文件
  async deleteFile(key) {
    await this.init();
    return this.client.delete(key);
  }

  // 批量删除
  async deleteFiles(keys) {
    await this.init();
    return this.client.deleteMulti(keys);
  }
}

module.exports = new OssService();
