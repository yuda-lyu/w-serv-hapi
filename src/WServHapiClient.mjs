import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import ispm from 'wsemi/src/ispm.mjs'
import isWindow from 'wsemi/src/isWindow.mjs'
import waitFun from 'wsemi/src/waitFun.mjs'
import evem from 'wsemi/src/evem.mjs'
import WConverhpClient from 'w-converhp/src/WConverhpClient.mjs'
import WServWebdataClient from 'w-serv-webdata/src/WServWebdataClient.mjs'


/**
 * Hapi瀏覽器端之資料控制與同步器
 *
 * @class
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Function} [opt.FormData=()=>''] 輸入指定FormData函數，當於nodejs執行時需提供FormData才能使用，可安裝'form-data'並引用取得FormData，預設()=>''
 * @param {Function} [opt.getUrl=()=>''] 輸入指定getUrl函數，提供伺服器接口網址，預設()=>''
 * @param {Boolean} [opt.useWaitToken=false] 輸入是否等待有token才啟動，供驗證使用者已成功登入之用，預設false
 * @param {Function} [opt.getToken=()=>''] 輸入取得使用者token的回調函數，預設()=>''
 * @param {Function} opt.getServerMethods 輸入提供操作物件的回調函數，前後端通訊先取得可呼叫函數清單，映射完之後，後端函數都將放入物件當中，key為函數名而值為函數，並通過回調函數提供該物件
 * @param {Function} opt.recvData 輸入取得變更表資料的回調函數
 * @param {Boolean} [opt.showLog=true] 輸入是否使用console.log顯示基本資訊布林值，預設true
 * @returns {Object} 回傳物件，wcc為w-converhp的瀏覽器事件物件，wsdc為w-serv-webdata的瀏覽器事件物件，可監聽error事件
 * @example
 *
 * import FormData from 'form-data'
 * import WServHapiClient from './src/WServHapiClient.mjs'
 *
 *
 * async function client() {
 *
 *     //WServHapiClient
 *     let instWServHapiClient = new WServHapiClient({
 *         FormData,
 *         getUrl: () => {
 *             //return window.location.origin + window.location.pathname
 *             return 'http://localhost:8080'
 *         },
 *         useWaitToken: false,
 *         getToken: () => {
 *             return '' //Vue.prototype.$store.state.userToken
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
 *             // u8a: new Uint8Array(fs.readFileSync('../_data/500mb.7z')), //最多500mb, 因測試使用w-converhp, 其依賴新版@hapi/pez無法處理1g檔案, 會出現: Invalid string length
 *             }, ({ prog, p, m }) => {
 *                 console.log('uploadFile', prog, p, m)
 *             })
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
 *         getBeforePollingTableTags: () => {
 *             console.log('getBeforePollingTableTags')
 *         },
 *         getAfterPollingTableTags: () => {
 *             console.log('getAfterPollingTableTags')
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
 * //   uploadFile: [AsyncFunction: f]
 * // }
 * // r.tabA.select then [
 * //   { id: 'id-tabA-peter', name: 'peter', value: 123 },
 * //   { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
 * //   { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * // ]
 * // r.tabB.select then [
 * //   { id: 'id-tabB-peter', name: 'peter', value: 123 },
 * //   { id: 'id-tabB-rosemary', name: 'rosemary', value: 123.456 }
 * // ]
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag kFv3W1
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: 'kFv3W1',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 123 },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag 2022-03-02T17:05:39+08:00|Mkmsfo
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: '2022-03-02T17:05:39+08:00|Mkmsfo',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 0.2695575980174958 },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag 2022-03-02T17:05:42+08:00|hqCtKH
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: '2022-03-02T17:05:42+08:00|hqCtKH',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 0.5347793912758274 },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag 2022-03-02T17:05:45+08:00|FA4NPZ
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: '2022-03-02T17:05:45+08:00|FA4NPZ',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 0.5995958376378325 },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag 2022-03-02T17:05:48+08:00|8Q88uv
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: '2022-03-02T17:05:48+08:00|8Q88uv',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 0.45049512863192986 },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 * // getBeforeUpdateTableTags needToRefresh true
 * // getRefreshState needToRefresh true
 * // getRefreshTable tableName tabA timeTag 2022-03-02T17:05:51+08:00|1k3U1P
 * // recvData {
 * //   tableName: 'tabA',
 * //   timeTag: '2022-03-02T17:05:51+08:00|1k3U1P',
 * //   data: [
 * //     { id: 'id-tabA-peter', name: 'peter', value: 0.07134333448641317 },
 * //     { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },    { id: 'id-tabA-kettle', name: 'kettle', value: 456 }
 * //   ]
 * // }
 * // getAfterUpdateTableTags needToRefresh false
 *
 */
