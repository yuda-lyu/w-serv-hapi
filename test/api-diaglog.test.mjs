import assert from 'assert'
import { inspect } from 'util'
import WServHapiServer from '../src/WServHapiServer.mjs'
import { useTempFolder, removeTempFolder, waitFor, startServer, startClient } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf } = wPorts


/**
 * 驗證診斷輸出選項(logDetail、funLog)確實到達w-serv-webdata(伺服器端與前端)
 *
 * 規格來源: WServHapiServer與WServHapiClient之JSDoc
 * - opt.logDetail「輸入w-serv-webdata之診斷輸出是否還原為完整細節…原樣轉傳w-serv-webdata。預設false時診斷輸出只含固定標籤與不含資料值、使用者id、token及錯誤原文之摘要；token無論如何皆遮罩為'[token]'。有給(非undefined、null)但非布林值時建構即同步拋錯」
 * - opt.funLog「輸入w-serv-webdata之診斷輸出函數(label, safe, detail)…給予時其診斷輸出只交給它而不寫console：label為固定標籤，safe為不含資料值之摘要，detail為完整細節(含資料值與錯誤原文，token已遮罩…)…有給(非undefined、null)但非函數時建構即同步拋錯」
 *
 * 本套件不訂預設與檢核(伺服端: 規則帳本R1), 本測試測的是「選項確實到達下游, 行為與所給之設定一致」, 下游自身之邊界(遮罩範圍、拷貝規則等)由w-serv-webdata單一擁有並測試
 * 前端以「回調函數(recvData)於前端停止後才拋錯」觸發下游之診斷輸出(下游前端唯一之console.error站); 伺服端於經本套件建構時無診斷輸出站, 故以無效值之同步拋錯證明選項已到達下游
 */
