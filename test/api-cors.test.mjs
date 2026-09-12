import assert from 'assert'
import { startServer } from './api-setup.mjs'


/**
 * 驗證跨域相關標頭
 *
 * 規格來源: WServHapiServer之opt.corsOrigins,
 * 與w-converhp之serverHapi契約「外部提供者須自行於其routes.cors設定additionalExposedHeaders含
 * Return-Type、Return-Msg、Return-Retryable、Content-Disposition，否則前端(browser)與API不同源時download會失效」
 */
describe('api-cors', function() {
    let port = 8172
    let srv = null
    let corsOrigins = ['http://localhost:3000']

    before(async function() {
        srv = await startServer({
            name: 'cors',
            port,
            optServer: {
                corsOrigins,
            },
        })
    })

    after(async function() {
        await srv.stop()
    })

    it('回應應曝露w-converhp協定所需之四個標頭', async function() {
        let res = await fetchMain()
        let expose = res.headers.get('access-control-expose-headers') || ''
        let ks = expose.split(',').map((v) => {
            return v.trim()
        })
        for (let k of ['Return-Type', 'Return-Msg', 'Return-Retryable', 'Content-Disposition']) {
            assert.strict.deepEqual(ks.includes(k), true, `access-control-expose-headers未含${k}`)
        }
    })

    it('曝露標頭應保留hapi預設之兩項', async function() {
        let res = await fetchMain()
        let expose = res.headers.get('access-control-expose-headers') || ''
        let ks = expose.split(',').map((v) => {
            return v.trim()
        })
        for (let k of ['WWW-Authenticate', 'Server-Authorization']) {
            assert.strict.deepEqual(ks.includes(k), true, `access-control-expose-headers未含${k}`)
        }
    })

    it('corsOrigins所指定之網域應被允許跨域', async function() {
        let res = await fetchMain()
        assert.strict.deepEqual(res.headers.get('access-control-allow-origin'), corsOrigins[0])
    })

    it('corsOrigins外之網域不應被允許跨域', async function() {
        let res = await fetchMain('http://other-site.com')
        assert.strict.deepEqual(res.headers.get('access-control-allow-origin'), null)
    })

    //fetchMain, 以指定來源打主要控制器API
    async function fetchMain(origin) {
        if (!origin) {
            origin = corsOrigins[0]
        }
        return await fetch(`http://localhost:${port}/api/main`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': origin,
            },
            body: '{}',
        })
    }

})
