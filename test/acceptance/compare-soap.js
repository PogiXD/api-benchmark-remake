'use strict';

var apiBenchmark = require('./../../index');
var fs = require('fs');
var http = require('http');
var path = require('path');
var should = require('should');
var soap = require('soap');

describe('compare function with SOAP', function(){

  var fastServer,
      slowServer,
      fastPort = 3052,
      slowPort = 3053,
      wsdlPath = path.join(__dirname, '../fixtures/benchmark-service.wsdl'),
      wsdlXml = fs.readFileSync(wsdlPath, 'utf8');

  var createSoapServer = function(port, delay, done){
    var server = http.createServer(function(request, response){
      response.statusCode = 404;
      response.end('Not Found');
    });

    server.listen(port, function(){
      soap.listen(server, '/wsdl', {
        BenchmarkService: {
          BenchmarkPort: {
            GetMessage: function(args, callback){
              setTimeout(function(){
                callback({
                  message: 'Hello ' + (args.name || 'World')
                });
              }, delay);
            }
          }
        }
      }, wsdlXml);

      done(server);
    });
  };

  before(function(done){
    createSoapServer(fastPort, 0, function(server1){
      fastServer = server1;
      createSoapServer(slowPort, 35, function(server2){
        slowServer = server2;
        done();
      });
    });
  });

  after(function(done){
    fastServer.close(function(){
      slowServer.close(done);
    });
  });

  it('should correctly compare SOAP services and identify the fastest one', function(done) {
    var services = {
      'Slow SOAP': 'http://127.0.0.1:' + slowPort + '/wsdl',
      'Fast SOAP': 'http://127.0.0.1:' + fastPort + '/wsdl'
    };

    var routes = {
      getMessage: {
        protocol: 'soap',
        wsdl: wsdlPath,
        operation: 'GetMessage',
        requestData: {
          name: 'Benchmark'
        }
      }
    };

    apiBenchmark.compare(services, routes, { minSamples: 4, maxTime: 2 }, function(err, results){
      should.not.exist(err);
      results['Fast SOAP'].isFastest.should.be.eql(true);
      results['Slow SOAP'].isSlowest.should.be.eql(true);
      results['Fast SOAP'].getMessage.options.method.should.be.eql('GetMessage');
      done();
    });
  });
});