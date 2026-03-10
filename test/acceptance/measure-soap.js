'use strict';

var apiBenchmark = require('./../../index');
var fs = require('fs');
var http = require('http');
var path = require('path');
var should = require('should');
var soap = require('soap');

describe('measure function with SOAP', function(){

  var server,
      port = 3050,
      serviceUrl = 'http://127.0.0.1:3050/wsdl',
      wsdlPath = path.join(__dirname, '../fixtures/benchmark-service.wsdl'),
      wsdlXml = fs.readFileSync(wsdlPath, 'utf8');

  before(function(done){
    server = http.createServer(function(request, response){
      response.statusCode = 404;
      response.end('Not Found');
    });

    server.listen(port, function(){
      soap.listen(server, '/wsdl', {
        BenchmarkService: {
          BenchmarkPort: {
            GetMessage: function(args){
              return {
                message: 'Hello ' + (args.name || 'World')
              };
            }
          }
        }
      }, wsdlXml);

      done();
    });
  });

  after(function(done){
    server.close(done);
  });

  it('should correctly measure the performances of a SOAP service', function(done) {
    apiBenchmark.measure({ 'SOAP api': serviceUrl }, {
      getMessage: {
        protocol: 'soap',
        wsdl: wsdlPath,
        operation: 'GetMessage',
        requestData: {
          name: 'World'
        }
      }
    }, { minSamples: 2, maxTime: 1 }, function(err, results){
      should.not.exist(err);
      results['SOAP api'].should.not.be.eql(null);
      results['SOAP api'].getMessage.response.type.should.be.eql('text/xml');
      results['SOAP api'].getMessage.options.method.should.be.eql('GetMessage');
      results['SOAP api'].getMessage.request.requestData.name.should.be.eql('World');
      results['SOAP api'].getMessage.href.should.be.eql(serviceUrl + '#GetMessage');
      done();
    });
  });
});