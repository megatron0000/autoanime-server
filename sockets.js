const db = require('./db')
const genId = require('./id-generator')
const Error = require('./errors')
const serverGroup = require('./server-group')

/**
 *
 * @param socket {SocketIO} Wraps SocketIO.emit(), so that calls are made in sucession.
 */
function chainSocket(socket) {
  const on = socket.on
  const onWrapper = function () {
    const event = arguments[0]
    const listener = arguments[1]
    const listenerWrapper = function () {
      if (typeof arguments[arguments.length - 1] !== 'function') {
        listener.apply(this, arguments)
      } else {
        const ack = arguments[arguments.length - 1]
        const ackWrapper = function () {
          ack.apply(this, Array.from(arguments))
          chainSocket.dequeue()
        }
        chainSocket.enqueue(
          listener, this, Array.from(arguments).slice(0, arguments.length - 1).concat(ackWrapper))
      }
    }
    on.apply(socket, [event, listenerWrapper])
  }
  socket.on = onWrapper
  return socket
}

chainSocket.queue = []

chainSocket.enqueue = function (listener, self, args) {
  chainSocket.queue.push([listener, self, args])
  if (chainSocket.queue.length === 1) {
    listener.apply(self, args)
  }
}

chainSocket.dequeue = function () {
  chainSocket.queue.shift()
  if (chainSocket.queue.length !== 0) {
    const tuple = chainSocket.queue[0], listener = tuple[0], self = tuple[1], args = tuple[2]
    listener.apply(self, args)
  }
}

/**
 * Expects another module to call with socket.io instance to be configured
 * @param io Socket.io Server
 */
