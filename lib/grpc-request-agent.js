'use strict';

var _ = require('underscore');
var grpc = require('@grpc/grpc-js');
var protoLoader = require('@grpc/proto-loader');

module.exports = function () {

  // cache client per non ricaricare tutto ogni volta
  var clientsCache = {};

  var getClient = function (options) {
    // options: { protoFile, package, service, address }
    var cacheKey = [
      options.protoFile,
      options.package,
      options.service,
      options.address
    ].join('|');

    if (clientsCache[cacheKey]) {
      return clientsCache[cacheKey];
    }

    var packageDefinition = protoLoader.loadSync(options.protoFile, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });

    var protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    var pkg = options.package.split('.').reduce(function (acc, part) {
      return acc && acc[part];
    }, protoDescriptor);

    if (!pkg || !pkg[options.service]) {
      throw new Error('Service not found in proto: ' + options.package + '.' + options.service);
    }

    var ClientCtor = pkg[options.service];
    var client = new ClientCtor(options.address, grpc.credentials.createInsecure());

    clientsCache[cacheKey] = client;
    return client;
  };

  this.make = function (options, callback) {
    // options:
    //  - protoFile
    //  - package
    //  - service
    //  - method
    //  - address
    //  - requestData
    //  - metadata (opzionale)

    var client;
    try {
      client = getClient(options);
    } catch (e) {
      return callback(e);
    }

    var metadata = new grpc.Metadata();
    var metadataObj = _.isFunction(options.metadata) ? options.metadata(options) : (options.metadata || {});
    _.forEach(metadataObj, function (value, key) {
      metadata.set(key, String(value));
    });

    var requestData = _.isFunction(options.requestData) ? options.requestData(options) : (options.requestData || {});

    var deadline = options.deadline
      ? new Date(Date.now() + options.deadline)
      : undefined;

    var callOptions = {};
    if (deadline) {
      callOptions.deadline = deadline;
    }

    client[options.method](requestData, metadata, callOptions, function (err, resp) {
      if (err) {
        // risposta in caso di errore (forma compatibile con request-handler/superagent)
        var resError = {
          header: {},
          statusCode: err.code, // codice gRPC
          text: (err.details || '').substring(0, 100),
          type: 'application/grpc+error'
        };
        return callback(err, resError);
      }

      var responseMetadata = {}; // non è banale leggerla, tienila vuota per ora

      var response = {
        header: responseMetadata,
        statusCode: 0, // OK
        text: 'gRPC response',
        type: 'application/grpc+json'
      };

      callback(null, response);
    });
  };
};