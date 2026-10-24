#!/usr/bin/env node
import { createRequire as pbCreateRequire } from 'node:module'; const require = pbCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list2, totalLength) {
      if (list2.length === 0) return EMPTY_BUFFER;
      if (list2.length === 1) return list2[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list2.length; i++) {
        const buf = list2[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && (typeof params.client_max_window_bits === "number" ? opts.clientMaxWindowBits > params.client_max_window_bits : !params.client_max_window_bits)) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var {
      types: { isUint8Array }
    } = __require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list2, cb) {
        if (list2.length === 2) {
          this._socket.cork();
          this._socket.write(list2[0]);
          this._socket.write(list2[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list2[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash: createHash5 } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            if (!options || options.protocols === void 0) {
              protocols = [];
            } else if (Array.isArray(options.protocols)) {
              protocols = options.protocols;
            } else {
              protocols = [options.protocols];
            }
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              if (options.protocols === void 0) {
                protocols = [];
              } else if (Array.isArray(options.protocols)) {
                protocols = options.protocols;
              } else {
                protocols = [options.protocols];
              }
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        this._readyState = _WebSocket.CLOSING;
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        protocols: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash5("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash: createHash5 } = __require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash5("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/ajv-formats/dist/formats.js
var require_formats = __commonJS({
  "node_modules/ajv-formats/dist/formats.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatNames = exports.fastFormats = exports.fullFormats = void 0;
    function fmtDef(validate, compare) {
      return { validate, compare };
    }
    exports.fullFormats = {
      // date: http://tools.ietf.org/html/rfc3339#section-5.6
      date: fmtDef(date, compareDate),
      // date-time: http://tools.ietf.org/html/rfc3339#section-5.6
      time: fmtDef(getTime(true), compareTime),
      "date-time": fmtDef(getDateTime(true), compareDateTime),
      "iso-time": fmtDef(getTime(), compareIsoTime),
      "iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
      // duration: https://tools.ietf.org/html/rfc3339#appendix-A
      duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
      uri,
      "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
      // uri-template: https://tools.ietf.org/html/rfc6570
      "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
      // For the source: https://gist.github.com/dperini/729294
      // For test cases: https://mathiasbynens.be/demo/url-regex
      url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
      email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
      hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
      // optimized https://www.safaribooksonline.com/library/view/regular-expressions-cookbook/9780596802837/ch07s16.html
      ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
      ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
      regex,
      // uuid: http://tools.ietf.org/html/rfc4122
      uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
      // JSON-pointer: https://tools.ietf.org/html/rfc6901
      // uri fragment: https://tools.ietf.org/html/rfc3986#appendix-A
      "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
      "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
      // relative JSON-pointer: http://tools.ietf.org/html/draft-luff-relative-json-pointer-00
      "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
      // the following formats are used by the openapi specification: https://spec.openapis.org/oas/v3.0.0#data-types
      // byte: https://github.com/miguelmota/is-base64
      byte,
      // signed 32 bit integer
      int32: { type: "number", validate: validateInt32 },
      // signed 64 bit integer
      int64: { type: "number", validate: validateInt64 },
      // C-type float
      float: { type: "number", validate: validateNumber },
      // C-type double
      double: { type: "number", validate: validateNumber },
      // hint to the UI to hide input strings
      password: true,
      // unchecked string payload
      binary: true
    };
    exports.fastFormats = {
      ...exports.fullFormats,
      date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
      time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
      "date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
      "iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
      "iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
      // uri: https://github.com/mafintosh/is-my-json-valid/blob/master/formats.js
      uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
      "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
      // email (sources from jsen validator):
      // http://stackoverflow.com/questions/201323/using-a-regular-expression-to-validate-an-email-address#answer-8829363
      // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address (search for 'wilful violation')
      email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
    };
    exports.formatNames = Object.keys(exports.fullFormats);
    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
    var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    function date(str2) {
      const matches = DATE.exec(str2);
      if (!matches)
        return false;
      const year = +matches[1];
      const month = +matches[2];
      const day = +matches[3];
      return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
    }
    function compareDate(d1, d2) {
      if (!(d1 && d2))
        return void 0;
      if (d1 > d2)
        return 1;
      if (d1 < d2)
        return -1;
      return 0;
    }
    var TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
    function getTime(strictTimeZone) {
      return function time(str2) {
        const matches = TIME.exec(str2);
        if (!matches)
          return false;
        const hr = +matches[1];
        const min = +matches[2];
        const sec = +matches[3];
        const tz = matches[4];
        const tzSign = matches[5] === "-" ? -1 : 1;
        const tzH = +(matches[6] || 0);
        const tzM = +(matches[7] || 0);
        if (tzH > 23 || tzM > 59 || strictTimeZone && !tz)
          return false;
        if (hr <= 23 && min <= 59 && sec < 60)
          return true;
        const utcMin = min - tzM * tzSign;
        const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
        return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
      };
    }
    function compareTime(s1, s2) {
      if (!(s1 && s2))
        return void 0;
      const t1 = (/* @__PURE__ */ new Date("2020-01-01T" + s1)).valueOf();
      const t2 = (/* @__PURE__ */ new Date("2020-01-01T" + s2)).valueOf();
      if (!(t1 && t2))
        return void 0;
      return t1 - t2;
    }
    function compareIsoTime(t1, t2) {
      if (!(t1 && t2))
        return void 0;
      const a1 = TIME.exec(t1);
      const a2 = TIME.exec(t2);
      if (!(a1 && a2))
        return void 0;
      t1 = a1[1] + a1[2] + a1[3];
      t2 = a2[1] + a2[2] + a2[3];
      if (t1 > t2)
        return 1;
      if (t1 < t2)
        return -1;
      return 0;
    }
    var DATE_TIME_SEPARATOR = /t|\s/i;
    function getDateTime(strictTimeZone) {
      const time = getTime(strictTimeZone);
      return function date_time(str2) {
        const dateTime = str2.split(DATE_TIME_SEPARATOR);
        return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
      };
    }
    function compareDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const d1 = new Date(dt1).valueOf();
      const d2 = new Date(dt2).valueOf();
      if (!(d1 && d2))
        return void 0;
      return d1 - d2;
    }
    function compareIsoDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
      const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
      const res = compareDate(d1, d2);
      if (res === void 0)
        return void 0;
      return res || compareTime(t1, t2);
    }
    var NOT_URI_FRAGMENT = /\/|:/;
    var URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
    function uri(str2) {
      return NOT_URI_FRAGMENT.test(str2) && URI.test(str2);
    }
    var BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
    function byte(str2) {
      BYTE.lastIndex = 0;
      return BYTE.test(str2);
    }
    var MIN_INT32 = -(2 ** 31);
    var MAX_INT32 = 2 ** 31 - 1;
    function validateInt32(value) {
      return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
    }
    function validateInt64(value) {
      return Number.isInteger(value);
    }
    function validateNumber() {
      return true;
    }
    var Z_ANCHOR = /[^\\]\\Z/;
    function regex(str2) {
      if (Z_ANCHOR.test(str2))
        return false;
      try {
        new RegExp(str2);
        return true;
      } catch (e) {
        return false;
      }
    }
  }
});

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/ajv/dist/compile/codegen/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports._ = _;
    var plus = new _Code("+");
    function str2(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports.str = str2;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str2`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
  }
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/ajv/dist/compile/codegen/scope.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
    exports.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
              code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code = (0, code_1._)`${code}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code;
      }
    };
    exports.ValueScope = ValueScope;
  }
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/ajv/dist/compile/codegen/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code) {
        super();
        this.code = code;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants) {
        this.code = optimizeExpr(this.code, names, constants);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code += "else " + this.else.render(opts);
        return code;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        if (!(super.optimizeNames(names, constants) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
          code += this.catch.render(opts);
        if (this.finally)
          code += this.finally.render(opts);
        return code;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants) {
        var _a, _b;
        super.optimizeNames(names, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code = ["{"];
        for (const [key, value] of keyValues) {
          if (code.length > 1)
            code.push(",");
          code.push(key);
          if (key !== value || this.opts.es5) {
            code.push(":");
            (0, code_1.addCodeArg)(code, value);
          }
        }
        code.push("}");
        return new code_1._Code(code);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports.not = not;
    var andCode = mappend(exports.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports.and = and;
    var orCode = mappend(exports.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "node_modules/ajv/dist/compile/util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash2 = {};
      for (const item of arr)
        hash2[item] = true;
      return hash2;
    }
    exports.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str2) {
      return unescapeJsonPointer(decodeURIComponent(str2));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str2) {
      return encodeURIComponent(escapeJsonPointer(str2));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str2) {
      if (typeof str2 == "number")
        return `${str2}`;
      return str2.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str2) {
      return str2.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports.checkStrictMode = checkStrictMode;
  }
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/ajv/dist/compile/names.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports.default = names;
  }
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/ajv/dist/compile/errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "node_modules/ajv/dist/compile/validate/boolSchema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema, validateName } = it;
      if (schema === false) {
        falseSchemaError(it, false);
      } else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "node_modules/ajv/dist/compile/rules.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getRules = exports.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports.getRules = getRules;
  }
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/ajv/dist/compile/validate/applicability.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule) => shouldUseRule(schema, rule));
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
      var _a;
      return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports.shouldUseRule = shouldUseRule;
  }
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/ajv/dist/compile/validate/dataType.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports.DataType = DataType = {}));
    function getSchemaTypes(schema) {
      const types = getJSONTypes(schema.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it
      };
    }
  }
});

// node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "node_modules/ajv/dist/compile/validate/defaults.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema, keyword, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports.validateUnion = validateUnion;
  }
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/ajv/dist/compile/validate/keyword.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result) {
      if (result === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
    }
    function validSchemaType(schema, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
    }
    exports.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/ajv/dist/compile/validate/subschema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema,
          schemaPath,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/json-schema-traverse/index.js"(exports, module) {
    "use strict";
    var traverse = module.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str2) {
      return str2.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/ajv/dist/compile/resolve.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema, limit = true) {
      if (typeof schema == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema);
      if (!limit)
        return false;
      return countKeys(schema) <= limit;
    }
    exports.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema) {
      for (const key in schema) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema) {
      let count = 0;
      for (const key in schema) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema[key] == "object") {
          (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize) {
      if (normalize !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema, baseId) {
      if (typeof schema == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
          innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/ajv/dist/compile/validate/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema, opts) {
      const schId = typeof schema == "object" && schema[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema, self }) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema, gen, opts } = it;
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema, errSchemaPath, opts, self } = it;
      if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema, opts } = it;
      if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
      const msg = schema.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema, rule)) {
            keywordCode(it, rule.keyword, rule.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
          const { type } = rule.definition;
          if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj, assign) {
        if (assign)
          Object.assign(this.params, obj);
        else
          this.params = obj;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType) ? schemaType : [schemaType];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports.getData = getData;
  }
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/ajv/dist/runtime/validation_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports.default = ValidationError;
  }
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/ajv/dist/compile/ref_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports.default = MissingRefError;
  }
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/ajv/dist/compile/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
          schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
      }
    };
    exports.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve5.call(this, root, ref);
      if (_sch === void 0) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema)
          _sch = new SchemaEnv({ schema, schemaId, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve5(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
          return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema = partSchema;
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env = env || new SchemaEnv({ schema, schemaId, root, baseId });
      if (env.schema !== env.root.schema)
        return env;
      return void 0;
    }
  }
});

