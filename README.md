# w-serv-hapi
A wrapper hapi for data control and synchronization between nodejs and browser.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-serv-hapi.svg?style=flat)](https://npmjs.org/package/w-serv-hapi) 
[![license](https://img.shields.io/npm/l/w-serv-hapi.svg?style=flat)](https://npmjs.org/package/w-serv-hapi) 
[![gzip file size](http://img.badgesize.io/yuda-lyu/w-serv-hapi/master/dist/w-serv-hapi-server.umd.js.svg?compression=gzip)](https://github.com/yuda-lyu/w-serv-hapi)
[![npm download](https://img.shields.io/npm/dt/w-serv-hapi.svg)](https://npmjs.org/package/w-serv-hapi) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-serv-hapi.svg)](https://www.jsdelivr.com/package/npm/w-serv-hapi)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-serv-hapi/WServHapiServer.html).

## Parts
`w-serv-hapi` includes 2 parts: 
* `w-serv-hapi-server`: for nodejs server
* `w-serv-hapi-client`: for nodejs and browser client

## Installation
### Using npm(ES6 module):
> **Note:** `w-serv-hapi-server` and `w-serv-hapi-client` is mainly dependent on `lodash`, `w-serv-webdata`,`w-converhp` and `wsemi`.

```alias
npm i w-serv-hapi
```

#### Example for w-serv-hapi-server:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-serv-hapi/blob/master/srva.mjs)]
```alias
import fs from 'fs'
import _ from 'lodash'
import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs'
import WServHapiServer from './src/WServHapiServer.mjs'

async function run() {

    //optWOrm
    let optWOrm = {
        url: 'mongodb://username:password@localhost:27017',
        db: 'servhapi',
        cl: '',
    }

    //tableNamesExec, tableNamesSync
    let tableNamesExec = ['tabA', 'tabB']
    let tableNamesSync = ['tabA']

    //woItems
    let woItems = {}
    for (let k in tableNamesExec) {
        let v = tableNamesExec[k]
        let opt = { ...optWOrm, cl: v }
        let wo = new WOrm(opt)
        woItems[v] = wo
    }

    async function saveData(cl, r) {

        //w
        let w = woItems[cl] //一定要由woItems操作, 否則傳woItems進去WServHapiServer會無法收到change事件

        //save
        await w.save(r, { atomic: true }) //autoInsert: false
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

    let n = 0
    let tn = setInterval(() => {
        n++
        console.log('update tabA', n)
        r = {
            id: 'id-tabA-peter',
            name: 'peter',
            value: Math.random(),
        }
        saveData('tabA', r)
        if (n >= 5) {
            clearInterval(tn)
        }
    }, 3000)

    let procCommon = async (userId, tableName, methodName, input) => {
        // console.log('procCommon call', tableName, methodName, input)
        let r = await woItems[tableName][methodName](input)
        // console.log('procCommon result', r)
        return r
    }

    let uploadFile = async (userId, { name, u8a }) => {
        console.log('uploadFile', userId, name, _.size(u8a))
        fs.writeFileSync(name, Buffer.from(u8a))
        console.log('uploadFile writeFileSync finish')
        return 'finish'
    }

    //WServHapiServer
    let wshs = WServHapiServer({
        port: 8080,
        apis: [],
        getUserIDFromToken: async (token) => { //可使用async或sync函數
            return 'id-for-admin'
        },
        useDbORM: true,
        dbORMs: woItems,
        operORM: procCommon, //procCommon的輸入為: userId, tableName, methodName, input
        tableNamesExec,
        methodsExec: ['select', 'insert', 'save', 'del'],
        tableNamesSync,
        extFuncs: { //接收參數第1個為userId, 之後才是前端給予參數
            uploadFile,
            // getUserFromID,
            // downloadFileFromID,
            // saveTableAndData,
            //...
        },

        hookBefores: null,
        hookAfters: null,
    })

    return wshs
}
run()
    .catch((err) => {
        console.log(err)
    })

// save then tabA [
//   { n: 1, nModified: 1, ok: 1 },
//   { n: 1, nModified: 1, ok: 1 },
//   { n: 1, nModified: 1, ok: 1 }
// ]
// save then tabB [ { n: 1, nModified: 1, ok: 1 }, { n: 1, nModified: 1, ok: 1 } ]
// Server running at: http://DESKTOP-5UNLNF8:8080
// Server[port:8080]: open
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
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-serv-hapi/blob/master/scla.mjs)]
```alias
import FormData from 'form-data'
import WServHapiClient from './src/WServHapiClient.mjs'

async function client() {

    //WServHapiClient
    let wshc = WServHapiClient({
        FormData,
        getUrl: () => {
            //return window.location.origin + window.location.pathname
            return 'http://localhost:8080'
        },
        useWaitToken: false,
        getToken: () => {
            return '' //Vue.prototype.$store.state.userToken
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
            // u8a: new Uint8Array(fs.readFileSync('../_data/500mb.7z')), //最多500mb, 因測試使用w-converhp, 其依賴新版@hapi/pez無法處理1g檔案, 會出現: Invalid string length
            }, ({ prog, p, m }) => {
                console.log('uploadFile', prog, p, m)
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
        getBeforePollingTableTags: () => {
            console.log('getBeforePollingTableTags')
        },
        getAfterPollingTableTags: () => {
            console.log('getAfterPollingTableTags')
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
//   uploadFile: [AsyncFunction: f]
// }
// r.tabA.select then [
//   { id: 'id-tabA-peter', name: 'peter', value: 123 },
//   { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//   { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
// ]
// r.tabB.select then [
//   { id: 'id-tabB-peter', name: 'peter', value: 123 },
//   { id: 'id-tabB-rosemary', name: 'rosemary', value: 123.456 }
// ]
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag kFv3W1
// recvData {
//   tableName: 'tabA',
//   timeTag: 'kFv3W1',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 123 },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag 2022-03-02T17:05:39+08:00|Mkmsfo
// recvData {
//   tableName: 'tabA',
//   timeTag: '2022-03-02T17:05:39+08:00|Mkmsfo',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 0.2695575980174958 },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag 2022-03-02T17:05:42+08:00|hqCtKH
// recvData {
//   tableName: 'tabA',
//   timeTag: '2022-03-02T17:05:42+08:00|hqCtKH',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 0.5347793912758274 },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag 2022-03-02T17:05:45+08:00|FA4NPZ
// recvData {
//   tableName: 'tabA',
//   timeTag: '2022-03-02T17:05:45+08:00|FA4NPZ',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 0.5995958376378325 },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag 2022-03-02T17:05:48+08:00|8Q88uv
// recvData {
//   tableName: 'tabA',
//   timeTag: '2022-03-02T17:05:48+08:00|8Q88uv',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 0.45049512863192986 },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
// getBeforeUpdateTableTags needToRefresh true
// getRefreshState needToRefresh true
// getRefreshTable tableName tabA timeTag 2022-03-02T17:05:51+08:00|1k3U1P
// recvData {
//   tableName: 'tabA',
//   timeTag: '2022-03-02T17:05:51+08:00|1k3U1P',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: 0.07134333448641317 },
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// getAfterUpdateTableTags needToRefresh false
```

### In a browser(UMD module):
> **Note:** `w-serv-hapi-client` does't depend on any package.

[Necessary] Add script for w-serv-hapi-client.
```alias
<script src="https://cdn.jsdelivr.net/npm/w-serv-hapi@1.0.9/dist/w-serv-hapi-client.umd.js"></script>
```

#### Example for w-serv-hapi-client:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-serv-hapi/blob/master/web.html)]
```alias
let $fapi = null

async function client() {

    //WServHapiClient
    let WServHapiClient = window['w-serv-hapi-client']
    let wshc = WServHapiClient({
        // FormData,
        getUrl: () => {
            //return window.location.origin + window.location.pathname
            return 'http://localhost:8080'
        },
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

        },
        recvData: (r) => {
            console.log('recvData', r)
            //Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateTableData, r)
        },
    })

    return wshc
}
client()
    .catch((err) => {
        console.log(err)
    })
// getServerMethods {tabA: {…}, tabB: {…}, uploadFile: ƒ}
// web.html:51 select tabA 100 339 upload
// web.html:51 select tabA 100 310 donwload
// web.html:54 r.tabA.select then (3) [{…}, {…}, {…}]
// web.html:62 select tabB 100 339 upload
// web.html:62 select tabB 100 258 donwload
// web.html:65 r.tabB.select then (2) [{…}, {…}]
// web.html:77 uploadFile 100 386 upload
// web.html:77 uploadFile 100 154 donwload
// web.html:82 recvData {tableName: 'tabA', timeTag: 'g1vSkQ', data: Array(3)}
// web.html:82 recvData {tableName: 'tabA', timeTag: '2022-01-28T14:32:24+08:00|16nHaJ', data: Array(3)}
// repeat...

```