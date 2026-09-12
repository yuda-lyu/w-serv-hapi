import fs from 'fs'
import WOrm from 'w-orm-lowdb/src/WOrmLowdb.mjs'
import WServHapiServer from '../src/WServHapiServer.mjs'
import WServHapiClient from '../src/WServHapiClient.mjs'


/**
 * api層測試之共用層
 *
 * 各測試檔以不同port與不同暫存資料夾隔離, 故可各自獨立執行
 * 本檔不帶.test.中綴, 避免被runner當測試檔抓取
 */


/**
 * 建立測試專用暫存資料夾, 使測試產物(db、tableTags、uploadTemp)不落入專案根目錄
 *
 * @param {String} name 輸入測試名稱字串
 * @returns {String} 回傳資料夾路徑字串
 */
function useTempFolder(name) {
    let fd = `./tmp/test-${name}`
    fs.rmSync(fd, { recursive: true, force: true })
    fs.mkdirSync(fd, { recursive: true })
    return fd
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
    let promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}


/**
 * 啟動測試用伺服器
 *
 * @param {Object} opt 輸入設定物件
 * @param {String} opt.name 輸入測試名稱字串, 供暫存資料夾命名
 * @param {Integer} opt.port 輸入伺服器port整數
 * @param {Array} [opt.tableNamesExec=['tabA','tabB']] 輸入可操作表名陣列
 * @param {Array} [opt.tableNamesSync=['tabA']] 輸入可同步表名陣列
 * @param {Object} [opt.seed={}] 輸入各表初始資料物件, key為表名而值為資料陣列
 * @param {Object} [opt.kpFunExt={}] 輸入擴充函數物件
 * @param {Object} [opt.optServer={}] 輸入覆寫WServHapiServer設定之物件
 * @returns {Promise} 回傳Promise, resolve為物件, 內含wsrv、kpOrm、fd、errors、stop
 */
async function startServer(opt) {
    let name = opt.name
    let port = opt.port
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

    //operOrm
    let operOrm = async (userId, tableName, methodName, input) => {
        return await kpOrm[tableName][methodName](input)
    }

    //genTag, 給予決定性時間戳, 使斷言不依賴隨機值
    let ntg = 0
    let genTag = () => {
        ntg += 1
        return `tag-${ntg}`
    }

    //errors
    let errors = []

    //WServHapiServer
    let wsrv = new WServHapiServer({
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
        tableNamesExec,
        methodsExec: ['select', 'insert', 'save', 'del'],
        tableNamesSync,
        kpFunExt,
        genTag,
        ...optServer,
    })
    wsrv.on('error', (err) => {
        errors.push(err)
    })

    //server, 須等hapi真的start才算就緒
    let server = await wsrv.getServer()
    await waitFor(() => {
        return server.info.started > 0
    }, { msg: `server[port:${port}] start timeout` })

    //stop
    let stop = async () => {
        await server.stop()
    }

    return { wsrv, kpOrm, fd, errors, stop }
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

    //stop, 停止w-serv-broadcast之輪詢
    let stop = () => {
        if (typeof cli.clearBroadcast === 'function') {
            cli.clearBroadcast()
        }
    }

    return { cli, methods: pmMethods.promise, recvs, errors, stop }
}


export {
    useTempFolder,
    waitFor,
    deferred,
    startServer,
    startClient,
}
