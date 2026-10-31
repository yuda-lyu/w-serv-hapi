import assert from 'assert'
import net from 'net'
import { inspect } from 'util'
import WConverhpClient from 'w-converhp/src/WConverhpClient.mjs'
import WServHapiServer from '../src/WServHapiServer.mjs'
import WServHapiClient from '../src/WServHapiClient.mjs'
import { useTempFolder, removeTempFolder, waitFor } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf, reserved } = wPorts


/**
 * 驗證本套件自身之console.error出口(無error監聽者時輸出error事件內容)預設只輸出安全摘要, opt.logDetail與opt.funLog取細節(規則帳本R16; 介面比照wsemi之getDiag)
 *
 * 規格來源: WServHapiServer與WServHapiClient之JSDoc
 * - opt.logDetail「…預設false時…本套件於回傳之事件物件無error監聽者而改以console.error輸出時，只輸出固定標籤'[w-serv-hapi] error'與安全摘要(from為固定詞彙之來源別，errType為錯誤類別，errCode為白名單內之錯誤代碼)，不含錯誤訊息文字與任何資料值；true時還原為遮罩憑證後之完整細節」
 * - opt.funLog「…給予時本套件之此項診斷輸出亦只交給它(label, safe, detail)而不寫console…」
 * - @returns「…有error監聽者時照常派發，不經console亦不呼叫funLog；伺服端交給監聽器之值原樣、前端getToken之拋出值遮罩憑證」
 *
 * 站點(規則帳本R16全表): 伺服端emitError之console.error出口(來源: 下層轉送downstream、清理clear、啟動失敗start、停止stop)、前端emitError之console.error出口(來源: getToken、startSync);
 * useShowLog之console.log資訊行(伺服端2處、前端2處)為固定詞彙加port、位址、人數，不含外來值，不屬此出口
 *
 * 本檔之值皆刻意為「使用端自填之值」(使用者識別、不含憑證樣式之錯誤原文): 原樣經maskDiagErr不會被遮罩, 預設輸出仍不得含有
 */