describe('api-diaglog', function() {

    //pThrow, 供建構即同步拋錯與有效值之情境依序共用(用完即停); pServ, 供前端各情境依序共用
    let pThrow = portOf('api-diaglog', 0)
    let pServ = portOf('api-diaglog', 1)

    //LABEL, 下游前端於回調函數停止後才拋錯時之診斷輸出標籤
    let LABEL = '[w-serv-webdata] callback error after stop'

    //TEXT, TOKEN, 回調函數拋出之錯誤原文(夾帶資料值與startClient預設之token)
    let TEXT = 'raw-error-text-6 uid=u-secret-uid-3'
    let TOKEN = 'token-for-test'

    let sleep = (ms) => {
        return new Promise((resolve) => {
            setTimeout(resolve, ms)
        })
    }

    //throwOf, 回傳伺服端建構時同步拋出之錯誤訊息; 未拋錯時先停掉伺服器再回null
    async function throwOf(extra) {
        let fd = useTempFolder('diaglog-throw')
        let wsrv = null
        try {
            wsrv = new WServHapiServer({
                port: pThrow,
                useInert: false,
                useShowLog: false,
                pathUploadTemp: `${fd}/uploadTemp`,
                fpTableTags: `${fd}/tableTags.json`,
                ...extra,
            })
        }
        catch (err) {
            removeTempFolder(fd)
            return err.message
        }
        wsrv.on('error', () => {})
        await wsrv.stop()
        removeTempFolder(fd)
        return null
    }

    it('伺服端logDetail有給但非布林值時建構即同步拋錯, undefined、null與布林值不拋', async function() {
        let rs = []
        let expected = []
        for (let v of [123, 'x', {}]) {
            rs.push([v, await throwOf({ logDetail: v })])
            expected.push([v, 'invalid opt.logDetail'])
        }
        for (let v of [undefined, null, true, false]) {
            rs.push([v, await throwOf({ logDetail: v })])
            expected.push([v, null])
        }
        assert.strict.deepEqual(rs, expected)
    })

    it('伺服端funLog有給但非函數時建構即同步拋錯, undefined、null與函數不拋', async function() {
        let rs = []
        let expected = []
        for (let v of [123, 'x', true, {}]) {
            rs.push([v, await throwOf({ funLog: v })])
            expected.push([v, 'invalid opt.funLog'])
        }
        for (let v of [undefined, null, () => {}]) {
            rs.push([typeof v, await throwOf({ funLog: v })])
            expected.push([typeof v, null])
        }
        assert.strict.deepEqual(rs, expected)
    })

    //capture, 擷取本行程之console.error輸出
    let capture = () => {
        let errors = []
        let org = console.error
        console.error = (...args) => {
            errors.push(args)
        }
        let restore = () => {
            console.error = org
        }
        return { errors, restore }
    }

    //session, 起真伺服器與前端, 前端recvData於首次收到同步表資料時停止前端並拋出夾帶資料值與token之錯誤(停止後才拋錯, 走下游之診斷輸出); 回傳{ errors, funCalls }
    async function session({ name, useWaitToken, optClient = {} }) {
        let { errors, restore } = capture()
        let funCalls = []
        let srv = null
        let c = null

        //funLog, 有給時包一層以記錄每次呼叫
        let funLog = optClient.funLog
        if (funLog) {
            optClient = {
                ...optClient,
                funLog: (...args) => {
                    funCalls.push(args)
                    return funLog(...args)
                },
            }
        }

        try {
            srv = await startServer({ name, port: pServ })
            c = startClient({
                port: pServ,
                optClient: {
                    useWaitToken,
                    recvData: () => {
                        c.stop()
                        throw new Error(`${TEXT} token=${TOKEN}`)
                    },
                    ...optClient,
                },
            })
            await waitFor(() => {
                return funCalls.length >= 1 || errors.some((v) => v[0] === LABEL)
            }, { msg: '未等到診斷輸出', timeout: 20000 })
            await sleep(300) //再觀察一段時間, 確認不重複輸出
        }
        finally {
            if (c) {
                c.stop()
            }
            restore()
            if (srv) {
                await srv.stop()
            }
        }
        return { errors: errors.filter((v) => v[0] === LABEL), funCalls }
    }

    let nm = 0
    for (let useWaitToken of [false, true]) {

        it(`前端未給logDetail與funLog時, 診斷輸出只含標籤與摘要, 不含錯誤原文與token(useWaitToken=${useWaitToken})`, async function() {
            let r = await session({ name: `diaglog-def-${nm++}`, useWaitToken })
            //JSDoc: 預設false時診斷輸出只含固定標籤與…摘要
            assert.strict.deepEqual(r.errors, [[LABEL, { hook: 'recvData', errType: 'Error' }]])
            let s = inspect(r.errors, { depth: 10 })
            assert.strict.deepEqual([s.includes(TEXT), s.includes(TOKEN)], [false, false])
        })

        it(`前端給logDetail=true時, 診斷輸出還原為含錯誤原文之完整細節, token遮罩(useWaitToken=${useWaitToken})`, async function() {
            let r = await session({ name: `diaglog-det-${nm++}`, useWaitToken, optClient: { logDetail: true } })
            //JSDoc: logDetail還原為完整細節; token無論如何皆遮罩為'[token]'
            assert.strict.deepEqual(r.errors.length, 1)
            assert.strict.deepEqual(r.errors[0][0], LABEL)
            let s = inspect(r.errors[0].slice(1), { depth: 10 })
            assert.strict.deepEqual([s.includes('raw-error-text-6'), s.includes('u-secret-uid-3'), s.includes(TOKEN), s.includes('[token]')], [true, true, false, true])
        })

        it(`前端給funLog時, 診斷輸出只交給funLog(label, safe, detail)而不寫console, detail含錯誤原文且token遮罩(useWaitToken=${useWaitToken})`, async function() {
            let r = await session({ name: `diaglog-fun-${nm++}`, useWaitToken, optClient: { funLog: () => {} } })
            //JSDoc: 給予時其診斷輸出只交給它而不寫console; label為固定標籤, safe為不含資料值之摘要, detail為完整細節(token已遮罩)
            assert.strict.deepEqual(r.errors, [])
            assert.strict.deepEqual(r.funCalls.length, 1)
            let [label, safe, detail] = r.funCalls[0]
            assert.strict.deepEqual([label, safe], [LABEL, { hook: 'recvData', errType: 'Error' }])
            let s = inspect(detail, { depth: 10 })
            assert.strict.deepEqual([s.includes('raw-error-text-6'), s.includes('u-secret-uid-3'), s.includes(TOKEN), s.includes('[token]')], [true, true, false, true])
        })

    }

})
