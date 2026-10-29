import assert from 'assert'
import { inspect } from 'util'
import diagCases from 'wsemi/src/_diagCases.mjs'
import WServHapiServer from '../src/WServHapiServer.mjs'
import WServHapiClient from '../src/WServHapiClient.mjs'
import { useTempFolder, removeTempFolder, waitFor } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf, reserved } = wPorts
let { cases, mkCtx, verify } = diagCases


/**
 * 驗證本套件自身之console出口與自發error之遮罩接線(規則帳本R15; 診斷輸出與遮罩由wsemi單一擁有, 規格為主控dspec〈診斷輸出與遮罩〉)
 *
 * 規格來源: WServHapiServer與WServHapiClient之JSDoc
 * - Server opt.funLog「回傳之事件物件無error監聽者時，本套件改以console.error輸出error事件之內容(含下層送來者)，該內容經wsemi之maskDiagErr遮罩憑證樣式(網址帳密、password、token、Authorization、Bearer等鍵值，遮罩為'***')，不含者原樣…交給監聽器之值不經本套件遮罩」
 * - Client opt.funLog「…本套件改以console.error輸出其自發error之內容(例如getToken之拋出值)，該內容經wsemi之maskDiagErr遮罩憑證樣式…」與@returns「本套件為getToken之拋出值(含憑證樣式者經wsemi之maskDiagErr遮罩，不含者原樣)」
 *
 * 本套件是轉傳端: 不持有靜態秘密(token為getToken之動態值，由w-serv-webdata之token簿記住)，故只套通用憑證樣式，不宣告秘密清單;
 * 下層對自己所發error之遮罩由下層負責(w-serv-webdata之診斷輸出與遮罩見其測試)，本檔測的是「本套件各console出口與自發error確實經wsemi之maskDiagErr」
 *
 * 站點全集(Grep console\.與emitError，見規則帳本R15之站點表):
 * - 伺服端console.error出口(emitError無監聽者): 下層轉送(inst.emit)、clearDownstream之catch、啟動失敗(pmStart.catch)、stop內server.stop之catch，皆經同一出口
 * - 前端console.error出口(emitError無監聽者): getToken之拋出值與reject值(checkToken之catch)、startSync之catch
 * - 前端交給監聽器之值: getToken之拋出值與reject值先遮罩(外來值); startSync之例外(w-serv-webdata建構時之固定詞彙錯誤)與伺服端交給監聽器之值原樣(轉送端不改下游之值)
 */
