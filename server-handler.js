const request = require('request-promise-native')
const debug = require('debug')('server-handler')
const Error = require('./errors')
const cheerio = require('cheerio')
const inherits = require('util').inherits

/**
 * Interface ServerHandler:
 *
 * // no method rejects the return promise
 * getLastEpisodeNumber(anime: AnimeFromDatabase): Promise<number | undefined>
 *
 * getFirstEpisodeNumber(anime: AnimeFromDatabase): Promise<number | undefined>
 *
 * getEpisodeUrl(anime: AnimeFromDatabase): Promise<string | undefined>
 *
 * // composed only of successfuly gathered episodes. wont happen {number:x, url: undefined}
 * getAllEpisodeUrls(anime: AnimeFromDatabase): Promise<Array<{number: number, url: string}>>
 *
 */


/**
 *
 * @param serverName
 */
module.exports = function getServerHandler(serverName) {
    switch (serverName) {
        case 'gogoanime':
            return new GogoanimeHandler()
        case 'otakustream':
            return new OtakuStreamHandler()
        case 'mangakakalot':
            return new MangaKakalotHander()
        default:
            throw new Error('Tried to get a handler for unknown server ' + serverName)
    }
}

/**
 * @abstract
 */
class ABCHandler {
    /**
     * The returned is never rejected
     * @param anime {?} An anime db object
     * @returns {Promise<number | undefined>}
     */
    getLastEpisodeNumber(anime) {
        throw Error()
    }

    /**
     * The returned is never rejected
     * @param anime
     * @returns {Promise<number | undefined>}
     */
    getFirstEpisodeNumber(anime) {
        throw Error()
    }

    /**
     * The returned is never rejected
     * @param episodeNumber {number}
     * @param anime an anime {?} from db
     * @return {Promise<string | undefined>} the episode url, or null-like if some error
     */
    getEpisodeUrl(anime, episodeNumber) {
        throw Error()
    }

    /**
     * The return is never rejected. Furthermore, no {number, url} object has url undefined
     * @param anime anime as in database
     * @return {Promise<{number: number url: string}[]>}
     */
    getAllEpisodeUrls(anime) {
        throw Error()
    }

}

class GogoanimeHandler extends ABCHandler {
    /**
     * @constructor
     */
    constructor() {
        super()
        this.serverUrl = 'https://www3.gogoanime.se'
        this.serverName = 'gogoanime'
    }

    async getLastEpisodeNumber(anime) {
        const name = anime.serverMap[this.serverName]
        if (!name) {
            return undefined
        }
        debug('anime server name: %o', name)

        try {
            const body = await request.get(this.serverUrl + '/category/' + name)
            const $ = cheerio.load(body)
            return parseInt($('ul#episode_page > li > a').last().attr('ep_end'), 10)
        } catch (e) {
            return undefined
        }
    }

