'use strict';
var Couch = require('cradle');

module.exports.getConnection = function(opts) {
    var cradleopts = {};
    if(opts.username) {
        cradleopts.auth = {
            username: opts.username,
            password: opts.password
        };
    }
    return opts.connection || (new(Couch.Connection)(opts.host || '127.0.0.1', opts.port || '5984', cradleopts)).database(opts.name);
};