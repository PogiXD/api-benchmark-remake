'use strict';

var format   = require('./format');
var settings = require('./settings');
var _        = require('underscore');

/**
 * grpc-request-handler.js
 *
 * Drop-in counterpart of request-handler.js for gRPC endpoints.
 * The public API is identical (make + setup) so suites-manager.js
 * can swap them transparently via handler-registry.
 */
module.exports = {

  /**
   * make(req, suite, suiteName, grpcAgent, callback)
   *
   * Executes a single gRPC call and normalises the result into the same
   * { err, res } shape that runner.js expects.
   */
  make: function(req, suite, suiteName, grpcAgent, callback){
    grpcAgent.make(req, function(err, response){

      var res = !!response ? {
        header:     response.header,
        statusCode: response.statusCode,
        body:       response.text,
        type:       response.type
      } : false;

      if(err && !res){
        var code = err.code || 'GRPC_ERROR';
        return callback({
          code:    code,
          message: err.message || code
        }, res);
      }

      if(!!suite.endpoint.expectedStatusCode &&
         suite.endpoint.expectedStatusCode !== response.statusCode){
        return callback({
          code:    settings.errorCodes.HTTP_STATUS_CODE_NOT_MATCHING,
          message: format(
            settings.errorMessages.HTTP_STATUS_CODE_NOT_MATCHING,
            suite.endpoint.expectedStatusCode,
            response.statusCode,
            suiteName
          )
        }, res);
      }

      callback(null, res);
    });
  },

  /**
   * setup(suiteName, suiteHref, suite, grpcAgent)
   *
   * Registers the gRPC benchmark step with the runner.
   * suiteHref is the gRPC target address, e.g. "localhost:50051".
   */
  setup: function(suiteName, suiteHref, suite, grpcAgent){
    var self = this,
        req  = _.extend(_.clone(suite.endpoint), { url: suiteHref }),
        suiteOptions = {
          expectedStatusCode: suite.endpoint.expectedStatusCode,
          maxMean:            suite.endpoint.maxMean,
          maxSingleMean:      suite.endpoint.maxSingleMean,
          method:             suite.endpoint.method
        },
        suiteRequest = {};

    if(!!suite.endpoint.headers){
      suiteRequest.headers = _.isFunction(suite.endpoint.headers) ? 'Dynamic headers' : suite.endpoint.headers;
    }

    if(!!suite.endpoint.data){
      suiteRequest.data = _.isFunction(suite.endpoint.data) ? 'Dynamic data' : suite.endpoint.data;
    }

    if(!!suite.endpoint.query){
      suiteRequest.query = _.isFunction(suite.endpoint.query) ? 'Dynamic query' : suite.endpoint.query;
    }

    suite.runner.add(suiteName, suiteHref, suiteOptions, suiteRequest, function(done){
      self.make(req, suite, suiteName, grpcAgent, done);
    });
  }
};
