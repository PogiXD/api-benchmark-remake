'use strict';

var apiBenchmark   = require('./../../index');
var GrpcTestServer = require('./../fixtures/grpc-test-server');
var should         = require('should');

describe('gRPC measure function', function(){

  var fastServer, slowServer;

  before(function(done){
    fastServer = new GrpcTestServer({ port: 50091, delay: 0   });
    slowServer = new GrpcTestServer({ port: 50092, delay: 100 });

    fastServer.start(function(err){
      if(err){ return done(err); }
      slowServer.start(done);
    });
  });

  after(function(done){
    fastServer.kill(function(){
      slowServer.kill(done);
    });
  });

  // ── basic measure ───────────────────────────────────────────────────────────

  it('should correctly measure the performances of a gRPC service', function(done){
    apiBenchmark.measure(
      { myGrpc: 'grpc://localhost:50091' },
      { ping: { protocol: 'grpc', method: 'ping' } },
      { minSamples: 5 },
      function(err, results){
        should.not.exist(err);
        results.myGrpc.should.not.be.eql(null);
        done();
      }
    );
  });

  it('should collect the correct number of samples', function(done){
    apiBenchmark.measure(
      { myGrpc: 'grpc://localhost:50091' },
      { ping: { protocol: 'grpc', method: 'ping' } },
      { minSamples: 10, maxTime: 30, runMode: 'sequence' },
      function(err, results){
        results.myGrpc.ping.stats.sample.length.should.be.eql(10);
        done();
      }
    );
  });

  it('should store the method name in the result options', function(done){
    apiBenchmark.measure(
      { myGrpc: 'grpc://localhost:50091' },
      { getUser: { protocol: 'grpc', method: 'getUser', data: { id: 1 } } },
      { minSamples: 5 },
      function(err, results){
        results.myGrpc.getUser.options.method.should.be.eql('getUser');
        done();
      }
    );
  });

  it('should store static data in the result request', function(done){
    apiBenchmark.measure(
      { myGrpc: 'grpc://localhost:50091' },
      { createUser: { protocol: 'grpc', method: 'createUser', data: { name: 'Alice' } } },
      { minSamples: 5 },
      function(err, results){
        results.myGrpc.createUser.request.data.name.should.be.eql('Alice');
        done();
      }
    );
  });

  it('should raise maxMean error when the service is too slow', function(done){
    apiBenchmark.measure(
      { myGrpc: 'grpc://localhost:50092' },   // 100 ms delay
      { ping: { protocol: 'grpc', method: 'ping', maxMean: 0.05 } },
      { minSamples: 2 },
      function(err, results){
        err.should.be.eql('Mean should be below 0.05');
        should.not.exist(results);
        done();
      }
    );
  });

  it('should collect errors without stopping when stopOnError is false', function(done){
    apiBenchmark.measure(
      { myGrpc: 'grpc://localhost:50092' },
      { ping: { protocol: 'grpc', method: 'ping', maxMean: 0.05 } },
      { minSamples: 2, stopOnError: false },
      function(err, results){
        results.myGrpc.should.not.be.eql(null);
        results.myGrpc.ping.errors['maxMeanExceeded'].length.should.be.above(0);
        done();
      }
    );
  });

  it('should work without the optional options parameter', function(done){
    apiBenchmark.measure(
      { myGrpc: 'grpc://localhost:50091' },
      { ping: { protocol: 'grpc', method: 'ping' } },
      function(err, results){
        results.myGrpc.should.not.be.eql(null);
        done();
      }
    );
  });
});

// ── mixed HTTP + gRPC compare ──────────────────────────────────────────────────

describe('mixed HTTP vs gRPC compare function', function(){

  var grpcServer;
  var httpServers;
  var TestServers = require('http-test-servers');

  var httpEndpoints = {
    getJson: '/getJson'
  };

  before(function(done){
    grpcServer = new GrpcTestServer({ port: 50093, delay: 0 });

    var serversToStart = new TestServers(
      httpEndpoints,
      { 'REST API': { port: 3099, delay: 0 } }
    );

    grpcServer.start(function(err){
      if(err){ return done(err); }
      serversToStart.start(function(started){
        httpServers = started;
        done();
      });
    });
  });

  after(function(done){
    grpcServer.kill(function(){
      httpServers.kill(done);
    });
  });

  it('should benchmark HTTP and gRPC services side-by-side and pick a fastest', function(done){
    apiBenchmark.compare(
      {
        'REST API': 'http://localhost:3099',
        'gRPC API': 'grpc://localhost:50093'
      },
      {
        httpOp: { protocol: 'http', route: '/getJson',  method: 'get' },
        grpcOp: { protocol: 'grpc', method: 'getJson' }
      },
      { minSamples: 5 },
      function(err, results){
        should.not.exist(err);
        results['REST API'].should.not.be.eql(null);
        results['gRPC API'].should.not.be.eql(null);
        done();
      }
    );
  });
});
