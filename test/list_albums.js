'use strict';
// Run with: node test/list_albums.js
// Stubs third-party modules (node_modules is absent) and exercises
// ControllerMpd.prototype.listAlbums against two MPD output orderings.

var assert = require('assert');
var path = require('path');
var Module = require('module');

var cacheSets = [];

var stubs = {
  'cache-manager': {
    caching: function () {
      return {
        get: function (key, cb) { cb(null, undefined); },
        set: function (key, value) { cacheSets.push({key: key, value: value}); }
      };
    }
  },
  'kew': {
    defer: function () {
      var d = {};
      d.promise = new Promise(function (resolve, reject) {
        d.resolve = resolve;
        d.reject = reject;
      });
      return d;
    }
  },
  'fast.js': {},
  'fs-extra': {},
  'cue-parser': {},
  'music-metadata': {},
  'v-conf': function VConf () {}
};

var origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) {
    return stubs[request];
  }
  return origLoad.apply(this, arguments);
};

var ControllerMpd = require(path.join(__dirname, '..', 'app', 'plugins', 'music_service', 'mpd', 'index.js'));

var EXPECTED_COMMAND = 'list "album" "group" "albumartist"';

var EXPECTED_ITEMS = [
  {title: 'Abbey Road', artist: 'Beatles', uri: 'albums://Beatles/Abbey%20Road'},
  {title: 'Let It Be', artist: 'Beatles', uri: 'albums://Beatles/Let%20It%20Be'},
  {title: 'Elvis Presley', artist: 'Elvis', uri: 'albums://Elvis/Elvis%20Presley'}
];

var FIXTURES = {
  'group-first (MPD 0.20.22+)': [
    'AlbumArtist: Beatles',
    'Album: Abbey Road',
    'Album: Let It Be',
    'AlbumArtist: Elvis',
    'Album: Elvis Presley',
    ''
  ].join('\n'),
  'album-first (MPD 0.20.21)': [
    'Album: Abbey Road',
    'AlbumArtist: Beatles',
    'Album: Let It Be',
    'AlbumArtist: Beatles',
    'Album: Elvis Presley',
    'AlbumArtist: Elvis',
    ''
  ].join('\n')
};

function runFixture (name, fixture) {
  var recorded = [];
  var controller = new ControllerMpd({
    coreCommand: {},
    logger: {info: function () {}, error: function () {}},
    configManager: {}
  });
  controller.getAlbumArt = function () { return '/albumart'; };
  controller.clientMpd = {
    sendCommand: function (command, cb) {
      recorded.push(String(command));
      cb(null, fixture);
    }
  };
  cacheSets.length = 0;

  return controller.listAlbums(true).then(function (response) {
    assert.deepStrictEqual(recorded, [EXPECTED_COMMAND], name + ': exactly one command: ' + EXPECTED_COMMAND);
    assert.ok(recorded[0].indexOf('search album') < 0, name + ': command must not include search album');

    var items = response.navigation.lists[0].items;
    assert.strictEqual(items.length, 3, name + ': three navigation items');
    var actual = items.map(function (i) {
      return {title: i.title, artist: i.artist, uri: i.uri};
    });
    assert.deepStrictEqual(actual, EXPECTED_ITEMS, name + ': title/artist/uri match');
    items.forEach(function (i) {
      assert.strictEqual(i.year, '', name + ': year is empty');
      assert.strictEqual(i.albumart, '/albumart', name + ': albumart from getAlbumArt');
    });
    assert.strictEqual(cacheSets.length, 1, name + ': response stored in cache once');
    assert.strictEqual(cacheSets[0].key, 'cacheAlbumList', name + ': cache key');
    assert.strictEqual(cacheSets[0].value, response, name + ': cached value is the response');
    console.log('ok - ' + name);
  });
}

var names = Object.keys(FIXTURES);
names.reduce(function (p, name) {
  return p.then(function () { return runFixture(name, FIXTURES[name]); });
}, Promise.resolve()).then(function () {
  console.log('all passed');
  process.exit(0);
}).catch(function (err) {
  console.error(err && err.stack || err);
  process.exit(1);
});
