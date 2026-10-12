'use strict';
// MpdClient.receive buffers socket chunks until the trailing OK, then hands
// the whole string to the command callback. listAlbums splits that string.
// A small reply that names one song several times stays the size of those
// lines. A large flat reply is already resident in this.buffer before the
// callback runs.

var assert = require('assert');
var MpdClient = require('../app/plugins/music_service/mpd/lib/mpd.js');

var LINE = 'file: /mnt/sdb2/music/flac/files/album/track.flac\n';

function feed (client, text, chunkSize) {
  for (var i = 0; i < text.length; i += chunkSize) {
    client.receive(text.slice(i, i + chunkSize));
  }
}

describe('MpdClient.receive', function () {
  it('keeps a small multi-path reply the size of the lines sent', function () {
    var client = new MpdClient();
    var got = null;
    client.msgHandlerQueue.push(function (err, msg) {
      got = msg;
    });
    var body = LINE + LINE + LINE + LINE;
    feed(client, body + 'OK\n', 17);
    assert.strictEqual(got, body);
    assert.strictEqual((got.match(/file:/g) || []).length, 4);
    assert.ok(got.length < 1024, 'four path lines stay under 1 KiB');
    assert.strictEqual(client.buffer, '');
  });

  it('grows the heap in receive before the handler splits the reply', function () {
    var client = new MpdClient();
    var handlerRan = false;
    var splitCount = 0;
    client.msgHandlerQueue.push(function (err, msg) {
      handlerRan = true;
      splitCount = msg.split('\n').length;
    });

    var before = process.memoryUsage().heapUsed;
    var total = 0;
    for (var i = 0; i < 80; i++) {
      var chunk = '';
      for (var j = 0; j < 500; j++) chunk += LINE;
      client.receive(chunk);
      total += chunk.length;
    }

    assert.strictEqual(handlerRan, false);
    assert.strictEqual(client.buffer.length, total);
    var mid = process.memoryUsage().heapUsed;
    assert.ok(
      mid > before + total / 2,
      'heap grew by half the buffered reply before OK; before=' + before + ' mid=' + mid + ' bytes=' + total
    );

    client.receive('OK\n');
    assert.strictEqual(handlerRan, true);
    assert.ok(splitCount > 1000, 'split runs only after OK, and sees every line');
    assert.strictEqual(client.buffer, '');
  });
});
