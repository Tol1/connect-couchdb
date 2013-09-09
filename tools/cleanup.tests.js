'use strict';
var Couch = require('cradle'),
    fs = require('fs');

var host,
    port,
    opts = {};
if (fs.existsSync('./test/credentials.json')) {
    var credentials = require('../test/credentials.json');
    host = credentials.host || '127.0.0.1';
    port = credentials.port || '5984';
    opts = {
        auth: {
            username: credentials.username || '',
            password: credentials.password || ''
        }
    };
}

else {
    host = '127.0.0.1';
    port = '5984';
}

var databases = ['connect-couch-underscoretest',
                 'connect-couch-throttle',
                 'connect-couch-reap',
                 'connect-couch-test',
                 'connect-couch-puttest',
                 'connect-couch-queue',
                 'connect-couch-diff'];
databases.forEach(function (database_name) {
  (new(Couch.Connection)(host, port, opts).database(database_name)).destroy(function(err, result) { });
});