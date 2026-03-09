'use strict';

var DebugHelper   = require('./../../lib/debug-helper');
var SuitesManager = require('./../../lib/suites-manager');
var should        = require('should');
var testAgent     = require('./../fixtures/test-agent');
var _             = require('underscore');

var fakeAgent   = new testAgent.FakeAgent();
var debugHelper = new DebugHelper();

var FakeLogger = function(){
  this.logStack = [];
  var self = this;
  this.simpleLog = function(message){ self.log(message); };
  this.log       = function(message){ self.logStack.push(message); };
  this.shutUp    = function(){};
};

// ── addEndpoints ──────────────────────────────────────────────────────────────

describe('SuitesManager.addEndpoints function', function(){

  it('should correctly handle headers for specific endpoints', function(done){
    var suites = new SuitesManager(fakeAgent, debugHelper);

    suites.addEndpoints({ routeName: { route: '/route', method: 'get', headers: { name: 'value' } }});

    _.find(suites.routes, function(r){ return r.name === 'routeName'; })
      .endpoint.headers.should.be.eql({ name: 'value' });

    done();
  });

  // Bug 2 fix: addEndpoints stores the raw endpoint; sanitise runs in addServices.
  // For a string endpoint, method is set during sanitise — test this via addServices.
  it('should store the raw endpoint as-is for string shortcuts', function(done){
    var suites = new SuitesManager(fakeAgent, debugHelper);

    suites.addEndpoints({ myRoute: '/hello' });

    // The raw value is stored unchanged at addEndpoints time
    _.find(suites.routes, function(r){ return r.name === 'myRoute'; })
      .endpoint.should.be.eql('/hello');

    done();
  });

  it('should apply method="get" default after addServices for HTTP string endpoints', function(done){
    var registry = require('./../../lib/handler-registry');
    var originalResolve = registry.resolve;
    var capturedEndpoint;

    registry.resolve = function(endpoint, serviceAddress){
      var result = originalResolve(endpoint, serviceAddress);
      result.handler = {
        setup: function(name, href, route){
          capturedEndpoint = route.endpoint;
        }
      };
      return result;
    };

    try {
      var suites = new SuitesManager(fakeAgent, debugHelper);
      suites.setOptions({ minSamples: 1, maxTime: 1 });
      suites.addEndpoints({ myRoute: '/hello' });
      suites.addServices({ svc: 'http://localhost:3000' });

      capturedEndpoint.method.should.be.eql('get');
    } finally {
      registry.resolve = originalResolve;
    }

    done();
  });

  it('should create one route per endpoint', function(done){
    var suites = new SuitesManager(fakeAgent, debugHelper);

    suites.addEndpoints({ a: '/a', b: '/b', c: '/c' });

    suites.routes.length.should.be.eql(3);
    done();
  });
});

// ── addServices — protocol dispatch ──────────────────────────────────────────

