import Hapi from '@hapi/hapi'
import Inert from '@hapi/inert'
import get from 'lodash-es/get.js'
import now2str from 'wsemi/src/now2str.mjs'
import genID from 'wsemi/src/genID.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import isint from 'wsemi/src/isint.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import evem from 'wsemi/src/evem.mjs'
import waitFun from 'wsemi/src/waitFun.mjs'
import WConverhpServer from 'w-converhp/src/WConverhpServer.mjs'
import WServWebdataServer from 'w-serv-webdata/src/WServWebdataServer.mjs'


/**
 * Hapi伺服器端之資料控制與同步器
 *
 * @class
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.port=8080] 輸入Hapi伺服器通訊port，預設8080
 * @param {Array} [opt.corsOrigins=['http://localhost']] 輸入允許跨域呼叫之網域陣列，給予['*']代表允許外部任意網域跨域，預設['http://localhost']
 * @param {Boolean} [opt.useInert=true] 輸入是否使用@hapi/inert取得指定資料夾下所有靜態檔案，預設true
 * @param {String} [opt.pathStaticFiles='dist'] 輸入當useInert=true時指定伺服器資料夾名稱，預設'dist'
 * @param {Array} [opt.apis=[]] 輸入Hapi伺服器設定API陣列，預設[]
 * @param {Function} [opt.verifyConn=()=>{return true}] 輸入呼叫API時檢測函數，預設()=>{return true}
 * @param {String} [opt.apiName='api'] 輸入API名稱字串，預設'api'
 * @param {Function} [opt.getUserIdByToken=async()=>''] 輸入取得使用者ID的回調函數，傳入參數為各函數的原始參數，預設async()=>''
 * @param {Boolean} [opt.useDbOrm=true] 輸入是否使用資料庫ORM技術，給予false代表不使用直接存取資料庫函數與自動同步資料庫至前端功能，預設true
 * @param {Object} [opt.kpOrm={}] 輸入各資料表的操作物件，用以提供由tableNamesSync指定資料表的change事件，使能監聽與觸發資料變更事件，key為表名而值為該表的操作器實體，操作器實體可使用例如WOrmMongodb等建立，預設{}
 * @param {Function} [opt.operOrm={}] 輸入各資料表的操作通用接口物件，用以提供操作由tableNamesExec指定資料表的例如'select'、'insert'、'save'、'del'函數。加上由extFuncs提供的函數，就為全部可由前端執行的函數，預設{}
 * @param {Array} [opt.tableNamesExec=[]] 輸入指定能被操作的表名陣列，預設[]
 * @param {Array} [opt.methodsExec=['select','insert','save','del']] 輸入指定綁定操作器的方式陣列，可選'select'、'insert'、'save'、'del'、'delAll'，預設['select', 'insert', 'save', 'del']
 * @param {Array} [opt.tableNamesSync=[]] 輸入指定能被同步的表名陣列，預設[]
 * @param {Object} [opt.kpFunExt=null] 輸入額外擴充執行函數物件，key為函數名而值為函數，預設null
 * @param {String} [opt.fpTableTags='tableTags.json'] 輸入儲存各資料表時間戳檔案路徑串，預設'./tableTags.json'
 * @param {Function} [opt.genTag=()=>'{random string}'] 輸入產生不重複識別碼函數，預設()=>'{random string}'
 * @param {Boolean} [opt.showLog=true] 輸入是否使用console.log顯示基本資訊布林值，預設true
 * @returns {Object} 回傳事件物件，提供getServer函數回傳hapi伺服器實體，提供getInstWConverServer回傳擴展功能實體，可監聽error事件
 * @example
 *
 * import fs from 'fs'
 * import _ from 'lodash-es'
 * // import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs' //自行選擇引用ORM
 * import WOrm from 'w-orm-lowdb/src/WOrmLowdb.mjs' //自行選擇引用ORM
 * import WServHapiServer from './src/WServHapiServer.mjs'
 *
 * async function run() {
 *
 *     //預先刪除w-orm-lowdb資料庫
 *     try {
 *         fs.unlinkSync('./db.json')
 *     }
 *     catch (err) {}
 *
 *     //optWOrm
 *     let optWOrm = {
 *         // url: 'mongodb://username:password@127.0.0.1:27017',
 *         // db: 'servhapi',
 *         url: './db.json',
 *         db: 'servhapi',
 *         cl: '',
 *     }
 *
 *     //tableNamesExec, tableNamesSync
 *     let tableNamesExec = ['tabA', 'tabB']
 *     let tableNamesSync = ['tabA']
 *
 *     //kpOrm
 *     let kpOrm = {}
 *     for (let k in tableNamesExec) {
 *         let v = tableNamesExec[k]
 *         let opt = { ...optWOrm, cl: v }
 *         let wo = new WOrm(opt)
 *         kpOrm[v] = wo
 *     }
 *
 *     async function saveData(cl, r) {
 *
 *         //w
 *         let w = kpOrm[cl] //一定要由woItems操作, 否則傳woItems進去WServHapiServer會無法收到change事件
 *
 *         //save
 *         await w.save(r) //autoInsert: false
 *             .then(function(msg) {
 *                 console.log('save then', cl, msg)
 *             })
 *             .catch(function(msg) {
 *                 console.log('save catch', cl, msg)
 *             })
 *
 *     }
 *
 *     let r
 *     r = [
 *         {
 *             id: 'id-tabA-peter',
 *             name: 'peter',
 *             value: 123,
 *         },
 *         {
 *             id: 'id-tabA-rosemary',
 *             name: 'rosemary',
 *             value: 123.456,
 *         },
 *         {
 *             id: 'id-tabA-kettle',
 *             name: 'kettle',
 *             value: 456,
 *         },
 *     ]
 *     await saveData('tabA', r)
 *     r = [
 *         {
 *             id: 'id-tabB-peter',
 *             name: 'peter',
 *             value: 123,
 *         },
 *         {
 *             id: 'id-tabB-rosemary',
 *             name: 'rosemary',
 *             value: 123.456,
 *         },
 *     ]
 *     await saveData('tabB', r)
 *
 *     let ntv = 0
 *     let genValue = () => {
 *         ntv++
 *         return `value-${ntv}`
 *     }
 *
 *     let n = 0
 *     let tn = setInterval(() => {
 *         n++
 *         console.log('update tabA', n)
 *         r = {
 *             id: 'id-tabA-peter',
 *             name: 'peter',
 *             value: genValue(),
 *         }
 *         saveData('tabA', r)
 *         if (n >= 5) {
 *             clearInterval(tn)
 *         }
 *     }, 3000)
 *
 *     let procCommon = async (userId, tableName, methodName, input) => {
 *         // console.log('procCommon call', tableName, methodName, input)
 *         let r = await kpOrm[tableName][methodName](input)
 *         // console.log('procCommon result', r)
 *         return r
 *     }
 *
 *     let uploadFile = async (userId, { name, u8a }) => {
 *         console.log('uploadFile', userId, name, _.size(u8a))
 *         // fs.writeFileSync(name, Buffer.from(u8a))
 *         console.log('uploadFile writeFileSync finish')
 *         return 'finish'
 *     }
 *
 *     let add = async (userId, { pa, pb }) => {
 *         // console.log('add', userId, pa, pb)
 *         return `result: pa+pb=${pa + pb}`
 *     }
 *
 *     let ntg = 0
 *     let genTag = () => {
 *         ntg++
 *         return `tag-${ntg}`
 *     }
 *
 *     //WServHapiServer
 *     let wsrv = new WServHapiServer({
 *         port: 8080,
 *         apis: [],
 *         verifyConn: ({ apiType, authorization, headers, query }) => {
 *             console.log('verifyConn', `apiType[${apiType}]`, `authorization[${authorization}]`)
 *             return true
 *         },
 *         getUserIdByToken: async (token) => { //可使用async或sync函數
 *             return 'id-for-admin'
 *         },
 *         useDbOrm: true,
 *         kpOrm,
 *         operOrm: procCommon, //procCommon的輸入為: userId, tableName, methodName, input
 *         tableNamesExec,
 *         methodsExec: ['select', 'insert', 'save', 'del'],
 *         tableNamesSync,
 *         kpFunExt: { //接收參數第1個為userId, 之後才是前端給予參數
 *             uploadFile,
 *             add,
 *             //...
 *         },
 *         // fnTableTags: 'tableTags-serv-hapi.json',
 *         genTag,
 *     })
 *
 *     wsrv.on('error', (err) => {
 *         console.log(err)
 *     })
 *
 * }
 * run()
 *
 * // save then tabA [
 * //   { n: 1, nInserted: 1, ok: 1 },
 * //   { n: 1, nInserted: 1, ok: 1 },
 * //   { n: 1, nInserted: 1, ok: 1 }
 * // ]
 * // save then tabB [ { n: 1, nInserted: 1, ok: 1 }, { n: 1, nInserted: 1, ok: 1 } ]
 * // Server running at: http://DESKTOP-6R7USAO:8080
 * // Server[port:8080]: now clients: 1
 * // uploadFile id-for-admin zdata.b1 3
 * // uploadFile writeFileSync finish
 * // update tabA 1
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 * // update tabA 2
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 * // update tabA 3
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 * // update tabA 4
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 * // update tabA 5
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 *
 */
