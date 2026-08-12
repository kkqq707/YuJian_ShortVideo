/**
 * Aliyun Script Provider — 脚本生成
 *
 * Phase DigitalHuman-Rebuild-004 Step4-C
 *
 * 职责：
 *   API Adapter for Script Generation models:
 *   - qwen3.6-plus (Premium, default)
 *   - qwen3.6-flash (Budget)
 *
 * 输入：
 *   visionResult, theme, style, duration, modelId
 *
 * 输出：
 *   ScriptResult { title, fullText, segments[], totalWords, estimatedDuration, style }
 *
 * 功能：
 *   - Structured Output (JSON Schema via prompt)
 *   - Fallback parser for non-JSON responses
 *   - Segment-level detail with emotion/emphasis
 *
 * 禁止：
 *   - 在 Provider 内写业务流程
 *   - 在 Provider 内操作数据库
 *   - 直接拼接字符串作为最终结构
 */

const dashscopeClient = require('./dashscope-client');
const registry = require('../../config/ai-model-registry');
const ProviderError = require('../../utils/ProviderError');

// ─── 允许的模型 ────────────────────────────────────────────────────
const ALLOWED_MODELS = ['qwen3.6-plus', 'qwen3.6-flash'];

// ─── 默认模型 ──────────────────────────────────────────────────────
const DEFAULT_MODEL = 'qwen3.6-plus';

// ─── 默认 Style 配置 ───────────────────────────────────────────────
const STYLES = {
  professional: { label: '专业口播', tone: '专业、权威、可信赖' },
  casual: { label: '轻松日常', tone: '轻松、自然、亲近' },
  energetic: { label: '活力促销', tone: '热情、有感染力、促销导向' },
  warm: { label: '温暖故事', tone: '温暖、感性、有故事感' },
};

// ─── JSON Schema for Structured Output ─────────────────────────────
const SCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '口播脚本标题' },
    fullText: { type: 'string', description: '完整口播文案' },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: '段落序号（从0开始）' },
          text: { type: 'string', description: '段落文案' },
          estimatedDurationSec: { type: 'number', description: '预估时长（秒）' },
          emotion: {
            type: 'string',
            enum: ['neutral', 'happy', 'serious', 'warm', 'excited'],
            description: '情绪基调',
          },
          emphasis: {
            type: 'array',
            items: { type: 'string' },
            description: '需要重读的关键词',
          },
        },
        required: ['index', 'text', 'estimatedDurationSec', 'emotion'],
      },
    },
    totalWords: { type: 'integer', description: '总字数' },
    estimatedDuration: { type: 'number', description: '预估总时长（秒）' },
    style: { type: 'string', description: '脚本风格' },
  },
  required: ['title', 'fullText', 'segments', 'totalWords', 'estimatedDuration', 'style'],
};

