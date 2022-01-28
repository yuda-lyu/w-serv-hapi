import Hapi from '@hapi/hapi'
import Inert from '@hapi/inert'
import get from 'lodash/get'
import isearr from 'wsemi/src/isearr.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import isint from 'wsemi/src/isint.mjs'
import WConverhpServer from 'w-converhp/src/WConverhpServer.mjs'
import WServWebdataServer from 'w-serv-webdata/src/WServWebdataServer.mjs'


async function WServHapiServer(opt = {}) {
    let server = null
    let wsrv = null
    let wsds = null

    //port
    let port = get(opt, 'port')
    if (!isint(port)) {
        port = 9000
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

    //apis
    let apis = get(opt, 'apis')
    if (!isearr(apis)) {
        apis = []
    }

    //cbGetUserIDFromToken
    let cbGetUserIDFromToken = get(opt, 'cbGetUserIDFromToken', null)
    // if (!isfun(cbGetUserIDFromToken)) {
    //     cbGetUserIDFromToken = async () => {
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
        let apiRoutes = [
            {
                method: 'GET',
                path: '/{file*}',
                handler: {
                    directory: {
                        path: 'dist/'
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
            ...apis,
        ]

        //route apiRoutes
        server.route(apiRoutes)

    }

    //createWConverhpServer
    let createWConverhpServer = async () => {

        //WConverhpServer
        wsrv = new WConverhpServer({
            serverHapi: server,
        })
        wsrv.on('open', function() {
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
            //     wsrv.broadcast(o, function (prog) {
            //         console.log('broadcast prog', prog)
            //     })
            // }, 1000)

        })
        wsrv.on('error', function(err) {
            if (showLog) {
                console.log(`Server[port:${port}]: error`, err)
            }
        })
        // wsrv.on('clientEnter', function(clientId, data) {
        //     console.log(`Server[port:${port}]: client enter: ${clientId}`)
        // })
        wsrv.on('clientChange', function(num) {
            if (showLog) {
                console.log(`Server[port:${port}]: now clients: ${num}`)
            }
        })
        // wsrv.on('execute', async function(func, input, pm) {
        //     //console.log(`Server[port:${port}]: execute`, func, input)

        //     //execute
        //     execute({ func, input, pm })

        // })
        // wsrv.on('broadcast', function(data) {
        //     console.log(`Server[port:${port}]: broadcast`, data)
        // })
        // wsrv.on('deliver', function(data) {
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
        wsds = WServWebdataServer({
            instWConverServer: wsrv,
            // cbGetUserIDFromToken: (token) => {
            //     return 'id-for-admin'
            // },
            cbGetUserIDFromToken,
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
        })
        wsds.on('error', (err) => {
            if (showLog) {
                console.log('error', err)
            }
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
        // if (showLog) {
        // }
    })
    process.on('uncaughtException', (err) => {
        console.log('uncaughtException', err) //強制顯示
        // if (showLog) {
        // }
    })

    return {
        server,
        wsrv,
        wsds,
    }
}


export default WServHapiServer
