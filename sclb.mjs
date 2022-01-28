// import fs from 'fs'
import FormData from 'form-data'
import WServHapiClient from './src/WServHapiClient.mjs'


async function client() {

    //WServHapiClient
    let wshc = WServHapiClient({
        FormData,
        getUrl: () => {
            //return window.location.origin + window.location.pathname
            return 'http://localhost:9000'
        },
        useWaitToken: false,
        getToken: () => {
            return '' //Vue.prototype.$store.state.userToken
        },
        getServerMethods: (r) => {
            console.log('getServerMethods', r)
            //Vue.prototype.$fapi = r

            //execFunA
            r.execFunA({
                pa: 1,
                pb: 2.5,
            }, ({ prog, p, m }) => {
                console.log('execFunA', prog, p, m)
            })
                .then((res) => {
                    console.log('execFunA then', res)
                })
                .catch((err) => {
                    console.log('execFunA catch', err)
                })

        },
        recvData: (r) => {
            console.log('sync data', r)
            //Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateTableData, r)
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
// r.tabB.select then [
//   { id: 'id-tabB-peter', name: 'peter', value: 123 },
//   { id: 'id-tabB-rosemary', name: 'rosemary', value: 123.456 }
// ]
// r.tabA.select then [
//   { id: 'id-tabA-peter', name: 'peter', value: {random value} },
//   { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//   { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
// ]
// sync data {
//   tableName: 'tabA',
//   timeTag: '2022-01-28T09:54:05+08:00|29azjN',
//   data: [
//     { id: 'id-tabA-peter', name: 'peter', value: {random value}},
//     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
//     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
//   ]
// }
// repeat...


//node --experimental-modules --es-module-specifier-resolution=node sclb.mjs
