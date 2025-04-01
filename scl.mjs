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


//node --experimental-modules scl.mjs
