/**
 * Minimal WebSocket Transport for DashScope TTS
 *
 * Phase DigitalHuman-Rebuild-004 Step4-C
 *
 * Purpose:
 *   Lightweight WebSocket client for TTS providers (CosyVoice, Qwen3-TTS).
 *   Uses Node.js built-in https module — no new npm dependency.
 *
 * Why not use 'ws' library:
 *   The project currently has no WebSocket dependency. This transport
 *   provides basic WebSocket functionality without adding a new package.
 *   It can be replaced with the 'ws' library in the future by changing
 *   the require in tts-provider.js — no other code changes needed.
 *
 * Protocol:
 *   - Establish via HTTP Upgrade to wss://
 *   - Send JSON text frames (DashScope TTS commands)
 *   - Receive binary frames (PCM/MP3 audio data)
 *   - Receive text frames (JSON status/error messages)
 *
 * Usage:
 *   const transport = new WsTransport();
 *   await transport.connect('wss://dashscope.aliyuncs.com/...', apiKey);
 *   transport.send({ text: 'Hello', voice: 'default' });
 *   transport.onMessage((data, isBinary) => { ... });
 *   transport.onError((err) => { ... });
 *   transport.onClose((code, reason) => { ... });
 *   transport.close();
 */

const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const EventEmitter = require('events');

// ─── WebSocket Constants ────────────────────────────────────────────
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Opcodes
const OPCODE = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xA,
};

// ─── Minimal WebSocket Frame Decoder ────────────────────────────────
// We need this to parse incoming frames (binary audio + text status).
// We only implement what's needed: unmasked text/binary frames from server.

function maskKey() {
  return crypto.randomBytes(4);
}

function applyMask(data, mask) {
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ mask[i % 4];
  }
  return result;
}

/**
 * Encode a frame to send to the server.
 * Client → Server frames MUST be masked (RFC 6455 §5.3).
 */
function encodeFrame(opcode, payload) {
  const buf = payload !== null ? Buffer.from(payload) : Buffer.alloc(0);
  const mask = maskKey();
  const maskedPayload = applyMask(buf, mask);

  let headerLen = 2; // minimum: FIN+opcode+mask, len
  if (buf.length > 65535) headerLen += 8; // 64-bit length
  else if (buf.length > 125) headerLen += 2; // 16-bit length

  const frame = Buffer.alloc(headerLen + maskedPayload.length);

  // Byte 0: FIN (0x80) | opcode
  frame[0] = 0x80 | (opcode & 0x0F);

  // Byte 1: MASK (0x80) | payload length
  if (buf.length > 65535) {
    frame[1] = 0x80 | 127;
    frame.writeUIntBE(buf.length, 2, 8); // 64-bit big-endian
  } else if (buf.length > 125) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(buf.length, 2);
  } else {
    frame[1] = 0x80 | buf.length;
  }

  // Masking key
  const maskOffset = headerLen - 4 - maskedPayload.length;
  // Actually the structure is: [header bytes] [4 mask bytes] [masked payload]
  // Let's fix this:
  // headerLen includes mask bytes (always 4), mask goes right before payload
  let payloadLenFieldSize = 0;
  if (buf.length > 65535) payloadLenFieldSize = 8;
  else if (buf.length > 125) payloadLenFieldSize = 2;

  const maskPos = 2 + payloadLenFieldSize;
  mask.copy(frame, maskPos);

  // Masked payload
  maskedPayload.copy(frame, maskPos + 4);

  return frame;
}

function encodeTextFrame(text) {
  return encodeFrame(OPCODE.TEXT, text);
}

function encodeCloseFrame(code = 1000, reason = '') {
  const payload = Buffer.alloc(2 + Buffer.byteLength(reason, 'utf8'));
  payload.writeUInt16BE(code, 0);
  if (reason) payload.write(reason, 2, 'utf8');
  return encodeFrame(OPCODE.CLOSE, payload);
}

