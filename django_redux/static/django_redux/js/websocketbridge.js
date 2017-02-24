(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.channels = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
var isWebSocket = function (constructor) {
    return constructor && constructor.CLOSING === 2;
};
var isGlobalWebSocket = function () {
    return typeof WebSocket !== 'undefined' && isWebSocket(WebSocket);
};
var getDefaultOptions = function () { return ({
    constructor: isGlobalWebSocket() ? WebSocket : null,
    maxReconnectionDelay: 10000,
    minReconnectionDelay: 1500,
    reconnectionDelayGrowFactor: 1.3,
    connectionTimeout: 4000,
    maxRetries: Infinity,
    debug: false,
}); };
var bypassProperty = function (src, dst, name) {
    Object.defineProperty(dst, name, {
        get: function () { return src[name]; },
        set: function (value) { src[name] = value; },
        enumerable: true,
        configurable: true,
    });
};
var initReconnectionDelay = function (config) {
    return (config.minReconnectionDelay + Math.random() * config.minReconnectionDelay);
};
var updateReconnectionDelay = function (config, previousDelay) {
    var newDelay = previousDelay * config.reconnectionDelayGrowFactor;
    return (newDelay > config.maxReconnectionDelay)
        ? config.maxReconnectionDelay
        : newDelay;
};
var LEVEL_0_EVENTS = ['onopen', 'onclose', 'onmessage', 'onerror'];
var reassignEventListeners = function (ws, oldWs, listeners) {
    Object.keys(listeners).forEach(function (type) {
        listeners[type].forEach(function (_a) {
            var listener = _a[0], options = _a[1];
            ws.addEventListener(type, listener, options);
        });
    });
    if (oldWs) {
        LEVEL_0_EVENTS.forEach(function (name) { ws[name] = oldWs[name]; });
    }
};
var ReconnectingWebsocket = function (url, protocols, options) {
    var _this = this;
    if (options === void 0) { options = {}; }
    var ws;
    var connectingTimeout;
    var reconnectDelay = 0;
    var retriesCount = 0;
    var shouldRetry = true;
    var savedOnClose = null;
    var listeners = {};
    // require new to construct
    if (!(this instanceof ReconnectingWebsocket)) {
        throw new TypeError("Failed to construct 'ReconnectingWebSocket': Please use the 'new' operator");
    }
    // Set config. Not using `Object.assign` because of IE11
    var config = getDefaultOptions();
    Object.keys(config)
        .filter(function (key) { return options.hasOwnProperty(key); })
        .forEach(function (key) { return config[key] = options[key]; });
    if (!isWebSocket(config.constructor)) {
        throw new TypeError('Invalid WebSocket constructor. Set `options.constructor`');
    }
    var log = config.debug ? function () {
        var params = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            params[_i - 0] = arguments[_i];
        }
        return console.log.apply(console, ['RWS:'].concat(params));
    } : function () { };
    /**
     * Not using dispatchEvent, otherwise we must use a DOM Event object
     * Deferred because we want to handle the close event before this
     */
    var emitError = function (code, msg) { return setTimeout(function () {
        var err = new Error(msg);
        err.code = code;
        if (Array.isArray(listeners.error)) {
            listeners.error.forEach(function (_a) {
                var fn = _a[0];
                return fn(err);
            });
        }
        if (ws.onerror) {
            ws.onerror(err);
        }
    }, 0); };
    var handleClose = function () {
        log('close');
        retriesCount++;
        log('retries count:', retriesCount);
        if (retriesCount > config.maxRetries) {
            emitError('EHOSTDOWN', 'Too many failed connection attempts');
            return;
        }
        if (!reconnectDelay) {
            reconnectDelay = initReconnectionDelay(config);
        }
        else {
            reconnectDelay = updateReconnectionDelay(config, reconnectDelay);
        }
        log('reconnectDelay:', reconnectDelay);
        if (shouldRetry) {
            setTimeout(connect, reconnectDelay);
        }
    };
    var connect = function () {
        log('connect');
        var oldWs = ws;
        ws = new config.constructor(url, protocols);
        connectingTimeout = setTimeout(function () {
            log('timeout');
            ws.close();
            emitError('ETIMEDOUT', 'Connection timeout');
        }, config.connectionTimeout);
        log('bypass properties');
        for (var key in ws) {
            // @todo move to constant
            if (['addEventListener', 'removeEventListener', 'close', 'send'].indexOf(key) < 0) {
                bypassProperty(ws, _this, key);
            }
        }
        ws.addEventListener('open', function () {
            clearTimeout(connectingTimeout);
            log('open');
            reconnectDelay = initReconnectionDelay(config);
            log('reconnectDelay:', reconnectDelay);
            retriesCount = 0;
        });
        ws.addEventListener('close', handleClose);
        reassignEventListeners(ws, oldWs, listeners);
        // because when closing with fastClose=true, it is saved and set to null to avoid double calls
        ws.onclose = ws.onclose || savedOnClose;
        savedOnClose = null;
    };
    log('init');
    connect();
    this.close = function (code, reason, _a) {
        if (code === void 0) { code = 1000; }
        if (reason === void 0) { reason = ''; }
        var _b = _a === void 0 ? {} : _a, _c = _b.keepClosed, keepClosed = _c === void 0 ? false : _c, _d = _b.fastClose, fastClose = _d === void 0 ? true : _d, _e = _b.delay, delay = _e === void 0 ? 0 : _e;
        if (delay) {
            reconnectDelay = delay;
        }
        shouldRetry = !keepClosed;
        ws.close(code, reason);
        if (fastClose) {
            var fakeCloseEvent_1 = {
                code: code,
                reason: reason,
                wasClean: true,
            };
            // execute close listeners soon with a fake closeEvent
            // and remove them from the WS instance so they
            // don't get fired on the real close.
            handleClose();
            ws.removeEventListener('close', handleClose);
            // run and remove level2
            if (Array.isArray(listeners.close)) {
                listeners.close.forEach(function (_a) {
                    var listener = _a[0], options = _a[1];
                    listener(fakeCloseEvent_1);
                    ws.removeEventListener('close', listener, options);
                });
            }
            // run and remove level0
            if (ws.onclose) {
                savedOnClose = ws.onclose;
                ws.onclose(fakeCloseEvent_1);
                ws.onclose = null;
            }
        }
    };
    this.send = function (data) {
        ws.send(data);
    };
    this.addEventListener = function (type, listener, options) {
        if (Array.isArray(listeners[type])) {
            if (!listeners[type].some(function (_a) {
                var l = _a[0];
                return l === listener;
            })) {
                listeners[type].push([listener, options]);
            }
        }
        else {
            listeners[type] = [[listener, options]];
        }
        ws.addEventListener(type, listener, options);
    };
    this.removeEventListener = function (type, listener, options) {
        if (Array.isArray(listeners[type])) {
            listeners[type] = listeners[type].filter(function (_a) {
                var l = _a[0];
                return l !== listener;
            });
        }
        ws.removeEventListener(type, listener, options);
    };
};
module.exports = ReconnectingWebsocket;

},{}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.reduxBridge = exports.webSocketBridge = exports.WebSocketBridge = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _reconnectingWebsocket = require('reconnecting-websocket');

