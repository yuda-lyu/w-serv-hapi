# w-serv-hapi
A wrapper hapi for data control and synchronization between nodejs and browser.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-serv-hapi.svg?style=flat)](https://npmjs.org/package/w-serv-hapi) 
[![license](https://img.shields.io/npm/l/w-serv-hapi.svg?style=flat)](https://npmjs.org/package/w-serv-hapi) 
[![npm download](https://img.shields.io/npm/dt/w-serv-hapi.svg)](https://npmjs.org/package/w-serv-hapi) 
[![npm download](https://img.shields.io/npm/dm/w-serv-hapi.svg)](https://npmjs.org/package/w-serv-hapi) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-serv-hapi.svg)](https://www.jsdelivr.com/package/npm/w-serv-hapi)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-serv-hapi/WServHapiServer.html).

## Parts
`w-serv-hapi` includes 2 parts: 
* `w-serv-hapi-server`: for nodejs server
* `w-serv-hapi-client`: for nodejs and browser client

## Installation
### Using npm(ES6 module):
```alias
npm i w-serv-hapi
```

#### Example for w-serv-hapi-server:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-serv-hapi/blob/master/srv.mjs)]
```alias
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
        apis: [],
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
```

#### Example for w-serv-hapi-client:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-serv-hapi/blob/master/scl.mjs)]
```alias
// import fs from 'fs'
import FormData from 'form-data'
import WServHapiClient from './src/WServHapiClient.mjs'

async function client() {

    //WServHapiClient
    let instWServHapiClient = new WServHapiClient({
        FormData,
        url: 'http://localhost:8080',
        useWaitToken: false,
        getToken: () => {
            return 'token-for-test' //Vue.prototype.$store.state.userToken
        },
        getServerMethods: (r) => {
            console.log('getServerMethods', r)
            //Vue.prototype.$fapi = r

            //select tabA
            r.tabA.select(({ prog, p, m }) => {
                console.log('select tabA', prog, p, m)
            })
                .then((res) => {
                    console.log('r.tabA.select then', res)
                })
                .catch((err) => {
                    console.log('r.tabA.select catch', err)
                })

            //select tabB
            r.tabB.select(({ prog, p, m }) => {
                console.log('select tabB', prog, p, m)
            })
                .then((res) => {
                    console.log('r.tabB.select then', res)
                })
                .catch((err) => {
                    console.log('r.tabB.select catch', err)
                })

            //uploadFile
            r.uploadFile({
                name: 'zdata.b1',
                u8a: new Uint8Array([66, 97, 115]),
            }, ({ prog, p, m }) => {
                console.log('uploadFile', prog, p, m)
            })

            //add
            r.add({
                pa: 1,
                pb: 2.5,
            }, ({ prog, p, m }) => {
                console.log('add', prog, p, m)
            })
                .then((res) => {
                    console.log('add then', res)
                })
                .catch((err) => {
                    console.log('add catch', err)
                })

        },
        recvData: (r) => {
            console.log('recvData', r)
            //Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateTableData, r)
        },
        getRefreshState: (r) => {
            console.log('getRefreshState', 'needToRefresh', r.needToRefresh)
        },
        getRefreshTable: (r) => {
            console.log('getRefreshTable', 'tableName', r.tableName, 'timeTag', r.timeTag)
        },
        getBeforeUpdateTableTags: (r) => {
            console.log('getBeforeUpdateTableTags', 'needToRefresh', JSON.stringify(r.oldTableTags) !== JSON.stringify(r.newTableTags))
        },
        getAfterUpdateTableTags: (r) => {
            console.log('getAfterUpdateTableTags', 'needToRefresh', JSON.stringify(r.oldTableTags) !== JSON.stringify(r.newTableTags))
        },
    })

    instWServHapiClient.on('error', (err) => {
        console.log(err)
    })

}
client()

// getServerMethods {
//   tabA: {
//     select: [AsyncFunction: f],
//     insert: [AsyncFunction: f],
//     save: [AsyncFunction: f],
//     del: [AsyncFunction: f]
//   },
//   tabB: {
//     select: [AsyncFunction: f],
//     insert: [AsyncFunction: f],
//     save: [AsyncFunction: f],
//     del: [AsyncFunction: f]
//   },
//   uploadFile: [AsyncFunction: f],
//   add: [AsyncFunction: f]
// }
// select tabA 100 98 upload
// select tabB 100 98 upload
// add 100 107 upload
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-1
// select tabA 100 246 download
// r.tabA.select then [
//   { id: 'id-tabA-peter', name: 'peter', value: 123 },
//   { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//   { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
// ]
// add 100 93 download
// add then result: pa+pb=3.5
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-1',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 123 },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// select tabB 100 194 download
// r.tabB.select then [
//   { id: 'id-tabB-peter', name: 'peter', value: 123 },
//   { id: 'id-tabB-rosemary', name: 'rosemary', value: 123.456 }
// ]
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-2
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-2',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 'value-1' },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-3
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-3',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 'value-2' },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-4
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-4',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 'value-3' },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-5
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-5',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 'value-4' },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-6
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-6',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 'value-5' },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
```

### In a browser(UMD module):
> **Note:** `w-serv-hapi-client` does't depend on any package.

[Necessary] Add script for w-serv-hapi-client.
```alias
<script src="https://cdn.jsdelivr.net/npm/w-serv-hapi@1.0.27/dist/w-serv-hapi-client.umd.js"></script>
```

#### Example for w-serv-hapi-client:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-serv-hapi/blob/master/web.html)]
```alias
let $fapi = null

async function client() {

    //WServHapiClient
    let WServHapiClient = window['w-serv-hapi-client']
    let wshc = new WServHapiClient({
        // FormData,
        url: 'http://localhost:8080',
        useWaitToken: false,
        getToken: () => {
            return '' //Vue.prototype.$store.state.userToken
        },
        getServerMethods: (r) => {
            console.log('getServerMethods', r)

            //save
            //Vue.prototype.$fapi = r
            $fapi = r

            //select tabA
            r.tabA.select(({ prog, p, m }) => {
                console.log('select tabA', prog, p, m)
            })
                .then((res) => {
                    console.log('r.tabA.select then', res)
                })
                .catch((err) => {
                    console.log('r.tabA.select catch', err)
                })

            //select tabB
            r.tabB.select(({ prog, p, m }) => {
                console.log('select tabB', prog, p, m)
            })
                .then((res) => {
                    console.log('r.tabB.select then', res)
                })
                .catch((err) => {
                    console.log('r.tabB.select catch', err)
                })

            //uploadFile
            r.uploadFile({
                name: 'zdata.b1',
                u8a: new Uint8Array([66, 97, 115]),
            // u8a: new Uint8Array(fs.readFileSync('../_data/500mb.7z')), //最多500mb, 因測試使用w-converhp, 其依賴新版@hapi/pez無法處理1g檔案, 會出現: Invalid string length
            }, ({ prog, p, m }) => {
                console.log('uploadFile', prog, p, m)
            })

            //add
            r.add({
                pa: 1,
                pb: 2.5,
            }, ({ prog, p, m }) => {
                console.log('add', prog, p, m)
            })
                .then((res) => {
                    console.log('add then', res)
                })
                .catch((err) => {
                    console.log('add catch', err)
                })

        },
        recvData: (r) => {
            console.log('recvData', r)
            //Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateTableData, r)
        },
        getRefreshState: (r) => {
            console.log('getRefreshState', 'needToRefresh', r.needToRefresh)
        },
        getRefreshTable: (r) => {
            console.log('getRefreshTable', 'tableName', r.tableName, 'timeTag', r.timeTag)
        },
        getBeforeUpdateTableTags: (r) => {
            console.log('getBeforeUpdateTableTags', 'needToRefresh', JSON.stringify(r.oldTableTags) !== JSON.stringify(r.newTableTags))
        },
        getAfterUpdateTableTags: (r) => {
            console.log('getAfterUpdateTableTags', 'needToRefresh', JSON.stringify(r.oldTableTags) !== JSON.stringify(r.newTableTags))
        },
    })

    return wshc
}
client()
    .catch((err) => {
        console.log(err)
    })

// getServerMethods {
//   tabA: {
//     select: [AsyncFunction: f],
//     insert: [AsyncFunction: f],
//     save: [AsyncFunction: f],
//     del: [AsyncFunction: f]
//   },
//   tabB: {
//     select: [AsyncFunction: f],
//     insert: [AsyncFunction: f],
//     save: [AsyncFunction: f],
//     del: [AsyncFunction: f]
//   },
//   uploadFile: [AsyncFunction: f],
//   add: [AsyncFunction: f]
// }
// select tabA 100 98 upload
// select tabB 100 98 upload
// add 100 107 upload
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-1
// select tabA 100 246 download
// r.tabA.select then [
//   { id: 'id-tabA-peter', name: 'peter', value: 123 },
//   { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//   { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
// ]
// add 100 93 download
// add then result: pa+pb=3.5
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-1',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 123 },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// select tabB 100 194 download
// r.tabB.select then [
//   { id: 'id-tabB-peter', name: 'peter', value: 123 },
//   { id: 'id-tabB-rosemary', name: 'rosemary', value: 123.456 }
// ]
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-2
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-2',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 'value-1' },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-3
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-3',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 'value-2' },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-4
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-4',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 'value-3' },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-5
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-5',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 'value-4' },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag tag-6
// recvData {
//   tableName: 'tabA',
//   timeTag: 'tag-6',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 'value-5' },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
```