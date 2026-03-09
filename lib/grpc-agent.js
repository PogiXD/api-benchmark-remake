'use strict';

var grpc       = require('@grpc/grpc-js');
var protoLoader = require('@grpc/proto-loader');
var path       = require('path');
var _          = require('underscore');

// ── Load proto once at module level ──────────────────────────────────────────
var PROTO_PATH = path.join(__dirname, 'grpc-benchmark.proto');

var packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase:     true,
  longs:        String,
  enums:        String,
  defaults:     true,
  oneofs:       true
});

var benchmarkProto = grpc.loadPackageDefinition(packageDef).benchmark;

// ── Cache of open gRPC channels (host:port → stub) ───────────────────────────
var clientCache = {};

function getClient(target, credentials) {
  if (!clientCache[target]) {
    clientCache[target] = new benchmarkProto.BenchmarkService(
      target,
      credentials || grpc.credentials.createInsecure()
    );
  }
  return clientCache[target];
}

// ── GrpcAgent constructor ─────────────────────────────────────────────────────
// Mirrors the RequestAgent(agent) constructor so suites-manager can swap it in.
module.exports = function GrpcAgent(options) {
  // options may carry { credentials } for TLS support
  this.credentials = (options && options.credentials) || grpc.credentials.createInsecure();

  var self = this;

  var evalIfFunction = function (variable, opts) {
    return _.isFunction(variable) ? variable(opts) : variable;
  };

  /**
   * make(options, callback)
   *
   * options shape (same fields as HTTP endpoint, extended with grpc-specific ones):
   *   url        {string}  – "host:port" (service address)
   *   method     {string}  – logical method name stored in BenchmarkRequest.method
   *   data       {object}  – request payload (serialised to JSON bytes)
   *   headers    {object}  – turned into gRPC metadata key/value pairs
   *   query      {object}  – merged into data (no query-string in gRPC)
   *
   * callback(err, response):
   *   err      – { code, message } on failure, null on success
   *   response – { statusCode, header, text, type } (mirrors superagent shape
   *              so request-handler.js works without modification)
   */
  this.make = function (options, callback) {
    var data    = evalIfFunction(options.data,    options) || {};
    var query   = evalIfFunction(options.query,   options) || {};
    var headers = evalIfFunction(options.headers, options) || {};
    var method  = options.method || 'call';

    // Merge query params into data payload (gRPC has no query string)
    var payload = _.extend({}, data, query);

    // Build gRPC metadata from headers
    var meta = new grpc.Metadata();
    _.forEach(headers, function (value, key) {
      meta.add(String(key), String(value));
    });

    // Build the BenchmarkRequest message
    var request = {
      method:   method,
      payload:  Buffer.from(JSON.stringify(payload)),
      metadata: _.map(headers, function (value, key) {
        return { key: String(key), value: String(value) };
      })
    };

    var client = getClient(options.url, self.credentials);

    client.Call(request, meta, function (err, response) {
      if (err) {
        return callback({
          code:    err.code || 'GRPC_ERROR',
          message: err.message || 'gRPC call failed'
        }, null);
      }

      // Normalise response to mirror superagent's response shape so that
      // request-handler.js can consume it without changes.
      var normalised = {
        statusCode: response.status || 0,
        header:     {},           // gRPC has no HTTP headers on the response
        text:       response.body ? response.body.toString() : '',
        type:       'application/grpc'
      };

      callback(null, normalised);
    });
  };

  /**
   * closeAll()
   * Gracefully close all cached channels. Call this after benchmarking is done.
   */
  this.closeAll = function () {
    _.forEach(clientCache, function (client) {
      grpc.closeClient(client);
    });
    clientCache = {};
  };
};
