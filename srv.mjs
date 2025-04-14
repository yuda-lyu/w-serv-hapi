import fs from 'fs'
import _ from 'lodash-es'
// import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs' //自行選擇引用ORM
import WOrm from 'w-orm-lowdb/src/WOrmLowdb.mjs' //自行選擇引用ORM
import WServHapiServer from './src/WServHapiServer.mjs'


async function run() {

    //預先刪除w-orm-lowdb資料庫
    try {
        fs.unlinkSync('./db.json')
    }
    catch (err) {}

    //optWOrm
    let optWOrm = {
        // url: 'mongodb://username:password@127.0.0.1:27017',
        // db: 'servhapi',
        url: './db.json',
        db: 'servhapi',
        cl: '',
    }

    //tableNamesExec, tableNamesSync
    let tableNamesExec = ['tabA', 'tabB']
    let tableNamesSync = ['tabA']

    //kpOrm
    let kpOrm = {}
    for (let k in tableNamesExec) {
        let v = tableNamesExec[k]
        let opt = { ...optWOrm, cl: v }
        let wo = new WOrm(opt)
        kpOrm[v] = wo
    }

    async function saveData(cl, r) {

        //w
        let w = kpOrm[cl] //一定要由woItems操作, 否則傳woItems進去WServHapiServer會無法收到change事件

        //save
        await w.save(r) //autoInsert: false
            .then(function(msg) {
                console.log('save then', cl, msg)
            })
            .catch(function(msg) {
                console.log('save catch', cl, msg)
            })

    }

    let r
    r = [
        {
            id: 'id-tabA-peter',
            name: 'peter',
            value: 123,
        },
        {
            id: 'id-tabA-rosemary',
            name: 'rosemary',
            value: 123.456,
        },
        {
            id: 'id-tabA-kettle',
            name: 'kettle',
            value: 456,
        },
    ]
    await saveData('tabA', r)
    r = [
        {
            id: 'id-tabB-peter',
            name: 'peter',
            value: 123,
        },
        {
            id: 'id-tabB-rosemary',
            name: 'rosemary',
            value: 123.456,
        },
    ]
    await saveData('tabB', r)

    let ntv = 0
    let genValue = () => {
        ntv++
        return `value-${ntv}`
    }

    let n = 0
    let tn = setInterval(() => {
        n++
        console.log('update tabA', n)
        r = {
            id: 'id-tabA-peter',
            name: 'peter',
            value: genValue(),
        }
        saveData('tabA', r)
        if (n >= 5) {
            clearInterval(tn)
        }
    }, 3000)

    let procCommon = async (userId, tableName, methodName, input) => {
        // console.log('procCommon call', tableName, methodName, input)
        let r = await kpOrm[tableName][methodName](input)
        // console.log('procCommon result', r)
        return r
    }

    let uploadFile = async (userId, { name, u8a }) => {
        console.log('uploadFile', userId, name, _.size(u8a))
        // fs.writeFileSync(name, Buffer.from(u8a))
        console.log('uploadFile writeFileSync finish')
        return 'finish'
    }

    let add = async (userId, { pa, pb }) => {
        // console.log('add', userId, pa, pb)
        return `result: pa+pb=${pa + pb}`
    }

    let ntg = 0
    let genTag = () => {
        ntg++
        return `tag-${ntg}`
    }

    //WServHapiServer
    let wsrv = new WServHapiServer({
        port: 8080,
        // apiName: '_api',
        apis: [],
        // pathStaticFiles: './',
        verifyConn: ({ apiType, authorization, headers, query }) => {
            console.log('verifyConn', `apiType[${apiType}]`, `authorization[${authorization}]`)
            return true
        },
        getUserIdByToken: async (token) => { //可使用async或sync函數
            return 'id-for-admin'
        },
        useDbOrm: true,
        kpOrm,
        operOrm: procCommon, //procCommon的輸入為: userId, tableName, methodName, input
        tableNamesExec,
        methodsExec: ['select', 'insert', 'save', 'del'],
        tableNamesSync,
        kpFunExt: { //接收參數第1個為userId, 之後才是前端給予參數
            uploadFile,
            add,
            //...
        },
        // fnTableTags: 'tableTags-serv-hapi.json',
        genTag,
    })

    wsrv.on('error', (err) => {
        console.log(err)
    })

}
run()

// save then tabA [
//   { n: 1, nInserted: 1, ok: 1 },
//   { n: 1, nInserted: 1, ok: 1 },
//   { n: 1, nInserted: 1, ok: 1 }
// ]
// save then tabB [ { n: 1, nInserted: 1, ok: 1 }, { n: 1, nInserted: 1, ok: 1 } ]
// Server running at: http://DESKTOP-6R7USAO:8080
// Server[port:8080]: now clients: 1
// uploadFile id-for-admin zdata.b1 3
// uploadFile writeFileSync finish
// update tabA 1
// save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
// update tabA 2
// save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
// update tabA 3
// save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
// update tabA 4
// save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
// update tabA 5
// save then tabA [ { n: 1, nModified: 1, ok: 1 } ]


//node srv.mjs
