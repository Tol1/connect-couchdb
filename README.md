# Connect CouchDB Queue

`connect-couchdb-queue` is a middleware session store for the connect framework.
Motivation for this fork was to avoid race conditions caused by saving all session variables every time one is changed.
Root cause for this is the very simple way Connect handles session variables as one object.
[![Build Status](https://secure.travis-ci.org/Tol1/connect-couchdb-queue.png)](http://travis-ci.org/Tol1/connect-couchdb-queue)

## Requirements

- couchdb 1.2.x
- cradle 0.6.x : the couchdb wrapper. Should be easy to use another one.
- async 0.2.x : queuing couchdb writes, to avoid conflicts
- underscore 1.5.1
- deep-diff 0.1.3 : used to create changesets of session variables
- memory-cache 0.0.5
- node-uuid 1.4.1
- flat 1.0.0
- mocha (only for tests)

## Installation

Via npm:

    $ npm install connect-couchdb-queue

## Usage

    var connect = require('connect'),
        ConnectCouchDB = require('connect-couchdb-queue')(connect);

    var store = new ConnectCouchDB({
      // Name of the database you would like to use for sessions.
      name: 'myapp-sessions',

      // Optional. How often expired sessions should be cleaned up.
      // Defaults to 600000 (10 minutes).
      reapInterval: 600000,

      // Optional. How often to run DB compaction against the session
      // database. Defaults to 300000 (5 minutes).
      // To disable compaction, set compactInterval to -1
      compactInterval: 300000,

      // Optional. How many time between two identical session store
      // Defaults to 60000 (1 minute)
      setThrottle: 60000
    });
    var server = connect.createServer();
    server.use(connect.session({secret: 'YourSecretKey', store: store });

If the database specified doesn't already exist you have to create it with
`tools/` files. Run following command to create database, populate with the
design document and setup the CouchDB database specific option `_revs_limit` :

    $ node tools/setup.js <database_name> <revs_limit> [username] [password]

For more informations about the `_revs_limit` option, read
[this](http://wiki.apache.org/couchdb/HTTP_database_API#Accessing_Database-specific_options).

It is highly recommended that you use a separate database for your
sessions for performance of both the session views and any other document
views you may have.

See `example.js` file for an example connect server using `connect-couch`.

## Updating

Please invoke the tool to create the design documents when updating to insure you are using the last version of the view.

    $ node tools/put_design_docs.js <database_name> [username] [password]

## Tests

    $ npm test

## Author

- Tomi Nokkala ([Tol1](https://github.com/Tol1))

## Contributors

    $ git shortlog -s -n

- Thomas Debarochez ([tdebarochez](https://github.com/tdebarochez))
- Ian Ward ([ianshward](https://github.com/ianshward))
- Young Hahn ([yhahn](https://github.com/yhahn))
- Ryan Kirkman ([ryankirkman](https://github.com/ryankirkman))
- Andreas Lappe ([alappe](https://github.com/alappe))
- Cliffano Subagio ([cliffano](https://github.com/cliffano))
- Dan VerWeire ([wankdanker](https://github.com/wankdanker))
- Daniel Bell ([danbell](https://github.com/danbell))
- Konstantin Käfer ([kkaefer](https://github.com/kkaefer))
- Pau Ramon Revilla ([masylum](https://github.com/masylum))
- Quentin Raynaud ([even](https://github.com/even))
