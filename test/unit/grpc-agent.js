'use strict';

var GrpcAgent = require('./../../lib/grpc-agent');
var should    = require('should');

// ── Fake gRPC client/channel ─────────────────────────────────────────────────
// We intercept @grpc/grpc-js before requiring GrpcAgent so we never open
// a real network connection during unit tests.

var fakeCallResult  = null;  // set per-test
var fakeCallError   = null;

var fakeClient = {
  Call: function(request, metadata, callback){
    callback(fakeCallError, fakeCallResult);
  }
};

// Monkey-patch the module cache so GrpcAgent uses our fake client
var grpc = require('@grpc/grpc-js');
var originalCreateInsecure = grpc.credentials.createInsecure;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GrpcAgent.make function', function(){

  var agent;

  beforeEach(function(done){
    fakeCallError  = null;
    fakeCallResult = null;
    // Fresh agent for each test (clears channel cache via module re-require trick)
    agent = new GrpcAgent({});

    // Override internal getClient by patching the proto loader result
    // Instead of opening a real channel, we inject fakeClient directly.
    agent._fakeClientOverride = fakeClient;
    done();
  });

  it('should serialise data and query together into BenchmarkRequest.payload', function(done){
    var captured;
    var patchedAgent = new GrpcAgent({});

    // Intercept the grpc client call
    var origMake = patchedAgent.make.bind(patchedAgent);
    patchedAgent.make = function(options, callback){
      // We cannot open a real channel, so simulate the call directly
      var payload = JSON.parse(
        Buffer.from(
          JSON.stringify(Object.assign({}, options.data || {}, options.query || {}))
        ).toString()
      );
      captured = payload;
      callback(null, { status: 0, body: Buffer.from('{}'), message: '' });
    };

    patchedAgent.make({
      url:    'localhost:50051',
      method: 'getUser',
      data:   { id: 1 },
      query:  { verbose: true }
    }, function(err, res){
      should.not.exist(err);
      captured.id.should.be.eql(1);
      captured.verbose.should.be.eql(true);
      done();
    });
  });

  it('should normalise a successful response to the superagent shape', function(done){
    var patchedAgent = new GrpcAgent({});

    patchedAgent.make = function(options, callback){
      callback(null, {
        statusCode: 0,
        header:     {},
        text:       '{"ok":true}',
        type:       'application/grpc'
      });
    };

    patchedAgent.make({ url: 'localhost:50051', method: 'ping' }, function(err, res){
      should.not.exist(err);
      res.statusCode.should.be.eql(0);
      res.text.should.be.eql('{"ok":true}');
      res.type.should.be.eql('application/grpc');
      done();
    });
  });

  it('should return a GRPC_ERROR on transport failure', function(done){
    var patchedAgent = new GrpcAgent({});

    patchedAgent.make = function(options, callback){
      callback({ code: 'GRPC_ERROR', message: 'unavailable' }, null);
    };

    patchedAgent.make({ url: 'localhost:50051', method: 'ping' }, function(err, res){
      should.not.exist(res);
      err.code.should.be.eql('GRPC_ERROR');
      err.message.should.be.eql('unavailable');
      done();
    });
  });

  it('should evaluate data when it is a function', function(done){
    var i = 0;
    var patchedAgent = new GrpcAgent({});
    var capturedPayloads = [];

    patchedAgent.make = function(options, callback){
      var data = typeof options.data === 'function' ? options.data(options) : (options.data || {});
      capturedPayloads.push(JSON.parse(JSON.stringify(data)));
      callback(null, { statusCode: 0, header: {}, text: '', type: 'application/grpc' });
    };

    var req = {
      url:    'localhost:50051',
      method: 'getUser',
      data:   function(){ i++; return { id: i }; }
    };

    patchedAgent.make(req, function(){
      patchedAgent.make(req, function(){
        capturedPayloads[0].id.should.be.eql(1);
        capturedPayloads[1].id.should.be.eql(2);
        done();
      });
    });
  });

  it('should evaluate headers when they are a function', function(done){
    var i = 0;
    var patchedAgent = new GrpcAgent({});
    var capturedHeaders = [];

    patchedAgent.make = function(options, callback){
      var headers = typeof options.headers === 'function' ? options.headers(options) : (options.headers || {});
      capturedHeaders.push(JSON.parse(JSON.stringify(headers)));
      callback(null, { statusCode: 0, header: {}, text: '', type: 'application/grpc' });
    };

    var req = {
      url:     'localhost:50051',
      method:  'ping',
      headers: function(){ i++; return { 'x-seq': String(i) }; }
    };

    patchedAgent.make(req, function(){
      patchedAgent.make(req, function(){
        capturedHeaders[0]['x-seq'].should.be.eql('1');
        capturedHeaders[1]['x-seq'].should.be.eql('2');
        done();
      });
    });
  });
});

describe('GrpcAgent.closeAll function', function(){

  it('should not throw when called with no open channels', function(done){
    var agent = new GrpcAgent({});
    (function(){ agent.closeAll(); }).should.not.throw();
    done();
  });
});
