import assert from 'assert'
import WServHapiClient from '../src/WServHapiClient.mjs'
import { waitFor, deferred, startServer } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf } = wPorts


/**
 * 驗證前端useWaitToken=true時之連線時機與停止(連線之情境)
 *
 * 規格來源: WServHapiClient之JSDoc
 * - opt.useWaitToken「…待其回傳非空字串(可為promise)才建立資料同步(開始輪詢、取得函數清單與同步表資料)…」
 * - @returns「回傳事件物件，為w-converhp之前端事件物件，建立資料同步時由w-serv-webdata於同一物件上擴充…停止時呼叫其clearBroadcast與clearSync…
 *   於等待期間取得之函數參照，建立資料同步後呼叫亦轉為w-serv-webdata之同名函數」
 */
describe('api-client-wait-token', function() {

    //sleep
    let sleep = (ms) => {
        return new Promise((resolve) => {
            setTimeout(resolve, ms)
        })
    }

    //countPolling, 計數伺服器收到之輪詢
    let countPolling = (inst) => {
        let r = { n: 0 }
        inst.on('execute', (func) => {
            if (func === '[sys:polling]') {
                r.n += 1
            }
        })
        return r
    }

    //stopOf, 停止前端
    let stopOf = (cli) => {
        for (let name of ['clearBroadcast', 'clearSync']) {
            if (cli && typeof cli[name] === 'function') {
                cli[name]()
            }
        }
    }

    it('取得token前不連線; 取得後於同一事件物件建立資料同步, 取得函數清單並收到同步表資料', async function() {
        let srv = null
        let cli = null
        try {
            srv = await startServer({
                name: 'client-wait-token',
                port: portOf('api-client-wait-token', 0),
                seed: { tabA: [{ id: 'id-a1', name: 'a1' }] },
            })
            let inst = await srv.wsrv.getInstWConverServer()
            let polling = countPolling(inst)

            let token = ''
            let pmMethods = deferred()
            let recvs = []
            let errors = []
            cli = new WServHapiClient({
                url: `http://localhost:${srv.port}`,
                useShowLog: false,
                useWaitToken: true,
                getToken: () => {
                    return token
                },
                getServerMethods: (r) => {
                    pmMethods.resolve(r)
                },
                recvData: (r) => {
                    recvs.push(r)
                },
            })
            let ref = cli
            cli.on('error', (err) => {
                errors.push(err)
            })

            //取得token前: 伺服器未收到任何輪詢, 亦無同步資料
            await sleep(2500)
            assert.strict.deepEqual([polling.n, inst.getClients().length, recvs.length], [0, 0, 0])

            //取得token後: 建立資料同步
            token = 'token-for-test'
            let methods = await pmMethods.promise
            assert.strict.deepEqual(Object.keys(methods).sort(), ['tabA', 'tabB'])
            await waitFor(() => recvs.length > 0, { msg: '未收到同步表資料' })
            assert.strict.deepEqual(recvs[0].tableName, 'tabA')
            assert.strict.deepEqual(recvs[0].data.map((v) => v.id), ['id-a1'])
            assert.strict.deepEqual([cli === ref, typeof cli.updateTableTags, polling.n > 0, errors], [true, 'function', true, []])
        }
        finally {
            stopOf(cli)
            if (srv) {
                await srv.stop()
            }
        }
    })

    it('等待期間取得之clearBroadcast與clearSync參照, 於建立資料同步後呼叫仍停止輪詢', async function() {
        let srv = null
        let cli = null
        try {
            srv = await startServer({
                name: 'client-wait-token-ref',
                port: portOf('api-client-wait-token', 1),
            })
            let inst = await srv.wsrv.getInstWConverServer()
            let polling = countPolling(inst)

            let pmMethods = deferred()
            cli = new WServHapiClient({
                url: `http://localhost:${srv.port}`,
                useShowLog: false,
                useWaitToken: true,
                getToken: () => {
                    return 'token-for-test'
                },
                getServerMethods: (r) => {
                    pmMethods.resolve(r)
                },
            })
            cli.on('error', () => {})

            //等待期間即取得之參照
            let { clearBroadcast, clearSync } = cli

            //建立資料同步並已輪詢; 確認所測者確為等待期間之參照: 建立資料同步後物件上之同名函數已換為w-serv-webdata所提供者
            await pmMethods.promise
            assert.strict.deepEqual([clearBroadcast === cli.clearBroadcast, clearSync === cli.clearSync], [false, false])

            //以等待期間之參照停止: 其後至多再收到停止前已送出之一次輪詢(輪詢間隔2秒, 觀察逾兩個間隔)
            clearBroadcast()
            clearSync()
            let nStop = polling.n
            await sleep(4500)
            assert.strict.deepEqual(polling.n <= nStop + 1, true, `停止後仍持續輪詢: 停止時${nStop}次, 其後${polling.n}次`)
        }
        finally {
            stopOf(cli)
            if (srv) {
                await srv.stop()
            }
        }
    })

})
