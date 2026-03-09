'use strict';

var should = require('should');

// Stubbiamo il modulo grpc-request-agent PRIMA di caricare api-benchmark,
// usando la cache di require. In questo modo api-benchmark userà il costruttore finto.
var path = require('path');

var grpcAgentModulePath = require.resolve(path.join(__dirname, '..', '..', 'lib', 'grpc-request-agent'));

require.cache[grpcAgentModulePath] = {
  id: grpcAgentModulePath,
  filename: grpcAgentModulePath,
  loaded: true,
  exports: function () {
    this.make = function (options, callback) {
      var responseBody = {
        id: (options.requestData && options.requestData.id) || 1,
        name: 'Fake gRPC User'
      };

      var response = {
        header: { 'x-fake-grpc': 'true' },
        statusCode: 0,
        text: JSON.stringify(responseBody),
        type: 'application/grpc+json'
      };

      process.nextTick(function () {
        callback(null, response);
      });
    };
  }
};

// Forziamo il ricaricamento di api-benchmark e dell'entry point index
var apiBenchmarkModulePath = require.resolve(path.join(__dirname, '..', '..', 'lib', 'api-benchmark'));
var indexModulePath = require.resolve(path.join(__dirname, '..', '..', 'index'));

delete require.cache[apiBenchmarkModulePath];
delete require.cache[indexModulePath];

var apiBenchmark = require('./../../index');

describe('measure function with gRPC endpoints', function () {

  var servicesToBenchmark = { 'gRPC api': 'grpc://localhost:50051/' };

  var endpoints = {
    grpcRoute: {
      route: '/UserService/GetUser',
      // method viene comunque usato per descrizione; qui possiamo lasciare 'get'
      method: 'get',
      protocol: 'grpc',
      // campi specifici che il GrpcRequestAgent finto userà
      requestData: { id: 42 }
    }
  };

  it('should correctly measure performances of a grpc endpoint', function (done) {

    apiBenchmark.measure(
      servicesToBenchmark,
      { grpcRoute: endpoints.grpcRoute },
      { minSamples: 5, stopOnError: false },
      function (err, results) {

        should.not.exist(err);

        results['gRPC api'].should.not.be.eql(null);

        var routeResult = results['gRPC api'].grpcRoute;

        // abbiamo raccolto i sample per il benchmark
        routeResult.stats.sample.length.should.be.eql(5);

        // href deve essere costruito correttamente da SuitesManager
        routeResult.href.should.be.eql('grpc:///UserService/GetUser');

        // la response deve avere la forma attesa
        routeResult.response.type.should.be.eql('application/grpc+json');
        JSON.parse(routeResult.response.body).should.have.property('id', 42);

        done();
      }
    );
  });
});

