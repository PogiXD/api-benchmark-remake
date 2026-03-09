'use strict';

/**
 * example-grpc.js
 *
 * Demonstrates three benchmark scenarios:
 *   1. Pure HTTP
 *   2. Pure gRPC
 *   3. Mixed HTTP vs gRPC (head-to-head comparison)
 *
 * Prerequisites:
 *   npm install @grpc/grpc-js @grpc/proto-loader
 */

var benchmark = require('./index');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pure HTTP  (existing behaviour, unchanged)
// ─────────────────────────────────────────────────────────────────────────────
benchmark.measure(
  { restApi: 'http://localhost:3000' },
  {
    getUser:  '/users/1',
    listUsers: { route: '/users', method: 'get' }
  },
  { minSamples: 20 },
  function(err, results){
    console.log('HTTP results:', results);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pure gRPC
//    Service address uses the 'grpc://' prefix → registry picks GrpcAgent
// ─────────────────────────────────────────────────────────────────────────────
benchmark.measure(
  { grpcApi: 'grpc://localhost:50051' },
  {
    // Shorthand: method name == endpoint key
    ping: { protocol: 'grpc', method: 'ping' },

    // Full form with payload and expected status
    getUser: {
      protocol:           'grpc',
      method:             'getUser',
      data:               { id: 1 },
      headers:            { 'x-token': 'secret' },
      expectedStatusCode: 0           // gRPC OK
    }
  },
  { minSamples: 30, debug: true },
  function(err, results){
    console.log('gRPC results:', results);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Mixed: compare HTTP REST vs gRPC for the same logical operation
//    Both services handle "getUser" — the fastest wins.
// ─────────────────────────────────────────────────────────────────────────────
benchmark.compare(
  {
    'REST  API': 'http://localhost:3000',
    'gRPC  API': 'grpc://localhost:50051'
  },
  {
    getUser: [
      // When the service is HTTP  → use this definition
      { protocol: 'http', route: '/users/1', method: 'get' },
      // When the service is gRPC  → use this definition
      { protocol: 'grpc', method: 'getUser', data: { id: 1 } }
    ]
  },
  { minSamples: 50, runMode: 'sequence' },
  function(err, results){
    if(err){ return console.error('Error:', err); }

    console.log('\n=== Mixed HTTP vs gRPC Results ===');
    console.log(JSON.stringify(results, null, 2));

    benchmark.getHtml(results, function(htmlErr, html){
      if(!htmlErr){
        require('fs').writeFileSync('mixed-report.html', html);
        console.log('HTML report saved to mixed-report.html');
      }
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Registering a custom protocol handler (e.g. WebSocket)
// ─────────────────────────────────────────────────────────────────────────────
// var myWsHandler = require('./lib/ws-request-handler');
// var myWsAgent   = require('./lib/ws-agent');
// benchmark.registerHandler('ws', myWsHandler, myWsAgent);
