import assert from 'assert'
import { startServer, startClient } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf } = wPorts


/**
 * 驗證authorizeExec經本套件轉傳後確實擋在operOrm之前
 *
 * 規格來源: WServHapiServer之opt.authorizeExec「前端呼叫表操作時，於呼叫operOrm之前傳入物件{ userId, tableName, methodName, input }…
 * 回傳值須嚴格等於true才放行，其他值一律拒絕並回應'permission denied'且不呼叫operOrm；拋錯或reject時其值原樣成為回應訊息…不作用於kpFunExt」,
 * opt.getUserIdByToken「拋錯或reject時拒絕該次呼叫，其值原樣成為回應訊息並發出error事件」
 */
describe('api-authorize', function() {
    let port = portOf('api-authorize')
    let srv = null
    let cli = null
    let methods = null
    let token = 'token-admin'

    let seed = {
        tabA: [
            { id: 'id-tabA-peter', name: 'peter', value: 123 },
        ],
        tabB: [
            { id: 'id-tabB-peter', name: 'peter', value: 123 },
        ],
    }

    before(async function() {
        srv = await startServer({
            name: 'authorize',
            port,
            tableNamesExec: ['tabA', 'tabB'],
            tableNamesSync: [], //本檔只驗表操作之授權, 不開同步以免同步拉表之授權結果干擾
            seed,
            kpFunExt: {
                add: async (userId, { pa, pb }) => {
                    return `result: pa+pb=${pa + pb}`
                },
            },
            authorizeExec: ({ userId, tableName, methodName }) => {
                if (userId !== 'id-for-admin') {
                    return false
                }
                if (tableName === 'tabA' && methodName === 'del') {
                    return Promise.reject('no-del-on-tabA')
                }
                if (tableName === 'tabA' && methodName === 'save') {
                    return 1 //truthy但非嚴格true
                }
                if (tableName === 'tabB' && methodName !== 'select') {
                    return false
                }
                return true
            },
            optServer: {
                getUserIdByToken: (t) => {
                    if (t === 'token-admin') {
                        return 'id-for-admin'
                    }
                    if (t === 'token-reject') {
                        return Promise.reject('invalid-user')
                    }
                    return ''
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
        methods = await cli.methods
    })

    after(async function() {
        if (cli) {
            cli.stop()
        }
        if (srv) {
            await srv.stop()
        }
    })

    it('授權回傳true時應呼叫operOrm並回傳其結果', async function() {
        let r = await methods.tabA.select()
        assert.strict.deepEqual(r, seed.tabA)
        assert.strict.deepEqual(srv.callsOperOrm[srv.callsOperOrm.length - 1], { userId: 'id-for-admin', tableName: 'tabA', methodName: 'select' })
    })

    it('authorizeExec應收到userId、tableName、methodName與前端給予之input', async function() {
        let row = { id: 'id-tabA-new', name: 'new', value: 1 }
        await methods.tabA.insert(row)
        assert.strict.deepEqual(srv.callsAuthorize[srv.callsAuthorize.length - 1], { userId: 'id-for-admin', tableName: 'tabA', methodName: 'insert', input: row })
    })

    it('授權回傳false時應回應permission denied且不呼叫operOrm', async function() {
        let n = srv.callsOperOrm.length
        await assert.rejects(methods.tabB.insert({ id: 'id-tabB-new' }), (err) => {
            return err === 'permission denied'
        })
        assert.strict.deepEqual(srv.callsOperOrm.length, n)
    })

    it('授權回傳非嚴格等於true之值時應拒絕', async function() {
        let n = srv.callsOperOrm.length
        await assert.rejects(methods.tabA.save({ id: 'id-tabA-peter', value: 456 }), (err) => {
            return err === 'permission denied'
        })
        assert.strict.deepEqual(srv.callsOperOrm.length, n)
    })

    it('授權reject字串時其值應原樣成為回應訊息且不呼叫operOrm', async function() {
        let n = srv.callsOperOrm.length
        await assert.rejects(methods.tabA.del({ id: 'id-tabA-peter' }), (err) => {
            return err === 'no-del-on-tabA'
        })
        assert.strict.deepEqual(srv.callsOperOrm.length, n)
    })

    it('取不到使用者時userId為空字串, 由授權函數拒絕', async function() {
        token = 'token-guest'
        await assert.rejects(methods.tabA.select(), (err) => {
            return err === 'permission denied'
        })
        assert.strict.deepEqual(srv.callsAuthorize[srv.callsAuthorize.length - 1].userId, '')
    })

    it('kpFunExt不經authorizeExec', async function() {
        token = 'token-guest'
        let n = srv.callsAuthorize.length
        let r = await methods.add({ pa: 1, pb: 2 })
        assert.strict.deepEqual(r, 'result: pa+pb=3')
        assert.strict.deepEqual(srv.callsAuthorize.length, n)
    })

    it('getUserIdByToken拒絕時應回應其值、不呼叫authorizeExec與operOrm, 並經本套件發出error事件', async function() {
        token = 'token-reject'
        let nAuth = srv.callsAuthorize.length
        let nOrm = srv.callsOperOrm.length
        await assert.rejects(methods.tabA.select(), (err) => {
            return err === 'invalid-user'
        })
        assert.strict.deepEqual(srv.callsAuthorize.length, nAuth)
        assert.strict.deepEqual(srv.callsOperOrm.length, nOrm)
        assert.strict.deepEqual(srv.errors, ['invalid-user'])
        token = 'token-admin'
    })

    //同步表之select被拒時之前端行為(不呼叫recvData、既有資料不變、發出帶表名之error, 之後重抓; w-serv-webdata 1.1.10起之檔頭規則4)由test/api-sync-authorize.test.mjs驗證, 本檔不開同步

})