describe('SuitesManager.addServices protocol dispatch', function(){

  it('should call requestHandler.setup for an http:// service', function(done){
    var setupCalls = [];
    var registry = require('./../../lib/handler-registry');
    var originalResolve = registry.resolve;

    registry.resolve = function(endpoint, serviceAddress){
      var result = originalResolve(endpoint, serviceAddress);
      setupCalls.push({ protocol: result.protocol, address: result.address });
      result.handler = { setup: function(){} };
      return result;
    };

    try {
      var suites = new SuitesManager(fakeAgent, debugHelper);
      suites.setOptions({ minSamples: 1, maxTime: 1 });
      suites.addEndpoints({ getUser: '/users/1' });
      suites.addServices({ myService: 'http://localhost:3000' });

      setupCalls.length.should.be.eql(1);
      setupCalls[0].protocol.should.be.eql('http');
    } finally {
      registry.resolve = originalResolve;
    }

    done();
  });

  it('should call grpcRequestHandler.setup for a grpc:// service', function(done){
    var setupCalls = [];
    var registry = require('./../../lib/handler-registry');
    var originalResolve = registry.resolve;

    registry.resolve = function(endpoint, serviceAddress){
      var result = originalResolve(endpoint, serviceAddress);
      setupCalls.push({ protocol: result.protocol, address: result.address });
      result.handler = { setup: function(){} };
      return result;
    };

    try {
      var suites = new SuitesManager(fakeAgent, debugHelper);
      suites.setOptions({ minSamples: 1, maxTime: 1 });
      suites.addEndpoints({ ping: { protocol: 'grpc', method: 'ping' } });
      suites.addServices({ myGrpc: 'grpc://localhost:50051' });

      setupCalls.length.should.be.eql(1);
      setupCalls[0].protocol.should.be.eql('grpc');
      setupCalls[0].address.should.be.eql('localhost:50051');
    } finally {
      registry.resolve = originalResolve;
    }

    done();
  });

  it('should dispatch to different handlers for a mixed HTTP + gRPC service map', function(done){
    var setupCalls = [];
    var registry = require('./../../lib/handler-registry');
    var originalResolve = registry.resolve;

    registry.resolve = function(endpoint, serviceAddress){
      var result = originalResolve(endpoint, serviceAddress);
      setupCalls.push(result.protocol);
      result.handler = { setup: function(){} };
      return result;
    };

    try {
      var suites = new SuitesManager(fakeAgent, debugHelper);
      suites.setOptions({ minSamples: 1, maxTime: 1 });
      suites.addEndpoints({
        httpRoute: { protocol: 'http', route: '/users', method: 'get' },
        grpcRoute: { protocol: 'grpc', method: 'getUser' }
      });
      suites.addServices({
        restApi: 'http://localhost:3000',
        grpcApi: 'grpc://localhost:50051'
      });

      // 2 endpoints × 2 services = 4 dispatch calls
      setupCalls.length.should.be.eql(4);
      setupCalls.filter(function(p){ return p === 'http'; }).length.should.be.eql(2);
      setupCalls.filter(function(p){ return p === 'grpc'; }).length.should.be.eql(2);
    } finally {
      registry.resolve = originalResolve;
    }

    done();
  });
});

// ── logFinalComparisonResult ──────────────────────────────────────────────────

describe('SuitesManager.logFinalComparisonResult function', function(){

  it('should correctly log the fastest service in case of comparison', function(done){
    var results = {
      'Slow server': {
        simpleRoute: { name: 'Slow server/simpleRoute', stats: [], hz: 4.8, href: 'http://localhost:3006/getJson' },
        isSlowest: true
      },
      'Fast server': {
        simpleRoute: { name: 'Fast server/simpleRoute', stats: [], hz: 217.1, href: 'http://localhost:3007/getJson' },
        isFastest: true
      }
    };

    var fakeLogger = new FakeLogger();
    var suites     = new SuitesManager(fakeAgent, fakeLogger);

    suites.logFinalComparisonResult(results);

    fakeLogger.logStack[0].should.be.eql('Fastest Service is Fast server');
    done();
  });

  it('should not log anything in case of a single service', function(done){
    var results = {
      'Only server': {
        simpleRoute: { name: 'Only server/simpleRoute', stats: [], hz: 100 },
        isFastest: true
      }
    };

    var fakeLogger = new FakeLogger();
    var suites     = new SuitesManager(fakeAgent, fakeLogger);

    suites.logFinalComparisonResult(results);

    fakeLogger.logStack.length.should.be.eql(0);
    done();
  });
});

// ── getErrorsFromResult ───────────────────────────────────────────────────────

describe('SuitesManager.getErrorsFromResult function', function(){

  it('should return null when there are no errors', function(done){
    var allResults = {
      myService: {
        getUser: { name: 'myService/getUser', errors: {} }
      }
    };

    var suites = new SuitesManager(fakeAgent, debugHelper);
    should.not.exist(suites.getErrorsFromResult(allResults));
    done();
  });

  it('should collect errors grouped by service and route', function(done){
    var allResults = {
      myService: {
        getUser: {
          errors: { GRPC_ERROR: [{ code: 'GRPC_ERROR', message: 'fail', pos: 0 }] }
        }
      }
    };

    var suites  = new SuitesManager(fakeAgent, debugHelper);
    var errors  = suites.getErrorsFromResult(allResults);

    errors.myService.getUser.GRPC_ERROR.length.should.be.eql(1);
    done();
  });
});