describe('api-diaglog-console', function() {

    //LABEL, 本套件console出口之固定標籤(前綴[w-serv-hapi]沿用)
    let LABEL = '[w-serv-hapi] error'

    //UID, 使用端自填之使用者識別; MSG, 不含憑證樣式之錯誤原文(含UID); PW, 帳密中之密碼(不含連續8開頭之4位數字)
    let UID = 'user-alice-4821'
    let MSG = `lookup failed for ${UID} in tenant t-acme`
    let PW = 'hunter22xyz'
    let URL_CRED = `postgres://alice:${PW}@db.example.com:5432/app`

    //pServ供伺服端各情境依序共用, pBusy供啟動失敗(埠被占用)情境
    let pServ = portOf('api-diaglog-console', 0)
    let pBusy = portOf('api-diaglog-console', 1)

    //str, 取輸出之完整可讀字串, 供斷言值不出現
    let str = (v) => {
        return inspect(v, { depth: 10 })
    }

    //capture, 擷取本行程以[w-serv-hapi]為前綴(標籤之首段)之console.error輸出, 其餘照常輸出; 回傳lines, 每項為該次呼叫之全部引數陣列
    let capture = () => {
        let lines = []
        let org = console.error
        console.error = (...args) => {
            if (typeof args[0] === 'string' && args[0].startsWith('[w-serv-hapi]')) {
                lines.push(args)
                return
            }
            org(...args)
        }
        let restore = () => {
            console.error = org
        }
        return { lines, restore }
    }

    //mkFunLog, 取得funLog與其收到之呼叫記錄
    let mkFunLog = () => {
        let calls = []
        let funLog = (...args) => {
            calls.push(args)
        }
        return { calls, funLog }
    }

    async function startPlain(name, port, extra = {}) {
        let fd = useTempFolder(name)
        let wsrv = new WServHapiServer({
            port,
            useInert: false,
            useShowLog: false,
            pathUploadTemp: `${fd}/uploadTemp`,
            fpTableTags: `${fd}/tableTags.json`,
            ...extra,
        })
        return { wsrv, fd }
    }

    //serverRun, 起伺服器(可選掛error監聽)後執行fun, 結束必停止並刪暫存資料夾
    async function serverRun(name, opt, fun) {
        let { wsrv, fd } = await startPlain(name, opt.port || pServ, opt.extra)
        let got = []
        if (opt.listener === true) {
            wsrv.on('error', (err) => {
                got.push(err)
            })
        }
        try {
            await wsrv.ready()
            let inst = await wsrv.getInstWConverServer()
            return await fun({ wsrv, inst, got })
        }
        finally {
            await wsrv.stop()
            removeTempFolder(fd)
        }
    }

    //clientRun, 起前端(useWaitToken=true, 指向無人監聽之port, 取得token前不連線)使getToken拋出指定之值, 等到出口有輸出後停止
    async function clientRun(getToken, extra = {}, useListener = false) {
        let { lines, restore } = capture()
        let got = []
        let cli = null
        try {
            cli = new WServHapiClient({
                url: `http://localhost:${reserved.closed}`,
                useShowLog: false,
                useWaitToken: true,
                getToken,
                ...extra,
            })
            if (useListener) {
                cli.on('error', (err) => {
                    got.push(err)
                })
            }
            await waitFor(() => {
                return lines.length + got.length >= 1 || (extra.funLog && extra.funLog.calls.length >= 1)
            }, { msg: '前端未發出error', timeout: 10000, interval: 20 })
        }
        finally {
            if (cli) {
                cli.clearBroadcast()
                cli.clearSync()
            }
            restore()
        }
        return { lines, got }
    }

    describe('伺服端: 預設只輸出固定標籤與安全摘要', function() {

        it('下層轉送之Error(含使用端自填之值與代碼ECONNREFUSED): 輸出標籤與{from,errType,errCode}, 不含錯誤原文與使用端之值', async function() {
            //規格: 預設輸出只含固定標籤與安全摘要, 不含錯誤訊息文字與任何資料值
            let { lines, restore } = capture()
            let e = new TypeError(MSG)
            e.code = 'ECONNREFUSED'
            try {
                await serverRun('diaglog-console-srv-down', {}, async ({ inst }) => {
                    inst.emit('error', e)
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines.length, 1, str(lines))
            assert.strict.deepEqual(lines[0], [LABEL, { from: 'downstream', errType: 'TypeError', errCode: 'ECONNREFUSED' }])
            assert.strict.deepEqual(str(lines).includes(UID) || str(lines).includes('t-acme'), false)
        })

        it('下層轉送之{msg,err}物件(w-serv-broadcast形狀): 摘要取其err之類別與代碼, 不含msg與錯誤原文', async function() {
            let { lines, restore } = capture()
            let err = new RangeError(MSG)
            err.code = 'ETIMEDOUT'
            let v = { msg: `[sys:polling] verifyPolling error for ${UID}`, err }
            try {
                await serverRun('diaglog-console-srv-obj', {}, async ({ inst }) => {
                    inst.emit('error', v)
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines.length, 1, str(lines))
            assert.strict.deepEqual(lines[0], [LABEL, { from: 'downstream', errType: 'object', errCode: 'ETIMEDOUT' }])
            assert.strict.deepEqual(str(lines).includes(UID), false)
        })

        it('下層轉送之字串與非Error值: 只輸出類別(string), 不含字串內容', async function() {
            let { lines, restore } = capture()
            try {
                await serverRun('diaglog-console-srv-str', {}, async ({ inst }) => {
                    inst.emit('error', `rejected ${UID}`)
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines, [[LABEL, { from: 'downstream', errType: 'string' }]])
        })

        it('getUserIdByToken之拒絕值(真實路徑: 經w-serv-webdata以error事件送出, 本套件轉送): 預設不含拒絕值', async function() {
            //規格: 內容可含getUserIdByToken之拒絕值; 預設不輸出
            let { lines, restore } = capture()
            let fd = useTempFolder('diaglog-console-srv-uid')
            let wsrv = new WServHapiServer({
                port: pServ,
                useInert: false,
                useShowLog: false,
                pathUploadTemp: `${fd}/uploadTemp`,
                fpTableTags: `${fd}/tableTags.json`,
                getUserIdByToken: async () => {
                    throw new Error(MSG)
                },
            })
            try {
                await wsrv.ready()
                let cl = new WConverhpClient({ url: `http://localhost:${pServ}`, retryMain: 0 })
                cl.on('error', () => {})
                await cl.execute('[sys:getFuncList]', { __sysInputArgs__: [], __sysToken__: 'tk-for-uid' })
                await waitFor(() => lines.length >= 1, { msg: '伺服端未輸出error', timeout: 10000, interval: 20 })
            }
            finally {
                await wsrv.stop()
                removeTempFolder(fd)
                restore()
            }
            assert.strict.deepEqual(lines.length, 1, str(lines))
            assert.strict.deepEqual(lines[0], [LABEL, { from: 'downstream', errType: 'Error' }])
            assert.strict.deepEqual(str(lines).includes(UID), false)
        })

        it('clearDownstream之catch(來源clear)、stop內server.stop之catch(來源stop): 各只輸出標籤與摘要', async function() {
            let { lines, restore } = capture()
            try {
                await serverRun('diaglog-console-srv-clear', {}, async ({ inst, wsrv }) => {
                    inst.clearSync = () => {
                        throw new Error(MSG)
                    }
                    let server = await wsrv.getServer()
                    let orgStop = server.stop.bind(server)
                    server.stop = async () => {
                        server.stop = orgStop
                        await orgStop()
                        throw new Error(`stop failed ${UID}`)
                    }
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines, [[LABEL, { from: 'clear', errType: 'Error' }], [LABEL, { from: 'stop', errType: 'Error' }]])
        })

        it('啟動失敗(埠被占用, 來源start): 輸出標籤與{from,errType,errCode:EADDRINUSE}, ready仍以原錯誤reject', async function() {
            let { lines, restore } = capture()
            let busy = net.createServer()
            await new Promise((resolve) => {
                busy.listen(pBusy, resolve)
            })
            let rej = null
            let { wsrv, fd } = await startPlain('diaglog-console-srv-start', pBusy)
            try {
                await wsrv.ready()
            }
            catch (err) {
                rej = err
            }
            finally {
                await wsrv.stop()
                await new Promise((resolve) => {
                    busy.close(resolve)
                })
                removeTempFolder(fd)
                restore()
            }
            assert.strict.deepEqual([rej instanceof Error, rej && rej.code], [true, 'EADDRINUSE'])
            assert.strict.deepEqual(lines, [[LABEL, { from: 'start', errType: 'Error', errCode: 'EADDRINUSE' }]])
        })

        it('建構期暫存之error於建構子回傳後轉出: 同樣只輸出摘要(建構期之來源別保留)', async function() {
            //建構期間下層(w-converhp)可能延後派發error, 先暫存後轉出; 以暫存資料夾無法建立觸發(pathUploadTemp指向既有之檔案)
            let { lines, restore } = capture()
            let fd = useTempFolder('diaglog-console-srv-ctor')
            let wsrv = new WServHapiServer({
                port: pServ,
                useInert: false,
                useShowLog: false,
                pathUploadTemp: `${fd}/uploadTemp`,
                fpTableTags: `${fd}/tableTags.json`,
                verifyConn: 'not-a-function', //w-converhp於建構期以error事件送出(R2)
            })
            try {
                await wsrv.ready()
            }
            finally {
                await wsrv.stop()
                removeTempFolder(fd)
                restore()
            }
            assert.strict.deepEqual(lines.length >= 1, true, str(lines))
            for (let line of lines) {
                assert.strict.deepEqual([line[0], Object.keys(line[1]).sort(), line[1].from], [LABEL, ['errType', 'from'], 'downstream'])
            }
        })

    })

    describe('伺服端: logDetail與funLog取細節, 有監聽者時不經出口', function() {

        it('logDetail:true: console.error(標籤, 遮罩後細節); 細節含錯誤原文與使用端之值, 憑證樣式為***', async function() {
            let { lines, restore } = capture()
            let e = new Error(`${MSG} via ${URL_CRED}`)
            try {
                await serverRun('diaglog-console-srv-detail', { extra: { logDetail: true } }, async ({ inst }) => {
                    inst.emit('error', e)
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines.length, 1, str(lines))
            assert.strict.deepEqual(lines[0][0], LABEL)
            let s = str(lines[0][1])
            assert.strict.deepEqual([lines[0].length, lines[0][1] instanceof Error, s.includes(UID), s.includes(PW), s.includes('***')], [2, true, true, false, true])
            //原物件不被改動(細節為副本)
            assert.strict.deepEqual(e.message.includes(PW), true)
        })

        it('funLog: 只交給funLog(標籤, 摘要, 遮罩後細節), 不寫console', async function() {
            let { lines, restore } = capture()
            let { calls, funLog } = mkFunLog()
            let e = new Error(`${MSG} via ${URL_CRED}`)
            e.code = 'ECONNRESET'
            try {
                await serverRun('diaglog-console-srv-funlog', { extra: { funLog } }, async ({ inst }) => {
                    inst.emit('error', e)
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines, [])
            assert.strict.deepEqual(calls.length, 1, str(calls))
            let [label, safe, detail] = calls[0]
            assert.strict.deepEqual([label, safe], [LABEL, { from: 'downstream', errType: 'Error', errCode: 'ECONNRESET' }])
            let s = str(detail)
            assert.strict.deepEqual([s.includes(UID), s.includes(PW), s.includes('***')], [true, false, true])
        })

        it('有error監聽者: 監聽器收到下層送來之同一物件(原樣), 不寫console亦不呼叫funLog', async function() {
            let { lines, restore } = capture()
            let { calls, funLog } = mkFunLog()
            let e = new Error(`${MSG} ${URL_CRED}`)
            let got = []
            try {
                got = await serverRun('diaglog-console-srv-listener', { listener: true, extra: { funLog } }, async ({ inst, got }) => {
                    inst.emit('error', e)
                    await waitFor(() => got.length >= 1, { msg: '監聽器未收到error', timeout: 10000, interval: 20 })
                    return got
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual([got.length, got[0] === e], [1, true])
            assert.strict.deepEqual([lines, calls], [[], []])
        })

    })

    describe('前端: 預設只輸出固定標籤與安全摘要', function() {

        it('getToken同步拋出(含使用端自填之值與代碼): 輸出標籤與{from:getToken,errType,errCode}, 不含拋出值', async function() {
            let e = new TypeError(MSG)
            e.code = 'ENOTFOUND'
            let { lines } = await clientRun(() => {
                throw e
            })
            assert.strict.deepEqual(lines, [[LABEL, { from: 'getToken', errType: 'TypeError', errCode: 'ENOTFOUND' }]])
            assert.strict.deepEqual(str(lines).includes(UID), false)
        })

        it('getToken回傳之promise reject字串(使用端自填之值): 只輸出類別string, 不含內容', async function() {
            //刻意以字串reject(使用端回調可給任意值), 非Error物件
            let { lines } = await clientRun(() => {
                return Promise.reject(`denied ${UID}`)
            })
            assert.strict.deepEqual(lines, [[LABEL, { from: 'getToken', errType: 'string' }]])
        })

        it('startSync之例外(w-serv-webdata建構時之錯誤, 來源startSync): 只輸出標籤與摘要', async function() {
            let Org = globalThis.AbortController
            let e = new Error(`construct failed ${UID}`)
            let { lines, restore } = capture()
            let cli = null
            try {
                cli = new WServHapiClient({
                    url: `http://localhost:${reserved.closed}`,
                    useShowLog: false,
                    useWaitToken: true,
                    getToken: () => {
                        return 'token-for-test'
                    },
                })
                //建構子已同步回傳, 首次檢查在其後之計時器: 此時才替換, 於計時器觸發前生效
                globalThis.AbortController = class {
                    constructor() {
                        throw e
                    }
                }
                await waitFor(() => lines.length >= 1, { msg: '前端未發出error', timeout: 10000, interval: 20 })
            }
            finally {
                globalThis.AbortController = Org
                if (cli) {
                    cli.clearBroadcast()
                    cli.clearSync()
                }
                restore()
            }
            assert.strict.deepEqual(lines, [[LABEL, { from: 'startSync', errType: 'Error' }]])
        })

    })

    describe('前端: logDetail與funLog取細節, 有監聽者時不經出口', function() {

        it('logDetail:true: console.error(標籤, 遮罩後細節); 含使用端之值, 憑證樣式為***', async function() {
            let e = new Error(`${MSG} via ${URL_CRED}`)
            let { lines } = await clientRun(() => {
                throw e
            }, { logDetail: true })
            assert.strict.deepEqual(lines.length, 1, str(lines))
            assert.strict.deepEqual(lines[0][0], LABEL)
            let s = str(lines[0][1])
            assert.strict.deepEqual([lines[0].length, lines[0][1] instanceof Error, s.includes(UID), s.includes(PW), s.includes('***')], [2, true, true, false, true])
            assert.strict.deepEqual(e.message.includes(PW), true)
        })

        it('funLog: 只交給funLog(標籤, 摘要, 遮罩後細節), 不寫console', async function() {
            let { calls, funLog } = mkFunLog()
            let e = new Error(`${MSG} via ${URL_CRED}`)
            let { lines } = await clientRun(() => {
                throw e
            }, { funLog: Object.assign(funLog, { calls }) })
            assert.strict.deepEqual(lines, [])
            assert.strict.deepEqual(calls.length, 1, str(calls))
            let [label, safe, detail] = calls[0]
            assert.strict.deepEqual([label, safe], [LABEL, { from: 'getToken', errType: 'Error' }])
            let s = str(detail)
            assert.strict.deepEqual([s.includes(UID), s.includes(PW), s.includes('***')], [true, false, true])
        })

        it('有error監聽者: 監聽器收到getToken之拋出值(遮罩憑證, 不含憑證者同一物件), 不寫console亦不呼叫funLog', async function() {
            let { calls, funLog } = mkFunLog()
            let plain = new Error(MSG)
            let a = await clientRun(() => {
                throw plain
            }, { funLog: Object.assign(funLog, { calls }) }, true)
            assert.strict.deepEqual([a.lines, a.got.length, a.got[0] === plain, calls], [[], 1, true, []])
            let withCred = new Error(`${MSG} ${URL_CRED}`)
            let b = await clientRun(() => {
                throw withCred
            }, { funLog: Object.assign(funLog, { calls }) }, true)
            assert.strict.deepEqual([b.lines, b.got.length, b.got[0] !== withCred, str(b.got[0]).includes(PW), calls], [[], 1, true, false, []])
        })

    })

})
