'use strict';

var DebugHelper = require('./../../lib/debug-helper');
var SuitesManager = require('./../../lib/suites-manager');
var requestHandler = require('./../../lib/request-handler');
var should = require('should');
var testAgent = require('./../fixtures/test-agent');
var testData = require('./../fixtures/test-data');
var _ = require('underscore');

var fakeAgent = new testAgent.FakeAgent(),
    debugHelper = new DebugHelper(),
    agents = {
      http: fakeAgent,
  grpc: { make: function () {} },
  soap: { make: function () {} }
    };

describe('SuitesManager.addEndpoints function', function(){

  it('should correctly handle headers for specific endpoints', function(done) {

    var suites = new SuitesManager(agents, debugHelper);

    suites.addEndpoints({ routeName: { route: '/route', method: 'get', headers: { 'name': 'value' } }});

    _.find(suites.routes, function(route){
      return route.name === 'routeName';
    }).endpoint.headers.should.be.eql({ name: 'value'});

    done();
  });
});

describe('SuitesManager.logFinalComparisonResult function', function(){

  var FakeLogger = function(){

    this.logStack = [];

    var self = this;

    this.simpleLog = function(message){
      self.log(message);
    };

    this.log = function(message){
      self.logStack.push(message);
    };

  };

  it('should correctly log the faster in case of comparison', function(done) {

    var results = {
      'Slow server': {
        simpleRoute: {
          name: 'Slow server/simpleRoute',
          stats: [],
          hz: 4.831093764217758,
          href: 'http://localhost:3006/getJson'
        },
        isSlowest: true
      },
      'Fast server': {
        simpleRoute: {
          name: 'Fast server/simpleRoute',
          stats: [],
          hz: 217.14933595635625,
          href: 'http://localhost:3007/getJson'
        },
        isFastest: true
      }
    };

    var fakeLogger = new FakeLogger(),
        suites = new SuitesManager(agents, fakeLogger);

    suites.logFinalComparisonResult(results);

    fakeLogger.logStack[0].should.be.eql('Fastest Service is Fast server');
    done();
  });

  it('should not log anything in case of a single service', function(done) {

    var results = {
      'Slow server': {
        simpleRoute: {
          name: 'Slow server/simpleRoute',
          stats: [],
          hz: 4.831093764217758,
          href: 'http://localhost:3006/getJson'
        },
        isFastest: true
      }
    };

    var fakeLogger = new FakeLogger(),
      suites = new SuitesManager(agents, fakeLogger);

    suites.logFinalComparisonResult(results);

    fakeLogger.logStack.length.should.be.eql(0);
    done();
  });

});

describe('SuitesManager.addServices protocol selection', function () {

  it('should use http agent when protocol is not specified', function (done) {

    var fakeHttpAgent = new testAgent.FakeAgent();
    var fakeGrpcAgent = { make: function () {} };
    var fakeSoapAgent = { make: function () {} };

    var agents = {
      http: fakeHttpAgent,
      grpc: fakeGrpcAgent,
      soap: fakeSoapAgent
    };

    var suites = new SuitesManager(agents, debugHelper);

    var capturedAgent = null;
    var originalSetup = requestHandler.setup;

    // sovrascrivo temporaneamente requestHandler.setup per vedere cosa riceve
    requestHandler.setup = function (routeName, routeHref, route, requestAgent) {
      capturedAgent = requestAgent;
    };

    suites
      .setOptions({})
      .addEndpoints({ simpleRoute: { route: '/getJson', method: 'get' }})
      .addServices({ 'My api': 'http://localhost:3000/' });

    capturedAgent.should.be.instanceof(require('./../../lib/request-agent'));

    // ripristino la funzione originale
    requestHandler.setup = originalSetup;

    done();
  });

  it('should use grpc agent when endpoint.protocol is "grpc"', function (done) {

    var fakeHttpAgent = new testAgent.FakeAgent();
    var fakeGrpcAgent = { make: function () {} };
    var fakeSoapAgent = { make: function () {} };

    var agents = {
      http: fakeHttpAgent,
      grpc: fakeGrpcAgent,
      soap: fakeSoapAgent
    };

    var suites = new SuitesManager(agents, debugHelper);

    var capturedAgent = null;
    var originalSetup = requestHandler.setup;

    requestHandler.setup = function (routeName, routeHref, route, requestAgent) {
      capturedAgent = requestAgent;
    };

    suites
      .setOptions({})
      .addEndpoints({
        grpcRoute: {
          route: '/UserService/GetUser',
          method: 'post',
          protocol: 'grpc'
        }
      })
      .addServices({ 'My api': 'grpc://localhost:50051/' });

    capturedAgent.should.be.eql(fakeGrpcAgent);

    requestHandler.setup = originalSetup;

    done();
  });

  it('should use soap agent when endpoint.protocol is "soap"', function (done) {

    var fakeHttpAgent = new testAgent.FakeAgent();
    var fakeGrpcAgent = { make: function () {} };
    var fakeSoapAgent = { make: function () {} };

    var agents = {
      http: fakeHttpAgent,
      grpc: fakeGrpcAgent,
      soap: fakeSoapAgent
    };

    var suites = new SuitesManager(agents, debugHelper);

    var capturedAgent = null;
    var capturedRoute = null;
    var originalSetup = requestHandler.setup;

    requestHandler.setup = function (routeName, routeHref, route, requestAgent) {
      capturedAgent = requestAgent;
      capturedRoute = route;
    };

    suites
      .setOptions({})
      .addEndpoints({
        soapRoute: {
          protocol: 'soap',
          wsdl: 'C:/temp/service.wsdl',
          operation: 'GetUser',
          data: { id: 10 }
        }
      })
      .addServices({ 'My api': 'http://localhost:3000/wsdl' });

    capturedAgent.should.be.eql(fakeSoapAgent);
    capturedRoute.endpoint.endpoint.should.be.eql('http://localhost:3000/wsdl');
    capturedRoute.endpoint.requestData.should.be.eql({ id: 10 });

    requestHandler.setup = originalSetup;

    done();
  });

});