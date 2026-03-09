'use strict';

var format          = require('./format');
var handlerRegistry = require('./handler-registry');
var ResultsHandler  = require('./results-handler');
var Runner          = require('./runner');
var sanitise        = require('./sanitise');
var settings        = require('./settings');
var url             = require('url');
var validator       = require('./validator');
var _               = require('underscore');

/**
 * suites-manager.js  (protocol-aware)
 *
 * Unchanged public API — addServices() now consults handler-registry to
 * pick the right (handler, agent) pair for each (service, route) combination.
 *
 * Protocol detection (in priority order):
 *   1. endpoint.protocol  – e.g. { protocol: 'grpc', method: 'getUser' }
 *   2. service address prefix – 'grpc://host:port', 'http://…', 'https://…'
 *   3. default -> 'http'
 *
 * Mixed benchmark example:
 *
 *   services = {
 *     restApi: 'http://localhost:3000',
 *     grpcApi: 'grpc://localhost:50051'
 *   }
 *   endpoints = {
 *     getUser: { protocol: 'http', route: '/users/1' },      // forced HTTP
 *     fetchUser: { protocol: 'grpc', method: 'getUser' }     // forced gRPC
 *   }
 */
module.exports = function(agent, debugHelper){

  this.options = {};
  this.current = 0;
  this.routes = [];
  this.services = {};

  return _.extend(this, {

    addEndpoints: function(endpoints){
      if(!this.validate(validator.checkEndpoints, endpoints)) {
        return this;
      }

      _.forEach(endpoints, function(endpoint, endpointName){
        this.routes.push({
          name:     endpointName,
          endpoint: endpoint,
          endpointName: endpointName,
          runner:   new Runner(this.options)
        });
      }, this);

      return this;
    },

    addServices: function(services){
      if(!this.validate(validator.checkServices, services)) {
        return this;
      }

      this.services = services;

      _.forEach(this.services, function(serviceAddress, serviceName){
        _.forEach(this.routes, function(route){

          // Detect protocol first, then sanitise with the right function
          var resolved  = handlerRegistry.resolve(route.endpoint, serviceAddress);
          var routeName = serviceName + '/' + route.name;

          // Apply the correct sanitiser now that we know the protocol
          var sanitisedRoute = _.clone(route);
          if(resolved.protocol === 'grpc'){
            sanitisedRoute.endpoint = sanitise.grpcEndpoint(route.endpointName, route.endpoint);
            resolved.handler.setup(routeName, resolved.address, sanitisedRoute, resolved.agent);
          } else {
            sanitisedRoute.endpoint = sanitise.endpoint(route.endpointName, route.endpoint);
            var routeHref = url.resolve(serviceAddress, sanitisedRoute.endpoint.route);
            resolved.handler.setup(routeName, routeHref, sanitisedRoute, resolved.agent);
          }

        }, this);
      }, this);

      return this;
    },

    handleErrors: function(route){
      var self = this;

      route.runner.on('error', function(error){
        debugHelper.log(format(settings.errorMessages.GENERIC_ERROR, error.details, error.message));

        if(self.options.stopOnError) {
          self.terminate(error.message);
        }
      });
    },

    logCycleResults: function(route){
      route.runner.on('cycle', function(message){
        debugHelper.simpleLog(message);
      });
    },

    logComparisonResult: function(route, callback){
      route.runner.on('complete', function(results){

        var multipleRoutes = _.has(results, '1');

        if(multipleRoutes){
          var fasterName = _.find(results, function(result){
            return result.isFastest === true;
          }).name;

          debugHelper.log(format(settings.successMessages.FASTEST_ENDPOINT, fasterName));
        }
        callback(results);
      });
    },

    logFinalComparisonResult: function(allResults){

      var multipleServers = _.keys(allResults).length > 1;

      if(multipleServers){
        var fasterName = _.compact(_.map(allResults, function(result, key){
          if(result.isFastest === true){
            return key;
          }
        }))[0];

        debugHelper.simpleLog(format(settings.successMessages.FASTEST_SERVICE, fasterName));
      }
    },

    onBenchResults: function(callback){
      this.validate(validator.checkCallback, callback);
      this.callback = callback;

      var self = this,
          resultsHandler = new ResultsHandler(this.services);

      _.forEach(this.routes, function(route, i){

        var isLast = (i === self.routes.length - 1),
            next = self.processNextResult(isLast, resultsHandler);

        self.handleErrors(route);
        self.logCycleResults(route);
        self.logComparisonResult(route, function(results){
          resultsHandler.set(results, route.name);
          next();
        });
      });

      return this;
    },

    getErrorsFromResult: function(allResults){
      var err = {},
          areThereSomeErrors = false;

      _.forEach(allResults, function(service, serviceName){
        _.forEach(service, function(route, routeName){
          if(route.errors && _.keys(route.errors).length > 0){
            areThereSomeErrors = true;

            if(!err[serviceName]) {
              err[serviceName] = {};
            }

            err[serviceName][routeName] = route.errors;
          }
        });
      });
      return areThereSomeErrors ? err : null;
    },

    processNextResult: function(isLast, resultsHandler){

      var self = this;

      return function(){
        if(isLast && !self.callbackDone){
          self.callbackDone = true;
          var allResults = resultsHandler.get();
          self.logFinalComparisonResult(allResults);
          handlerRegistry.closeAll();
          self.callback(self.getErrorsFromResult(allResults), allResults);
        } else {
          self.runNext();
        }
      };
    },

    runNext: function(){
      if(!!this.routes && (this.routes.length) > 0 && !!this.routes[this.current]){
        this.routes[this.current].runner.run();
        this.current++;
      }
    },

    setOptions: function(options){
      this.options = sanitise.options(options);

      if(!this.options.debug) {
        debugHelper.shutUp();
      }

      return this;
    },

    start: function(){
      this.terminateIfNotValid();
      this.current = 0;
      this.runNext();
    },

    terminate: function(err){
      this.error = err;
      this.terminateIfNotValid();
    },

    terminateIfNotValid: function(){
      if(!!this.error && !this.callbackDone){
        this.callbackDone = true;
        return this.callback(this.error, null);
      }
    },

    validate: function(validateFn, input){
      var validationResult = validateFn(input);

      if(validationResult !== true){
        this.error = validationResult;
        return false;
      }

      return true;
    }
  });
};
