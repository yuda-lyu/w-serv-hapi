import Hapi from '@hapi/hapi'
import Inert from '@hapi/inert'
import get from 'lodash-es/get.js'
import isearr from 'wsemi/src/isearr.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import isint from 'wsemi/src/isint.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import evem from 'wsemi/src/evem.mjs'
import WConverhpServer from 'w-converhp/src/WConverhpServer.mjs'
import WServWebdataServer from 'w-serv-webdata/src/WServWebdataServer.mjs'


/**
 * Hapi伺服器端之資料控制與同步器
 *
 * @class
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.port=8080] 輸入Hapi伺服器通訊port，預設8080
 * @param {Boolean} [opt.useCors=true] 輸入是否API可跨域呼叫，預設true
 * @param {Boolean} [opt.useInert=true] 輸入是否使用@hapi/inert取得指定資料夾下所有靜態檔案，預設true
 * @param {String} [opt.pathStaticFiles='dist'] 輸入當useInert=true時指定伺服器資料夾名稱，預設'dist'
 * @param {Array} [opt.apis=[]] 輸入Hapi伺服器設定API陣列，預設[]
 * @param {Function} [opt.getUserIDFromToken=async ()=>''] 輸入取得使用者ID的回調函數，傳入參數為各函數的原始參數，預設async ()=>''
 * @param {Boolean} [opt.useDbORM=true] 輸入是否使用資料庫ORM技術，給予false代表不使用直接存取資料庫函數與自動同步資料庫至前端功能，預設true
 * @param {Object} [opt.dbORMs={}] 輸入各資料表的操作物件，用以提供由tableNamesSync指定資料表的change事件，使能監聽與觸發資料變更事件，key為表名而值為該表的操作器實體，操作器實體可使用例如WOrmMongodb等建立，預設{}
 * @param {Function} [opt.operORM={}] 輸入各資料表的操作通用接口物件，用以提供操作由tableNamesExec指定資料表的例如'select'、'insert'、'save'、'del'函數。加上由extFuncs提供的函數，就為全部可由前端執行的函數，預設{}
 * @param {Array} [opt.tableNamesExec=[]] 輸入指定能被操作的表名陣列，預設[]
 * @param {Array} [opt.methodsExec=['select','insert','save','del']] 輸入指定綁定操作器的方式陣列，可選'select'、'insert'、'save'、'del'、'delAll'，預設['select', 'insert', 'save', 'del']
 * @param {Array} [opt.tableNamesSync=[]] 輸入指定能被同步的表名陣列，預設[]
 * @param {Object} [opt.extFuncs=null] 輸入額外擴充執行函數物件，key為函數名而值為函數，預設null
 * @param {Function} [opt.hookBefores=null] 輸入執行函數的前攔截函數，預設null
 * @param {Function} [opt.hookAfters=null] 輸入執行函數的後攔截函數，預設null
 * @param {Boolean} [opt.showLog=true] 輸入是否使用console.log顯示基本資訊布林值，預設true
 * @returns {Object} 回傳物件，其內server為hapi伺服器實體，wsrv為w-converhp的伺服器事件物件，wsds為w-serv-webdata的伺服器事件物件，可監聽error事件
 * @example
 *
 * import fs from 'fs'
 * import _ from 'lodash-es'
 * import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs'
 * import WServHapiServer from './src/WServHapiServer.mjs'
 *
 *
 * async function run() {
 *
 *     //optWOrm
 *     let optWOrm = {
 *         url: 'mongodb://username:password@127.0.0.1:27017',
 *         db: 'servhapi',
 *         cl: '',
 *     }
 *
 *     //tableNamesExec, tableNamesSync
 *     let tableNamesExec = ['tabA', 'tabB']
 *     let tableNamesSync = ['tabA']
 *
 *     //woItems
 *     let woItems = {}
 *     for (let k in tableNamesExec) {
 *         let v = tableNamesExec[k]
 *         let opt = { ...optWOrm, cl: v }
 *         let wo = new WOrm(opt)
 *         woItems[v] = wo
 *     }
 *
 *     async function saveData(cl, r) {
 *
 *         //w
 *         let w = woItems[cl] //一定要由woItems操作, 否則傳woItems進去WServHapiServer會無法收到change事件
 *
 *         //save
 *         await w.save(r, { atomic: true }) //autoInsert: false
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
 *     let n = 0
 *     let tn = setInterval(() => {
 *         n++
 *         console.log('update tabA', n)
 *         r = {
 *             id: 'id-tabA-peter',
 *             name: 'peter',
 *             value: Math.random(),
 *         }
 *         saveData('tabA', r)
 *         if (n >= 5) {
 *             clearInterval(tn)
 *         }
 *     }, 3000)
 *
 *     let procCommon = async (userId, tableName, methodName, input) => {
 *         // console.log('procCommon call', tableName, methodName, input)
 *         let r = await woItems[tableName][methodName](input)
 *         // console.log('procCommon result', r)
 *         return r
 *     }
 *
 *     let uploadFile = async (userId, { name, u8a }) => {
 *         console.log('uploadFile', userId, name, _.size(u8a))
 *         fs.writeFileSync(name, Buffer.from(u8a))
 *         console.log('uploadFile writeFileSync finish')
 *         return 'finish'
 *     }
 *
 *     //WServHapiServer
 *     let instWServHapiServer = new WServHapiServer({
 *         port: 8080,
 *         apis: [],
 *         getUserIDFromToken: async (token) => { //可使用async或sync函數
 *             return 'id-for-admin'
 *         },
 *         useDbORM: true,
 *         dbORMs: woItems,
 *         operORM: procCommon, //procCommon的輸入為: userId, tableName, methodName, input
 *         tableNamesExec,
 *         methodsExec: ['select', 'insert', 'save', 'del'],
 *         tableNamesSync,
 *         extFuncs: { //接收參數第1個為userId, 之後才是前端給予參數
 *             uploadFile,
 *             // getUserFromID,
 *             // downloadFileFromID,
 *             // saveTableAndData,
 *             //...
 *         },
 *         hookBefores: null,
 *         hookAfters: null,
 *         // fnTableTags: 'tableTags-serv-hapi.json',
 *     })
 *
 *     instWServHapiServer.on('error', (err) => {
 *         console.log(err)
 *     })
 *
 * }
 * run()
 *
 * // save then tabA [
 * //     { n: 1, nModified: 1, ok: 1 },
 * //     { n: 1, nModified: 1, ok: 1 },
 * //     { n: 1, nModified: 1, ok: 1 }
 * // ]
 * // save then tabB [ { n: 1, nModified: 1, ok: 1 }, { n: 1, nModified: 1, ok: 1 } ]
 * // Server running at: http://localhost:8080
 * // Server[port:8080]: open
 * // update tabA
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 * // repeat...
 *
 */
