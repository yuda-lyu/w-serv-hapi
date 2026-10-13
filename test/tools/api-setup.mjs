import fs from 'fs'
import { spawn } from 'child_process'
import WOrm from 'w-orm-lowdb/src/WOrmLowdb.mjs'
import WServHapiServer from '../../src/WServHapiServer.mjs'
import WServHapiClient from '../../src/WServHapiClient.mjs'


/**
 * api層測試之共用層
 *
 * 各測試檔以不同port與不同暫存資料夾隔離, 故可各自獨立執行
 * 本檔不帶.test.中綴且置於test/tools, 避免被runner當測試檔抓取
 */


/**
 * 取得測試專用暫存資料夾路徑(不建立)
 *
 * why 落於test/_tmp: ./tmp為AI代理暫存區, 隨時可能被整個清除, 測試途中被刪即假失敗; test/_tmp已列gitignore, 由各測試自行清理
 *
 * @param {String} name 輸入測試名稱字串
 * @returns {String} 回傳資料夾路徑字串
 */
function tempFolderOf(name) {
    return `./test/_tmp/${name}`
}


/**
 * 建立測試專用暫存資料夾(先清後建), 使測試產物(db、tableTags、uploadTemp)不落入專案根目錄
 *
 * @param {String} name 輸入測試名稱字串
 * @returns {String} 回傳資料夾路徑字串
 */
function useTempFolder(name) {
    let fd = tempFolderOf(name)
    removeTempFolder(fd)
    fs.mkdirSync(fd, { recursive: true })
    return fd
}


/**
 * 刪除測試專用暫存資料夾, 測完即刪不殘留
 *
 * @param {String} fd 輸入資料夾路徑字串
 */
