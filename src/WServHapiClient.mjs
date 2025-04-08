import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import ispm from 'wsemi/src/ispm.mjs'
import isWindow from 'wsemi/src/isWindow.mjs'
import waitFun from 'wsemi/src/waitFun.mjs'
import WConverhpClient from 'w-converhp/src/WConverhpClient.mjs'
import WServWebdataClient from 'w-serv-webdata/src/WServWebdataClient.mjs'


/**
 * Hapi瀏覽器端之資料控制與同步器
 *
 * @class
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Function} [opt.FormData=()=>''] 輸入指定FormData函數，當於nodejs執行時需提供FormData才能使用，可安裝'form-data'並引用取得FormData，預設()=>''
 * @param {String} [opt.url='http://localhost:8080'] 輸入伺服器接口網址，前端常用window.location.origin+window.location.pathname，預設為'http://localhost:8080'
 * @param {String} [opt.apiName='api'] 輸入API名稱字串，預設'api'
 * @param {Function} [opt.getToken=()=>''] 輸入取得使用者token的回調函數，預設()=>''
 * @param {String} [opt.tokenType='Bearer'] 輸入token類型字串，預設'Bearer'
 * @param {Boolean} [opt.useWaitToken=false] 輸入是否等待有token才啟動，供驗證使用者已成功登入之用，預設false
 * @param {Function} opt.getServerMethods 輸入提供操作物件的回調函數，前後端通訊先取得可呼叫函數清單，映射完之後，後端函數都將放入物件當中，key為函數名而值為函數，並通過回調函數提供該物件
 * @param {Function} opt.recvData 輸入取得變更表資料的回調函數
 * @param {Boolean} [opt.showLog=true] 輸入是否使用console.log顯示基本資訊布林值，預設true
 * @returns {Object} 回傳物件，wcc為w-converhp的瀏覽器事件物件，wsdc為w-serv-webdata的瀏覽器事件物件，可監聽error事件
 * @example
 *
 * // import fs from 'fs'
 * import FormData from 'form-data'
 * import WServHapiClient from './src/WServHapiClient.mjs'
 *
 * async function client() {
 *
 *     //WServHapiClient
 *     let instWServHapiClient = new WServHapiClient({
 *         FormData,
 *         url: 'http://localhost:8080',
 *         useWaitToken: false,
 *         getToken: () => {
 *             return 'token-for-test' //Vue.prototype.$store.state.userToken
 *         },
 *         getServerMethods: (r) => {
 *             console.log('getServerMethods', r)
 *             //Vue.prototype.$fapi = r
 *
 *             //select tabA
 *             r.tabA.select(({ prog, p, m }) => {
 *                 console.log('select tabA', prog, p, m)
 *             })
 *                 .then((res) => {
 *                     console.log('r.tabA.select then', res)
 *                 })
 *                 .catch((err) => {
 *                     console.log('r.tabA.select catch', err)
 *                 })
 *
 *             //select tabB
 *             r.tabB.select(({ prog, p, m }) => {
 *                 console.log('select tabB', prog, p, m)
 *             })
 *                 .then((res) => {
 *                     console.log('r.tabB.select then', res)
 *                 })
 *                 .catch((err) => {
 *                     console.log('r.tabB.select catch', err)
 *                 })
 *
 *             //uploadFile
 *             r.uploadFile({
 *                 name: 'zdata.b1',
 *                 u8a: new Uint8Array([66, 97, 115]),
 *             }, ({ prog, p, m }) => {
 *                 console.log('uploadFile', prog, p, m)
 *             })
 *
 *             //add
 *             r.add({
 *                 pa: 1,
 *                 pb: 2.5,
 *             }, ({ prog, p, m }) => {
 *                 console.log('add', prog, p, m)
 *             })
 *                 .then((res) => {
 *                     console.log('add then', res)
 *                 })
 *                 .catch((err) => {
 *                     console.log('add catch', err)
 *                 })
 *
 *         },
 *         recvData: (r) => {
 *             console.log('recvData', r)
 *             //Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateTableData, r)
 *         },
 *         getRefreshState: (r) => {
 *             console.log('getRefreshState', 'needToRefresh', r.needToRefresh)
 *         },
 *         getRefreshTable: (r) => {
 *             console.log('getRefreshTable', 'tableName', r.tableName, 'timeTag', r.timeTag)
 *         },
 *         getBeforeUpdateTableTags: (r) => {
 *             console.log('getBeforeUpdateTableTags', 'needToRefresh', JSON.stringify(r.oldTableTags) !== JSON.stringify(r.newTableTags))
 *         },
 *         getAfterUpdateTableTags: (r) => {
 *             console.log('getAfterUpdateTableTags', 'needToRefresh', JSON.stringify(r.oldTableTags) !== JSON.stringify(r.newTableTags))
 *         },
 *     })
 *
 *     instWServHapiClient.on('error', (err) => {
 *         console.log(err)
 *     })
 *
 * }
 * client()
 *
 * // getServerMethods {
 * //   tabA: {
 * //     select: [AsyncFunction: f],
 * //     insert: [AsyncFunction: f],
 * //     save: [AsyncFunction: f],
 * //     del: [AsyncFunction: f]
 * //   },
 * //   tabB: {
 * //     select: [AsyncFunction: f],
 * //     insert: [AsyncFunction: f],
 * //     save: [AsyncFunction: f],
 * //     del: [AsyncFunction: f]
 * //   },
 * //   uploadFile: [AsyncFunction: f],
 * //   add: [AsyncFunction: f]
 * // }
 * // select tabA 100 98 upload
 * // select tabB 100 98 upload
 * // add 100 107 upload
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag tag-1
 * // select tabA 100 246 download
 * // r.tabA.select then [
 * //   { id: 'id-tabA-peter', name: 'peter', value: 123 },
 * //   { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
 * //   { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * // ]
 * // add 100 93 download
 * // add then result: pa+pb=3.5
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: 'tag-1',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 123 },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
 * //     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 * // select tabB 100 194 download
 * // r.tabB.select then [
 * //   { id: 'id-tabB-peter', name: 'peter', value: 123 },
 * //   { id: 'id-tabB-rosemary', name: 'rosemary', value: 123.456 }
 * // ]
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag tag-2
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: 'tag-2',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 'value-1' },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
 * //     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag tag-3
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: 'tag-3',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 'value-2' },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
 * //     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag tag-4
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: 'tag-4',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 'value-3' },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
 * //     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag tag-5
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: 'tag-5',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 'value-4' },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
 * //     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag tag-6
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: 'tag-6',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 'value-5' },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
 * //     { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 *
 */
