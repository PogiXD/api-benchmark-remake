'use strict';

var format = require('./format');
var settings = require('./settings');
var _ = require('underscore');

var getRequestOptions = function(suite){
  return {
    expectedStatusCode: suite.endpoint.expectedStatusCode,
    maxMean: suite.endpoint.maxMean,
    maxSingleMean: suite.endpoint.maxSingleMean,
    method: suite.endpoint.operation || suite.endpoint.rpcMethod || suite.endpoint.method
  };
};

var getPayloadValue = function(value, dynamicLabel){
  return _.isFunction(value) ? dynamicLabel : value;
};

var getRequestPayload = function(suite){
  var payloadMap = {
    headers: 'Dynamic headers',
    data: 'Dynamic data',
    requestData: 'Dynamic data',
    query: 'Dynamic query',
    soapHeaders: 'Dynamic SOAP headers'
  };

  return _.reduce(payloadMap, function(suiteRequest, dynamicLabel, key){
    var value = suite.endpoint[key];

    if(value) {
      suiteRequest[key] = getPayloadValue(value, dynamicLabel);
    }

    return suiteRequest;
  }, {});
};

var getRequestObject = function(suite, suiteHref){
  var protocol = suite.endpoint.protocol || 'http';
  var baseReq = _.clone(suite.endpoint);

  return (protocol === 'grpc' || protocol === 'soap')
    ? baseReq
    : _.extend(baseReq, { url: suiteHref });
};

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
        req = getRequestObject(suite, suiteHref),
        suiteOptions = getRequestOptions(suite),
        suiteRequest = getRequestPayload(suite);

    suite.runner.add(suiteName, suiteHref, suiteOptions, suiteRequest, function(done){
      self.make(req, suite, suiteName, requestAgent, done);
    });
  }
};
