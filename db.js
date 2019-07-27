const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

/**
 * animes: [{
 *  _id: string
 *  title: string
 *  active?: boolean
 *  episodes: [{
 *    number: number,
 *    watched?: boolean,
 *    urls: [{
 *      server: string
 *      url: string
 *    }]
 *  }]
 *  serverMap: {
 *    <serverName in servers>?: <animeServerName>
 *  }
 * }]
 *
 * servers: [string]
 */

db.defaults({animes: [], servers: []}).write();

module.exports = db;
