/**
 * Aliyun TTS Provider — 语音合成
 *
 * Phase DigitalHuman-Rebuild-004 Step4-C
 *
 * 职责：
 *   API Adapter for TTS models:
 *   - cosyvoice-v3.5-plus (WebSocket, Premium preferred)
 *   - cosyvoice-v1 (WebSocket, Legacy compatible)
 *   - qwen3-tts-flash-realtime (WebSocket, Standard)
 *   - sambert-v1 (HTTP, Budget/Fallback)
 *
 * 协议：
 *   - WebSocket: CosyVoice, Qwen3-TTS realtime
 *   - HTTP: Sambert
 *
 * BANNED:
 *   - qwen3-tts-vd-realtime (voice design, not a TTS model)
 *
 * 输出流程：
 *   TTS → Binary Audio → OSS Upload → AudioResult { audioUrl, duration, format, ... }
 *
 * 禁止：
 *   - 直接返回 DashScope 临时 URL
 *   - 跳过 OSS 上传
 *   - 在 Provider 内操作数据库
 */

const dashscopeClient = require('./dashscope-client');
const registry = require('../../config/ai-model-registry');
const ProviderError = require('../../utils/ProviderError');
const WsTransport = require('./ws-transport');
const ossService = require('../../services/ossService');
const crypto = require('crypto');

// ─── 允许的模型 ────────────────────────────────────────────────────
const ALLOWED_MODELS = [
  'cosyvoice-v3.5-plus',
  'cosyvoice-v1',
  'qwen3-tts-flash-realtime',
  'sambert-v1',
];

// ─── 明确禁止的模型 ────────────────────────────────────────────────
const BANNED_MODELS = [
  'qwen3-tts-vd-realtime', // Voice design, not TTS
];

// ─── 默认模型 ──────────────────────────────────────────────────────
const DEFAULT_MODEL = 'cosyvoice-v3.5-plus';

// ─── 支持的输出格式 ────────────────────────────────────────────────
const SUPPORTED_FORMATS = ['mp3', 'wav', 'pcm'];

