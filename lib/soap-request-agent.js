'use strict';

var _ = require('underscore');
var soap = require('soap');

module.exports = function () {

  var evalIfFunction = function (variable, options) {
    return _.isFunction(variable) ? variable(options) : variable;
  };

  var getFault = function (error) {
    return error && error.root && error.root.Envelope && error.root.Envelope.Body
      ? error.root.Envelope.Body.Fault
      : null;
  };

  var getStatusCode = function (httpResponse, error) {
    var fault = getFault(error);

    if (httpResponse && httpResponse.statusCode) {
      return httpResponse.statusCode;
    }

    if (error && error.response && error.response.statusCode) {
      return error.response.statusCode;
    }

    if (fault) {
      return fault.statusCode || 500;
    }

    return 500;
  };

  var getFaultMessage = function (error) {
    var fault = getFault(error);

    if (!error) {
      return 'SOAP request failed';
    }

    if (fault) {
      return (
        fault.faultstring ||
        (fault.Reason && fault.Reason.Text) ||
        error.message ||
        'SOAP fault'
      );
    }

    return error.message || 'SOAP request failed';
  };

  this.make = function (options, callback) {
    var clientOptions = _.extend({}, evalIfFunction(options.clientOptions, options) || {}, {
      endpoint: options.endpoint
    });
    var requestData = evalIfFunction(options.requestData, options) || {};
    var headers = evalIfFunction(options.headers, options) || {};
    var soapHeaders = evalIfFunction(options.soapHeaders, options) || [];
    var callOptions = _.extend({}, evalIfFunction(options.soapOptions, options) || {});

    if (!_.isArray(soapHeaders)) {
      soapHeaders = [soapHeaders];
    }

    soap.createClient(options.wsdl, clientOptions, function (createError, client) {
      if (createError) {
        return callback(createError);
      }

      if (!client[options.operation]) {
        return callback(new Error('SOAP operation not found in wsdl: ' + options.operation));
      }

      if (_.isFunction(client.clearSoapHeaders)) {
        client.clearSoapHeaders();
      }

      _.forEach(soapHeaders, function (soapHeader) {
        client.addSoapHeader(soapHeader);
      });

      client.httpHeaders = {};

      var responseMeta = {
        headers: {},
        statusCode: 200
      };

      if (_.isFunction(client.once)) {
        client.once('response', function (body, response) {
          responseMeta.headers = (response && response.headers) || {};
          responseMeta.statusCode = (response && response.statusCode) || 200;
        });
      }

      client[options.operation](requestData, function (err, result, rawResponse, soapHeader) {
        if (err) {
          var errorResponse = {
            header: (err.response && err.response.headers) || responseMeta.headers || {},
            statusCode: getStatusCode(null, err),
            text: (err.body || getFaultMessage(err)).substring(0, 1000),
            type: 'text/xml'
          };

          err.message = getFaultMessage(err);
          return callback(err, errorResponse);
        }

        var response = {
          header: _.extend({}, responseMeta.headers, soapHeader ? { soap: soapHeader } : {}),
          statusCode: responseMeta.statusCode || 200,
          text: rawResponse || JSON.stringify(result),
          type: 'text/xml'
        };

        callback(null, response);
      }, callOptions, headers);
    });
  };
};