'use strict';

/**
 * handler-registry.js
 *
 * Maps a protocol name to its (handler, agentFactory) pair.
 *
 * Agents are instantiated lazily on first use to avoid circular-require
 * issues: nothing is require()d at module load time except the two handler
 * files, which have no dependency on handler-registry itself.
 *
 * Built-in protocols:
 *   http  → request-handler  + RequestAgent(superagent)
 *   https → request-handler  + RequestAgent(superagent)
 *   grpc  → grpc-request-handler + GrpcAgent({})
 */

// Handlers are plain objects with no circular deps — safe to require eagerly.
var requestHandler     = require('./request-handler');
var grpcRequestHandler = require('./grpc-request-handler');

// agentFactory() is called once per protocol and the result is cached.
var registry = {
  http: {
    handler:      requestHandler,
    agentFactory: function(){ return new (require('./request-agent'))(require('superagent')); },
    agent:        null
  },
  https: {
    handler:      requestHandler,
    agentFactory: function(){ return new (require('./request-agent'))(require('superagent')); },
    agent:        null
  },
  grpc: {
    handler:      grpcRequestHandler,
    agentFactory: function(){ return new (require('./grpc-agent'))({}); },
    agent:        null
  }
};

// ── Protocol detection ────────────────────────────────────────────────────────

function detect(endpoint, serviceAddress) {
  // 1. Explicit protocol field on the endpoint definition
  if (endpoint.protocol) {
    var proto = endpoint.protocol.toLowerCase();
    var address;
    if (proto === 'grpc') {
      // Strip any scheme so the gRPC client receives a bare "host:port"
      address = serviceAddress.replace(/^[a-z][a-z0-9+\-.]*:\/\//i, '');
    } else {
      // For http/https: if the service address has a grpc:// prefix,
      // replace it with the endpoint's own protocol so superagent gets a
      // valid URL (e.g. grpc://localhost:50093 → http://localhost:50093).
      if (/^grpc:\/\//i.test(serviceAddress)) {
        address = proto + '://' + serviceAddress.replace(/^grpc:\/\//i, '');
      } else {
        address = serviceAddress;
      }
    }
    return { protocol: proto, address: address };
  }

  // 2. grpc:// prefix on the service address
  if (/^grpc:\/\//i.test(serviceAddress)) {
    return {
      protocol: 'grpc',
      address:  serviceAddress.replace(/^grpc:\/\//i, '')
    };
  }

  // 3. http:// or https:// prefix
  var httpMatch = serviceAddress.match(/^(https?):\/\//i);
  if (httpMatch) {
    return { protocol: httpMatch[1].toLowerCase(), address: serviceAddress };
  }

  // 4. Default
  return { protocol: 'http', address: serviceAddress };
}

// ── Public API ────────────────────────────────────────────────────────────────

module.exports = {

  /**
   * resolve(endpoint, serviceAddress)
   * Returns { protocol, address, handler, agent }.
   * The agent is created on first call for that protocol and then reused.
   */
  resolve: function(endpoint, serviceAddress) {
    var detected = detect(endpoint, serviceAddress);
    var entry    = registry[detected.protocol];

    if (!entry) {
      throw new Error('No handler registered for protocol: ' + detected.protocol);
    }

    // Lazy-init: create the agent only the first time it is needed
    if (!entry.agent) {
      entry.agent = entry.agentFactory();
    }

    return {
      protocol: detected.protocol,
      address:  detected.address,
      handler:  entry.handler,
      agent:    entry.agent
    };
  },

  /**
   * register(protocol, handler, agentOrFactory)
   * Add or overwrite a protocol entry.
   * agentOrFactory can be a ready-made agent instance or a zero-argument
   * factory function — both forms are accepted.
   */
  register: function(protocol, handler, agentOrFactory) {
    var isFactory = typeof agentOrFactory === 'function' &&
                    agentOrFactory.length === 0 &&
                    !agentOrFactory.make;   // distinguishes a factory from an agent with a .make method

    registry[protocol.toLowerCase()] = {
      handler:      handler,
      agentFactory: isFactory ? agentOrFactory : function(){ return agentOrFactory; },
      agent:        null  // reset so the new factory is called on next resolve()
    };
  },

  /**
   * closeAll()
   * Gracefully close stateful agents (e.g. open gRPC channels).
   * Only called on agents that have actually been instantiated.
   */
  closeAll: function() {
    Object.keys(registry).forEach(function(proto) {
      var entry = registry[proto];
      if (entry.agent && typeof entry.agent.closeAll === 'function') {
        entry.agent.closeAll();
        entry.agent = null;  // allow fresh agent on next benchmark run
      }
    });
  }
};
