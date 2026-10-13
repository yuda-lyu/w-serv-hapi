import assert from 'assert'
import { waitFor, startServer, startClient } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf } = wPorts


/**
 * 驗證同步表之表操作select被授權拒絕時, 前端之行為
 *
 * 規格來源: WServHapiServer之opt.authorizeExec「同步資料時前端以不帶參數之表操作select取整表，故tableNamesSync內之表其select須對所有連線者放行，
 * 否則被拒絕之前端取不到該表資料(既有資料維持不變)，且每次重抓皆於前端發出error事件」(轉述w-serv-webdata 1.1.10檔頭規則4)
 */
describe('api-sync-authorize', function() {
    let port = portOf('api-sync-authorize')
    let srv = null
    let cli = null
    let token = 'token-admin'

    let seed = {
        tabA: [
            { id: 'id-tabA-peter', name: 'peter', value: 'v-seed' },
        ],
    }

    //valueOfRecv, 取前端各次收到之tabA資料中peter之值
    let valuesOfRecv = () => {
        return cli.recvs
            .filter((r) => {
                return r.tableName === 'tabA'
            })
            .map((r) => {
                let d = r.data.find((v) => {
                    return v.id === 'id-tabA-peter'
                })
                return d ? d.value : undefined
            })
    }

    before(async function() {
        srv = await startServer({
            name: 'sync-authorize',
            port,
            tableNamesExec: ['tabA'],
            tableNamesSync: ['tabA'],
            seed,
            authorizeExec: ({ userId }) => {
                return userId === 'id-for-admin'
            },
            optServer: {
                getUserIdByToken: (t) => {
                    return t === 'token-admin' ? 'id-for-admin' : ''
                },
            },
        })
        cli = startClient({
            port,
            optClient: {
                getToken: () => {
                    return token
                },
            },
        })
        await cli.methods
    })

    after(async function() {
        if (cli) {
            cli.stop()
        }
        if (srv) {
            await srv.stop()
        }
    })

    it('有權限之前端應同步取得資料表', async function() {
        await waitFor(() => {
            return valuesOfRecv().includes('v-seed')
        }, { msg: 'initial sync timeout' })
    })

    it('select被拒時前端應發出帶表名與原拒絕值之error, 且不呼叫recvData', async function() {
        token = 'token-guest'
        let nRecv = cli.recvs.length
        await srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value: 'v-guest' })
        await waitFor(() => {
            return cli.errors.some((e) => {
                return e && e.tableName === 'tabA' && e.err === 'permission denied'
            })
        }, { msg: 'denied sync error timeout' })
        assert.strict.deepEqual(cli.recvs.length, nRecv)
        assert.strict.deepEqual(valuesOfRecv().includes('v-guest'), false)
    })

    it('權限恢復後之資料表變更應可再同步取得', async function() {
        token = 'token-admin'
        await srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value: 'v-admin' })
        await waitFor(() => {
            return valuesOfRecv().includes('v-admin')
        }, { msg: 'resync after permission restored timeout' })
    })

})
