'use strict';

var settings = require('./settings');
var _ = require('underscore');

module.exports = {
  checkEndpoints: function(endpoints){
    if(!endpoints || !_.isObject(endpoints) || _.isArray(endpoints) || _.keys(endpoints).length < 1) {
      return (settings.errorMessages.VALIDATION_ENDPOINTS);
		}

    var invalidSoapEndpoint = _.find(endpoints, function(endpoint){
      return !_.isString(endpoint) && endpoint && endpoint.protocol === 'soap' && (!endpoint.wsdl || !endpoint.operation);
    });

    if(invalidSoapEndpoint) {
      return settings.errorMessages.VALIDATION_ENDPOINT_SOAP;
		}

    // Per gli endpoint gRPC permettiamo nomi metodo liberi (RPC),
    // ma ai fini della validazione li trattiamo come 'get'.
    var methods = _.map(endpoints, function(endpoint){
      if (!_.isString(endpoint) && endpoint && endpoint.protocol === 'grpc') {
        return 'get';
      }
      if (!_.isString(endpoint) && endpoint && endpoint.protocol === 'soap') {
        return 'post';
      }
      return _.isString(endpoint) ? 'get' : (endpoint.method || 'get');
    });

    if(_.without(methods, 'get', 'post', 'put', 'head', 'patch', 'delete', 'trace', 'options').length > 0) {
      return (settings.errorMessages.VALIDATION_ENDPOINT_VERB);
		}

    return true;
  },
  checkServices: function(services){
    if(!services || !_.isObject(services) || _.isArray(services) || _.keys(services).length < 1) {
      return (settings.errorMessages.VALIDATION_SERVICES);
		}

    return true;
  },
  checkCallback: function(callback){
    if(!callback || !_.isFunction(callback)){
      throw new Error(settings.errorMessages.VALIDATION_CALLBACK);
		}

    return true;
  }
};
