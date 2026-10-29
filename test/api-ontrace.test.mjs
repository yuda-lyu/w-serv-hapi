import assert from 'assert'
import WServHapiServer from '../src/WServHapiServer.mjs'
import WServHapiClient from '../src/WServHapiClient.mjs'
import { useTempFolder, removeTempFolder, waitFor } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf, reserved } = wPorts


/**
 * 驗證觀察回調opt.onTrace(w-serv-webdata 1.1.19起)確實到達下游(伺服器端與前端), 且本套件不轉交w-converhp之同名選項
 *
 * 規格來源: WServHapiServer與WServHapiClient之JSDoc
 * - opt.onTrace「輸入觀察回調函數，格式為(e)=>{}…原樣轉傳w-serv-webdata(1.1.19起)，其再原樣轉交所包之w-serv-broadcast…之opt.onTrace。事件種類…以w-serv-webdata與w-serv-broadcast之JSDoc為準，本套件不增減事件…未給或非函數時忽略」
 * - 前端「w-converhp前端另有同名之opt.onTrace(重試退避與合併輪詢之事件)，本套件不轉交(本選項只到達w-serv-webdata)」
 *
 * 本套件不訂預設與檢核(規則帳本R1), 本測試測的是「選項確實到達下游, 行為與所給之設定一致」, 事件之種類與欄位由下游單一擁有並測試;
 * 以事件同步(等到指定事件), 不以固定延時(skill role-coder-for-test §8)
 */
describe('api-ontrace', function() {

    //EV_CONVERHP, w-converhp前端之onTrace事件種類(見其JSDoc), 本套件不轉交故不應出現
    let EV_CONVERHP = ['retry-wait', 'retry', 'poll-tick', 'poll-result', 'poll-stop']

    it('伺服端: onTrace到達w-serv-broadcast, 停止時收到stop事件, 事件為凍結物件', async function() {
        let fd = useTempFolder('ontrace-srv')
        let evs = []
        let wsrv = new WServHapiServer({
            port: portOf('api-ontrace', 0),
            useInert: false,
            useShowLog: false,
            pathUploadTemp: `${fd}/uploadTemp`,
            fpTableTags: `${fd}/tableTags.json`,
            onTrace: (e) => {
                evs.push(e)
            },
        })
        wsrv.on('error', () => {})
        try {
            await wsrv.ready()
            await wsrv.stop()
            //w-serv-broadcast之stop事件於clearBroadcast首次呼叫完成時同步發出, 早於stop之promise
            assert.strict.deepEqual(evs.some((e) => e.type === 'stop'), true, JSON.stringify(evs))
            assert.strict.deepEqual(evs.every((e) => typeof e.type === 'string' && Object.isFrozen(e)), true)
        }
        finally {
            await wsrv.stop()
            removeTempFolder(fd)
        }
    })

    it('伺服端: onTrace非函數時忽略, 不拋錯', async function() {
        let fd = useTempFolder('ontrace-srv-invalid')
        let wsrv = null
        try {
            wsrv = new WServHapiServer({
                port: portOf('api-ontrace', 0),
                useInert: false,
                useShowLog: false,
                pathUploadTemp: `${fd}/uploadTemp`,
                fpTableTags: `${fd}/tableTags.json`,
                onTrace: 'x',
            })
            wsrv.on('error', () => {})
            await wsrv.ready()
        }
        finally {
            if (wsrv) {
                await wsrv.stop()
            }
            removeTempFolder(fd)
        }
    })

    it('前端: onTrace到達w-serv-broadcast(start、request、result、stop), 不到達w-converhp(無其重試與合併輪詢事件)', async function() {
        let evs = []
        //指向無人監聽之port, retryMain給1使首輪輪詢失敗時w-converhp(若有轉交)必先發出重試事件
        let cli = new WServHapiClient({
            url: `http://localhost:${reserved.closed}`,
            useShowLog: false,
            retryMain: 1,
            onTrace: (e) => {
                evs.push(e)
            },
        })
        cli.on('error', () => {})
        try {
            await waitFor(() => evs.some((e) => e.type === 'result'), { msg: '未等到輪詢結果事件', timeout: 30000, interval: 20 })
            cli.clearBroadcast()
            cli.clearSync()
            let types = new Set(evs.map((e) => e.type))
            assert.strict.deepEqual(['start', 'request', 'result', 'stop'].every((t) => types.has(t)), true, JSON.stringify([...types]))
            assert.strict.deepEqual(EV_CONVERHP.filter((t) => types.has(t)), [])
            assert.strict.deepEqual(evs.every((e) => Object.isFrozen(e)), true)
        }
        finally {
            cli.clearBroadcast()
            cli.clearSync()
        }
    })

})
