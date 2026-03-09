'use strict';

var DebugHelper = require('./debug-helper');
var htmlConverter = require('./html-converter');
var sanitise = require('./sanitise');
var superagent = require('superagent');
var SuitesManager = require('./suites-manager');
var RequestAgent = require('./request-agent');
var GrpcRequestAgent = require('./grpc-request-agent');

var suites = {
  start: function (services, endpoints, options, callback) {

    var parameters = sanitise.initialInput(services, endpoints, options, callback);

    var httpAgent = superagent;
    var grpcAgent = new GrpcRequestAgent();

    var suites = new SuitesManager(
      {
        http: httpAgent,
        grpc: grpcAgent
      },
      new DebugHelper()
    );

    suites.setOptions(parameters.options)
      .addEndpoints(parameters.endpoints)
      .addServices(parameters.services)
      .onBenchResults(parameters.callback)
      .start();

    return suites;
  }
};

module.exports.compare = module.exports.measure = suites.start;
module.exports.getHtml = htmlConverter.getHtml;