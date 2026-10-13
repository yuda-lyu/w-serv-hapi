import assert from 'assert'
import fs from 'fs'
import evem from 'wsemi/src/evem.mjs'
import WServWebdataClient from 'w-serv-webdata/src/WServWebdataClient.mjs'
import WServHapiClient from '../src/WServHapiClient.mjs'
import { waitFor, deferred, runChild } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { reserved } = wPorts


/**
 * 驗證前端之建構、等待token、非同步失敗之派發與停止(皆不連線之情境)
 *
 * 規格來源: WServHapiClient之JSDoc
 * - opt.useWaitToken「給予true時getToken為必填，未給時建構即同步拋錯。建構後每100ms呼叫getToken，待其回傳非空字串…才建立資料同步…不設等待上限；
 *   等待期間呼叫回傳物件之clearBroadcast或clearSync即取消等待…getToken拋錯或reject時發出一則error事件並停止等待；前一次呼叫回傳之promise未結束前不再呼叫」
 * - opt.getToken、opt.getServerMethods、opt.recvData與各回調函數「未給(undefined或null)時取預設；有給但非函數時建構即同步拋錯(不論useWaitToken)」
 * - @returns「…建構後即可使用(useWaitToken=true而尚在等待token時亦然)…本套件自發之error(等待token期間getToken之拋錯)於建構子回傳後才發出…」
 *
 * 各情境之url皆指向刻意無人監聽之port(reserved.closed); 會建立資料同步之情境於結束時以clearBroadcast與clearSync停止
 */
