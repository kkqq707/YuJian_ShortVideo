/**
 * Aliyun Vision Provider — 视觉理解
 *
 * Phase DigitalHuman-Rebuild-004 Step4-C
 *
 * 职责：
 *   API Adapter for Vision Understanding models:
 *   - qwen3-vl-plus (Premium)
 *   - qwen3-vl-flash (Budget)
 *
 * 输入：
 *   imageUrl, prompt, images[] (多图), base64
 *
 * 输出：
 *   VisionResult { model, visualDesc, features, tags, sellingPoints, ocrTexts,
 *                   tokensUsed, processingTimeMs }
 *
 * 禁止：
 *   - 在 Provider 内写业务流程
 *   - 在 Provider 内操作数据库
 *   - 在 Provider 内调用 Controller
 *   - 在 Provider 内处理用户权限
 */

const dashscopeClient = require('./dashscope-client');
const registry = require('../../config/ai-model-registry');
const ProviderError = require('../../utils/ProviderError');

// ─── 允许的模型 ────────────────────────────────────────────────────
const ALLOWED_MODELS = ['qwen3-vl-plus', 'qwen3-vl-flash'];

// ─── 默认模型 ──────────────────────────────────────────────────────
const DEFAULT_MODEL = 'qwen3-vl-plus';