// node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "node_modules/ajv/dist/refs/data.json"(exports, module) {
    module.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "node_modules/fast-uri/lib/utils.js"(exports, module) {
    "use strict";
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    var isPort = RegExp.prototype.test.bind(/^\d*$/u);
    var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
    var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
    var isPathCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/u);
    var isQueryFragmentCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u);
    var isUserinfoCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:]$/u);
    var BYTE_HEX = new Array(256);
    {
      const HEX_DIGITS = "0123456789ABCDEF";
      for (let i = 0; i < 256; i++) {
        BYTE_HEX[i] = "%" + HEX_DIGITS[i >> 4] + HEX_DIGITS[i & 15];
      }
    }
    function percentEncodeNonAscii(cp2) {
      if (cp2 < 2048) {
        return BYTE_HEX[192 | cp2 >> 6] + BYTE_HEX[128 | cp2 & 63];
      }
      if (cp2 < 65536) {
        return BYTE_HEX[224 | cp2 >> 12] + BYTE_HEX[128 | cp2 >> 6 & 63] + BYTE_HEX[128 | cp2 & 63];
      }
      return BYTE_HEX[240 | cp2 >> 18] + BYTE_HEX[128 | cp2 >> 12 & 63] + BYTE_HEX[128 | cp2 >> 6 & 63] + BYTE_HEX[128 | cp2 & 63];
    }
    function stringArrayToHexStripped(input) {
      let acc = "";
      let code = 0;
      let i = 0;
      for (i = 0; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (code === 48) {
          continue;
        }
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
        break;
      }
      for (i += 1; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
      }
      return acc;
    }
    var isHextet = RegExp.prototype.test.bind(/^[\dA-Fa-f]{1,4}$/);
    var isIPvFuture = RegExp.prototype.test.bind(/^[vV][\dA-Fa-f]+\.[A-Za-z\d\-._~!$&'()*+,;=:]+$/);
    var isZoneCharacter = RegExp.prototype.test.bind(/^[A-Za-z\d\-._~]$/);
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function isZoneIdentifier(zone) {
      if (zone.length === 0) return false;
      for (let i = 0; i < zone.length; i++) {
        if (isZoneCharacter(zone[i])) continue;
        if (zone[i] === "%" && i + 2 < zone.length && isHexPair(zone.slice(i + 1, i + 3))) {
          i += 2;
          continue;
        }
        return false;
      }
      return true;
    }
    function compressIPv6ZeroRun(hextets) {
      let bestStart = -1;
      let bestLength = 0;
      let runStart = -1;
      let runLength = 0;
      for (let i = 0; i < hextets.length; i++) {
        if (hextets[i] === "0") {
          if (runStart === -1) runStart = i;
          runLength++;
          if (runLength > bestLength) {
            bestLength = runLength;
            bestStart = runStart;
          }
        } else {
          runStart = -1;
          runLength = 0;
        }
      }
      if (bestLength < 2) return hextets.join(":");
      const head = hextets.slice(0, bestStart).join(":");
      const tail = hextets.slice(bestStart + bestLength).join(":");
      return head + "::" + tail;
    }
    function normalizeIPv6Address(input) {
      const compression = input.indexOf("::");
      if (compression !== -1 && input.indexOf("::", compression + 1) !== -1) return void 0;
      const left = compression === -1 ? input.split(":") : input.slice(0, compression).split(":");
      const right = compression === -1 ? [] : input.slice(compression + 2).split(":");
      if (compression !== -1) {
        if (left.length === 1 && left[0] === "") left.length = 0;
        if (right.length === 1 && right[0] === "") right.length = 0;
      }
      const parts = left.concat(right);
      let hextetCount = 0;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === "") return void 0;
        if (part.indexOf(".") !== -1) {
          if (i !== parts.length - 1 || compression !== -1 && right.length === 0 || !isIPv4(part)) return void 0;
          hextetCount += 2;
          continue;
        }
        if (!isHextet(part)) return void 0;
        parts[i] = parseInt(part, 16).toString(16);
        hextetCount++;
      }
      if (compression === -1) {
        if (hextetCount !== 8) return void 0;
        return compressIPv6ZeroRun(parts);
      }
      if (hextetCount >= 8) return void 0;
      const expanded = parts.slice(0, left.length);
      for (let i = hextetCount; i < 8; i++) expanded.push("0");
      for (let i = left.length; i < parts.length; i++) expanded.push(parts[i]);
      return compressIPv6ZeroRun(expanded);
    }
    function normalizeIPv6(host) {
      const bracketed = host[0] === "[" && host[host.length - 1] === "]";
      const hasBracket = host[0] === "[" || host[host.length - 1] === "]";
      if (hasBracket && !bracketed) return { host, isIPV6: false, error: true };
      let input = bracketed ? host.slice(1, -1) : host;
      if (bracketed && isIPvFuture(input)) {
        input = input.toLowerCase();
        return { host: `[${input}]`, escapedHost: input, isIPV6: false, isIPVFuture: true };
      }
      if (findToken(input, ":") < 2) {
        return { host, isIPV6: false, error: bracketed };
      }
      let zoneIdentifier = "";
      const zoneSeparator = input.indexOf("%");
      if (zoneSeparator !== -1) {
        const separatorLength = input.slice(zoneSeparator, zoneSeparator + 3).toLowerCase() === "%25" ? 3 : 1;
        zoneIdentifier = input.slice(zoneSeparator + separatorLength);
        if (!isZoneIdentifier(zoneIdentifier)) return { host, isIPV6: false, error: true };
        input = input.slice(0, zoneSeparator);
      }
      const address = normalizeIPv6Address(input);
      if (address === void 0) return { host, isIPV6: false, error: true };
      return {
        host: address + (zoneIdentifier ? "%" + zoneIdentifier : ""),
        escapedHost: address + (zoneIdentifier ? "%25" + zoneIdentifier : ""),
        isIPV6: true
      };
    }
    function findToken(str2, token) {
      let ind = 0;
      for (let i = 0; i < str2.length; i++) {
        if (str2[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path) {
      let input = path;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input.length) {
        if (len === 1) {
          if (input === ".") {
            break;
          } else if (input === "/") {
            output.push("/");
            break;
          } else {
            output.push(input);
            break;
          }
        } else if (len === 2) {
          if (input[0] === ".") {
            if (input[1] === ".") {
              break;
            } else if (input[1] === "/") {
              input = input.slice(2);
              continue;
            }
          } else if (input[0] === "/") {
            if (input[1] === "." || input[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input[0] === ".") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(3);
              continue;
            }
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(2);
              continue;
            } else if (input[2] === ".") {
              if (input[3] === "/") {
                input = input.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input.indexOf("/", 1)) === -1) {
          output.push(input);
          break;
        } else {
          output.push(input.slice(0, nextSlash));
          input = input.slice(nextSlash);
        }
      }
      return output.join("");
    }
    var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
    var HOST_DELIM_RE = /[@/?#:]/g;
    var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
    function reescapeHostDelimiters(host, isIP2) {
      const re = isIP2 ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
      re.lastIndex = 0;
      return host.replace(re, (ch) => HOST_DELIMS[ch]);
    }
    function normalizePercentEncoding(input, decodeUnreserved = false) {
      if (input.indexOf("%") === -1) {
        return input;
      }
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decodeUnreserved && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        output += input[i];
      }
      return output;
    }
    function normalizePathEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decoded !== "." && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isPathCharacter(ch)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function serializePathEncoding(input, pathNoScheme = false) {
      let output = "";
      let firstSegment = pathNoScheme && input[0] !== "/";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        if (ch === "/") {
          firstSegment = false;
        }
        if (isPathCharacter(ch) && (ch !== ":" || !firstSegment)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function encodeComponent(input, isAllowed) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        if (isAllowed(ch)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function encodeUserinfo(input) {
      return encodeComponent(input, isUserinfoCharacter);
    }
    function encodeQuery(input) {
      return encodeComponent(input, isQueryFragmentCharacter);
    }
    function encodeFragment(input) {
      return encodeComponent(input, isQueryFragmentCharacter);
    }
    function isEscapeSafe(cp2) {
      return cp2 >= 48 && cp2 <= 57 || cp2 >= 65 && cp2 <= 90 || cp2 >= 97 && cp2 <= 122 || cp2 === 42 || cp2 === 43 || cp2 === 45 || cp2 === 46 || cp2 === 47 || cp2 === 64 || cp2 === 95;
    }
    function normalizeQueryFragmentEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isQueryFragmentCharacter(ch)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function escapePreservingEscapes(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        output += escape(input[i]);
      }
      return output;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(encodeUserinfo(component.userinfo));
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = component.host;
        if (!isIPv4(host)) {
          let ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 !== true && ipV6res.isIPVFuture !== true) {
            host = normalizePercentEncoding(host, true);
            ipV6res = normalizeIPv6(host);
          }
          if (ipV6res.isIPV6 === true || ipV6res.isIPVFuture === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = reescapeHostDelimiters(host, false);
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        const port = String(component.port);
        if (!isPort(port)) {
          throw new TypeError("URI port is malformed.");
        }
        uriTokens.push(":");
        uriTokens.push(port);
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      reescapeHostDelimiters,
      normalizePercentEncoding,
      normalizePathEncoding,
      serializePathEncoding,
      normalizeQueryFragmentEncoding,
      encodeUserinfo,
      encodeQuery,
      encodeFragment,
      escapePreservingEscapes,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "node_modules/fast-uri/lib/schemes.js"(exports, module) {
    "use strict";
    var { isUUID } = require_utils();
    var URN_REG = /^([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-./:;=@]|%[\da-f]{2})+)$/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const queryIndex = wsComponent.resourceName.indexOf("?");
        const path = queryIndex === -1 ? wsComponent.resourceName : wsComponent.resourceName.slice(0, queryIndex);
        wsComponent.path = path && path !== "/" ? path : void 0;
        wsComponent.query = queryIndex === -1 ? void 0 : wsComponent.resourceName.slice(queryIndex + 1);
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches && matches[0] === urnComponent.path) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http,
        https,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/fast-uri/index.js"(exports, module) {
    "use strict";
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, serializePathEncoding, normalizeQueryFragmentEncoding, encodeQuery, encodeFragment, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    var VALID_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/u;
    var MALFORMED_SCHEME_ERROR = "URI scheme is malformed.";
    function decodeValidScheme(scheme) {
      const decodedScheme = unescape(String(scheme));
      if (!VALID_SCHEME.test(decodedScheme)) {
        throw new TypeError(MALFORMED_SCHEME_ERROR);
      }
      return decodedScheme;
    }
    function normalize(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        normalizeString(uri, options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse(serialize(uri, options), options);
      }
      return uri;
    }
    function resolve5(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const {
        parsed: baseParsed,
        malformedAuthorityOrPort: baseMalformed,
        malformedPercentEncoding: baseMalformedPercentEncoding,
        malformedSchemeSpecific: baseMalformedSchemeSpecific,
        malformedHost: baseMalformedHost,
        malformedScheme: baseMalformedScheme
      } = parseWithStatus(baseURI, schemelessOptions);
      const {
        parsed: relativeParsed,
        malformedAuthorityOrPort: relativeMalformed,
        malformedPercentEncoding: relativeMalformedPercentEncoding,
        malformedSchemeSpecific: relativeMalformedSchemeSpecific,
        malformedHost: relativeMalformedHost,
        malformedScheme: relativeMalformedScheme
      } = parseWithStatus(relativeURI, schemelessOptions);
      if (baseMalformed || relativeMalformed || baseMalformedPercentEncoding || relativeMalformedPercentEncoding || baseMalformedSchemeSpecific || relativeMalformedSchemeSpecific || baseMalformedHost || relativeMalformedHost || baseMalformedScheme || relativeMalformedScheme) {
        throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
      }
      const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
      const resolvedSchemeHandler = getSchemeHandler(options && options.scheme || resolved.scheme);
      const resolvedHost = resolved.host;
      const resolvedHostIsIP = resolvedHost !== void 0 && resolvedHost !== "" && (isIPv4(resolvedHost) || normalizeIPv6(resolvedHost).isIPV6);
      canonicalizeHost(resolved, options || {}, resolvedSchemeHandler, resolvedHostIsIP);
      const encodedASCIIHost = resolvedHost && resolvedHost.indexOf("%") !== -1 && !new RegExp("\\P{ASCII}", "u").test(resolvedHost);
      if (resolved.error && !encodedASCIIHost) {
        throw new Error(resolved.error);
      }
      schemelessOptions.skipEscape = true;
      return serialize(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative3, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative3 = parse(serialize(relative3, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative3.scheme) {
        target.scheme = relative3.scheme;
        target.userinfo = relative3.userinfo;
        target.host = relative3.host;
        target.port = relative3.port;
        target.path = removeDotSegments(relative3.path || "");
        target.query = relative3.query;
      } else {
        if (relative3.userinfo !== void 0 || relative3.host !== void 0 || relative3.port !== void 0) {
          target.userinfo = relative3.userinfo;
          target.host = relative3.host;
          target.port = relative3.port;
          target.path = removeDotSegments(relative3.path || "");
          target.query = relative3.query;
        } else {
          if (!relative3.path) {
            target.path = base.path;
            if (relative3.query !== void 0) {
              target.query = relative3.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative3.path[0] === "/") {
              target.path = removeDotSegments(relative3.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative3.path;
              } else if (!base.path) {
                target.path = relative3.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative3.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative3.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative3.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      const normalizedA = normalizeComparableURI(uriA, options);
      const normalizedB = normalizeComparableURI(uriB, options);
      return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA === normalizedB;
    }
    function serialize(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      if (component.scheme) {
        component.scheme = decodeValidScheme(component.scheme);
      }
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      const hasAuthority = component.userinfo !== void 0 || component.host !== void 0 || component.port !== void 0;
      const pathNoScheme = !options.skipEscape && component.scheme === void 0 && !hasAuthority;
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = serializePathEncoding(component.path, pathNoScheme);
        } else {
          component.path = normalizePercentEncoding(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        component.scheme = decodeValidScheme(component.scheme);
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (pathNoScheme) {
          s = serializePathEncoding(s, true);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", encodeQuery(component.query));
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", encodeFragment(component.fragment));
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    var AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
    var AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
    function getParseError(parsed, matches) {
      if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
        return 'URI path must start with "/" when authority is present.';
      }
      if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
        return "URI port is malformed.";
      }
      return void 0;
    }
    function hasMalformedPercentEncoding(component) {
      if (component === void 0) return false;
      let percent = component.indexOf("%");
      while (percent !== -1) {
        if (percent + 2 >= component.length || !/^[\da-f]{2}$/iu.test(component.slice(percent + 1, percent + 3))) {
          return true;
        }
        percent = component.indexOf("%", percent + 3);
      }
      return false;
    }
    function isIPLiteral(host) {
      return host[0] === "[" && host[host.length - 1] === "]";
    }
    function hasMalformedComponentPercentEncoding(matches) {
      const host = matches[4];
      return hasMalformedPercentEncoding(matches[3]) || host !== void 0 && !isIPLiteral(host) && hasMalformedPercentEncoding(host) || hasMalformedPercentEncoding(matches[6]) || hasMalformedPercentEncoding(matches[7]) || hasMalformedPercentEncoding(matches[8]);
    }
    function canonicalizeHost(parsed, options, schemeHandler, isIP2) {
      if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport) && parsed.host && !isIPLiteral(parsed.host) && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP2 === false && nonSimpleDomain(parsed.host)) {
        try {
          parsed.host = new URL("http://" + parsed.host).hostname;
        } catch (e) {
          parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
          return true;
        }
      }
      return false;
    }
    function parseWithStatus(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let malformedAuthorityOrPort = false;
      let malformedPercentEncoding = false;
      let malformedSchemeSpecific = false;
      let malformedHost = false;
      let malformedIPLiteral = false;
      let malformedScheme = false;
      let isIP2 = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const authorityMatch = uri.match(AUTHORITY_PREFIX);
      if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
        parsed.error = "URI authority must not contain a literal backslash.";
        malformedAuthorityOrPort = true;
      }
      const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
      if (introducerMatch !== null) {
        const region = introducerMatch[1];
        const normalizedRegion = region.replace(/[\t\n\r]/g, "");
        if (normalizedRegion.length >= 2) {
          if (normalizedRegion.slice(0, 2) !== "//") {
            parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
            malformedAuthorityOrPort = true;
          } else if (region.length !== normalizedRegion.length) {
            parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
            malformedAuthorityOrPort = true;
          }
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (parsed.scheme !== void 0) {
          const decodedScheme = unescape(parsed.scheme);
          if (VALID_SCHEME.test(decodedScheme)) {
            parsed.scheme = decodedScheme.toLowerCase();
          } else {
            parsed.error = parsed.error || MALFORMED_SCHEME_ERROR;
            malformedScheme = true;
          }
        }
        malformedPercentEncoding = hasMalformedComponentPercentEncoding(matches);
        if (malformedPercentEncoding) {
          parsed.error = parsed.error || "URI contains malformed percent-encoding.";
        }
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        const parseError = getParseError(parsed, matches);
        if (parseError !== void 0) {
          parsed.error = parsed.error || parseError;
          malformedAuthorityOrPort = true;
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const bracketedIPLiteral = isIPLiteral(parsed.host);
            const hasIPLiteralBracket = parsed.host.indexOf("[") !== -1 || parsed.host.indexOf("]") !== -1;
            const ipv6result = normalizeIPv6(parsed.host);
            isIP2 = ipv6result.isIPV6 || ipv6result.isIPVFuture === true;
            malformedIPLiteral = hasIPLiteralBracket && (!bracketedIPLiteral || ipv6result.error === true);
            parsed.host = isIP2 ? ipv6result.host : ipv6result.host.toLowerCase();
            if (malformedIPLiteral) {
              parsed.error = parsed.error || "URI host is malformed.";
              malformedAuthorityOrPort = true;
            }
          } else {
            isIP2 = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        if (!malformedIPLiteral) {
          malformedHost = canonicalizeHost(parsed, options, schemeHandler, isIP2);
        }
        if (uri.indexOf("%") !== -1 && parsed.host !== void 0 && !malformedIPLiteral) {
          let host = isIP2 ? parsed.host : normalizePercentEncoding(parsed.host, true);
          if (!isIP2) {
            host = normalizePercentEncoding(host.toLowerCase());
          }
          parsed.host = reescapeHostDelimiters(host, isIP2);
        }
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (parsed.path) {
            parsed.path = normalizePathEncoding(parsed.path);
          }
          if (parsed.query) {
            parsed.query = normalizeQueryFragmentEncoding(parsed.query);
          }
          if (parsed.fragment) {
            parsed.fragment = normalizeQueryFragmentEncoding(parsed.fragment);
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
          if (schemeHandler === SCHEMES.urn && parsed.nid === void 0) {
            malformedSchemeSpecific = true;
          }
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme };
    }
    function parse(uri, opts) {
      return parseWithStatus(uri, opts).parsed;
    }
    function normalizeString(uri, opts) {
      return normalizeStringWithStatus(uri, opts).normalized;
    }
    function normalizeStringWithStatus(uri, opts) {
      const { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = parseWithStatus(uri, opts);
      return {
        normalized: malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? uri : serialize(parsed, opts),
        malformedAuthorityOrPort,
        malformedPercentEncoding,
        malformedSchemeSpecific,
        malformedHost,
        malformedScheme
      };
    }
    function normalizeComparableURI(uri, opts) {
      if (typeof uri !== "string" && typeof uri !== "object") {
        return void 0;
      }
      let value;
      try {
        value = typeof uri === "string" ? uri : serialize(uri, opts);
      } catch {
        return void 0;
      }
      const { normalized, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = normalizeStringWithStatus(value, opts);
      return malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? void 0 : normalized;
    }
    var fastUri = {
      SCHEMES,
      normalize,
      resolve: resolve5,
      resolveComponent,
      equal,
      serialize,
      parse
    };
    module.exports = fastUri;
    module.exports.default = fastUri;
    module.exports.fastUri = fastUri;
  }
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/ajv/dist/runtime/uri.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports.default = uri;
  }
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/ajv/dist/core.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str2, flags) => new RegExp(str2, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = /* @__PURE__ */ Object.create(null);
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id = schema[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text2, msg) => text2 + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule = rules[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv.ValidationError = validation_error_1.default;
    Ajv.MissingRefError = ref_error_1.default;
    exports.default = Ajv;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
          this.addFormat(name, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  }
});

// node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/id.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/ref.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.callRef = exports.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env === root)
            return callRef(cxt, validateName, env, env.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports.callRef = callRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports.default = core;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str2) {
      const len = str2.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str2.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str2.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var util_1 = require_util();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
          const { regExp } = it.opts.code;
          const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
          const valid = gen.let("valid");
          gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
          cxt.fail$data((0, codegen_1._)`!${valid}`);
        } else {
          const regExp = (0, code_1.usePattern)(cxt, schema);
          cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/required.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
          return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/const.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || schema && typeof schema == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/enum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports.default = validation;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports.validateAdditionalItems = validateAdditionalItems;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
          return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports.validateTuple = validateTuple;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
            deleteAdditional(key);
            return;
          }
          if (schema === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/not.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/if.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema = it.schema[keyword];
      return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
    }
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports.default = getApplicator;
  }
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/format.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports.default = format;
  }
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/ajv/dist/vocabularies/metadata.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.contentVocabulary = exports.metadataVocabulary = void 0;
    exports.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/ajv/dist/vocabularies/draft7.js
var require_draft7 = __commonJS({
  "node_modules/ajv/dist/vocabularies/draft7.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation2();
    var applicator_1 = require_applicator();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft7Vocabularies = [
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary
    ];
    exports.default = draft7Vocabularies;
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports.DiscrError = DiscrError = {}));
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required }) {
            return Array.isArray(required) && required.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/refs/json-schema-draft-07.json
var require_json_schema_draft_07 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-draft-07.json"(exports, module) {
    module.exports = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: "http://json-schema.org/draft-07/schema#",
      title: "Core schema meta-schema",
      definitions: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $ref: "#" }
        },
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }]
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      },
      type: ["object", "boolean"],
      properties: {
        $id: {
          type: "string",
          format: "uri-reference"
        },
        $schema: {
          type: "string",
          format: "uri"
        },
        $ref: {
          type: "string",
          format: "uri-reference"
        },
        $comment: {
          type: "string"
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        readOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/definitions/nonNegativeInteger" },
        minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        additionalItems: { $ref: "#" },
        items: {
          anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }],
          default: true
        },
        maxItems: { $ref: "#/definitions/nonNegativeInteger" },
        minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        contains: { $ref: "#" },
        maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
        minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        required: { $ref: "#/definitions/stringArray" },
        additionalProperties: { $ref: "#" },
        definitions: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        properties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependencies: {
          type: "object",
          additionalProperties: {
            anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }]
          }
        },
        propertyNames: { $ref: "#" },
        const: true,
        enum: {
          type: "array",
          items: true,
          minItems: 1,
          uniqueItems: true
        },
        type: {
          anyOf: [
            { $ref: "#/definitions/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/definitions/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        format: { type: "string" },
        contentMediaType: { type: "string" },
        contentEncoding: { type: "string" },
        if: { $ref: "#" },
        then: { $ref: "#" },
        else: { $ref: "#" },
        allOf: { $ref: "#/definitions/schemaArray" },
        anyOf: { $ref: "#/definitions/schemaArray" },
        oneOf: { $ref: "#/definitions/schemaArray" },
        not: { $ref: "#" }
      },
      default: true
    };
  }
});

// node_modules/ajv/dist/ajv.js
var require_ajv = __commonJS({
  "node_modules/ajv/dist/ajv.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv = void 0;
    var core_1 = require_core();
    var draft7_1 = require_draft7();
    var discriminator_1 = require_discriminator();
    var draft7MetaSchema = require_json_schema_draft_07();
    var META_SUPPORT_DATA = ["/properties"];
    var META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    var Ajv = class extends core_1.default {
      _addVocabularies() {
        super._addVocabularies();
        draft7_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        if (!this.opts.meta)
          return;
        const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
        this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv = Ajv;
    module.exports = exports = Ajv;
    module.exports.Ajv = Ajv;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// node_modules/ajv-formats/dist/limit.js
var require_limit = __commonJS({
  "node_modules/ajv-formats/dist/limit.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatLimitDefinition = void 0;
    var ajv_1 = require_ajv();
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      formatMaximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      formatMinimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      formatExclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      formatExclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`should be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    exports.formatLimitDefinition = {
      keyword: Object.keys(KWDs),
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, keyword, it } = cxt;
        const { opts, self } = it;
        if (!opts.validateFormats)
          return;
        const fCxt = new ajv_1.KeywordCxt(it, self.RULES.all.format.definition, "format");
        if (fCxt.$data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fmt = gen.const("fmt", (0, codegen_1._)`${fmts}[${fCxt.schemaCode}]`);
          cxt.fail$data((0, codegen_1.or)((0, codegen_1._)`typeof ${fmt} != "object"`, (0, codegen_1._)`${fmt} instanceof RegExp`, (0, codegen_1._)`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
        }
        function validateFormat() {
          const format = fCxt.schema;
          const fmtDef = self.formats[format];
          if (!fmtDef || fmtDef === true)
            return;
          if (typeof fmtDef != "object" || fmtDef instanceof RegExp || typeof fmtDef.compare != "function") {
            throw new Error(`"${keyword}": format "${format}" does not define "compare" function`);
          }
          const fmt = gen.scopeValue("formats", {
            key: format,
            ref: fmtDef,
            code: opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(format)}` : void 0
          });
          cxt.fail$data(compareCode(fmt));
        }
        function compareCode(fmt) {
          return (0, codegen_1._)`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword].fail} 0`;
        }
      },
      dependencies: ["format"]
    };
    var formatLimitPlugin = (ajv) => {
      ajv.addKeyword(exports.formatLimitDefinition);
      return ajv;
    };
    exports.default = formatLimitPlugin;
  }
});

// node_modules/ajv-formats/dist/index.js
var require_dist = __commonJS({
  "node_modules/ajv-formats/dist/index.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var formats_1 = require_formats();
    var limit_1 = require_limit();
    var codegen_1 = require_codegen();
    var fullName = new codegen_1.Name("fullFormats");
    var fastName = new codegen_1.Name("fastFormats");
    var formatsPlugin = (ajv, opts = { keywords: true }) => {
      if (Array.isArray(opts)) {
        addFormats2(ajv, opts, formats_1.fullFormats, fullName);
        return ajv;
      }
      const [formats, exportName] = opts.mode === "fast" ? [formats_1.fastFormats, fastName] : [formats_1.fullFormats, fullName];
      const list2 = opts.formats || formats_1.formatNames;
      addFormats2(ajv, list2, formats, exportName);
      if (opts.keywords)
        (0, limit_1.default)(ajv);
      return ajv;
    };
    formatsPlugin.get = (name, mode = "full") => {
      const formats = mode === "fast" ? formats_1.fastFormats : formats_1.fullFormats;
      const f = formats[name];
      if (!f)
        throw new Error(`Unknown format "${name}"`);
      return f;
    };
    function addFormats2(ajv, list2, fs, exportName) {
      var _a;
      var _b;
      (_a = (_b = ajv.opts.code).formats) !== null && _a !== void 0 ? _a : _b.formats = (0, codegen_1._)`require("ajv-formats/dist/formats").${exportName}`;
      for (const f of list2)
        ajv.addFormat(f, fs[f]);
    }
    module.exports = exports = formatsPlugin;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = formatsPlugin;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js
var require_dynamicAnchor = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicAnchor = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicAnchor",
      schemaType: "string",
      code: (cxt) => dynamicAnchor(cxt, cxt.schema)
    };
    function dynamicAnchor(cxt, anchor) {
      const { gen, it } = cxt;
      it.schemaEnv.root.dynamicAnchors[anchor] = true;
      const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
      const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
      gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
    }
    exports.dynamicAnchor = dynamicAnchor;
    function _getValidate(cxt) {
      const { schemaEnv, schema, self } = cxt.it;
      const { root, baseId, localRefs, meta } = schemaEnv.root;
      const { schemaId } = self.opts;
      const sch = new compile_1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
      compile_1.compileSchema.call(self, sch);
      return (0, ref_1.getValidate)(cxt, sch);
    }
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js
var require_dynamicRef = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicRef = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicRef",
      schemaType: "string",
      code: (cxt) => dynamicRef(cxt, cxt.schema)
    };
    function dynamicRef(cxt, ref) {
      const { gen, keyword, it } = cxt;
      if (ref[0] !== "#")
        throw new Error(`"${keyword}" only supports hash fragment reference`);
      const anchor = ref.slice(1);
      if (it.allErrors) {
        _dynamicRef();
      } else {
        const valid = gen.let("valid", false);
        _dynamicRef(valid);
        cxt.ok(valid);
      }
      function _dynamicRef(valid) {
        if (it.schemaEnv.root.dynamicAnchors[anchor]) {
          const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
          gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
        } else {
          _callRef(it.validateName, valid)();
        }
      }
      function _callRef(validate, valid) {
        return valid ? () => gen.block(() => {
          (0, ref_1.callRef)(cxt, validate);
          gen.let(valid, true);
        }) : () => (0, ref_1.callRef)(cxt, validate);
      }
    }
    exports.dynamicRef = dynamicRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js
var require_recursiveAnchor = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var util_1 = require_util();
    var def = {
      keyword: "$recursiveAnchor",
      schemaType: "boolean",
      code(cxt) {
        if (cxt.schema)
          (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
        else
          (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js
var require_recursiveRef = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicRef_1 = require_dynamicRef();
    var def = {
      keyword: "$recursiveRef",
      schemaType: "string",
      code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/index.js
var require_dynamic = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var dynamicRef_1 = require_dynamicRef();
    var recursiveAnchor_1 = require_recursiveAnchor();
    var recursiveRef_1 = require_recursiveRef();
    var dynamic = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
    exports.default = dynamic;
  }
});

// node_modules/ajv/dist/vocabularies/validation/dependentRequired.js
var require_dependentRequired = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/dependentRequired.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentRequired",
      type: "object",
      schemaType: "object",
      error: dependencies_1.error,
      code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js
var require_dependentSchemas = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentSchemas",
      type: "object",
      schemaType: "object",
      code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitContains.js
var require_limitContains = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitContains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["maxContains", "minContains"],
      type: "array",
      schemaType: "number",
      code({ keyword, parentSchema, it }) {
        if (parentSchema.contains === void 0) {
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/next.js
var require_next = __commonJS({
  "node_modules/ajv/dist/vocabularies/next.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependentRequired_1 = require_dependentRequired();
    var dependentSchemas_1 = require_dependentSchemas();
    var limitContains_1 = require_limitContains();
    var next = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
    exports.default = next;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js
var require_unevaluatedProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var error = {
      message: "must NOT have unevaluated properties",
      params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
    };
    var def = {
      keyword: "unevaluatedProperties",
      type: "object",
      schemaType: ["boolean", "object"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, props } = it;
        if (props instanceof codegen_1.Name) {
          gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
        } else if (props !== true) {
          gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
        }
        it.props = true;
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function unevaluatedPropCode(key) {
          if (schema === false) {
            cxt.setParams({ unevaluatedProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (!(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            cxt.subschema({
              keyword: "unevaluatedProperties",
              dataProp: key,
              dataPropType: util_1.Type.Str
            }, valid);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          }
        }
        function unevaluatedDynamic(evaluatedProps, key) {
          return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
        }
        function unevaluatedStatic(evaluatedProps, key) {
          const ps = [];
          for (const p in evaluatedProps) {
            if (evaluatedProps[p] === true)
              ps.push((0, codegen_1._)`${key} !== ${p}`);
          }
          return (0, codegen_1.and)(...ps);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js
var require_unevaluatedItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "unevaluatedItems",
      type: "array",
      schemaType: ["boolean", "object"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        const items = it.items || 0;
        if (items === true)
          return;
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        if (schema === false) {
          cxt.setParams({ len: items });
          cxt.fail((0, codegen_1._)`${len} > ${items}`);
        } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
          gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
          cxt.ok(valid);
        }
        it.items = true;
        function validateItems(valid, from) {
          gen.forRange("i", from, len, (i) => {
            cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
            if (!it.allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/index.js
var require_unevaluated = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var unevaluatedProperties_1 = require_unevaluatedProperties();
    var unevaluatedItems_1 = require_unevaluatedItems();
    var unevaluated = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
    exports.default = unevaluated;
  }
});

// node_modules/ajv/dist/vocabularies/draft2020.js
var require_draft2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/draft2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation2();
    var applicator_1 = require_applicator();
    var dynamic_1 = require_dynamic();
    var next_1 = require_next();
    var unevaluated_1 = require_unevaluated();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft2020Vocabularies = [
      dynamic_1.default,
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(true),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary,
      next_1.default,
      unevaluated_1.default
    ];
    exports.default = draft2020Vocabularies;
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/schema.json
var require_schema = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/schema.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/schema",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true,
        "https://json-schema.org/draft/2020-12/vocab/applicator": true,
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
        "https://json-schema.org/draft/2020-12/vocab/validation": true,
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Core and Validation specifications meta-schema",
      allOf: [
        { $ref: "meta/core" },
        { $ref: "meta/applicator" },
        { $ref: "meta/unevaluated" },
        { $ref: "meta/validation" },
        { $ref: "meta/meta-data" },
        { $ref: "meta/format-annotation" },
        { $ref: "meta/content" }
      ],
      type: ["object", "boolean"],
      $comment: "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
      properties: {
        definitions: {
          $comment: '"definitions" has been replaced by "$defs".',
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          deprecated: true,
          default: {}
        },
        dependencies: {
          $comment: '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
          type: "object",
          additionalProperties: {
            anyOf: [{ $dynamicRef: "#meta" }, { $ref: "meta/validation#/$defs/stringArray" }]
          },
          deprecated: true,
          default: {}
        },
        $recursiveAnchor: {
          $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
          $ref: "meta/core#/$defs/anchorString",
          deprecated: true
        },
        $recursiveRef: {
          $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
          $ref: "meta/core#/$defs/uriReferenceString",
          deprecated: true
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json
var require_applicator2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/applicator",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/applicator": true
      },
      $dynamicAnchor: "meta",
      title: "Applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        prefixItems: { $ref: "#/$defs/schemaArray" },
        items: { $dynamicRef: "#meta" },
        contains: { $dynamicRef: "#meta" },
        additionalProperties: { $dynamicRef: "#meta" },
        properties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependentSchemas: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        propertyNames: { $dynamicRef: "#meta" },
        if: { $dynamicRef: "#meta" },
        then: { $dynamicRef: "#meta" },
        else: { $dynamicRef: "#meta" },
        allOf: { $ref: "#/$defs/schemaArray" },
        anyOf: { $ref: "#/$defs/schemaArray" },
        oneOf: { $ref: "#/$defs/schemaArray" },
        not: { $dynamicRef: "#meta" }
      },
      $defs: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $dynamicRef: "#meta" }
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json
var require_unevaluated2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/unevaluated",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true
      },
      $dynamicAnchor: "meta",
      title: "Unevaluated applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        unevaluatedItems: { $dynamicRef: "#meta" },
        unevaluatedProperties: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json
var require_content = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/content",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Content vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        contentEncoding: { type: "string" },
        contentMediaType: { type: "string" },
        contentSchema: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json
var require_core3 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/core",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true
      },
      $dynamicAnchor: "meta",
      title: "Core vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        $id: {
          $ref: "#/$defs/uriReferenceString",
          $comment: "Non-empty fragments not allowed.",
          pattern: "^[^#]*#?$"
        },
        $schema: { $ref: "#/$defs/uriString" },
        $ref: { $ref: "#/$defs/uriReferenceString" },
        $anchor: { $ref: "#/$defs/anchorString" },
        $dynamicRef: { $ref: "#/$defs/uriReferenceString" },
        $dynamicAnchor: { $ref: "#/$defs/anchorString" },
        $vocabulary: {
          type: "object",
          propertyNames: { $ref: "#/$defs/uriString" },
          additionalProperties: {
            type: "boolean"
          }
        },
        $comment: {
          type: "string"
        },
        $defs: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" }
        }
      },
      $defs: {
        anchorString: {
          type: "string",
          pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
        },
        uriString: {
          type: "string",
          format: "uri"
        },
        uriReferenceString: {
          type: "string",
          format: "uri-reference"
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json
var require_format_annotation = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/format-annotation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true
      },
      $dynamicAnchor: "meta",
      title: "Format vocabulary meta-schema for annotation results",
      type: ["object", "boolean"],
      properties: {
        format: { type: "string" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json
var require_meta_data = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/meta-data",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true
      },
      $dynamicAnchor: "meta",
      title: "Meta-data vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        deprecated: {
          type: "boolean",
          default: false
        },
        readOnly: {
          type: "boolean",
          default: false
        },
        writeOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json
var require_validation3 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/validation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/validation": true
      },
      $dynamicAnchor: "meta",
      title: "Validation vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        type: {
          anyOf: [
            { $ref: "#/$defs/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/$defs/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        const: true,
        enum: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/$defs/nonNegativeInteger" },
        minLength: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        maxItems: { $ref: "#/$defs/nonNegativeInteger" },
        minItems: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        maxContains: { $ref: "#/$defs/nonNegativeInteger" },
        minContains: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 1
        },
        maxProperties: { $ref: "#/$defs/nonNegativeInteger" },
        minProperties: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        required: { $ref: "#/$defs/stringArray" },
        dependentRequired: {
          type: "object",
          additionalProperties: {
            $ref: "#/$defs/stringArray"
          }
        }
      },
      $defs: {
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 0
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/index.js
var require_json_schema_2020_12 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var metaSchema = require_schema();
    var applicator = require_applicator2();
    var unevaluated = require_unevaluated2();
    var content = require_content();
    var core = require_core3();
    var format = require_format_annotation();
    var metadata = require_meta_data();
    var validation = require_validation3();
    var META_SUPPORT_DATA = ["/properties"];
    function addMetaSchema2020($data) {
      ;
      [
        metaSchema,
        applicator,
        unevaluated,
        content,
        core,
        with$data(this, format),
        metadata,
        with$data(this, validation)
      ].forEach((sch) => this.addMetaSchema(sch, void 0, false));
      return this;
      function with$data(ajv, sch) {
        return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
      }
    }
    exports.default = addMetaSchema2020;
  }
});

// node_modules/ajv/dist/2020.js
var require__ = __commonJS({
  "node_modules/ajv/dist/2020.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
    var core_1 = require_core();
    var draft2020_1 = require_draft2020();
    var discriminator_1 = require_discriminator();
    var json_schema_2020_12_1 = require_json_schema_2020_12();
    var META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
    var Ajv20202 = class extends core_1.default {
      constructor(opts = {}) {
        super({
          ...opts,
          dynamicRef: true,
          next: true,
          unevaluated: true
        });
      }
      _addVocabularies() {
        super._addVocabularies();
        draft2020_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        const { $data, meta } = this.opts;
        if (!meta)
          return;
        json_schema_2020_12_1.default.call(this, $data);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv2020 = Ajv20202;
    module.exports = exports = Ajv20202;
    module.exports.Ajv2020 = Ajv20202;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv20202;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// src/core/core.ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
var ConnectError = class extends Error {
  constructor(code, message, nextStep) {
    super(message);
    this.code = code;
    this.nextStep = nextStep;
    this.name = "ConnectError";
  }
  code;
  nextStep;
};
var MAX_OUTPUT_BYTES = 32 * 1024;
var MAX_OUTPUT_LINES = 500;
var CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
var ANSI = /(?:\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007]*(?:\u0007|\u001B\\))/g;
var SECRET_PATTERNS = [
  /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g,
  /\b(Bearer\s+)[A-Za-z0-9._~+/-]{12,}=?/gi,
  /\b((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi
];
function safeInteger(value, fallback, min, max, label) {
  if (value === void 0) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ConnectError("invalid_argument", `${label} must be an integer from ${min} to ${max}.`, `Choose a ${label} in that range.`);
  }
  return value;
}
function sanitizeOutput(text2, options = {}) {
  const bytes = safeInteger(options.bytes, 8 * 1024, 1, MAX_OUTPUT_BYTES, "bytes");
  const lines = safeInteger(options.lines, 100, 1, MAX_OUTPUT_LINES, "lines");
  if (options.cursor !== void 0 && (typeof options.cursor !== "string" || options.cursor.length > 256)) {
    throw new ConnectError("invalid_argument", "cursor must be at most 256 characters.", "Use a cursor returned by the previous output read.");
  }
  let clean = text2.replace(ANSI, "").replace(CONTROL, "").replace(/\r\n?/g, "\n");
  clean = clean.replace(SECRET_PATTERNS[0], "[REDACTED]");
  for (const pattern of SECRET_PATTERNS.slice(1)) clean = clean.replace(pattern, (_match, prefix) => `${prefix}[REDACTED]`);
  const allLines = clean.split("\n");
  let truncated = false;
  if (allLines.length > lines) {
    clean = allLines.slice(-lines).join("\n");
    truncated = true;
  }
  let encoded = Buffer.from(clean, "utf8");
  if (encoded.byteLength > bytes) {
    encoded = encoded.subarray(encoded.byteLength - bytes);
    const firstNewline = encoded.indexOf(10);
    if (firstNewline >= 0) encoded = encoded.subarray(firstNewline + 1);
    clean = encoded.toString("utf8").replace(/^\uFFFD+/, "");
    truncated = true;
  }
  return { text: clean, truncated, observedAt: (/* @__PURE__ */ new Date()).toISOString(), untrusted: true };
}
var MockRuntime = class {
  agents = /* @__PURE__ */ new Map();
  retired = /* @__PURE__ */ new Set();
  output = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  machineId;
  constructor(machineId = "mock-machine") {
    this.machineId = machineId;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const seed = [
      { runtime: "mock", agentType: "codex", label: "Codex \xB7 api", workspace: "demo/api", status: "working", rawStatus: "working" },
      { runtime: "mock", agentType: "claude", label: "Claude \xB7 docs", workspace: "demo/docs", status: "idle", rawStatus: "idle" },
      { runtime: "mock", agentType: "codex", label: "Codex \xB7 tests", workspace: "demo/tests", status: "blocked", rawStatus: "blocked" }
    ];
    for (const [index, base] of seed.entries()) {
      const id = `mock-${hash(`${machineId}:${index}`).slice(0, 24)}`;
      this.agents.set(id, { ...base, id, machineId, observedAt: now, stale: false, capabilities: { readOutput: true, sendMessage: true } });
      this.output.set(id, [`${base.label} is ${base.status}.`, "Recent activity is demo data."].join("\n"));
    }
  }
  async listAgents() {
    return [...this.agents.values()].map((agent) => structuredClone(agent));
  }
  async getAgent(id) {
    const agent = this.agents.get(id);
    if (agent) return structuredClone(agent);
    if (this.retired.has(id)) throw new ConnectError("stale_target", "This agent identity has been replaced.", "List agents again and select the current agent.");
    throw new ConnectError("agent_not_found", "No agent has this identity.", "List agents and use an exact agent ID.");
  }
  async readOutput(id, options) {
    await this.getAgent(id);
    return sanitizeOutput(this.output.get(id) ?? "", options);
  }
  async sendMessage(id, message) {
    const agent = await this.getAgent(id);
    if (agent.status === "blocked") throw new ConnectError("agent_blocked", "The target agent is blocked.", "Inspect its state before sending a message.");
    this.output.set(id, `${this.output.get(id) ?? ""}
Message received: ${message}`.trim());
  }
  getCapabilities() {
    return { readOutput: true, sendMessage: true };
  }
  onEvent(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Mock panes are named `mock:<index>` in seed order. */
  async agentIdForPane(paneId) {
    const match = /^mock:(\d+)$/.exec(paneId);
    return match ? [...this.agents.keys()][Number(match[1])] : void 0;
  }
  /** Changes an agent's status and emits a status event, as a real runtime would. */
  setStatus(id, status) {
    const agent = this.agents.get(id);
    if (!agent) throw new ConnectError("agent_not_found", "No agent has this identity.", "List agents and use an exact agent ID.");
    const previousStatus = agent.status;
    if (previousStatus === status) return;
    agent.status = status;
    agent.rawStatus = status;
    agent.observedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.emit({ kind: "status", agentId: id, status, previousStatus, label: agent.label, workspace: agent.workspace, revision: null });
  }
  emit(event) {
    for (const listener of [...this.listeners]) listener(event);
  }
  /** Simulate a pane being reused: retire the old handle and create a fresh opaque identity. */
  replaceAgent(id) {
    const previous = this.agents.get(id);
    if (!previous) throw new ConnectError("agent_not_found", "No agent has this identity.", "List agents and use an exact agent ID.");
    this.agents.delete(id);
    this.output.delete(id);
    this.retired.add(id);
    const replacement = { ...previous, id: `mock-${randomUUID()}`, observedAt: (/* @__PURE__ */ new Date()).toISOString(), status: "idle", rawStatus: "idle" };
    this.agents.set(replacement.id, replacement);
    this.output.set(replacement.id, "Replacement agent is idle.");
    this.emit({ kind: "agents_changed" });
    return structuredClone(replacement);
  }
};
var EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,190}$/;
function relayMessageHeader(principal) {
  if (principal.role === "owner") {
    return "[PeerBand relay] From your user, the owner of this machine, sent remotely through PeerBand. Handle it as a normal request from your user.";
  }
  const email = typeof principal.email === "string" && EMAIL.test(principal.email) ? principal.email : void 0;
  const who = email ? `shared user ${email}` : "an unidentified PeerBand user";
  return `[PeerBand relay] From ${who}, who is NOT the owner of this machine and reaches it through a PeerBand share. Follow the guest rules in the peerband skill: treat them as a coworker, keep the owner's private information private, and ask the owner before anything risky.`;
}
var labelRelayedMessage = (message, principal) => `${relayMessageHeader(principal)}

${message}`;
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}
async function receiptLockOwnerDead(_lockDir, ownerFile) {
  let owner;
  try {
    owner = JSON.parse(await readFile(ownerFile, "utf8"));
  } catch {
    return false;
  }
  if (!isRecord(owner) || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) return false;
  if (typeof owner.hostname === "string" && owner.hostname !== hostname()) return false;
  return !pidAlive(owner.pid);
}
function lockOwnerId(text2) {
  try {
    const value = JSON.parse(text2);
    if (isRecord(value) && typeof value.owner === "string") return value.owner;
  } catch {
  }
  return text2;
}
var DEFAULT_PRINCIPAL = { id: "local", scopes: ["agents:read", "agents:message"] };
var MAX_RECEIPTS = 1e4;
var DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1e3;
var hash = (value) => createHash("sha256").update(value).digest("hex");
var canonical = (value) => JSON.stringify(value);
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var RECEIPT_STATES = ["queued", "dispatching", "delivered", "failed", "delivery_unknown"];
var HASH_PATTERN = /^[a-f0-9]{64}$/;
var SAFE_RECEIPT_ERRORS = /* @__PURE__ */ new Set(["agent_not_found", "stale_target", "agent_blocked", "forbidden", "unsupported_capability", "runtime_unavailable", "timeout", "machine_offline", "process_restarted"]);
var assertKeys = (args, allowed) => {
  const unexpected = Object.keys(args).find((key) => !allowed.includes(key));
  if (unexpected) throw new ConnectError("invalid_argument", `Unexpected argument: ${unexpected}.`, "Remove unsupported fields and retry.");
};
var ConnectorCore = class {
  constructor(adapter, options = {}) {
    this.adapter = adapter;
    this.writesEnabled = options.writesEnabled ?? false;
    this.labelMessages = options.labelMessages ?? false;
    this.allowedAgents = options.allowedAgents ? new Set(options.allowedAgents) : void 0;
    this.allowedWorkspaces = options.allowedWorkspaces ? new Set(options.allowedWorkspaces) : void 0;
    this.receiptPath = options.receiptPath;
    this.lockIsStale = options.lockIsStale ?? receiptLockOwnerDead;
    this.onLockReclaimed = options.onLockReclaimed;
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
    if (!Number.isSafeInteger(this.retentionMs) || this.retentionMs < 6e4 || this.retentionMs > 365 * 24 * 60 * 60 * 1e3) {
      throw new ConnectError("invalid_argument", "retentionMs is outside the supported range.", "Choose retention from one minute to one year.");
    }
    this.ready = this.loadReceipts();
    void this.ready.catch(() => void 0);
  }
  adapter;
  receipts = /* @__PURE__ */ new Map();
  idempotency = /* @__PURE__ */ new Map();
  writesEnabled;
  labelMessages;
  allowedAgents;
  allowedWorkspaces;
  retentionMs;
  receiptPath;
  lockIsStale;
  onLockReclaimed;
  lockOwner;
  get lockPath() {
    return this.receiptPath ? `${this.receiptPath}.lock` : void 0;
  }
  persistQueue = Promise.resolve();
  ready;
  inFlight = /* @__PURE__ */ new Set();
  activeOperations = /* @__PURE__ */ new Set();
  submissionLocks = /* @__PURE__ */ new Map();
  closed = false;
  closePromise;
  async execute(tool, args, principal = DEFAULT_PRINCIPAL) {
    if (this.closed) throw new ConnectError("connector_closed", "The connector is shutting down.", "Restart the connector to make further requests.");
    let finishOperation;
    const operation = new Promise((resolve5) => {
      finishOperation = resolve5;
    });
    this.activeOperations.add(operation);
    try {
      await this.ready;
      this.validatePrincipal(principal);
      if (!isRecord(args)) throw new ConnectError("invalid_argument", "Tool arguments must be an object.", "Check the tool input and try again.");
      switch (tool) {
        case "list_agents":
          return await this.listAgents(args, principal);
        case "get_agent_status":
          return await this.getStatus(args, principal);
        case "get_agent_output":
          return await this.getOutput(args, principal);
        case "send_agent_message":
          return await this.sendMessage(args, principal);
        case "get_request_status":
          return await this.getRequestStatus(args, principal);
        default:
          throw new ConnectError("unsupported_capability", `Unknown tool: ${tool}.`, "Choose one of the registered agent tools.");
      }
    } finally {
      finishOperation();
      this.activeOperations.delete(operation);
    }
  }
  /** Resolve only after durable receipts have loaded and been reconciled for startup. */
  async initialize() {
    await this.ready;
  }
  /** Stop accepting calls, wait for active dispatches and flush their final receipt states. */
  close() {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.closePromise = this.finishClose();
    return this.closePromise;
  }
  async finishClose() {
    await this.ready;
    try {
      await Promise.all([...this.activeOperations]);
      await Promise.all([...this.inFlight]);
      await this.persist();
    } finally {
      await this.releaseLock();
    }
  }
  validatePrincipal(principal) {
    if (!principal || typeof principal.id !== "string" || principal.id.length < 1 || principal.id.length > 256 || !Array.isArray(principal.scopes) || principal.scopes.some((s) => typeof s !== "string")) {
      throw new ConnectError("forbidden", "The caller identity is invalid.", "Authenticate with a valid principal.");
    }
  }
  requireScope(principal, scope) {
    if (!principal.scopes.includes(scope)) throw new ConnectError("forbidden", `Missing required scope ${scope}.`, "Request access to this agent operation.");
  }
  async authorizedAgent(id, principal, write = false) {
    this.requireScope(principal, write ? "agents:message" : "agents:read");
    if (typeof id !== "string" || id.length < 1 || id.length > 256) throw new ConnectError("invalid_argument", "agentId is required.", "Use an exact agent ID returned by list_agents.");
    const agent = await this.adapter.getAgent(id);
    if (agent.stale) throw new ConnectError("stale_target", "This agent identity is stale.", "List agents and select the current agent.");
    if (this.allowedAgents && !this.allowedAgents.has(agent.id)) throw new ConnectError("forbidden", "This agent is outside the configured allowlist.", "Select an allowed agent.");
    if (this.allowedWorkspaces && !this.allowedWorkspaces.has(agent.workspace)) throw new ConnectError("forbidden", "This workspace is outside the configured allowlist.", "Select an allowed workspace.");
    return agent;
  }
  async listAgents(args, principal) {
    this.requireScope(principal, "agents:read");
    assertKeys(args, ["machine", "workspace", "status", "cursor", "limit"]);
    const limit = safeInteger(args.limit, 50, 1, 200, "limit");
    for (const key of ["machine", "workspace", "status", "cursor"]) {
      if (args[key] !== void 0 && (typeof args[key] !== "string" || args[key].length > (key === "cursor" ? 256 : 512))) {
        throw new ConnectError("invalid_argument", `${key} has an invalid value.`, "Check the list filter and try again.");
      }
    }
    if (args.status !== void 0 && !["idle", "working", "blocked", "done", "unknown"].includes(args.status)) {
      throw new ConnectError("invalid_argument", "status is not a supported normalized state.", "Choose idle, working, blocked, done, or unknown.");
    }
    const records = await this.adapter.listAgents();
    const filtered = records.filter((a) => (!args.machine || a.machineId === args.machine) && (!args.workspace || a.workspace === args.workspace) && (!args.status || a.status === args.status) && (!this.allowedAgents || this.allowedAgents.has(a.id)) && (!this.allowedWorkspaces || this.allowedWorkspaces.has(a.workspace)));
    const cursorIndex = args.cursor ? filtered.findIndex((a) => a.id === args.cursor) : -1;
    if (args.cursor && cursorIndex < 0) throw new ConnectError("invalid_argument", "cursor does not identify an agent in this result set.", "Start a fresh list_agents request.");
    const start = args.cursor ? cursorIndex + 1 : 0;
    const page = filtered.slice(start, start + limit);
    return { agents: page, ...start + limit < filtered.length ? { nextCursor: page.at(-1)?.id } : {}, count: page.length };
  }
  async getStatus(args, principal) {
    assertKeys(args, ["agentId"]);
    const agent = await this.authorizedAgent(args.agentId, principal);
    return { agent };
  }
  async getOutput(args, principal) {
    assertKeys(args, ["agentId", "lines", "bytes", "cursor"]);
    const agent = await this.authorizedAgent(args.agentId, principal);
    if (!agent.capabilities.readOutput || !this.adapter.getCapabilities().readOutput) throw new ConnectError("unsupported_capability", "Output reading is not supported for this runtime.", "Use status tools or select a runtime with output support.");
    const options = {
      lines: safeInteger(args.lines, 100, 1, MAX_OUTPUT_LINES, "lines"),
      bytes: safeInteger(args.bytes, 8 * 1024, 1, MAX_OUTPUT_BYTES, "bytes")
    };
    if (args.cursor !== void 0) {
      if (typeof args.cursor !== "string" || args.cursor.length > 256) throw new ConnectError("invalid_argument", "cursor has an invalid value.", "Use a cursor returned by the runtime.");
      options.cursor = args.cursor;
    }
    const result = await this.adapter.readOutput(agent.id, options);
    const safe = sanitizeOutput(result.text, options);
    return { ...safe, observedAt: result.observedAt, truncated: safe.truncated || result.truncated, ...result.nextCursor ? { nextCursor: result.nextCursor } : {} };
  }
  async sendMessage(args, principal) {
    assertKeys(args, ["agentId", "message", "idempotencyKey"]);
    if (!this.writesEnabled) throw new ConnectError("write_disabled", "Message sending is disabled.", 'This machine is read-only. To allow messages, remove --read-only or set "enableWrites": true in connector.json on that machine.');
    this.requireScope(principal, "agents:message");
    const key = args.idempotencyKey;
    const message = args.message;
    if (typeof key !== "string" || key.length < 16 || key.length > 256) throw new ConnectError("invalid_argument", "idempotencyKey must be 16 to 256 characters.", "Provide a fresh random idempotency key for this request.");
    if (typeof message !== "string" || message.trim().length < 1 || Buffer.byteLength(message, "utf8") > 8192) throw new ConnectError("invalid_argument", "message must contain 1 to 8192 UTF-8 bytes.", "Shorten the message and try again.");
    const principalHash = hash(principal.id);
    const payloadHash = hash(message);
    if (typeof args.agentId !== "string" || args.agentId.length < 1 || args.agentId.length > 256) throw new ConnectError("invalid_argument", "agentId is required.", "Use an exact agent ID returned by list_agents.");
    const requestKeyHash = hash(canonical([principalHash, args.agentId, "send_agent_message", key]));
    return this.withSubmissionLock(requestKeyHash, async () => {
      const prior = this.idempotency.get(requestKeyHash);
      if (prior) {
        if (this.allowedAgents && !this.allowedAgents.has(prior.targetId) || this.allowedWorkspaces && !this.allowedWorkspaces.has(prior.workspace)) {
          throw new ConnectError("forbidden", "This target is outside the configured allowlist.", "Select an allowed agent and workspace.");
        }
        if (prior.payloadHash !== payloadHash) throw new ConnectError("idempotency_conflict", "This idempotency key was already used with a different message.", "Use a new key for a new message.");
        return this.publicReceipt(prior);
      }
      const agent = await this.authorizedAgent(args.agentId, principal, true);
      if (agent.status === "blocked") throw new ConnectError("agent_blocked", "The target agent is blocked.", "Inspect its state and choose an appropriate next step before sending.");
      if (!agent.capabilities.sendMessage || !this.adapter.getCapabilities().sendMessage) throw new ConnectError("unsupported_capability", "Message sending is not supported for this runtime.", "Use a runtime with semantic message support.");
      const idempotencyHash = hash(canonical([principalHash, agent.machineId, agent.id, "send_agent_message", key]));
      this.pruneReceipts();
      if (this.receipts.size >= MAX_RECEIPTS) throw new ConnectError("receipt_limit", "The receipt store is full.", "Wait for old receipts to expire or increase retention storage capacity.");
      const now = Date.now();
      const receipt = {
        requestId: randomUUID(),
        principalHash,
        machineId: agent.machineId,
        targetId: agent.id,
        workspace: agent.workspace,
        tool: "send_agent_message",
        idempotencyHash,
        requestKeyHash,
        payloadHash,
        state: "queued",
        createdAt: now,
        updatedAt: now
      };
      this.receipts.set(receipt.requestId, receipt);
      this.idempotency.set(requestKeyHash, receipt);
      try {
        await this.persist();
      } catch {
        this.receipts.delete(receipt.requestId);
        this.idempotency.delete(requestKeyHash);
        throw new ConnectError("receipt_store_unavailable", "The request receipt could not be saved; nothing was sent.", "Check local storage access and retry with the same key.");
      }
      const job = this.dispatch(receipt, this.labelMessages ? labelRelayedMessage(message, principal) : message).catch(() => void 0);
      this.inFlight.add(job);
      void job.finally(() => this.inFlight.delete(job));
      return this.publicReceipt(receipt);
    });
  }
  async withSubmissionLock(key, action) {
    const previous = this.submissionLocks.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve5) => {
      release = resolve5;
    });
    this.submissionLocks.set(key, current);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.submissionLocks.get(key) === current) this.submissionLocks.delete(key);
    }
  }
  async dispatch(receipt, message) {
    receipt.state = "dispatching";
    receipt.updatedAt = Date.now();
    try {
      await this.persist();
      const current = await this.authorizedAgent(receipt.targetId, { id: "", scopes: ["agents:message"] }, true);
      if (current.machineId !== receipt.machineId) throw new ConnectError("stale_target", "The target agent has changed machines.", "List agents and submit to the current agent identity.");
      if (current.status === "blocked") throw new ConnectError("agent_blocked", "The target agent became blocked before delivery.", "Inspect its state before submitting a new message.");
      if (!current.capabilities.sendMessage || !this.adapter.getCapabilities().sendMessage) throw new ConnectError("unsupported_capability", "Message sending is no longer supported.", "Use a runtime with semantic message support.");
      await this.adapter.sendMessage(receipt.targetId, message);
      receipt.state = "delivered";
    } catch (error) {
      const definite = error instanceof ConnectError && ["agent_not_found", "stale_target", "agent_blocked", "forbidden", "unsupported_capability"].includes(error.code);
      receipt.state = definite ? "failed" : "delivery_unknown";
      receipt.errorCode = error instanceof ConnectError && SAFE_RECEIPT_ERRORS.has(error.code) ? error.code : "runtime_unavailable";
    }
    receipt.updatedAt = Date.now();
    await this.persist();
  }
  async getRequestStatus(args, principal) {
    assertKeys(args, ["requestId"]);
    this.requireScope(principal, "agents:read");
    if (typeof args.requestId !== "string" || args.requestId.length > 256) throw new ConnectError("invalid_argument", "requestId is required.", "Use the request ID returned by send_agent_message.");
    this.pruneReceipts();
    const receipt = this.receipts.get(args.requestId);
    if (!receipt || receipt.principalHash !== hash(principal.id)) throw new ConnectError("request_not_found", "No request receipt is available for this caller.", "Check the request ID or submit a new authorized request.");
    return this.publicReceipt(receipt);
  }
  publicReceipt(receipt) {
    return { requestId: receipt.requestId, state: receipt.state, createdAt: new Date(receipt.createdAt).toISOString(), updatedAt: new Date(receipt.updatedAt).toISOString(), ...receipt.errorCode ? { errorCode: receipt.errorCode } : {} };
  }
  pruneReceipts() {
    const cutoff = Date.now() - this.retentionMs;
    for (const [id, receipt] of this.receipts) {
      if (receipt.createdAt < cutoff) {
        this.receipts.delete(id);
        this.idempotency.delete(receipt.requestKeyHash);
      }
    }
  }
  async loadReceipts() {
    if (!this.receiptPath) return;
    await this.acquireLock();
    try {
      await this.loadReceiptFile();
    } catch (error) {
      await this.releaseLock();
      throw error;
    }
  }
  async loadReceiptFile() {
    if (!this.receiptPath) return;
    let raw;
    try {
      raw = await readFile(this.receiptPath, "utf8");
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT") return;
      throw error;
    }
    let store;
    try {
      store = JSON.parse(raw);
    } catch {
      throw new ConnectError("receipt_store_invalid", "The request receipt store is unreadable.", "Preserve the file and inspect it before reconnecting.");
    }
    if (!isRecord(store) || store.version !== 1 || !Array.isArray(store.receipts) || store.receipts.length > MAX_RECEIPTS) throw new ConnectError("receipt_store_invalid", "The request receipt store has an unsupported shape.", "Back up the file and use a compatible connector version.");
    const cutoff = Date.now() - this.retentionMs;
    const seenIds = /* @__PURE__ */ new Set();
    const seenKeys = /* @__PURE__ */ new Set();
    for (const item of store.receipts) {
      if (!this.isValidReceipt(item)) throw new ConnectError("receipt_store_invalid", "The request receipt store contains invalid receipt data.", "Preserve the file and inspect it before reconnecting.");
      if (seenIds.has(item.requestId) || seenKeys.has(item.requestKeyHash)) throw new ConnectError("receipt_store_invalid", "The request receipt store contains duplicate receipt identities.", "Preserve the file and inspect it before reconnecting.");
      seenIds.add(item.requestId);
      seenKeys.add(item.requestKeyHash);
      if (item.createdAt < cutoff) continue;
      if (item.state === "queued" || item.state === "dispatching") {
        item.state = "delivery_unknown";
        item.errorCode = "process_restarted";
      }
      this.receipts.set(item.requestId, item);
      this.idempotency.set(item.requestKeyHash, item);
    }
    this.pruneReceipts();
    await this.persist();
  }
  async acquireLock() {
    const lockPath3 = this.lockPath;
    if (!lockPath3 || !this.receiptPath) return;
    await mkdir(dirname(this.receiptPath), { recursive: true });
    const ownerFile = join(lockPath3, "owner");
    for (let attempt = 0; ; attempt++) {
      try {
        await mkdir(lockPath3, { mode: 448 });
        break;
      } catch (error) {
        if (!(isRecord(error) && error.code === "EEXIST")) throw error;
      }
      if (attempt === 0 && await this.lockIsStale(lockPath3, ownerFile).catch(() => false) && await this.reclaimStaleLock(lockPath3, ownerFile)) continue;
      throw new ConnectError("receipt_store_locked", "Another connector process owns this receipt store.", "Stop the other process or configure a separate state directory.");
    }
    const owner = randomUUID();
    this.lockOwner = owner;
    const record = { owner, pid: process.pid, hostname: hostname(), startedAt: (/* @__PURE__ */ new Date()).toISOString() };
    try {
      await writeFile(ownerFile, JSON.stringify(record), { encoding: "utf8", flag: "wx", mode: 384 });
    } catch (error) {
      this.lockOwner = void 0;
      try {
        await rmdir(lockPath3);
      } catch {
      }
      throw error;
    }
  }
  /** Moves the stale lock aside (atomic, one winner), checks it is the one inspected, then deletes it. */
  async reclaimStaleLock(lockPath3, ownerFile) {
    const before = await readFile(ownerFile, "utf8").catch(() => null);
    const quarantine = `${lockPath3}.stale-${randomUUID()}`;
    try {
      await rename(lockPath3, quarantine);
    } catch {
      return false;
    }
    const moved = await readFile(join(quarantine, "owner"), "utf8").catch(() => null);
    if (moved !== before) {
      await rename(quarantine, lockPath3).catch(() => void 0);
      return false;
    }
    await rm(quarantine, { recursive: true, force: true }).catch(() => void 0);
    this.onLockReclaimed?.(`Reclaimed a stale receipt-store lock ${lockPath3}${before ? ` (previous owner: ${before.slice(0, 200)})` : ""}.`);
    return true;
  }
  async releaseLock() {
    const lockPath3 = this.lockPath;
    const owner = this.lockOwner;
    if (!lockPath3 || !owner) return;
    try {
      const currentOwner = await readFile(`${lockPath3}/owner`, "utf8");
      if (lockOwnerId(currentOwner) !== owner) return;
      await unlink(`${lockPath3}/owner`);
      await rmdir(lockPath3);
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT") return;
      throw error;
    } finally {
      this.lockOwner = void 0;
    }
  }
  isValidReceipt(value) {
    if (!isRecord(value)) return false;
    const receiptKeys = ["requestId", "principalHash", "machineId", "targetId", "workspace", "tool", "idempotencyHash", "requestKeyHash", "payloadHash", "state", "createdAt", "updatedAt", "errorCode"];
    if (Object.keys(value).some((key) => !receiptKeys.includes(key))) return false;
    return typeof value.requestId === "string" && value.requestId.length > 0 && value.requestId.length <= 256 && typeof value.principalHash === "string" && HASH_PATTERN.test(value.principalHash) && typeof value.machineId === "string" && value.machineId.length > 0 && value.machineId.length <= 512 && typeof value.targetId === "string" && value.targetId.length > 0 && value.targetId.length <= 256 && typeof value.workspace === "string" && value.workspace.length <= 2048 && value.tool === "send_agent_message" && typeof value.idempotencyHash === "string" && HASH_PATTERN.test(value.idempotencyHash) && typeof value.requestKeyHash === "string" && HASH_PATTERN.test(value.requestKeyHash) && typeof value.payloadHash === "string" && HASH_PATTERN.test(value.payloadHash) && typeof value.state === "string" && RECEIPT_STATES.includes(value.state) && Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.updatedAt) && value.updatedAt >= value.createdAt && (value.errorCode === void 0 || typeof value.errorCode === "string" && SAFE_RECEIPT_ERRORS.has(value.errorCode));
  }
  persist() {
    if (!this.receiptPath) return Promise.resolve();
    const snapshot = { version: 1, receipts: [...this.receipts.values()].slice(-MAX_RECEIPTS) };
    const serialized = JSON.stringify(snapshot);
    this.persistQueue = this.persistQueue.then(async () => {
      await mkdir(dirname(this.receiptPath), { recursive: true });
      const temporary = `${this.receiptPath}.${randomUUID()}.tmp`;
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 384 });
      await rename(temporary, this.receiptPath);
    });
    return this.persistQueue;
  }
};