function WServHapiClient(opt = {}) {
    let instWConverClient = null

    //env
    let env = isWindow() ? 'browser' : 'nodejs'
    // console.log('env', env)

    async function core() {

        //FormData
        let FormData = get(opt, 'FormData')
        // if (!isfun(FormData)) {
        //     throw new Error(`invalid opt.FormData in nodejs`)
        // }

        //check, 於瀏覽器端自動停用外部引入之FormData
        if (env === 'browser') {
            FormData = undefined
        }

        //url
        let url = get(opt, 'url')
        if (!isestr(url)) {
            url = 'http://localhost:8080'
        }

        //useWaitToken
        let useWaitToken = get(opt, 'useWaitToken', null)
        if (!isbol(useWaitToken)) {
            useWaitToken = false
        }

        //apiName
        let apiName = get(opt, 'apiName')
        if (!isestr(apiName)) {
            apiName = 'api'
        }

        //getToken
        let getToken = get(opt, 'getToken')
        if (!isfun(getToken)) {
            if (useWaitToken) {
                throw new Error('invalid opt.getToken when opt.useWaitToken=true')
            }
            getToken = () => {
                return ''
            }
        }

        //tokenType
        let tokenType = get(opt, 'tokenType')
        if (!isestr(tokenType)) {
            tokenType = 'Bearer'
        }

        //getServerMethods
        let getServerMethods = get(opt, 'getServerMethods')
        if (!isfun(getServerMethods)) {
            getServerMethods = () => { }
        }

        //recvData
        let recvData = get(opt, 'recvData')
        if (!isfun(recvData)) {
            recvData = () => { }
        }

        //getRefreshState, getRefreshTable, getBeforeUpdateTableTags, getAfterUpdateTableTags
        let getRefreshState = get(opt, 'getRefreshState')
        let getRefreshTable = get(opt, 'getRefreshTable')
        let getBeforeUpdateTableTags = get(opt, 'getBeforeUpdateTableTags')
        let getAfterUpdateTableTags = get(opt, 'getAfterUpdateTableTags')

        //showLog
        let showLog = get(opt, 'showLog')
        if (!isbol(showLog)) {
            showLog = true
        }

        //useWaitToken, 等待token
        if (useWaitToken) {
            if (showLog) {
                console.log('waiting token...')
            }

            //waitFun
            await waitFun(async () => {

                //getToken
                let token = getToken()
                if (ispm(token)) {
                    token = await token
                }

                return isestr(token)
            }, { timeInterval: 100 })

            if (showLog) {
                console.log('get token')
            }
        }

        //WConverhpClient
        instWConverClient = new WConverhpClient({
            FormData, //w-converhp的WConverhpClient, 於nodejs使用FormData需安裝套件並提供, 於browser就使用內建FormData故可不用給予
            url,
            apiName,
            getToken, //token會放於headers內, 供execute與upload使用, 於伺服器verifyConn驗證用
            tokenType,
        })

        //WServWebdataClient
        instWConverClient = new WServWebdataClient(
            instWConverClient,
            {

                // getToken: () => {
                //     return Vue.prototype.$store.state.userToken
                // },
                getToken, //token會放於數據內, 於伺服器再通過getUserIdByToken取得使用者id用

                // getServerMethods: (r) => {
                //     console.log('$fapi', r)
                //     Vue.prototype.$fapi = r
                //     Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateDriveable, true)
                // },
                getServerMethods,

                // recvData: (r) => {
                //     console.log('recvData', r.tableName, r.data)
                //     Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateTableData, r)
                // },
                recvData,

                getRefreshState,
                getRefreshTable,
                getBeforeUpdateTableTags,
                getAfterUpdateTableTags,
            })

    }

    //core
    core()
        .catch((err) => {
            try {
                instWConverClient.emit('error', err)
            }
            catch (err) {
                throw new Error(err)
            }
        })

    return instWConverClient
}


export default WServHapiClient
