/*
## 核心功能

承接 Wechatsync bridge 的底层运行时能力，包括 WebSocket 握手、帧解析、最小本地 WebSocket server、HTTP body 读取和 Node http 模块延迟加载。

## 输入

接收原始 socket、HTTP 请求/响应、WebSocket 帧数据、端口/host 配置和 origin allowlist。

## 输出

输出 `createMinimalWebSocketServer`、`parseWebSocketFrames`、`createWebSocketAcceptKey`、`readRequestBody`、`loadDefaultHttpModule` 等底层 helper，供 `wechatsync-bridge.js` 组织业务会话。

## 定位

位于 services/，属于多平台桥接服务层的协议运行时子模块；不处理平台发布业务、认证状态缓存或 UI 展示。

## 依赖

关键依赖：`./wechatsync-constants.js` 和 Node/Electron 运行环境提供的 Buffer、require、socket/http 能力。

## 维护规则

- 修改 WebSocket 帧、握手或 HTTP server 行为后同步检查 `tests/wechatsync_bridge.test.js`。
- 保持本模块只处理底层连接协议，不新增平台业务方法。
*/

import { LOCAL_BIND_HOST } from './wechatsync-constants.js';

/**
 * @typedef {{ debug?: (...args: unknown[]) => void, info?: (...args: unknown[]) => void, warn?: (...args: unknown[]) => void }} BridgeLoggerLike
 * @typedef {{ on: (event: string, handler: (...args: unknown[]) => void) => unknown, once: (event: string, handler: (...args: unknown[]) => void) => unknown, off: (event: string, handler: (...args: unknown[]) => void) => unknown, emit: (event: string, ...args: unknown[]) => void }} BridgeEmitterLike
 * @typedef {{ __ws_control: 'close', code?: number } | { __ws_control: 'ping', payload: Buffer }} WebSocketControlFrame
 * @typedef {string | WebSocketControlFrame} WebSocketParsedMessage
 * @typedef {{ send: (data: string | Buffer) => void, close?: () => void, on: (event: string, handler: (...args: unknown[]) => void) => void, readyState?: number }} BridgeSocketLike
 * @typedef {{ createServer: (handler?: (req: BridgeHttpRequestLike, res: BridgeHttpResponseLike) => void | Promise<void>) => BridgeHttpServerLike }} BridgeHttpModuleLike
 * @typedef {{ on: (event: string, handler: (...args: unknown[]) => void) => unknown, once: (event: string, handler: (...args: unknown[]) => void) => unknown, off?: (event: string, handler: (...args: unknown[]) => void) => unknown, listen: (...args: unknown[]) => unknown, close: (callback?: (...args: unknown[]) => void) => unknown }} BridgeHttpServerLike
 * @typedef {{ headers: Record<string, string | string[] | undefined>, method?: string, url?: string, on: (event: string, handler: (...args: unknown[]) => void) => unknown }} BridgeHttpRequestLike
 * @typedef {{ writeHead: (status: number, headers?: Record<string, string>) => unknown, end: (body?: string) => unknown }} BridgeHttpResponseLike
 * @typedef {{ write: (data: string | Buffer) => unknown, end: () => unknown, destroy: () => unknown, on: (event: string, handler: (...args: unknown[]) => void) => unknown }} RawSocketLike
 * @typedef {{ on: BridgeEmitterLike['on'], once: BridgeEmitterLike['once'], off?: BridgeEmitterLike['off'], close: (callback?: (...args: unknown[]) => void) => unknown }} BridgeWebSocketServerLike
 * @typedef {{ OPEN?: number, WebSocket?: { OPEN?: number }, new (options: { port: number, host: string }): BridgeWebSocketServerLike }} WebSocketServerCtorLike
 */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * @param {unknown} input
 * @returns {number[]}
 */
function utf8Bytes(input) {
  const text = String(input || '');
  if (typeof TextEncoder !== 'undefined') {
    return Array.from(new TextEncoder().encode(text));
  }
  const encoded = encodeURIComponent(text);
  const bytes = [];
  for (let index = 0; index < encoded.length; index += 1) {
    const char = encoded[index];
    if (char === '%' && index + 2 < encoded.length) {
      const hex = encoded.slice(index + 1, index + 3);
      const value = Number.parseInt(hex, 16);
      if (Number.isFinite(value)) {
        bytes.push(value);
        index += 2;
        continue;
      }
    }
    bytes.push(char.charCodeAt(0));
  }
  return bytes;
}

/**
 * @param {number} value
 * @param {number} bits
 * @returns {number}
 */
