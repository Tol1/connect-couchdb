'use strict';
var assert = require('assert'),
    connect = require('connect'),
    fs = require('fs'),
    ConnectCouchDB = require('../')(connect),
    global_opts = {"name": 'connect-couchdb-' + (+new Date())};

if (fs.existsSync('./test/credentials.json')) {
    var credentials = require('./credentials.json');
    global_opts.username = credentials.username;
    global_opts.password = credentials.password;
    global_opts.host = credentials.host;
    global_opts.port = credentials.port;
}

function reason(err) {
    return !err ? '' : err.reason;
}

describe('connect-session.json', function () {
    it('is a valid json', function (done) {
        assert.doesNotThrow(function () {
            fs.readFile('lib/connect-session.json', function (err, data) {
                assert.ok(!err, reason(err));
                JSON.parse(data.toString());
                done();
            });
        });
    });
});
describe('db', function () {
    it('put only if needed', function (done) {
        var cookieName = 'putIfNeeded';
        var opts = global_opts;
        opts.name = 'connect-couch-puttest';
        var store = new ConnectCouchDB(opts);
        var cookie = { cookie: { maxAge: 2000 }, name: 'nd' };
        store.setup(opts, function (err, res) {
            assert.ok(!err, reason(err));
            store.set(cookieName, cookie, function (err, ok) {
                assert.ok(!err, reason(err));
                // Redefine store.db.put to assure that it's not executed any more:
                store.db._put = store.db.put;
                store.db.put = function (doc, fn) {
                    throw new Error('This put is not needed!');
                };
                store.set(cookieName, cookie, function (err, ok) {
                    assert.ok(!err, reason(err));
                    store.destroy(cookieName, function () {
                        store.length(function (err, len) {
                            assert.equal(0, len, '#set() null');
                            store.clearInterval();
                            done();
                        });
                    });
                });
            });
        });
    });
    // Test basic set/get/clear/length functionality.
    it('set/get/clear/length', function (done) {

        var opts = global_opts;
        var c = { cookie: { maxAge: 2000 }, name: 'tj' };
        opts.name = 'connect-couch-test';
        opts.revs_limit = '2';
        var store = new ConnectCouchDB(opts);
        store.setup(opts, function (err, res) {
            assert.ok(!err, reason(err));
            store.db.connection.rawRequest({
                method: 'GET',
                path: '/' + store.db.name + '/_revs_limit',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, function (err, res, body) {
                assert.ok(!err, reason(err));
                assert.equal(parseInt(body, 10), opts.revs_limit);
                // #set()
                store.set('123', c, function (err, ok) {
                    assert.ok(!err, '#set() got an error');
                    // #get()
                    store.get('123', function (err, data) {
                        assert.ok(!err, '#get() got an error : ' + reason(err));
                        delete data.__connect_couchdb_cache;
                        assert.deepEqual(c, data);
                        // #length()
                        store.length(function (err, len) {
                            assert.ok(!err, '#length() got an error : ' + reason(err));
                            assert.equal(1, len, '#length() with keys : ' + reason(err));
                            // #clear()
                            store.clear(function (err, ok) {
                                assert.ok(!err, '#clear() : ' + reason(err));
                                // #length()
                                store.length(function (err, len) {
                                    assert.ok(!err, reason(err));
                                    assert.equal(0, len, '#length(' + len + ') without keys');
                                    // #set null
                                    store.set('123', c, function () {
                                        store.destroy('123', function () {
                                            store.length(function (err, len) {
                                                assert.ok(!err, reason(err));
                                                assert.equal(0, len, '#set() null');
                                                store.clearInterval();
                                                done();
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
    // Test expired session reaping.
    it('reaping', function (done) {
        var opts = global_opts;
        opts.name = 'connect-couch-reap';
        opts.reapInterval = 500;
        var store = new ConnectCouchDB(opts);
        store.setupDatabase(function (err, res) {
            assert.ok(!err, reason(err));
            store.setupDesignDocs(function (err, res) {
                assert.ok(!err, reason(err));
                store.setupOptions(opts, function (err, res) {
                    assert.ok(!err, reason(err));
                    var cb = function (i) {
                        return function (err) {
                            assert.ok(!err, 'error with #' + i + ' : ' + reason(err));
                        };
                    };
                    store.set('reaping_1', { cookie: { maxAge: 250 } }, cb(1));
                    store.set('reaping_2', { cookie: { maxAge: 250 } }, cb(2));
                    store.set('reaping_3', { cookie: { maxAge: 5000 } }, cb(3));
                    store.set('reaping_4', { cookie: { maxAge: 5000 } }, cb(4));
                    setTimeout(function () {
                        store.length(function (err, len) {
                            assert.ok(!err, reason(err));
                            assert.equal(2, len, '#length(' + len + ') after reap');
                            store.clearInterval();
                            done();
                        });
                    }, 1000);
                });
            });
        });
    });
    // Test session put throttling
    it('throttling', function (done) {
        var cookieName = 'throttling';
        var opts = global_opts;
        opts.name = 'connect-couch-throttle';
        opts.setThrottle = 1000;
        opts.revs_limit = '4';
        var store = new ConnectCouchDB(opts);
        store.setup(opts, function (err, res) {
            assert.ok(!err, reason(err));
            // Set new session
            store.set(cookieName, { cookie: {
                maxAge: 20000, originalMaxAge: 20000 },
                name: 'foo',
                lastAccess: 13253760000000
            }, function (err, ok) {
                assert.ok(!err, reason(err));
                // Set again, now added to locks object in connect-couchdb.js
                store.set(cookieName, { cookie: {
                    maxAge: 20000, originalMaxAge: 19999 },
                    name: 'foo',
                    lastAccess: 13253760000001
                }, function (err, ok) {
                    assert.ok(!err, reason(err));
                    var start = new Date().getTime();
                    store.get(cookieName, function (err, data) {
                        var cacheId = data.__connect_couchdb_cache;
                        delete data.__connect_couchdb_cache;
                        var orig = JSON.parse(JSON.stringify(data));
                        // If we set again now, and less than 1s passes, session should not change
                        store.set(cookieName, { cookie: {
                            maxAge: 20000, originalMaxAge: 19998 },
                            name: 'foo',
                            lastAccess: 13253760000002,
                            __connect_couchdb_cache: cacheId
                        }, function (err, ok) {
                            assert.ok(!err, reason(err));
                            store.get(cookieName, function (err, data) {
                                cacheId = data.__connect_couchdb_cache;
                                delete data.__connect_couchdb_cache;
                                var stop = new Date().getTime();
                                if (stop - start < 1000) {
                                    assert.equal(JSON.stringify(orig), JSON.stringify(data),
                                        'Sub-microsecond session update without data change should be equal'
                                    );
                                } else {
                                    assert.equal(false, JSON.stringify(orig) === JSON.stringify(data),
                                        '> 1s session update without data change should not be equal'
                                    );
                                }
                                // Now delay a second and the session time-related data should change
                                orig = data;
                                start = new Date().getTime();
                                setTimeout(function () {
                                    store.set(cookieName, { cookie: {
                                        maxAge: 20000, originalMaxAge: 19997 },
                                        name: 'foo',
                                        lastAccess: 13253760001003,
                                        __connect_couchdb_cache: cacheId
                                    }, function (err, ok) {
                                        assert.ok(!err, reason(err));
                                        store.get(cookieName, function (err, data) {
                                            var stop = new Date().getTime();
                                            // session data not changed. If two sets occurred < 1s, objects should be identical
                                            if (stop - start < 1000) {
                                                assert.equal(JSON.stringify(orig), JSON.stringify(data),
                                                    'Sub-microsecond session update without data change should be equal'
                                                );
                                            } else {
                                                assert.equal(false, JSON.stringify(orig) === JSON.stringify(data),
                                                    '> 1s session update without data change should not be equal'
                                                );
                                            }
                                            // Now make change to data, session should change no matter what.
                                            store.set(cookieName, { cookie: {
                                                maxAge: 20000, _expires: 13253760000003, originalMaxAge: 19997 },
                                                name: 'bar',
                                                lastAccess: 13253760001003
                                            }, function (err, ok) {
                                                store.get(cookieName, function (err, data) {
                                                    assert.equal(false, JSON.stringify(orig) === JSON.stringify(data),
                                                        'Sub-microsecond session update without data change should be equal'
                                                    );
                                                    store.clearInterval();
                                                    done();
                                                });
                                            });
                                        });
                                    });
                                }, opts.setThrottle + 100);
                            });
                        });
                    });
                });
            });
        });
    });
    it("id leading with underscore", function (done) {
        var cookieName = '_underscore';
        var opts = global_opts;
        opts.name = 'connect-couch-underscoretest';
        var store = new ConnectCouchDB(opts);
        var cookie = { cookie: { maxAge: 2000 }, name: 'nd' };
        store.setup(opts, function (err, res) {
            assert.ok(!err, reason(err));
            store.set(cookieName, cookie, function (err, ok) {
                assert.ok(!err, reason(err));
                store.get(cookieName, function (err, ok) {
                    assert.ok(!err, reason(err));
                    store.clearInterval();
                    done();
                });
            });
        });
    });
    it('queue', function (done) {
        var cookieName = 'queue_1';
        var opts = global_opts;
        opts.name = 'connect-couch-queue';
        var store = new ConnectCouchDB(opts);
        store.setup(opts, function (err, res) {
            assert.ok(!err, reason(err));
            var count = 0;
            var cb = function (i) {
                return function (err) {
                    assert.ok(!err, 'error with #' + i + ' : ' + reason(err));
                    count++;
                    if (count === 4) {
                        store.get(cookieName, function (err, data) {
                            assert.ok(!err, reason(err));
                            assert.equal(data.param, 4, 'Last saved item should be #4');
                            store.clearInterval();
                            done();
                        });
                    }
                };
            };
            store.set(cookieName, { cookie: { maxAge: 2500 }, param: 1 }, cb(1));
            store.set(cookieName, { cookie: { maxAge: 2500 }, param: 2 }, cb(2));
            store.set(cookieName, { cookie: { maxAge: 2500 }, param: 3 }, cb(3));
            store.set(cookieName, { cookie: { maxAge: 2500 }, param: 4 }, cb(4));
        });
    });
    it('diff', function (done) {
        var cookieName = 'diff';
        var opts = global_opts;
        opts.name = 'connect-couch-diff';
        var store = new ConnectCouchDB(opts);
        store.setup(opts, function (err, res) {
            assert.ok(!err, reason(err));
            store.set(cookieName, { cookie: { maxAge: 2500 }, param: 1, another_param: 2 }, function(err, res) {
                assert.ok(!err, reason(err));
                store.get(cookieName, function(err, data) {
                    assert.ok(!err, reason(err));
                    assert.ok(data.hasOwnProperty('__connect_couchdb_cache'));
                    data.param = 2;
                    delete data.another_param;
                    var orig = JSON.parse(JSON.stringify(data));
                    delete orig.__connect_couchdb_cache;
                    store.set(cookieName, data, function(err) {
                        assert.ok(!err, reason(err));
                        store.get(cookieName, function(err, data) {
                            assert.ok(!err, reason(err));
                            var dataClone = JSON.parse(JSON.stringify(data));
                            delete dataClone.__connect_couchdb_cache;
                            assert.equal(JSON.stringify(dataClone), JSON.stringify(orig));
                            done();
                        });
                    });
                });
            });
        });
    });
});
