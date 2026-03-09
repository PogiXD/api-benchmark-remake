'use strict';

/**
 * grpc-test-server.js
 *
 * A minimal in-process gRPC server that implements BenchmarkService.Call.
 * Used exclusively by acceptance tests — mirrors the role of http-test-servers
 * for HTTP acceptance tests.
 *
 * Usage:
 *   var GrpcTestServer = require('./grpc-test-server');
 *   var server = new GrpcTestServer({ port: 50099, delay: 0 });
 *   server.start(function(){ ... });
 *   server.kill(function(){ ... });
 */

var grpc        = require('@grpc/grpc-js');
var protoLoader = require('@grpc/proto-loader');
var path        = require('path');

var PROTO_PATH = path.join(__dirname, '../../lib/grpc-benchmark.proto');

var packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});

var benchmarkProto = grpc.loadPackageDefinition(packageDef).benchmark;

// ── Service implementation ────────────────────────────────────────────────────

function makeImpl(delay) {
  return {
    Call: function(call, callback){
      var method  = call.request.method || 'unknown';
      var payload = {};

      try {
        if(call.request.payload && call.request.payload.length > 0){
          payload = JSON.parse(call.request.payload.toString());
        }
      } catch(e){ /* ignore parse errors */ }

      var respond = function(){
        callback(null, {
          status:  0,
          body:    Buffer.from(JSON.stringify({ method: method, echo: payload })),
          message: 'OK'
        });
      };

      if(delay > 0){ setTimeout(respond, delay); }
      else         { respond(); }
    }
  };
}

// ── GrpcTestServer ────────────────────────────────────────────────────────────

module.exports = function GrpcTestServer(options){
  var port  = options.port  || 50051;
  var delay = options.delay || 0;
  var server;

  this.start = function(callback){
    server = new grpc.Server();
    server.addService(benchmarkProto.BenchmarkService.service, makeImpl(delay));
    server.bindAsync(
      '0.0.0.0:' + port,
      grpc.ServerCredentials.createInsecure(),
      function(err){
        if(err){ return callback(err); }
        server.start();
        callback(null);
      }
    );
  };

  this.kill = function(callback){
    if(!server){ return callback(); }
    server.tryShutdown(callback);
  };
};
