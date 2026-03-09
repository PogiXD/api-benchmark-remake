'use strict';

var format = require('./format');
var settings = require('./settings');
var _ = require('underscore');

module.exports = {
  make: function(req, suite, suiteName, requestAgent, callback){
    requestAgent.make(req, function(err, response){

      var res = false;
      var status;

      if(response){
        res = {
          header: response.header,
          statusCode: (response.statusCode !== undefined ? response.statusCode : response.status),
          body: response.text,
          type: response.type
        };

        if(response.status !== undefined){
          status = response.status;
        } else {
          status = response.statusCode;
        }
      }

      if(err && !res){
        var code = err.code || 'Unknown';

        return callback({
          code: code,
          message: err.message || code
        }, res);
      }

      if(suite.endpoint.expectedStatusCode){
        if(suite.endpoint.expectedStatusCode !== status) {
          return callback({
            code: settings.errorCodes.HTTP_STATUS_CODE_NOT_MATCHING,
            message: format(
              settings.errorMessages.HTTP_STATUS_CODE_NOT_MATCHING,
              suite.endpoint.expectedStatusCode,
              status,
              suiteName
            )
          }, res);
        }
      }

      callback(null, res);
    });
  },
  setup: function(suiteName, suiteHref, suite, requestAgent){
    var self = this,
        protocol = suite.endpoint.protocol || 'http',
        baseReq = _.clone(suite.endpoint),
        req = (protocol === 'grpc')
          ? baseReq
          : _.extend(baseReq, { url: suiteHref }),
        suiteOptions = {
          expectedStatusCode: suite.endpoint.expectedStatusCode,
          maxMean: suite.endpoint.maxMean,
          maxSingleMean: suite.endpoint.maxSingleMean,
          method: suite.endpoint.method
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
      self.make(req, suite, suiteName, requestAgent, done);
    });
  }
};