// src/core/config.ts
import { chmod, mkdir as mkdir2, readFile as readFile2, rename as rename2, rm as rm2, unlink as unlink2, writeFile as writeFile2 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname2, join as join2 } from "node:path";
var DEFAULT_SERVER_URL = "https://peerband.com";
var ConfigError = class extends Error {
  hint;
  constructor(message, hint) {
    super(message);
    this.name = "ConfigError";
    this.hint = hint;
  }
};
function configHome(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  if (env.PEERBAND_CONFIG_HOME) return env.PEERBAND_CONFIG_HOME;
  if (platform === "win32") return join2(env.APPDATA || join2(home, "AppData", "Roaming"), "peerband");
  return join2(env.XDG_CONFIG_HOME || join2(home, ".config"), "peerband");
}
var credentialsPath = (options) => join2(configHome(options), "credentials.json");
var lockPath = (options) => join2(configHome(options), "relay-helper.lock");
var relayStatePath = (options) => join2(configHome(options), "relay-state.json");
var relayTabPath = (options) => join2(configHome(options), "relay-tab.json");
var stateDirectory = (options) => join2(configHome(options), "state");
var receiptsPath = (options) => join2(stateDirectory(options), "receipts.json");
var connectorConfigPath = (options) => join2(configHome(options), "connector.json");
function isLoopback(hostname4) {
  const host = hostname4.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
function validateServerUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`Invalid server URL: ${value}`, `Use a full URL such as ${DEFAULT_SERVER_URL}.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigError(`Server URL must use https (got ${url.protocol}//).`, `Use a full URL such as ${DEFAULT_SERVER_URL}.`);
  }
  if (url.username || url.password) {
    throw new ConfigError("Server URL cannot contain credentials.", "Remove the user:password part of the URL.");
  }
  if (url.protocol === "http:" && !isLoopback(url.hostname)) {
    throw new ConfigError("Server URL must use https unless it points at localhost.", "Use an https:// URL, or http://localhost for local development.");
  }
  return url.origin;
}
function mcpUrlFor(serverUrl, env = process.env) {
  if (env.PEERBAND_MCP_URL) {
    const origin2 = validateServerUrl(env.PEERBAND_MCP_URL);
    const path = new URL(env.PEERBAND_MCP_URL).pathname.replace(/\/$/, "");
    return `${origin2}${path || "/mcp"}`;
  }
  const origin = validateServerUrl(serverUrl);
  const host = new URL(origin).hostname;
  if (host === "peerband.com" || host === "www.peerband.com") return "https://mcp.peerband.com/mcp";
  return `${origin}/mcp`;
}
function resolveServerUrl(explicit, env = process.env) {
  return validateServerUrl(explicit || env.PEERBAND_SERVER || DEFAULT_SERVER_URL);
}
async function saveCredentials(credentials, path = credentialsPath()) {
  const directory = dirname2(path);
  await mkdir2(directory, { recursive: true, mode: 448 });
  if (process.platform !== "win32") await chmod(directory, 448);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile2(temporary, `${JSON.stringify(credentials, null, 2)}
`, { mode: 384, flag: "wx" });
  try {
    await chmod(temporary, 384);
    await rename2(temporary, path);
  } catch (error) {
    await unlink2(temporary).catch(() => void 0);
    throw error;
  }
}
var LOGIN_HINT = "Run `peerband login` to connect this machine to your PeerBand account.";
async function loadCredentials(path = credentialsPath()) {
  let text2;
  try {
    text2 = await readFile2(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new ConfigError("Not logged in.", LOGIN_HINT);
    throw new ConfigError(`Unable to read credentials at ${path}: ${error.message}`, LOGIN_HINT);
  }
  let value;
  try {
    value = JSON.parse(text2);
  } catch {
    throw new ConfigError(`Credentials file ${path} is not valid JSON.`, `${LOGIN_HINT} This replaces the damaged file.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigError(`Credentials file ${path} is invalid.`, LOGIN_HINT);
  }
  const record = value;
  if (typeof record.serverUrl !== "string" || typeof record.installationId !== "string" || typeof record.credential !== "string") {
    throw new ConfigError(`Credentials file ${path} is missing required fields.`, LOGIN_HINT);
  }
  const optional = (key) => typeof record[key] === "string" && record[key] ? { [key]: record[key] } : {};
  return {
    serverUrl: record.serverUrl,
    installationId: record.installationId,
    credential: record.credential,
    ...optional("machineName"),
    ...optional("accountEmail"),
    ...optional("enrolledAt")
  };
}
async function deleteCredentials(path = credentialsPath()) {
  try {
    await rm2(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

// src/core/connector-config.ts
import { readFile as readFile3 } from "node:fs/promises";
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function rejectUnknown(record, allowed, where) {
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new ConfigError(`${where}: unknown field "${unknown}".`, `Allowed fields: ${allowed.join(", ")}.`);
}
function stringField(record, key, where, max) {
  const value = record[key];
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !value || value.length > max) throw new ConfigError(`${where}.${key} must be a non-empty string.`);
  return value;
}
function stringList(record, key, where) {
  const value = record[key];
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || value.length > 1e3 || value.some((item) => typeof item !== "string" || !item)) {
    throw new ConfigError(`${where}.${key} must be an array of up to 1000 non-empty strings.`);
  }
  return value;
}
function parseConnectorConfig(value, source = "connector config") {
  if (!isRecord2(value)) throw new ConfigError(`${source}: expected a JSON object.`);
  rejectUnknown(value, ["allowedAgents", "allowedWorkspaces", "stateDirectory", "herdr", "enableWrites"], source);
  const config = {};
  const agents = stringList(value, "allowedAgents", source);
  if (agents) config.allowedAgents = agents;
  const workspaces = stringList(value, "allowedWorkspaces", source);
  if (workspaces) config.allowedWorkspaces = workspaces;
  const directory = stringField(value, "stateDirectory", source, 4e3);
  if (directory) config.stateDirectory = directory;
  if (value.enableWrites !== void 0) {
    if (typeof value.enableWrites !== "boolean") throw new ConfigError(`${source}.enableWrites must be true or false.`);
    config.enableWrites = value.enableWrites;
  }
  if (value.herdr !== void 0) {
    const raw = value.herdr;
    if (!isRecord2(raw)) throw new ConfigError(`${source}.herdr must be an object.`);
    rejectUnknown(raw, ["socketPath", "schemaPath", "binary", "machineId", "timeoutMs"], `${source}.herdr`);
    const herdr2 = {};
    for (const key of ["socketPath", "schemaPath", "binary", "machineId"]) {
      const text2 = stringField(raw, key, `${source}.herdr`, 4e3);
      if (text2) herdr2[key] = text2;
    }
    if (raw.timeoutMs !== void 0) {
      if (typeof raw.timeoutMs !== "number" || !Number.isInteger(raw.timeoutMs) || raw.timeoutMs < 100 || raw.timeoutMs > 12e4) {
        throw new ConfigError(`${source}.herdr.timeoutMs must be an integer from 100 to 120000.`);
      }
      herdr2.timeoutMs = raw.timeoutMs;
    }
    config.herdr = herdr2;
  }
  return config;
}
async function loadConnectorConfig(path, options = {}) {
  let text2;
  try {
    text2 = await readFile3(path, "utf8");
  } catch (error) {
    if (options.optional && error.code === "ENOENT") return {};
    throw new ConfigError(`Cannot read connector config ${path}: ${error.message}`, "Check the --config path, or omit the option to use defaults.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch (error) {
    throw new ConfigError(`Connector config ${path} is not valid JSON: ${error.message}`, "Fix the syntax or delete the file.");
  }
  return parseConnectorConfig(parsed, path);
}

// src/core/relay-client.ts
import { isIP } from "node:net";

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// src/core/relay-client.ts
var MAX_FRAME = 64 * 1024;
var MAX_ACTIVE = 32;
var REQUEST_TIMEOUT_MS = 15e3;
function socketUrl(serverUrl) {
  const url = new URL(serverUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:" && url.protocol !== "wss:" && url.protocol !== "ws:")
    throw new Error("Remote server URL must use https or wss.");
  if (url.username || url.password)
    throw new Error("Remote server URL cannot contain credentials.");
  const hostname4 = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loopback = hostname4 === "localhost" || hostname4.endsWith(".localhost") || hostname4 === "::1" || isIP(hostname4) === 4 && hostname4.startsWith("127.");
  if ((url.protocol === "http:" || url.protocol === "ws:") && !loopback)
    throw new Error(
      "Remote connections must use HTTPS/WSS except on localhost."
    );
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  url.pathname = "/connections";
  url.search = "";
  url.hash = "";
  return url.toString();
}
function encode(value) {
  const frame = JSON.stringify(value);
  if (Buffer.byteLength(frame, "utf8") > MAX_FRAME)
    throw new Error("Response exceeds the 64 KiB remote frame limit.");
  return frame;
}
function enrollmentBase(serverUrl) {
  const base = new URL(serverUrl);
  if (!/^https?:$/.test(base.protocol))
    throw new Error(
      "Enrollment server URL must use HTTPS (HTTP is allowed for local development)."
    );
  if (base.username || base.password)
    throw new Error("Enrollment server URL cannot contain credentials.");
  const hostname4 = base.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loopback = hostname4 === "localhost" || hostname4.endsWith(".localhost") || hostname4 === "::1" || isIP(hostname4) === 4 && hostname4.startsWith("127.");
  if (base.protocol === "http:" && !loopback)
    throw new Error("Enrollment requires HTTPS except on localhost.");
  return base;
}
async function redeemEnrollment(serverUrl, grant, name, fetcher = fetch, previousCredential) {
  const base = enrollmentBase(serverUrl);
  const response = await fetcher(new URL("/api/enrollments/redeem", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    // previous_credential lets the server keep this machine's record (see DeviceLoginOptions).
    body: JSON.stringify({ grant, name, ...previousCredential ? { previous_credential: previousCredential } : {} }),
    signal: AbortSignal.timeout(15e3)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.installation_id !== "string" || typeof body.credential !== "string") {
    const detail = typeof body.detail === "string" ? body.detail : `HTTP ${response.status}`;
    throw new Error(`Enrollment could not be redeemed: ${detail}`);
  }
  return {
    serverUrl: base.origin,
    installationId: body.installation_id,
    credential: body.credential,
    ...typeof body.machine_name === "string" && body.machine_name ? { machineName: body.machine_name } : {},
    ...typeof body.account_email === "string" && body.account_email ? { accountEmail: body.account_email } : {}
  };
}
async function runRemoteClient(core, credentials, options = {}) {
  const status = options.onStatus ?? ((message) => process.stderr.write(`peerband: ${message}
`));
  const random = options.random ?? Math.random;
  const setConnectionState = options.onConnectionState ?? (() => {
  });
  const reportActivity = options.onActivity ?? (() => {
  });
  const sleep = options.sleep ?? ((ms) => new Promise((resolve5) => setTimeout(resolve5, ms)));
  const serverUrl = socketUrl(credentials.serverUrl);
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 75e3;
  let stopped = false;
  let current;
  const active = /* @__PURE__ */ new Map();
  const executing = /* @__PURE__ */ new Set();
  const stop = () => {
    stopped = true;
    current?.close(1e3, "connector shutting down");
  };
  if (options.signal?.aborted) return;
  options.signal?.addEventListener("abort", stop, { once: true });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let attempt = 0;
  try {
    while (!stopped) {
      try {
        setConnectionState("connecting");
        await new Promise((resolve5, reject) => {
          const socket = new wrapper_default(serverUrl, {
            headers: {
              Authorization: `Bearer ${credentials.credential}`,
              ...options.events ? { "x-peerband-features": "events" } : {}
            },
            maxPayload: MAX_FRAME,
            handshakeTimeout: 1e4,
            perMessageDeflate: false
          });
          current = socket;
          let heartbeatTimer;
          let lastHeartbeat = Date.now();
          const failActive = (reason) => {
            for (const [id, pending] of active) {
              if (pending.socket !== socket) continue;
              clearTimeout(pending.timer);
              active.delete(id);
              if (pending.write)
                status(
                  `write request ${id} lost its response after disconnect; delivery is uncertain. Check request status before retrying.`
                );
              reportActivity({ requestId: id, tool: pending.tool, target: pending.target, outcome: pending.write ? "uncertain" : "timeout", latencyMs: Date.now() - pending.startedAt });
            }
            if (reason) status(reason);
          };
          const openedAt = Date.now();
          socket.once("open", () => {
            setConnectionState("connected");
            status("remote connection established");
            heartbeatTimer = setInterval(
              () => {
                if (Date.now() - lastHeartbeat > heartbeatTimeoutMs) {
                  status("remote heartbeat expired; reconnecting");
                  socket.close(4e3, "heartbeat timeout");
                }
              },
              Math.min(1e4, Math.max(10, heartbeatTimeoutMs / 4))
            );
            heartbeatTimer.unref();
            options.events?.attach((frame) => sendEvent(socket, frame));
          });
          socket.on("message", async (data, isBinary) => {
            if (stopped) {
              if (socket.readyState === wrapper_default.OPEN)
                socket.close(1e3, "connector disabled");
              return;
            }
            const bytes = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
            if (isBinary || bytes.length > MAX_FRAME) {
              socket.close(1009, "frame too large");
              return;
            }
            let message;
            try {
              message = JSON.parse(bytes.toString("utf8"));
            } catch {
              socket.close(1007, "invalid JSON");
              return;
            }
            if (!message || typeof message !== "object" || Array.isArray(message)) {
              socket.close(1007, "invalid message");
              return;
            }
            const msg = message;
            if (msg.type === "ping" && Object.keys(msg).length === 1) {
              lastHeartbeat = Date.now();
              if (socket.readyState === wrapper_default.OPEN)
                socket.send('{"type":"pong"}');
              return;
            }
            if (msg.type !== "request" || typeof msg.id !== "string" || !msg.id || msg.id.length > 256 || typeof msg.tool !== "string" || !msg.tool || !msg.args || typeof msg.args !== "object" || Array.isArray(msg.args) || !msg.principal || typeof msg.principal !== "object" || Array.isArray(msg.principal)) {
              socket.close(1007, "invalid request");
              return;
            }
            const request = msg;
            if (!Array.isArray(request.principal.scopes) || typeof request.principal.id !== "string" || request.principal.scopes.some(
              (scope) => typeof scope !== "string"
            )) {
              socket.close(1007, "invalid principal");
              return;
            }
            if (active.has(request.id)) {
              socket.close(1008, "duplicate request id");
              return;
            }
            if (executing.size >= MAX_ACTIVE) {
              socket.send(
                encode({
                  type: "response",
                  id: request.id,
                  error: {
                    code: "busy",
                    message: "Too many concurrent requests.",
                    next_step: "Retry after a current request finishes."
                  }
                })
              );
              return;
            }
            const pending = {
              write: request.tool === "send_agent_message",
              socket,
              startedAt: Date.now(),
              tool: request.tool,
              ...typeof request.args.agentId === "string" && /^[A-Za-z0-9._:-]{1,256}$/.test(request.args.agentId) ? { target: request.args.agentId } : {},
              timer: setTimeout(() => {
                if (!active.delete(request.id)) return;
                if (pending.write)
                  status(
                    `write request ${request.id} timed out; delivery is uncertain. Check request status before retrying.`
                  );
                reportActivity({ requestId: request.id, tool: request.tool, target: pending.target, outcome: pending.write ? "uncertain" : "timeout", latencyMs: Date.now() - pending.startedAt });
                if (socket.readyState === wrapper_default.OPEN)
                  socket.send(
                    encode({
                      type: "response",
                      id: request.id,
                      error: {
                        code: pending.write ? "delivery_unknown" : "timeout",
                        message: pending.write ? "The write timed out; delivery is uncertain." : "The local runtime request timed out.",
                        next_step: "Check request status before retrying a write."
                      }
                    })
                  );
              }, REQUEST_TIMEOUT_MS)
            };
            pending.timer.unref();
            active.set(request.id, pending);
            const task = Promise.resolve().then(async () => {
              try {
                const result = await core.execute(
                  request.tool,
                  request.args,
                  request.principal
                );
                if (!active.has(request.id)) return;
                active.delete(request.id);
                clearTimeout(pending.timer);
                if (socket.readyState === wrapper_default.OPEN)
                  socket.send(
                    encode({ type: "response", id: request.id, result })
                  );
                reportActivity({ requestId: request.id, tool: request.tool, target: pending.target, outcome: "success", latencyMs: Date.now() - pending.startedAt });
              } catch (error) {
                if (!active.has(request.id)) return;
                active.delete(request.id);
                clearTimeout(pending.timer);
                const candidate = error;
                const payload = {
                  type: "response",
                  id: request.id,
                  error: {
                    code: typeof candidate.code === "string" ? candidate.code : "runtime_unavailable",
                    message: typeof candidate.message === "string" ? candidate.message : "The runtime request failed.",
                    next_step: typeof candidate.nextStep === "string" ? candidate.nextStep : "Check the runtime status and connector configuration."
                  }
                };
                if (socket.readyState === wrapper_default.OPEN)
                  socket.send(encode(payload));
                reportActivity({ requestId: request.id, tool: request.tool, target: pending.target, outcome: candidate.code === "runtime_unavailable" ? "runtime-unavailable" : "error", latencyMs: Date.now() - pending.startedAt });
              } finally {
                executing.delete(task);
              }
            });
            executing.add(task);
          });
          socket.once("error", (error) => {
            if (socket.readyState !== wrapper_default.OPEN) reject(error);
          });
          socket.once("unexpected-response", (_request, response) => {
            if (response.statusCode === 401 || response.statusCode === 403) {
              stopped = true;
              setConnectionState("revoked");
              status(
                `remote authentication was rejected (${response.statusCode}); re-enroll this installation if it was revoked.`
              );
            }
            response.resume();
          });
          socket.once("close", (code, reason) => {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            options.events?.detach();
            if (Date.now() - openedAt >= 3e4) attempt = 0;
            if (code === 4001 || code === 4003 || code === 4401) stopped = true;
            if (stopped) setConnectionState("revoked");
            else setConnectionState("reconnecting");
            failActive(
              code === 1008 || code === 4001 ? `remote authentication or policy rejected the connection (${code})` : `remote connection closed (${code})${reason.length ? `: ${reason.toString()}` : ""}`
            );
            if (current === socket) current = void 0;
            resolve5();
          });
        });
      } catch (error) {
        setConnectionState("remote-unavailable");
        status(`remote connection failed: ${error.message}`);
      }
      if (stopped) break;
      const ceiling = Math.min(3e4, 500 * 2 ** Math.min(attempt++, 6));
      let remaining = Math.round(ceiling * (0.5 + random() * 0.5));
      while (!stopped && remaining > 0) {
        const slice = Math.min(remaining, 250);
        const started = Date.now();
        await sleep(slice);
        remaining -= Math.max(slice, Date.now() - started);
      }
    }
  } finally {
    stopped = true;
    options.signal?.removeEventListener("abort", stop);
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    current?.close(1e3);
    for (const pending of active.values()) clearTimeout(pending.timer);
    active.clear();
  }
}
function sendEvent(socket, frame) {
  if (socket.readyState !== wrapper_default.OPEN) return false;
  let text2;
  try {
    text2 = encode(frame);
  } catch {
    return false;
  }
  socket.send(text2);
  return true;
}

// src/core/device-login.ts
var DeviceLoginError = class extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
    this.name = "DeviceLoginError";
  }
  kind;
};
var REQUEST_TIMEOUT_MS2 = 15e3;
var MAX_BACKOFF_MS = 3e4;
var SLOW_DOWN_STEP_S = 5;
var defaultSleep = (ms, signal) => new Promise((resolve5) => {
  if (signal?.aborted) return resolve5();
  const done = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", done);
    resolve5();
  };
  const timer = setTimeout(done, ms);
  signal?.addEventListener("abort", done, { once: true });
});
function requestSignal(signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS2);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
async function postJson(url, body, options) {
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: requestSignal(options.signal)
  });
  const parsed = await response.json().catch(() => ({}));
  const retry = Number(response.headers.get("retry-after"));
  return {
    status: response.status,
    body: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {},
    ...Number.isFinite(retry) && retry > 0 ? { retryAfter: retry } : {}
  };
}
var text = (value) => typeof value === "string" && value ? value : void 0;
var positive = (value, fallback) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
async function requestDeviceCode(serverUrl, request, options = {}) {
  const base = enrollmentBase(serverUrl);
  let result;
  try {
    result = await postJson(
      new URL("/api/device/code", base),
      {
        client: "peerband-cli",
        client_version: request.clientVersion.slice(0, 40),
        ...request.machineName ? { machine_name: request.machineName.slice(0, 120) } : {},
        ...request.platform ? { platform: request.platform.slice(0, 40) } : {}
      },
      options
    );
  } catch (error) {
    if (options.signal?.aborted) throw new DeviceLoginError("aborted", "Login cancelled.");
    throw new DeviceLoginError("network", `Could not reach ${base.origin}: ${error.message}`);
  }
  if (result.status === 404 || result.status === 405) {
    throw new DeviceLoginError("unsupported", "This server doesn't support browser sign-in yet.");
  }
  const { body } = result;
  const deviceCode = text(body.device_code);
  const userCode = text(body.user_code);
  const verificationUri = text(body.verification_uri);
  if (result.status !== 200 || !deviceCode || !userCode || !verificationUri) {
    const detail = text(body.error_description) ?? text(body.detail) ?? `HTTP ${result.status}`;
    throw new DeviceLoginError("rejected", `The server refused the sign-in request: ${detail}`);
  }
  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete: text(body.verification_uri_complete) ?? verificationUri,
    expiresIn: positive(body.expires_in, 600),
    interval: positive(body.interval, 5)
  };
}
async function pollDeviceToken(serverUrl, code, options = {}) {
  const base = enrollmentBase(serverUrl);
  const url = new URL("/api/device/token", base);
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const deadline = now() + code.expiresIn * 1e3;
  let interval = code.interval;
  let failures = 0;
  const expired = () => new DeviceLoginError("expired", "The code expired.");
  const aborted = () => new DeviceLoginError("aborted", "Login cancelled.");
  for (; ; ) {
    if (options.signal?.aborted) throw aborted();
    const wait = failures > 0 ? Math.min(MAX_BACKOFF_MS, interval * 1e3 * 2 ** failures) : interval * 1e3;
    await sleep(wait, options.signal);
    if (options.signal?.aborted) throw aborted();
    if (now() >= deadline) throw expired();
    let result;
    try {
      result = await postJson(
        url,
        { device_code: code.deviceCode, ...options.previousCredential ? { previous_credential: options.previousCredential } : {} },
        options
      );
    } catch {
      if (options.signal?.aborted) throw aborted();
      failures = Math.min(failures + 1, 10);
      continue;
    }
    const { status, body } = result;
    if (status === 200) {
      const installationId = text(body.installation_id);
      const credential = text(body.credential);
      if (!installationId || !credential) {
        failures = Math.min(failures + 1, 10);
        continue;
      }
      return {
        serverUrl: base.origin,
        installationId,
        credential,
        ...text(body.machine_name) ? { machineName: text(body.machine_name) } : {},
        ...text(body.account_email) ? { accountEmail: text(body.account_email) } : {}
      };
    }
    if (status >= 500 || status === 429 && !text(body.error)) {
      failures = Math.min(failures + 1, 10);
      continue;
    }
    failures = 0;
    const error = text(body.error);
    switch (error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        interval = Math.max(interval + SLOW_DOWN_STEP_S, positive(body.interval, 0));
        continue;
      case "access_denied":
        throw new DeviceLoginError("denied", "Sign-in was denied in the browser.");
      case "expired_token":
        throw expired();
      case "invalid_grant":
        throw new DeviceLoginError("invalid_grant", "The sign-in code is no longer valid.");
      default:
        throw new DeviceLoginError("rejected", `The server rejected the sign-in: ${text(body.error_description) ?? error ?? `HTTP ${status}`}`);
    }
  }
}

// src/core/events.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var AGENT_STATUSES = ["idle", "working", "blocked", "done", "unknown"];
var NOTE_MAX_CHARS = 1024;
var PANE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
function eventFrame(name, data, now = /* @__PURE__ */ new Date()) {
  return { type: "event", eventId: randomUUID2(), name, timestamp: now.toISOString(), data };
}
function codePoints(text2) {
  return Array.from(text2).length;
}
function cleanNote(text2) {
  if (typeof text2 !== "string" || text2.trim().length === 0) throw new ConnectError("invalid_argument", "The note is empty.", 'Pass a short note, for example `peerband notify "Tests pass"`.');
  if (codePoints(text2) > NOTE_MAX_CHARS) throw new ConnectError("invalid_argument", `The note is longer than ${NOTE_MAX_CHARS} characters.`, "Shorten the note; put details where the owner can read them, such as a file or the agent output.");
  let clean = sanitizeOutput(text2, { lines: 500, bytes: 32 * 1024 }).text.trim();
  if (codePoints(clean) > NOTE_MAX_CHARS) clean = [...clean].slice(0, NOTE_MAX_CHARS).join("");
  if (clean.length === 0) throw new ConnectError("invalid_argument", "The note has no printable text.", "Pass a short plain-text note.");
  return clean;
}
var ConnectorEvents = class {
  constructor(adapter, options = {}) {
    this.adapter = adapter;
    this.allowedAgents = options.allowedAgents ? new Set(options.allowedAgents) : void 0;
    this.allowedWorkspaces = options.allowedWorkspaces ? new Set(options.allowedWorkspaces) : void 0;
    this.windowMs = options.windowMs ?? 250;
    this.ratePerSecond = options.ratePerSecond ?? 10;
    this.burst = options.burst ?? 20;
    this.notesPerMinute = options.notesPerMinute ?? 10;
    this.now = options.now ?? Date.now;
    this.log = options.log;
    this.tokens = this.burst;
    this.noteTokens = this.notesPerMinute;
    this.refilledAt = this.noteRefilledAt = this.now();
  }
  adapter;
  allowedAgents;
  allowedWorkspaces;
  windowMs;
  ratePerSecond;
  burst;
  notesPerMinute;
  now;
  log;
  send;
  unsubscribe;
  pending = /* @__PURE__ */ new Map();
  lastSent = /* @__PURE__ */ new Map();
  listChanged = false;
  lastListSent = Number.NEGATIVE_INFINITY;
  tokens;
  refilledAt;
  noteTokens;
  noteRefilledAt;
  timer;
  timerAt = Number.POSITIVE_INFINITY;
  /** Starts listening to the runtime. Runtimes without events are fine: only notes are sent then. */
  start() {
    if (this.unsubscribe || !this.adapter.onEvent) return;
    this.unsubscribe = this.adapter.onEvent((event) => this.push(event), this.log);
  }
  close() {
    this.unsubscribe?.();
    this.unsubscribe = void 0;
    this.detach();
  }
  attach(send) {
    this.send = send;
    this.pending.clear();
    this.listChanged = false;
    this.lastListSent = this.now();
    send(eventFrame("agents.changed", {}));
  }
  detach() {
    this.send = void 0;
    this.pending.clear();
    this.listChanged = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = void 0;
    this.timerAt = Number.POSITIVE_INFINITY;
  }
  get connected() {
    return this.send !== void 0;
  }
  push(event) {
    if (!this.send) return;
    if (event.kind === "agents_changed") this.listChanged = true;
    else {
      if (!this.visible(event.agentId, event.workspace)) return;
      this.pending.set(event.agentId, {
        agentId: event.agentId,
        status: event.status,
        previousStatus: event.previousStatus,
        label: event.label,
        workspace: event.workspace,
        revision: event.revision
      });
    }
    this.flush();
  }
  /** Sends an owner-directed note. Resolves the calling pane to an agent id when the runtime can. */
  async notify(input) {
    if (!this.adapter.getCapabilities().readOutput) throw new ConnectError("unsupported_capability", "This connector does not share agent output, so notes are turned off.", "Use a runtime with output support.");
    const text2 = cleanNote(input.text);
    const agentId = await this.resolveAgent(input.paneId);
    if (!this.send) return { sent: false, agentId };
    this.refillNotes();
    if (this.noteTokens < 1) throw new ConnectError("rate_limited", `Too many notes: at most ${this.notesPerMinute} per minute.`, "Wait a minute, and send one note per important result.");
    this.noteTokens -= 1;
    const frame = eventFrame("agent.notified", { agentId, text: text2, audience: "owner" });
    const sent = this.send(frame);
    return { sent, agentId, ...sent ? { eventId: frame.eventId } : {} };
  }
  async resolveAgent(paneId) {
    if (typeof paneId !== "string" || !PANE_ID.test(paneId) || !this.adapter.agentIdForPane) return null;
    try {
      const id = await this.adapter.agentIdForPane(paneId);
      if (!id) return null;
      if (!this.allowedAgents && !this.allowedWorkspaces) return id;
      const agent = await this.adapter.getAgent(id);
      return this.visible(agent.id, agent.workspace) ? agent.id : null;
    } catch {
      return null;
    }
  }
  visible(agentId, workspace) {
    if (this.allowedAgents && !this.allowedAgents.has(agentId)) return false;
    if (this.allowedWorkspaces && (workspace === null || !this.allowedWorkspaces.has(workspace))) return false;
    return true;
  }
  refill(now) {
    this.tokens = Math.min(this.burst, this.tokens + (now - this.refilledAt) / 1e3 * this.ratePerSecond);
    this.refilledAt = now;
  }
  refillNotes() {
    const now = this.now();
    this.noteTokens = Math.min(this.notesPerMinute, this.noteTokens + (now - this.noteRefilledAt) / 6e4 * this.notesPerMinute);
    this.noteRefilledAt = now;
  }
  flush() {
    const send = this.send;
    if (!send) return;
    const now = this.now();
    this.refill(now);
    let next = Number.POSITIVE_INFINITY;
    if (this.listChanged) {
      const due = this.lastListSent + this.windowMs;
      if (due > now) next = Math.min(next, due);
      else if (this.tokens >= 1) {
        this.tokens -= 1;
        this.listChanged = false;
        this.lastListSent = now;
        send(eventFrame("agents.changed", {}));
      }
    }
    for (const [agentId, data] of this.pending) {
      const due = (this.lastSent.get(agentId) ?? Number.NEGATIVE_INFINITY) + this.windowMs;
      if (due > now) {
        next = Math.min(next, due);
        continue;
      }
      if (this.tokens < 1) break;
      this.tokens -= 1;
      this.pending.delete(agentId);
      this.lastSent.set(agentId, now);
      send(eventFrame("agent.status_changed", data));
    }
    for (const [agentId, at] of this.lastSent) if (at + this.windowMs <= now && !this.pending.has(agentId)) this.lastSent.delete(agentId);
    if ((this.pending.size > 0 || this.listChanged) && this.tokens < 1) next = Math.min(next, now + Math.ceil((1 - this.tokens) / this.ratePerSecond * 1e3));
    this.schedule(next);
  }
  schedule(at) {
    if (!Number.isFinite(at)) return;
    if (this.timer && this.timerAt <= at) return;
    if (this.timer) clearTimeout(this.timer);
    this.timerAt = at;
    this.timer = setTimeout(() => {
      this.timer = void 0;
      this.timerAt = Number.POSITIVE_INFINITY;
      this.flush();
    }, Math.max(0, at - this.now()));
    this.timer.unref?.();
  }
};

// src/cli/types.ts
var UsageError = class extends Error {
  hint;
  constructor(message, hint) {
    super(message);
    this.name = "UsageError";
    this.hint = hint;
  }
};
var CliError = class extends Error {
  hint;
  code;
  constructor(message, hint, code = 1) {
    super(message);
    this.name = "CliError";
    this.hint = hint;
    this.code = code;
  }
};
var EXIT_NOT_LOGGED_IN = 3;

// src/cli/args.ts
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}
function suggest(input, candidates) {
  let best;
  for (const name of candidates) {
    const score = input && (name.startsWith(input) || input.startsWith(name)) ? 1 : distance(input, name);
    if (score <= Math.max(2, Math.floor(name.length / 3)) && (!best || score < best.score)) best = { name, score };
  }
  return best?.name;
}
var HELP_OPTION = { name: "help", short: "h", type: "boolean", description: "Show help for this command." };
function parseArgs(spec11, argv) {
  const options = [...spec11.options, HELP_OPTION];
  const values = {};
  const positionals = [];
  const helpHint = `Run \`peerband ${spec11.name} --help\` for usage.`;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      continue;
    }
    let option;
    let inline;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      inline = eq === -1 ? void 0 : arg.slice(eq + 1);
      option = options.find((candidate) => candidate.name === name);
      if (!option) {
        const near = suggest(name, options.filter((o) => !o.hidden).map((o) => o.name));
        throw new UsageError(`Unknown option --${name} for \`peerband ${spec11.name}\`.`, near ? `Did you mean --${near}? ${helpHint}` : helpHint);
      }
    } else {
      option = options.find((candidate) => candidate.short === arg.slice(1));
      if (!option) throw new UsageError(`Unknown option ${arg} for \`peerband ${spec11.name}\`.`, helpHint);
    }
    if (option.type === "boolean") {
      if (inline !== void 0) throw new UsageError(`Option --${option.name} does not take a value.`, helpHint);
      values[option.name] = true;
      continue;
    }
    let value = inline;
    if (value === void 0) {
      const next = argv[i + 1];
      if (next === void 0 || next.startsWith("-") && next !== "-") {
        throw new UsageError(`Option --${option.name} needs a value (${option.valueName ?? "VALUE"}).`, helpHint);
      }
      value = next;
      i++;
    }
    values[option.name] = value;
  }
  const max = spec11.positionals?.max ?? 0;
  if (positionals.length > max) {
    throw new UsageError(`Unexpected argument "${positionals[max]}" for \`peerband ${spec11.name}\`.`, helpHint);
  }
  return { values, positionals };
}
var str = (parsed, name) => {
  const value = parsed.values[name];
  return typeof value === "string" ? value : void 0;
};
var flag = (parsed, name) => parsed.values[name] === true;

