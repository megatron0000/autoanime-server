const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const assert = require('assert');

const adapter = new FileSync('spec-db.json');
const db = low(adapter);

db.defaults({nameServerMap: {}}).write();
db.set(`nameServerMap.Violet Evergarden.gogoanime`, 'violet-evergarden').write();

const handler = new (require('../server-handler'))('gogoanime');

handler.getLastEpisodeNumber('Violet Evergarden').then(ep => assert.equal(typeof ep, 'number'));
