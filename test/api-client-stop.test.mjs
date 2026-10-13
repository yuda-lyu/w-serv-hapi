import assert from 'assert'
import { useTempFolder, removeTempFolder, runChild, deferred, startServer, startClient } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf, reserved } = wPorts


/**
 * 驗證前端停止之範圍(CLAUDE_rulebook.md之R12)
 *
 * 規格來源:
 * - WServHapiClient之@returns「停止時呼叫其clearBroadcast與clearSync，兩者皆須呼叫…兩者皆呼叫後不再送出本套件與下層自身之請求(輪詢、取得函數清單、時間戳與同步表資料)，
 *   停止時在途者一併中止：不再重試、不再發出其各次嘗試失敗之error、不再為其呼叫getToken，亦不再撐住Node行程…」
 *   「使用端經getServerMethods所取得之函數…之呼叫…不受停止影響：照常完成…」
 * - WServHapiServer之@returns「stop只等連線…連線已中斷者(例如前端已停止而中止其請求)stop即完成」「仍有請求進行中之連線最多等待5秒」
 * - 建議w-serv-hapi調整.md第3點: 經本套件之前端(retryMain=3), 取得函數清單後立即停止前端再停伺服器, 停止後之error 0則, 行程於停止後500ms內自然結束
 *
 * 行程結束時間須於獨立行程觀察, 故以子行程執行(test/tools/child-exit.mjs之stop-*模式);
 * 重試訊息為w-converhp前端之console.log, 以子行程stdout中CLIENT-STOP之後之行計數
 */
describe('api-client-stop', function() {

    //runStopChild, 執行stop-*模式之子行程並解析其輸出
    async function runStopChild(mode, port, name) {
        let fd = useTempFolder(`client-stop-${name}`)
        try {
            let r = await runChild(['test/tools/child-exit.mjs', mode, String(port), fd], { timeout: 20000 })
            let lines = r.out.split(/\r?\n/)
            let iStop = lines.indexOf('CLIENT-STOP')
            let linesAfter = iStop >= 0 ? lines.slice(iStop + 1) : []
            let numOf = (key) => {
                let v = lines.find((s) => {
                    return s.indexOf(`${key} `) === 0
                })
                return v === undefined ? null : Number(v.slice(key.length + 1))
            }
            return {
                exited: r.exited,
                code: r.code,
                marks: lines.filter((s) => {
                    return /^(METHODS|RECV|OPEN-ONCE|SELECT-INFLIGHT|FIRST-ERROR|SERVER-STOPPED|CLIENT-STOP)$/.test(s)
                }),
                errorsAfter: lines.filter((s) => {
                    return s.indexOf('ERROR-AFTER ') === 0
                }),
                retryLinesAfter: linesAfter.filter((s) => {
                    return /to retry|retry n=/.test(s)
                }).length,
                getTokenAfter: numOf('GETTOKEN-AFTER'),
                serverStopMs: numOf('SERVER-STOP-MS'),
                exitAfter: numOf('EXIT-AFTER'),
            }
        }
        finally {
            removeTempFolder(fd)
        }
    }

    //expectClean, 前端停止後之共同斷言: 確實走到所測之在途點、停止後0則error、0行重試訊息、0次getToken, 行程於最後一個停止動作後500ms內自行結束
    function expectClean(r, marks) {
        assert.strict.deepEqual(r.marks, marks)
        assert.strict.deepEqual([r.exited, r.code], [true, 0])
        assert.strict.deepEqual(r.errorsAfter, [])
        assert.strict.deepEqual(r.retryLinesAfter, 0)
        assert.strict.deepEqual(r.getTokenAfter, 0)
        assert.strict.deepEqual(r.exitAfter !== null && r.exitAfter < 500, true, `停止後${r.exitAfter}ms才結束`)
    }

    it('取得函數清單後立即停止前端與伺服器: 停止後0則error、0行重試訊息、0次getToken, 行程於伺服器stop後500ms內結束(子行程)', async function() {
        let r = await runStopChild('stop-after-methods', portOf('api-client-stop', 0), 'after-methods')
        expectClean(r, ['METHODS', 'CLIENT-STOP'])
    })

    it('首次輪詢成功時(取得函數清單之請求在途)停止前端與伺服器: 停止後0則error、0行重試訊息、0次getToken, 行程於伺服器stop後500ms內結束(子行程)', async function() {
        let r = await runStopChild('stop-at-open-once', portOf('api-client-stop', 1), 'at-open-once')
        expectClean(r, ['OPEN-ONCE', 'CLIENT-STOP'])
    })

    it('同步表之select在途時停止前端與伺服器: 停止後0則error, 伺服器stop不等已中止之連線而於500ms內完成, 行程於其後500ms內結束(子行程)', async function() {
        let r = await runStopChild('stop-during-select', portOf('api-client-stop', 2), 'during-select')
        expectClean(r, ['METHODS', 'SELECT-INFLIGHT', 'CLIENT-STOP'])
        assert.strict.deepEqual(r.serverStopMs !== null && r.serverStopMs < 500, true, `伺服器stop耗時${r.serverStopMs}ms`)
    })

    it('伺服器不可達時於輪詢之重試退避中停止前端: 停止後0則error、0行重試訊息、0次getToken, 行程於停止後500ms內結束(子行程)', async function() {
        let r = await runStopChild('stop-server-unreachable', reserved.closed, 'server-unreachable')
        expectClean(r, ['FIRST-ERROR', 'CLIENT-STOP'])
    })

    it('收到同步表資料後先停伺服器, 前端輪詢之重試退避中再停前端: 停止後0則error、0行重試訊息、0次getToken, 行程於停止後500ms內結束(子行程)', async function() {
        let r = await runStopChild('stop-after-server-down', portOf('api-client-stop', 4), 'after-server-down')
        expectClean(r, ['METHODS', 'RECV', 'SERVER-STOPPED', 'FIRST-ERROR', 'CLIENT-STOP'])
    })

    it('使用端之$fapi在途時停止前端: 不中止而照常resolve, 伺服器stop等其連線結束, 前端0則error', async function() {
        let called = deferred()
        let hold = deferred()
        let srv = null
        let c = null
        try {
            srv = await startServer({
                name: 'client-stop-fapi',
                port: portOf('api-client-stop', 3),
                kpFunExt: {
                    slow: async () => {
                        called.resolve()
                        await hold.promise
                        return 'slow-done'
                    },
                },
            })
            c = startClient({ port: srv.port })
            let methods = await c.methods
            let pmFapi = methods.slow()

            //$fapi已抵達伺服端而在途時停止前端, 再停伺服器; 伺服端處理300ms後才回應
            await called.promise
            c.stop()
            setTimeout(() => {
                hold.resolve()
            }, 300)
            let t0 = Date.now()
            await srv.wsrv.stop()
            let ms = Date.now() - t0

            assert.strict.deepEqual(await pmFapi, 'slow-done')
            assert.strict.deepEqual(ms >= 250, true, `伺服器stop於${ms}ms即完成, 未等$fapi之連線`)
            assert.strict.deepEqual(c.errors, [])
        }
        finally {
            hold.resolve()
            if (c) {
                c.stop()
            }
            if (srv) {
                await srv.stop()
            }
        }
    })

})