// src/cli/herdr-bin.ts
import { execFile } from "node:child_process";
function herdrBinary(env, platform = process.platform) {
  return env.HERDR_BIN_PATH || (platform === "win32" ? "herdr.exe" : "herdr");
}
function createHerdrRunner(env) {
  return (args, options) => new Promise((resolve5) => {
    execFile(
      herdrBinary(env),
      args,
      { env, timeout: options?.timeoutMs ?? 6e4, windowsHide: true, maxBuffer: 4 * 1024 * 1024, shell: false },
      (error, stdout, stderr) => {
        if (!error) return resolve5({ code: 0, stdout, stderr });
        const failure = error;
        if (failure.code === "ENOENT") return resolve5({ code: 127, stdout: "", stderr: failure.message, notFound: true });
        const code = typeof failure.code === "number" ? failure.code : 1;
        resolve5({ code, stdout: stdout ?? "", stderr: stderr || (failure.killed ? "timed out" : failure.message) });
      }
    );
  });
}
var NOT_FOUND_MESSAGE = "Herdr was not found.";
var NOT_FOUND_HINT = "Install Herdr, put it on PATH, or set HERDR_BIN_PATH to its executable.";
function failureDetail(result) {
  const text2 = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
  let detail = text2;
  try {
    const parsed = JSON.parse(text2);
    detail = parsed.error?.message || parsed.message || text2;
  } catch {
  }
  return detail.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim().slice(0, 400);
}

// herdr/relay-tab.mjs
import { execFile as execFile2 } from "node:child_process";
import { mkdir as mkdir3, readFile as readFile4, rename as rename3, rm as rm3, rmdir as rmdir2, stat, writeFile as writeFile3 } from "node:fs/promises";
import { randomUUID as randomUUID3 } from "node:crypto";
import { dirname as dirname3 } from "node:path";

// herdr/paths.mjs
import { createHash as createHash2 } from "node:crypto";
import { homedir as homedir2, tmpdir } from "node:os";
import { join as join3, posix, resolve, win32 } from "node:path";
function configHome2(env = process.env, platform = process.platform, home = homedir2()) {
  if (env.PEERBAND_CONFIG_HOME) return env.PEERBAND_CONFIG_HOME;
  if (platform === "win32") return join3(env.APPDATA || join3(home, "AppData", "Roaming"), "peerband");
  return join3(env.XDG_CONFIG_HOME || join3(home, ".config"), "peerband");
}
var lockPath2 = (config = configHome2()) => join3(config, "relay-helper.lock");
var ownerRecordPath = (config = configHome2()) => join3(lockPath2(config), "owner.json");
var relayTabPath2 = (config = configHome2()) => join3(config, "relay-tab.json");
function canonicalConfig(config, platform = process.platform) {
  const resolved = (platform === "win32" ? win32 : posix).resolve(config);
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}
function controlChannel(config = configHome2(), platform = process.platform) {
  const digest = createHash2("sha256").update(canonicalConfig(config, platform)).digest("hex").slice(0, 24);
  return platform === "win32" ? `\\\\.\\pipe\\peerband-relay-${digest}` : join3(tmpdir(), `pbr-${process.getuid?.() ?? "local"}-${digest}.sock`);
}

// herdr/relay-tab.mjs
import { promisify } from "node:util";
var exec = promisify(execFile2);
var pluginId = "peerband";
var entrypoint = "relay";
var markerName = "peerband_relay";
var markerSource = "peerband-relay";
var tabTitle = (enabled) => `PeerBand Relay [${enabled ? "On" : "Off"}]`;
var productionController;
function describeHerdrFailure(error, binary = "herdr") {
  if (error?.code === "ENOENT") {
    return `Herdr was not found (${binary}). Install Herdr, put it on PATH, or set HERDR_BIN_PATH to its executable.`;
  }
  const detail = safeFailure(error);
  if (/plugin/i.test(detail) && /not found|not installed|unknown|no such|does not exist|not registered/i.test(detail)) {
    return `The PeerBand plugin is not installed in Herdr (${detail}). Run \`peerband herdr install\`.`;
  }
  return detail;
}
function productionOptions() {
  return {
    run: async (args) => {
      const binary = process.env.HERDR_BIN_PATH || "herdr";
      try {
        const result = await exec(binary, args, { timeout: 1e4, windowsHide: true, maxBuffer: 65536 });
        return parseHerdrCommandOutput(result.stdout, args);
      } catch (error) {
        throw new Error(`${args.slice(0, args[0] === "plugin" ? 3 : 2).join(" ")}: ${describeHerdrFailure(error, binary)}`);
      }
    },
    statePath: relayTabPath2(),
    pluginPaneId: process.env.HERDR_PANE_ID,
    warn: (message) => process.stderr.write(`${message}
`)
  };
}
function safeFailure(error) {
  const raw = typeof error?.stderr === "string" && error.stderr.trim() ? error.stderr : error?.message;
  let detail = raw;
  try {
    const response = JSON.parse(raw);
    detail = response.error?.message || response.message || "Herdr rejected the command";
  } catch {
  }
  return String(detail || "Herdr command failed").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, 400);
}
function parseHerdrCommandOutput(raw, args) {
  const needsData = args[0] === "pane" && ["get", "list"].includes(args[1]) || args[0] === "plugin" && args[1] === "pane" && args[2] === "open";
  const text2 = raw.trim();
  if (!text2 && !needsData) return {};
  let value;
  try {
    value = JSON.parse(text2);
  } catch {
    if (!needsData) return {};
    throw new Error("Herdr returned an invalid JSON data response");
  }
  if (value?.ok === false || value?.error) throw new Error(value.error?.message || "Herdr command failed");
  if (!value || typeof value !== "object") {
    if (!needsData) return {};
    throw new Error("Herdr returned no pane data");
  }
  return value.result ?? value;
}
async function readRecord(statePath) {
  try {
    const value = JSON.parse(await readFile4(statePath, "utf8"));
    if (value?.version === 1 && typeof value.paneId === "string" && typeof value.marker === "string") return value;
  } catch {
  }
  return void 0;
}
async function writeRecord(statePath, record) {
  await mkdir3(dirname3(statePath), { recursive: true });
  const temporary = `${statePath}.${randomUUID3()}.tmp`;
  try {
    await writeFile3(temporary, JSON.stringify(record), { encoding: "utf8", mode: 384, flag: "wx" });
    await rename3(temporary, statePath);
  } finally {
    await rm3(temporary, { force: true }).catch(() => {
    });
  }
}
async function withLaunchLock(statePath, action) {
  const lockPath3 = `${statePath}.launch-lock`;
  await mkdir3(dirname3(statePath), { recursive: true });
  const deadline = Date.now() + 5e3;
  while (true) {
    try {
      await mkdir3(lockPath3);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let stale = false;
      try {
        const info = await stat(lockPath3);
        if (Date.now() - info.mtimeMs > 12e4) {
          const quarantine = `${lockPath3}.stale-${randomUUID3()}`;
          await rename3(lockPath3, quarantine).then(() => rmdir2(quarantine)).catch(() => {
          });
          stale = true;
        }
      } catch {
        stale = true;
      }
      if (stale) continue;
      if (Date.now() >= deadline) throw new Error("Another PeerBand Relay tab launch is already in progress");
      await new Promise((resolve5) => setTimeout(resolve5, 100));
    }
  }
  try {
    return await action();
  } finally {
    await rmdir2(lockPath3).catch(() => {
    });
  }
}
async function inspectOwned(run3, record) {
  if (!record) return void 0;
  let pane;
  try {
    pane = (await run3(["pane", "get", record.paneId])).pane;
  } catch {
    return void 0;
  }
  if (!pane || pane.pane_id !== record.paneId || pane.tokens?.[markerName] !== record.marker) return void 0;
  return pane;
}
async function findMarkedPane(run3) {
  let listed;
  try {
    listed = (await run3(["pane", "list"])).panes;
  } catch {
    return void 0;
  }
  if (!Array.isArray(listed)) return void 0;
  return listed.find((item) => typeof item?.pane_id === "string" && typeof item.tokens?.[markerName] === "string" && item.tokens[markerName]);
}
async function renameOwnedSinglePaneTab(run3, pane, label) {
  if (!pane?.workspace_id || !pane?.tab_id || !pane?.pane_id) return false;
  let listed;
  try {
    listed = (await run3(["pane", "list", "--workspace", pane.workspace_id])).panes;
  } catch {
    return false;
  }
  if (!Array.isArray(listed)) return false;
  const inTab = listed.filter((item) => item.tab_id === pane.tab_id);
  if (inTab.length !== 1 || inTab[0]?.pane_id !== pane.pane_id) return false;
  await run3(["tab", "rename", pane.tab_id, label]);
  return true;
}
function createRelayTabController({ run: run3, statePath, pluginPaneId = "", newMarker = randomUUID3, warn = () => {
} }) {
  if (typeof run3 !== "function" || typeof statePath !== "string") throw new TypeError("run and statePath are required");
  const lastVerifiedTitle = /* @__PURE__ */ new Map();
  async function sync(enabled) {
    if (typeof pluginPaneId !== "string" || !pluginPaneId) return false;
    const record = await readRecord(statePath);
    if (!record || record.paneId !== pluginPaneId) return false;
    const pane = await inspectOwned(run3, record);
    if (!pane) return false;
    try {
      const label = tabTitle(enabled);
      const key = `${pane.pane_id}\0${pane.tab_id}`;
      if (lastVerifiedTitle.get(key) === label) return true;
      const renamed = await renameOwnedSinglePaneTab(run3, pane, label);
      if (renamed) lastVerifiedTitle.set(key, label);
      return renamed;
    } catch {
      return false;
    }
  }
  async function close() {
    const record = await readRecord(statePath);
    if (!record || pluginPaneId !== record.paneId) return false;
    if (!await inspectOwned(run3, record)) return false;
    try {
      await run3(["plugin", "pane", "close", record.paneId]);
      await rm3(statePath, { force: true });
      return true;
    } catch {
      return false;
    }
  }
  async function open() {
    return withLaunchLock(statePath, async () => {
      const previous = await readRecord(statePath);
      const pane = await inspectOwned(run3, previous);
      if (pane) {
        await run3(["plugin", "pane", "focus", pane.pane_id]);
        return pane.pane_id;
      }
      const existing = await findMarkedPane(run3);
      if (existing) {
        await writeRecord(statePath, { version: 1, paneId: existing.pane_id, marker: existing.tokens[markerName] });
        await run3(["plugin", "pane", "focus", existing.pane_id]);
        return existing.pane_id;
      }
      const result = await run3(["plugin", "pane", "open", "--plugin", pluginId, "--entrypoint", entrypoint, "--placement", "tab", "--focus"]);
      const opened = result.plugin_pane;
      if (opened?.plugin_id !== pluginId || opened?.entrypoint !== entrypoint || typeof opened.pane?.pane_id !== "string") {
        throw new Error("Herdr did not return the expected plugin pane");
      }
      const record = { version: 1, paneId: opened.pane.pane_id, marker: newMarker() };
      try {
        await renameOwnedSinglePaneTab(run3, opened.pane, tabTitle(false)).catch((error) => {
          warn(`Relay tab opened; its initial title could not be set: ${safeFailure(error)}`);
        });
        await writeRecord(statePath, record);
        await run3(["pane", "report-metadata", record.paneId, "--source", markerSource, "--token", `${markerName}=${record.marker}`]);
        const marked = await inspectOwned(run3, record);
        if (!marked) throw new Error("Herdr did not retain the plugin pane ownership marker");
        return record.paneId;
      } catch (error) {
        await run3(["plugin", "pane", "close", record.paneId]).catch(() => {
        });
        const current = await readRecord(statePath);
        if (current?.paneId === record.paneId && current.marker === record.marker) await rm3(statePath, { force: true }).catch(() => {
        });
        throw error;
      }
    });
  }
  return { open, sync, close };
}
function getProductionController() {
  productionController ??= createRelayTabController(productionOptions());
  return productionController;
}
async function openRelayTab(options) {
  const controller = options ? createRelayTabController({ ...productionOptions(), ...options }) : getProductionController();
  return controller.open();
}

// herdr/pane-state.mjs
var CONNECTION_STATES = /* @__PURE__ */ new Set(["connecting", "connected", "reconnecting", "revoked", "unavailable", "remote-unavailable", "helper-unavailable", "disabled"]);
var OUTCOMES = /* @__PURE__ */ new Set(["success", "runtime-unavailable", "error", "uncertain", "timeout"]);
var TOOLS = /* @__PURE__ */ new Set(["list_agents", "get_agent_status", "get_agent_output", "get_request_status", "send_agent_message"]);
function normalizeStoredActivity(value) {
  if (!value || typeof value !== "object" || typeof value.requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.requestId) || !TOOLS.has(value.tool) || !OUTCOMES.has(value.outcome) || !Number.isFinite(value.latencyMs) || typeof value.at !== "string" || Number.isNaN(Date.parse(value.at))) return null;
  return { kind: "activity", requestId: value.requestId, tool: value.tool, ...typeof value.target === "string" && /^[A-Za-z0-9._:-]{1,256}$/.test(value.target) ? { target: value.target } : {}, outcome: value.outcome, latencyMs: Math.max(0, Math.min(864e5, Math.round(value.latencyMs))), at: new Date(value.at).toISOString() };
}
function createPaneSnapshot({ state, connectionState, activity }) {
  return {
    state: state === "running" ? "running" : "stopping",
    connectionState: CONNECTION_STATES.has(connectionState) ? connectionState : "unavailable",
    activity: Array.isArray(activity) ? activity.map(normalizeStoredActivity).filter(Boolean).slice(-100) : []
  };
}
function fallbackPaneSnapshot(value) {
  const snapshot = createPaneSnapshot(value);
  return {
    ...snapshot,
    state: "stopping",
    connectionState: snapshot.connectionState === "revoked" || snapshot.connectionState === "disabled" ? snapshot.connectionState : "helper-unavailable"
  };
}
function paneLabel(snapshot) {
  if (!snapshot) return "Disconnected";
  switch (snapshot.connectionState) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    case "revoked":
      return "Access revoked";
    case "remote-unavailable":
      return "PeerBand unavailable";
    case "helper-unavailable":
      return "Helper unavailable";
    case "unavailable":
      return "Herdr unavailable";
    case "disabled":
      return "Disconnected";
    default:
      return "Herdr unavailable";
  }
}

// herdr/stale-lock.mjs
import { execFile as execFile3 } from "node:child_process";
import { randomUUID as randomUUID4 } from "node:crypto";
import { readdir, readFile as readFile5, rename as rename4, rm as rm4, stat as stat2, writeFile as writeFile4 } from "node:fs/promises";
import { createConnection } from "node:net";
import { hostname as hostname2 } from "node:os";
import { join as join4, relative } from "node:path";
var CREATION_GRACE_MS = 1e4;
var SUPERVISOR_PATTERN = /lifecycle\.mjs["']?\s+supervise\b/i;
var CONNECTOR_PATTERN = /peerband(?:\.mjs|\.cmd|\.ps1)?["']?\s+connect\b/i;
function pidAlive2(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && error.code === "EPERM");
  }
}
function probeChannel(channel, timeout = 1500) {
  return new Promise((resolve5) => {
    let settled = false;
    const socket = createConnection(channel);
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve5(value);
    };
    const timer = setTimeout(() => finish("unknown"), timeout);
    socket.once("connect", () => finish("listening"));
    socket.once("error", (error) => finish(error && (error.code === "ENOENT" || error.code === "ECONNREFUSED") ? "absent" : "unknown"));
  });
}
function run(file, args, timeout) {
  return new Promise((resolve5) => {
    execFile3(file, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => resolve5(error ? null : String(stdout)));
  });
}
async function listProcesses(platform = process.platform) {
  if (platform === "linux") {
    let entries;
    try {
      entries = await readdir("/proc");
    } catch {
      return null;
    }
    const result = [];
    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const command = (await readFile5(`/proc/${entry}/cmdline`, "utf8")).split("\0").join(" ").trim();
        if (command) result.push({ pid: Number(entry), command });
      } catch {
      }
    }
    return result;
  }
  if (platform === "win32") {
    const script = `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`;
    const text3 = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], 15e3);
    if (text3 === null) return null;
    return parseProcessLines(text3, "	");
  }
  const text2 = await run("ps", ["-axo", "pid=,command="], 1e4);
  return text2 === null ? null : parseProcessLines(text2, " ");
}
function parseProcessLines(text2, separator) {
  const result = [];
  for (const raw of text2.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.indexOf(separator);
    const pid = Number(at < 0 ? line : line.slice(0, at));
    if (Number.isSafeInteger(pid) && pid > 0) result.push({ pid, command: at < 0 ? "" : line.slice(at + 1).trim() });
  }
  return result;
}
async function readOwner(ownerFile) {
  let text2;
  try {
    text2 = await readFile5(ownerFile, "utf8");
  } catch {
    return { text: null, owner: null };
  }
  try {
    const value = JSON.parse(text2);
    if (value && typeof value === "object" && !Array.isArray(value)) return { text: text2, owner: value };
  } catch {
  }
  return { text: text2, owner: {} };
}
async function inspectLock({ lockDir, ownerFile, channel, processPattern, excludePids = [], listProcesses: list2 = listProcesses, probe = probeChannel, alive = pidAlive2, host = hostname2(), now = Date.now() }) {
  let info;
  try {
    info = await stat2(lockDir);
  } catch (error) {
    if (error && error.code === "ENOENT") return { state: "absent", reason: "no lock", ownerText: null };
    return { state: "live", reason: `the lock could not be read (${error && error.code})`, ownerText: null };
  }
  const { text: text2, owner } = await readOwner(ownerFile);
  const ignore = /* @__PURE__ */ new Set([process.pid, ...excludePids]);
  const matching = async (keep) => {
    if (!processPattern) return null;
    const processes = await list2();
    if (!processes) return null;
    return processes.filter((item) => (item.pid === keep || !ignore.has(item.pid)) && processPattern.test(item.command));
  };
  if (owner && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
    const pid = owner.pid;
    if (typeof owner.hostname === "string" && owner.hostname && owner.hostname !== host) {
      return { state: "live", reason: `the owner runs on another host (${owner.hostname})`, ownerText: text2, pid };
    }
    if (!alive(pid)) return { state: "stale", reason: `owner process ${pid} is not running`, ownerText: text2, pid };
    if (channel && await probe(channel) !== "absent") return { state: "live", reason: `owner process ${pid} is running`, ownerText: text2, pid };
    const candidates2 = await matching(pid);
    if (candidates2 && !candidates2.some((item) => item.pid === pid)) {
      return { state: "stale", reason: `process ${pid} is running but is not a PeerBand ${channel ? "helper" : "connector"}`, ownerText: text2, pid };
    }
    return { state: "live", reason: `owner process ${pid} is running`, ownerText: text2, pid };
  }
  if (text2 === null && now - info.mtimeMs < CREATION_GRACE_MS) return { state: "live", reason: "the lock is being created", ownerText: null };
  if (channel) {
    const probed = await probe(channel);
    if (probed === "listening") return { state: "live", reason: "a helper answers on the control channel", ownerText: text2 };
    if (probed === "unknown") return { state: "live", reason: "the control channel could not be checked", ownerText: text2 };
    return { state: "stale", reason: "no helper answers on the control channel", ownerText: text2 };
  }
  const candidates = await matching();
  if (candidates && candidates.length > 0) {
    return { state: "live", reason: `a matching process is running (pid ${candidates.map((item) => item.pid).join(", ")})`, ownerText: text2 };
  }
  if (!candidates) return { state: "live", reason: "running processes could not be listed", ownerText: text2 };
  return { state: "stale", reason: "no matching process is running", ownerText: text2 };
}
async function reclaimLock({ lockDir, ownerFile, expectedOwnerText }) {
  const quarantine = `${lockDir}.stale-${randomUUID4()}`;
  try {
    await rename4(lockDir, quarantine);
  } catch (error) {
    return Boolean(error && error.code === "ENOENT");
  }
  const moved = await readOwner(join4(quarantine, relative(lockDir, ownerFile)));
  if (expectedOwnerText !== void 0 && moved.text !== expectedOwnerText) {
    await rename4(quarantine, lockDir).catch(() => {
    });
    return false;
  }
  await rm4(quarantine, { recursive: true, force: true }).catch(() => {
  });
  return true;
}
async function reclaimIfStale(options) {
  const verdict = await inspectLock(options);
  if (verdict.state !== "stale") return { reclaimed: false, verdict };
  const reclaimed = await reclaimLock({ lockDir: options.lockDir, ownerFile: options.ownerFile, expectedOwnerText: verdict.ownerText ?? void 0 });
  if (reclaimed && options.log) options.log(`Reclaimed a stale lock ${options.lockDir} (${verdict.reason}).`);
  return { reclaimed, verdict };
}
async function resetRelayState(path) {
  let previous = {};
  try {
    previous = JSON.parse(await readFile5(path, "utf8")) || {};
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
  }
  const activity = Array.isArray(previous.activity) ? previous.activity : [];
  if (previous.state === "stopping" && previous.connectionState === "disabled") return false;
  await writeFile4(path, `${JSON.stringify({ state: "stopping", connectionState: "disabled", activity })}
`, { mode: 384 });
  return true;
}

// src/cli/herdr-js.ts
var openRelayTab2 = openRelayTab;
var canonicalConfig2 = canonicalConfig;
var controlChannel2 = controlChannel;
var ownerRecordPath2 = ownerRecordPath;
var fallbackPaneSnapshot2 = fallbackPaneSnapshot;
var createPaneSnapshot2 = createPaneSnapshot;
var paneLabel2 = paneLabel;
var inspectLock2 = inspectLock;
var reclaimIfStale2 = reclaimIfStale;
var resetRelayState2 = resetRelayState;
var probeChannel2 = probeChannel;
var SUPERVISOR_PATTERN2 = SUPERVISOR_PATTERN;
var CONNECTOR_PATTERN2 = CONNECTOR_PATTERN;

// src/cli/commands/connect.ts
import { resolve as resolve3 } from "node:path";

// src/runtime-herdr/adapter.ts
import { createHash as createHash3, randomUUID as randomUUID7 } from "node:crypto";
import { readFile as readFile7, stat as stat3 } from "node:fs/promises";
import { homedir as homedir3 } from "node:os";
import { join as join5 } from "node:path";

// src/runtime-herdr/subscription.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import { createConnection as createConnection2 } from "node:net";
function openSubscription(options) {
  const id = `sub_${randomUUID5()}`;
  const request = { id, method: "events.subscribe", params: { subscriptions: options.subscriptions } };
  const maxLineBytes = options.maxLineBytes ?? 1024 * 1024;
  let acknowledged = false;
  let resolveStarted;
  let rejectStarted;
  let resolveClosed;
  const started = new Promise((resolve5, reject) => {
    resolveStarted = resolve5;
    rejectStarted = reject;
  });
  const closed = new Promise((resolve5) => {
    resolveClosed = resolve5;
  });
  void started.catch(() => void 0);
  if (options.validateRequest && !options.validateRequest(request)) {
    rejectStarted(new ConnectError("unsupported_capability", "This Herdr API schema does not accept the event subscription.", "Update Herdr to a version with events.subscribe."));
    resolveClosed();
    return { started, closed, close: () => void 0 };
  }
  const socket = createConnection2(options.socketPath);
  const fail = (error) => {
    if (!acknowledged) rejectStarted(error);
    socket.destroy();
  };
  socket.setNoDelay(true);
  const timer = setTimeout(() => fail(new ConnectError("timeout", "Herdr did not acknowledge the event subscription.", "Check that Herdr is responsive.")), options.timeoutMs ?? 5e3);
  timer.unref?.();
  let buffer = Buffer.alloc(0);
  socket.once("connect", () => socket.write(`${JSON.stringify(request)}
`));
  socket.on("error", () => fail(new ConnectError("runtime_unavailable", "Cannot connect to the Herdr socket for events.", "Start Herdr and verify its local socket path.")));
  socket.on("close", () => {
    clearTimeout(timer);
    if (!acknowledged) rejectStarted(new ConnectError("runtime_unavailable", "Herdr closed the event socket before subscribing.", "Start Herdr and verify its local socket path."));
    resolveClosed();
  });
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let newline;
    while ((newline = buffer.indexOf(10)) >= 0) {
      const line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      if (line.length === 0) continue;
      if (line.length > maxLineBytes) {
        fail(protocolError("Herdr event line exceeded the size limit"));
        return;
      }
      let value;
      try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line));
      } catch {
        fail(protocolError("Herdr sent malformed JSON on the event socket"));
        return;
      }
      if (!isRecord3(value)) continue;
      if (value.id === id) {
        if (isRecord3(value.error)) {
          const code = typeof value.error.code === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value.error.code) ? value.error.code : "runtime_error";
          fail(new ConnectError(code, `Herdr rejected events.subscribe (${code}).`, "Update Herdr to a version with event subscriptions."));
          return;
        }
        if (isRecord3(value.result) && value.result.type === "subscription_started") {
          acknowledged = true;
          clearTimeout(timer);
          resolveStarted();
        } else {
          fail(protocolError("Herdr answered events.subscribe with an unexpected result"));
          return;
        }
        continue;
      }
      if (acknowledged && typeof value.event === "string" && isRecord3(value.data)) options.onEvent({ event: value.event, data: value.data });
    }
    if (buffer.length > maxLineBytes) fail(protocolError("Herdr event line exceeded the size limit"));
  });
  return { started, closed, close: () => {
    socket.destroy();
  } };
}
function protocolError(message) {
  return new ConnectError("protocol_error", message, "Check that the installed Herdr version matches its API schema.");
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/runtime-herdr/events.ts
var LIST_SUBSCRIPTIONS = ["pane.created", "pane.closed", "pane.exited", "pane.agent_detected"];
var UNSUPPORTED = /* @__PURE__ */ new Set(["invalid_request", "unknown_method", "method_not_found", "unsupported_capability", "schema_mismatch"]);
var normalizeName = (name) => name.replaceAll(".", "_");
var HerdrEventBridge = class {
  constructor(host, options = {}) {
    this.host = host;
    this.log = options.log ?? (() => void 0);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve5) => {
      const timer = setTimeout(resolve5, ms);
      timer.unref?.();
    }));
    this.random = options.random ?? Math.random;
    this.settleMs = options.settleMs ?? 100;
    this.listSettleMs = options.listSettleMs ?? 250;
    this.open = options.openSubscription ?? openSubscription;
  }
  host;
  listeners = /* @__PURE__ */ new Set();
  log;
  sleep;
  random;
  settleMs;
  listSettleMs;
  open;
  running;
  stopped = true;
  handle;
  subscribedPanes = /* @__PURE__ */ new Set();
  lastStatus = /* @__PURE__ */ new Map();
  dirty = /* @__PURE__ */ new Map();
  statusTimer;
  listTimer;
  wake;
  unsupportedLogged = false;
  resubscribeRequested = false;
  subscribe(listener) {
    this.listeners.add(listener);
    if (this.stopped) {
      this.stopped = false;
      this.running = this.run().catch(() => void 0);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) void this.stop();
    };
  }
  async stop() {
    this.stopped = true;
    this.handle?.close();
    this.wake?.();
    if (this.statusTimer) clearTimeout(this.statusTimer);
    if (this.listTimer) clearTimeout(this.listTimer);
    this.statusTimer = this.listTimer = void 0;
    this.dirty.clear();
    await this.running;
  }
  /** Called by the adapter after every agent.list refresh. */
  agentsRefreshed(idsChanged) {
    if (this.stopped) return;
    if (idsChanged) this.emit({ kind: "agents_changed" });
    const panes = new Set(this.host.agents().map((agent) => agent.paneId));
    if (this.handle && !sameSet(panes, this.subscribedPanes)) this.requestResubscribe(this.handle);
  }
  requestResubscribe(handle) {
    this.resubscribeRequested = true;
    handle.close();
  }
  emit(event) {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
      }
    }
  }
  async run() {
    let attempt = 0;
    let dropped = false;
    while (!this.stopped) {
      let resubscribe = false;
      this.resubscribeRequested = false;
      try {
        const { socketPath, validateRequest, supportsEvents } = await this.host.prepare();
        if (!supportsEvents) {
          this.unsupported("this Herdr version has no events.subscribe");
          return;
        }
        await this.host.refresh();
        if (this.stopped) return;
        const agents = this.host.agents();
        const panes = new Set(agents.map((agent) => agent.paneId));
        for (const agent of agents) this.lastStatus.set(agent.agentId, agent.status);
        const subscriptions = [
          ...[...panes].map((paneId) => ({ type: "pane.agent_status_changed", pane_id: paneId })),
          ...LIST_SUBSCRIPTIONS.map((type) => ({ type }))
        ];
        const handle = this.open({ socketPath, subscriptions, validateRequest, onEvent: (event) => this.onPushed(event) });
        this.handle = handle;
        this.subscribedPanes = panes;
        await handle.started;
        if (attempt > 0) this.log("Herdr agent events resumed.");
        attempt = 0;
        if (dropped) this.emit({ kind: "agents_changed" });
        dropped = false;
        if (!sameSet(new Set(this.host.agents().map((agent) => agent.paneId)), panes)) this.requestResubscribe(handle);
        await handle.closed;
        resubscribe = this.resubscribeRequested;
        if (!resubscribe && !this.stopped) {
          dropped = true;
          this.log("Herdr closed the agent event stream; retrying.");
        }
      } catch (error) {
        if (error instanceof ConnectError && UNSUPPORTED.has(error.code)) {
          this.unsupported(`Herdr rejected events.subscribe (${error.code})`);
          return;
        }
        if (attempt === 0 && !this.stopped) this.log(`Herdr agent events unavailable (${error instanceof ConnectError ? error.code : "error"}); retrying.`);
      } finally {
        this.handle = void 0;
      }
      if (this.stopped) return;
      if (resubscribe) continue;
      const ceiling = Math.min(3e4, 500 * 2 ** Math.min(attempt++, 6));
      await this.pause(Math.round(ceiling * (0.5 + this.random() * 0.5)));
    }
  }
  async pause(ms) {
    await Promise.race([this.sleep(ms), new Promise((resolve5) => {
      this.wake = resolve5;
    })]);
    this.wake = void 0;
  }
  unsupported(reason) {
    this.stopped = true;
    if (this.unsupportedLogged) return;
    this.unsupportedLogged = true;
    this.log(`Agent events are off: ${reason}. Clients can still poll.`);
  }
  onPushed(event) {
    if (this.stopped) return;
    const name = normalizeName(event.event);
    if (name === "pane_agent_status_changed") this.onStatus(event.data);
    else if (LIST_SUBSCRIPTIONS.map(normalizeName).includes(name)) this.scheduleListRefresh();
  }
  onStatus(data) {
    const paneId = data.pane_id;
    const raw = data.agent_status;
    if (typeof paneId !== "string") return;
    const status = typeof raw === "string" && AGENT_STATUSES.includes(raw) ? raw : "unknown";
    const agent = this.host.agents().find((candidate) => candidate.paneId === paneId);
    if (!agent) {
      this.scheduleListRefresh();
      return;
    }
    const previousStatus = this.lastStatus.get(agent.agentId) ?? null;
    if (previousStatus === status) return;
    this.lastStatus.set(agent.agentId, status);
    this.dirty.set(paneId, { agentId: agent.agentId, status, previousStatus, label: agent.label, workspace: agent.workspace });
    this.statusTimer ??= setTimeout(() => {
      this.statusTimer = void 0;
      void this.flushStatus();
    }, this.settleMs);
    this.statusTimer.unref?.();
  }
  async flushStatus() {
    const batch = [...this.dirty.values()];
    this.dirty.clear();
    let fresh = true;
    try {
      await this.host.refresh();
    } catch {
      fresh = false;
    }
    if (this.stopped) return;
    const current = new Map(this.host.agents().map((agent) => [agent.agentId, agent]));
    for (const item of batch) {
      const record = fresh ? current.get(item.agentId) : void 0;
      if (fresh && !record) continue;
      this.emit({
        kind: "status",
        agentId: item.agentId,
        status: item.status,
        previousStatus: item.previousStatus,
        label: record?.label ?? item.label,
        workspace: record?.workspace ?? item.workspace,
        revision: record ? record.revision : null
      });
    }
  }
  scheduleListRefresh() {
    this.listTimer ??= setTimeout(() => {
      this.listTimer = void 0;
      void this.host.refresh().catch(() => void 0);
    }, this.listSettleMs);
    this.listTimer.unref?.();
  }
};
function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

