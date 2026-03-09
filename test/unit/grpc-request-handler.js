'use strict';

var grpcRequestHandler = require('./../../lib/grpc-request-handler');
var settings           = require('./../../lib/settings');
var should             = require('should');

// ── Fake gRPC agent helpers ──────────────────────────────────────────────────

var makeFakeAgent = function(err, response){
  return {
    make: function(req, callback){
      callback(err, response);
    }
  };
};

var okResponse = {
  statusCode: 0,
  header:     {},
  text:       '{"name":"Alice"}',
  type:       'application/grpc'
};

// ── grpcRequestHandler.make ──────────────────────────────────────────────────

describe('grpcRequestHandler.make function', function(){

  it('should forward a successful gRPC response', function(done){
    var agent = makeFakeAgent(null, okResponse);

    grpcRequestHandler.make({}, { endpoint: {} }, 'svc/getUser', agent, function(err, res){
      should.not.exist(err);
      res.statusCode.should.be.eql(0);
      res.body.should.be.eql('{"name":"Alice"}');
      res.type.should.be.eql('application/grpc');
      done();
    });
  });

  it('should return false as response body on transport error', function(done){
    var agent = makeFakeAgent({ code: 'GRPC_ERROR', message: 'connection refused' }, null);

    grpcRequestHandler.make({}, { endpoint: {} }, 'svc/getUser', agent, function(err, res){
      res.should.be.eql(false);
      err.code.should.be.eql('GRPC_ERROR');
      err.message.should.be.eql('connection refused');
      done();
    });
  });

  it('should use GRPC_ERROR as default code when err.code is missing', function(done){
    var agent = makeFakeAgent({ message: 'something went wrong' }, null);

    grpcRequestHandler.make({}, { endpoint: {} }, 'svc/ping', agent, function(err, res){
      err.code.should.be.eql('GRPC_ERROR');
      done();
    });
  });

  it('should return httpStatusCodeNotMatching when expectedStatusCode does not match', function(done){
    var agent = makeFakeAgent(null, { statusCode: 5, header: {}, text: '', type: 'application/grpc' });

    grpcRequestHandler.make(
      {},
      { endpoint: { expectedStatusCode: 0 } },
      'svc/getUser',
      agent,
      function(err, res){
        res.statusCode.should.be.eql(5);
        err.code.should.be.eql(settings.errorCodes.HTTP_STATUS_CODE_NOT_MATCHING);
        done();
      }
    );
  });

  it('should not error when expectedStatusCode matches the response statusCode', function(done){
    var agent = makeFakeAgent(null, okResponse);  // statusCode: 0

    grpcRequestHandler.make(
      {},
      { endpoint: { expectedStatusCode: 0 } },
      'svc/getUser',
      agent,
      function(err, res){
        should.not.exist(err);
        res.statusCode.should.be.eql(0);
        done();
      }
    );
  });

  it('should correctly map response fields to the normalised shape', function(done){
    var agent = makeFakeAgent(null, {
      statusCode: 0,
      header:     { 'x-custom': 'value' },
      text:       'payload',
      type:       'application/grpc'
    });

    grpcRequestHandler.make({}, { endpoint: {} }, 'svc/call', agent, function(err, res){
      res.header.should.be.eql({ 'x-custom': 'value' });
      res.body.should.be.eql('payload');
      done();
    });
  });
});

// ── grpcRequestHandler.setup ─────────────────────────────────────────────────

describe('grpcRequestHandler.setup function', function(){

  it('should pass the service address as url in the req object', function(done){
    var capturedReq;

    var fakeAgent = {
      make: function(req, callback){
        capturedReq = req;
      }
    };

    var suiteObj = {
      endpoint: { method: 'getUser', data: { id: 42 } },
      runner: {
        add: function(suiteName, suiteHref, suiteOptions, suiteRequest, callback){
          callback();
        }
      }
    };

    grpcRequestHandler.setup('svc/getUser', 'localhost:50051', suiteObj, fakeAgent);

    capturedReq.url.should.be.eql('localhost:50051');
    capturedReq.method.should.be.eql('getUser');
    capturedReq.data.id.should.be.eql(42);
    done();
  });

  it('should store static headers in suiteRequest', function(done){
    var addedRequest;

    var suiteObj = {
      endpoint: { method: 'ping', headers: { 'x-token': 'abc' } },
      runner: {
        add: function(suiteName, suiteHref, suiteOptions, suiteRequest){
          addedRequest = suiteRequest;
        }
      }
    };

    grpcRequestHandler.setup('svc/ping', 'localhost:50051', suiteObj, { make: function(){} });

    addedRequest.headers.should.be.eql({ 'x-token': 'abc' });
    done();
  });

  it('should label dynamic headers as "Dynamic headers" in suiteRequest', function(done){
    var addedRequest;

    var suiteObj = {
      endpoint: { method: 'ping', headers: function(){ return { 'x-token': 'dynamic' }; } },
      runner: {
        add: function(suiteName, suiteHref, suiteOptions, suiteRequest){
          addedRequest = suiteRequest;
        }
      }
    };

    grpcRequestHandler.setup('svc/ping', 'localhost:50051', suiteObj, { make: function(){} });

    addedRequest.headers.should.be.eql('Dynamic headers');
    done();
  });

  it('should store static data in suiteRequest', function(done){
    var addedRequest;

    var suiteObj = {
      endpoint: { method: 'createUser', data: { name: 'Bob' } },
      runner: {
        add: function(suiteName, suiteHref, suiteOptions, suiteRequest){
          addedRequest = suiteRequest;
        }
      }
    };

    grpcRequestHandler.setup('svc/createUser', 'localhost:50051', suiteObj, { make: function(){} });

    addedRequest.data.should.be.eql({ name: 'Bob' });
    done();
  });

  it('should label dynamic data as "Dynamic data" in suiteRequest', function(done){
    var addedRequest;

    var suiteObj = {
      endpoint: { method: 'createUser', data: function(){ return { name: 'dynamic' }; } },
      runner: {
        add: function(suiteName, suiteHref, suiteOptions, suiteRequest){
          addedRequest = suiteRequest;
        }
      }
    };

    grpcRequestHandler.setup('svc/createUser', 'localhost:50051', suiteObj, { make: function(){} });

    addedRequest.data.should.be.eql('Dynamic data');
    done();
  });

  it('should expose maxMean and maxSingleMean in suiteOptions', function(done){
    var addedOptions;

    var suiteObj = {
      endpoint: { method: 'ping', maxMean: 0.5, maxSingleMean: 0.1 },
      runner: {
        add: function(suiteName, suiteHref, suiteOptions){
          addedOptions = suiteOptions;
        }
      }
    };

    grpcRequestHandler.setup('svc/ping', 'localhost:50051', suiteObj, { make: function(){} });

    addedOptions.maxMean.should.be.eql(0.5);
    addedOptions.maxSingleMean.should.be.eql(0.1);
    done();
  });
});
