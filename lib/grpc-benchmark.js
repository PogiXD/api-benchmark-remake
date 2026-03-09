'use strict';

var DebugHelper      = require('./debug-helper');
var GrpcSuitesManager = require('./grpc-suites-manager');
var htmlConverter    = require('./html-converter');
var sanitise         = require('./sanitise');

/**
 * grpc-benchmark.js
 *
 * Public API surface for gRPC benchmarking.
 * Mirrors api-benchmark.js so the two can be used interchangeably.
 *
 * Usage:
 *
 *   var benchmark = require('api-benchmark');
 *
 *   var services = {
 *     myService: 'localhost:50051'
 *   };
 *
 *   var endpoints = {
 *     getUser: {
 *       method: 'getUser',        // maps to BenchmarkRequest.method
 *       data:   { id: 1 }         // serialised into BenchmarkRequest.payload
 *     },
 *     listUsers: 'listUsers'      // shorthand: method name = endpoint key
 *   };
 *
 *   benchmark.grpc.measure(services, endpoints, { minSamples: 30 }, function(err, results) {
 *     console.log(results);
 *   });
 */
var grpcSuites = {
  start: function(services, endpoints, options, callback) {

    var parameters = sanitise.initialInput(services, endpoints, options, callback);
    var suites     = new GrpcSuitesManager(
      parameters.options.grpcAgentOptions || {},
      new DebugHelper()
    );

    suites
      .setOptions(parameters.options)
      .addEndpoints(parameters.endpoints)
      .addServices(parameters.services)
      .onBenchResults(parameters.callback)
      .start();

    return suites;
  }
};

module.exports.compare = module.exports.measure = grpcSuites.start;
module.exports.getHtml = htmlConverter.getHtml;