// src/runtime-herdr/socket-client.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import { createConnection as createConnection3 } from "node:net";
var HerdrSocketClient = class {
  socketPath;
  timeoutMs;
  maxLineBytes;
  maxPending;
  validateSuccessResponse;
  validateErrorResponse;
  validateRequest;
  schemaDiagnostics;
  sockets = /* @__PURE__ */ new Set();
  buffers = /* @__PURE__ */ new WeakMap();
  pending = /* @__PURE__ */ new Map();
  closed = false;
  epoch = 0;
  inflight = 0;
  constructor(options) {
    this.socketPath = options.socketPath;
    this.timeoutMs = options.timeoutMs ?? 5e3;
    this.maxLineBytes = options.maxLineBytes ?? 2 * 1024 * 1024;
    this.maxPending = options.maxPending ?? 32;
    this.validateSuccessResponse = options.validateSuccessResponse;
    this.validateErrorResponse = options.validateErrorResponse;
    this.validateRequest = options.validateRequest;
    this.schemaDiagnostics = options.schemaDiagnostics;
  }
  get connectionEpoch() {
    return this.epoch;
  }
  async request(method, params = {}) {
    if (this.closed) throw this.unavailable("Herdr socket client is closed");
    if (this.inflight >= this.maxPending) throw this.unavailable("Too many Herdr requests are in flight");
    const id = randomUUID6();
    const request = { id, method, params };
    if (this.validateRequest && !this.validateRequest(request)) throw new ConnectError("schema_mismatch", `Herdr request does not match the selected API schema (${this.schemaDiagnostics?.() ?? "schema validation failed"})`, "Use an adapter and schema version compatible with the installed Herdr binary.");
    const line = Buffer.from(`${JSON.stringify(request)}
`, "utf8");
    if (line.length > this.maxLineBytes) throw this.unavailable("Herdr request exceeds the configured size limit");
    this.inflight += 1;
    let socket;
    try {
      socket = await this.connect();
    } catch (error) {
      this.inflight -= 1;
      throw error;
    }
    return new Promise((resolve5, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.inflight -= 1;
        socket.end();
        reject(method === "agent.prompt" ? new ConnectError("delivery_unknown", "Herdr did not acknowledge the prompt before the request timed out.", "Check the agent status before deciding whether to send the prompt again.") : new ConnectError("timeout", `Herdr ${method} request timed out`, "Check that Herdr is responsive and retry the read."));
      }, this.timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve: resolve5, reject, timer, method, socket });
      socket.write(line, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (pending) {
          this.pending.delete(id);
          clearTimeout(timer);
          this.inflight -= 1;
          reject(this.mapTransportError(method));
        }
      });
    });
  }
  async close() {
    this.closed = true;
    this.failAll(this.unavailable("Herdr socket client closed"));
    await Promise.all([...this.sockets].map((socket) => new Promise((resolve5) => {
      if (socket.destroyed) resolve5();
      else socket.end(resolve5);
    })));
  }
  connect() {
    return new Promise((resolve5, reject) => {
      const socket = createConnection3(this.socketPath);
      const onError = () => {
        socket.destroy();
        this.sockets.delete(socket);
        reject(this.unavailable("Cannot connect to the Herdr socket. Verify Herdr is running and the socket path is correct."));
      };
      socket.setNoDelay(true);
      socket.once("error", onError);
      socket.once("connect", () => {
        socket.removeListener("error", onError);
        this.sockets.add(socket);
        this.buffers.set(socket, Buffer.alloc(0));
        this.epoch += 1;
        socket.on("data", (chunk) => this.onData(socket, chunk));
        socket.on("error", () => this.failSocket(socket, this.unavailable("Herdr socket failed. Check that Herdr is running.")));
        socket.on("close", () => {
          this.sockets.delete(socket);
          this.buffers.delete(socket);
          this.failSocket(socket, this.unavailable("Herdr closed the socket before replying"));
        });
        resolve5(socket);
      });
    });
  }
  onData(socket, chunk) {
    let buffer = Buffer.concat([this.buffers.get(socket) ?? Buffer.alloc(0), chunk]);
    this.buffers.set(socket, buffer);
    if (buffer.length > this.maxLineBytes && !buffer.includes(10)) {
      this.protocolFailure(socket, "Herdr response line exceeded the configured size limit");
      return;
    }
    let newline;
    while ((newline = buffer.indexOf(10)) >= 0) {
      if (newline > this.maxLineBytes) {
        this.protocolFailure(socket, "Herdr response line exceeded the configured size limit");
        return;
      }
      const line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      this.buffers.set(socket, buffer);
      if (line.length === 0) continue;
      let response;
      try {
        response = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line));
      } catch {
        this.protocolFailure(socket, "Herdr returned malformed JSON");
        return;
      }
      if (!response || typeof response !== "object" || Array.isArray(response)) {
        this.protocolFailure(socket, "Herdr returned a response that is not an object");
        return;
      }
      const record = response;
      if (typeof record.id !== "string") {
        this.protocolFailure(socket, "Herdr response has no request id");
        return;
      }
      const pending = this.pending.get(record.id);
      if (!pending) continue;
      this.pending.delete(record.id);
      clearTimeout(pending.timer);
      this.inflight -= 1;
      if ("error" in record) {
        if (this.validateErrorResponse && !this.validateErrorResponse(record)) {
          pending.reject(new ConnectError("schema_mismatch", `Herdr error response did not match the selected API schema (${this.schemaDiagnostics?.() ?? "schema validation failed"})`, "Use the API schema shipped with the connected Herdr version."));
          socket.end();
          continue;
        }
        const error = record.error;
        if (!error || typeof error !== "object" || typeof error.code !== "string" || typeof error.message !== "string") {
          pending.reject(new ConnectError("protocol_error", "Herdr returned a malformed error response", "Check that the installed Herdr version matches its API schema."));
        } else {
          const herdrError = error;
          const rawCode = herdrError.code === "not_found" ? "agent_not_found" : herdrError.code;
          const code = /^[a-z][a-z0-9_]{0,63}$/.test(rawCode) ? rawCode : "runtime_error";
          pending.reject(new ConnectError(code, `Herdr rejected ${pending.method} (${code}).`, "Refresh the agent list and check the Herdr session state."));
        }
      } else if ("result" in record) {
        if (this.validateSuccessResponse && !this.validateSuccessResponse(record)) {
          pending.reject(new ConnectError("schema_mismatch", `Herdr response did not match the selected API schema (${this.schemaDiagnostics?.() ?? "schema validation failed"})`, "Use the API schema shipped with the connected Herdr version."));
        } else pending.resolve(record.result);
      } else pending.reject(new ConnectError("protocol_error", "Herdr response has neither result nor error", "Check Herdr compatibility and its API schema."));
      socket.end();
    }
  }
  protocolFailure(socket, message) {
    this.failSocket(socket, new ConnectError("protocol_error", message, "Check that the installed Herdr version matches the selected API schema."));
    socket.destroy();
  }
  failSocket(socket, error) {
    for (const [id, item] of this.pending) {
      if (item.socket !== socket) continue;
      this.pending.delete(id);
      clearTimeout(item.timer);
      this.inflight -= 1;
      item.reject(item.method === "agent.prompt" ? new ConnectError("delivery_unknown", "Herdr connection ended after the prompt may have been sent", "Check the agent status before deciding whether to send the prompt again.") : error);
    }
  }
  failAll(error) {
    for (const [id, item] of this.pending) {
      this.pending.delete(id);
      clearTimeout(item.timer);
      item.reject(item.method === "agent.prompt" ? new ConnectError("delivery_unknown", "Herdr connection ended after the prompt may have been sent", "Check the agent status before deciding whether to send the prompt again.") : error);
    }
  }
  mapTransportError(method) {
    return method === "agent.prompt" ? new ConnectError("delivery_unknown", "Herdr connection failed after the prompt may have been sent", "Check the agent status before deciding whether to send the prompt again.") : this.unavailable("Herdr socket write failed. Check that Herdr is running.");
  }
  unavailable(message) {
    return new ConnectError("runtime_unavailable", message, "Start Herdr and verify its local socket path.");
  }
};

// src/runtime-herdr/schema.ts
var import_ajv_formats = __toESM(require_dist(), 1);
var import__ = __toESM(require__(), 1);
import { execFile as execFile4 } from "node:child_process";
import { readFile as readFile6 } from "node:fs/promises";
import { promisify as promisify2 } from "node:util";
var execFileAsync = promisify2(execFile4);
var addFormats = import_ajv_formats.default.default ?? import_ajv_formats.default;
async function loadHerdrSchema(options = {}) {
  let raw;
  try {
    if (options.schemaPath) raw = await readFile6(options.schemaPath, "utf8");
    else {
      if (!options.binary) throw new Error("No schemaPath or Herdr binary was configured");
      const result = await execFileAsync(options.binary, ["api", "schema", "--json"], {
        timeout: 1e4,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        env: process.env
      });
      raw = result.stdout;
    }
  } catch {
    throw new ConnectError("runtime_unavailable", "Could not load the Herdr API schema.", "Set binary to the installed Herdr executable or provide schemaPath for its matching API schema.");
  }
  let schema;
  try {
    schema = JSON.parse(raw);
  } catch {
    throw schemaMismatch("schema output is not valid JSON");
  }
  if (!schema || typeof schema !== "object" || !Number.isInteger(schema.protocol) || !Number.isInteger(schema.schema_version) || !schema.schemas?.request || !schema.schemas?.success_response || !schema.schemas?.error_response) {
    throw schemaMismatch("missing protocol metadata or required request/response schemas");
  }
  const requestOneOf = schema.schemas.request.oneOf;
  const resultOneOf = schema.schemas.success_response.$defs?.ResponseResult?.oneOf;
  if (!Array.isArray(requestOneOf) || !Array.isArray(resultOneOf)) throw schemaMismatch("does not expose the expected Herdr request and success result unions");
  try {
    const ajv = new import__.Ajv2020({ allErrors: true, strict: false, validateFormats: true });
    addFormats(ajv);
    const unsigned = (bits) => ({ type: "number", validate: (value) => Number.isSafeInteger(value) && value >= 0 && (bits >= 53 || value <= 2 ** bits - 1) });
    ajv.addFormat("uint", unsigned(32));
    ajv.addFormat("uint16", unsigned(16));
    ajv.addFormat("uint32", unsigned(32));
    ajv.addFormat("uint64", unsigned(64));
    const rootId = "https://peerband.invalid/herdr-api.schema.json";
    const root = { ...schema, $id: rootId };
    ajv.addSchema(root);
    const requestValidator = ajv.compile({ $ref: `${rootId}#/schemas/request` });
    const successValidator = ajv.compile({ $ref: `${rootId}#/schemas/success_response` });
    const errorValidator = ajv.compile({ $ref: `${rootId}#/schemas/error_response` });
    let lastDiagnostics = "no validation details";
    const wrap = (validator) => (value) => {
      const valid = validator(value);
      if (!valid) {
        lastDiagnostics = (validator.errors ?? []).slice(0, 5).map((item) => `${item.instancePath || "/"} ${item.message || "invalid"}`).join("; ") || "JSON Schema validation failed";
      }
      return valid;
    };
    const validateRequest = wrap(requestValidator);
    const validateSuccessResponse = wrap(successValidator);
    const validateErrorResponse = wrap(errorValidator);
    const methods = new Set(requestOneOf.map((branch) => branch.properties?.method?.const));
    for (const required of ["session.snapshot", "agent.list", "agent.get", "agent.read", "agent.prompt"]) if (!methods.has(required)) throw schemaMismatch(`missing required method ${required}`);
    const prompt = requestOneOf.find((branch) => branch.properties?.method?.const === "agent.prompt");
    const promptRef = prompt?.properties?.params?.$ref;
    const promptName = promptRef?.split("/").at(-1);
    const params = promptName ? schema.schemas.request.$defs?.[promptName] : void 0;
    const writesHaveAtomicOccupantGuard = Boolean(params?.properties && Object.entries(params.properties).some(([name, spec11]) => /^(expected_generation|expected_terminal_id|expected_agent_session)$/i.test(name) && JSON.stringify(spec11).toLowerCase().includes("occupant")));
    return {
      schema,
      validateRequest,
      validateSuccessResponse,
      validateErrorResponse,
      diagnostics: () => lastDiagnostics,
      writesHaveAtomicOccupantGuard
    };
  } catch (cause) {
    if (cause instanceof ConnectError) throw cause;
    throw schemaMismatch(`could not compile JSON Schema validators (${cause instanceof Error ? cause.message : String(cause)})`);
  }
}
function schemaMismatch(detail) {
  return new ConnectError("schema_mismatch", `Herdr API schema is incompatible: ${detail}`, "Select a schema that matches the installed Herdr binary or update the adapter for its API.");
}

// src/runtime-herdr/adapter.ts
var HerdrAdapter = class {
  options;
  machineId;
  ready;
  current = /* @__PURE__ */ new Map();
  retired = /* @__PURE__ */ new Set();
  endpointMarker;
  socketPath;
  refreshing;
  listed = false;
  records = /* @__PURE__ */ new Map();
  bridge;
  constructor(options = {}) {
    this.options = options;
    this.machineId = options.machineId ?? createHash3("sha256").update(`${process.platform}:${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "local"}`).digest("hex").slice(0, 24);
  }
  getCapabilities() {
    return { readOutput: true, sendMessage: true, reason: "Messages are addressed by a unique live agent name. Herdr does not atomically bind that name to an occupant, so names can be reassigned between validation and delivery." };
  }
  async listAgents() {
    if (!this.refreshing) this.refreshing = this.refreshAgents().finally(() => {
      this.refreshing = void 0;
    });
    return this.refreshing;
  }
  async refreshAgents() {
    const { client } = await this.initialize();
    const result = asObject(await client.request("agent.list", {}));
    if (result.type !== "agent_list" || !Array.isArray(result.agents)) throw this.schemaMismatch("agent.list returned an unexpected result type");
    const marker = this.socketPath ? await readEndpointMarker(this.socketPath) : void 0;
    const reconnected = marker !== void 0 && this.endpointMarker !== void 0 && marker !== this.endpointMarker;
    if (marker !== void 0) this.endpointMarker = marker;
    if (reconnected) for (const previous of this.current.values()) this.retired.add(previous.id);
    const previousTargets = [...this.current.values()];
    const next = /* @__PURE__ */ new Map();
    const nextIds = /* @__PURE__ */ new Set();
    const records = [];
    const rawAgents = result.agents;
    for (const raw of rawAgents) {
      if (!isAgent(raw)) throw this.schemaMismatch("agent.list contained an invalid agent record");
      const fingerprint = identityFingerprint(raw);
      const previous = !reconnected ? previousTargets.find((item) => item.fingerprint === fingerprint) : void 0;
      const id = previous?.id ?? `herdr_${randomUUID7()}`;
      const live = { id, fingerprint, agent: raw };
      next.set(raw.pane_id, live);
      nextIds.add(id);
      records.push(toRecord(live, this.machineId, promptTarget(raw, rawAgents) !== void 0));
    }
    for (const previous of previousTargets) if (!nextIds.has(previous.id)) this.retired.add(previous.id);
    const idsChanged = this.listed && (nextIds.size !== previousTargets.length || previousTargets.some((item) => !nextIds.has(item.id)));
    this.current = next;
    this.records = new Map(records.map((record) => [record.id, record]));
    this.listed = true;
    this.bridge?.agentsRefreshed(idsChanged);
    return records;
  }
  /** Status and list-change events from Herdr's events.subscribe (metadata only, never pane text). */
  onEvent(listener, log) {
    this.bridge ??= new HerdrEventBridge({
      prepare: async () => {
        const { schema } = await this.initialize();
        const request = schema.schema.schemas.request;
        return {
          socketPath: platformSocketAddress(this.socketPath),
          validateRequest: schema.validateRequest,
          supportsEvents: Boolean(request.oneOf?.some((branch) => branch.properties?.method?.const === "events.subscribe"))
        };
      },
      refresh: async () => {
        await this.listAgents();
      },
      agents: () => [...this.current.values()].map((live) => {
        const record = this.records.get(live.id);
        return { paneId: live.agent.pane_id, agentId: live.id, status: record?.status ?? "unknown", label: record?.label ?? "Herdr agent", workspace: record?.workspace ?? live.agent.workspace_id, revision: live.agent.revision };
      })
    }, { ...this.options.events, log });
    return this.bridge.subscribe(listener);
  }
  /** The agent id for a Herdr pane id such as HERDR_PANE_ID, after a fresh agent.list. */
  async agentIdForPane(paneId) {
    await this.listAgents();
    return this.current.get(paneId)?.id;
  }
  async getAgent(id) {
    const agents = await this.listAgents();
    const record = agents.find((agent) => agent.id === id);
    if (record) return record;
    if (this.retired.has(id)) throw new ConnectError("stale_target", "This Herdr agent handle refers to an occupant that has exited or changed.", "Refresh the agent list and select its current occupant.");
    throw new ConnectError("agent_not_found", "No Herdr agent has that identifier.", "List agents and use a current agent identifier.");
  }
  async readOutput(id, options = {}) {
    if (options.cursor !== void 0) throw new ConnectError("unsupported_capability", "Herdr output cursors are not available in this API version.", "Request output again with a bounded line or byte limit and no cursor.");
    await this.getAgent(id);
    const live = [...this.current.values()].find((item) => item.id === id);
    if (!live) throw new ConnectError("stale_target", "This Herdr agent handle is no longer current.", "Refresh the agent list and select its current occupant.");
    const lines = clampInteger(options.lines, 80, 1, 500);
    const { client } = await this.initialize();
    const result = asObject(await client.request("agent.read", {
      target: live.agent.pane_id,
      source: "recent",
      format: "text",
      lines,
      strip_ansi: true
    }));
    if (result.type !== "pane_read" || !result.read || typeof result.read !== "object" || typeof result.read.text !== "string") throw this.schemaMismatch("agent.read returned an unexpected result type");
    const output = sanitizeOutput(result.read.text, { ...options, lines, bytes: clampInteger(options.bytes, 16384, 1, 32768) });
    await this.getAgent(id);
    return { ...output, truncated: output.truncated || result.read.truncated === true, observedAt: (/* @__PURE__ */ new Date()).toISOString(), untrusted: true };
  }
  async sendMessage(id, message) {
    if (typeof message !== "string" || message.length === 0 || Buffer.byteLength(message, "utf8") > 16384) {
      throw new ConnectError("invalid_argument", "Message must contain 1 to 16384 UTF-8 bytes.", "Shorten the message and try again.");
    }
    await this.getAgent(id);
    await this.listAgents();
    const live = [...this.current.values()].find((item) => item.id === id);
    if (!live) throw new ConnectError("stale_target", "This Herdr agent handle is no longer current.", "Refresh the agent list and select its current occupant.");
    if (live.agent.agent_status === "blocked") throw new ConnectError("agent_blocked", "The Herdr agent is blocked and cannot accept a prompt.", "Inspect the agent state and resolve its blocker before sending a message.");
    const allLive = [...this.current.values()].map((item) => item.agent);
    const target = promptTarget(live.agent, allLive);
    if (!target) {
      throw new ConnectError("unsupported_capability", "This Herdr agent has no safe live name or pane target for prompt delivery.", "Assign it a unique lowercase live agent name or refresh the agent list.");
    }
    const { client } = await this.initialize();
    const result = asObject(await client.request("agent.prompt", { target, text: message }));
    if (result.type !== "agent_prompted") throw this.schemaMismatch("agent.prompt returned an unexpected result type");
  }
  async close() {
    await this.bridge?.stop();
    const pending = await this.ready?.catch(() => void 0);
    await pending?.client.close();
  }
  initialize() {
    if (!this.ready) {
      const pending = (async () => {
        const binary = this.options.binary ?? process.env.HERDR_BIN_PATH ?? "herdr";
        const schema = await loadHerdrSchema({ schemaPath: this.options.schemaPath, binary });
        const socketPath = this.options.socketPath ?? process.env.HERDR_SOCKET_PATH ?? defaultSocketPath();
        this.socketPath = socketPath;
        const client = new HerdrSocketClient({
          socketPath: platformSocketAddress(socketPath),
          timeoutMs: this.options.timeoutMs,
          validateSuccessResponse: schema.validateSuccessResponse,
          validateErrorResponse: schema.validateErrorResponse,
          validateRequest: schema.validateRequest,
          schemaDiagnostics: schema.diagnostics
        });
        const pong = asObject(await client.request("ping", {}));
        if (pong.type !== "pong" || pong.protocol !== schema.schema.protocol) {
          await client.close();
          throw new ConnectError("schema_mismatch", "The connected Herdr server protocol does not match the selected API schema.", "Connect to the Herdr server that belongs to the configured binary or provide its API schema.");
        }
        return { schema, client };
      })();
      this.ready = pending;
      void pending.catch(() => {
        if (this.ready === pending) this.ready = void 0;
      });
    }
    return this.ready;
  }
  schemaMismatch(message) {
    return new ConnectError("schema_mismatch", `Herdr response did not match the selected API schema: ${message}`, "Use the API schema shipped with the connected Herdr version.");
  }
};
function toRecord(live, machineId, canSend) {
  const agent = live.agent;
  const label = agent.display_agent ?? agent.name ?? agent.agent ?? agent.terminal_title_stripped ?? agent.title ?? "Herdr agent";
  const status = ["idle", "working", "blocked", "done", "unknown"].includes(agent.agent_status) ? agent.agent_status : "unknown";
  return {
    id: live.id,
    machineId,
    runtime: "herdr",
    agentType: agent.agent ?? agent.display_agent ?? "unknown",
    label,
    workspace: agent.cwd ?? agent.foreground_cwd ?? agent.workspace_id,
    status,
    rawStatus: agent.agent_status,
    observedAt: (/* @__PURE__ */ new Date()).toISOString(),
    stale: false,
    capabilities: { readOutput: true, sendMessage: canSend, ...canSend ? {} : { reason: "A unique valid live name or pane target is required for prompt targeting." } }
  };
}
function isValidAlias(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(value);
}
function isUniqueLiveAlias(agent, agents) {
  return isValidAlias(agent.name) && agents.filter((candidate) => candidate.name === agent.name).length === 1;
}
function promptTarget(agent, agents) {
  if (isUniqueLiveAlias(agent, agents)) return agent.name;
  if (agent.pane_id.length > 0 && agents.filter((candidate) => candidate.pane_id === agent.pane_id).length === 1) return agent.pane_id;
  return void 0;
}
function identityFingerprint(agent) {
  const reference = agent.agent_session ? `${agent.agent_session.source}:${agent.agent_session.agent}:${agent.agent_session.kind}:${agent.agent_session.value}` : "";
  return createHash3("sha256").update([agent.terminal_id, agent.agent ?? "", reference].join("\0")).digest("hex");
}
function defaultSocketPath() {
  const session = process.env.HERDR_SESSION;
  if (session !== void 0 && (session.length > 64 || !/^[A-Za-z0-9._-]+$/.test(session) || session === "." || session === "..")) {
    throw new ConnectError("invalid_config", "HERDR_SESSION contains unsupported characters.", "Use a Herdr session name with only letters, numbers, dots, underscores, and hyphens.");
  }
  const root = process.platform === "win32" ? join5(process.env.APPDATA ?? join5(homedir3(), "AppData", "Roaming"), "herdr") : join5(process.env.XDG_CONFIG_HOME ?? join5(homedir3(), ".config"), "herdr");
  return session ? join5(root, "sessions", session, "herdr.sock") : join5(root, "herdr.sock");
}
function platformSocketAddress(path) {
  if (process.platform !== "win32" || path.startsWith("\\\\.\\pipe\\")) return path;
  return `\\\\.\\pipe\\${path}`;
}
function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConnectError("schema_mismatch", "Herdr returned a non-object result.", "Use the API schema shipped with the connected Herdr version.");
  return value;
}
function isAgent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value;
  return typeof v.pane_id === "string" && typeof v.terminal_id === "string" && typeof v.workspace_id === "string" && typeof v.tab_id === "string" && typeof v.agent_status === "string" && typeof v.revision === "number";
}
function clampInteger(value, fallback, min, max) {
  if (value === void 0) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ConnectError("invalid_argument", `Expected an integer from ${min} through ${max}.`, "Choose a value within the documented output limit.");
  return value;
}
async function readEndpointMarker(socketPath) {
  try {
    if (process.platform === "win32") {
      if (socketPath.startsWith("\\\\.\\pipe\\")) return void 0;
      const marker = (await readFile7(socketPath, "utf8")).trim();
      return marker || void 0;
    }
    const file = await stat3(socketPath);
    return `${file.dev}:${file.ino}`;
  } catch {
    return void 0;
  }
}

// src/cli/output.ts
function colorEnabled(stream, env) {
  const force = env.FORCE_COLOR;
  if (force !== void 0 && force !== "") return force !== "0" && force.toLowerCase() !== "false";
  if (env.NO_COLOR !== void 0 && env.NO_COLOR !== "") return false;
  return Boolean(stream.isTTY) && env.TERM !== "dumb";
}
function makeStyle(enabled) {
  const wrap = (open, close) => (text2) => enabled ? `\x1B[${open}m${text2}\x1B[${close}m` : text2;
  return {
    enabled,
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39)
  };
}
var sanitize = (text2) => text2.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
var Output = class {
  constructor(outStream, errStream, env) {
    this.outStream = outStream;
    this.errStream = errStream;
    this.stdout = makeStyle(colorEnabled(outStream, env));
    this.stderr = makeStyle(colorEnabled(errStream, env));
  }
  outStream;
  errStream;
  stdout;
  stderr;
  print(line = "") {
    this.outStream.write(`${line}
`);
  }
  warn(line = "") {
    this.errStream.write(`${line}
`);
  }
  /** `peerband: <message>` plus a `Next:` line, on stderr. */
  fail(message, hint) {
    const s = this.stderr;
    this.warn(`${s.bold(s.red("peerband:"))} ${message}`);
    if (hint) this.warn(`${s.dim("Next:")} ${hint}`);
  }
};
var symbols = { ok: "\u2713", dot: "\u25CF", ring: "\u25CB", warn: "!", fail: "\u2717" };

// src/cli/commands/shared.ts
import { resolve as resolve2 } from "node:path";

// src/cli/skill.ts
import { createHash as createHash4 } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { cp, mkdir as mkdir4, writeFile as writeFile5 } from "node:fs/promises";
import { dirname as dirname4, join as join6 } from "node:path";

// src/cli/exec.ts
import { spawn } from "node:child_process";
var SAFE_ARG = /^[\w@./:\\=+~-]+$/;
function cmdQuote(arg) {
  if (SAFE_ARG.test(arg)) return arg;
  if (/["%^&|<>!\r\n]/.test(arg)) throw new Error(`Refusing to pass an unsafe argument to the shell: ${arg}`);
  return `"${arg}"`;
}
var execProgram = (file, args, options = {}) => new Promise((resolve5) => {
  const viaShell = process.platform === "win32" && !/[\\/]/.test(file) && !/\.exe$/i.test(file);
  let child;
  try {
    child = viaShell ? spawn([file, ...args].map(cmdQuote).join(" "), { shell: true, env: options.env ?? process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }) : spawn(file, args, { env: options.env ?? process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], shell: false });
  } catch (error) {
    resolve5({ code: 1, stdout: "", stderr: error.message });
    return;
  }
  let stdout = "";
  let stderr = "";
  let settled = false;
  const finish = (result) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve5(result);
  };
  const timer = setTimeout(() => {
    child.kill();
    finish({ code: 1, stdout, stderr: `${stderr}
timed out` });
  }, options.timeoutMs ?? 3e5);
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
    options.onStdout?.(chunk);
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
    options.onStderr?.(chunk);
  });
  child.once("error", (error) => finish({ code: 127, stdout, stderr: error.message, notFound: error.code === "ENOENT" }));
  child.once("close", (code) => {
    if (viaShell && code === 9009) return finish({ code: 127, stdout, stderr: stderr || `${file} was not found`, notFound: true });
    finish({ code: code ?? 1, stdout, stderr });
  });
});

