import assert from 'assert'
import size from 'lodash-es/size.js'
import { waitFor, startServer, startClient } from './api-setup.mjs'


/**
 * 驗證前後端之函數清單映射、資料表操作、擴充函數與資料同步
 *
 * 規格來源: WServHapiServer之opt.tableNamesExec、opt.methodsExec、opt.tableNamesSync、opt.kpFunExt,
 * 與WServHapiClient之opt.getServerMethods、opt.recvData
 */
describe('api-exec', function() {
    let port = 8171
    let srv = null
    let cli = null
    let methods = null
    let callsUploadFile = []

    let seed = {
        tabA: [
            { id: 'id-tabA-peter', name: 'peter', value: 123 },
            { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
        ],
        tabB: [
            { id: 'id-tabB-peter', name: 'peter', value: 123 },
        ],
    }

    before(async function() {

        //uploadFile, add, 擴充函數之第1個參數為userId
        let uploadFile = async (userId, { name, u8a }) => {
            callsUploadFile.push({ userId, name, size: size(u8a) })
            return 'finish'
        }
        let add = async (userId, { pa, pb }) => {
            return `result: pa+pb=${pa + pb}`
        }

        srv = await startServer({
            name: 'exec',
            port,
            tableNamesExec: ['tabA', 'tabB'],
            tableNamesSync: ['tabA'],
            seed,
            kpFunExt: {
                uploadFile,
                add,
            },
        })

        cli = startClient({ port })
        methods = await cli.methods

    })

    after(async function() {
        cli.stop()
        await srv.stop()
    })

    it('函數清單應恰為tableNamesExec各表與kpFunExt各函數', function() {
        assert.strict.deepEqual(Object.keys(methods).sort(), ['add', 'tabA', 'tabB', 'uploadFile'])
    })

    it('各資料表應提供methodsExec所指定之操作函數', function() {
        assert.strict.deepEqual(Object.keys(methods.tabA).sort(), ['del', 'insert', 'save', 'select'])
        assert.strict.deepEqual(Object.keys(methods.tabB).sort(), ['del', 'insert', 'save', 'select'])
    })

    it('未列入tableNamesExec之資料表不應可被操作', function() {
        assert.strict.deepEqual(methods.tabC, undefined)
    })

    it('select應取回伺服器端資料表之內容', async function() {
        let r = await methods.tabA.select()
        assert.strict.deepEqual(r, seed.tabA)
    })

    it('擴充函數應回傳其結果', async function() {
        let r = await methods.add({ pa: 1, pb: 2.5 })
        assert.strict.deepEqual(r, 'result: pa+pb=3.5')
    })

    it('擴充函數之第1個參數應為getUserIdByToken所提供之userId, 之後才為前端給予參數', async function() {
        let r = await methods.uploadFile({
            name: 'zdata.b1',
            u8a: new Uint8Array([66, 97, 115]),
        })
        assert.strict.deepEqual(r, 'finish')
        assert.strict.deepEqual(callsUploadFile, [{ userId: 'id-for-admin', name: 'zdata.b1', size: 3 }])
    })

    it('tableNamesSync所指定之資料表變更後應同步推送至前端', async function() {

        //伺服器端變更tabA
        await srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value: 'value-sync' })

        //前端應收到該表之變更
        await waitFor(() => {
            return recvOfTable('tabA', 'value-sync') !== null
        }, { msg: 'recvData for tabA timeout' })

        //變更內容應為更新後之整表資料
        let r = recvOfTable('tabA', 'value-sync')
        assert.strict.deepEqual(r.tableName, 'tabA')
        assert.strict.deepEqual(r.data, [
            { id: 'id-tabA-peter', name: 'peter', value: 'value-sync' },
            { id: 'id-tabA-rosemary', name: 'rosemary', value: 123.456 },
        ])

    })

    it('未列入tableNamesSync之資料表變更不應推送至前端', async function() {

        //伺服器端變更tabB
        await srv.kpOrm.tabB.save({ id: 'id-tabB-peter', name: 'peter', value: 'value-no-sync' })

        //等待一輪輪詢(前端輪詢間隔為2秒)後仍不應收到tabB
        await new Promise((resolve) => {
            setTimeout(resolve, 5000)
        })
        let rs = cli.recvs.filter((v) => {
            return v.tableName === 'tabB'
        })
        assert.strict.deepEqual(rs, [])

    })

    it('全程不應發生error事件', function() {
        assert.strict.deepEqual(srv.errors, [])
        assert.strict.deepEqual(cli.errors, [])
    })

    //recvOfTable, 取出指定表內含指定值之變更資料
    function recvOfTable(tableName, value) {
        let rs = cli.recvs.filter((v) => {
            if (v.tableName !== tableName) {
                return false
            }
            return v.data.some((d) => {
                return d.value === value
            })
        })
        if (rs.length === 0) {
            return null
        }
        return rs[rs.length - 1]
    }

})
