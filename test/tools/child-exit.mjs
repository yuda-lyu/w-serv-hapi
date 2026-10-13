import fs from 'fs'
import net from 'net'
import evem from 'wsemi/src/evem.mjs'
import WServHapiServer from '../../src/WServHapiServer.mjs'
import WServHapiClient from '../../src/WServHapiClient.mjs'


/**
 * 供測試以子行程驗證伺服器端「失敗後行程可自行結束(無殘留計時器)」與「error監聽器拋錯時行程不崩潰」
 *
 * 用法: node test/tools/child-exit.mjs <mode> <port> <fd>
 * - mode 'ctor-throw': useDbOrm=true而缺authorizeExec, 建構同步拋錯後由使用端catch
 * - mode 'start-fail': 先以net佔用port, 再建構而使啟動失敗, 不呼叫stop
 *   以上兩者之後不再有任何動作; 行程能於時限內自行結束即代表無殘留計時器
 * - mode 'polled-stop': 前端輪詢過後, 前端呼叫clearBroadcast與clearSync, 伺服器stop; 行程結束時印出自stop完成至結束之毫秒數(EXIT-AFTER)
 * - mode 'listener-throw-ctor': 建構期間發生error(pathUploadTemp無法建立), 其error監聽器同步拋錯; 之後照常ready與stop
 * - mode 'listener-throw-start': 先以net佔用port而使啟動失敗, 其error監聽器同步拋錯; 之後照常stop
 *   以上兩者之輸出逐行印出, 行程須以離開碼0結束(未崩潰)
 * - mode 'no-listener-server': 不掛error監聽: 伺服器A之通訊實體上之clientChange監聽拋錯(下層之監聽器拋錯, 經本套件轉送), 伺服器B之apis與通訊路由衝突而啟動失敗(本套件自發, 不綁定, 用第5個參數之port); 兩者須以[w-serv-hapi]前綴出現於stderr
 * - mode 'stop-*': 前端停止之情境(CLAUDE_rulebook.md之R12), 經本套件前端(retryMain=3)於各在途點停止前端, 見runStop
 *
 * why 用子行程: mocha之worker會被重用且自有計時器, 無法於測試行程內以活動資源數斷言; 並會攔截未捕捉之錯誤, 觀察不到行程崩潰
 */

let mode = process.argv[2]
let port = Number(process.argv[3])
let fd = process.argv[4]

let base = {
    port,
    useInert: false,
    useShowLog: false,
    pathUploadTemp: `${fd}/uploadTemp`,
    fpTableTags: `${fd}/tableTags.json`,
}