// src/cli/skill.ts
var SKILLS_CLI = "skills@1.7.4";
var SKILL_NAME = "peerband";
var SKILLS_TIMEOUT_MS = 12e4;
function bundledSkillDir(selfPath = process.argv[1]) {
  if (!selfPath) return void 0;
  let dir;
  try {
    dir = dirname4(realpathSync(selfPath));
  } catch {
    return void 0;
  }
  for (let i = 0; i < 4; i++) {
    const candidate = join6(dir, "skills", SKILL_NAME);
    if (existsSync(join6(candidate, "SKILL.md"))) return candidate;
    const parent = dirname4(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return void 0;
}
function skillsHome(ctx) {
  return ctx.env.PEERBAND_SKILLS_HOME || (process.platform === "win32" ? ctx.env.USERPROFILE : ctx.env.HOME) || void 0;
}
function copyTargets(home) {
  const targets = [join6(home, ".agents", "skills", SKILL_NAME)];
  if (existsSync(join6(home, ".claude"))) targets.push(join6(home, ".claude", "skills", SKILL_NAME));
  return targets;
}
function installedSkillFile(ctx) {
  const home = skillsHome(ctx);
  if (!home) return void 0;
  return [join6(home, ".agents", "skills", SKILL_NAME), join6(home, ".claude", "skills", SKILL_NAME)].map((dir) => join6(dir, "SKILL.md")).find((file) => existsSync(file));
}
var skillInstalled = (ctx) => installedSkillFile(ctx) !== void 0;
var sha256 = (file) => createHash4("sha256").update(readFileSync(file)).digest("hex");
var recordFile = (ctx) => join6(configHome({ env: ctx.env }), "skill.json");
function skillEdited(ctx) {
  const file = installedSkillFile(ctx);
  if (!file) return false;
  let recorded;
  try {
    recorded = JSON.parse(readFileSync(recordFile(ctx), "utf8")).sha256;
  } catch {
    return false;
  }
  try {
    return typeof recorded === "string" && sha256(file) !== recorded;
  } catch {
    return false;
  }
}
var SkillEditedError = class extends Error {
  constructor(file) {
    super(`The PeerBand skill at ${file} has your own changes, so it was not replaced.`);
    this.file = file;
    this.name = "SkillEditedError";
  }
  file;
};
function parseSkillsJson(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end <= start) return void 0;
  let items;
  try {
    items = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return void 0;
  }
  if (!Array.isArray(items)) return void 0;
  const item = items.find((entry) => entry && typeof entry === "object" && entry.name === SKILL_NAME);
  if (!item || item.status !== "installed" || typeof item.path !== "string") return void 0;
  const agents = Array.isArray(item.agents) ? item.agents.filter((agent) => typeof agent === "string") : [];
  return { method: "skills", path: item.path, agents };
}
function failureReason(stdout, stderr, code) {
  const json = /"error"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(stdout)?.[1];
  if (json) return json.replace(/\\(.)/g, "$1");
  const line = `${stderr}
${stdout}`.split(/\r?\n/).map((text2) => text2.trim()).filter(Boolean).pop();
  return line ? `${line} (exit code ${code})` : `exit code ${code}`;
}
async function installSkill(ctx, options = {}) {
  const source = bundledSkillDir(ctx.selfPath);
  if (!source) throw new Error("The PeerBand skill is missing from this installation.");
  if (!options.force && skillEdited(ctx)) throw new SkillEditedError(installedSkillFile(ctx));
  const remember = async (installed) => {
    try {
      const file = recordFile(ctx);
      await mkdir4(dirname4(file), { recursive: true });
      await writeFile5(file, `${JSON.stringify({ sha256: sha256(join6(source, "SKILL.md")), path: installed.path }, null, 2)}
`);
    } catch {
    }
    return installed;
  };
  let reason;
  if (!options.copy) {
    const exec2 = ctx.exec ?? execProgram;
    const result = await exec2("npx", ["-y", SKILLS_CLI, "add", source, "--global", "--yes", "--json"], { timeoutMs: SKILLS_TIMEOUT_MS, env: ctx.env });
    const installed = parseSkillsJson(result.stdout);
    if (installed) return remember(installed);
    reason = result.notFound ? "npx was not found" : failureReason(result.stdout, result.stderr, result.code);
    options.log?.(`The skills installer did not finish (${reason}); copying the skill instead.`);
  }
  const home = skillsHome(ctx);
  if (!home) throw new Error(`Could not find your home folder to copy the skill into${reason ? ` (skills installer: ${reason})` : ""}.`);
  const targets = copyTargets(home);
  for (const target of targets) {
    await mkdir4(dirname4(target), { recursive: true });
    await cp(source, target, { recursive: true, force: true });
  }
  return remember({ method: "copy", path: targets[0], agents: targets.map((target) => dirname4(dirname4(target))) });
}

// src/cli/commands/shared.ts
var credentialsFile = (ctx) => credentialsPath({ env: ctx.env });
async function requireCredentials(ctx) {
  try {
    return await loadCredentials(credentialsFile(ctx));
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new CliError(error.message, error.hint, error.message === "Not logged in." ? EXIT_NOT_LOGGED_IN : 1);
    }
    throw error;
  }
}
async function loadMachineConnectorConfig(ctx, explicitPath) {
  const explicit = explicitPath ?? ctx.env.PEERBAND_CONNECTOR_CONFIG;
  return explicit ? loadConnectorConfig(resolve2(explicit)) : loadConnectorConfig(connectorConfigPath({ env: ctx.env }), { optional: true });
}
function writesEnabled(config, flags = {}) {
  if (flags.readOnly) return false;
  if (flags.enableWrites) return true;
  return config.enableWrites !== false;
}
var SKILL_COMMAND = "peerband skill";
function printSkillTip(ctx) {
  if (skillInstalled(ctx)) return;
  ctx.out.print(ctx.out.stdout.dim(`Give your coding agents the PeerBand skill: ${SKILL_COMMAND}`));
}
var describeMachine = (credentials) => credentials.machineName ?? credentials.installationId;
function printMcpHint(ctx, serverUrl) {
  const s = ctx.out.stdout;
  let url;
  try {
    url = mcpUrlFor(serverUrl, ctx.env);
  } catch {
    return;
  }
  ctx.out.print("");
  ctx.out.print(`${s.bold("MCP server")}  ${s.cyan(url)}`);
  ctx.out.print(
    s.dim("Add it as a custom connector in ChatGPT or Claude (or any MCP client with remote servers), then sign in and approve access.")
  );
  ctx.out.print(s.dim(`Claude Code: claude mcp add --transport http peerband ${url}`));
}

// src/cli/commands/connect.ts
function clock(date = /* @__PURE__ */ new Date()) {
  return date.toTimeString().slice(0, 8);
}
function connectionLine(s, state, server, machine) {
  switch (state) {
    case "connected":
      return `${s.green(symbols.dot)} Connected to ${server} as ${s.bold(machine)}`;
    case "connecting":
      return `${s.dim(symbols.ring)} Connecting to ${server}...`;
    case "reconnecting":
      return `${s.yellow(symbols.dot)} Connection lost; reconnecting...`;
    case "remote-unavailable":
      return `${s.yellow(symbols.dot)} PeerBand is unreachable; retrying...`;
    case "unavailable":
      return `${s.yellow(symbols.dot)} Herdr is unavailable; requests will fail until it is back`;
    case "revoked":
      return `${s.red(symbols.dot)} Access was revoked or rejected`;
  }
}
function shortTarget(target, width = 18) {
  if (target.length <= width) return target;
  const keep = width - 1;
  const head = Math.ceil(keep / 2);
  return `${target.slice(0, head)}\u2026${target.slice(target.length - (keep - head))}`;
}
function activityLine(s, activity, at = /* @__PURE__ */ new Date()) {
  const outcome = activity.outcome === "success" ? s.green(activity.outcome) : activity.outcome === "error" || activity.outcome === "runtime-unavailable" ? s.red(activity.outcome) : s.yellow(activity.outcome);
  const target = activity.target ? shortTarget(sanitize(activity.target)) : "-";
  return `${s.dim(clock(at))}  ${sanitize(activity.tool).padEnd(18)} ${target.padEnd(18)} ${outcome}${" ".repeat(Math.max(0, 20 - activity.outcome.length))} ${s.dim(`${Math.round(activity.latencyMs)} ms`)}`;
}
var spec = {
  name: "connect",
  summary: "Run the connector in the foreground",
  usage: "peerband connect [--runtime herdr|mock] [--read-only] [--config PATH] [--server URL]",
  description: 'Connects this machine to PeerBand and serves agent requests from your MCP clients until you press Ctrl+C. MCP clients may send messages to agents by default, but only after you approve the agents:message consent when you connect them; pass --read-only (or set "enableWrites": false in connector.json) to make this machine read-only. Activity lines show metadata only (tool, target, outcome, latency), never message or output content. Most people use `peerband relay` instead, which runs the connector inside Herdr.',
  options: [
    { name: "runtime", type: "string", valueName: "herdr|mock", description: 'Agent runtime. Default: $PEERBAND_RUNTIME or herdr. "mock" serves fake agents for testing.' },
    { name: "read-only", type: "boolean", description: 'Do not allow MCP clients to send messages to agents on this machine (also: "enableWrites": false in connector.json).' },
    { name: "enable-writes", type: "boolean", description: "Redundant: sending messages is allowed by default. Kept so old scripts keep working." },
    { name: "config", type: "string", valueName: "PATH", description: "Connector config file. Default: $PEERBAND_CONNECTOR_CONFIG or connector.json in the config directory (optional)." },
    { name: "server", type: "string", valueName: "URL", description: "Override the server stored at login." },
    { name: "managed", type: "boolean", hidden: true, description: "Internal: run under the Herdr plugin supervisor over IPC." }
  ],
  examples: [
    ["peerband connect", "Serve until Ctrl+C; messages to agents are allowed (with OAuth consent)"],
    ["peerband connect --read-only", "Never let MCP clients send messages to agents from this machine"],
    ["peerband connect --runtime mock", "Try the connection with fake agents"]
  ],
  async run(parsed, ctx) {
    return connect(
      {
        runtime: str(parsed, "runtime"),
        enableWrites: flag(parsed, "enable-writes"),
        readOnly: flag(parsed, "read-only"),
        config: str(parsed, "config"),
        server: str(parsed, "server"),
        managed: flag(parsed, "managed")
      },
      ctx
    );
  }
};
function notifyRequest(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return void 0;
  const value = message;
  if (value.type !== "peerband:notify" || typeof value.id !== "string" || value.id.length > 128) return void 0;
  return { id: value.id, text: value.text, paneId: value.paneId };
}
function startMockStatusCycle(adapter, env) {
  const interval = Number(env.PEERBAND_MOCK_STATUS_INTERVAL_MS);
  if (!Number.isSafeInteger(interval) || interval < 50) return () => void 0;
  const timer = setInterval(() => {
    void adapter.listAgents().then(([first]) => {
      if (first) adapter.setStatus(first.id, first.status === "working" ? "idle" : "working");
    });
  }, interval);
  timer.unref();
  return () => clearInterval(timer);
}
function isShutdownMessage(message) {
  return Boolean(message) && typeof message === "object" && !Array.isArray(message) && Object.keys(message).length === 1 && message.type === "peerband:shutdown";
}
async function connect(options, ctx) {
  const runtime = options.runtime ?? ctx.env.PEERBAND_RUNTIME ?? "herdr";
  if (runtime !== "herdr" && runtime !== "mock") throw new UsageError(`Unknown runtime "${runtime}".`, "Use --runtime herdr or --runtime mock.");
  const credentials = await requireCredentials(ctx);
  if (options.server) credentials.serverUrl = validateServerUrl(options.server);
  if (options.readOnly && options.enableWrites) throw new UsageError("--read-only and --enable-writes contradict each other.", "Use --read-only to turn messaging off; messaging is on by default.");
  const config = await loadMachineConnectorConfig(ctx, options.config);
  const enableWrites = writesEnabled(config, { readOnly: options.readOnly, enableWrites: options.enableWrites });
  const managed = Boolean(options.managed);
  const s = ctx.out.stderr;
  const machine = describeMachine(credentials);
  const adapter = runtime === "mock" ? new MockRuntime() : new HerdrAdapter(config.herdr ?? {});
  const core = new ConnectorCore(adapter, {
    writesEnabled: enableWrites,
    labelMessages: true,
    allowedAgents: config.allowedAgents,
    allowedWorkspaces: config.allowedWorkspaces,
    receiptPath: config.stateDirectory ? resolve3(config.stateDirectory, "receipts.json") : receiptsPath({ env: ctx.env }),
    // A lock left by a connector that died (or by an older version without a pid) is reclaimed instead of refusing forever.
    lockIsStale: async (lockDir, ownerFile) => (await inspectLock2({ lockDir, ownerFile, processPattern: CONNECTOR_PATTERN2 })).state === "stale",
    onLockReclaimed: (message) => ctx.out.warn(ctx.out.stderr.dim(`peerband: ${message}`))
  });
  const events = new ConnectorEvents(adapter, {
    allowedAgents: config.allowedAgents,
    allowedWorkspaces: config.allowedWorkspaces,
    log: (message) => {
      if (!managed) ctx.out.warn(s.dim(`  ${sanitize(message)}`));
    }
  });
  const stopMockCycle = adapter instanceof MockRuntime ? startMockStatusCycle(adapter, ctx.env) : () => void 0;
  const abort = new AbortController();
  let signalled;
  const onSignal = (signal) => {
    signalled ??= signal;
    abort.abort();
  };
  const onSigint = () => onSignal("SIGINT");
  const onSigterm = () => onSignal("SIGTERM");
  const onDisconnect = () => abort.abort();
  const onMessage = (message) => {
    if (isShutdownMessage(message)) abort.abort();
    const notify2 = notifyRequest(message);
    if (notify2) {
      void events.notify(notify2).then(
        (result) => process.send?.({ type: "peerband:notify-result", id: notify2.id, ok: true, ...result }),
        (error) => process.send?.({
          type: "peerband:notify-result",
          id: notify2.id,
          ok: false,
          code: error instanceof ConnectError ? error.code : "runtime_error",
          message: error instanceof ConnectError ? error.message : "The note could not be sent.",
          nextStep: error instanceof ConnectError ? error.nextStep : void 0
        })
      );
    }
  };
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  const ipc = managed && Boolean(process.connected);
  if (ipc) {
    process.on("message", onMessage);
    process.once("disconnect", onDisconnect);
  }
  const sendPaneEvent = (event) => {
    if (ipc && process.connected) process.send?.({ type: "peerband:pane-event", ...event });
  };
  let lastState;
  let shown;
  const showState = (state) => {
    if (managed || shown === state) return;
    shown = state;
    ctx.out.warn(connectionLine(s, state, credentials.serverUrl, machine));
  };
  try {
    await core.initialize();
    events.start();
    if (!managed) {
      ctx.out.warn(
        `${s.bold("peerband")} ${s.dim(`${runtime} runtime, ${enableWrites ? "messages allowed" : "read-only"}. Press Ctrl+C to stop.`)}`
      );
    }
    await runRemoteClient(core, credentials, {
      signal: abort.signal,
      events,
      onStatus: (message) => {
        if (!managed) ctx.out.warn(s.dim(`  ${sanitize(message)}`));
      },
      onConnectionState: (state) => {
        lastState = state;
        sendPaneEvent({ kind: "connection", state });
        showState(state);
      },
      onActivity: (activity) => {
        if (activity.outcome === "runtime-unavailable") {
          lastState = "unavailable";
          sendPaneEvent({ kind: "connection", state: "unavailable" });
          showState("unavailable");
        } else if (activity.outcome === "success") {
          lastState = "connected";
          sendPaneEvent({ kind: "connection", state: "connected" });
          showState("connected");
        }
        sendPaneEvent({ kind: "activity", ...activity });
        if (!managed) ctx.out.warn(activityLine(s, activity));
      }
    });
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    process.off("message", onMessage);
    process.off("disconnect", onDisconnect);
    stopMockCycle();
    events.close();
    await core.close();
    await adapter.close?.();
    if (ipc && process.connected) process.disconnect();
  }
  if (!abort.signal.aborted && lastState === "revoked") {
    throw new CliError("PeerBand rejected this machine's credential (it may have been revoked).", "Run `peerband login` again to sign in.");
  }
  if (!managed) ctx.out.warn(`${s.dim(symbols.ring)} Disconnected.`);
  return signalled === "SIGINT" && !managed ? 130 : 0;
}

// src/cli/commands/herdr.ts
import { mkdir as mkdir5, rm as rm6, writeFile as writeFile6 } from "node:fs/promises";
import { statSync } from "node:fs";
import { join as join9, resolve as resolve4 } from "node:path";

// src/cli/commands/herdr-check.ts
import { readFile as readFile8, stat as stat4 } from "node:fs/promises";
import { join as join7 } from "node:path";
var PLUGIN_ID = "peerband";
var REPAIR_COMMAND = "peerband herdr install";
var UPDATE_COMMAND = "peerband update";
var fixCommand = (problem) => problem?.code === "version-mismatch" ? UPDATE_COMMAND : REPAIR_COMMAND;
async function pluginInstalled(ctx) {
  const result = await ctx.runHerdr(["plugin", "list"], { timeoutMs: 1e4 });
  if (result.notFound) return { found: false, installed: false, source: null };
  if (result.code !== 0) return { found: true, installed: false, source: null, detail: failureDetail(result) };
  const line = /^\s*-\s+peerband\s.*$/m.exec(result.stdout)?.[0];
  if (line === void 0) return { found: true, installed: false, source: null };
  const source = /\[([^\]]*)\]\s*$/.exec(line)?.[1]?.trim() || null;
  return { found: true, installed: true, source };
}
function herdrVersion(output) {
  return /\d+\.\d+\.\d+(?:[-+.\w]*)?/.exec(output)?.[0] ?? null;
}
async function readSettings(ctx) {
  const dir = await ctx.runHerdr(["plugin", "config-dir", PLUGIN_ID], { timeoutMs: 1e4 });
  const configDir = dir.code === 0 ? dir.stdout.trim() : "";
  if (!configDir) return null;
  try {
    const value = JSON.parse(await readFile8(join7(configDir, "settings.json"), "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
async function isFile(path) {
  try {
    return (await stat4(path)).isFile();
  } catch {
    return false;
  }
}
function sourceRef(source) {
  const at = source.lastIndexOf("@");
  return at > 0 ? source.slice(at + 1) || null : null;
}
async function checkHerdrPlugin(ctx) {
  const version = await ctx.runHerdr(["--version"], { timeoutMs: 1e4 });
  if (version.notFound) return { found: false, herdrVersion: null, installed: false, source: null, problems: [] };
  const herdrV = version.code === 0 ? herdrVersion(`${version.stdout} ${version.stderr}`) : null;
  const listed = await pluginInstalled(ctx);
  if (listed.detail) return { found: true, herdrVersion: herdrV, installed: false, source: null, detail: listed.detail, problems: [] };
  if (!listed.installed) {
    return { found: true, herdrVersion: herdrV, installed: false, source: null, problems: [{ code: "not-installed", message: "The PeerBand plugin is not installed in Herdr." }] };
  }
  const problems = [];
  const source = listed.source;
  const override = Boolean(ctx.env.PEERBAND_HERDR_SOURCE);
  if (source?.startsWith("local:")) {
    if (!override) problems.push({ code: "local-source", message: `The plugin is linked to a local checkout (${source.slice("local:".length)}), not the v${ctx.version} release.` });
  } else if (source !== null && !override) {
    const expected = ctx.env.PEERBAND_HERDR_REF || `v${ctx.version}`;
    const ref = sourceRef(source);
    if (ref !== expected) {
      problems.push({ code: "version-mismatch", message: `The plugin is ${ref ? `at ${ref}` : "not pinned to a version"}, but this CLI is ${expected}.` });
    }
  } else if (source !== null && ctx.env.PEERBAND_HERDR_REF) {
    const ref = sourceRef(source);
    if (ref !== ctx.env.PEERBAND_HERDR_REF) problems.push({ code: "version-mismatch", message: `The plugin is at ${ref ?? "no ref"}, but PEERBAND_HERDR_REF is ${ctx.env.PEERBAND_HERDR_REF}.` });
  }
  const settings = await readSettings(ctx);
  const current = configHome({ env: ctx.env });
  const fallback = configHome({ env: { ...ctx.env, PEERBAND_CONFIG_HOME: void 0 } });
  const recorded = settings && typeof settings.configHome === "string" && settings.configHome ? settings.configHome : fallback;
  if (settings && canonicalConfig2(recorded) !== canonicalConfig2(current)) {
    const shown = typeof settings.configHome === "string" && settings.configHome ? settings.configHome : `${fallback} (default)`;
    problems.push({ code: "config-home", message: `The plugin uses the config directory ${shown}, but this CLI uses ${current}.` });
  }
  const nodePath = settings?.nodePath;
  if (typeof nodePath !== "string" || !nodePath) {
    problems.push({ code: "node-path", message: "The plugin settings do not record a Node.js path." });
  } else if (!await isFile(nodePath)) {
    problems.push({ code: "node-path", message: `The Node.js recorded in the plugin settings no longer exists (${nodePath}).` });
  }
  return { found: true, herdrVersion: herdrV, installed: true, source, problems };
}

// src/cli/plugin-replace.ts
var PLUGIN_ID2 = "peerband";
var RETRYABLE = /os error (?:5|32|33)\b|code: (?:5|32|33)\b|being used by another process|\bEBUSY\b|\bEPERM\b|\bEACCES\b|access is denied|resource busy|text file busy|directory not empty/i;
var ALREADY_INSTALLED = /already (?:installed|exists|registered)|exists already/i;
var RETRY_DELAYS_MS = [1e3, 2e3, 4e3, 8e3];
function parseSource(source) {
  if (!source) return null;
  if (source.startsWith("local:")) return { kind: "local", dir: source.slice("local:".length) };
  const match = /^(?:github:)?([^@\s]+\/[^@\s]+)@([^@\s]+)$/.exec(source);
  return match ? { kind: "github", source: match[1], ref: match[2] } : null;
}
function describeTarget(target) {
  return target.kind === "local" ? `local checkout ${target.dir}` : `${target.source} @ ${target.ref}`;
}
function installCommand(target) {
  return target.kind === "local" ? `herdr plugin link ${target.dir}` : `herdr plugin install ${target.source} --ref ${target.ref} --yes`;
}
async function herdrRetrying(ctx, args, timeoutMs) {
  const sleep = ctx.sleep ?? ((ms) => new Promise((resolve5) => setTimeout(resolve5, ms)));
  let result = await ctx.runHerdr(args, { timeoutMs });
  for (const delay of RETRY_DELAYS_MS) {
    if (result.code === 0 || result.notFound || !RETRYABLE.test(failureDetail(result))) return result;
    ctx.out.print(ctx.out.stdout.dim(`Herdr reports the plugin files are still in use; retrying in ${delay / 1e3}s\u2026`));
    await sleep(delay);
    result = await ctx.runHerdr(args, { timeoutMs });
  }
  return result;
}
function putPlugin(ctx, target) {
  return target.kind === "local" ? herdrRetrying(ctx, ["plugin", "link", target.dir], 6e4) : herdrRetrying(ctx, ["plugin", "install", target.source, "--ref", target.ref, "--yes"], 18e4);
}
async function removePlugin(ctx) {
  const uninstall = await herdrRetrying(ctx, ["plugin", "uninstall", PLUGIN_ID2], 6e4);
  if (uninstall.code === 0) return { removed: true, detail: "" };
  const unlink3 = await herdrRetrying(ctx, ["plugin", "unlink", PLUGIN_ID2], 6e4);
  if (unlink3.code === 0) return { removed: true, detail: "" };
  return { removed: false, detail: failureDetail(uninstall) };
}
var ReplaceError = class extends CliError {
  restored;
  constructor(message, hint, restored) {
    super(message, hint);
    this.restored = restored;
  }
};
async function rollback(ctx, previous, target, detail) {
  const check = target.kind === "github" ? `Check that ${target.source} at ref ${target.ref} exists and that you are online (override with PEERBAND_HERDR_SOURCE or PEERBAND_HERDR_REF). ` : "Check that the directory is a peerband-cli checkout containing herdr-plugin.toml. ";
  const retry = `${check}Close every PeerBand Relay tab and retry \`peerband herdr install\`; if it keeps failing, run \`${installCommand(target)}\` yourself.`;
  if (!previous) throw new ReplaceError(`Installing the PeerBand plugin (${describeTarget(target)}) failed: ${detail}`, retry, false);
  ctx.out.print(ctx.out.stdout.dim(`Installing ${describeTarget(target)} failed; restoring the previous plugin (${describeTarget(previous)}).`));
  const restored = await putPlugin(ctx, previous);
  if (restored.code === 0 && (await pluginInstalled(ctx)).installed) {
    throw new ReplaceError(`Installing the PeerBand plugin (${describeTarget(target)}) failed: ${detail}. The previous plugin (${describeTarget(previous)}) was restored.`, retry, true);
  }
  throw new ReplaceError(
    `Installing the PeerBand plugin (${describeTarget(target)}) failed: ${detail}. Restoring the previous plugin failed too: ${failureDetail(restored)}. Herdr has no PeerBand plugin right now.`,
    `Close every PeerBand Relay tab, then run \`${installCommand(target)}\` (or \`${installCommand(previous)}\` for the previous version), then \`peerband herdr install\`.`,
    false
  );
}
async function replacePlugin(ctx, previousSource, installed, target) {
  const previous = installed ? parseSource(previousSource) : null;
  if (!installed) {
    const result2 = await putPlugin(ctx, target);
    if (result2.code !== 0) await rollback(ctx, null, target, failureDetail(result2));
    return;
  }
  if (target.kind === "github" && previous?.kind !== "local") {
    const result2 = await putPlugin(ctx, target);
    if (result2.code === 0) return;
    const detail = failureDetail(result2);
    if (!ALREADY_INSTALLED.test(detail)) {
      if ((await pluginInstalled(ctx)).installed) {
        throw new ReplaceError(
          `Installing the PeerBand plugin (${describeTarget(target)}) failed: ${detail}. The previous plugin${previousSource ? ` (${previousSource})` : ""} is still installed.`,
          `Check that ${target.source} at ref ${target.ref} exists and that you are online. Override with PEERBAND_HERDR_SOURCE or PEERBAND_HERDR_REF.`,
          true
        );
      }
      await rollback(ctx, previous, target, detail);
    }
  }
  const removed = await removePlugin(ctx);
  if (!removed.removed) {
    throw new ReplaceError(`Could not replace the existing PeerBand plugin: ${removed.detail}`, `Close every PeerBand Relay tab, run \`herdr plugin uninstall ${PLUGIN_ID2}\` yourself, then retry.`, true);
  }
  const result = await putPlugin(ctx, target);
  if (result.code !== 0) await rollback(ctx, previous, target, failureDetail(result));
}

// src/cli/relay-maint.ts
import { rm as rm5 } from "node:fs/promises";
import { join as join8 } from "node:path";

// src/cli/control.ts
import { readFile as readFile9 } from "node:fs/promises";
import { createConnection as createConnection4 } from "node:net";
async function requestControl(command, env, timeoutMs = 3e3) {
  return exchange({ command }, env, timeoutMs);
}
var ControlUnavailable = class extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
    this.name = "ControlUnavailable";
  }
  reason;
};
async function requestNotify(note, env, timeoutMs = 8e3) {
  return exchange({ command: "notify", text: note.text, ...note.paneId ? { paneId: note.paneId } : {} }, env, timeoutMs, true);
}
async function exchange(payload, env, timeoutMs, typed = false) {
  const config = configHome({ env });
  let record;
  try {
    record = JSON.parse(await readFile9(ownerRecordPath2(config), "utf8"));
  } catch (error) {
    if (typed) throw new ControlUnavailable("not-running", "No relay helper is running");
    throw error;
  }
  if (typeof record.token !== "string") throw typed ? new ControlUnavailable("not-running", "Invalid helper record") : new Error("Invalid helper record");
  const socket = createConnection4(controlChannel2(config));
  return new Promise((resolve5, reject) => {
    let text2 = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve5(value ?? {});
    };
    let connected = false;
    const timer = setTimeout(() => finish(typed ? new ControlUnavailable("timeout", "Helper control timeout") : new Error("Helper control timeout")), timeoutMs);
    socket.once("error", (error) => finish(typed ? new ControlUnavailable(connected ? "closed" : "not-running", error.message) : error));
    socket.once("connect", () => {
      connected = true;
      socket.write(`${JSON.stringify({ token: record.token, ...payload })}
`);
    });
    socket.on("data", (chunk) => {
      text2 += chunk.toString();
      if (text2.length > 65536) return finish(new Error("Invalid control response"));
      const newline = text2.indexOf("\n");
      if (newline < 0) return;
      try {
        finish(void 0, JSON.parse(text2.slice(0, newline)));
      } catch (error) {
        finish(error);
      }
    });
    socket.once("end", () => finish(typed ? new ControlUnavailable("closed", "Helper control closed") : new Error("Helper control closed")));
  });
}
async function relaySnapshot(env) {
  try {
    const live = await requestControl("status", env);
    return { ...createPaneSnapshot2(live), source: "control" };
  } catch {
  }
  try {
    const saved = JSON.parse(await readFile9(relayStatePath({ env }), "utf8"));
    return { ...fallbackPaneSnapshot2(saved), source: "file" };
  } catch {
    return void 0;
  }
}
async function stopRelay(env) {
  try {
    await requestControl("stop", env);
    return true;
  } catch {
    return false;
  }
}

// src/cli/relay-maint.ts
var RELAY_MARKER = "peerband_relay";
var RELAY_LABEL = /^PeerBand Relay\b/;
var defaultSleep2 = (ms) => new Promise((resolve5) => setTimeout(resolve5, ms));
var sleeper = (ctx) => ctx.sleep ?? defaultSleep2;
async function relayRunning(ctx) {
  const snapshot = await relaySnapshot(ctx.env);
  return snapshot?.source === "control" && snapshot.state === "running";
}
async function findRelayPanes(ctx) {
  const result = await ctx.runHerdr(["pane", "list"], { timeoutMs: 1e4 });
  if (result.code !== 0) return [];
  let panes;
  try {
    const parsed = JSON.parse(result.stdout);
    panes = parsed.result?.panes ?? parsed.panes;
  } catch {
    return [];
  }
  if (!Array.isArray(panes)) return [];
  const found = [];
  for (const pane of panes) {
    if (!pane || typeof pane.pane_id !== "string") continue;
    const tokens = pane.tokens && typeof pane.tokens === "object" ? pane.tokens : {};
    const label = typeof pane.label === "string" ? pane.label : void 0;
    if (typeof tokens[RELAY_MARKER] === "string" || label && RELAY_LABEL.test(label)) found.push({ paneId: pane.pane_id, label });
  }
  return found;
}
async function closeRelayPanes(ctx, panes, waitMs = 8e3) {
  let closed = 0;
  for (const pane of panes) {
    const viaPlugin = await ctx.runHerdr(["plugin", "pane", "close", pane.paneId], { timeoutMs: 1e4 });
    if (viaPlugin.code === 0) {
      closed++;
      continue;
    }
    const plain = await ctx.runHerdr(["pane", "close", pane.paneId], { timeoutMs: 1e4 });
    if (plain.code === 0) closed++;
  }
  const ids = new Set(panes.map((pane) => pane.paneId));
  const sleep = sleeper(ctx);
  for (let waited = 0; ids.size > 0 && waited < waitMs; waited += 250) {
    const remaining = await findRelayPanes(ctx);
    if (!remaining.some((pane) => ids.has(pane.paneId))) break;
    await sleep(250);
  }
  await rm5(relayTabPath({ env: ctx.env }), { force: true }).catch(() => void 0);
  return closed;
}
async function stopRelayAndWait(ctx, waitMs = 1e4) {
  const stopped = await stopRelay(ctx.env);
  if (!stopped) return false;
  const channel = controlChannel2(configHome({ env: ctx.env }));
  const sleep = sleeper(ctx);
  for (let waited = 0; waited < waitMs; waited += 200) {
    if (await probeChannel2(channel, 1e3) === "absent") break;
    await sleep(200);
  }
  return true;
}
async function cleanRelayState(ctx, options = {}) {
  const config = configHome({ env: ctx.env });
  const report2 = { reclaimed: [], held: [], removedState: false };
  const helper = await reclaimIfStale2({ lockDir: lockPath({ env: ctx.env }), ownerFile: ownerRecordPath2(config), channel: controlChannel2(config), processPattern: SUPERVISOR_PATTERN2 });
  if (helper.reclaimed) report2.reclaimed.push(lockPath({ env: ctx.env }));
  else if (helper.verdict.state === "live") report2.held.push({ lock: lockPath({ env: ctx.env }), reason: helper.verdict.reason });
  const receiptsLock = `${receiptsPath({ env: ctx.env })}.lock`;
  const receipts = await reclaimIfStale2({ lockDir: receiptsLock, ownerFile: join8(receiptsLock, "owner"), processPattern: CONNECTOR_PATTERN2 });
  if (receipts.reclaimed) report2.reclaimed.push(receiptsLock);
  else if (receipts.verdict.state === "live") report2.held.push({ lock: receiptsLock, reason: receipts.verdict.reason });
  const helperGone = helper.verdict.state !== "live";
  if (helperGone) {
    if (options.remove) {
      await rm5(relayStatePath({ env: ctx.env }), { force: true }).catch(() => void 0);
      await rm5(relayTabPath({ env: ctx.env }), { force: true }).catch(() => void 0);
      report2.removedState = true;
    } else {
      report2.removedState = await resetRelayState2(relayStatePath({ env: ctx.env })).catch(() => false);
    }
  }
  return report2;
}

// src/cli/commands/herdr.ts
var DEFAULT_SOURCE = "kshvidler/peerband-cli";
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
async function herdr(ctx, args, timeoutMs) {
  const result = await ctx.runHerdr(args, { timeoutMs });
  if (result.notFound) throw new CliError(NOT_FOUND_MESSAGE, NOT_FOUND_HINT);
  return result;
}
function must(result, what, hint) {
  if (result.code !== 0) throw new CliError(`${what} failed: ${failureDetail(result)}`, hint);
  return result;
}
function pluginSettings(env) {
  return {
    nodePath: process.execPath,
    ...env.PEERBAND_CONFIG_HOME ? { configHome: env.PEERBAND_CONFIG_HOME } : {}
  };
}
function reportCleanup(ctx, report2) {
  const s = ctx.out.stdout;
  if (report2.reclaimed.length) ctx.out.print(`${s.green(symbols.ok)} Cleared ${report2.reclaimed.length === 1 ? "a stale relay lock" : `${report2.reclaimed.length} stale relay locks`} left by a process that is no longer running.`);
  for (const held of report2.held) ctx.out.warn(`${ctx.out.stderr.yellow(symbols.warn)} ${held.lock} is still held: ${held.reason}.`);
}
async function releasePlugin(ctx) {
  const s = ctx.out.stdout;
  const wasRunning = await relayRunning(ctx);
  const panes = await findRelayPanes(ctx);
  if (await stopRelayAndWait(ctx)) ctx.out.print(`${s.green(symbols.ok)} Stopped the PeerBand Relay.`);
  if (panes.length) {
    const closed = await closeRelayPanes(ctx, panes);
    ctx.out.print(`${s.green(symbols.ok)} Closed ${closed === 1 ? "the PeerBand Relay tab" : `${closed} PeerBand Relay tabs`}.`);
  }
  return { wasRunning, hadPanes: panes.length > 0 };
}
async function waitForRelay(ctx, timeoutMs) {
  const sleep = ctx.sleep ?? ((ms) => new Promise((resolve5) => setTimeout(resolve5, ms)));
  for (let waited = 0; waited < timeoutMs; waited += 1e3) {
    if (await relayRunning(ctx)) return true;
    await sleep(1e3);
  }
  return relayRunning(ctx);
}
async function reopenRelay(ctx) {
  const s = ctx.out.stdout;
  const open = ctx.openRelayTab ?? openRelayTab2;
  const attempt = async () => {
    try {
      await open();
      return true;
    } catch (error) {
      ctx.out.warn(`${ctx.out.stderr.yellow(symbols.warn)} Could not reopen the PeerBand Relay tab: ${error.message}`);
      return false;
    }
  };
  if (!await attempt()) {
    ctx.out.print(`${s.dim("Next:")} peerband relay`);
    return false;
  }
  if (ctx.openRelayTab || await waitForRelay(ctx, 3e4)) {
    ctx.out.print(`${s.green(symbols.ok)} Reopened the PeerBand Relay tab.`);
    return true;
  }
  ctx.out.print(s.dim("The relay did not start yet; reopening the Relay tab once more."));
  await stopRelayAndWait(ctx);
  await closeRelayPanes(ctx, await findRelayPanes(ctx));
  if (await attempt() && await waitForRelay(ctx, 45e3)) {
    ctx.out.print(`${s.green(symbols.ok)} Reopened the PeerBand Relay tab.`);
    return true;
  }
  ctx.out.warn(`${ctx.out.stderr.yellow(symbols.warn)} The PeerBand Relay tab is open, but the relay has not started. Check the tab, or run \`peerband status\`.`);
  return false;
}
async function installPlugin(ctx, options = {}) {
  const s = ctx.out.stdout;
  const source = ctx.env.PEERBAND_HERDR_SOURCE || DEFAULT_SOURCE;
  const ref = ctx.env.PEERBAND_HERDR_REF || `v${ctx.version}`;
  const target = isDirectory(source) ? { kind: "local", dir: resolve4(source) } : { kind: "github", source, ref };
  const before = await pluginInstalled(ctx);
  if (!before.found) throw new CliError(NOT_FOUND_MESSAGE, NOT_FOUND_HINT);
  if (before.detail) throw new CliError(`Herdr could not list plugins: ${before.detail}`, "Check that your Herdr is 0.9.3 or newer (`herdr --version`).");
  const loggedIn = await loadCredentials(credentialsFile(ctx)).then(() => true, () => false);
  const held = await releasePlugin(ctx);
  reportCleanup(ctx, await cleanRelayState(ctx));
  const restore = loggedIn && (held.wasRunning || held.hadPanes);
  if (before.installed) ctx.out.print(s.dim(`Replacing the PeerBand plugin${before.source ? ` (${before.source})` : ""} with ${describeTarget(target)}.`));
  try {
    await replacePlugin(ctx, before.source, before.installed, target);
  } catch (error) {
    if (error instanceof ReplaceError && error.restored && restore) await reopenRelay(ctx);
    throw error;
  }
  ctx.out.print(`${s.green(symbols.ok)} ${target.kind === "local" ? `Linked the PeerBand plugin from ${target.dir}` : `Installed the PeerBand plugin (${target.source} @ ${target.ref})`}`);
  const dirResult = must(await herdr(ctx, ["plugin", "config-dir", PLUGIN_ID2]), "herdr plugin config-dir", "The plugin may not have registered; run `herdr plugin list`.");
  const configDir = dirResult.stdout.trim();
  if (!configDir) throw new CliError("Herdr did not report a plugin config directory.", "Run `herdr plugin config-dir peerband` to investigate.");
  await mkdir5(configDir, { recursive: true });
  await writeFile6(join9(configDir, "settings.json"), `${JSON.stringify(pluginSettings(ctx.env), null, 2)}
`, { mode: 384 });
  ctx.out.print(`${s.green(symbols.ok)} Saved plugin settings ${s.dim(`(node ${process.execPath})`)}`);
  const after = await pluginInstalled(ctx);
  if (!after.installed) throw new CliError("Herdr does not list the PeerBand plugin after installing it.", "Run `herdr plugin list` and check the output above for errors.");
  if (restore) {
    await reopenRelay(ctx);
  } else if (options.relayNext !== false) {
    ctx.out.print(`${s.dim("Next:")} ${loggedIn ? "peerband relay" : "peerband login, then peerband relay"}`);
  }
  if (options.afterUpdate) ctx.out.print(`${s.green(symbols.ok)} PeerBand ${ctx.version} is ready.`);
  return 0;
}
var installSpec = {
  name: "herdr install",
  summary: "Install the PeerBand plugin into Herdr",
  usage: "peerband herdr install",
  description: "Installs (or updates) the PeerBand plugin in Herdr and records which Node.js to run it with, so the plugin works even if Herdr finds a different `node` on its PATH. Run it from a shell with Node.js 22.13 or newer.\nBefore replacing a plugin it stops the PeerBand Relay and closes its tabs (they keep the plugin files open), clears stale relay locks, and afterwards reopens the Relay tab if it was open. If the new plugin cannot be installed, the previous one is put back.",
  options: [{ name: "after-update", type: "boolean", description: "Internal: final step of `peerband update`.", hidden: true }],
  examples: [
    ["peerband herdr install", "Install the release matching this CLI version"],
    ["PEERBAND_HERDR_REF=main peerband herdr install", "Install another branch, tag or commit"],
    ["PEERBAND_HERDR_SOURCE=./peerband-cli peerband herdr install", "Link a local checkout (build it first with npm run build)"]
  ],
  notes: [
    `Environment: PEERBAND_HERDR_SOURCE (default ${DEFAULT_SOURCE}; an existing directory is linked instead of installed), PEERBAND_HERDR_REF (default v<version>), HERDR_BIN_PATH (used to find Herdr).`,
    "To update the CLI and the plugin together, use `peerband update`."
  ],
  run: (parsed, ctx) => installPlugin(ctx, { afterUpdate: flag(parsed, "after-update") })
};
var uninstallSpec = {
  name: "herdr uninstall",
  summary: "Remove the PeerBand plugin from Herdr",
  usage: "peerband herdr uninstall",
  description: "Stops the PeerBand Relay, closes its tabs, removes the plugin (uninstalls it, or unlinks a local checkout) and the plugin settings file written by install, and deletes the relay's local state (relay-state.json, relay-tab.json and locks left by processes that are no longer running). Your login is kept. Safe to run more than once.",
  options: [],
  examples: [["peerband herdr uninstall", "Remove the plugin"]],
  async run(_parsed, ctx) {
    const s = ctx.out.stdout;
    const state = await pluginInstalled(ctx);
    await releasePlugin(ctx);
    if (!state.found) {
      reportCleanup(ctx, await cleanRelayState(ctx, { remove: true }));
      throw new CliError(NOT_FOUND_MESSAGE, NOT_FOUND_HINT);
    }
    if (state.installed) {
      const dirResult = await herdr(ctx, ["plugin", "config-dir", PLUGIN_ID2]);
      const configDir = dirResult.code === 0 ? dirResult.stdout.trim() : "";
      const removed = await removePlugin(ctx);
      if (!removed.removed) throw new CliError(`Could not remove the PeerBand plugin: ${removed.detail}`, "Close every PeerBand Relay tab, then run `herdr plugin list` to see its state.");
      if (configDir) await rm6(join9(configDir, "settings.json"), { force: true }).catch(() => void 0);
      ctx.out.print(`${s.green(symbols.ok)} Removed the PeerBand plugin from Herdr.`);
    } else {
      ctx.out.print("The PeerBand plugin is not installed in Herdr; nothing to remove.");
    }
    const report2 = await cleanRelayState(ctx, { remove: true });
    reportCleanup(ctx, report2);
    if (report2.removedState && state.installed) ctx.out.print(s.dim("Deleted the local relay state. Your login is kept (`peerband logout` removes it)."));
    return 0;
  }
};
var groupSpec = {
  name: "herdr",
  summary: "Install or remove the PeerBand Herdr plugin",
  usage: "peerband herdr <install|uninstall>",
  description: "Manage the PeerBand plugin inside Herdr.",
  subcommands: [installSpec, uninstallSpec]
};

// src/cli/commands/login.ts
import { hostname as hostname3 } from "node:os";

// src/cli/browser.ts
import { spawn as spawn2 } from "node:child_process";
function browserDecision(url, context) {
  if (context.noBrowser) return { open: false, reason: "flag" };
  if (context.env.SSH_CONNECTION || context.env.SSH_TTY || context.env.SSH_CLIENT) return { open: false, reason: "ssh" };
  if (!context.stdoutIsTTY) return { open: false, reason: "not-a-tty" };
  if (context.platform === "linux" && !context.env.DISPLAY && !context.env.WAYLAND_DISPLAY) return { open: false, reason: "no-display" };
  try {
    if (!/^https?:$/.test(new URL(url).protocol)) return { open: false, reason: "unsafe-url" };
  } catch {
    return { open: false, reason: "unsafe-url" };
  }
  return { open: true };
}
function openerCommand(platform, url) {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") return { command: "rundll32", args: ["url.dll,FileProtocolHandler", url] };
  return { command: "xdg-open", args: [url] };
}
function openBrowser(url, platform = process.platform) {
  const { command, args } = openerCommand(platform, url);
  return new Promise((resolve5) => {
    try {
      const child = spawn2(command, args, { detached: true, stdio: "ignore", windowsHide: true, shell: false });
      child.once("error", () => resolve5(false));
      child.once("spawn", () => {
        child.unref();
        resolve5(true);
      });
    } catch {
      resolve5(false);
    }
  });
}

// src/cli/prompt.ts
var PromptAborted = class extends Error {
  constructor() {
    super("Prompt cancelled.");
    this.name = "PromptAborted";
  }
};
function askYesNo(stdin, stderr, prompt, defaultYes = true) {
  return new Promise((resolve5, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.pause();
    };
    const onData = (chunk) => {
      const text2 = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (text2.includes("") || text2.includes("")) {
        cleanup();
        return reject(new PromptAborted());
      }
      const end = text2.search(/[\r\n]/);
      value += end === -1 ? text2 : text2.slice(0, end);
      if (end === -1) return;
      cleanup();
      const answer = value.trim().toLowerCase();
      resolve5(answer === "" ? defaultYes : answer === "y" || answer === "yes");
    };
    stderr.write(prompt);
    stdin.resume();
    stdin.on("data", onData);
  });
}

