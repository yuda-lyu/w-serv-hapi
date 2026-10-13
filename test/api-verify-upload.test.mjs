import assert from 'assert'
import fs from 'fs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import WConverhpClient from 'w-converhp/src/WConverhpClient.mjs'
import { startServer } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf } = wPorts


/**
 * 驗證verifyConn與切片上傳之受理條件(行為由w-converhp擁有, 本套件原樣轉傳)
 *
 * 規格來源: WServHapiServer之JSDoc
 * - opt.verifyConn「未給(undefined或null)時全部放行；有給但非函數時不拋錯，通訊路由一律以permission denied拒絕，並由w-converhp於建構期間發出一則error事件。
 *   切片上傳另須於getInstWConverServer所得實體註冊upload監聽才會受理(本套件與w-serv-webdata皆不註冊)，未註冊時於寫入pathUploadTemp之前即回應'no listener for event[upload]'並發出error事件；
 *   註冊後若未給verifyConn，匿名請求亦可呼叫切片上傳而寫入pathUploadTemp」
 * - @returns「建構期間發生者於建構子回傳後才發出…」(R3): 建構期之error須於ready完成前送達
 *
 * 原已知缺陷L4(w-converhp 2.1.6: 上傳管線不檢查upload監聽、verifyConn非函數時放行)於w-converhp 2.1.7修正, 原以pending呈現之兩案已改為正式斷言
 */
describe('api-verify-upload', function() {

    //postSlice, 不帶token以原始請求打切片上傳API, 回傳解碼後之回應封包
    async function postSlice(port) {
        let res = await fetch(`http://localhost:${port}/api/slc`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'chunk-index': '0',
                'chunk-total': '1',
                'package-id': 'anon01',
            },
            body: Buffer.alloc(16, 1),
        })
        let u8a = new Uint8Array(Buffer.from(await res.arrayBuffer()))
        return u8arr2obj(u8a)
    }

    //filesOf, 列出pathUploadTemp內之檔案
    let filesOf = (srv) => {
        let fd = `${srv.fd}/uploadTemp`
        return fs.existsSync(fd) ? fs.readdirSync(fd).sort() : []
    }

    it('本套件與w-serv-webdata皆不註冊upload與download監聽; 未註冊upload監聽時匿名之切片上傳應於寫入pathUploadTemp前被拒絕並發出error事件', async function() {
        let srv = null
        try {
            srv = await startServer({ name: 'verify-upload-none', port: portOf('api-verify-upload', 0) })
            let inst = await srv.wsrv.getInstWConverServer()
            assert.strict.deepEqual([inst.listenerCount('upload'), inst.listenerCount('download')], [0, 0])

            let r = await postSlice(srv.port)
            assert.strict.deepEqual(r, { error: 'no listener for event[upload]' })
            assert.strict.deepEqual(filesOf(srv), [])
            assert.strict.deepEqual(srv.errors, ['no listener for event[upload]'])
        }
        finally {
            if (srv) {
                await srv.stop()
            }
        }
    })

    it('於getInstWConverServer所得實體註冊upload監聽後, 未給verifyConn時匿名之切片上傳可寫入pathUploadTemp', async function() {
        let srv = null
        try {
            srv = await startServer({ name: 'verify-upload-listener', port: portOf('api-verify-upload', 1) })
            let inst = await srv.wsrv.getInstWConverServer()
            inst.on('upload', (input, pm) => {
                pm.resolve('saved')
            })
            let r = await postSlice(srv.port)
            assert.strict.deepEqual(r, { success: 'chunk[1/1] of packageId[anon01] done' })
            assert.strict.deepEqual(filesOf(srv), ['anon01_0'])
            assert.strict.deepEqual(srv.errors, [])
        }
        finally {
            if (srv) {
                await srv.stop()
            }
        }
    })

    it('verifyConn有給但非函數時不拋錯, 建構期之error於ready完成前送達, 通訊路由一律以permission denied拒絕', async function() {
        let srv = null
        let msg = 'invalid verifyConn: must be a function (sync or async), all API requests will be denied'
        try {
            srv = await startServer({ name: 'verify-upload-invalid', port: portOf('api-verify-upload', 2), optServer: { verifyConn: 'yes' } })
            let errorsCtor = [...srv.errors]

            let wc = new WConverhpClient({ url: `http://localhost:${srv.port}`, retryMain: 0 })
            wc.on('error', () => {})
            let r = await wc.execute('tabA', {}).then((v) => {
                return { resolved: v }
            }, (err) => {
                return { rejected: err }
            })
            assert.strict.deepEqual(errorsCtor, [msg])
            assert.strict.deepEqual(r, { rejected: 'permission denied' })
            assert.strict.deepEqual(srv.errors, [msg])
        }
        finally {
            if (srv) {
                await srv.stop()
            }
        }
    })

})