function encodePongFrame(data) {
  return encodeFrame(OPCODE.PONG, data);
}

// ─── WebSocket Frame Parser (streaming) ─────────────────────────────

class FrameParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.state = 'HEADER'; // HEADER | PAYLOAD
    this.currentFrame = null;
  }

  /**
   * Feed data into the parser.
   * Calls onFrame({ opcode, payload, isBinary }) for each complete frame.
   */
  feed(chunk, onFrame) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this._tryParse()) {
      if (this.currentFrame) {
        onFrame(this.currentFrame);
        this.currentFrame = null;
      }
    }
  }

  _tryParse() {
    if (this.buffer.length < 2) return false;

    const byte0 = this.buffer[0];
    const byte1 = this.buffer[1];

    const fin = (byte0 & 0x80) !== 0;
    const opcode = byte0 & 0x0F;
    const masked = (byte1 & 0x80) !== 0;
    let payloadLen = byte1 & 0x7F;

    let headerLen = 2;
    if (payloadLen === 126) {
      if (this.buffer.length < 4) return false;
      payloadLen = this.buffer.readUInt16BE(2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (this.buffer.length < 10) return false;
      // readUIntBE for 6 bytes (48 bits) — DashScope won't send > 2^48 bytes
      payloadLen = Number(this.buffer.readUIntBE(2, 6));
      headerLen = 10;
    }

    let maskLen = masked ? 4 : 0;
    const totalLen = headerLen + maskLen + payloadLen;

    if (this.buffer.length < totalLen) return false;

    // Extract payload
    const payloadStart = headerLen + maskLen;
    let payload = this.buffer.slice(payloadStart, totalLen);

    // Server → Client frames should NOT be masked per RFC 6455
    // but we handle it either way
    if (masked) {
      const maskBytes = this.buffer.slice(headerLen, payloadStart);
      payload = applyMask(payload, maskBytes);
    }

    this.currentFrame = {
      fin,
      opcode,
      isBinary: opcode === OPCODE.BINARY,
      isText: opcode === OPCODE.TEXT,
      isClose: opcode === OPCODE.CLOSE,
      isPing: opcode === OPCODE.PING,
      isPong: opcode === OPCODE.PONG,
      payload,
    };

    this.buffer = this.buffer.slice(totalLen);
    return true;
  }
}

// ─── WsTransport ────────────────────────────────────────────────────

