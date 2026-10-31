import assert from 'assert'
import { useTempFolder, removeTempFolder, runChild } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf } = wPorts


/**
 * 驗證本套件自發之error事件: 使用端之error監聽器同步拋錯時行程不崩潰, 其餘流程照常
 *
 * 規格來源:
 * - WServHapiServer之@returns「可監聽error事件…使用端error監聽器之同步拋錯不會使行程崩潰(改以console.error輸出)…ready…啟動失敗時以原錯誤reject；stop…恆resolve」
 *   「涵蓋…執行期錯誤(含w-converhp、w-serv-webdata、w-serv-broadcast、w-sync-webdata經本套件轉送者)…未監聽error時改以console.error輸出(前綴[w-serv-hapi])，預設只輸出固定標籤與錯誤類別、代碼之安全摘要…細節由opt.logDetail或opt.funLog取得」
 * - WServHapiClient之@returns「本套件自發之error…監聽器之同步拋錯不會使行程崩潰(改以console.error輸出)」「未監聽error時，本套件…之error改以console.error輸出…預設只含固定標籤'[w-serv-hapi] error'與錯誤類別、代碼之安全摘要…細節由opt.logDetail或opt.funLog取得」
 * - 兩端opt.logDetail、opt.funLog之「本套件自身之診斷輸出」: 監聽器拋錯之通報亦屬之(經wsemi之evEmit輸出, 標籤'[wsemi w-serv-hapi] listener threw'), 預設只含標籤與{ errType }, 不含拋出值; logDetail為true時含遮罩後之細節; funLog給予時只交給它而不寫console
 *
 * 以子行程執行(test/tools/child-exit.mjs、test/tools/child-client.mjs): mocha會攔截未捕捉之錯誤, 於測試行程內觀察不到崩潰
 */