    async getFirstEpisodeNumber(anime) {
        const name = anime.serverMap[this.serverName]
        if (!name) {
            return undefined
        }
        debug('anime server name: %o', name)

        try {
            const body = await request.get(this.serverUrl + '/category/' + name)
            // gogoanime seems to start at 0 (hence +1), but the episodes themselves are right
            return 1 + parseInt(/ep_start\s*=\s*("|')([0-9]+)("|')/.exec(body)[2], 10)
        } catch (e) {
            return undefined
        }
    }

    async getEpisodeUrl(anime, episodeNumber) {
        const name = anime.serverMap[this.serverName]
        if (!name) {
            return undefined
        }
        debug('anime server name: %o', name)

        const attemptUrl = this.serverUrl + '/' + name + '-episode-' + episodeNumber
        return attemptUrl
        /* try {
            const body = await request.get(attemptUrl)
            if (body.match(/page\s+not\s+found/gi)) {
                return undefined
            }
            return attemptUrl
        } catch (e) {
            return undefined
        } */
    }

    async getAllEpisodeUrls(anime) {
        try {

            const [minEp, maxEp] = await Promise.all([
                this.getFirstEpisodeNumber(anime),
                this.getLastEpisodeNumber(anime)
            ])

            if (typeof minEp !== 'number' || typeof maxEp !== 'number' || minEp > maxEp) {
                return []
            }

            const urlPromises = []
            const episodes = []

            for (let i = minEp; i <= maxEp; i++) {
                episodes.push(i)
                urlPromises.push(this.getEpisodeUrl(anime, i))
            }

            const urls = await Promise.all(urlPromises)
            return urls.map((url, index) => ({
                number: episodes[index],
                url: url
            })).filter(epUrl => typeof epUrl.url === 'string').sort((a, b) => a.number < b.number)
        } catch (e) {
            return []
        }
    }
}

class OtakuStreamHandler extends ABCHandler {
    /**
     * @constructor
     */
    constructor() {
        super()
        this.serverUrl = 'https://otakustream.tv'
        this.serverName = 'otakustream'
    }

    async getLastEpisodeNumber(anime) {
        const name = anime.serverMap[this.serverName]
        if (!name) {
            return undefined
        }
        debug('anime server name: %o', name)

        try {
            const body = await request.get(this.serverUrl + '/anime/' + name)
            const $ = cheerio.load(body)
            const text = $('div.ep-list > ul > li > a').first().text()
            return parseInt(/Episode\s+([0-9]+)/.exec(text)[1], 10)
        } catch (e) {
            return undefined
        }
    }

    async getFirstEpisodeNumber(anime) {
        const name = anime.serverMap[this.serverName]
        if (!name) {
            return undefined
        }
        debug('anime server name: %o', name)

        try {
            const body = await request.get(this.serverUrl + '/anime/' + name)
            const $ = cheerio.load(body)
            const text = $('div.ep-list > ul > li > a').last().text()
            return parseInt(/Episode\s+([0-9]+)/.exec(text)[1], 10)
        } catch (e) {
            return undefined
        }
    }

    async getEpisodeUrl(anime, episodeNumber) {
        const name = anime.serverMap[this.serverName]
        if (!name) {
            return undefined
        }
        debug('anime server name: %o', name)

        return `https://otakustream.tv/anime/${name}/episode-${episodeNumber}/`
        /* try {
            const body = await request.get(this.serverUrl + '/anime/' + name)
            const $ = cheerio.load(body)
            let found = false
            $('div.ep-list > ul > li > a').each(function () {
                if ($(this).text() === 'Episode ' + episodeNumber) {
                    found = true
                }
            })
            return found ? `https://otakustream.tv/anime/${name}/episode-${episodeNumber}/` : undefined
        } catch (e) {
            return undefined
        } */
    }

    async getAllEpisodeUrls(anime) {
        try {
            const [minEp, maxEp] = await Promise.all([
                this.getFirstEpisodeNumber(anime),
                this.getLastEpisodeNumber(anime)
            ])

            if (typeof minEp !== 'number' || typeof maxEp !== 'number' || minEp > maxEp) {
                return []
            }

            const urlPromises = []
            const episodes = []

            for (let i = minEp; i <= maxEp; i++) {
                episodes.push(i)
                urlPromises.push(this.getEpisodeUrl(anime, i))
            }

            // filtering breaks the sync between `episodes` and `urlPromises`, hence it is done last
            const urls = await Promise.all(urlPromises)
            return urls.map((url, index) => ({
                number: episodes[index],
                url: url
            })).filter(epUrl => typeof epUrl.url === 'string').sort((a, b) => a.number < b.number)
        } catch (e) {
            return []
        }


    }
}

class MangaKakalotHander extends ABCHandler {
    constructor() {
        super()
        this.serverUrl = 'https://manganelo.com'
        this.serverName = 'mangakakalot'
    }

    async getFirstEpisodeNumber(anime) {
        const name = anime.serverMap[this.serverName]
        if (!name) {
            return undefined
        }

        try {
            const body = await request.get(this.serverUrl + '/manga/' + name)
            const $ = cheerio.load(body)
            const text = $('div.chapter-list > div.row > span > a').last().attr('href')
            return parseFloat(/chapter_(.+)$/.exec(text)[1], 10)
        } catch (e) {
            return undefined
        }
    }

    async getLastEpisodeNumber(anime) {
        const name = anime.serverMap[this.serverName]
        if (!name) {
            return undefined
        }

        try {
            const body = await request.get(this.serverUrl + '/manga/' + name)
            const $ = cheerio.load(body)
            const text = $('div.chapter-list > div.row > span > a').first().attr('href')
            return parseFloat(/chapter_(.+)$/.exec(text)[1], 10)
        } catch (e) {
            return undefined
        }
    }

    async getEpisodeUrl(anime, episodeNumber) {
        const name = anime.serverMap[this.serverName]
        if (!name) {
            return undefined
        }

        try {
            const body = await request.get(this.serverUrl + '/manga/' + name)
            const $ = cheerio.load(body)
            let found = false
            $('div.chapter-list > div.row > span > a').each(function () {
                if ($(this).attr('href').match(new RegExp(`chapter_${episodeNumber}$`))) {
                    found = true
                }
            })
            return found ? `https://manganelo.com/chapter/${name}/chapter_${episodeNumber}/` : undefined
        } catch (e) {
            return undefined
        }
    }

    async getAllEpisodeUrls(anime) {
        try {

            const name = anime.serverMap[this.serverName]
            if (!name) {
                throw Error()
            }

            const episodeUrls = []

            const body = await request.get(this.serverUrl + '/manga/' + name)
            const $ = cheerio.load(body)
            $('div.chapter-list > div.row > span > a').each(function () {
                const url = $(this).attr('href')
                episodeUrls.push({
                    number: parseFloat(/chapter_(.+)$/.exec(url)[1], 10),
                    url: url
                })
            })
            return episodeUrls.filter(epUrl => typeof epUrl.url === 'string')
                .sort((a, b) => a.number < b.number ? -1 : 1)
        } catch (e) {
            return []
        }


    }
}