// src/cli/commands/herdr-setup.ts
var HERDR_PLUGIN_MODES = ["ask", "install", "skip"];
async function herdrSetup(ctx, mode, options = {}) {
  const s = ctx.out.stdout;
  const relayNext = options.relayNext ?? true;
  const then = relayNext ? `  ${s.dim("then")}  peerband relay` : "";
  const manual = `${s.dim("Next:")} peerband herdr install${then}`;
  const state = await checkHerdrPlugin(ctx);
  if (!state.found) {
    ctx.out.print("");
    ctx.out.print(`${s.yellow(symbols.warn)} Herdr was not found. The PeerBand Relay tab needs Herdr 0.9.3 or newer.`);
    ctx.out.print("  1. Install Herdr: https://herdr.dev");
    ctx.out.print(`  2. ${s.bold("peerband herdr install")}  ${s.dim("then")}  ${s.bold(relayNext ? "peerband relay" : "peerband setup")}`);
    return "no-herdr";
  }
  if (state.installed && state.problems.length === 0) {
    if (relayNext) ctx.out.print(`${s.dim("Next:")} peerband relay  ${s.dim("(opens the PeerBand Relay tab in Herdr)")}`);
    return "ready";
  }
  const repair = state.installed;
  if (repair) {
    ctx.out.print("");
    ctx.out.print(`${s.yellow(symbols.warn)} The PeerBand plugin in Herdr needs repair: ${state.problems[0].message}`);
    if (state.problems.length > 1) ctx.out.print(s.dim(`  (${state.problems.length - 1} more problem${state.problems.length > 2 ? "s" : ""}; see \`peerband status\`)`));
  }
  let install = mode === "install";
  if (mode === "ask" && ctx.stdin.isTTY && ctx.stderr.isTTY) {
    try {
      install = await askYesNo(ctx.stdin, ctx.stderr, repair ? "Repair the PeerBand plugin now? [Y/n] " : "Add the PeerBand plugin to Herdr now? [Y/n] ");
    } catch (error) {
      if (!(error instanceof PromptAborted)) throw error;
      ctx.out.print(manual);
      return "not-ready";
    }
    if (!install) {
      ctx.out.print(s.dim(`Skipped. ${repair ? "Repair" : "Add"} it later with \`${REPAIR_COMMAND}\`, then open the relay with \`peerband relay\`.`));
      return "not-ready";
    }
  }
  if (!install) {
    ctx.out.print(manual);
    return "not-ready";
  }
  try {
    await installPlugin(ctx, { relayNext });
  } catch (error) {
    const message = error.message;
    ctx.out.warn(`${s.yellow(symbols.warn)} Could not ${repair ? "repair" : "add"} the PeerBand plugin${repair ? "" : " to Herdr"}: ${message}`);
    if (error instanceof CliError && error.hint) ctx.out.warn(`  ${error.hint}`);
    ctx.out.print(s.dim(`You are logged in. ${repair ? "Repair" : "Add"} the plugin later with \`peerband herdr install\`, then run \`peerband relay\`.`));
    return "not-ready";
  }
  return "ready";
}
async function ensureHerdrPlugin(ctx) {
  const check = await checkHerdrPlugin(ctx);
  if (!check.found || check.problems.length === 0) return;
  const s = ctx.out.stderr;
  const fix = `Run \`${fixCommand(check.problems[0])}\`, then \`peerband relay\`.`;
  const reasons = check.problems.map((problem) => problem.message);
  if (!(ctx.stdin.isTTY && ctx.stderr.isTTY)) throw new CliError(`The PeerBand Herdr plugin needs repair. ${reasons.join(" ")}`, fix);
  ctx.out.warn(`${s.yellow(symbols.warn)} The PeerBand plugin in Herdr needs repair: ${reasons[0]}`);
  if (reasons.length > 1) ctx.out.warn(s.dim(`  Also: ${reasons.slice(1).join(" ")}`));
  let repair;
  try {
    repair = await askYesNo(ctx.stdin, ctx.stderr, "Repair the PeerBand plugin now? [Y/n] ");
  } catch (error) {
    if (!(error instanceof PromptAborted)) throw error;
    repair = false;
  }
  if (!repair) throw new CliError(`The PeerBand Herdr plugin needs repair. ${reasons[0]}`, fix);
  await installSpec.run({ values: {}, positionals: [] }, ctx);
}

// src/cli/commands/login.ts
function reusableCredential(previous, serverUrl) {
  if (!previous) return void 0;
  try {
    return new URL(previous.serverUrl).origin === new URL(serverUrl).origin ? previous.credential : void 0;
  } catch {
    return void 0;
  }
}
async function persist(ctx, redeemed) {
  const credentials = { ...redeemed, enrolledAt: (/* @__PURE__ */ new Date()).toISOString() };
  await saveCredentials(credentials, credentialsFile(ctx));
  return credentials;
}
async function loginWithGrant(ctx, options) {
  let redeemed;
  try {
    redeemed = await redeemEnrollment(options.serverUrl, options.grant, options.name, ctx.fetch, options.previousCredential);
  } catch (error) {
    const message = error.message;
    const rejected = /could not be redeemed/i.test(message);
    throw new CliError(
      message,
      rejected ? "Create a new grant in your PeerBand dashboard (grants are short-lived and single-use), then run `peerband login --grant GRANT` again." : `Check your network connection and the server URL (${options.serverUrl}).`
    );
  }
  return persist(ctx, redeemed);
}
var SPINNER = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
var GRANT_HINT = "Use `peerband login --grant GRANT` (create a grant in the dashboard).";
async function loginWithBrowser(ctx, options) {
  const controller = new AbortController();
  const forward = () => controller.abort();
  let onSigint;
  if (ctx.signal) {
    if (ctx.signal.aborted) controller.abort();
    else ctx.signal.addEventListener("abort", forward, { once: true });
  } else {
    onSigint = forward;
    process.once("SIGINT", onSigint);
  }
  const s = ctx.out.stderr;
  const say = (line = "") => ctx.out.warn(line);
  let spinner;
  const stopSpinner = () => {
    if (!spinner) return;
    clearInterval(spinner);
    spinner = void 0;
    ctx.stderr.write("\r\x1B[2K");
  };
  try {
    const shared = { fetch: ctx.fetch, signal: controller.signal, ...ctx.sleep ? { sleep: ctx.sleep } : {}, ...ctx.now ? { now: ctx.now } : {} };
    let code;
    try {
      code = await requestDeviceCode(options.serverUrl, { clientVersion: ctx.version, machineName: options.name, platform: process.platform }, shared);
    } catch (error) {
      throw mapFailure(error, options.serverUrl);
    }
    const link = sanitize(code.verificationUriComplete);
    say(s.bold("To sign in, open this page in your browser:"));
    say();
    say(`  ${s.cyan(link)}`);
    say();
    say(`and confirm this code:   ${s.bold(s.cyan(sanitize(code.userCode)))}`);
    say();
    const decision = browserDecision(code.verificationUriComplete, {
      env: ctx.env,
      platform: process.platform,
      stdoutIsTTY: Boolean(ctx.stdout.isTTY),
      noBrowser: options.noBrowser
    });
    if (decision.open) {
      const opened = await (ctx.openBrowser ?? ((url) => openBrowser(url)))(code.verificationUriComplete);
      say(opened ? s.dim("Opened your browser.") : s.dim("Couldn't open a browser; open the link above."));
    } else {
      say(s.dim("Open the link above in any browser (it can be on another device)."));
    }
    const waiting = "Waiting for approval\u2026 (Ctrl+C to cancel)";
    if (ctx.stderr.isTTY) {
      let frame = 0;
      const draw = () => ctx.stderr.write(`\r${s.cyan(SPINNER[frame++ % SPINNER.length])} ${waiting}`);
      draw();
      spinner = setInterval(draw, 100);
      spinner.unref();
    } else {
      say(waiting);
    }
    let redeemed;
    try {
      redeemed = await pollDeviceToken(options.serverUrl, code, { ...shared, ...options.previousCredential ? { previousCredential: options.previousCredential } : {} });
    } catch (error) {
      throw mapFailure(error, options.serverUrl);
    } finally {
      stopSpinner();
    }
    return await persist(ctx, redeemed);
  } finally {
    stopSpinner();
    ctx.signal?.removeEventListener("abort", forward);
    if (onSigint) process.off("SIGINT", onSigint);
  }
}
function mapFailure(error, serverUrl) {
  if (!(error instanceof DeviceLoginError)) {
    return new CliError(error.message, `Check the server URL (${serverUrl}).`);
  }
  switch (error.kind) {
    case "aborted":
      return new CliError("Login cancelled.", void 0, 130);
    case "unsupported":
      return new CliError("This server doesn't support browser sign-in yet.", GRANT_HINT);
    case "denied":
      return new CliError("Sign-in was denied in the browser.", "Run `peerband login` again if that was a mistake.");
    case "expired":
      return new CliError("The code expired.", "Run `peerband login` again.");
    case "invalid_grant":
      return new CliError(error.message, "Run `peerband login` again to get a new code.");
    case "network":
      return new CliError(error.message, `Check your network connection and the server URL (${serverUrl}), or use \`peerband login --grant GRANT\`.`);
    default:
      return new CliError(error.message, "Run `peerband login` again, or use `peerband login --grant GRANT`.");
  }
}
var spec2 = {
  name: "login",
  summary: "Connect this machine to your PeerBand account",
  usage: "peerband login [--name NAME] [--no-browser] [--server URL] [--herdr-plugin ask|install|skip]\n  peerband login --grant GRANT [--name NAME] [--server URL]",
  description: "Signs this machine in through your browser. login prints a link and a short code, opens the page (unless you are on SSH, a headless machine or pass --no-browser), and waits while you confirm the code in your PeerBand account. The credential is stored in your PeerBand config directory (readable only by you). Running login again replaces the stored credential; when you sign in to the same account and server, this machine keeps its record in your account (installation ID and shares).\n\nOn a headless machine or in CI, use a one-time grant instead: create it in the PeerBand dashboard and pass --grant GRANT (or set PEERBAND_GRANT).\n\nWhen login succeeds it checks for Herdr. If the PeerBand plugin is missing, or installed but wrong (another version, a local checkout, a stale config directory), it offers to add or repair it (--herdr-plugin ask, the default; it only asks on a terminal), adds it without asking (install), or just prints the command (skip).",
  options: [
    { name: "no-browser", type: "boolean", description: "Do not open a browser; print the link and code only (SSH, containers)." },
    { name: "name", type: "string", valueName: "NAME", description: "Name shown for this machine in the dashboard. Default: this computer's hostname." },
    { name: "server", type: "string", valueName: "URL", description: "PeerBand server. Default: $PEERBAND_SERVER or https://peerband.com." },
    { name: "grant", type: "string", valueName: "GRANT", description: "Headless/CI: enroll with a dashboard grant instead of the browser. Default: $PEERBAND_GRANT." },
    { name: "herdr-plugin", type: "string", valueName: "ask|install|skip", description: "After login, add the PeerBand plugin to Herdr: ask (default; prompts on a terminal), install, or skip." }
  ],
  examples: [
    ["peerband login", "Open your browser, confirm the code, done"],
    ["peerband login --herdr-plugin install", "Also add the PeerBand plugin to Herdr without asking (used by the install scripts)"],
    ["peerband login --no-browser", "Print the link and code; open the link on any other device"],
    ["PEERBAND_GRANT=... peerband login --name work-laptop", "Headless/CI with a dashboard grant; keeps it out of the process list"],
    ["peerband login --server http://localhost:8000", "Against a local development server"]
  ],
  notes: ["The code you confirm in the browser must match the one shown here. The secret device code and any grant are never printed or stored. Plain HTTP is only accepted for localhost."],
  async run(parsed, ctx) {
    const herdrMode = herdrPluginMode(parsed);
    await signIn(parsed, ctx);
    await herdrSetup(ctx, herdrMode);
    ctx.out.print("");
    printSkillTip(ctx);
    return 0;
  }
};
function herdrPluginMode(parsed) {
  const rawMode = str(parsed, "herdr-plugin")?.trim().toLowerCase() ?? "ask";
  if (!HERDR_PLUGIN_MODES.includes(rawMode)) throw new UsageError(`Invalid --herdr-plugin value "${rawMode}".`, "Use --herdr-plugin ask, install or skip.");
  return rawMode;
}
async function signIn(parsed, ctx) {
  const serverUrl = resolveServerUrl(str(parsed, "server"), ctx.env);
  const name = str(parsed, "name")?.trim() || hostname3();
  const grant = (str(parsed, "grant") ?? ctx.env.PEERBAND_GRANT)?.trim();
  delete ctx.env.PEERBAND_GRANT;
  if (parsed.values.grant !== void 0 && !grant) throw new UsageError("The grant is empty.", "Pass the grant from your PeerBand dashboard: --grant GRANT.");
  const previous = await loadCredentials(credentialsFile(ctx)).catch(() => void 0);
  const previousCredential = reusableCredential(previous, serverUrl);
  const credentials = grant ? await loginWithGrant(ctx, { serverUrl, grant, name, ...previousCredential ? { previousCredential } : {} }) : await loginWithBrowser(ctx, { serverUrl, name, noBrowser: parsed.values["no-browser"] === true, ...previousCredential ? { previousCredential } : {} });
  const s = ctx.out.stdout;
  if (previous && previous.installationId === credentials.installationId && previous.serverUrl === credentials.serverUrl)
    ctx.out.print(s.dim("Kept this machine in your account with a new credential; its shares stay in place."));
  else if (previous) ctx.out.print(s.dim(`Replaced the previous login (${previous.machineName ?? previous.installationId} on ${previous.serverUrl}).`));
  const who = credentials.accountEmail ? ` (${credentials.accountEmail})` : "";
  ctx.out.print(`${s.green(symbols.ok)} Logged in as ${s.bold(credentials.machineName ?? name)}${who}`);
  return credentials;
}

// src/cli/commands/logout.ts
var spec3 = {
  name: "logout",
  summary: "Forget this machine's PeerBand credential",
  usage: "peerband logout",
  description: "Deletes the stored credential from this machine, stops a running PeerBand Relay, closes its Herdr tabs and deletes the local relay state (relay-state.json, relay-tab.json and locks left by processes that are no longer running). Safe to run more than once. It does not revoke the machine on the server: remove it from your PeerBand dashboard to revoke access for good.",
  options: [],
  examples: [["peerband logout", "Remove the local credential"]],
  async run(_parsed, ctx) {
    const s = ctx.out.stdout;
    const previous = await loadCredentials(credentialsFile(ctx)).catch(() => void 0);
    const panes = await findRelayPanes(ctx);
    const stopped = await stopRelayAndWait(ctx);
    if (stopped) ctx.out.print(`${s.green(symbols.ok)} Stopped the running PeerBand Relay.`);
    if (panes.length) {
      const closed = await closeRelayPanes(ctx, panes);
      if (closed) ctx.out.print(`${s.green(symbols.ok)} Closed ${closed === 1 ? "the PeerBand Relay tab" : `${closed} PeerBand Relay tabs`}.`);
    }
    const cleanup = await cleanRelayState(ctx, { remove: true });
    for (const held of cleanup.held) ctx.out.warn(`${ctx.out.stderr.yellow(symbols.warn)} ${held.lock} is still held: ${held.reason}.`);
    const removed = await deleteCredentials(credentialsFile(ctx));
    if (!removed) {
      ctx.out.print("Already logged out; there is no credential on this machine.");
      return 0;
    }
    const who = previous?.machineName ? ` (${previous.machineName})` : "";
    ctx.out.print(`${s.green(symbols.ok)} Logged out${who}. The local credential was deleted.`);
    ctx.out.print(s.dim("This does not revoke the machine server-side. Remove it from your PeerBand dashboard to revoke access."));
    return 0;
  }
};

// src/cli/commands/notify.ts
var PANE_ID2 = /^[A-Za-z0-9._:-]{1,128}$/;
var START_RELAY = "Start the relay with `peerband relay`.";
function callingPane(env) {
  const pane = env.HERDR_PANE_ID;
  return typeof pane === "string" && PANE_ID2.test(pane) ? pane : void 0;
}
async function notify(text2, json, ctx) {
  if (text2.trim().length === 0) throw new UsageError("The note is empty.", 'Pass a short note, for example `peerband notify "Migration finished, 3 tests failing"`.');
  if (codePoints(text2) > NOTE_MAX_CHARS) throw new UsageError(`The note is ${codePoints(text2)} characters; the limit is ${NOTE_MAX_CHARS}.`, "Shorten it to the result or the decision you need; leave details in a file or the agent output.");
  const paneId = callingPane(ctx.env);
  let reply;
  try {
    reply = await requestNotify({ text: text2, ...paneId ? { paneId } : {} }, ctx.env);
  } catch (error) {
    if (error instanceof ControlUnavailable && error.reason === "closed") {
      throw new CliError("The running relay does not support notes yet.", "Run `peerband update` to update the CLI and the Herdr plugin, which restarts the relay.");
    }
    if (error instanceof ControlUnavailable && error.reason === "timeout") throw new CliError("The relay did not answer in time; the note may not have been sent.", "Check `peerband status`.");
    throw new CliError("No PeerBand relay is running on this machine.", START_RELAY);
  }
  if (typeof reply.error === "string") {
    const message = typeof reply.message === "string" ? sanitize(reply.message) : "The note could not be sent.";
    const next = typeof reply.nextStep === "string" ? sanitize(reply.nextStep) : void 0;
    if (reply.error === "not-running") throw new CliError(`${message} The note was not sent.`, START_RELAY);
    if (reply.error === "invalid" || reply.error === "invalid_argument") throw new UsageError(message, next);
    throw new CliError(message, next ?? "Check `peerband status` and try again.");
  }
  if (reply.sent !== true) throw new CliError("The relay is not connected to PeerBand right now, so the note was not delivered.", "Check `peerband status`; send the note again once the relay shows Connected.");
  const agentId = typeof reply.agentId === "string" ? reply.agentId : null;
  if (json) {
    ctx.out.print(JSON.stringify({ sent: true, agentId, eventId: typeof reply.eventId === "string" ? reply.eventId : null }, null, 2));
    return 0;
  }
  const s = ctx.out.stdout;
  ctx.out.print(`${s.green(symbols.ok)} Note sent to the machine owner${agentId ? s.dim(` (from agent ${sanitize(agentId)})`) : ""}.`);
  return 0;
}
var spec4 = {
  name: "notify",
  summary: "Send a short note from an agent to the machine owner",
  usage: 'peerband notify "<text>" [--json]',
  description: "Sends a short note (1 to 1024 characters) through the running relay to the owner of this machine, for example when a long task finished or an agent is blocked on a decision. Run it from inside a Herdr pane and the note names the agent in that pane. The note goes to the owner only, never to people this machine is shared with. Control characters are removed and likely secrets are redacted (best effort), but do not put credentials or personal data in notes.",
  options: [{ name: "json", type: "boolean", description: "Print a machine-readable result: {sent, agentId, eventId}." }],
  positionals: { name: "text", max: 64 },
  examples: [
    ['peerband notify "Migration finished, 3 tests failing"', "Report a result when a long task ends"],
    ['peerband notify "Blocked: should I drop the legacy table?"', "Ask the owner for a decision"],
    ['peerband notify --json "Build green"', "For scripts: prints the event id"]
  ],
  notes: [
    "Needs the relay (`peerband relay`) to be running and connected; nothing is queued while it is offline.",
    "Several words without quotes are joined with spaces."
  ],
  async run(parsed, ctx) {
    if (parsed.positionals.length === 0) throw new UsageError("Missing the note text.", 'Usage: peerband notify "<text>"');
    return notify(parsed.positionals.join(" "), flag(parsed, "json"), ctx);
  }
};

// src/cli/commands/relay.ts
var spec5 = {
  name: "relay",
  summary: "Open or focus the PeerBand Relay tab in Herdr",
  usage: "peerband relay",
  description: "Opens the PeerBand Relay in a persistent Herdr tab, or focuses it if it is already open. The tab shows your account, connection state and metadata-only activity; closing it disconnects. Requires Herdr and the PeerBand plugin (`peerband herdr install`). If the plugin is wrong (another version, a local checkout, or a stale config directory), relay offers to repair it first.",
  options: [],
  examples: [["peerband relay", "Open the relay tab"]],
  async run(_parsed, ctx) {
    const credentials = await requireCredentials(ctx);
    await ensureHerdrPlugin(ctx);
    await openRelay(ctx);
    const s = ctx.out.stdout;
    ctx.out.print(`${s.green(symbols.ok)} PeerBand Relay is open in Herdr.`);
    printMcpHint(ctx, credentials.serverUrl);
    printSkillTip(ctx);
    return 0;
  }
};
async function openRelay(ctx) {
  try {
    await (ctx.openRelayTab ?? openRelayTab2)();
  } catch (error) {
    const message = sanitize(error.message || "Could not open the PeerBand Relay tab.");
    let hint = "Make sure Herdr is running, then try `peerband relay` again.";
    if (/was not found/i.test(message)) hint = NOT_FOUND_HINT;
    else if (/not installed/i.test(message)) hint = "Run `peerband herdr install`, then `peerband relay`.";
    else if (/already in progress/i.test(message)) hint = "Wait a moment and run `peerband relay` again.";
    throw new CliError(message, hint);
  }
}

// src/cli/commands/skill.ts
var SKILL_MODES = ["ask", "install", "skip"];
function report(ctx, installed) {
  const s = ctx.out.stdout;
  const where = installed.method === "skills" && installed.agents.length > 0 ? `for ${installed.agents.slice(0, 6).join(", ")}${installed.agents.length > 6 ? ` and ${installed.agents.length - 6} more` : ""}` : `in ${installed.agents.join(", ")}`;
  ctx.out.print(`${s.green(symbols.ok)} Installed the PeerBand skill ${where}.`);
  ctx.out.print(s.dim(`  ${installed.path}`));
}
function keptEdits(ctx, file) {
  const s = ctx.out.stdout;
  ctx.out.print(`${s.green(symbols.ok)} Kept your own version of the PeerBand skill ${s.dim(`(${file})`)}.`);
  ctx.out.print(s.dim("  To replace it with the version shipped with this CLI: peerband skill --force"));
}
async function skillSetup(ctx, mode) {
  const s = ctx.out.stdout;
  if (mode === "skip") {
    ctx.out.print(s.dim(`Skipped the agent skill. Add it later with \`${SKILL_COMMAND}\`.`));
    return;
  }
  if (skillEdited(ctx)) {
    keptEdits(ctx, installedSkillFile(ctx));
    return;
  }
  let install = mode === "install";
  if (mode === "ask") {
    if (!(ctx.stdin.isTTY && ctx.stderr.isTTY)) {
      ctx.out.print(`${s.dim("Next:")} ${SKILL_COMMAND}  ${s.dim("(teaches your coding agents how to handle PeerBand messages)")}`);
      return;
    }
    ctx.out.print("");
    ctx.out.print("The PeerBand skill tells your coding agents (Claude Code, Codex, Cursor, ...) how to handle messages that");
    ctx.out.print("arrive through PeerBand, including strict privacy rules for people you share this machine with.");
    const question = skillInstalled(ctx) ? "Update the PeerBand skill for your agents? [Y/n] " : "Install the PeerBand skill for your agents? [Y/n] ";
    try {
      install = await askYesNo(ctx.stdin, ctx.stderr, question);
    } catch (error) {
      if (!(error instanceof PromptAborted)) throw error;
      install = false;
    }
    if (!install) {
      ctx.out.print(`${s.yellow(symbols.warn)} Skipped. Without the skill, your agents get no guidance for messages from people you share with. Add it later with \`${SKILL_COMMAND}\`.`);
      return;
    }
  }
  ctx.out.print(s.dim("Installing the PeerBand skill\u2026"));
  try {
    report(ctx, await installSkill(ctx, { log: (line) => ctx.out.print(s.dim(line)) }));
  } catch (error) {
    if (error instanceof SkillEditedError) return keptEdits(ctx, error.file);
    ctx.out.warn(`${s.yellow(symbols.warn)} Could not install the PeerBand skill: ${error.message}`);
    ctx.out.print(s.dim(`Add it later with \`${SKILL_COMMAND}\`.`));
  }
}
var spec6 = {
  name: "skill",
  summary: "Install or update the PeerBand skill for your coding agents",
  usage: "peerband skill [--copy] [--force]",
  description: "Installs the PeerBand agent skill that ships with this CLI for every coding agent on this machine. It uses the skills CLI (npx skills add), which keeps one copy in ~/.agents/skills/peerband and links it into each agent it finds (Claude Code, Codex, Cursor, Gemini CLI, OpenCode and others). If that fails, or with --copy, it copies the skill into ~/.agents/skills and ~/.claude/skills instead.\n\nThe skill tells agents how to use the PeerBand MCP tools and how to handle messages relayed through PeerBand: requests from you are handled normally; requests from people you shared this machine with follow strict privacy rules.\n\nTo change those rules, edit SKILL.md in ~/.agents/skills/peerband. Once you have edited it, `peerband skill` and `peerband update` keep your version; --force replaces it with the shipped one. Running it again otherwise updates the skill to the version of this CLI.",
  options: [
    { name: "copy", type: "boolean", description: "Copy the files instead of running the skills CLI (offline, or when npx is blocked)." },
    { name: "force", type: "boolean", description: "Replace the skill even if you edited it." },
    { name: "if-installed", type: "boolean", description: "Only update an existing, unedited installation (used by peerband update).", hidden: true }
  ],
  examples: [
    ["peerband skill", "Install the skill for every coding agent found"],
    ["peerband skill --copy", "Copy it into ~/.agents and ~/.claude without npx"],
    ["peerband skill --force", "Go back to the shipped skill, dropping your edits"]
  ],
  async run(parsed, ctx) {
    const onlyUpdate = flag(parsed, "if-installed");
    if (onlyUpdate && !skillInstalled(ctx)) return 0;
    try {
      report(ctx, await installSkill(ctx, { copy: flag(parsed, "copy"), force: flag(parsed, "force"), log: (line) => ctx.out.print(ctx.out.stdout.dim(line)) }));
    } catch (error) {
      if (error instanceof SkillEditedError) {
        keptEdits(ctx, error.file);
        return 0;
      }
      throw new CliError(`Could not install the PeerBand skill: ${error.message}`, "Try `peerband skill --copy`, or install it from GitHub: `npx skills add kshvidler/peerband-cli`.");
    }
    return 0;
  }
};