class AliyunTtsProvider {
  constructor() {
    this.provider = 'aliyun';
    this.client = dashscopeClient;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  核心接口
  // ═══════════════════════════════════════════════════════════════════

  /**
   * synthesize — TTS main entry point
   *
   * @param {Object} params
   * @param {string} params.text          — Text to synthesize (required)
   * @param {string} [params.voiceId]     — Voice ID
   * @param {string} [params.emotion]     — Emotion: neutral, happy, sad, angry
   * @param {number} [params.speed]       — Speech speed (0.5–2.0)
   * @param {string} [params.format]      — Output format: mp3, wav, pcm
   * @param {string} [params.modelId]     — Override model
   * @param {number} [params.enterpriseId] — For OSS storage path
   * @returns {Promise<AudioResult>}
   * @throws {ProviderError}
   */
  async synthesize(params) {
    const startTime = Date.now();
    const {
      text,
      voiceId,
      emotion = 'neutral',
      speed = 1.0,
      format = 'mp3',
      modelId,
      enterpriseId = 0,
    } = params;

    // ── 0. BAN list check ────────────────────────────────────────
    if (modelId && BANNED_MODELS.includes(modelId)) {
      throw new ProviderError(
        this.provider, 'BANNED_MODEL',
        `Model "${modelId}" is banned. It is a voice-design model, not a TTS synthesis model. ` +
        `Use one of: ${ALLOWED_MODELS.join(', ')}`, false
      );
    }

    // ── 1. Validate ──────────────────────────────────────────────
    this.validate(params);

    // ── 2. Resolve model ─────────────────────────────────────────
    const modelConfig = this._resolveModel(modelId);
    const model = modelConfig.apiModelName;
    const protocol = modelConfig.protocol || 'http';

    // Also ensure resolved model is not banned
    if (BANNED_MODELS.includes(modelConfig.id)) {
      throw new ProviderError(
        this.provider, 'BANNED_MODEL',
        `Model "${modelConfig.id}" is banned (voice-design, not TTS).`, false
      );
    }

    // ── 3. Log ────────────────────────────────────────────────────
    console.log(
      `[TtsProvider] synthesize START | ` +
      `provider=${this.provider} | ` +
      `model=${model} | ` +
      `protocol=${protocol} | ` +
      `textLen=${text.length} | ` +
      `format=${format} | ` +
      `time=${new Date().toISOString()}`
    );

    // ── 4. Dispatch by protocol ──────────────────────────────────
    let audioResult;
    try {
      if (protocol === 'websocket') {
        audioResult = await this._synthesizeWebSocket({
          model, text, voiceId, emotion, speed, format, modelConfig,
        });
      } else {
        audioResult = await this._synthesizeHttp({
          model, text, voiceId, emotion, speed, format, modelConfig,
        });
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        this.provider, 'TTS_FAILED',
        `TTS synthesis failed: ${error.message}`, false
      );
    }

    // ── 5. Upload binary audio to OSS ────────────────────────────
    const ossResult = await this._uploadToOss(audioResult.buffer, format, enterpriseId);

    // ── 6. Build AudioResult ─────────────────────────────────────
    const result = this.normalizeResult({
      ...audioResult,
      ...ossResult,
      voiceId,
      emotion,
      speed,
      model,
      startTime,
    });

    console.log(
      `[TtsProvider] synthesize SUCCESS | ` +
      `model=${model} | ` +
      `duration=${Date.now() - startTime}ms | ` +
      `audioDuration=${result.duration}s | ` +
      `fileSize=${(result.fileSize / 1024).toFixed(1)}KB | ` +
      `format=${result.format}`
    );

    return result;
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

    const { text, speed, format, modelId } = params;

    // Text validation
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new ProviderError(
        this.provider, 'INVALID_TEXT',
        'text is required and must be a non-empty string', false
      );
    }

    // Speed validation
    if (speed !== undefined && speed !== null) {
      if (typeof speed !== 'number' || speed < 0.5 || speed > 2.0) {
        throw new ProviderError(
          this.provider, 'INVALID_SPEED',
          'speed must be between 0.5 and 2.0', false
        );
      }
    }

    // Format validation
    if (format && !SUPPORTED_FORMATS.includes(format)) {
      throw new ProviderError(
        this.provider, 'INVALID_FORMAT',
        `Format "${format}" not supported. Allowed: ${SUPPORTED_FORMATS.join(', ')}`, false
      );
    }

    // Model validation
    if (modelId && !ALLOWED_MODELS.includes(modelId)) {
      if (BANNED_MODELS.includes(modelId)) {
        throw new ProviderError(
          this.provider, 'BANNED_MODEL',
          `Model "${modelId}" is banned (voice-design, not TTS).`, false
        );
      }
      throw new ProviderError(
        this.provider, 'INVALID_MODEL',
        `Model "${modelId}" not supported. Allowed: ${ALLOWED_MODELS.join(', ')}`, false
      );
    }
  }