class WsTransport extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.connected = false;
    this.parser = new FrameParser();
    this.url = null;
    this.apiKey = null;
  }

  /**
   * Connect to a WebSocket endpoint.
   *
   * @param {string} wsUrl    - WebSocket URL (wss://dashscope.aliyuncs.com/...)
   * @param {string} apiKey   - DashScope API key for Authorization header
   * @param {number} [timeoutMs=30000] - Connection timeout
   * @returns {Promise<void>}
   */
  connect(wsUrl, apiKey, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      this.url = wsUrl;
      this.apiKey = apiKey;

      let parsedUrl;
      try {
        parsedUrl = new URL(wsUrl);
      } catch (e) {
        return reject(new Error(`Invalid WebSocket URL: ${wsUrl}`));
      }

      if (parsedUrl.protocol !== 'wss:' && parsedUrl.protocol !== 'ws:') {
        return reject(new Error(`Unsupported protocol: ${parsedUrl.protocol}. Use wss:// or ws://`));
      }

      const isSecure = parsedUrl.protocol === 'wss:';
      const transport = isSecure ? https : require('http');

      const nonce = crypto.randomBytes(16).toString('base64');
      const acceptKey = crypto
        .createHash('sha1')
        .update(nonce + WS_GUID)
        .digest('base64');

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isSecure ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': nonce,
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: timeoutMs,
      };

      const req = transport.request(options, (res) => {
        if (res.statusCode !== 101) {
          // Read error body
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            let errMsg = `WebSocket upgrade failed: HTTP ${res.statusCode}`;
            try {
              const parsed = JSON.parse(body);
              if (parsed.message) errMsg += ` - ${parsed.message}`;
            } catch (_) { /* ignore parse error */ }
            reject(new Error(errMsg));
          });
          return;
        }

        // Validate accept key
        const serverAccept = res.headers['sec-websocket-accept'];
        if (serverAccept !== acceptKey) {
          reject(new Error('WebSocket handshake failed: invalid Sec-WebSocket-Accept'));
          return;
        }

        this.socket = req.socket || res.socket;
        this.connected = true;
        this._setupSocket();

        if (process.env.NODE_ENV === 'development') {
          console.log(`[WsTransport] Connected to ${wsUrl.replace(/api_key=[^&]+/, 'api_key=***')}`);
        }

        resolve();
      });

      req.on('error', (err) => {
        this.connected = false;
        reject(new Error(`WebSocket connection error: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        this.connected = false;
        reject(new Error('WebSocket connection timeout'));
      });

      req.end();
    });
  }

  /**
   * Set up socket event handlers.
   */
  _setupSocket() {
    if (!this.socket) return;

    this.socket.on('data', (chunk) => {
      this.parser.feed(chunk, (frame) => {
        if (frame.isPing) {
          // Auto-respond to pings
          this._rawSend(encodePongFrame(frame.payload));
          return;
        }

        if (frame.isPong) {
          this.emit('pong', frame.payload);
          return;
        }

        if (frame.isClose) {
          this.connected = false;
          let code = 1000;
          let reason = '';
          if (frame.payload && frame.payload.length >= 2) {
            code = frame.payload.readUInt16BE(0);
            reason = frame.payload.slice(2).toString('utf8');
          }
          this.emit('close', code, reason);
          return;
        }

        // Text or binary data
        if (frame.isBinary) {
          this.emit('message', frame.payload, true); // true = binary
        } else if (frame.isText) {
          this.emit('message', frame.payload.toString('utf8'), false);
        }
      });
    });

    this.socket.on('error', (err) => {
      this.connected = false;
      this.emit('error', err);
    });

    this.socket.on('end', () => {
      this.connected = false;
      if (process.env.NODE_ENV === 'development') {
        console.log('[WsTransport] Socket ended');
      }
    });

    this.socket.on('close', () => {
      this.connected = false;
    });
  }

  /**
   * Send raw bytes on the socket.
   */
  _rawSend(data) {
    if (!this.socket || !this.connected) {
      throw new Error('WebSocket not connected');
    }
    this.socket.write(data);
  }

  /**
   * Send a text frame (JSON command to TTS).
   *
   * @param {Object|string} data - JSON object or string to send
   */
  send(data) {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const frame = encodeTextFrame(text);
    this._rawSend(frame);
  }

  /**
   * Register message handler.
   *
   * @param {Function} handler - (data: Buffer|string, isBinary: boolean) => void
   */
  onMessage(handler) {
    this.on('message', handler);
  }

  /**
   * Register error handler.
   *
   * @param {Function} handler - (error: Error) => void
   */
  onError(handler) {
    this.on('error', handler);
  }

  /**
   * Register close handler.
   *
   * @param {Function} handler - (code: number, reason: string) => void
   */
  onClose(handler) {
    this.on('close', handler);
  }

  /**
   * Close the WebSocket connection gracefully.
   *
   * @param {number} [code=1000]
   * @param {string} [reason='']
   */
  close(code = 1000, reason = '') {
    if (this.socket && this.connected) {
      try {
        this._rawSend(encodeCloseFrame(code, reason));
      } catch (_) { /* ignore */ }
      this.connected = false;
    }
    if (this.socket) {
      try { this.socket.destroy(); } catch (_) { /* ignore */ }
    }
  }

  /**
   * Check if connected.
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }
}

module.exports = WsTransport;