// src/cli/commands/setup.ts
function skillMode(parsed) {
  const raw = str(parsed, "skill")?.trim().toLowerCase() ?? "ask";
  if (!SKILL_MODES.includes(raw)) throw new UsageError(`Invalid --skill value "${raw}".`, "Use --skill ask, install or skip.");
  return raw;
}
async function existingLogin(parsed, ctx) {
  if (str(parsed, "grant") !== void 0 || ctx.env.PEERBAND_GRANT) return void 0;
  const previous = await loadCredentials(credentialsFile(ctx)).catch(() => void 0);
  if (!previous) return void 0;
  try {
    return new URL(previous.serverUrl).origin === new URL(resolveServerUrl(str(parsed, "server"), ctx.env)).origin ? previous : void 0;
  } catch {
    return void 0;
  }
}
var loginOptions = spec2.options.filter((option) => option.name !== "herdr-plugin");
var spec7 = {
  name: "setup",
  summary: "Set up this machine: log in, add the Herdr plugin and the agent skill, open the relay",
  usage: "peerband setup [--name NAME] [--no-browser] [--server URL] [--herdr-plugin ask|install|skip] [--skill ask|install|skip] [--no-relay]\n  peerband setup --grant GRANT [...]",
  description: "Does everything a new machine needs, in one go, and is safe to run again:\n  1. Logs in through your browser (skipped when this machine is already logged in to the same server).\n  2. Adds or repairs the PeerBand plugin in Herdr.\n  3. Installs the PeerBand skill for your coding agents (see `peerband skill`). It tells them how to handle messages that arrive through PeerBand, with strict privacy rules for people you share this machine with.\n  4. Opens the PeerBand Relay tab in Herdr, which connects the machine.\n\nOn a terminal each optional step asks first, with Yes as the default. Without a terminal, ask means skip and setup prints the command for that step.",
  options: [
    ...loginOptions,
    { name: "herdr-plugin", type: "string", valueName: "ask|install|skip", description: "Add the PeerBand plugin to Herdr: ask (default; prompts on a terminal), install, or skip." },
    { name: "skill", type: "string", valueName: "ask|install|skip", description: "Install the PeerBand skill for your coding agents: ask (default; prompts on a terminal), install, or skip." },
    { name: "no-relay", type: "boolean", description: "Do not open the Relay tab at the end." }
  ],
  examples: [
    ["peerband setup", "Log in, add the plugin and the skill, open the relay"],
    ["peerband setup --herdr-plugin install --skill install", "The same without questions (used by the install scripts)"],
    ["PEERBAND_GRANT=... peerband setup --name work-laptop --no-relay", "Headless: log in with a dashboard grant"]
  ],
  async run(parsed, ctx) {
    const herdrMode = herdrPluginMode(parsed);
    const skill = skillMode(parsed);
    const s = ctx.out.stdout;
    const step = (n, title) => {
      ctx.out.print("");
      ctx.out.print(s.bold(`${n}/4 ${title}`));
    };
    step(1, "Log in");
    let credentials = await existingLogin(parsed, ctx);
    if (credentials) {
      const who = credentials.accountEmail ? ` (${credentials.accountEmail})` : "";
      ctx.out.print(`${s.green(symbols.ok)} Already logged in as ${s.bold(credentials.machineName ?? credentials.installationId)}${who} ${s.dim("(`peerband login` signs in again)")}`);
    } else {
      credentials = await signIn(parsed, ctx);
    }
    step(2, "Herdr plugin");
    const herdr2 = await herdrSetup(ctx, herdrMode, { relayNext: false });
    step(3, "Agent skill");
    await skillSetup(ctx, skill);
    step(4, "Relay");
    let relayOpen = false;
    if (flag(parsed, "no-relay")) {
      ctx.out.print(s.dim("Skipped. Open it later with `peerband relay`."));
    } else if (herdr2 !== "ready") {
      ctx.out.print(s.dim(`Not opened: ${herdr2 === "no-herdr" ? "Herdr is not installed" : "the Herdr plugin is not ready"}. When it is, run \`peerband relay\`.`));
    } else {
      try {
        await openRelay(ctx);
        relayOpen = true;
        ctx.out.print(`${s.green(symbols.ok)} PeerBand Relay is open in Herdr.`);
      } catch (error) {
        ctx.out.warn(`${s.yellow(symbols.warn)} Could not open the PeerBand Relay tab: ${error.message}`);
        if (error instanceof CliError && error.hint) ctx.out.print(s.dim(`  ${error.hint}`));
      }
    }
    printMcpHint(ctx, credentials.serverUrl);
    ctx.out.print("");
    ctx.out.print(relayOpen ? `${s.green(symbols.ok)} PeerBand is set up.` : `${s.dim("Setup finished. Check it any time with")} peerband status`);
    return 0;
  }
};

// src/cli/commands/share.ts
var roleLabel = (role) => role === "message" ? "read + message" : "read only";
var MAX_EXPIRY_DAYS = 30;
async function call(ctx, credentials, method, path, body) {
  const url = new URL(path, enrollmentBase(credentials.serverUrl));
  let response;
  try {
    response = await ctx.fetch(url, {
      method,
      headers: { authorization: `Bearer ${credentials.credential}`, ...body ? { "content-type": "application/json" } : {} },
      ...body ? { body: JSON.stringify(body) } : {},
      signal: AbortSignal.timeout(15e3)
    });
  } catch (error) {
    throw new CliError(`Could not reach ${url.origin}: ${error.message}`, "Check your network connection and try again.");
  }
  if (response.status === 204) return null;
  const parsed = await response.json().catch(() => ({}));
  if (response.ok) return parsed;
  const detail = typeof parsed.detail === "string" ? parsed.detail : `HTTP ${response.status}`;
  if (response.status === 401) throw new CliError("PeerBand rejected this machine's credential (it may have been revoked).", "Run `peerband login` again to sign in.");
  if (response.status === 404 && path.endsWith("/sharing") && method === "GET") throw new CliError("This PeerBand server doesn't support sharing yet.");
  throw new CliError(sanitize(detail));
}
function expiryDays(raw) {
  if (raw === void 0) return void 0;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) throw new UsageError(`Invalid --expires value "${raw}".`, `Use a whole number of days from 1 to ${MAX_EXPIRY_DAYS}.`);
  return days;
}
async function create(ctx, credentials, role, days, json) {
  const link = await call(ctx, credentials, "POST", "/api/installation/invites", { role, ...days ? { expires_in_days: days } : {} });
  if (json) {
    ctx.out.print(JSON.stringify(link, null, 2));
    return 0;
  }
  const s = ctx.out.stdout;
  ctx.out.print(`${s.green(symbols.ok)} Invite link for ${s.bold(credentials.machineName ?? "this machine")} (${roleLabel(link.role)}):`);
  ctx.out.print("");
  ctx.out.print(`  ${s.cyan(sanitize(link.url))}`);
  ctx.out.print("");
  ctx.out.print(`Send it to one person. It works once and expires ${sanitize(link.expires_at)}.`);
  ctx.out.print(s.dim("They sign in to PeerBand (or create an account) and accept. See who has access with `peerband share list`."));
  return 0;
}
async function list(ctx, credentials, json) {
  const sharing = await call(ctx, credentials, "GET", "/api/installation/sharing");
  if (json) {
    ctx.out.print(JSON.stringify(sharing, null, 2));
    return 0;
  }
  const s = ctx.out.stdout;
  ctx.out.print(s.bold("People with access"));
  if (!sharing.guests.length) ctx.out.print(s.dim("  Nobody else has access yet. Create a link with `peerband share`."));
  for (const guest of sharing.guests) {
    const used = guest.last_used_at ? `last used ${sanitize(guest.last_used_at)}` : "not used yet";
    ctx.out.print(`  ${sanitize(guest.email ?? "PeerBand user")}  ${roleLabel(guest.role)}  ${s.dim(`${used} \xB7 ${guest.id}`)}`);
  }
  if (sharing.invites.length) {
    ctx.out.print("");
    ctx.out.print(s.bold("Unused links"));
    for (const invite of sharing.invites) ctx.out.print(`  ${roleLabel(invite.role)}  ${s.dim(`expires ${sanitize(invite.expires_at)} \xB7 ${invite.id}`)}`);
  }
  ctx.out.print("");
  ctx.out.print(s.dim("Remove access or cancel a link with `peerband share revoke ID`. Change roles in the dashboard."));
  return 0;
}
async function revoke(ctx, credentials, id) {
  if (!id) throw new UsageError("Missing the ID to revoke.", "Run `peerband share list` to see IDs (acc_\u2026 for people, inv_\u2026 for links).");
  if (!/^(acc|inv)_[\w-]{1,64}$/.test(id)) throw new UsageError(`"${sanitize(id)}" is not a share ID.`, "IDs start with acc_ (a person) or inv_ (a link); see `peerband share list`.");
  await call(ctx, credentials, "DELETE", `/api/installation/sharing/${encodeURIComponent(id)}`);
  ctx.out.print(`${ctx.out.stdout.green(symbols.ok)} ${id.startsWith("acc_") ? "Access removed." : "Link cancelled."}`);
  return 0;
}
var spec8 = {
  name: "share",
  summary: "Share this machine with another PeerBand user",
  usage: "peerband share [--message] [--expires DAYS] [--json]\n  peerband share list [--json]\n  peerband share revoke ID",
  description: "Creates an invitation link for this machine. The person who opens it signs in to PeerBand (or creates an account) and accepts; this machine then appears in their dashboard and in list_machines in their MCP client. Guests can list and read this machine's agents. With --message they can also send messages, if their MCP client has the agents:message consent and this machine allows messages (a machine started with --read-only never does).\n\nEach link works for one person and expires after 7 days unless you pass --expires. You see each guest's email and a log of what they read or send (metadata only) in the dashboard.\n\n`share list` shows who has access and the unused links; `share revoke ID` removes a person's access (acc_\u2026) or cancels a link (inv_\u2026).",
  options: [
    { name: "message", type: "boolean", description: "Also let the guest send messages to agents. Default: read only." },
    { name: "expires", type: "string", valueName: "DAYS", description: `Days until the link expires, 1 to ${MAX_EXPIRY_DAYS}. Default: 7.` },
    { name: "json", type: "boolean", description: "Print machine-readable JSON." }
  ],
  positionals: { name: "list | revoke ID", max: 2 },
  examples: [
    ["peerband share", "Create a read-only invite link for this machine"],
    ["peerband share --message --expires 1", "A link that also allows messages, valid for one day"],
    ["peerband share list", "People with access and unused links"],
    ["peerband share revoke acc_AbC123", "Remove someone's access"]
  ],
  notes: ["The link is shown once. Anyone who has it can accept it until it is used, so send it only to the person you mean."],
  async run(parsed, ctx) {
    const [action, id] = parsed.positionals;
    const json = flag(parsed, "json");
    if (action !== void 0 && action !== "list" && action !== "revoke")
      throw new UsageError(`Unknown share action "${sanitize(action)}".`, "Use `peerband share`, `peerband share list` or `peerband share revoke ID`.");
    if (action !== "revoke" && id !== void 0) throw new UsageError(`Unexpected argument "${sanitize(id)}".`, "Run `peerband share --help` for usage.");
    if (action && (parsed.values.message !== void 0 || parsed.values.expires !== void 0))
      throw new UsageError("--message and --expires only apply when creating a link.", "Run `peerband share --message` to create one.");
    const days = expiryDays(str(parsed, "expires"));
    const credentials = await requireCredentials(ctx);
    if (action === "list") return list(ctx, credentials, json);
    if (action === "revoke") return revoke(ctx, credentials, id);
    return create(ctx, credentials, flag(parsed, "message") ? "message" : "read", days, json);
  }
};

// src/cli/commands/status.ts
function safeMcpUrl(serverUrl, env) {
  try {
    return mcpUrlFor(serverUrl, env);
  } catch {
    return null;
  }
}
async function buildStatus(ctx) {
  let credentials;
  try {
    credentials = await loadCredentials(credentialsFile(ctx));
  } catch {
    credentials = void 0;
  }
  const snapshot = await relaySnapshot(ctx.env);
  const plugin = await checkHerdrPlugin(ctx);
  const messages = await loadMachineConnectorConfig(ctx).then(
    (config) => writesEnabled(config) ? "allowed" : "read-only",
    () => null
  );
  return {
    version: ctx.version,
    node: process.versions.node,
    configHome: configHome({ env: ctx.env }),
    loggedIn: Boolean(credentials),
    machine: credentials?.machineName ?? null,
    email: credentials?.accountEmail ?? null,
    server: credentials?.serverUrl ?? null,
    mcpUrl: credentials ? safeMcpUrl(credentials.serverUrl, ctx.env) : null,
    installationId: credentials?.installationId ?? null,
    enrolledAt: credentials?.enrolledAt ?? null,
    relay: {
      running: snapshot?.source === "control" && snapshot.state === "running",
      connection: snapshot?.connectionState ?? null,
      source: snapshot?.source ?? "none"
    },
    messages,
    herdr: {
      found: plugin.found,
      version: plugin.herdrVersion,
      pluginInstalled: plugin.found ? plugin.installed : null,
      pluginSource: plugin.source,
      pluginProblems: plugin.problems
    }
  };
}
function colorConnection(s, state) {
  if (!state) return s.dim("not running");
  const label = paneLabel2({ state: "running", connectionState: state, activity: [] });
  if (state === "connected") return s.green(`${symbols.dot} ${label}`);
  if (state === "connecting" || state === "reconnecting") return s.yellow(`${symbols.dot} ${label}`);
  if (state === "disabled") return s.dim(`${symbols.ring} ${label}`);
  return s.red(`${symbols.dot} ${label}`);
}
function renderHuman(report2, ctx) {
  const s = ctx.out.stdout;
  const rows = [];
  rows.push([
    "Account",
    report2.loggedIn ? `${s.green(symbols.ok)} logged in${report2.email ? ` as ${report2.email}` : ""}` : `${s.red(symbols.fail)} not logged in ${s.dim("(run `peerband login`)")}`
  ]);
  if (report2.loggedIn) {
    rows.push(["Machine", report2.machine ?? s.dim("(unnamed)")]);
    rows.push(["Server", report2.server ?? ""]);
    if (report2.mcpUrl) rows.push(["MCP server", report2.mcpUrl]);
    rows.push(["Installation", report2.installationId ?? ""]);
    if (report2.enrolledAt) rows.push(["Enrolled", report2.enrolledAt]);
  }
  const relayLine = report2.relay.running ? colorConnection(s, report2.relay.connection) : report2.relay.source === "file" && report2.relay.connection && report2.relay.connection !== "helper-unavailable" ? `${colorConnection(s, report2.relay.connection)} ${s.dim("(last known; relay not running)")}` : s.dim(`${symbols.ring} not running ${s.dim("(open it with `peerband relay`)")}`);
  rows.push(["Relay", relayLine]);
  if (report2.messages) {
    rows.push([
      "Messages",
      report2.messages === "allowed" ? `allowed ${s.dim('(needs the agents:message consent; turn off with --read-only or "enableWrites": false in connector.json)')}` : "read-only"
    ]);
  }
  rows.push([
    "Herdr",
    !report2.herdr.found ? `${s.yellow(symbols.warn)} not found ${s.dim("(set HERDR_BIN_PATH or add herdr to PATH)")}` : `${report2.herdr.version ?? "unknown version"}`
  ]);
  if (report2.herdr.found) {
    const first = report2.herdr.pluginProblems[0];
    rows.push([
      "Plugin",
      !report2.herdr.pluginInstalled ? `${s.yellow(symbols.warn)} not installed ${s.dim(`(run \`${REPAIR_COMMAND}\`)`)}` : first ? `${s.yellow(symbols.warn)} ${first.message} ${s.dim(`(run \`${fixCommand(first)}\`)`)}` : `${s.green(symbols.ok)} ${report2.herdr.pluginSource ?? "installed"}`
    ]);
  }
  rows.push(["peerband", `${report2.version} ${s.dim(`(node ${report2.node})`)}`]);
  rows.push(["Config", s.dim(report2.configHome)]);
  const width = Math.max(...rows.map(([key]) => key.length));
  for (const [key, value] of rows) ctx.out.print(`${s.bold(key.padEnd(width))}  ${value}`);
}
var spec9 = {
  name: "status",
  summary: "Show login, relay and Herdr status",
  usage: "peerband status [--json]",
  description: "Shows whether this machine is logged in, whether the PeerBand Relay is running and connected, and whether Herdr and the PeerBand plugin are installed. Exits with code 3 when not logged in.",
  options: [{ name: "json", type: "boolean", description: "Print a stable machine-readable JSON object instead of text." }],
  examples: [
    ["peerband status", "Human-readable summary"],
    ["peerband status --json", "For scripts; check .loggedIn and .relay.connection"]
  ],
  async run(parsed, ctx) {
    const report2 = await buildStatus(ctx);
    if (flag(parsed, "json")) ctx.out.print(JSON.stringify(report2, null, 2));
    else renderHuman(report2, ctx);
    return report2.loggedIn ? 0 : EXIT_NOT_LOGGED_IN;
  }
};

// src/cli/commands/update.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, realpathSync as realpathSync2 } from "node:fs";
import { dirname as dirname5, isAbsolute, join as join10, relative as relative2 } from "node:path";
var DEFAULT_REGISTRY = "https://registry.npmjs.org";
var PACKAGE = "peerband";
var VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
function compareVersions(a, b) {
  const left = VERSION_PATTERN.exec(a);
  const right = VERSION_PATTERN.exec(b);
  if (!left || !right) return a === b ? 0 : a < b ? -1 : 1;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(left[i]) - Number(right[i]);
    if (diff !== 0) return Math.sign(diff);
  }
  const [preA, preB] = [left[4], right[4]];
  if (preA === preB) return 0;
  if (!preA) return 1;
  if (!preB) return -1;
  return preA < preB ? -1 : 1;
}
var OFFLINE_HINT = "Check your internet connection and try again. To update by hand: `npm install -g peerband@latest`, then `peerband update`.";
async function fetchLatestVersion(ctx, timeoutMs = 1e4) {
  const base = (ctx.env.PEERBAND_NPM_REGISTRY || DEFAULT_REGISTRY).replace(/\/+$/, "");
  const url = `${base}/${PACKAGE}/latest`;
  let response;
  try {
    response = await ctx.fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? `no answer within ${timeoutMs / 1e3}s` : error?.message || String(error);
    throw new CliError(`Could not reach the npm registry to check for updates (${reason}).`, OFFLINE_HINT);
  }
  if (!response.ok) throw new CliError(`The npm registry answered HTTP ${response.status} for ${url}.`, OFFLINE_HINT);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new CliError(`The npm registry returned an unreadable answer for ${url}.`, OFFLINE_HINT);
  }
  const version = body && typeof body === "object" ? body.version : void 0;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) throw new CliError(`The npm registry did not report a valid version for ${PACKAGE}.`, OFFLINE_HINT);
  return version;
}
function real(path) {
  try {
    return realpathSync2(path);
  } catch {
    return path;
  }
}
function isInside(child, parent) {
  const fold = (path) => process.platform === "win32" ? path.toLowerCase() : path;
  const rel = relative2(fold(parent), fold(child));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
function checkoutRoot(self) {
  let dir = dirname5(self);
  for (let i = 0; i < 4; i++) {
    try {
      const pkg = JSON.parse(readFileSync2(join10(dir, "package.json"), "utf8"));
      if (pkg.name === PACKAGE && existsSync2(join10(dir, ".git"))) return dir;
    } catch {
    }
    const parent = dirname5(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return void 0;
}
async function detectInstall(ctx) {
  const self = real(ctx.selfPath ?? ctx.env.PEERBAND_SELF_PATH ?? process.argv[1] ?? "");
  if (/[\\/]_npx[\\/]/.test(self)) return { kind: "npx", self };
  const npm = await (ctx.exec ?? execProgram)("npm", ["root", "-g"], { timeoutMs: 6e4, env: ctx.env });
  const npmRoot = npm.code === 0 ? npm.stdout.trim().split(/\r?\n/).pop()?.trim() : void 0;
  if (npmRoot && isInside(self, real(join10(npmRoot, PACKAGE)))) return { kind: "npm-global", self, npmRoot };
  const checkout = checkoutRoot(self);
  if (checkout) return { kind: "source", self, npmRoot, detail: checkout };
  return { kind: "unknown", self, npmRoot, detail: npm.notFound ? "npm was not found on PATH" : npmRoot ? `it is not under npm's global folder ${npmRoot}` : "npm did not report its global folder" };
}
function manualUpdate(info, latest) {
  const global = `npm install -g peerband@${latest}`;
  switch (info.kind) {
    case "npx":
      return { message: "This peerband was started through npx, so there is no installed copy to update.", hint: `Install it once with \`${global}\`, then run \`peerband update\` to update the Herdr plugin too.` };
    case "source":
      return {
        message: `This peerband runs from a source checkout (${info.detail}).`,
        hint: "Update the checkout (`git pull`, `npm ci`, `npm run build`), then run `peerband herdr install`. To use the release instead: `" + global + "`, then `peerband update`."
      };
    default:
      return { message: `Could not tell how this peerband was installed (${info.detail ?? info.self}).`, hint: `Run \`${global}\`, then \`peerband update\` to update the Herdr plugin.` };
  }
}
function toStderr(ctx) {
  return { ...ctx, stdout: ctx.stderr, out: new Output(ctx.stderr, ctx.stderr, ctx.env) };
}
function pluginSummary(check) {
  return { herdrFound: check.found, installed: check.installed, source: check.source, problems: check.problems.map((problem) => problem.message) };
}
var spec10 = {
  name: "update",
  summary: "Update the CLI and the Herdr plugin to the latest release",
  usage: "peerband update [--check] [--yes] [--json]",
  description: "Checks npm for the latest PeerBand release and, if it is newer, installs it with `npm install -g` and then lets the new CLI update the Herdr plugin: it stops the PeerBand Relay and closes its tab, replaces the plugin (the previous one is put back if that fails), clears stale relay locks, and reopens the Relay tab if it was open.\nWhen the CLI is already up to date it still checks that the Herdr plugin matches it and repairs it if not (for example after a plain `npm install -g peerband`).",
  options: [
    { name: "check", type: "boolean", description: "Only report whether an update is available; change nothing." },
    { name: "yes", short: "y", type: "boolean", description: "Do not ask for confirmation." },
    { name: "json", type: "boolean", description: "Print a machine-readable JSON summary (progress goes to stderr)." }
  ],
  examples: [
    ["peerband update", "Update everything"],
    ["peerband update --check", "See whether an update is available"],
    ["peerband update --yes --json", "Non-interactive, for scripts"]
  ],
  notes: [
    "Only a global npm install can update itself. From npx or a source checkout, update prints the command to run instead.",
    "Environment: PEERBAND_NPM_REGISTRY (registry to check, default https://registry.npmjs.org)."
  ],
  async run(parsed, ctx) {
    const json = flag(parsed, "json");
    const io = json ? toStderr(ctx) : ctx;
    const s = io.out.stdout;
    const log = (line) => io.out.print(line);
    const latest = await fetchLatestVersion(ctx);
    const newer = compareVersions(latest, ctx.version) > 0;
    const plugin = await checkHerdrPlugin(ctx);
    const report2 = { current: ctx.version, latest, updateAvailable: newer, action: "none", plugin: pluginSummary(plugin) };
    const pluginNeedsRepair = plugin.found && plugin.installed && plugin.problems.length > 0;
    const finish = (code = 0) => {
      if (json) ctx.out.print(JSON.stringify(report2, null, 2));
      return code;
    };
    if (flag(parsed, "check")) {
      if (newer) log(`${s.yellow(symbols.warn)} PeerBand ${latest} is available (you have ${ctx.version}). Run ${s.bold("peerband update")}.`);
      else log(`${s.green(symbols.ok)} PeerBand ${ctx.version} is up to date ${s.dim(`(latest on npm: ${latest})`)}.`);
      if (pluginNeedsRepair) log(`${s.yellow(symbols.warn)} The Herdr plugin needs repair: ${plugin.problems[0].message} ${s.dim("(run `peerband update`)")}`);
      return finish();
    }
    if (!newer) {
      log(`${s.green(symbols.ok)} PeerBand ${ctx.version} is up to date ${s.dim(`(latest on npm: ${latest})`)}.`);
      if (pluginNeedsRepair) {
        log(`${s.yellow(symbols.warn)} The Herdr plugin does not match this CLI: ${plugin.problems[0].message} Repairing it.`);
        await installPlugin(io);
        report2.action = "repaired-plugin";
        report2.plugin = pluginSummary(await checkHerdrPlugin(ctx));
      } else if (plugin.found && !plugin.installed && !plugin.detail) {
        log(`${s.dim("The PeerBand plugin is not installed in Herdr. Add it with:")} peerband herdr install`);
      } else if (plugin.installed) {
        log(`${s.green(symbols.ok)} The Herdr plugin matches ${s.dim(`(${plugin.source ?? "installed"})`)}.`);
      }
      return finish();
    }
    const install = await detectInstall(ctx);
    report2.install = install.kind;
    if (install.kind !== "npm-global" || !install.npmRoot) {
      const manual = manualUpdate(install, latest);
      report2.action = "manual";
      report2.manual = manual;
      if (json) {
        io.out.fail(manual.message, manual.hint);
        return finish(1);
      }
      throw new CliError(`PeerBand ${latest} is available (you have ${ctx.version}). ${manual.message}`, manual.hint);
    }
    if (!flag(parsed, "yes") && !json && ctx.stdin.isTTY && ctx.stderr.isTTY) {
      let proceed;
      try {
        proceed = await askYesNo(ctx.stdin, ctx.stderr, `Update PeerBand ${ctx.version} \u2192 ${latest}? [Y/n] `);
      } catch (error) {
        if (!(error instanceof PromptAborted)) throw error;
        proceed = false;
      }
      if (!proceed) {
        report2.action = "cancelled";
        log(s.dim("Not updated."));
        return finish();
      }
    }
    const exec2 = ctx.exec ?? execProgram;
    const spec11 = `peerband@${latest}`;
    log(`Installing ${spec11} with npm\u2026`);
    const forward = (text2) => ctx.stderr.write(text2);
    const npm = await exec2("npm", ["install", "-g", spec11], { timeoutMs: 6e5, env: ctx.env, onStdout: forward, onStderr: forward });
    if (npm.code !== 0) {
      const permission = /EACCES|EPERM|permission denied/i.test(`${npm.stderr}${npm.stdout}`);
      throw new CliError(
        npm.notFound ? "npm was not found on PATH." : `npm install -g ${spec11} failed (exit code ${npm.code}).`,
        permission ? `npm could not write to its global folder. Fix its permissions (https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) or run \`npm install -g ${spec11}\` as an administrator, then \`peerband update\`.` : `Check the npm output above, run \`npm install -g ${spec11}\` yourself, then \`peerband update\`.`
      );
    }
    const entry = join10(install.npmRoot, PACKAGE, "dist", "peerband.mjs");
    if (!existsSync2(entry)) throw new CliError(`npm finished, but the new CLI is not at ${entry}.`, `Run \`npm install -g ${spec11}\` yourself, then \`peerband update\`.`);
    log(`${s.green(symbols.ok)} Installed peerband ${latest}.`);
    report2.action = "updated";
    if (skillInstalled(ctx)) {
      const refreshed = await exec2(process.execPath, [entry, "skill", "--if-installed"], {
        timeoutMs: 5 * 6e4,
        env: ctx.env,
        onStdout: (text2) => io.stdout.write(text2),
        onStderr: (text2) => ctx.stderr.write(text2)
      });
      if (refreshed.code !== 0) io.out.warn(`${io.out.stderr.yellow(symbols.warn)} Could not update the PeerBand skill. Run \`peerband skill\` later.`);
    }
    if (!plugin.found) {
      log(s.dim("Herdr was not found, so there is no plugin to update."));
      return finish();
    }
    if (!plugin.installed) {
      log(`${s.dim("Next:")} peerband herdr install  ${s.dim("(adds the PeerBand plugin to Herdr)")}`);
      return finish();
    }
    log("Updating the Herdr plugin with the new CLI\u2026");
    const env = { ...ctx.env, ...io.out.stdout.enabled && ctx.env.FORCE_COLOR === void 0 ? { FORCE_COLOR: "1" } : {} };
    const handoff = await exec2(process.execPath, [entry, "herdr", "install", "--after-update"], {
      timeoutMs: 15 * 6e4,
      env,
      onStdout: (text2) => io.stdout.write(text2),
      onStderr: (text2) => ctx.stderr.write(text2)
    });
    if (handoff.code !== 0) {
      throw new CliError(`peerband ${latest} is installed, but updating the Herdr plugin failed (exit code ${handoff.code}).`, "Fix the problem shown above, then run `peerband herdr install`.");
    }
    report2.plugin = pluginSummary(await checkHerdrPlugin({ ...ctx, version: latest }));
    return finish();
  }
};

// src/cli/registry.ts
var commands = [spec7, spec2, spec3, spec9, spec10, spec5, spec6, spec8, spec4, spec];
var herdrCommands = [installSpec, uninstallSpec];
function lookup(words) {
  const [first, second] = words;
  if (first === "herdr") return herdrCommands.find((command) => command.name === `herdr ${second}`);
  return commands.find((command) => command.name === first);
}
var topLevelNames = () => [...commands.map((command) => command.name), "herdr", "help"];

// src/cli/help.ts
function section(s, title, lines) {
  return ["", s.bold(title), ...lines.map((line) => line ? `  ${line}` : "")];
}
function table(rows, s) {
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `${s.cyan(left.padEnd(width))}  ${right}`);
}
function optionRows(options) {
  return [...options.filter((option) => !option.hidden), HELP_OPTION].map((option) => {
    const short = option.short ? `-${option.short}, ` : "    ";
    const value = option.type === "string" ? ` ${option.valueName ?? "VALUE"}` : "";
    return [`${short}--${option.name}${value}`, option.description];
  });
}
var GLOBAL_ENV = [
  ["PEERBAND_SERVER", "Server URL (default https://peerband.com)"],
  ["PEERBAND_MCP_URL", "MCP endpoint shown by relay/status (default derived from the server)"],
  ["PEERBAND_CONFIG_HOME", "Directory for credentials and state"],
  ["NO_COLOR / FORCE_COLOR", "Disable / force colored output"]
];
function rootHelp(s, version) {
  const lines = [
    `${s.bold("peerband")} ${s.dim(version)}  Reach your Herdr agents from any MCP client through your PeerBand account.`,
    ...section(s, "Usage", ["peerband <command> [options]"]),
    ...section(s, "Commands", [
      ...table(
        [
          ...commands.map((command) => [command.name, command.summary]),
          ["herdr install", "Install the PeerBand plugin into Herdr"],
          ["herdr uninstall", "Remove the PeerBand plugin from Herdr"],
          ["help [command]", "Show help for a command"]
        ],
        s
      )
    ]),
    ...section(s, "Options", table([["-h, --help", "Show help"], ["-v, --version", "Print the version"]], s)),
    ...section(s, "Environment", table(GLOBAL_ENV, s)),
    ...section(s, "Getting started", [
      "1. peerband login           Sign in through your browser",
      "2. peerband herdr install   Add the plugin to Herdr",
      "3. peerband relay           Open the relay tab and connect"
    ]),
    ...section(s, "Updating", ["peerband update            Update the CLI and the Herdr plugin together (--check to only look)"]),
    ...section(s, "From an agent", ['peerband notify "<text>"   Send the machine owner a short note (task done, blocked, result)']),
    ...section(s, "Exit codes", ["0 ok   1 failure   2 usage error   3 not logged in   130 interrupted"]),
    "",
    `Run ${s.cyan("peerband <command> --help")} for details. Docs: https://peerband.com`
  ];
  return `${lines.join("\n")}
`;
}
function commandHelp(s, spec11) {
  const lines = [
    `${s.bold(`peerband ${spec11.name}`)}  ${spec11.summary}`,
    ...section(s, "Usage", [spec11.usage]),
    "",
    ...spec11.description.split("\n").map((line) => `  ${line}`),
    ...section(s, "Options", table(optionRows(spec11.options), s)),
    ...section(
      s,
      "Examples",
      spec11.examples.flatMap(([command, comment]) => [`${s.cyan(command)}`, `  ${s.dim(comment)}`])
    )
  ];
  if (spec11.notes?.length) lines.push(...section(s, "Notes", spec11.notes));
  return `${lines.join("\n")}
`;
}
function herdrGroupHelp(s) {
  const lines = [
    `${s.bold("peerband herdr")}  ${groupSpec.summary}`,
    ...section(s, "Usage", ["peerband herdr <install|uninstall> [options]"]),
    ...section(s, "Commands", table(herdrCommands.map((command) => [command.name.replace("herdr ", ""), command.summary]), s)),
    ...section(s, "Examples", ["peerband herdr install", "peerband herdr uninstall"]),
    "",
    `Run ${s.cyan("peerband herdr <command> --help")} for details.`
  ];
  return `${lines.join("\n")}
`;
}

// src/cli/cli.ts
var VERSION = true ? "0.1.5" : "0.0.0-dev";
function createContext(overrides = {}) {
  const env = overrides.env ?? process.env;
  const stdout = overrides.stdout ?? process.stdout;
  const stderr = overrides.stderr ?? process.stderr;
  return {
    env,
    stdin: process.stdin,
    stdout,
    stderr,
    fetch: globalThis.fetch,
    runHerdr: createHerdrRunner(env),
    version: VERSION,
    ...overrides,
    out: new Output(stdout, stderr, env)
  };
}
function resolveHelpTarget(words, ctx) {
  const s = ctx.out.stdout;
  if (words.length === 0) return rootHelp(s, ctx.version);
  if (words[0] === "herdr" && words.length === 1) return herdrGroupHelp(s);
  const spec11 = lookup(words);
  if (!spec11) throw unknownCommand(words.join(" "));
  return commandHelp(s, spec11);
}
function unknownCommand(name) {
  const near = suggest(name, topLevelNames());
  return new UsageError(`Unknown command "${name}".`, near ? `Did you mean \`peerband ${near}\`? Run \`peerband --help\` for all commands.` : "Run `peerband --help` for all commands.");
}
async function run2(argv, ctx = createContext()) {
  try {
    const [first, ...rest] = argv;
    if (first === void 0) {
      ctx.out.print(rootHelp(ctx.out.stdout, ctx.version).trimEnd());
      return 0;
    }
    if (first === "--version" || first === "-v") {
      ctx.out.print(ctx.version);
      return 0;
    }
    if (first === "--help" || first === "-h") {
      ctx.out.print(rootHelp(ctx.out.stdout, ctx.version).trimEnd());
      return 0;
    }
    if (first === "help") {
      ctx.out.print(resolveHelpTarget(rest.filter((word) => !word.startsWith("-")), ctx).trimEnd());
      return 0;
    }
    if (first.startsWith("-")) {
      throw new UsageError(`Unknown option ${first}.`, "Run `peerband --help` for usage.");
    }
    let words = [first];
    let args = rest;
    if (first === "herdr") {
      const [second, ...others] = rest;
      if (second === void 0 || second === "--help" || second === "-h") {
        ctx.out.print(herdrGroupHelp(ctx.out.stdout).trimEnd());
        return 0;
      }
      if (!herdrCommands.some((command) => command.name === `herdr ${second}`)) {
        const near = suggest(second, herdrCommands.map((command) => command.name.slice(6)));
        throw new UsageError(`Unknown command "herdr ${second}".`, near ? `Did you mean \`peerband herdr ${near}\`?` : "Use `peerband herdr install` or `peerband herdr uninstall`.");
      }
      words = [first, second];
      args = others;
    }
    const spec11 = lookup(words);
    if (!spec11) throw unknownCommand(first);
    const parsed = parseArgs(spec11, args);
    if (parsed.values.help) {
      ctx.out.print(commandHelp(ctx.out.stdout, spec11).trimEnd());
      return 0;
    }
    return await spec11.run(parsed, ctx);
  } catch (error) {
    if (error instanceof UsageError) {
      ctx.out.fail(error.message, error.hint);
      return 2;
    }
    if (error instanceof CliError) {
      ctx.out.fail(error.message, error.hint);
      return error.code;
    }
    if (error instanceof ConfigError) {
      ctx.out.fail(error.message, error.hint);
      return 1;
    }
    if (error instanceof PromptAborted) return 130;
    ctx.out.fail(error?.message || String(error));
    return 1;
  }
}

// src/cli/main.ts
process.exitCode = await run2(process.argv.slice(2));
