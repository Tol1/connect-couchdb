'use strict';
var Couch = require('cradle');

module.exports.getConnection = function(opts) {
    return opts.connection || (new(Couch.Connection)(opts.host || '127.0.0.1', opts.port || '5984', {
        auth: {
            username: opts.username,
            password: opts.password
        }
    })).database(opts.name);
};