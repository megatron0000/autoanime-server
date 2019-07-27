const getHandler = require('./server-handler')

class ServerGroup {
    /**
     *
     * @constructor
     */
    constructor() {

    }

    /**
     *
     * @param server {string}
     * @return {boolean}
     *
     */
    knowsServer(server) {
        try {
            getHandler(server)
        } catch (e) {
            return false
        }

        return true
    }

    /**
     * Never rejects the return. Filters out unknown servers and urls that could not be collected.
     * Essentially error free, but may return a Promise<empty array> (if all servers fail, etc)
     * @param anime {DatabaseAnime} anime as in database
     * @param serverName {string=} Server name where to look for episodes,
     * or "nullish" to search all servers
     * @return Promise<{number: number urls: {server: string url: string}[]}[]>
     */
    async getAllEpisodeUrls(anime, serverName) {
        try {
            // filter undefined, null
            const servers = Object.keys(anime.serverMap)
                .filter(server => typeof anime.serverMap[server] === 'string')
                .filter(server => this.knowsServer(server))
                .filter(server => typeof serverName === 'string' ? server === serverName : true)

            const handlers = servers.map(server => getHandler(server))

            const outEps = []
            const epNumbers = []

            const listOfUrlSets = await Promise.all(handlers.map(handler => handler.getAllEpisodeUrls(anime)))
            // maps to achieve flattening
            listOfUrlSets.forEach((urlSet, index) => urlSet.forEach(url => {
                if (outEps[url.number]) {
                    outEps[url.number].urls.push({ server: servers[index], url: url.url })
                } else {
                    epNumbers.push(url.number)
                    outEps[url.number] = { number: url.number, urls: [{ server: servers[index], url: url.url }] }
                }
            }))
            return epNumbers.map(epNumber => outEps[epNumber]).sort((a, b) => a.number < b.number ? -1 : 1)
        } catch (e) {
            return []
        }
    }

    /**
     * Never rejects the return. Filters out unknown servers and urls that could not be collected.
     * Essentially error free, but may return a Promise<empty array> (if all servers fail, etc)
     * @param anime {DatabaseAnime} Anime as in database
     * @param episodeNumber {number}
     * @return {Promise<{server: string url: string}[]>}
     */
    async getEpisodeUrls(anime, episodeNumber) {
        try {
            // filter undefined, null
            const servers = Object.keys(anime.serverMap)
                .filter(server => typeof anime.serverMap[server] === 'string')
                .filter(server => this.knowsServer(server))

            const handlers = servers.map(server => getHandler(server))

            const maybeNullUrls = await Promise.all(
                handlers.map(handler => handler.getEpisodeUrl(anime, episodeNumber))
            )

            return maybeNullUrls.map((maybeNullUrl, index) => ({
                server: servers[index],
                url: maybeNullUrl
            })).filter(elem => typeof elem.url === 'string')

        } catch (e) {
            return []
        }

    }
}

module.exports = new ServerGroup()