var _reconnectingWebsocket2 = _interopRequireDefault(_reconnectingWebsocket);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var noop = function noop() {};

/**
 * Bridge between Channels and plain javascript.
 *
 * @example
 * const webSocketBridge = new WebSocketBridge();
 * webSocketBridge.connect();
 * webSocketBridge.listen(function(action, stream) {
 *   console.log(action, stream);
 * });
 */

var WebSocketBridge = function () {
  function WebSocketBridge(options) {
    _classCallCheck(this, WebSocketBridge);

    this._socket = null;
    this.streams = {};
    this.default_cb = null;
    this.options = _extends({}, {
      onopen: noop
    }, options);
  }

  /**
   * Connect to the websocket server
   *
   * @param      {String}  [url]     The url of the websocket. Defaults to
   * `window.location.host`
   * @param      {String[]|String}  [protocols] Optional string or array of protocols.
   * @param      {Object} options Object of options for [`reconnecting-websocket`](https://github.com/joewalnes/reconnecting-websocket#options-1).
   * @example
   * const webSocketBridge = new WebSocketBridge();
   * webSocketBridge.connect();
   */


  _createClass(WebSocketBridge, [{
    key: 'connect',
    value: function connect(url, protocols, options) {
      var _url = void 0;
      if (url === undefined) {
        // Use wss:// if running on https://
        var scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
        _url = scheme + '://' + window.location.host + '/ws';
      } else {
        _url = url;
      }
      this._socket = new _reconnectingWebsocket2.default(_url, protocols, options);
    }

    /**
     * Starts listening for messages on the websocket, demultiplexing if necessary.
     *
     * @param      {Function}  [cb]         Callback to be execute when a message
     * arrives. The callback will receive `action` and `stream` parameters
     *
     * @example
     * const webSocketBridge = new WebSocketBridge();
     * webSocketBridge.connect();
     * webSocketBridge.listen(function(action, stream) {
     *   console.log(action, stream);
     * });
     */

  }, {
    key: 'listen',
    value: function listen(cb) {
      var _this = this;

      this.default_cb = cb;
      this._socket.onmessage = function (event) {
        var msg = JSON.parse(event.data);
        var action = void 0;
        var stream = void 0;

        if (msg.stream !== undefined) {
          action = msg.payload;
          stream = msg.stream;
          var stream_cb = _this.streams[stream];
          stream_cb ? stream_cb(action, stream) : null;
        } else {
          action = msg;
          stream = null;
          _this.default_cb ? _this.default_cb(action, stream) : null;
        }
      };

      this._socket.onopen = this.options.onopen;
    }

    /**
     * Adds a 'stream handler' callback. Messages coming from the specified stream
     * will call the specified callback.
     *
     * @param      {String}    stream  The stream name
     * @param      {Function}  cb      Callback to be execute when a message
     * arrives. The callback will receive `action` and `stream` parameters.
      * @example
     * const webSocketBridge = new WebSocketBridge();
     * webSocketBridge.connect();
     * webSocketBridge.listen();
     * webSocketBridge.demultiplex('mystream', function(action, stream) {
     *   console.log(action, stream);
     * });
     * webSocketBridge.demultiplex('myotherstream', function(action, stream) {
     *   console.info(action, stream);
     * });
     */

  }, {
    key: 'demultiplex',
    value: function demultiplex(stream, cb) {
      this.streams[stream] = cb;
    }

    /**
     * Sends a message to the reply channel.
     *
     * @param      {Object}  msg     The message
     *
     * @example
     * webSocketBridge.send({prop1: 'value1', prop2: 'value1'});
     */

  }, {
    key: 'send',
    value: function send(msg) {
      this._socket.send(JSON.stringify(msg));
    }

    /**
     * Returns an object to send messages to a specific stream
     *
     * @param      {String}  stream  The stream name
     * @return     {Object}  convenience object to send messages to `stream`.
     * @example
     * webSocketBridge.stream('mystream').send({prop1: 'value1', prop2: 'value1'})
     */

  }, {
    key: 'stream',
    value: function stream(_stream) {
      var _this2 = this;

      return {
        send: function send(action) {
          var msg = {
            stream: _stream,
            payload: action
          };
          _this2._socket.send(JSON.stringify(msg));
        }
      };
    }
  }]);

  return WebSocketBridge;
}();

