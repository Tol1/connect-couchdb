'use strict';
var Couch = require('cradle'),
    credentials = require('../test/credentials.json');

var databases = ['connect-couch-underscoretest',
                 'connect-couch-throttle',
                 'connect-couch-reap',
                 'connect-couch-test',
                 'connect-couch-puttest'];
databases.forEach(function (database_name) {
  (new(Couch.Connection)(credentials.host || '127.0.0.1', credentials.port || '5984', {
      auth: {
          username: credentials.username,
          password: credentials.password
      }
  }).database(database_name)).destroy(function(err, result) {});
});