class AliyunScriptProvider {
  constructor() {
    this.provider = 'aliyun';
    this.client = dashscopeClient;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  核心接口
  // ═══════════════════════════════════════════════════════════════════

  /**
   * generate — Script generation main entry point
   *
   * @param {Object} params
   * @param {Object} [params.visionResult] — Output from VisionProvider.analyze()
   * @param {string} [params.theme]        — Product/script theme
   * @param {string} [params.style]        — Style: professional | casual | energetic | warm
   * @param {number} [params.duration]     — Target duration in seconds (default 30)
   * @param {string} [params.productName]  — Product name for context
   * @param {string} [params.sceneContext] — Additional scene context
   * @param {string} [params.modelId]      — Override model (qwen3.6-plus | qwen3.6-flash)
   * @returns {Promise<ScriptResult>}
   * @throws {ProviderError}
   */
  async generate(params) {
    const startTime = Date.now();
    const {
      visionResult,
      theme,
      style = 'professional',
      duration = 30,
      productName,
      sceneContext,
      modelId,
    } = params;

    // ── 1. Validate ──────────────────────────────────────────────
    this.validate(params);

    // ── 2. Resolve model ─────────────────────────────────────────
    const modelConfig = this._resolveModel(modelId);
    const model = modelConfig.apiModelName;

    // ── 3. Build prompt ──────────────────────────────────────────
    const messages = this._buildMessages({ visionResult, theme, style, duration, productName, sceneContext });

    // ── 4. Log ────────────────────────────────────────────────────
    console.log(
      `[ScriptProvider] generate START | ` +
      `provider=${this.provider} | ` +
      `model=${model} | ` +
      `style=${style} | ` +
      `duration=${duration}s | ` +
      `hasVision=${!!visionResult} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 5. Call API ──────────────────────────────────────────────
    try {
      const result = await this.client.createTextGenTask({
        model,
        messages,
        parameters: {
          temperature: 0.7,
          max_tokens: 4096,
        },
      });

      // ── 6. Parse response ──────────────────────────────────────
      const scriptResult = this.normalizeResult(result, model, style, startTime);

      console.log(
        `[ScriptProvider] generate SUCCESS | ` +
        `model=${model} | ` +
        `duration=${Date.now() - startTime}ms | ` +
        `tokensUsed=${scriptResult.tokensUsed} | ` +
        `segments=${scriptResult.segments ? scriptResult.segments.length : 0} | ` +
        `totalWords=${scriptResult.totalWords}`
      );

      return scriptResult;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        this.provider, 'SCRIPT_FAILED',
        `Script generation failed: ${error.message}`, false
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

    const { style, duration, modelId } = params;

    // Validate style
    if (style && !STYLES[style]) {
      throw new ProviderError(
        this.provider, 'INVALID_STYLE',
        `Style "${style}" not supported. Allowed: ${Object.keys(STYLES).join(', ')}`, false
      );
    }

    // Validate duration
    if (duration !== undefined && duration !== null) {
      if (typeof duration !== 'number' || duration <= 0 || duration > 300) {
        throw new ProviderError(
          this.provider, 'INVALID_DURATION',
          'duration must be a positive number <= 300 (seconds)', false
        );
      }
    }

    // Validate modelId
    if (modelId && !ALLOWED_MODELS.includes(modelId)) {
      throw new ProviderError(
        this.provider, 'INVALID_MODEL',
        `Model "${modelId}" not supported. Allowed: ${ALLOWED_MODELS.join(', ')}`, false
      );
    }
  }

  /**
   * normalizeResult — Parse raw API response into ScriptResult
   *
   * Tries JSON parse first, falls back to text-based extraction.
   *
   * @param {Object} raw       — Raw API response from client
   * @param {string} model     — Model name used
   * @param {string} style     — Script style
   * @param {number} startTime — Request start timestamp
   * @returns {ScriptResult}
   */
  normalizeResult(raw, model, style, startTime) {
    const processingTimeMs = startTime ? Date.now() - startTime : 0;
    const tokensUsed = raw.tokensUsed || 0;
    const content = raw.content || '';

    // ── Try JSON parse ──────────────────────────────────────────
    try {
      // Find JSON block in content (may be wrapped in markdown code fences)
      let jsonStr = content;

      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());

      // Validate required fields
      if (parsed.title && parsed.fullText && Array.isArray(parsed.segments)) {
        return {
          title: parsed.title,
          fullText: parsed.fullText,
          segments: this._normalizeSegments(parsed.segments),
          totalWords: parsed.totalWords || parsed.fullText.replace(/\s/g, '').length,
          estimatedDuration: parsed.estimatedDuration || 0,
          style: parsed.style || style,
          model: parsed.model || model,
          tokensUsed: parsed.tokensUsed || tokensUsed,
          processingTimeMs,
        };
      }
    } catch (_) {
      // JSON parse failed — use fallback
    }

    // ── Fallback parser ─────────────────────────────────────────
    return this._fallbackParse(content, model, style, tokensUsed, processingTimeMs);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  内部方法
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Build the messages array for the text-generation endpoint.
   *
   * Includes system prompt with JSON Schema and user prompt with context.
   */
  _buildMessages({ visionResult, theme, style, duration, productName, sceneContext }) {
    const styleConfig = STYLES[style] || STYLES.professional;
    const targetDuration = duration || 30;

    // ── System prompt ────────────────────────────────────────────
    const systemPrompt = `你是一个专业的短视频口播脚本作家。你的任务是根据产品信息和视觉分析结果，生成高质量的口播脚本。

## 风格要求
风格：${styleConfig.label}
语气：${styleConfig.tone}
目标时长：约${targetDuration}秒

## 输出要求
必须严格按照以下JSON Schema输出，不要有任何额外的解释文字：

\`\`\`json
${JSON.stringify(SCRIPT_SCHEMA, null, 2)}
\`\`\`

## 脚本要求
1. fullText 是完整连贯的口播文案，适合直接朗读
2. 每个segment是一个自然的段落停顿点
3. emotion 根据内容和上下文选择合适的情绪
4. emphasis 标注每段中需要重读的关键词（1-3个）
5. estimatedDurationSec 按中文朗读速度约200字/分钟估算
6. 脚本开头要有吸引力（3秒原则），中间有信息量，结尾有行动号召`;

    // ── User prompt ──────────────────────────────────────────────
    let userPrompt = '';

    if (productName) {
      userPrompt += `产品名称：${productName}\n`;
    }
    if (theme) {
      userPrompt += `产品主题/卖点：${theme}\n`;
    }
    userPrompt += `目标时长：${targetDuration}秒\n`;
    userPrompt += `风格：${styleConfig.label}\n`;

    if (visionResult) {
      userPrompt += '\n## 视觉分析结果\n';
      if (visionResult.visualDesc) {
        userPrompt += `画面描述：${visionResult.visualDesc}\n`;
      }
      if (visionResult.tags && visionResult.tags.length > 0) {
        userPrompt += `标签：${visionResult.tags.join(', ')}\n`;
      }
      if (visionResult.sellingPoints && visionResult.sellingPoints.length > 0) {
        userPrompt += `卖点：${visionResult.sellingPoints.join(', ')}\n`;
      }
      if (visionResult.features && visionResult.features.length > 0) {
        userPrompt += `特征：${visionResult.features.join(', ')}\n`;
      }
      if (visionResult.ocrTexts && visionResult.ocrTexts.length > 0) {
        userPrompt += `检测到的文字：${visionResult.ocrTexts.join(', ')}\n`;
      }
    }

    if (sceneContext) {
      userPrompt += `\n场景补充：${sceneContext}\n`;
    }

    userPrompt += '\n请生成口播脚本。只输出JSON，不要有其他内容。';

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * Resolve model configuration from registry.
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

    if (modelConfig.capability !== 'script_generation') {
      throw new ProviderError(
        this.provider, 'CAPABILITY_MISMATCH',
        `Model "${resolvedId}" is not a script generation model`, false
      );
    }

    return modelConfig;
  }

  /**
   * Normalize segment array — fill missing fields, validate structure.
   */
  _normalizeSegments(segments) {
    return segments.map((seg, idx) => ({
      index: seg.index !== undefined ? seg.index : idx,
      text: seg.text || '',
      estimatedDurationSec: seg.estimatedDurationSec || this._estimateDuration(seg.text),
      emotion: seg.emotion || 'neutral',
      emphasis: Array.isArray(seg.emphasis) ? seg.emphasis : [],
    }));
  }

  /**
   * Estimate duration from text (Chinese characters ~200/min = ~3.33/sec)
   */
  _estimateDuration(text) {
    if (!text) return 0;
    // Count Chinese characters + punctuation
    const chars = text.replace(/\s/g, '').length;
    return Math.round((chars / 3.33) * 10) / 10; // Round to 1 decimal
  }

  /**
   * Fallback parser: extract script structure from non-JSON text.
   *
   * Uses regex and heuristics to reconstruct ScriptResult.
   */
  _fallbackParse(content, model, style, tokensUsed, processingTimeMs) {
    const text = content || '';

    // ── Try to extract title ────────────────────────────────────
    let title = '';
    const titleMatch = text.match(/标题[:：]\s*(.+?)(?:\n|$)/);
    if (titleMatch) {
      title = titleMatch[1].trim();
    } else {
      // Use first meaningful line as title (skip empty lines)
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length > 0 && lines[0].trim().length <= 50) {
        title = lines[0].trim();
      }
    }

    // ── Extract full text ──────────────────────────────────────
    // Remove markdown fences and section headers
    let fullText = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/#{1,3}\s+.+/g, '')
      .trim();

    if (!fullText && title) {
      fullText = text.replace(title, '').trim();
    }

    // ── Split into segments by sentence boundaries ─────────────
    const segmentTexts = fullText.split(/(?<=[。！？\.!\?\n])\s*/);
    const segments = segmentTexts
      .filter(s => s.trim().length > 0)
      .map((segText, idx) => ({
        index: idx,
        text: segText.trim(),
        estimatedDurationSec: this._estimateDuration(segText),
        emotion: 'neutral',
        emphasis: [],
      }));

    // ── Count words ────────────────────────────────────────────
    const totalWords = fullText.replace(/\s/g, '').length;

    // ── Estimate total duration ────────────────────────────────
    const estimatedDuration = segments.reduce((sum, s) => sum + s.estimatedDurationSec, 0);

    return {
      title: title || '未命名脚本',
      fullText: fullText || text,
      segments,
      totalWords,
      estimatedDuration: Math.round(estimatedDuration * 10) / 10,
      style: style || 'professional',
      model,
      tokensUsed,
      processingTimeMs,
    };
  }
}

module.exports = new AliyunScriptProvider();