module.exports = function (io) {

  // Initialize doing a scan for next episodes of all animes
  db.get('animes').map(anime => anime.episodes)


  io.on('connection', function (socket) {

    socket = chainSocket(socket)

    socket.on('anime list request', function () {
      socket.emit('anime list data', db.get('animes').value())
    })

    socket.on('anime create/update request',
      /**
       *
       * @param anime {{title: string serverMap: Object active?: boolean _id?: string}}
       * @param cb {Function}
       * @returns {*}
       */
      (anime, cb) => {
        // common for creating and updating
        if (!anime.title) {
          return cb(new Error('Anime must have a title'))
        }
        let out = {}
        out.title = anime.title
        out.serverMap = {}
        for (const serverName of db.get('servers').value()) {
          // null because undefined cannot be stored as json
          out.serverMap[serverName] = anime.serverMap[serverName] || null
        }
        out.active = anime.active ? true : false


        // if update
        if (anime._id) {
          const dbAnime = db.get('animes').find({ _id: anime._id }).value()
          if (!dbAnime) {
            return cb(new Error('No anime exists with supplied id. Cannot update'))
          }
          out.episodes = dbAnime.episodes
          out._id = dbAnime._id
          // Actively search for episodes in anime servers
          serverGroup.getAllEpisodeUrls(out)
            .then(urls => {
              out.episodes.forEach(ep => {
                const matchingUrl = urls.find(url => url.number === ep.number)
                if (matchingUrl) {
                  ep.urls = matchingUrl.urls
                }
              })
              db.get('animes').find({ _id: anime._id }).assign(out).write()
              io.emit('anime list data', db.get('animes').value())
              cb(false)
            })
            .catch(err => cb(new Error(err.message || 'Unknown error in anime update')))


        }
        // else create
        else {
          if (db.get('animes').find({ title: anime.title }).value()) {
            return cb(new Error('Anime with supplied name already exists. Cannot duplicate'))
          }
          out._id = genId()
          out.episodes = []
          // Actively search for episodes in anime servers
          serverGroup.getAllEpisodeUrls(out)
            .then(urls => {
              out.episodes = urls
              db.get('animes').push(out).write()
              io.emit('anime list data', db.get('animes').value())
              cb(false)
            })
            .catch(err => cb(new Error(err.message || 'Unknown error in anime create')))

        }

      })

    socket.on('server create request',
      /**
       *
       * @param serverName {string}
       * @param cb
       * @returns {*}
       */
      (serverName, cb) => {
        if (!serverName) {
          return cb(new Error('Must supply a name for the server'))
        }
        if (db.get('servers').find(elem => elem === serverName).value()) {
          return cb(new Error('A server with supplied name already exists. Cannot have duplicates'))
        }

        db.get('servers').push(serverName).write()

        // Since we are creating a server, anime episodes will not be updated,
        // only their serverMap
        db.get('animes').map(anime => {
          anime.serverMap[serverName] = null
          return anime
        }).write()

        io.emit('anime list data', db.get('animes').value())
        cb(false)


      })

    socket.on('server delete request',
      /**
       *
       * @param serverName {string}
       * @param cb {Function}
       */
      (serverName, cb) => {
        if (typeof serverName !== 'string') {
          return cb(new Error('Must supply a name for the server'))
        }
        if (!db.get('servers').find(elem => elem === serverName).value()) {
          return cb(new Error('No server exists with such name'))
        }

        db.get('servers').remove(server => server === serverName).write()

        db.get('animes').map(anime => {
          anime.episodes.forEach(ep => ep.urls = ep.urls.filter(url => url.server !== serverName))
          delete anime.serverMap[serverName]
          return anime
        }).write()

        io.emit('anime list data', db.get('animes').value())
        cb(false)

      })

    socket.on('episode watch/unwatch request',
      /**
       *
       * @param episodeInfo {{number: number animeTitle: string watched?: boolean}}
       * @param cb {Function}
       */
      (episodeInfo, cb) => {
        const animeQuery = db.get('animes').find({ title: episodeInfo.animeTitle })
        if (!animeQuery.value()) {
          return cb(new Error('No anime exists with supplied title'))
        }
        const episodeQuery = animeQuery.get('episodes').find({ number: episodeInfo.number })
        if (!episodeQuery.value()) {
          return cb(new Error('The supplied anime does not have episode number ' + episodeInfo.number))
        }
        episodeQuery.set('watched', episodeInfo.watched || false).write()
        io.emit('anime list data', db.get('animes').value())
        return cb(false)
      })

    socket.on('link rescan request',
      /**
       *
       * @param req {{animeTitle: string episodeNumber?: number}}
       * @param cb {Function}
       */
      (req, cb) => {
        if (typeof req.animeTitle !== 'string') {
          return cb(new Error('Must specify an anime to rescan'))
        }
        const animeQuery = db.get('animes').find({ title: req.animeTitle })
        if (!animeQuery.value()) {
          return cb(new Error('Supplied anime does not exist: ' + req.animeTitle))
        }
        // Only rescan one episode
        if (typeof req.episodeNumber === 'number') {
          const epQuery = animeQuery.get('episodes').find({ number: req.episodeNumber })
          if (!epQuery.value()) {
            return cb(new Error('Requested episode ' +
              req.episodeNumber + 'does not exist as record from anime' + req.animeTitle))
          }
          serverGroup.getEpisodeUrls(animeQuery.value(), req.episodeNumber)
            .then(urls => {
              epQuery.set('urls', urls).write()
              io.emit('anime list data', db.get('animes').write())
              cb(false, urls)
            })
            .catch(err => cb(new Error(err.message || 'Unknown error in rescanning')))
        }
        // rescan all episodes
        else {
          serverGroup.getAllEpisodeUrls(animeQuery.value())
            .then(fetchedEps => {
              const dbEps = animeQuery.get('episodes').value()
              fetchedEps.forEach(fetchedEp => {
                const correspondentInDb = dbEps.find(ep => ep.number === fetchedEp.number)
                if (correspondentInDb) {
                  correspondentInDb.urls = fetchedEp.urls
                } else {
                  dbEps.push({
                    watched: false,
                    ...fetchedEp
                  })
                }
              })
              animeQuery.set('episodes', dbEps).write()
              io.emit('anime list data', db.get('animes').value())
              cb(false)
            })
            .catch(err => cb(new Error(err.message || 'Unknown error in rescanning')))
        }
      })

    socket.on('anime delete request',
      /**
       * @param animeTitle {string}
       * @param cb {Function}
       */
      (animeTitle, cb) => {
        if (typeof animeTitle !== 'string' || !animeTitle) {
          return cb(new Error('Must specify an anime title to delete'))
        }
        if (!db.get('animes').find({ title: animeTitle }).value()) {
          return cb(new Error('No anime exists with title: ' + animeTitle))
        }
        db.get('animes').remove({ title: animeTitle }).write()
        io.emit('anime list data', db.get('animes').value())
        cb(false)
      })


  })
}

