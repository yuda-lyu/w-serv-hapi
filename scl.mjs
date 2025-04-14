// import fs from 'fs'
import FormData from 'form-data'
import WServHapiClient from './src/WServHapiClient.mjs'


async function client() {

    //WServHapiClient
    let instWServHapiClient = new WServHapiClient({
        FormData,
        url: 'http://localhost:8080',
        // apiName: '_api',
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


//node scl.mjs