if (mode === 'ctor-throw') {
    try {
        new WServHapiServer({
            ...base,
            useDbOrm: true,
            operOrm: async () => {},
            tableNamesExec: [],
            kpOrm: {},
        })
        console.log('NOT-THROWN')
    }
    catch (err) {
        console.log(`THROWN ${err.message}`)
    }
}
else if (mode === 'start-fail') {
    let blocker = net.createServer()
    await new Promise((resolve) => {
        blocker.listen(port, resolve)
    })
    let wsrv = new WServHapiServer(base)
    wsrv.on('error', () => {})
    try {
        await wsrv.ready()
        console.log('NOT-REJECTED')
    }
    catch (err) {
        console.log(`REJECTED ${err.code || err.message}`)
    }
    blocker.close()
}
else if (mode === 'polled-stop') {
    let wsrv = new WServHapiServer({ ...base, kpFunExt: { ping: async () => 'pong' } })
    wsrv.on('error', (err) => {
        console.log(`ERROR ${err}`)
    })
    await wsrv.ready()
    let cli = null
    await new Promise((resolve) => {
        cli = new WServHapiClient({
            url: `http://localhost:${port}`,
            useShowLog: false,
            getServerMethods: () => {
                resolve()
            },
        })
        cli.on('error', (err) => {
            console.log(`ERROR ${err}`)
        })
    })
    let inst = await wsrv.getInstWConverServer()
    console.log(`CLIENTS ${inst.getClients().length}`)
    cli.clearBroadcast()
    cli.clearSync()
    //停前端後間隔500ms再停伺服器(R12之取得函數清單後×間隔停止): 本情境所測為伺服端之計時器與在線偵測(原L3);
    //停止時在途之請求由下層中止(w-serv-webdata 1.1.12起), 不需等待, 立即停止之情境另見stop-after-methods
    await new Promise((resolve) => {
        setTimeout(resolve, 500)
    })
    await wsrv.stop()
    let t = Date.now()
    console.log('STOPPED')
    process.on('exit', () => {
        console.log(`EXIT-AFTER ${Date.now() - t}`)
    })
}
else if (mode === 'listener-throw-ctor') {
    //pathUploadTemp置於一般檔案之下, 使w-converhp建構時無法建立資料夾而以建構期之error通知
    let fp = `${fd}/file`
    fs.writeFileSync(fp, 'x', 'utf8')
    let wsrv = new WServHapiServer({ ...base, pathUploadTemp: `${fp}/sub` })
    wsrv.on('error', () => {
        console.log('LISTENER')
        throw new Error('listener-err')
    })
    await wsrv.ready()
    console.log('READY')
    await wsrv.stop()
    console.log('STOPPED')
}
else if (mode === 'listener-throw-start') {
    let blocker = net.createServer()
    await new Promise((resolve) => {
        blocker.listen(port, resolve)
    })
    let wsrv = new WServHapiServer(base)
    wsrv.on('error', () => {
        console.log('LISTENER')
        throw new Error('listener-err')
    })
    try {
        await wsrv.ready()
        console.log('NOT-REJECTED')
    }
    catch (err) {
        console.log(`REJECTED ${err.code || err.message}`)
    }
    await wsrv.stop()
    console.log('STOPPED')
    blocker.close()
}
else if (mode === 'no-listener-server') {

    //伺服器A: 通訊實體上之clientChange監聽首次即拋錯, 由前端之首次輪詢觸發
    let wsrv = new WServHapiServer(base)
    await wsrv.ready()
    let inst = await wsrv.getInstWConverServer()
    let thrown = false
    let pmThrown = new Promise((resolve) => {
        inst.on('clientChange', () => {
            if (thrown) {
                return
            }
            thrown = true
            resolve()
            throw new Error('boom-downstream-listener')
        })
    })
    let cli = new WServHapiClient({
        url: `http://localhost:${port}`,
        useShowLog: false,
    })
    cli.on('error', () => {})
    await pmThrown
    await sleep(50)
    cli.clearBroadcast()
    cli.clearSync()
    await wsrv.stop()

    //伺服器B: apis與通訊路由衝突而啟動失敗, 於server.route即拋錯而不綁定
    let wsrv2 = new WServHapiServer({
        ...base,
        port: Number(process.argv[5]),
        pathUploadTemp: `${fd}/uploadTemp-b`,
        fpTableTags: `${fd}/tableTags-b.json`,
        apis: [{ method: 'POST', path: '/api/main', handler: () => 'x' }],
    })
    await wsrv2.ready().catch(() => {})
    await wsrv2.stop()
    console.log('DONE')

}
else if (mode.indexOf('stop-') === 0) {
    await runStop(mode)
}
else {
    console.log(`INVALID-MODE ${mode}`)
}


/**
 * 前端停止之情境(CLAUDE_rulebook.md之R12), 經本套件前端(retryMain=3), 行程不呼叫process.exit
 *
 * - 'stop-after-methods': 取得函數清單後(getServerMethods之後一個微任務, 時間戳請求在途)停止前端, 立即停伺服器
 * - 'stop-at-open-once': 首次輪詢成功時(openOnce之監聽內, 函數清單請求在途)停止前端, 立即停伺服器
 * - 'stop-during-select': 伺服端正處理同步表之select時(同一行程, 以deferred掛住)停止前端、停伺服器, 伺服器停止後才放行select
 * - 'stop-server-unreachable': 伺服器不可達(port為無人監聽者), 首則error後(輪詢之重試退避中)停止前端
 * - 'stop-after-server-down': 收到同步表資料後(w-serv-webdata之請求皆已結束, 只剩輪詢)先停伺服器, 前端輪詢失敗之首則error後(輪詢之重試退避中)停止前端
 *
 * 輸出: 情境標記(METHODS、RECV、OPEN-ONCE、SELECT-INFLIGHT、FIRST-ERROR、SERVER-STOPPED)以確認確實走到所測之在途點;
 * CLIENT-STOP於前端停止之時刻印出(其後之stdout行供測試計數重試訊息); ERROR-AFTER為前端停止後之每則error; SERVER-STOP-MS為前端停止後伺服器stop之耗時;
 * 行程結束時印GETTOKEN-AFTER(前端停止後getToken之呼叫次數)與EXIT-AFTER(最後一個停止動作完成至行程結束之毫秒數)
 *
 * @param {String} mode 輸入情境字串
 */