describe('unit-client-init', function() {

    let url = `http://localhost:${reserved.closed}`

    //base, 各情境共用之設定
    let base = (extra = {}) => {
        return {
            url,
            useShowLog: false,
            retryMain: 0,
            ...extra,
        }
    }

    //sleep
    let sleep = (ms) => {
        return new Promise((resolve) => {
            setTimeout(resolve, ms)
        })
    }

    //stopOf, 停止前端: 等待中則取消等待, 已建立資料同步則停止輪詢並釋放
    let stopOf = (cli) => {
        for (let name of ['clearBroadcast', 'clearSync']) {
            if (cli && typeof cli[name] === 'function') {
                cli[name]()
            }
        }
    }

    //throwOf, 回傳建構時同步拋出之錯誤訊息; 未拋錯時先停掉前端再回null
    let throwOf = (opt) => {
        let cli = null
        try {
            cli = new WServHapiClient(opt)
        }
        catch (err) {
            return err.message
        }
        if (cli && typeof cli.on === 'function') {
            cli.on('error', () => {})
        }
        stopOf(cli)
        return null
    }

    //started, 是否已建立資料同步: w-serv-webdata所擴充之w-sync-webdata於同一事件物件掛上updateTableTags
    let started = (cli) => {
        return typeof cli.updateTableTags === 'function'
    }

    //funNames, 函數型選項
    let funNames = ['getToken', 'getServerMethods', 'recvData', 'getRefreshState', 'getRefreshTable', 'getBeforeUpdateTableTags', 'getAfterUpdateTableTags']

    it('函數型選項有給但非函數時建構即同步拋錯, 不論useWaitToken', async function() {
        let rs = []
        let expected = []
        for (let useWaitToken of [false, true]) {
            for (let name of funNames) {
                let opt = base({ useWaitToken, getToken: () => '', [name]: 'x' })
                rs.push([useWaitToken, name, throwOf(opt)])
                expected.push([useWaitToken, name, `invalid opt.${name}`])
            }
        }
        assert.strict.deepEqual(rs, expected)
    })

    it('useWaitToken=true而未給getToken(undefined或null)時建構即同步拋錯', async function() {
        let rs = [
            throwOf(base({ useWaitToken: true })),
            throwOf(base({ useWaitToken: true, getToken: null })),
        ]
        let msg = 'invalid opt.getToken when opt.useWaitToken=true'
        assert.strict.deepEqual(rs, [msg, msg])
    })

    it('w-serv-webdata前端於建構時拋錯之選項, useWaitToken=true(延後建構w-serv-webdata)時本套件亦須同步拋出同一訊息', async function() {

        //names, 自w-serv-webdata前端之JSDoc取其選項名, 下游新增選項時一併納入比對
        let c = fs.readFileSync('./node_modules/w-serv-webdata/src/WServWebdataClient.mjs', 'utf8')
        let names = (c.match(/@param \{[^}]+\} \[?opt\.(\w+)/g) || []).map((m) => {
            return m.replace(/^.*opt\./, '')
        })
        assert.strict.deepEqual(names.length > 0, true, '未能自w-serv-webdata取得任何選項, 解析規則可能已失效')

        //msgWebdata, 以w-serv-webdata前端本身判定: 回傳其建構時拋出之訊息, 未拋錯時停止後回null
        let msgWebdata = (name, v) => {
            let ev = evem()
            ev.execute = () => {
                return new Promise(() => {})
            }
            try {
                new WServWebdataClient(ev, { getServerMethods: () => {}, recvData: () => {}, [name]: v })
            }
            catch (err) {
                return err.message
            }
            ev.clearBroadcast()
            ev.clearSync()
            return null
        }

        let rs = []
        let expected = []
        let nThrown = 0
        for (let name of names) {
            for (let v of [123, 'x', true, {}]) {
                let m = msgWebdata(name, v)
                if (m !== null) {
                    nThrown += 1
                }
                rs.push([name, v, throwOf(base({ useWaitToken: true, getToken: () => '', [name]: v }))])
                expected.push([name, v, m])
            }
        }
        assert.strict.deepEqual(nThrown > 0, true, 'w-serv-webdata前端對無效值皆未拋錯, 比對失去意義')
        assert.strict.deepEqual(rs, expected)
    })

    it('未給(undefined或null)之函數型選項取預設, 建構不拋錯', async function() {
        let rs = []
        for (let v of [undefined, null]) {
            let opt = base()
            for (let name of funNames) {
                opt[name] = v
            }
            rs.push(throwOf(opt))
        }
        assert.strict.deepEqual(rs, [null, null])
    })

    for (let nameClear of ['clearBroadcast', 'clearSync']) {
        it(`useWaitToken=true時建構即回傳事件物件並持續等待; 等待中呼叫${nameClear}即取消等待, 其後取得token亦不建立資料同步`, async function() {
            let token = ''
            let n = 0
            let errors = []
            let cli = new WServHapiClient(base({
                useWaitToken: true,
                getToken: () => {
                    n += 1
                    return token
                },
            }))
            try {
                assert.strict.deepEqual(['on', 'emit', 'clearBroadcast', 'clearSync'].map((k) => {
                    return typeof cli[k]
                }), ['function', 'function', 'function', 'function'])
                cli.on('error', (err) => {
                    errors.push(err)
                })
                await waitFor(() => n >= 3, { timeout: 5000, msg: 'getToken未被持續呼叫' })
                assert.strict.deepEqual(started(cli), false)

                cli[nameClear]()
                let nCleared = n
                token = 'token-for-test'
                await sleep(400)
                assert.strict.deepEqual([n, started(cli), errors], [nCleared, false, []])
            }
            finally {
                stopOf(cli)
            }
        })
    }

    it('等待不設上限: 逾舊版之200次(約20秒)仍持續等待, 取得token後即建立資料同步', async function() {
        let n = 0
        let cli = new WServHapiClient(base({
            useWaitToken: true,
            getToken: () => {
                n += 1
                return n > 205 ? 'token-for-test' : ''
            },
        }))
        cli.on('error', () => {}) //建立資料同步後輪詢無人監聽之port而失敗, 非本案驗證對象
        try {
            await waitFor(() => started(cli), { timeout: 40000, interval: 200, msg: '未建立資料同步' })
            assert.strict.deepEqual(n > 205, true)
        }
        finally {
            stopOf(cli)
        }
    })

    it('getToken於首次檢查即同步拋錯: 該error於建構子回傳後才發出, new之後才掛上之監聽恰收到一則, 並停止等待', async function() {
        let e = new Error('token-err')
        let n = 0
        let cli = new WServHapiClient(base({
            useWaitToken: true,
            getToken: () => {
                n += 1
                throw e
            },
        }))
        let errors = []
        cli.on('error', (err) => {
            errors.push(err)
        })
        try {
            await waitFor(() => errors.length > 0, { timeout: 5000, msg: '未收到error' })
            await sleep(400)
            assert.strict.deepEqual([errors.length, errors[0] === e, n, started(cli)], [1, true, 1, false])
        }
        finally {
            stopOf(cli)
        }
    })

    it('getToken於等待途中拋錯或reject時發出一則error事件(內容為原拋出值)並停止等待', async function() {
        let rs = []
        for (let kind of ['throw', 'reject']) {
            let n = 0
            let cli = new WServHapiClient(base({
                useWaitToken: true,
                getToken: () => {
                    n += 1
                    if (n < 3) {
                        return ''
                    }
                    if (kind === 'throw') {
                        throw 'token-throw' // eslint-disable-line no-throw-literal -- 刻意擲非Error之值: 驗證error事件之內容為原拋出值(規格: 內容為其拋出值)
                    }
                    return Promise.reject('token-reject')
                },
            }))
            let errors = []
            cli.on('error', (err) => {
                errors.push(err)
            })
            try {
                await waitFor(() => errors.length > 0, { timeout: 5000, msg: '未收到error' })
                await sleep(400)
                rs.push([kind, errors, n, started(cli)])
            }
            finally {
                stopOf(cli)
            }
        }
        assert.strict.deepEqual(rs, [
            ['throw', ['token-throw'], 3, false],
            ['reject', ['token-reject'], 3, false],
        ])
    })

    it('getToken回傳之promise未結束前不再呼叫; 停止後該promise之結果不再作用(resolve不建立資料同步, reject不發出error)', async function() {
        let rs = []
        for (let settle of ['resolve', 'reject']) {
            let d = deferred()
            let n = 0
            let cli = new WServHapiClient(base({
                useWaitToken: true,
                getToken: () => {
                    n += 1
                    return d.promise
                },
            }))
            let errors = []
            cli.on('error', (err) => {
                errors.push(err)
            })
            try {
                await sleep(400)
                let nPending = n
                cli.clearSync()
                if (settle === 'resolve') {
                    d.resolve('token-for-test')
                }
                else {
                    d.reject('token-late')
                }
                await sleep(300)
                rs.push([settle, nPending, n, started(cli), errors])
            }
            finally {
                stopOf(cli)
            }
        }
        assert.strict.deepEqual(rs, [
            ['resolve', 1, 1, false, []],
            ['reject', 1, 1, false, []],
        ])
    })

    it('useWaitToken=true而未給getToken時建構即同步拋錯, 行程無未處理之rejection而自行結束(子行程)', async function() {
        let r = await runChild(['test/tools/child-client.mjs', 'ctor-throw'], { timeout: 10000 })
        assert.strict.deepEqual(r.out.trim(), 'THROWN invalid opt.getToken when opt.useWaitToken=true')
        assert.strict.deepEqual([r.exited, r.code], [true, 0])
    })

    it('等待token期間呼叫clearBroadcast後, 行程可自行結束(子行程)', async function() {
        let r = await runChild(['test/tools/child-client.mjs', 'wait-clear'], { timeout: 10000 })
        assert.strict.deepEqual(r.out.trim(), 'CLEARED checked')
        assert.strict.deepEqual([r.exited, r.code], [true, 0])
    })

})
