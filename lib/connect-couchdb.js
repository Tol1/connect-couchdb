'use strict';
var couch = require('./couchdb'),
  util = require('util');

module.exports = function(connect) {
    var Store = connect.session.Store;

    function ConnectCouchDB(opts, fn)  {
        opts = opts || {};
        if (fn) {
            console.error('DEPRECATED usage of callback function in ConnectCouchDB\'s constructor');
        }

        Store.call(this, opts);

        this.db = null;
        this.reapInterval = opts.reapInterval || (10 * 60 * 1000);
        this.compactInterval = opts.compactInterval || (5 * 60 * 1000);
        this.setThrottle = opts.setThrottle || 60000;

        // Even when _revs_limit is set to 1, old revisions take up space,
        // therefore, compact the database every once in awhile.
        if (this.reapInterval > 0)
            this._reap = setInterval(this.reap.bind(this), this.reapInterval);
        if (this.compactInterval > 0)
            this._compact = setInterval(this.compact.bind(this), this.compactInterval);

        if (!opts.name && !opts.connection) {
            throw "You must define a database or cradle connection";
        }
        this.db = couch.getConnection(opts);
    }

    function _check_error(err) {
        if (err !== null) {
            console.log("connect-couchdb error:");
            console.log(err);
            console.log(new Error().stack);
        }
    }

    function _uri_encode(id) {
        // starting storage key with undescore is reserved. See issue #24.
        var prefix = 'connect-session_';
        // We first decode it to escape any current URI encoding.
        return encodeURIComponent(decodeURIComponent(id.substr(0, prefix.length) === prefix ? '' : prefix) + id);
    }

    util.inherits(ConnectCouchDB, Store);

    ConnectCouchDB.prototype.setupOptions = function (opts, fn) {
        if ('revs_limit' in opts) {
            this.db.connection.rawRequest({
                method: 'PUT',
                path: '/' + this.db.name + '/_revs_limit',
                body: opts.revs_limit,
                headers: {
                    'Content-Type': 'application/json'
                }
            }, function(err, resp) {
                _check_error(err);
                fn && fn(err);
            });
        }
        else {
            fn && fn(null);
        }
    };

    ConnectCouchDB.prototype.setupDesignDocs = function (fn) {
        var self = this;

        function createDesignDocs() {
            var ddoc = require('./connect-session.json');
            self.db.save(ddoc, function(err, result) {
                _check_error(err);
                fn && fn(err);
            });
        }

        // Try to get the design doc if it exists
        this.db.get('_design/connect-sessions', function(err, doc) {
            createDesignDocs();
        });
    };

    ConnectCouchDB.prototype.setupDatabase = function (fn) {
        this.db.exists(function(err, exists) {
            if(!err && !exists) {
                this.db.create(function(err) {
                    _check_error(err);
                    fn && fn(err);
                }.bind(this));
            }
            else {
                _check_error(err);
                fn && fn(err);
            }
        }.bind(this));
    };

    ConnectCouchDB.prototype.setup = function (opts, fn) {
        this.setupDatabase(function (err) {
            if (err) return fn && fn(err);
            this.setupDesignDocs(function (err) {
                if (err) return fn && fn(err);
                this.setupOptions(opts, function (err) {
                    fn && fn(err);
                });
            }.bind(this));
        }.bind(this));
    };

    ConnectCouchDB.prototype.get = function (sid, fn) {
        sid = _uri_encode(sid);
        var now = +new Date;
        this.db.get(sid, function (err, doc) {
            if (err) {
                if (err.error == "not_found") err.code = "ENOENT";
                return fn && fn(err);
            } else if (doc.expires && now >= doc.expires) {
                return fn && fn(null, null);
            } else {
                return fn && fn(null, doc.sess);
            }
        }.bind(this));
    };

    ConnectCouchDB.prototype.set = function (sid, sess, fn) {
        sid = _uri_encode(sid);
        fn = fn || function () {};
        // Sometimes sess-object contains also functions as a properties which will be stored to database, and we don't want that
        // So remove them
        sess = JSON.parse(JSON.stringify(sess));
        this.db.get(sid, function (err, doc) {
            var expires = typeof sess.cookie.maxAge === 'number'
                ? (+new Date()) + sess.cookie.maxAge
                : (+new Date()) + (24 * 60 * 60 * 1000);
            if (err) {
                doc = {
                    _id: sid,
                    expires: expires,
                    type: 'connect-session',
                    sess: sess
                };
                this.db.save(doc, fn);
            } else {
                var accessGap = sess.lastAccess - doc.sess.lastAccess;
                // Temporarily remove properties for session comparison
                var _lastAccess = sess.lastAccess;
                var _originalMaxAge = sess.cookie.originalMaxAge;
                if (sess.cookie._expires) {
                    var _expires = sess.cookie._expires;
                    sess.cookie._expires = null;
                }
                if (doc.sess.cookie.expires) {
                    doc.sess.cookie.expires = null;
                }
                sess.lastAccess = null;
                sess.cookie.originalMaxAge = null;
                doc.sess.lastAccess = null;
                doc.sess.cookie.originalMaxAge = null;
                // Compare new session to current session, save if different
                // or setThrottle elapses
                var savedSessString = JSON.stringify(doc.sess),
                  currentSessString = JSON.stringify(sess);
                if (savedSessString !== currentSessString
                    || accessGap > this.setThrottle) {
                    sess.lastAccess = _lastAccess;
                    if (_expires) sess.cookie._expires = _expires;
                    sess.cookie.originalMaxAge = _originalMaxAge;
                    doc.expires = expires;
                    doc.sess = sess;
                    this.db.save(doc, function(err) {
                      if (err && savedSessString !== currentSessString) return fn(err);   //We got problem, try again?
                      return fn();
                    });
                } else {
                    return fn();
                }
            }
        }.bind(this));
    };

    ConnectCouchDB.prototype.destroy = function (sid, fn) {
        sid = _uri_encode(sid);
        this.db.get(sid, function (err, doc) {
            if (err) return fn && fn(err);
            this.db.remove(sid, fn);
        }.bind(this));
    };

    function destroy(docs, fn) {
        var self = this;
        var deleted_docs = [];
        docs.forEach(function(doc) {
            deleted_docs.push({_id: doc.doc._id, _rev: doc.doc._rev, _deleted: true});
        });
        this.db.save(deleted_docs, fn);
    }

    ConnectCouchDB.prototype.clear = function (fn) {
        var options = { reduce: false, include_docs: true };
        this.db.view('connect-sessions/expires', options, function (err, docs) {
            if (err) return fn && fn(err);
            destroy.call(this, docs.rows, fn);
        }.bind(this));
    };

    ConnectCouchDB.prototype.reap = function (fn) {
        var now = +new Date;
        var options = { endkey: now, reduce: false, include_docs: true };
        this.db.view('connect-sessions/expires', options, function (err, docs) {
            if (err) return fn && fn(err);
            destroy.call(this, docs.rows, fn);
        }.bind(this));
    };

    ConnectCouchDB.prototype.length = function (fn) {
        var now = +new Date;
        var options = { startkey: now, reduce: false, include_docs: true };
        this.db.view('connect-sessions/expires', options, function (err, docs) {
            if (err) {
                return fn && fn(err);
            } else {
                return fn && fn(err, docs.total_rows - docs.offset);
            }
        });
    };

    ConnectCouchDB.prototype.compact = function () {
        this.db.connection.rawRequest({
            method: 'POST',
            path: '/' + this.db.name + '/_compact',
            headers: {
                'Content-Type': 'application/json'
            }
        }, function(err) {
            _check_error(err);
        });
    };

    ConnectCouchDB.prototype.clearInterval = function () {
        if (this._reap) clearInterval(this._reap);
        if (this._compact) clearInterval(this._compact);
    };

    return ConnectCouchDB;
};