  /**
   * normalizeResult — Build AudioResult from synthesis + OSS results
   *
   * @param {Object} params — Combined synthesis, OSS, and metadata
   * @returns {AudioResult}
   */
  normalizeResult(params) {
    const {
      audioUrl, ossKey, fileSize,
      buffer, // audio buffer for duration estimation
      voiceId, emotion, speed, model, format,
      startTime, sampleRate,
    } = params;

    const processingTimeMs = startTime ? Date.now() - startTime : 0;

    // Estimate duration from audio buffer size
    // MP3: ~16KB/s at 128kbps; WAV: ~48KB/s at 24kHz 16-bit mono
    let estimatedDuration = 0;
    if (buffer && buffer.length > 0) {
      const bytesPerSecond = format === 'pcm'
        ? (sampleRate || 24000) * 2 // 16-bit mono
        : format === 'wav'
          ? (sampleRate || 24000) * 2
          : 16000; // MP3 ~128kbps ~= 16KB/s
      estimatedDuration = Math.round((buffer.length / bytesPerSecond) * 10) / 10;
    }

    return {
      audioUrl: audioUrl || '',
      ossKey: ossKey || '',
      duration: estimatedDuration,
      format: format || 'mp3',
      sampleRate: sampleRate || 24000,
      fileSize: fileSize || (buffer ? buffer.length : 0),
      voiceId: voiceId || 'default',
      emotion: emotion || 'neutral',
      speed: speed || 1.0,
      model: model || 'unknown',
      processingTimeMs,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Protocol-specific methods
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Synthesize via HTTP (Sambert).
   *
   * DashScope TTS HTTP API returns binary audio directly.
   */
  async _synthesizeHttp(params) {
    const { model, text, voiceId, speed, format } = params;

    const result = await this.client.createTtsHttpTask({
      model,
      text,
      voice: voiceId,
      format,
      speed,
    });

    return {
      buffer: result.buffer,
      format,
      mimeType: result.contentType || `audio/${format}`,
    };
  }

  /**
   * Synthesize via WebSocket (CosyVoice, Qwen3-TTS).
   *
   * DashScope TTS WebSocket API:
   * 1. Connect to wss://dashscope.aliyuncs.com/api-ws/v1/...  (or the full URL from model config)
   * 2. Send JSON run-task command
   * 3. Receive binary audio frames + JSON status events
   * 4. Collect all audio chunks
   */
  async _synthesizeWebSocket(params) {
    const { model, text, voiceId, emotion, speed, format, modelConfig } = params;

    // Build WebSocket URL
    const wsEndpoint = this._getWsEndpoint(modelConfig);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[TtsProvider] WebSocket TTS | model=${model} | endpoint=${wsEndpoint}`);
    }

    return new Promise((resolve, reject) => {
      const transport = new WsTransport();
      const audioChunks = [];
      let sampleRate = 24000;
      let hasError = false;
      let timeoutId = null;

      // ── Timeout ────────────────────────────────────────────────
      timeoutId = setTimeout(() => {
        if (transport.isConnected()) {
          transport.close(1000, 'timeout');
        }
        if (!hasError) {
          hasError = true;
          reject(new ProviderError(
            this.provider, 'TTS_TIMEOUT',
            'WebSocket TTS timed out after 60 seconds', false
          ));
        }
      }, 60000);

      // ── Message handler ────────────────────────────────────────
      transport.onMessage((data, isBinary) => {
        if (hasError) return;

        if (isBinary) {
          // Binary audio chunk
          audioChunks.push(data);
        } else {
          // Text JSON event
          try {
            const msg = typeof data === 'string' ? JSON.parse(data) : data;

            // Check for errors
            if (msg.header?.code && msg.header.code !== 0) {
              hasError = true;
              clearTimeout(timeoutId);
              transport.close();
              reject(new ProviderError(
                this.provider, 'TTS_WS_ERROR',
                `TTS WebSocket error: ${msg.header.message || 'Unknown error'} (code: ${msg.header.code})`, false
              ));
              return;
            }

            // Check for completion event
            if (msg.header?.event === 'task-finished' ||
                msg.header?.event === 'task-failed') {
              clearTimeout(timeoutId);
              transport.close();

              if (msg.header?.event === 'task-failed') {
                hasError = true;
                reject(new ProviderError(
                  this.provider, 'TTS_TASK_FAILED',
                  `TTS task failed: ${msg.header.message || 'Unknown'}`, false
                ));
                return;
              }

              if (audioChunks.length === 0) {
                hasError = true;
                reject(new ProviderError(
                  this.provider, 'TTS_NO_AUDIO',
                  'TTS completed but no audio data received', false
                ));
                return;
              }

              // Success — combine audio chunks
              const buffer = Buffer.concat(audioChunks);
              resolve({
                buffer,
                format,
                sampleRate,
                mimeType: `audio/${format}`,
              });
            }

            // Track sample rate if reported
            if (msg.header?.attributes?.sample_rate) {
              sampleRate = msg.header.attributes.sample_rate;
            }
          } catch (parseErr) {
            // Non-JSON text — might be debug info, ignore
          }
        }
      });

      // ── Error handler ──────────────────────────────────────────
      transport.onError((err) => {
        if (hasError) return;
        hasError = true;
        clearTimeout(timeoutId);
        transport.close();
        reject(new ProviderError(
          this.provider, 'TTS_WS_TRANSPORT',
          `TTS WebSocket transport error: ${err.message}`, false
        ));
      });

      // ── Close handler ──────────────────────────────────────────
      transport.onClose((code, reason) => {
        if (hasError) return;
        clearTimeout(timeoutId);

        // If we received audio, resolve even on unexpected close
        if (audioChunks.length > 0) {
          const buffer = Buffer.concat(audioChunks);
          resolve({
            buffer,
            format,
            sampleRate,
            mimeType: `audio/${format}`,
          });
        } else {
          hasError = true;
          reject(new ProviderError(
            this.provider, 'TTS_WS_CLOSED',
            `TTS WebSocket closed unexpectedly (code: ${code}, reason: ${reason})`, false
          ));
        }
      });

      // ── Connect ────────────────────────────────────────────────
      transport.connect(wsEndpoint, this.client.service.apiKey, 30000)
        .then(() => {
          // Send TTS command
          const command = this._buildTtsCommand({ model, text, voiceId, emotion, speed, format });
          transport.send(command);

          if (process.env.NODE_ENV === 'development') {
            console.log(`[TtsProvider] WS command sent | model=${model}`);
          }
        })
        .catch((err) => {
          if (hasError) return;
          hasError = true;
          clearTimeout(timeoutId);
          reject(new ProviderError(
            this.provider, 'TTS_WS_CONNECT',
            `TTS WebSocket connect failed: ${err.message}`, false
          ));
        });
    });
  }

  /**
   * Upload audio buffer to OSS.
   *
   * @param {Buffer} audioBuffer  — Raw audio data
   * @param {string} format       — Audio format (mp3, wav, pcm)
   * @param {number} enterpriseId — Enterprise ID for path
   * @returns {Promise<{audioUrl: string, ossKey: string, fileSize: number}>}
   */
  async _uploadToOss(audioBuffer, format, enterpriseId) {
    const ossKey = this._generateAudioOssKey(enterpriseId, format);
    const mimeType = format === 'pcm'
      ? 'audio/pcm'
      : format === 'wav'
        ? 'audio/wav'
        : 'audio/mpeg';

    try {
      await ossService.putFile(ossKey, audioBuffer, mimeType);
      const audioUrl = ossService.getFileUrl(ossKey);

      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[TtsProvider] OSS upload SUCCESS | ` +
          `key=${ossKey} | ` +
          `size=${(audioBuffer.length / 1024).toFixed(1)}KB`
        );
      }

      return {
        audioUrl,
        ossKey,
        fileSize: audioBuffer.length,
      };
    } catch (ossError) {
      throw new ProviderError(
        this.provider, 'OSS_UPLOAD_FAILED',
        `Failed to upload audio to OSS: ${ossError.message}`, false
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  内部方法
  // ═══════════════════════════════════════════════════════════════════

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

    if (modelConfig.capability !== 'tts_generation') {
      throw new ProviderError(
        this.provider, 'CAPABILITY_MISMATCH',
        `Model "${resolvedId}" is not a TTS model (capability: ${modelConfig.capability})`, false
      );
    }

    return modelConfig;
  }

  /**
   * Get WebSocket endpoint for TTS models.
   */
  _getWsEndpoint(modelConfig) {
    const model = modelConfig.apiModelName;
    // DashScope WebSocket API endpoint for TTS
    // Format: wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model={model}
    return `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${encodeURIComponent(model)}`;
  }

  /**
   * Build TTS command JSON for WebSocket protocol.
   *
   * Format follows DashScope WebSocket TTS API specification.
   */
  _buildTtsCommand({ model, text, voiceId, emotion, speed, format }) {
    return {
      header: {
        action: 'run-task',
        task_id: this._generateTaskId(),
        streaming: 'duplex', // Full-duplex for real-time
      },
      payload: {
        model,
        input: {
          text: text.trim(),
        },
        parameters: {
          format: format || 'mp3',
          sample_rate: 24000,
          speech_rate: speed || 1.0,
        },
      },
    };
  }

  /**
   * Generate a unique task ID for WebSocket TTS.
   */
  _generateTaskId() {
    return `tts_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Generate OSS key for audio storage.
   *
   * Format: enterprises/{id}/audio/{date}/{uuid}.{ext}
   */
  _generateAudioOssKey(enterpriseId, format) {
    const date = new Date();
    const dateStr = date.getFullYear()
      + String(date.getMonth() + 1).padStart(2, '0')
      + String(date.getDate()).padStart(2, '0');
    const uuid = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    const ext = format === 'pcm' ? '.pcm' : `.${format || 'mp3'}`;
    return `enterprises/${enterpriseId || 0}/audio/${dateStr}/${uuid}${ext}`;
  }
}

module.exports = new AliyunTtsProvider();