class AliyunVisionProvider {
  constructor() {
    this.provider = 'aliyun';
    this.client = dashscopeClient;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  核心接口
  // ═══════════════════════════════════════════════════════════════════

  /**
   * analyze — Visual understanding main entry point
   *
   * @param {Object} params
   * @param {string} params.imageUrl   — Single image URL
   * @param {string} [params.prompt]   — Custom analysis prompt
   * @param {Array}  [params.images]   — Multiple image URLs
   * @param {string} [params.modelId]  — Override model (qwen3-vl-plus | qwen3-vl-flash)
   * @returns {Promise<VisionResult>}
   * @throws {ProviderError}
   */
  async analyze(params) {
    const startTime = Date.now();
    const { imageUrl, prompt, images = [], modelId } = params;

    // ── 1. Validate ──────────────────────────────────────────────
    this.validate(params);

    // ── 2. Resolve model ─────────────────────────────────────────
    const modelConfig = this._resolveModel(modelId);
    const model = modelConfig.apiModelName;

    // ── 3. Build messages ────────────────────────────────────────
    const messages = this._buildMessages({ imageUrl, images, prompt });

    // ── 4. Log ────────────────────────────────────────────────────
    console.log(
      `[VisionProvider] analyze START | ` +
      `provider=${this.provider} | ` +
      `model=${model} | ` +
      `imageCount=${1 + images.length} | ` +
      `promptLen=${prompt ? prompt.length : 0} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 5. Call API ──────────────────────────────────────────────
    try {
      const result = await this.client.createVisionTask({
        model,
        messages,
      });

      // ── 6. Normalize ────────────────────────────────────────────
      const visionResult = this.normalizeResult(result, model, startTime);

      console.log(
        `[VisionProvider] analyze SUCCESS | ` +
        `model=${model} | ` +
        `duration=${Date.now() - startTime}ms | ` +
        `tokensUsed=${visionResult.tokensUsed} | ` +
        `hasDesc=${!!visionResult.visualDesc}`
      );

      return visionResult;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        this.provider, 'VISION_FAILED',
        `Vision analysis failed: ${error.message}`, false
      );
    }
  }

  /**
   * validate — Input validation
   *
   * @param {Object} params
   * @throws {ProviderError}
   */
  validate(params) {
    if (!params) {
      throw new ProviderError(this.provider, 'INVALID_PARAM', 'params is required', false);
    }

    const { imageUrl, images = [], modelId } = params;

    // Must have at least one image source
    if (!imageUrl && (!images || images.length === 0)) {
      throw new ProviderError(
        this.provider, 'INVALID_IMAGE',
        'At least one image source (imageUrl or images[]) is required', false
      );
    }

    // Validate imageUrl format if provided
    if (imageUrl) {
      if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
        throw new ProviderError(
          this.provider, 'INVALID_IMAGE',
          'imageUrl must be a non-empty string', false
        );
      }
      // Support both http(s) URLs and base64 data URIs
      if (!/^(https?:\/\/|data:image\/)/i.test(imageUrl.trim())) {
        throw new ProviderError(
          this.provider, 'INVALID_IMAGE',
          'imageUrl must be http(s) URL or data:image base64', false
        );
      }
    }

    // Validate images array
    if (images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (typeof img !== 'string' || !img.trim()) {
          throw new ProviderError(
            this.provider, 'INVALID_IMAGE',
            `images[${i}] must be a non-empty string`, false
          );
        }
      }
    }

    // Validate modelId if provided
    if (modelId && !ALLOWED_MODELS.includes(modelId)) {
      throw new ProviderError(
        this.provider, 'INVALID_MODEL',
        `Model "${modelId}" not supported. Allowed: ${ALLOWED_MODELS.join(', ')}`, false
      );
    }
  }

  /**
   * normalizeResult — Parse raw API response into VisionResult
   *
   * Handles both structured JSON and unstructured text responses
   * from the multimodal-generation endpoint.
   *
   * @param {Object} raw       — Raw API response from client
   * @param {string} model     — Model name used
   * @param {number} startTime — Request start timestamp
   * @returns {VisionResult}
   */
  normalizeResult(raw, model, startTime) {
    const processingTimeMs = startTime ? Date.now() - startTime : 0;
    const tokensUsed = raw.tokensUsed || 0;

    // Extract text content from response
    const textParts = [];
    for (const item of (raw.content || [])) {
      if (item.text) textParts.push(item.text);
    }
    const fullText = textParts.join('\n');

    // Default structure
    const result = {
      model: model || 'unknown',
      visualDesc: '',
      features: [],
      tags: [],
      sellingPoints: [],
      ocrTexts: [],
      tokensUsed,
      processingTimeMs,
    };

    if (!fullText) {
      return result;
    }

    // ── Try to parse as JSON first ──────────────────────────────
    try {
      const json = JSON.parse(fullText);
      return {
        model: json.model || model,
        visualDesc: json.visualDesc || json.visual_desc || json.description || '',
        features: json.features || [],
        tags: json.tags || [],
        sellingPoints: json.sellingPoints || json.selling_points || [],
        ocrTexts: json.ocrTexts || json.ocr_texts || [],
        tokensUsed: json.tokensUsed || tokensUsed,
        processingTimeMs,
      };
    } catch (_) {
      // Not JSON — use extraction parser
    }

    // ── Fallback: Extract structured fields from text ───────────
    return this._extractFromText(fullText, result);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  内部方法
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Build input.messages array for multimodal-generation endpoint.
   *
   * Supports:
   *   - Single image URL (image_url)
   *   - Multiple images (images[])
   *   - Base64 data URIs
   */
  _buildMessages({ imageUrl, images, prompt }) {
    const content = [];

    // Build default prompt if not provided
    const analysisPrompt = prompt && prompt.trim()
      ? prompt.trim()
      : `请详细描述这张图片的内容，并以JSON格式返回分析结果。JSON格式如下：
{
  "visualDesc": "详细的产品/场景视觉描述",
  "features": ["特征1", "特征2"],
  "tags": ["标签1", "标签2"],
  "sellingPoints": ["卖点1", "卖点2"],
  "ocrTexts": ["识别到的文字1", "识别到的文字2"]
}
请确保返回有效的JSON。`;

    // Add images
    if (imageUrl) {
      content.push({ image: imageUrl.trim() });
    }
    for (const img of images) {
      content.push({ image: img.trim() });
    }

    // Add text prompt
    content.push({ text: analysisPrompt });

    return [
      { role: 'user', content },
    ];
  }

  /**
   * Resolve model configuration from registry.
   *
   * @param {string} [modelId] — Optional override model ID
   * @returns {Object} modelConfig
   * @throws {ProviderError}
   */
  _resolveModel(modelId) {
    const resolvedId = modelId || DEFAULT_MODEL;

    const modelConfig = registry.getModelConfig(resolvedId);
    if (!modelConfig) {
      throw new ProviderError(
        this.provider, 'UNSUPPORTED_MODEL',
        `Model "${resolvedId}" not found in registry`, false
      );
    }

    if (modelConfig.capability !== 'vision_understanding') {
      throw new ProviderError(
        this.provider, 'CAPABILITY_MISMATCH',
        `Model "${resolvedId}" is not a vision understanding model (capability: ${modelConfig.capability})`, false
      );
    }

    return modelConfig;
  }

  /**
   * Fallback parser: extract structured fields from unstructured text.
   *
   * Uses section headers and keyword matching when the model does not
   * return valid JSON.
   */
  _extractFromText(text, baseResult) {
    const result = { ...baseResult };
    result.visualDesc = text;

    // Try to find structured sections by common patterns
    const patterns = {
      features: /特征[:：]\s*\n?([\s\S]*?)(?=\n\n|\n[#\p{L}]+[:：]|$)/u,
      tags: /标签[:：]\s*\n?([\s\S]*?)(?=\n\n|\n[#\p{L}]+[:：]|$)/u,
      sellingPoints: /卖点[:：]\s*\n?([\s\S]*?)(?=\n\n|\n[#\p{L}]+[:：]|$)/u,
      ocrTexts: /识别文字|OCR[:：]\s*\n?([\s\S]*?)(?=\n\n|\n[#\p{L}]+[:：]|$)/u,
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Split by bullet points, numbers, or newlines
        const items = match[1]
          .split(/\n\s*[-•*\d.]\s*/)
          .map(s => s.trim())
          .filter(s => s.length > 0);
        if (items.length > 0) {
          result[key] = items;
        }
      }
    }

    // If visualDesc is the full text, try to truncate to first paragraph
    if (result.visualDesc && result.visualDesc.length > 500) {
      // Use first meaningful paragraph as description
      const firstPara = result.visualDesc.split(/\n\n/)[0];
      if (firstPara && firstPara.length > 20) {
        result.visualDesc = firstPara.trim();
      }
    }

    return result;
  }
}

module.exports = new AliyunVisionProvider();
