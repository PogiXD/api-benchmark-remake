'use strict';

var handlerRegistry    = require('./../../lib/handler-registry');
var requestHandler     = require('./../../lib/request-handler');
var grpcRequestHandler = require('./../../lib/grpc-request-handler');
var should             = require('should');

describe('handlerRegistry.resolve function', function(){

  describe('protocol detection from service address', function(){

    it('should return the HTTP handler for http:// addresses', function(done){
      var result = handlerRegistry.resolve({ route: '/users' }, 'http://localhost:3000');
      result.protocol.should.be.eql('http');
      result.handler.should.be.eql(requestHandler);
      result.address.should.be.eql('http://localhost:3000');
      done();
    });

    it('should return the HTTP handler for https:// addresses', function(done){
      var result = handlerRegistry.resolve({ route: '/users' }, 'https://api.example.com');
      result.protocol.should.be.eql('https');
      result.handler.should.be.eql(requestHandler);
      done();
    });

    it('should return the gRPC handler for grpc:// addresses', function(done){
      var result = handlerRegistry.resolve({ route: 'getUser' }, 'grpc://localhost:50051');
      result.protocol.should.be.eql('grpc');
      result.handler.should.be.eql(grpcRequestHandler);
      done();
    });

    it('should strip the grpc:// prefix from the address', function(done){
      var result = handlerRegistry.resolve({ route: 'getUser' }, 'grpc://localhost:50051');
      result.address.should.be.eql('localhost:50051');
      done();
    });

    it('should default to HTTP when no scheme is present', function(done){
      var result = handlerRegistry.resolve({ route: '/health' }, 'localhost:3000');
      result.protocol.should.be.eql('http');
      result.handler.should.be.eql(requestHandler);
      done();
    });
  });

  describe('protocol detection from endpoint.protocol field', function(){

    it('should honour endpoint.protocol over the address scheme', function(done){
      var result = handlerRegistry.resolve({ protocol: 'grpc', method: 'ping' }, 'http://localhost:3000');
      result.protocol.should.be.eql('grpc');
      result.handler.should.be.eql(grpcRequestHandler);
      done();
    });

    it('should honour endpoint.protocol=http even on a grpc:// address', function(done){
      var result = handlerRegistry.resolve({ protocol: 'http', route: '/users' }, 'grpc://localhost:50051');
      result.protocol.should.be.eql('http');
      result.handler.should.be.eql(requestHandler);
      done();
    });
  });

  describe('agent assignment', function(){

    it('should return a valid agent for http', function(done){
      var result = handlerRegistry.resolve({ route: '/users' }, 'http://localhost:3000');
      result.agent.should.not.be.eql(null);
      result.agent.make.should.be.a.Function();
      done();
    });

    it('should return a valid agent for grpc', function(done){
      var result = handlerRegistry.resolve({ protocol: 'grpc', method: 'ping' }, 'grpc://localhost:50051');
      result.agent.should.not.be.eql(null);
      result.agent.make.should.be.a.Function();
      done();
    });

    it('should return the same HTTP agent instance across multiple resolves', function(done){
      var r1 = handlerRegistry.resolve({ route: '/a' }, 'http://localhost:3000');
      var r2 = handlerRegistry.resolve({ route: '/b' }, 'http://localhost:3001');
      r1.agent.should.be.eql(r2.agent);
      done();
    });
  });

  describe('custom protocol registration', function(){

    it('should allow registering and resolving a custom protocol', function(done){
      var fakeHandler = { setup: function(){}, make: function(){} };
      var fakeAgent   = { make: function(){} };

      handlerRegistry.register('ws', fakeHandler, fakeAgent);

      var result = handlerRegistry.resolve({ protocol: 'ws' }, 'ws://localhost:8080');
      result.protocol.should.be.eql('ws');
      result.handler.should.be.eql(fakeHandler);
      result.agent.should.be.eql(fakeAgent);
      done();
    });

    it('should throw for an unknown protocol', function(done){
      (function(){
        handlerRegistry.resolve({ protocol: 'ftp' }, 'ftp://localhost');
      }).should.throw(/No handler registered for protocol: ftp/);
      done();
    });
  });
});
