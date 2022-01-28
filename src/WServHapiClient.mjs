import get from 'lodash/get'
import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import ispm from 'wsemi/src/ispm.mjs'
import isWindow from 'wsemi/src/isWindow.mjs'
import waitFun from 'wsemi/src/waitFun.mjs'
import WConverhpClient from 'w-converhp/src/WConverhpClient.mjs'
import WServWebdataClient from 'w-serv-webdata/src/WServWebdataClient.mjs'


async function WServHapiClient(opt = {}) {

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
    let wcc = new WConverhpClient({
        FormData, //w-converhp的WConverhpClient, 於nodejs使用FormData需安裝套件並提供, 於browser就使用內建FormData故可不用給予
        url: getUrl(),
    })

    //wsdc
    let wsdc = WServWebdataClient({
        instWConverClient: wcc,
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
        //     console.log('sync data', r.tableName, r.data)
        //     Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateTableData, r)
        // },
        cbRecvData: recvData,
    })

    //error
    wcc.on('error', (err) => {
        if (showLog) {
            console.log('wcc error', err)
        }
    })

    //error
    wsdc.on('error', (err) => {
        if (showLog) {
            console.log('wsdc error', err)
        }
    })

    return {
        wcc,
        wsdc,
    }
}


export default WServHapiClient