function rotateLeft(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * @param {unknown} input
 * @returns {number[]}
 */
function sha1Bytes(input) {
  const bytes = utf8Bytes(input);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) {
    bytes.push(Math.floor(bitLength / (2 ** shift)) & 0xff);
  }

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array(80);
    for (let index = 0; index < 16; index += 1) {
      const base = offset + (index * 4);
      words[index] = (
        (bytes[base] << 24)
        | (bytes[base + 1] << 16)
        | (bytes[base + 2] << 8)
        | bytes[base + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f;
      let k;
      if (index < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].flatMap((word) => [
    (word >>> 24) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 8) & 0xff,
    word & 0xff,
  ]);
}

/**
 * @param {number[]} bytes
 * @returns {string}
 */
function base64EncodeBytes(bytes) {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += BASE64_CHARS[first >> 2];
    output += BASE64_CHARS[((first & 0x03) << 4) | ((second || 0) >> 4)];
    output += index + 1 < bytes.length ? BASE64_CHARS[((second & 0x0f) << 2) | ((third || 0) >> 6)] : '=';
    output += index + 2 < bytes.length ? BASE64_CHARS[third & 0x3f] : '=';
  }
  return output;
}

/**
 * @param {unknown} key
 * @returns {string}
 */
function createWebSocketAcceptKey(key) {
  return base64EncodeBytes(sha1Bytes(`${key}${WS_GUID}`));
}

/**
 * @returns {BridgeEmitterLike}
 */
function createEmitter() {
  /** @type {Map<string, Array<(...args: unknown[]) => void>>} */
  const listeners = new Map();
  return {
    on(event, handler) {
      const handlers = listeners.get(event) || [];
      handlers.push(handler);
      listeners.set(event, handlers);
      return this;
    },
    once(event, handler) {
      const wrapped = (...args) => {
        this.off(event, wrapped);
        Reflect.apply(handler, undefined, /** @type {unknown[]} */ (args));
      };
      return this.on(event, wrapped);
    },
    off(event, handler) {
      const handlers = listeners.get(event) || [];
      listeners.set(event, handlers.filter((item) => item !== handler));
      return this;
    },
    emit(event, ...args) {
      const handlers = listeners.get(event) || [];
      for (const handler of handlers.slice()) {
        handler(...args);
      }
    },
  };
}

/**
 * @param {unknown} text
 * @returns {Buffer}
 */
function encodeWebSocketTextFrame(text) {
  const payload = Buffer.from(String(text));
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

/**
 * @param {Buffer} buffer
 * @returns {{ messages: WebSocketParsedMessage[], remaining: Buffer }}
 */
function parseWebSocketFrames(buffer) {
  /** @type {WebSocketParsedMessage[]} */
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7f;
    let cursor = offset + 2;

    if (payloadLength === 126) {
      if (cursor + 2 > buffer.length) break;
      payloadLength = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (payloadLength === 127) {
      if (cursor + 8 > buffer.length) break;
      const longLength = buffer.readBigUInt64BE(cursor);
      if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('WebSocket frame is too large.');
      }
      payloadLength = Number(longLength);
      cursor += 8;
    }

    let mask = null;
    if (masked) {
      if (cursor + 4 > buffer.length) break;
      mask = buffer.subarray(cursor, cursor + 4);
      cursor += 4;
    }

    if (cursor + payloadLength > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(cursor, cursor + payloadLength));
    if (mask) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] = payload[i] ^ mask[i % 4];
      }
    }

    if (opcode === 0x1) {
      messages.push(payload.toString('utf8'));
    }
    if (opcode === 0x8) {
      messages.push({
        __ws_control: 'close',
        code: payload.length >= 2 ? payload.readUInt16BE(0) : undefined,
      });
    }
    if (opcode === 0x9) {
      messages.push({ __ws_control: 'ping', payload });
    }
    offset = cursor + payloadLength;
  }

  return {
    messages,
    remaining: buffer.subarray(offset),
  };
}

/**
 * @param {RawSocketLike} socket
 * @returns {BridgeSocketLike}
 */
function createSocketWrapper(socket) {
  const emitter = createEmitter();
  /** @type {{ readyState: number, on: BridgeEmitterLike['on'], once: BridgeEmitterLike['once'], off: BridgeEmitterLike['off'], send: (data: string | Buffer) => void, close: () => void }} */
  const wrapper = {
    readyState: 1,
    on: (event, handler) => emitter.on(event, handler),
    once: (event, handler) => emitter.once(event, handler),
    off: (event, handler) => emitter.off(event, handler),
    send(data) {
      if (wrapper.readyState !== 1) return;
      socket.write(encodeWebSocketTextFrame(data));
    },
    close() {
      wrapper.readyState = 3;
      socket.end();
    },
  };

  let buffered = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    try {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''));
      buffered = Buffer.concat([buffered, chunkBuffer]);
      const result = parseWebSocketFrames(buffered);
      buffered = result.remaining;
      for (const message of result.messages) {
        if (typeof message === 'object' && message !== null && message.__ws_control) {
          if (message.__ws_control === 'ping') {
            const pongFrame = Buffer.alloc(2 + message.payload.length);
            pongFrame[0] = 0x8A;
            pongFrame[1] = message.payload.length;
            message.payload.copy(pongFrame, 2);
            socket.write(pongFrame);
          }
          if (message.__ws_control === 'close') {
            wrapper.readyState = 3;
            socket.end();
          }
          continue;
        }
        emitter.emit('message', Buffer.from(message));
      }
    } catch (error) {
      emitter.emit('error', error);
      socket.destroy();
    }
  });
  socket.on('close', () => {
    wrapper.readyState = 3;
    emitter.emit('close');
  });
  socket.on('error', (error) => {
    wrapper.readyState = 3;
    emitter.emit('error', error);
  });

  return wrapper;
}