function removeTempFolder(fd) {
    fs.rmSync(fd, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}


/**
 * 等待條件成立, 逾時則以錯誤拒絕
 *
 * @param {Function} fun 輸入條件函數, 回傳true代表成立
 * @param {Object} [opt={}] 輸入設定物件, 預設{}
 * @param {String} [opt.msg='waitFor timeout'] 輸入逾時訊息字串
 * @param {Integer} [opt.timeout=10000] 輸入逾時時間整數, 單位ms
 * @param {Integer} [opt.interval=100] 輸入檢查間隔整數, 單位ms
 * @returns {Promise} 回傳Promise
 */
async function waitFor(fun, opt = {}) {
    let msg = opt.msg || 'waitFor timeout'
    let timeout = opt.timeout || 10000
    let interval = opt.interval || 100
    let tStart = Date.now()
    while (true) {
        let b = await fun()
        if (b) {
            return true
        }
        if (Date.now() - tStart > timeout) {
            throw new Error(msg)
        }
        await new Promise((resolve) => {
            setTimeout(resolve, interval)
        })
    }
}


/**
 * 產生可由外部settle之promise
 *
 * @returns {Object} 回傳物件, promise為promise本體, resolve與reject供外部呼叫
 */
function deferred() {
    let resolve = null
    let reject = null
    let promise = new Promise((_resolve, _reject) => {
        resolve = _resolve
        reject = _reject
    })
    return { promise, resolve, reject }
}


/**
 * 以子行程執行node腳本, 時限內須自行結束
 *
 * why 用子行程: 「行程可自行結束(無殘留計時器)」與「行程不崩潰」皆須於獨立行程觀察; mocha之worker會被重用且自有計時器, 並會攔截未捕捉之錯誤
 * 以close而非exit判定結束: exit可能早於stdout與stderr讀完
 *
 * @param {Array} args 輸入node之參數陣列, 首項為腳本路徑(相對於repo根)
 * @param {Object} [opt={}] 輸入設定物件, 預設{}
 * @param {Integer} [opt.timeout=15000] 輸入時限整數, 單位ms, 逾時即終止子行程
 * @returns {Promise} 回傳Promise, resolve為物件{ exited, code, out, err }, exited為是否於時限內自行結束, code為離開碼, out與err為stdout與stderr
 */
function runChild(args, opt = {}) {
    let timeout = opt.timeout || 15000
    return new Promise((resolve) => {
        let child = spawn(process.execPath, args, { cwd: process.cwd() })
        let out = ''
        let err = ''
        child.stdout.on('data', (d) => {
            out += d
        })
        child.stderr.on('data', (d) => {
            err += d
        })
        let t = setTimeout(() => {
            child.kill()
            resolve({ exited: false, code: null, out, err })
        }, timeout)
        child.on('close', (code) => {
            clearTimeout(t)
            resolve({ exited: true, code, out, err })
        })
    })
}


/**
 * 啟動測試用伺服器(開啟資料通道)
 *
 * @param {Object} opt 輸入設定物件
 * @param {String} opt.name 輸入測試名稱字串, 供暫存資料夾命名
 * @param {Integer} opt.port 輸入伺服器port整數, 須由test/tools/ports.mjs之portOf取得
 * @param {Array} [opt.tableNamesExec=['tabA','tabB']] 輸入可操作表名陣列
 * @param {Array} [opt.tableNamesSync=['tabA']] 輸入可同步表名陣列
 * @param {Object} [opt.seed={}] 輸入各表初始資料物件, key為表名而值為資料陣列
 * @param {Object} [opt.kpFunExt={}] 輸入擴充函數物件
 * @param {Function} [opt.authorizeExec=null] 輸入授權函數, 未給時全部放行; 不論給否, 每次呼叫皆記錄於回傳之callsAuthorize
 * @param {Object} [opt.optServer={}] 輸入覆寫WServHapiServer設定之物件
 * @returns {Promise} 回傳Promise, resolve為物件, 內含wsrv、port、kpOrm、fd、errors、callsOperOrm、callsAuthorize、stop
 */
async function startServer(opt) {
    let name = opt.name

    //port, 一律由test/tools/ports.mjs集中配發; 缺漏即拋錯, 不靜默回落到套件預設值而與他檔撞號
    let port = opt.port
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error('startServer: 須以test/tools/ports.mjs之portOf給予port')
    }
    let tableNamesExec = opt.tableNamesExec || ['tabA', 'tabB']
    let tableNamesSync = opt.tableNamesSync || ['tabA']
    let seed = opt.seed || {}
    let kpFunExt = opt.kpFunExt || {}
    let optServer = opt.optServer || {}

    //fd
    let fd = useTempFolder(name)

    //kpOrm
    let kpOrm = {}
    for (let v of tableNamesExec) {
        kpOrm[v] = new WOrm({
            url: `${fd}/db.json`,
            db: 'servhapi',
            cl: v,
        })
    }

    //seed, 先寫入初始資料
    for (let k in seed) {
        await kpOrm[k].save(seed[k])
    }

    //operOrm, 記錄每次呼叫以驗證授權是否擋在operOrm之前
    let callsOperOrm = []
    let operOrm = async (userId, tableName, methodName, input) => {
        callsOperOrm.push({ userId, tableName, methodName })
        return await kpOrm[tableName][methodName](input)
    }

    //authorizeExec, 記錄每次呼叫; 未給時全部放行
    let callsAuthorize = []
    let authorizeExec = async (arg) => {
        callsAuthorize.push(arg)
        if (typeof opt.authorizeExec === 'function') {
            return await opt.authorizeExec(arg)
        }
        return true
    }

    //genTag, 給予決定性時間戳, 使斷言不依賴隨機值
    let ntg = 0
    let genTag = () => {
        ntg += 1
        return `tag-${ntg}`
    }

    //errors
    let errors = []

    //WServHapiServer, 設定錯誤於建構時同步拋出, 此時先清暫存資料夾再拋
    let wsrv = null
    try {
        wsrv = new WServHapiServer({
            port,
            apis: [],
            useInert: false,
            useShowLog: false,
            pathUploadTemp: `${fd}/uploadTemp`,
            fpTableTags: `${fd}/tableTags.json`,
            getUserIdByToken: async () => {
                return 'id-for-admin'
            },
            useDbOrm: true,
            kpOrm,
            operOrm,
            authorizeExec,
            tableNamesExec,
            methodsExec: ['select', 'insert', 'save', 'del'],
            tableNamesSync,
            kpFunExt,
            genTag,
            ...optServer,
        })
    }
    catch (err) {
        removeTempFolder(fd)
        throw err
    }
    wsrv.on('error', (err) => {
        errors.push(err)
    })

    //ready, 以伺服器實際啟動結果判定就緒; 失敗時先自行清理, 再帶出原錯誤與期間之error事件
    try {
        await wsrv.ready()
    }
    catch (err) {
        await wsrv.stop()
        removeTempFolder(fd)
        throw new Error(`startServer[${name}]: ${err && err.message ? err.message : err}; errors: ${JSON.stringify(errors)}`)
    }

    //check, 須確實綁在所配發之port上
    let server = await wsrv.getServer()
    if (server.info.port !== port) {
        await wsrv.stop()
        removeTempFolder(fd)
        throw new Error(`startServer[${name}]: 實際port[${server.info.port}]與所配發之port[${port}]不符`)
    }

    //stop, 停止伺服器(含清除輪詢計時器與process監聽)後刪除暫存資料夾
    let stop = async () => {
        await wsrv.stop()
        removeTempFolder(fd)
    }

    return { wsrv, port, kpOrm, fd, errors, callsOperOrm, callsAuthorize, stop }
}


/**
 * 啟動測試用前端
 *
 * @param {Object} opt 輸入設定物件
 * @param {Integer} opt.port 輸入伺服器port整數
 * @param {Object} [opt.optClient={}] 輸入覆寫WServHapiClient設定之物件
 * @returns {Object} 回傳物件, cli為前端物件, methods為取得函數清單之promise, recvs為變更表資料陣列, errors為錯誤陣列, stop為停止輪詢函數
 */
function startClient(opt) {
    let port = opt.port
    let optClient = opt.optClient || {}

    //pmMethods, 取得函數清單即resolve
    let pmMethods = deferred()

    //recvs, errors
    let recvs = []
    let errors = []

    //WServHapiClient
    let cli = new WServHapiClient({
        url: `http://localhost:${port}`,
        useShowLog: false,
        getToken: () => {
            return 'token-for-test'
        },
        getServerMethods: (r) => {
            pmMethods.resolve(r)
        },
        recvData: (r) => {
            recvs.push(r)
        },
        ...optClient,
    })
    cli.on('error', (err) => {
        errors.push(err)
    })

    //stop, 停止w-serv-broadcast之輪詢並釋放資料同步(w-serv-webdata之前端明訂停止時呼叫clearBroadcast與clearSync)
    let stop = () => {
        for (let name of ['clearBroadcast', 'clearSync']) {
            if (typeof cli[name] === 'function') {
                cli[name]()
            }
        }
    }

    return { cli, methods: pmMethods.promise, recvs, errors, stop }
}


export {
    tempFolderOf,
    useTempFolder,
    removeTempFolder,
    waitFor,
    deferred,
    runChild,
    startServer,
    startClient
}