/**
 * Convenience singleton for `WebSocketBridge`.
 * @example
 * import { webSocketBridge } from 'django_redux';
 *
 * webSocketBridge.connect();
 * webSocketBridge.listen(function(action, stream) { console.log(action) });
 *
 * @type       {WebSocketBridge}
 */


exports.WebSocketBridge = WebSocketBridge;
var webSocketBridge = exports.webSocketBridge = new WebSocketBridge();

/**
 * Bridge between Channels and Redux.
 * By default dispatches actions received from channels to the redux store.
 *
 * @example
 * const reduxBridge = new ReduxBridge();
 * reduxBridge.connect();
 * reduxBridge.listen(store);
 */

var ReduxBridge = function (_WebSocketBridge) {
  _inherits(ReduxBridge, _WebSocketBridge);

  function ReduxBridge(options) {
    _classCallCheck(this, ReduxBridge);

    options = _extends({}, {
      onreconnect: noop
    }, options);
    return _possibleConstructorReturn(this, (ReduxBridge.__proto__ || Object.getPrototypeOf(ReduxBridge)).call(this, options));
  }

  /**
   * Starts listening for messages on the websocket, demultiplexing if necessary.
   *
   * @param      {Object}  store         Your redux store.
   * @param      {Function}  [cb]         Callback to be execute when a message
   * arrives. The callback will receive `store`, `action` and `stream` parameters.
   * By default it will call `store.dispatch(action)`;
   *
   * @example
   * const webSocketBridge = new WebSocketBridge();
   * webSocketBridge.connect();
   * webSocketBridge.listen(store);
   */


  _createClass(ReduxBridge, [{
    key: 'listen',
    value: function listen(store) {
      var _this4 = this;

      var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.storeDispatch;

      this.default_cb = cb;
      this._socket.onmessage = function (event) {
        var msg = JSON.parse(event.data);
        var action = void 0;
        var stream = void 0;
        if (msg.stream !== undefined && _this4.streams[msg.stream] !== undefined) {
          action = msg.payload;
          stream = msg.stream;
          var stream_cb = _this4.streams[stream];
          stream_cb(store, action, stream);
        } else {
          action = msg;
          stream = null;
          _this4.default_cb(store, action, stream);
        }
      };

      this._socket.onopen = function () {
        var state = store.getState();

        if (state.currentUser !== null) {
          // the connection was dropped. Call the recovery logic
          _this4.options.onreconnect(state);
        }
      };
    }
  }, {
    key: 'storeDispatch',
    value: function storeDispatch(store, action, stream) {
      return store.dispatch(action);
    }
  }]);

  return ReduxBridge;
}(WebSocketBridge);

/**
 * Convenience singleton for `ReduxSocketBridge`.
 * @example
 * import { ReduxBridge } from 'django_redux';
 *
 * ReduxBridge.connect();
 * ReduxBridge.listen(store);
 *
 * @type       {ReduxSocketBridge}
 */


var reduxBridge = exports.reduxBridge = new ReduxBridge();

},{"reconnecting-websocket":1}]},{},[2])(2)
});