/**
 * @param {unknown} [origin='']
 * @param {{ allowlist?: Array<string | RegExp> | null }} [options={}]
 * @returns {boolean}
 */
function isOriginAllowedForWebSocket(origin = '', { allowlist = null } = {}) {
  if (!allowlist) return true;
  const trimmed = String(origin || '').trim();
  if (!trimmed) return true; // empty origin = native / node client
  for (const pattern of allowlist) {
    if (typeof pattern === 'string') {
      if (pattern === '*' || pattern === trimmed) return true;
      if (pattern.endsWith('*') && trimmed.startsWith(pattern.slice(0, -1))) return true;
    } else if (pattern instanceof RegExp) {
      if (pattern.test(trimmed)) return true;
    }
  }
  return false;
}

/**
 * @param {{ http: BridgeHttpModuleLike, port: number, host?: string, originAllowlist?: Array<string | RegExp> | null, logger?: BridgeLoggerLike }} options
 * @returns {BridgeWebSocketServerLike}
 */
function createMinimalWebSocketServer({ http, port, host = LOCAL_BIND_HOST, originAllowlist = null, logger = console }) {
  const emitter = createEmitter();
  const server = http.createServer();
  /** @type {Set<BridgeSocketLike>} */
  const sockets = new Set();

  server.on('upgrade', (req, socket) => {
    const request = /** @type {BridgeHttpRequestLike} */ (req);
    const rawSocket = /** @type {RawSocketLike} */ (socket);
    const origin = request.headers.origin || '';
    logger.debug?.('[WechatsyncBridge] WebSocket upgrade received', {
      url: request.url,
      origin,
      userAgent: request.headers['user-agent'] || '',
    });

    if (originAllowlist && !isOriginAllowedForWebSocket(origin, { allowlist: originAllowlist })) {
      logger.warn?.('[WechatsyncBridge] WebSocket upgrade rejected: origin not allowed', { origin });
      try {
        rawSocket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      } catch {
        // Socket may already be closed; destroy below still completes rejection.
      }
      rawSocket.destroy();
      return;
    }

    const key = request.headers['sec-websocket-key'];
    if (!key) {
      logger.warn?.('[WechatsyncBridge] WebSocket upgrade rejected: missing sec-websocket-key');
      rawSocket.destroy();
      return;
    }

    const accept = createWebSocketAcceptKey(Array.isArray(key) ? key[0] : key);
    rawSocket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'));

    const wrapped = createSocketWrapper(rawSocket);
    sockets.add(wrapped);
    wrapped.on('close', () => sockets.delete(wrapped));
    emitter.emit('connection', wrapped, { origin });
  });
  server.on('error', (error) => emitter.emit('error', error));
  server.listen(port, host, () => emitter.emit('listening'));

  return {
    on: (event, handler) => emitter.on(event, handler),
    once: (event, handler) => emitter.once(event, handler),
    off: (event, handler) => emitter.off(event, handler),
    close(callback) {
      for (const socket of sockets) {
        try {
          socket.close();
        } catch (error) {
          logger.warn?.('Failed to close Wechatsync socket:', error);
        }
      }
      server.close(callback);
    },
  };
}

/**
 * @param {WebSocketServerCtorLike | null | undefined} WebSocketServer
 * @returns {number}
 */
function getWebSocketOpenState(WebSocketServer) {
  return WebSocketServer?.OPEN || WebSocketServer?.WebSocket?.OPEN || 1;
}

/**
 * @param {BridgeHttpRequestLike} req
 * @returns {Promise<string>}
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function defaultConnectionIdFactory() {
  const windowCrypto = typeof window !== 'undefined' ? window.crypto : null;
  if (windowCrypto && typeof windowCrypto.randomUUID === 'function') {
    return windowCrypto.randomUUID();
  }
  return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function loadDefaultHttpModule() {
  // Desktop bridge needs Node's local HTTP server, but the bundle must not
  // resolve it during build. Keep the load narrow and bridge-only.
  const loader = typeof require === 'function' ? require : null;
  if (!loader) return null;
  const loadedHttp = /** @type {unknown} */ (loader(['h', 'ttp'].join('')));
  return /** @type {BridgeHttpModuleLike} */ (loadedHttp);
}

export {
  createMinimalWebSocketServer,
  createWebSocketAcceptKey,
  defaultConnectionIdFactory,
  getWebSocketOpenState,
  isOriginAllowedForWebSocket,
  loadDefaultHttpModule,
  parseWebSocketFrames,
  readRequestBody,
};