describe('api-error-listener', function() {

    //marks, 取子行程輸出中之標記行(略過下游之除錯輸出)
    let marks = (out) => {
        return out.split(/\r?\n/).filter((v) => {
            return /^(LISTENER|READY|STOPPED|REJECTED|NOT-REJECTED|DONE|INVALID-MODE)/.test(v)
        })
    }

    //LABEL, wsemi之evEmit攔截監聽器拋錯後輸出之固定標籤(tag為本套件之'w-serv-hapi'; 事件名與拋出值不入標籤)
    let LABEL = '[wsemi w-serv-hapi] listener threw'

    //funLogsOf, 取子行程stdout中funLog收到之該則通報(FUNLOG行; label之後依序為safe之JSON、細節之event、細節內拋出值之message)
    let funLogsOf = (out) => {
        return out.split(/\r?\n/).filter((v) => {
            return v.startsWith(`FUNLOG ${LABEL} `)
        })
    }

    //預設(未給logDetail與funLog): 只輸出固定標籤與安全摘要, 不含監聽器拋出之原文, 亦無funLog之輸出
    let assertDefault = (r) => {
        assert.strict.deepEqual([r.exited, r.code], [true, 0])
        assert.strict.deepEqual([r.err.includes(LABEL), r.err.includes('errType: \'Error\''), r.err.includes('listener-err')], [true, true, false], `stderr: ${r.err}`)
        assert.strict.deepEqual(funLogsOf(r.out), [])
    }

    //logDetail:true: 標籤之外輸出遮罩後之細節, 含事件名與監聽器拋出之原文
    let assertDetail = (r) => {
        assert.strict.deepEqual([r.exited, r.code], [true, 0])
        assert.strict.deepEqual([r.err.includes(LABEL), r.err.includes('event: \'error\''), r.err.includes('listener-err')], [true, true, true], `stderr: ${r.err}`)
    }

    //funLog: 通報只交給funLog(label、safe、detail), 不寫console
    let assertFunLog = (r) => {
        assert.strict.deepEqual([r.exited, r.code], [true, 0])
        assert.strict.deepEqual(funLogsOf(r.out), [`FUNLOG ${LABEL} {"errType":"Error"} error listener-err`], `stdout: ${r.out}`)
        assert.strict.deepEqual([r.err.includes(LABEL), r.err.includes('listener-err')], [false, false], `stderr: ${r.err}`)
    }

    //runServer, 以子行程執行伺服端之監聽器拋錯情境(mode為listener-throw-ctor或listener-throw-start; arg為''、'detail'或'funlog')
    let runServer = async (name, mode, i, arg) => {
        let fd = useTempFolder(name)
        try {
            return await runChild(['test/tools/child-exit.mjs', mode, String(portOf('api-error-listener', i)), fd, ...(arg === '' ? [] : [arg])])
        }
        finally {
            removeTempFolder(fd)
        }
    }

    let marksCtor = ['LISTENER', 'READY', 'STOPPED']
    let marksStart = ['LISTENER', 'REJECTED EADDRINUSE', 'STOPPED']
    let marksCli = ['LISTENER token-err', 'DONE']

    it('伺服器: 建構期間之error其監聽器同步拋錯時, 行程不崩潰, 照常啟動與停止, stderr只含標籤與安全摘要而不含拋出值', async function() {
        let r = await runServer('error-listener-ctor', 'listener-throw-ctor', 0, '')
        assert.strict.deepEqual(marks(r.out), marksCtor)
        assertDefault(r)
    })

    it('伺服器: 啟動失敗之error其監聽器同步拋錯時, 行程不崩潰, ready照常reject, stop照常resolve, stderr只含標籤與安全摘要而不含拋出值', async function() {
        let r = await runServer('error-listener-start', 'listener-throw-start', 1, '')
        assert.strict.deepEqual(marks(r.out), marksStart)
        assertDefault(r)
    })

    it('前端: 等待token期間getToken拋錯之error其監聽器同步拋錯時, 行程不崩潰, stderr只含標籤與安全摘要而不含拋出值', async function() {
        let r = await runChild(['test/tools/child-client.mjs', 'listener-throw'], { timeout: 10000 })
        assert.strict.deepEqual(marks(r.out), marksCli)
        assertDefault(r)
    })

    it('伺服器: 建構期間之error其監聽器同步拋錯而給logDetail:true時, 行程不崩潰, stderr含遮罩後之細節(拋出值)', async function() {
        let r = await runServer('error-listener-ctor-detail', 'listener-throw-ctor', 0, 'detail')
        assert.strict.deepEqual(marks(r.out), marksCtor)
        assertDetail(r)
    })

    it('伺服器: 啟動失敗之error其監聽器同步拋錯而給logDetail:true時, 行程不崩潰, ready照常reject, stop照常resolve, stderr含遮罩後之細節(拋出值)', async function() {
        let r = await runServer('error-listener-start-detail', 'listener-throw-start', 1, 'detail')
        assert.strict.deepEqual(marks(r.out), marksStart)
        assertDetail(r)
    })

    it('前端: 等待token期間getToken拋錯之error其監聽器同步拋錯而給logDetail:true時, 行程不崩潰, stderr含遮罩後之細節(拋出值)', async function() {
        let r = await runChild(['test/tools/child-client.mjs', 'listener-throw-detail'], { timeout: 10000 })
        assert.strict.deepEqual(marks(r.out), marksCli)
        assertDetail(r)
    })

    it('伺服器: 建構期間之error其監聽器同步拋錯而給funLog時, 行程不崩潰, 通報只交給funLog而不寫stderr', async function() {
        let r = await runServer('error-listener-ctor-funlog', 'listener-throw-ctor', 0, 'funlog')
        assert.strict.deepEqual(marks(r.out), marksCtor)
        assertFunLog(r)
    })

    it('伺服器: 啟動失敗之error其監聽器同步拋錯而給funLog時, 行程不崩潰, ready照常reject, stop照常resolve, 通報只交給funLog而不寫stderr', async function() {
        let r = await runServer('error-listener-start-funlog', 'listener-throw-start', 1, 'funlog')
        assert.strict.deepEqual(marks(r.out), marksStart)
        assertFunLog(r)
    })

    it('前端: 等待token期間getToken拋錯之error其監聽器同步拋錯而給funLog時, 行程不崩潰, 通報只交給funLog而不寫stderr', async function() {
        let r = await runChild(['test/tools/child-client.mjs', 'listener-throw-funlog'], { timeout: 10000 })
        assert.strict.deepEqual(marks(r.out), marksCli)
        assertFunLog(r)
    })

    //errLinesOf, 取stderr中以[w-serv-hapi]前綴輸出之行(含其後同一則輸出之內容, 以前綴切段)
    let errLinesOf = (err) => {
        return err.split('[w-serv-hapi]').slice(1)
    }

    it('伺服器: 未監聽error時, 經本套件轉送之下層監聽器拋錯與本套件自發之啟動失敗皆以[w-serv-hapi]前綴輸出至stderr(預設只含標籤與安全摘要, 不含錯誤原文)', async function() {
        //伺服器A: 通訊實體之clientChange監聽拋錯(w-serv-broadcast所派發, 經本套件轉送); 伺服器B: apis與通訊路由衝突而啟動失敗(本套件自發, 不綁定)
        //修正前兩者皆靜默: 本套件之轉送監聽使下層判定有人在聽, 外層無人聽即遺失; 2026-10-31(R16)起預設只輸出安全摘要
        let fd = useTempFolder('error-listener-none-server')
        try {
            let r = await runChild(['test/tools/child-exit.mjs', 'no-listener-server', String(portOf('api-error-listener', 0)), fd, String(portOf('api-error-listener', 1))])
            let segs = errLinesOf(r.err)
            assert.strict.deepEqual(marks(r.out), ['DONE'])
            assert.strict.deepEqual([r.exited, r.code], [true, 0])
            assert.strict.deepEqual(segs.some((s) => s.includes('error') && s.includes('from: \'downstream\'')), true, `stderr: ${r.err}`)
            assert.strict.deepEqual(segs.some((s) => s.includes('error') && s.includes('from: \'start\'')), true, `stderr: ${r.err}`)
            assert.strict.deepEqual([r.err.includes('boom-downstream-listener'), r.err.includes('conflicts with existing')], [false, false], `stderr: ${r.err}`)
        }
        finally {
            removeTempFolder(fd)
        }
    })

    it('伺服器: 未監聽error而給logDetail:true時, stderr含遮罩後之錯誤原文(下層監聽器拋錯、啟動失敗)', async function() {
        let fd = useTempFolder('error-listener-none-server-detail')
        try {
            let r = await runChild(['test/tools/child-exit.mjs', 'no-listener-server', String(portOf('api-error-listener', 0)), fd, String(portOf('api-error-listener', 1)), 'detail'])
            let segs = errLinesOf(r.err)
            assert.strict.deepEqual(marks(r.out), ['DONE'])
            assert.strict.deepEqual([r.exited, r.code], [true, 0])
            assert.strict.deepEqual(segs.some((s) => s.includes('listener of event[clientChange] error') && s.includes('boom-downstream-listener')), true, `stderr: ${r.err}`)
            assert.strict.deepEqual(segs.some((s) => s.includes('conflicts with existing /api/main')), true, `stderr: ${r.err}`)
        }
        finally {
            removeTempFolder(fd)
        }
    })

    it('前端: 未監聽error時, 本套件自發之error(等待token期間getToken拋錯)以[w-serv-hapi]前綴輸出至stderr(預設只含標籤與安全摘要, 不含拋出值)', async function() {
        let r = await runChild(['test/tools/child-client.mjs', 'no-listener'], { timeout: 10000 })
        let segs = errLinesOf(r.err)
        assert.strict.deepEqual(marks(r.out), ['DONE'])
        assert.strict.deepEqual([r.exited, r.code], [true, 0])
        assert.strict.deepEqual(segs.length, 1, `stderr: ${r.err}`)
        assert.strict.deepEqual([segs[0].includes('from: \'getToken\''), r.err.includes('token-err-no-listener')], [true, false], `stderr: ${r.err}`)
    })

    it('前端: 未監聽error而給logDetail:true時, stderr含遮罩後之getToken拋出值', async function() {
        let r = await runChild(['test/tools/child-client.mjs', 'no-listener-detail'], { timeout: 10000 })
        let segs = errLinesOf(r.err)
        assert.strict.deepEqual(marks(r.out), ['DONE'])
        assert.strict.deepEqual([r.exited, r.code], [true, 0])
        assert.strict.deepEqual(segs.length, 1, `stderr: ${r.err}`)
        assert.strict.deepEqual(segs[0].includes('token-err-no-listener'), true, `stderr: ${r.err}`)
    })

})