function WServHapiServer(opt = {}) {
    let server = null
    let instWConverhpServer = null
    let instWServWebdataServer = null

    //ev
    let ev = evem()

    //port
    let port = get(opt, 'port')
    if (!isint(port)) {
        port = 8080
    }

    //useCors
    let useCors = get(opt, 'useCors')
    if (!isbol(useCors)) {
        useCors = true
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

    //getUserIDFromToken
    let getUserIDFromToken = get(opt, 'getUserIDFromToken', null)
    // if (!isfun(getUserIDFromToken)) {
    //     getUserIDFromToken = async () => {
    //         return ''
    //     }
    // }

    //useDbORM
    let useDbORM = get(opt, 'useDbORM', null)
    if (!isbol(useDbORM)) {
        useDbORM = true
    }

    //dbORMs, 輸入外部ORM實體, 常用變數名: woItems
    let dbORMs = get(opt, 'dbORMs', null)
    // if (!isobj(dbORMs)) {
    //     ev.emit('error', 'invalid opt.dbORMs')
    //     return ev
    // }

    //operORM, ORM的泛用接口, 常用變數名: procCommon
    let operORM = get(opt, 'operORM', null)
    // if (!isfun(operORM)) {
    //     ev.emit('error', 'invalid opt.operORM')
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

    //extFuncs
    let extFuncs = get(opt, 'extFuncs', null)

    //hookBefores
    let hookBefores = get(opt, 'hookBefores', null)

    //hookAfters
    let hookAfters = get(opt, 'hookAfters', null)

    //fnTableTags
    let fnTableTags = get(opt, 'fnTableTags', null)

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
                cors: useCors
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
        instWConverhpServer = new WConverhpServer({
            serverHapi: server,
        })
        instWConverhpServer.on('open', function() {
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
            //     instWConverhpServer.broadcast(o, function (prog) {
            //         console.log('broadcast prog', prog)
            //     })
            // }, 1000)

        })
        instWConverhpServer.on('error', function(err) {
            if (showLog) {
                console.log(`Server[port:${port}]: error`, err)
            }
            ev.emit('error', {
                mode: 'instWConverhpServer error',
                err
            })
        })
        // instWConverhpServer.on('clientEnter', function(clientId, data) {
        //     console.log(`Server[port:${port}]: client enter: ${clientId}`)
        // })
        instWConverhpServer.on('clientChange', function(num) {
            if (showLog) {
                console.log(`Server[port:${port}]: now clients: ${num}`)
            }
        })
        // instWConverhpServer.on('execute', async function(func, input, pm) {
        //     //console.log(`Server[port:${port}]: execute`, func, input)

        //     //execute
        //     execute({ func, input, pm })

        // })
        // instWConverhpServer.on('broadcast', function(data) {
        //     console.log(`Server[port:${port}]: broadcast`, data)
        // })
        // instWConverhpServer.on('deliver', function(data) {
        //     console.log(`Server[port:${port}]: deliver`, data)
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
        instWServWebdataServer = new WServWebdataServer({
            instWConverServer: instWConverhpServer,
            // cbGetUserIDFromToken: (token) => {
            //     return 'id-for-admin'
            // },
            cbGetUserIDFromToken: getUserIDFromToken,
            // useDbORM: true,
            useDbORM,
            // dbORMs: woItems,
            dbORMs,
            // operORM: procCommon, //funORMProc的輸入為: userId, tableName, methodName, input
            operORM, //funORMProc的輸入為: userId, tableName, methodName, input
            // tableNamesExec,
            tableNamesExec,
            // tableNamesSync,
            tableNamesSync,
            // methodsExec: ['select', 'insert', 'save', 'del', 'mix'], //mix需於procCommon內註冊以提供
            methodsExec, //methodsExec可提供select, insert, save, del, mix, mix需於procCommon內註冊以提供
            // extFuncs: {
            //     getUserById,
            //     // downloadAnalysisResultByKey,
            // },
            extFuncs, //註冊擴充函數
            // hookBefores: null,
            hookBefores,
            // hookAfters: null,
            hookAfters,
            // fnTableTags: 'tableTags.json',
            fnTableTags,
        })
        instWServWebdataServer.on('error', (err) => {
            if (showLog) {
                console.log('error', err)
            }
            ev.emit('error', {
                mode: 'instWServWebdataServer error',
                err
            })
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

    //攔截非預期錯誤
    process.on('unhandledRejection', (err) => {
        console.log('unhandledRejection', err) //強制顯示
        ev.emit('error', {
            mode: 'unhandledRejection',
            err
        })
    })
    process.on('uncaughtException', (err) => {
        console.log('uncaughtException', err) //強制顯示
        ev.emit('error', {
            mode: 'uncaughtException',
            err
        })
    })

    //save
    ev.getServer = () => {
        return server
    }
    ev.getInstWConverhpServer = () => {
        return instWConverhpServer
    }
    ev.getInstWServWebdataServer = () => {
        return instWServWebdataServer
    }

    return ev
}


export default WServHapiServer
