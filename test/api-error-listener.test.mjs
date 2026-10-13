import assert from 'assert'
import { useTempFolder, removeTempFolder, runChild } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf } = wPorts


/**
 * 驗證本套件自發之error事件: 使用端之error監聽器同步拋錯時行程不崩潰, 其餘流程照常
 *
 * 規格來源:
 * - WServHapiServer之@returns「可監聽error事件…使用端error監聽器之同步拋錯不會使行程崩潰(改以console.error輸出)…ready…啟動失敗時以原錯誤reject；stop…恆resolve」
 *   「涵蓋…執行期錯誤(含w-converhp、w-serv-webdata、w-serv-broadcast、w-sync-webdata經本套件轉送者)…未監聽error時改以console.error輸出(前綴[w-serv-hapi])」
 * - WServHapiClient之@returns「本套件自發之error…監聽器之同步拋錯不會使行程崩潰(改以console.error輸出)」「未監聽error時，本套件…之error改以console.error輸出」
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

    it('伺服器: 建構期間之error其監聽器同步拋錯時, 行程不崩潰, 照常啟動與停止', async function() {
        let fd = useTempFolder('error-listener-ctor')
        try {
            let r = await runChild(['test/tools/child-exit.mjs', 'listener-throw-ctor', String(portOf('api-error-listener', 0)), fd])
            assert.strict.deepEqual(marks(r.out), ['LISTENER', 'READY', 'STOPPED'])
            assert.strict.deepEqual([r.exited, r.code, r.err.includes('listener-err')], [true, 0, true])
        }
        finally {
            removeTempFolder(fd)
        }
    })

    it('伺服器: 啟動失敗之error其監聽器同步拋錯時, 行程不崩潰, ready照常reject, stop照常resolve', async function() {
        let fd = useTempFolder('error-listener-start')
        try {
            let r = await runChild(['test/tools/child-exit.mjs', 'listener-throw-start', String(portOf('api-error-listener', 1)), fd])
            assert.strict.deepEqual(marks(r.out), ['LISTENER', 'REJECTED EADDRINUSE', 'STOPPED'])
            assert.strict.deepEqual([r.exited, r.code, r.err.includes('listener-err')], [true, 0, true])
        }
        finally {
            removeTempFolder(fd)
        }
    })

    it('前端: 等待token期間getToken拋錯之error其監聽器同步拋錯時, 行程不崩潰', async function() {
        let r = await runChild(['test/tools/child-client.mjs', 'listener-throw'], { timeout: 10000 })
        assert.strict.deepEqual(marks(r.out), ['LISTENER token-err', 'DONE'])
        assert.strict.deepEqual([r.exited, r.code, r.err.includes('listener-err')], [true, 0, true])
    })

    //errLinesOf, 取stderr中以[w-serv-hapi]前綴輸出之行(含其後同一則輸出之內容, 以前綴切段)
    let errLinesOf = (err) => {
        return err.split('[w-serv-hapi]').slice(1)
    }

    it('伺服器: 未監聽error時, 經本套件轉送之下層監聽器拋錯與本套件自發之啟動失敗皆以[w-serv-hapi]前綴輸出至stderr', async function() {
        //伺服器A: 通訊實體之clientChange監聽拋錯(w-serv-broadcast所派發, 經本套件轉送); 伺服器B: apis與通訊路由衝突而啟動失敗(本套件自發, 不綁定)
        //修正前兩者皆靜默: 本套件之轉送監聽使下層判定有人在聽, 外層無人聽即遺失
        let fd = useTempFolder('error-listener-none-server')
        try {
            let r = await runChild(['test/tools/child-exit.mjs', 'no-listener-server', String(portOf('api-error-listener', 0)), fd, String(portOf('api-error-listener', 1))])
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

    it('前端: 未監聽error時, 本套件自發之error(等待token期間getToken拋錯)以[w-serv-hapi]前綴輸出至stderr', async function() {
        let r = await runChild(['test/tools/child-client.mjs', 'no-listener'], { timeout: 10000 })
        let segs = errLinesOf(r.err)
        assert.strict.deepEqual(marks(r.out), ['DONE'])
        assert.strict.deepEqual([r.exited, r.code], [true, 0])
        assert.strict.deepEqual(segs.length, 1, `stderr: ${r.err}`)
        assert.strict.deepEqual(segs[0].includes('token-err-no-listener'), true, `stderr: ${r.err}`)
    })

})