describe('api-diaglog-mask', function() {

    //PW, 帳密中之密碼; 不含連續8開頭之4位數字(unit-ports禁止測試檔手寫port字面值)
    let PW = 'hunter22xyz'
    let URL_CRED = `postgres://alice:${PW}@db.example.com:5432/app`
    let BEARER = 'abc.def.ghi'

    //capture, 擷取本行程以[w-serv-hapi]為前綴之console.error輸出(其餘照常輸出); 回傳lines, 每項為前綴之後的引數陣列
    let capture = () => {
        let lines = []
        let org = console.error
        console.error = (...args) => {
            if (args[0] === '[w-serv-hapi]') {
                lines.push(args.slice(1))
                return
            }
            org(...args)
        }
        let restore = () => {
            console.error = org
        }
        return { lines, restore }
    }

    //str, 取輸出之完整可讀字串(含錯誤之stack與巢狀屬性), 供斷言秘密不出現
    let str = (v) => {
        return inspect(v, { depth: 10 })
    }

    //startPlain, 建構不開資料通道之伺服器(尚未ready); 回傳{ wsrv, fd }
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

    //伺服端之依序情境共用同一個port, 每情境起停一次
    let pServ = portOf('api-diaglog-mask', 0)
    let pConflict = portOf('api-diaglog-mask', 1)

    //serverRun, 起伺服器(可選掛error監聽)後執行fun, 結束必停止並刪暫存資料夾; 回傳fun之結果
    async function serverRun(name, opt, fun) {
        let { wsrv, fd } = await startPlain(name, opt.port || pServ, opt.extra)
        let got = []
        if (opt.listener === true) {
            wsrv.on('error', (err) => {
                got.push(err)
            })
        }
        let r = null
        try {
            await wsrv.ready()
            let inst = await wsrv.getInstWConverServer()
            r = await fun({ wsrv, inst, got })
        }
        finally {
            await wsrv.stop()
            removeTempFolder(fd)
        }
        return r
    }

    //clientRun, 起前端(useWaitToken=true, 指向無人監聽之port, 取得token前不連線)使getToken拋出或reject指定之值, 等到出口有輸出後停止; 回傳{ lines, got }
    //useListener為true時掛error監聽(交給監聽器之值收於got), 否則走console出口(收於lines)
    async function clientRun(getToken, useListener) {
        let { lines, restore } = capture()
        let got = []
        let cli = null
        try {
            cli = new WServHapiClient({
                url: `http://localhost:${reserved.closed}`,
                useShowLog: false,
                useWaitToken: true,
                getToken,
            })
            if (useListener) {
                cli.on('error', (err) => {
                    got.push(err)
                })
            }
            await waitFor(() => {
                return lines.length + got.length >= 1
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

    describe('伺服端console出口(無error監聽者)', function() {

        it('下層轉送之含憑證error: Error保型為副本並遮罩訊息與stack, 原物件不被改動', async function() {
            let { lines, restore } = capture()
            let e = new TypeError(`connect failed: ${URL_CRED} refused`)
            try {
                await serverRun('diaglog-mask-srv-err', {}, async ({ inst }) => {
                    inst.emit('error', e)
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines.length, 1, str(lines))
            let p = lines[0][0]
            assert.strict.deepEqual([p instanceof TypeError, p !== e, p.message, str(p).includes(PW)], [true, true, 'connect failed: postgres://***@db.example.com:5432/app refused', false])
            //原物件不被改動(副本)
            assert.strict.deepEqual(e.message.includes(PW), true)
        })

        it('下層轉送之{msg,err}物件(w-serv-broadcast與w-sync-webdata之形狀)內巢狀err含Authorization與password: 遮罩, 其餘欄位原樣', async function() {
            let { lines, restore } = capture()
            let v = { msg: '[sys:polling] verifyPolling error', err: new Error(`rejected: Authorization: Bearer ${BEARER} password=${PW}`) }
            try {
                await serverRun('diaglog-mask-srv-obj', {}, async ({ inst }) => {
                    inst.emit('error', v)
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines.length, 1, str(lines))
            let p = lines[0][0]
            let s = str(p)
            assert.strict.deepEqual([p.msg, s.includes(PW), s.includes(BEARER), s.includes('***')], ['[sys:polling] verifyPolling error', false, false, true])
            assert.strict.deepEqual(v.err.message.includes(PW), true)
        })

        it('clearDownstream之catch(下游清理拋錯, 其值含憑證): 以error事件轉出, 無監聽者時console出口遮罩, stop恆resolve', async function() {
            let { lines, restore } = capture()
            try {
                await serverRun('diaglog-mask-srv-clear', {}, async ({ inst }) => {
                    inst.clearSync = () => {
                        throw new Error(`cleanup failed for ${URL_CRED}`)
                    }
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines.length, 1, str(lines))
            assert.strict.deepEqual([lines[0][0].message, str(lines[0][0]).includes(PW)], ['cleanup failed for postgres://***@db.example.com:5432/app', false])
        })

        it('stop內server.stop之catch(其值含憑證): console出口遮罩, stop恆resolve', async function() {
            let { lines, restore } = capture()
            try {
                await serverRun('diaglog-mask-srv-stop', {}, async ({ wsrv }) => {
                    let server = await wsrv.getServer()
                    let orgStop = server.stop.bind(server)
                    server.stop = async () => {
                        server.stop = orgStop
                        await orgStop()
                        throw new Error(`stop failed password=${PW}`)
                    }
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines.length, 1, str(lines))
            assert.strict.deepEqual([lines[0][0].message, str(lines[0][0]).includes(PW)], ['stop failed password=***', false])
        })

        it('啟動失敗(pmStart.catch, apis路由衝突之訊息含憑證樣式): console出口遮罩; ready仍以原錯誤reject(本套件無秘密來源, 不改其值)', async function() {
            let { lines, restore } = capture()
            let rej = null
            let route = { method: 'GET', path: `/dup/password=${PW}`, handler: () => 'x' }
            let { wsrv, fd } = await startPlain('diaglog-mask-srv-start', pConflict, { apis: [route, route] })
            try {
                await wsrv.ready()
            }
            catch (err) {
                rej = err
            }
            finally {
                await wsrv.stop()
                removeTempFolder(fd)
                restore()
            }
            assert.strict.deepEqual(rej instanceof Error && rej.message.includes(`password=${PW}`), true, `ready之reject: ${rej && rej.message}`)
            assert.strict.deepEqual(lines.length, 1, str(lines))
            assert.strict.deepEqual([lines[0][0].message.includes('conflicts with existing'), lines[0][0].message.includes('password=***'), str(lines[0][0]).includes(PW)], [true, true, false])
        })

        it('不含憑證之error: console出口輸出同一物件(身分不變, 非副本)', async function() {
            let { lines, restore } = capture()
            let e = new Error('plain failure')
            try {
                await serverRun('diaglog-mask-srv-plain', {}, async ({ inst }) => {
                    inst.emit('error', e)
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(lines.length, 1)
            assert.strict.deepEqual(lines[0][0] === e, true)
        })

    })

    describe('伺服端交給error監聽器之值(轉送端不改下游之值)', function() {

        it('有error監聽者時: 監聽器收到下層送來之同一物件(含憑證樣式亦原樣), 不走console出口', async function() {
            let { lines, restore } = capture()
            let e = new Error(`from downstream ${URL_CRED}`)
            let got = []
            try {
                got = await serverRun('diaglog-mask-srv-listener', { listener: true }, async ({ inst, got }) => {
                    inst.emit('error', e)
                    await waitFor(() => got.length >= 1, { msg: '監聽器未收到error', timeout: 10000, interval: 20 })
                    return got
                })
            }
            finally {
                restore()
            }
            assert.strict.deepEqual(got.length, 1)
            assert.strict.deepEqual(got[0] === e, true)
            assert.strict.deepEqual(lines, [])
        })

    })

    describe('前端: getToken之拋出值與reject值為使用端回調之外來值, catch站點遮罩', function() {

        it('無error監聽者: getToken同步拋出含憑證之Error, console出口為遮罩後副本(保型), 原物件不被改動', async function() {
            let e = new RangeError(`token service down ${URL_CRED}`)
            let { lines } = await clientRun(() => {
                throw e
            }, false)
            assert.strict.deepEqual(lines.length, 1, str(lines))
            let p = lines[0][0]
            assert.strict.deepEqual([p instanceof RangeError, p !== e, p.message, str(p).includes(PW)], [true, true, 'token service down postgres://***@db.example.com:5432/app', false])
            assert.strict.deepEqual(e.message.includes(PW), true)
        })

        it('有error監聽者: getToken回傳之promise reject含憑證之Error, 監聽器收到遮罩後副本(一則), 原物件不被改動', async function() {
            let e = new TypeError(`fetch token failed Authorization: Bearer ${BEARER} password=${PW}`)
            let { got } = await clientRun(async () => {
                throw e
            }, true)
            assert.strict.deepEqual(got.length, 1)
            let p = got[0]
            assert.strict.deepEqual([p instanceof TypeError, p !== e, str(p).includes(PW), str(p).includes(BEARER), p.message.includes('***')], [true, true, false, false, true])
            assert.strict.deepEqual(e.message.includes(PW), true)
        })

        it('不含憑證之拋出值: 監聽器收到同一物件(身分不變)', async function() {
            let e = new Error('plain getToken failure')
            let { got } = await clientRun(() => {
                throw e
            }, true)
            assert.strict.deepEqual(got.length, 1)
            assert.strict.deepEqual(got[0] === e, true)
        })

        it('startSync之例外(w-serv-webdata建構時之錯誤, 非使用端回調所給)不遮罩: 監聽器收到同一物件; 無監聽者時console出口遮罩', async function() {
            //以會拋錯之AbortController使w-serv-webdata前端於取得token後之建構內拋錯(其以AbortController建構自身請求之中止控制器); 錯誤訊息刻意夾帶憑證樣式以區分兩條出口
            let Org = globalThis.AbortController
            let e = new Error(`construct failed password=${PW}`)
            let run = async (useListener) => {
                let { lines, restore } = capture()
                let got = []
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
                    if (useListener) {
                        cli.on('error', (err) => {
                            got.push(err)
                        })
                    }
                    //建構子已同步回傳, 首次檢查在其後之計時器: 此時才替換, 於計時器觸發前生效
                    globalThis.AbortController = class {
                        constructor() {
                            throw e
                        }
                    }
                    await waitFor(() => {
                        return lines.length + got.length >= 1
                    }, { msg: '前端未發出error', timeout: 10000, interval: 20 })
                }
                finally {
                    globalThis.AbortController = Org
                    if (cli) {
                        cli.clearBroadcast()
                        cli.clearSync()
                    }
                    restore()
                }
                return { lines, got }
            }
            let a = await run(true)
            assert.strict.deepEqual(a.got.length, 1)
            assert.strict.deepEqual(a.got[0] === e, true)
            let b = await run(false)
            assert.strict.deepEqual(b.lines.length, 1, str(b.lines))
            assert.strict.deepEqual([b.lines[0][0].message, str(b.lines[0][0]).includes(PW)], ['construct failed password=***', false])
            assert.strict.deepEqual(globalThis.AbortController === Org, true)
        })

    })

    describe('共用語料(wsemi/src/_diagCases.mjs)之接線: 依本套件適用之子集', function() {

        //WIRE, 語料中wire:true之全部案例對本套件之適用性(每案必有判定; 語料新增wire案例而未判定者轉紅, 提醒補判定)
        //run: 經本套件之出口重跑; 其餘為不適用及理由
        let NA_SECRET = '需已登錄之秘密(getDiagSecrets導出): 本套件不持有靜態秘密(token為getToken之動態值, 由w-serv-webdata之token簿記住), 不宣告秘密清單; 以不宣告結構性滿足(無從挖空固定詞彙)'
        let NA_COPY = '細節拷貝(maskDiagCopy)出口: 本套件無diag(label, safe, detail)站點, 診斷細節出口屬w-serv-webdata'
        let NA_DIAG = '診斷出口(getDiag、genDiagFunLog、getDiagBriefErr): 本套件不呼叫'
        let WIRE = {
            T07: 'run',
            R01: 'run',
            T01: NA_SECRET,
            R02: NA_SECRET,
            R04: NA_SECRET,
            R07: NA_SECRET,
            R11: '期望含detail側(maskDiagCopy); reject側(未宣告之路徑不遮、身分不變)以R01之身分不變涵蓋, 本套件不宣告paths',
            R12: '期望含detail側(maskDiagCopy); reject側(未宣告之帳號不遮、身分不變)以R01之身分不變涵蓋, 本套件不宣告username',
            K01: NA_COPY,
            K09: NA_COPY,
            V02: NA_COPY,
            E01: NA_COPY,
            E07: NA_COPY,
            P01: NA_COPY,
            S07: NA_COPY,
            C01: NA_DIAG,
            O01: NA_DIAG,
            O15: NA_DIAG,
            A01: NA_DIAG,
            A07: NA_DIAG,
        }

        it('語料中wire:true之案例皆已判定適用性(無遺漏、無已不存在者)', function() {
            let ids = cases.filter((c) => c.wire).map((c) => c.id).sort()
            assert.strict.deepEqual(ids, Object.keys(WIRE).sort())
        })

        //byId
        let byId = (id) => {
            let c = cases.find((v) => v.id === id)
            assert.strict.deepEqual(c !== undefined, true, `語料無案例${id}`)
            return c
        }

        //ROUTES, 本套件三條出口: 傳入值, 回傳該出口實際交出之值
        let ROUTES = [
            {
                name: '伺服端console出口',
                run: async (v) => {
                    let { lines, restore } = capture()
                    try {
                        await serverRun('diaglog-mask-corpus', {}, async ({ inst }) => {
                            inst.emit('error', v)
                        })
                    }
                    finally {
                        restore()
                    }
                    assert.strict.deepEqual(lines.length, 1, str(lines))
                    return lines[0][0]
                },
            },
            {
                name: '前端console出口(getToken拋出)',
                run: async (v) => {
                    let { lines } = await clientRun(() => {
                        throw v
                    }, false)
                    assert.strict.deepEqual(lines.length, 1, str(lines))
                    return lines[0][0]
                },
            },
            {
                name: '前端交給監聽器之值(getToken拋出)',
                run: async (v) => {
                    let { got } = await clientRun(() => {
                        throw v
                    }, true)
                    assert.strict.deepEqual(got.length, 1)
                    return got[0]
                },
            },
        ]

        for (let route of ROUTES) {

            it(`T07(Bearer、token=、"password":、authorization: Basic之未登錄樣式)經${route.name}遮罩`, async function() {
                let c = byId('T07')
                let ctx = mkCtx()
                let out = await route.run(c.make(ctx))
                assert.strict.deepEqual(verify(c, out, ctx), null)
            })

            it(`R01(不含憑證之錯誤回傳同一物件)經${route.name}身分不變`, async function() {
                let c = byId('R01')
                let ctx = mkCtx()
                let e = c.make(ctx)
                let out = await route.run(e)
                assert.strict.deepEqual(verify(c, [e, out], ctx), null)
            })

        }

    })

})
