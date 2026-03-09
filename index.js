'use strict';

var apiBenchmark    = require('./lib/api-benchmark');
var handlerRegistry = require('./lib/handler-registry');

module.exports         = apiBenchmark;
module.exports.compare = apiBenchmark.compare;
module.exports.measure = apiBenchmark.measure;
module.exports.getHtml = apiBenchmark.getHtml;

/**
 * Register a custom protocol handler at runtime.
 *
 * Example – add a WebSocket handler:
 *   var benchmark = require('api-benchmark');
 *   benchmark.registerHandler('websocket', myWsHandler, myWsAgent);
 */
module.exports.registerHandler = handlerRegistry.register.bind(handlerRegistry);
