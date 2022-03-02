// import fs from 'fs'
// import _ from 'lodash'
import WServHapiServer from './src/WServHapiServer.mjs'


async function run() {

    let execFunA = async (userId, { pa, pb }) => {
        // console.log('execFunA', userId, pa, pb)
        return `result: pa+pb=${pa + pb}`
    }

    //WServHapiServer
    let wshs = WServHapiServer({
        port: 8080,
        apis: [],
        getUserIDFromToken: async (token) => { //可使用async或sync函數
            return 'id-for-admin'
        },
        useDbORM: false,
        // dbORMs: woItems,
        // operORM: procCommon, //procCommon的輸入為: userId, tableName, methodName, input
        // tableNamesExec,
        // methodsExec: ['select', 'insert', 'save', 'del'],
        // tableNamesSync,
        extFuncs: { //接收參數第1個為userId, 之後才是前端給予參數
            execFunA,
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
//     { n: 1, nModified: 1, ok: 1 },
//     { n: 1, nModified: 1, ok: 1 },
//     { n: 1, nModified: 1, ok: 1 }
// ]
// save then tabB [ { n: 1, nModified: 1, ok: 1 }, { n: 1, nModified: 1, ok: 1 } ]
// Server running at: http://localhost:8080
// Server[port:8080]: open
// update tabA
// save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
// repeat...


//node --experimental-modules --es-module-specifier-resolution=node srvb.mjs