async function runStop(mode) {

    //pmStopPoint, 走到所測之在途點即resolve
    let resolveStopPoint = null
    let pmStopPoint = new Promise((resolve) => {
        resolveStopPoint = resolve
    })

    //pmRelease, stop-during-select時掛住伺服端之select, 伺服器停止後才放行
    let release = null
    let pmRelease = new Promise((resolve) => {
        release = resolve
    })

    //wsrv, 同步表tabA之select經operOrm
    let wsrv = null
    if (mode !== 'stop-server-unreachable') {
        wsrv = new WServHapiServer({
            ...base,
            useDbOrm: true,
            kpOrm: { tabA: evem() },
            operOrm: async (userId, tableName, methodName) => {
                if (methodName === 'select' && mode === 'stop-during-select') {
                    console.log('SELECT-INFLIGHT')
                    resolveStopPoint()
                    await pmRelease
                }
                return [{ id: 'id-a1' }]
            },
            authorizeExec: () => true,
            tableNamesExec: ['tabA'],
            tableNamesSync: ['tabA'],
        })
        wsrv.on('error', () => {})
        await wsrv.ready()
    }

    //stopClient, 停止前端: clearBroadcast與clearSync兩者皆呼叫
    let stopped = false
    let nGetTokenAfter = 0
    let cli = null
    let stopClient = () => {
        if (stopped) {
            return
        }
        stopped = true
        console.log('CLIENT-STOP')
        cli.clearBroadcast()
        cli.clearSync()
    }

    //resolveFirstError, 前端停止前之首則error(stop-server-unreachable、stop-after-server-down)
    let recvSeen = false
    let serverDown = mode === 'stop-server-unreachable'
    let resolveFirstError = null
    let pmFirstError = new Promise((resolve) => {
        resolveFirstError = resolve
    })

    cli = new WServHapiClient({
        url: `http://localhost:${port}`,
        useShowLog: false,
        retryMain: 3,
        getToken: () => {
            if (stopped) {
                nGetTokenAfter += 1
            }
            return 'token-for-test'
        },
        getServerMethods: () => {
            console.log('METHODS')
            if (mode === 'stop-after-methods') {
                resolveStopPoint()
            }
        },
        recvData: () => {
            if (mode === 'stop-after-server-down' && !recvSeen) {
                recvSeen = true
                console.log('RECV')
                resolveStopPoint()
            }
        },
    })
    cli.on('openOnce', () => {
        if (mode === 'stop-at-open-once') {
            console.log('OPEN-ONCE')
            stopClient()
            resolveStopPoint()
        }
    })
    cli.on('error', (err) => {
        if (stopped) {
            console.log(`ERROR-AFTER ${strErr(err)}`)
            return
        }
        if (serverDown) {
            console.log('FIRST-ERROR')
            resolveFirstError()
        }
    })
    if (mode === 'stop-server-unreachable') {
        resolveStopPoint()
    }

    //停止
    await pmStopPoint
    if (mode === 'stop-server-unreachable' || mode === 'stop-after-server-down') {
        if (mode === 'stop-after-server-down') {
            await wsrv.stop()
            serverDown = true
            console.log('SERVER-STOPPED')
        }
        await pmFirstError
        stopClient()
    }
    else {
        stopClient()
        let t0 = Date.now()
        await wsrv.stop()
        console.log(`SERVER-STOP-MS ${Date.now() - t0}`)
        release()
    }

    let t = Date.now()
    process.on('exit', () => {
        console.log(`GETTOKEN-AFTER ${nGetTokenAfter}`)
        console.log(`EXIT-AFTER ${Date.now() - t}`)
    })

}


/**
 * 取error之可讀字串
 *
 * @param {*} err 輸入錯誤
 * @returns {String} 回傳字串
 */
function strErr(err) {
    if (err && err.message) {
        return err.message
    }
    if (typeof err === 'string') {
        return err
    }
    try {
        return JSON.stringify(err)
    }
    catch (e) {
        return String(err)
    }
}


/**
 * 等待毫秒
 *
 * @param {Integer} ms 輸入毫秒
 * @returns {Promise} 回傳Promise
 */
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}