function WServHapiServer(opt = {}) {
    let ev = evem()
    let server = null
    let instWConverServer = null

    //port
    let port = get(opt, 'port')
    if (!isint(port)) {
        port = 8080
    }

    //corsOrigins
    let corsOrigins = get(opt, 'corsOrigins', [])
    if (!isearr(corsOrigins)) {
        corsOrigins = ['http://localhost'] //['*']
    }

    //useInert
    let useInert = get(opt, 'useInert')
    if (!isbol(useInert)) {
        useInert = true
    }

    //pathStaticFiles
    let pathStaticFiles = get(opt, 'pathStaticFiles')
    if (!isestr(pathStaticFiles)) {
        pathStaticFiles = 'dist'
    }

    //apis
    let apis = get(opt, 'apis')
    if (!isearr(apis)) {
        apis = []
    }

    //verifyConn
    let verifyConn = get(opt, 'verifyConn')
    if (!isfun(verifyConn)) {
        verifyConn = () => {
            return true
        }
    }

    //apiName
    let apiName = get(opt, 'apiName')
    if (!isestr(apiName)) {
        apiName = 'api'
    }

    //getUserIdByToken
    let getUserIdByToken = get(opt, 'getUserIdByToken', null)
    // if (!isfun(getUserIdByToken)) {
    //     getUserIdByToken = async () => {
    //         return ''
    //     }
    // }

    //useDbOrm
    let useDbOrm = get(opt, 'useDbOrm', null)
    if (!isbol(useDbOrm)) {
        useDbOrm = true
    }

    //kpOrm, 輸入外部ORM實體, 常用變數名: kpOrm
    let kpOrm = get(opt, 'kpOrm', null)
    // if (!isobj(kpOrm)) {
    //     ev.emit('error', 'invalid opt.kpOrm')
    //     return ev
    // }

    //operOrm, ORM的泛用接口, 常用變數名: procCommon
    let operOrm = get(opt, 'operOrm', null)
    // if (!isfun(operOrm)) {
    //     ev.emit('error', 'invalid opt.operOrm')
    //     return ev
    // }

    //tableNamesExec, 指定能被呼叫的表名, 各表名需隸屬於ORM, 才能被ORM的泛用接口procCommon處理
    let tableNamesExec = get(opt, 'tableNamesExec', null)
    // if (!isarr(tableNamesExec)) {
    //     ev.emit('error', 'invalid opt.tableNamesExec')
    //     return ev
    // }

    //methodsExec
    let methodsExec = get(opt, 'methodsExec', null)
    // if (!isarr(methodsExec)) {
    //     methodsExec = ['select', 'insert', 'save', 'del']
    // }

    //tableNamesSync, 指定需同步表名, 機敏資訊表記得過濾, 各表名需隸屬於ORM, 才能監聽其change事件
    let tableNamesSync = get(opt, 'tableNamesSync', null)
    // if (!isarr(tableNamesSync)) {
    //     ev.emit('error', 'invalid opt.tableNamesSync')
    //     return ev
    // }

    //kpFunExt
    let kpFunExt = get(opt, 'kpFunExt', null)

    //fnTableTags
    let fnTableTags = get(opt, 'fnTableTags', null)

    //genTag
    let genTag = get(opt, 'genTag')
    if (!isfun(genTag)) {
        genTag = () => {
            return now2str() + '|' + genID(6)
        }
    }

    //showLog
    let showLog = get(opt, 'showLog')
    if (!isbol(showLog)) {
        showLog = true
    }

    //createHapiServer
    let createHapiServer = async () => {

        //Hapi.Server
        server = new Hapi.Server({
            port,
            routes: {
                timeout: {
                    server: false, //關閉伺服器超時
                    socket: false, //關閉socket超時
                },
                cors: {
                    origin: corsOrigins, //Access-Control-Allow-Origin
                    credentials: false, //Access-Control-Allow-Credentials
                },
            },
        })

        //useInert
        if (useInert) {

            //register inert
            await server.register(Inert)

        }

        //apiRoutes
        let apiRoutes = []
        if (useInert) {
            apiRoutes = [
                {
                    method: 'GET',
                    path: '/{file*}',
                    handler: {
                        directory: {
                            path: `${pathStaticFiles}/`
                        }
                    },
                },
                // {
                //     method: 'GET',
                //     path: '/api/someAPI',
                //     handler: async function (req, res) {

                //         // //token
                //         // let token = _.get(req, 'query.token', '')

                //         return 'someAPI'
                //     },
                // },
            ]
        }
        apiRoutes = [
            ...apiRoutes,
            ...apis,
        ]

        //route apiRoutes
        server.route(apiRoutes)

    }

    //createWConverhpServer
    let createWConverhpServer = async () => {

        //WConverhpServer
        instWConverServer = new WConverhpServer({
            serverHapi: server,
            verifyConn,
            apiName,
        })
        instWConverServer.on('open', function() {
            if (showLog) {
                console.log(`Server[port:${port}]: open`)
            }

            // //broadcast
            // let n = 0
            // setInterval(() => {
            //     n += 1
            //     let o = {
            //         text: `server broadcast hi(${n})`,
            //         data: new Uint8Array([66, 97, 115]), //support Uint8Array data
            //     }
            //     instWConverServer.broadcast(o, function (prog) {
            //         console.log('broadcast prog', prog)
            //     })
            // }, 1000)

        })
        // instWConverServer.on('clientEnter', function(clientId, data) {
        //     console.log(`Server[port:${port}]: client enter: ${clientId}`)
        // })
        instWConverServer.on('clientChange', function(num) {
            if (showLog) {
                console.log(`Server[port:${port}]: now clients: ${num}`)
            }
        })
        // instWConverServer.on('execute', async function(func, input, pm) {
        //     //console.log(`Server[port:${port}]: execute`, func, input)
        //     execute({ func, input, pm })
        // })
        // instWConverServer.on('broadcast', function(data) {
        //     console.log(`Server[port:${port}]: broadcast`, data)
        // })

    }

    //createWServWebdataServer
    let createWServWebdataServer = async () => {

        // //tableNamesExec, tableNamesSync
        // let tableNamesExec = keys(ds)
        // let tableNamesSync = filter(tableNamesExec, (v) => {
        //     return strright(v, 5) !== 'Items'//不同步數據
        // })

        //WServWebdataServer
        instWConverServer = new WServWebdataServer(
            instWConverServer,
            {

                getUserIdByToken,
                // getUserIdByToken: (token) => {
                //     return 'id-for-admin'
                // },

                useDbOrm,
                kpOrm,
                operOrm, //funORMProc的輸入為: userId, tableName, methodName, input
                // operOrm: procCommon, //funORMProc的輸入為: userId, tableName, methodName, input

                tableNamesExec,
                tableNamesSync,

                methodsExec, //methodsExec可提供select, insert, save, del, mix, mix需於procCommon內註冊以提供
                // methodsExec: ['select', 'insert', 'save', 'del', 'mix'], //mix需於procCommon內註冊以提供

                kpFunExt, //註冊擴充函數
                // kpFunExt: {
                //     getUserById,
                //     // downloadAnalysisResultByKey,
                // },

                fnTableTags,
                genTag,

            })

        //共用instWConverServer, 故最後再監聽error與用ev.emit至外部
        instWConverServer.on('error', (err) => {
            ev.emit('error', err)
        })

    }

    //create
    let create = async () => {

        //createHapiServer
        await createHapiServer()

        //createWConverhpServer
        await createWConverhpServer()

        //createWServWebdataServer
        await createWServWebdataServer()

        //start
        await server.start()
        if (showLog) {
            console.log(`Server running at: ${server.info.uri}`)
        }

    }
    create()
        .catch((err) => {
            ev.emit('error', err) //用ev.emit至外部
        })

    //攔截非預期錯誤
    process.on('unhandledRejection', (err) => {
        console.log('unhandledRejection', err) //強制顯示
        ev.emit('error', { mode: 'unhandledRejection', err }) //用ev.emit至外部
    })
    process.on('uncaughtException', (err) => {
        console.log('uncaughtException', err) //強制顯示
        ev.emit('error', { mode: 'uncaughtException', err }) //用ev.emit至外部
    })

    //getServer
    let getServer = async () => {
        await waitFun(() => {
            return server !== null
        })
        return server
    }

    //getInstWConverServer
    let getInstWConverServer = async () => {
        await waitFun(() => {
            return instWConverServer !== null
        })
        return instWConverServer
    }

    //save
    ev.getServer = getServer
    ev.getInstWConverServer = getInstWConverServer

    return ev
}


export default WServHapiServer