function WServHapiClient(opt = {}) {
    let instWConverhpClient = null
    let instWServWebdataClient = null

    //ev
    let ev = evem()

    async function core() {

        //FormData
        let FormData = get(opt, 'FormData')
        // if (!isfun(FormData)) {
        //     throw new Error(`invalid opt.FormData in nodejs`)
        // }

        //env
        let env = isWindow() ? 'browser' : 'nodejs'
        // console.log('env', env)

        //check, 於瀏覽器端自動停用外部引入之FormData
        if (env === 'browser') {
            FormData = undefined
        }

        //getUrl
        let getUrl = get(opt, 'getUrl')
        if (!isfun(getUrl)) {
            getUrl = () => {
                return window.location.origin + window.location.pathname
            }
        }

        //useWaitToken
        let useWaitToken = get(opt, 'useWaitToken', null)
        if (!isbol(useWaitToken)) {
            useWaitToken = false
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

        //getRefreshState, getRefreshTable, getBeforeUpdateTableTags, getAfterUpdateTableTags, getBeforePollingTableTags, getAfterPollingTableTags
        let getRefreshState = get(opt, 'getRefreshState')
        let getRefreshTable = get(opt, 'getRefreshTable')
        let getBeforeUpdateTableTags = get(opt, 'getBeforeUpdateTableTags')
        let getAfterUpdateTableTags = get(opt, 'getAfterUpdateTableTags')
        let getBeforePollingTableTags = get(opt, 'getBeforePollingTableTags')
        let getAfterPollingTableTags = get(opt, 'getAfterPollingTableTags')

        //showLog
        let showLog = get(opt, 'showLog')
        if (!isbol(showLog)) {
            showLog = true
        }

        //useWaitToken, 等待有效token
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
        instWConverhpClient = new WConverhpClient({
            FormData, //w-converhp的WConverhpClient, 於nodejs使用FormData需安裝套件並提供, 於browser就使用內建FormData故可不用給予
            url: getUrl(),
        })

        //WServWebdataClient
        instWServWebdataClient = new WServWebdataClient({
            instWConverClient: instWConverhpClient,
            // cbGetToken: () => {
            //     return Vue.prototype.$store.state.userToken
            // },
            cbGetToken: getToken,
            // cbGetServerMethods: (r) => {
            //     console.log('$fapi', r)
            //     Vue.prototype.$fapi = r
            //     Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateDriveable, true)
            // },
            cbGetServerMethods: getServerMethods,
            // cbRecvData: (r) => {
            //     console.log('recvData', r.tableName, r.data)
            //     Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateTableData, r)
            // },
            cbRecvData: recvData,
            cbGetRefreshState: getRefreshState,
            cbGetRefreshTable: getRefreshTable,
            cbBeforeUpdateTableTags: getBeforeUpdateTableTags,
            cbAfterUpdateTableTags: getAfterUpdateTableTags,
            cbBeforePollingTableTags: getBeforePollingTableTags,
            cbAfterPollingTableTags: getAfterPollingTableTags,
        })

        //error
        instWConverhpClient.on('error', (err) => {
            if (showLog) {
                console.log('instWConverhpClient error', err)
            }
        })

        //error
        instWServWebdataClient.on('error', (err) => {
            if (showLog) {
                console.log('instWServWebdataClient error', err)
            }
        })

    }

    //core
    core()
        .catch((err) => {
            ev.emit('error', err)
        })

    //save
    ev.getInstWConverhpClient = () => {
        return instWConverhpClient
    }
    ev.getInstWServWebdataClient = () => {
        return instWServWebdataClient
    }

    return ev
}


export default WServHapiClient
