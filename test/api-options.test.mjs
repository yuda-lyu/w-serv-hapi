import assert from 'assert'
import fs from 'fs'
import net from 'net'
import evem from 'wsemi/src/evem.mjs'
import WServHapiServer from '../src/WServHapiServer.mjs'
import { useTempFolder, removeTempFolder, waitFor, runChild, startClient } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf, reserved } = wPorts


/**
 * 驗證設定之預設、設定錯誤之失敗通道與伺服器生命週期
 *
 * 規格來源: WServHapiServer之JSDoc
 * - opt.useDbOrm「…此時operOrm、tableNamesExec、authorizeExec為必填，未給或無效時建構即同步拋錯。未指定(非布林值)時視為false，此時若給了operOrm、tableNamesExec、methodsExec、authorizeExec、kpOrm或tableNamesSync，建構即同步拋錯」
 * - opt.kpOrm「useDbOrm=true時必填且須為物件，否則建構即同步拋錯…tableNamesSync之各表須在其中且可監聽change事件，否則建構時同步拋錯」
 * - opt.methodsExec「…useDbOrm=true時若有給須為陣列，否則建構即同步拋錯」
 * - opt.kpFunExt「…頂層名不得為表名…違反者建構時同步拋錯」
 * - opt.apis「…衝突時伺服器不啟動，ready以該錯誤reject並發出error事件」
 * - opt.port「須為1至65535之整數，無效時取預設」(預設值以test/tools/ports.mjs之reserved.packageDefault斷言)
 * - @returns「建構期間發生者於建構子回傳後才發出…設定錯誤…於建構時同步拋出…ready…stop…依序釋放下游…將尚未落檔者寫入檔案，落檔失敗時發出error事件…恆resolve，失敗時發出error事件…
 *   本套件不註冊process之unhandledRejection、uncaughtException與uncaughtExceptionMonitor監聽」
 *
 * 各案例之建構一律置於try內, 使建構失敗(含回歸)時仍會關閉佔埠伺服器與刪除暫存資料夾, 而以失敗呈現而非使測試行程掛住
 */
describe('api-options', function() {

    //pThrow, 供建構即同步拋錯之情境共用(正常情況下從未綁定)
    let pThrow = portOf('api-options', 2)

    //newServer, 直接呼叫建構子, 不經startServer之預設放行授權, 以免補上測試故意缺漏之設定; 建構拋錯時先刪暫存資料夾再拋
    function newServer(name, extra = {}) {
        let fd = useTempFolder(`options-${name}`)
        try {
            let wsrv = new WServHapiServer({
                useInert: false,
                useShowLog: false,
                pathUploadTemp: `${fd}/uploadTemp`,
                fpTableTags: `${fd}/tableTags.json`,
                ...extra,
            })
            return { wsrv, fd }
        }
        catch (err) {
            removeTempFolder(fd)
            throw err
        }
    }

    //cleanup, 停止伺服器並刪除暫存資料夾
    async function cleanup(srv) {
        if (srv) {
            await srv.wsrv.stop()
            removeTempFolder(srv.fd)
        }
    }

    //throwOf, 回傳建構時同步拋出之錯誤訊息; 未拋錯時先停掉意外啟動之伺服器再回null
    async function throwOf(name, extra) {
        let srv = null
        try {
            srv = newServer(name, { port: pThrow, ...extra })
        }
        catch (err) {
            return err.message
        }
        srv.wsrv.on('error', () => {})
        await cleanup(srv)
        return null
    }

    //listen, close: 以net佔用與釋放port
    function listen(blocker, port) {
        return new Promise((resolve, reject) => {
            blocker.once('error', reject)
            blocker.listen(port, resolve)
        })
    }
    function close(blocker) {
        return new Promise((resolve) => {
            blocker.close(() => {
                resolve()
            })
        })
    }

    //valid, useDbOrm=true時之有效必填設定
    let valid = () => {
        return {
            useDbOrm: true,
            operOrm: async () => {},
            tableNamesExec: ['tabA'],
            authorizeExec: () => true,
            kpOrm: {},
        }
    }

    //listenerCounts, process層之三種全域監聽數(R6)
    let listenerCounts = () => {
        return [process.listenerCount('unhandledRejection'), process.listenerCount('uncaughtException'), process.listenerCount('uncaughtExceptionMonitor')]
    }

    //funcNamesOf, 起前端取得函數清單之名稱後即停止前端輪詢
    async function funcNamesOf(port) {
        let c = startClient({ port })
        try {
            let r = await c.methods
            return Object.keys(r).sort()
        }
        finally {
            c.stop()
        }
    }

    //runChildExit, 以子行程執行test/tools/child-exit.mjs, 時限內須自行結束
    function runChildExit(mode, port, fd) {
        return runChild(['test/tools/child-exit.mjs', mode, String(port), fd])
    }

    it('未給useDbOrm時不開資料通道: 建構不拋錯、可啟動, 函數清單只含kpFunExt', async function() {
        let port = portOf('api-options', 0)
        let srv = null
        try {
            srv = newServer('default', { port, kpFunExt: { add: async () => 'ok' } })
            await srv.wsrv.ready()
            assert.strict.deepEqual(await funcNamesOf(port), ['add'])
        }
        finally {
            await cleanup(srv)
        }
    })

    it('useDbOrm為非布林值時視為false', async function() {
        let port = portOf('api-options', 1)
        let srv = null
        try {
            srv = newServer('non-boolean', { port, useDbOrm: 'true', kpFunExt: { add: async () => 'ok' } })
            await srv.wsrv.ready()
            assert.strict.deepEqual(await funcNamesOf(port), ['add'])
        }
        finally {
            await cleanup(srv)
        }
    })

    it('useDbOrm=true而缺operOrm時建構即同步拋出w-serv-webdata之原訊息', async function() {
        assert.strict.deepEqual(await throwOf('no-operOrm', { ...valid(), operOrm: null }), 'invalid opt.operOrm when useDbOrm=true')
    })

    it('useDbOrm=true而缺tableNamesExec時建構即同步拋出w-serv-webdata之原訊息', async function() {
        assert.strict.deepEqual(await throwOf('no-tableNamesExec', { ...valid(), tableNamesExec: null }), 'invalid opt.tableNamesExec when useDbOrm=true')
    })

    it('useDbOrm=true而未給kpOrm時建構即同步拋錯', async function() {
        assert.strict.deepEqual(await throwOf('no-kpOrm', { ...valid(), kpOrm: null }), 'invalid opt.kpOrm when useDbOrm=true')
    })

    it('useDbOrm=true而methodsExec有給但非陣列時建構即同步拋錯', async function() {
        assert.strict.deepEqual(await throwOf('methodsExec-not-arr', { ...valid(), methodsExec: 'select' }), 'invalid opt.methodsExec when useDbOrm=true')
    })

    it('未指定useDbOrm卻給了資料通道設定時建構即同步拋錯', async function() {
        assert.strict.deepEqual(await throwOf('useDbOrm-not-given', { operOrm: async () => {} }), 'invalid opt.useDbOrm when opt.operOrm is given')
    })

    it('useDbOrm=true而缺authorizeExec時建構即同步拋錯', async function() {
        assert.strict.deepEqual(await throwOf('no-authorizeExec', { ...valid(), authorizeExec: null }), 'invalid opt.authorizeExec when useDbOrm=true')
    })

    it('useDbOrm=true而authorizeExec非函數時建構即同步拋錯', async function() {
        assert.strict.deepEqual(await throwOf('authorizeExec-not-fun', { ...valid(), authorizeExec: true }), 'invalid opt.authorizeExec when useDbOrm=true')
    })

    it('useDbOrm=true時kpFunExt與表名衝突則建構即同步拋錯', async function() {
        assert.strict.deepEqual(await throwOf('kpFunExt-conflict', { ...valid(), kpFunExt: { tabA: async () => {} } }), 'kpFunExt[tabA] conflicts with the table operations of table[tabA]')
    })

    it('useDbOrm=true時tableNamesSync含kpOrm所無之表則建構即同步拋錯', async function() {
        assert.strict.deepEqual(await throwOf('sync-missing', { ...valid(), kpOrm: { tabA: evem() }, tableNamesSync: ['tabA', 'tabX'] }), 'invalid kpOrm[tabX]')
    })

    it('同步設定錯誤拋錯後不應殘留對kpOrm之change監聽與時間戳檔', async function() {
        let fdBase = useTempFolder('options-sync-residue-base')
        try {
            let fp = `${fdBase}/tableTags.json`
            let ormA = evem()
            let msg = await throwOf('sync-residue', { ...valid(), fpTableTags: fp, kpOrm: { tabA: ormA }, tableNamesSync: ['tabA', 'tabX'] })
            assert.strict.deepEqual(msg, 'invalid kpOrm[tabX]')
            assert.strict.deepEqual(ormA.listenerCount('change'), 0)
            assert.strict.deepEqual(fs.existsSync(fp), false)
        }
        finally {
            removeTempFolder(fdBase)
        }
    })

    it('fpTableTags有給但無效時建構即同步拋錯, 不改用舊名或預設', async function() {
        assert.strict.deepEqual(await throwOf('fpTableTags-invalid', { fpTableTags: 123, fnTableTags: './tableTags-legacy.json' }), 'invalid opt.fpTableTags')
    })

    it('useDbOrm=false時kpFunExt與表名同名不拋錯', async function() {
        let port = portOf('api-options', 3)
        let srv = null
        try {
            srv = newServer('kpFunExt-no-orm', { port, useDbOrm: false, kpFunExt: { tabA: async () => 'a' } })
            await srv.wsrv.ready()
        }
        finally {
            await cleanup(srv)
        }
    })

    it('useDbOrm=true且tableNamesExec為空陣列時可啟動', async function() {
        let port = portOf('api-options', 4)
        let srv = null
        try {
            srv = newServer('empty-tables', { port, ...valid(), tableNamesExec: [] })
            await srv.wsrv.ready()
        }
        finally {
            await cleanup(srv)
        }
    })

    it('建構期間下游發出之error(暫存資料夾無法建立)應於ready完成前送達new之後立即掛上之監聽', async function() {
        let port = portOf('api-options', 5)
        let srv = null
        let fdBase = useTempFolder('options-upload-fail-base')
        try {

            //pathUploadTemp置於一般檔案之下, 使w-converhp建構時無法建立資料夾而以延後之error事件通知
            let fp = `${fdBase}/a-file`
            fs.writeFileSync(fp, 'x')
            srv = newServer('upload-fail', { port, pathUploadTemp: `${fp}/sub` })
            let errors = []
            srv.wsrv.on('error', (err) => {
                errors.push(err)
            })

            //ready之結果須晚於建構期之error
            await srv.wsrv.ready()
            assert.strict.deepEqual(errors.length, 1)
            assert.match(String(errors[0]), /^create pathUploadTemp\[.+\] error: /)

        }
        finally {
            await cleanup(srv)
            removeTempFolder(fdBase)
        }
    })

    it('建構失敗時不增加process之全域監聽', async function() {
        let before = listenerCounts()
        assert.strict.deepEqual(await throwOf('no-listener-leak', { ...valid(), authorizeExec: null }), 'invalid opt.authorizeExec when useDbOrm=true')
        assert.strict.deepEqual(listenerCounts(), before)
    })

    it('建構成功與stop皆不註冊process之全域監聽', async function() {
        let port = portOf('api-options', 6)
        let before = listenerCounts()
        let srv = null
        try {
            srv = newServer('no-process-listeners', { port })
            assert.strict.deepEqual(listenerCounts(), before)
            await srv.wsrv.ready()
        }
        finally {
            await cleanup(srv)
        }
        assert.strict.deepEqual(listenerCounts(), before)
    })

    it('import本套件伺服端與前端前後, process之三種全域監聽數不變(子行程)', async function() {
        //須於全新行程比對import之前後; 監聽數依序為uncaughtExceptionMonitor、uncaughtException、unhandledRejection(test/tools/child-import.mjs)
        let r = await runChild(['test/tools/child-import.mjs', 'src/WServHapiServer.mjs', 'src/WServHapiClient.mjs'])
        assert.strict.deepEqual(r.out.trim().split(/\r?\n/), [
            'BEFORE 0,0,0',
            'AFTER src/WServHapiServer.mjs 0,0,0',
            'AFTER src/WServHapiClient.mjs 0,0,0',
        ])
        assert.strict.deepEqual([r.exited, r.code], [true, 0])
    })

    it('apis與通訊路由衝突時伺服器不啟動, ready以該錯誤reject並發出error事件', async function() {
        let port = portOf('api-options', 7)
        let srv = null
        try {
            srv = newServer('apis-conflict', { port, apis: [{ method: 'POST', path: '/api/main', handler: () => 'x' }] })
            let errors = []
            srv.wsrv.on('error', (err) => {
                errors.push(err)
            })
            let msg = null
            await srv.wsrv.ready().catch((err) => {
                msg = err.message
            })
            assert.match(String(msg), /conflicts with existing \/api\/main/)
            assert.strict.deepEqual(errors.map((err) => err.message), [msg])
        }
        finally {
            await cleanup(srv)
        }
    })

    it('stop於啟動完成前呼叫時應等啟動結束後停止, 之後port可再被綁定', async function() {
        let port = portOf('api-options', 8)
        let before = listenerCounts()
        let srv = null
        let blocker = net.createServer()
        try {
            srv = newServer('stop-early', { port })
            await srv.wsrv.stop()
            await listen(blocker, port)
            assert.strict.deepEqual(listenerCounts(), before)
        }
        finally {
            await cleanup(srv)
            await close(blocker)
        }
    })

    it('埠被占用時ready以原錯誤reject並發出error事件, stop仍可收尾', async function() {
        let port = portOf('api-options', 9)
        let srv = null
        let blocker = net.createServer()
        try {
            await listen(blocker, port)
            srv = newServer('port-in-use', { port })
            let errors = []
            srv.wsrv.on('error', (err) => {
                errors.push(err)
            })
            let code = null
            await srv.wsrv.ready().catch((err) => {
                code = err.code
            })
            assert.strict.deepEqual(code, 'EADDRINUSE')
            assert.strict.deepEqual(errors.map((err) => err.code), ['EADDRINUSE'])
        }
        finally {
            await cleanup(srv)
            await close(blocker)
        }
    })

    it('port超出範圍時取預設值', async function() {
        let srv = null
        try {
            srv = newServer('port-invalid', { port: 70000 })
            srv.wsrv.on('error', () => {}) //預設port可能已被其他程式佔用, 本案只驗取值
            let server = await srv.wsrv.getServer()
            assert.strict.deepEqual(server.settings.port, reserved.packageDefault)
        }
        finally {
            await cleanup(srv)
        }
    })

    it('stop應釋放資料同步: 移除掛於kpOrm之change監聽, 之後資料表變更不再寫入時間戳檔', async function() {
        let port = portOf('api-options', 11)
        let ormA = evem()
        let ntg = 0
        let srv = null
        try {
            srv = newServer('clear-sync', {
                port,
                ...valid(),
                kpOrm: { tabA: ormA },
                tableNamesSync: ['tabA'],
                genTag: () => {
                    ntg += 1
                    return `tag-${ntg}`
                },
            })
            await srv.wsrv.ready()
            let fp = `${srv.fd}/tableTags.json`
            let read = () => {
                return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : ''
            }
            await waitFor(() => {
                return read() !== ''
            }, { msg: 'tableTags not written' })
            let c0 = read()

            //stop前資料表變更會寫入時間戳檔, 先確認寫入路徑存在, 使stop後之斷言不是空斷言
            ormA.emit('change')
            await waitFor(() => {
                return read() !== c0
            }, { msg: 'tableTags not updated before stop' })
            let c1 = read()

            //stop後掛於kpOrm之change監聽移除, 資料表變更不再寫入; w-sync-webdata之debounce為200ms, 等待其數倍
            assert.strict.deepEqual(ormA.listenerCount('change'), 1)
            await srv.wsrv.stop()
            assert.strict.deepEqual(ormA.listenerCount('change'), 0)
            ormA.emit('change')
            await new Promise((resolve) => {
                setTimeout(resolve, 1000)
            })
            assert.strict.deepEqual(read(), c1)

        }
        finally {
            await cleanup(srv)
        }
    })

    //以下三案與上案依序共用第11個port(各案結束時伺服器已停止)

    it('stop時尚未落檔之時間戳應寫入檔案且不推播(資料表變更後立即stop, 不等debounce)', async function() {
        //規格: @returns之stop「將尚未落檔者寫入檔案」; w-sync-webdata於變更時即產生時間戳, 落檔與推播(changeTableTags)經200ms之debounce, 釋放時取消推播並補寫
        let port = portOf('api-options', 11)
        let ormA = evem()
        let ntg = 0
        let srv = null
        try {
            srv = newServer('flush-on-stop', {
                port,
                ...valid(),
                kpOrm: { tabA: ormA },
                tableNamesSync: ['tabA'],
                genTag: () => {
                    ntg += 1
                    return `tag-${ntg}`
                },
            })
            await srv.wsrv.ready()
            let fp = `${srv.fd}/tableTags.json`
            let read = () => {
                return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : null
            }
            await waitFor(() => {
                return read() !== null
            }, { msg: 'tableTags not written' })
            let tag0 = read().tabA
            let inst = await srv.wsrv.getInstWConverServer()
            let nPush = 0
            inst.on('changeTableTags', () => {
                nPush += 1
            })

            //變更後立即stop: 新時間戳尚未落檔
            ormA.emit('change')
            await srv.wsrv.stop()
            let tag1 = read().tabA
            await new Promise((resolve) => {
                setTimeout(resolve, 400)
            })
            assert.strict.deepEqual([tag0 !== tag1, tag1, nPush], [true, `tag-${ntg}`, 0])
        }
        finally {
            await cleanup(srv)
        }
    })

    it('時間戳落檔失敗時stop發出error事件且仍resolve', async function() {
        //規格: @returns之stop「落檔失敗時發出error事件」「恆resolve」; 以stop前刪除時間戳檔所在之資料夾使補寫失敗
        let port = portOf('api-options', 11)
        let ormA = evem()
        let srv = null
        let fdTags = useTempFolder('options-flush-fail-tags')
        try {
            srv = newServer('flush-fail', {
                port,
                ...valid(),
                kpOrm: { tabA: ormA },
                tableNamesSync: ['tabA'],
                fpTableTags: `${fdTags}/tableTags.json`,
            })
            let errors = []
            srv.wsrv.on('error', (err) => {
                errors.push(err)
            })
            await srv.wsrv.ready()
            await waitFor(() => {
                return fs.existsSync(`${fdTags}/tableTags.json`)
            }, { msg: 'tableTags not written' })
            ormA.emit('change')
            removeTempFolder(fdTags)
            let resolved = false
            await srv.wsrv.stop().then(() => {
                resolved = true
            })
            assert.strict.deepEqual([resolved, errors.map((err) => err && err.msg)], [true, ['writeTableTags catch']])
        }
        finally {
            await cleanup(srv)
            removeTempFolder(fdTags)
        }
    })

    it('下游之清理拋錯時stop仍resolve, 發出error事件, 其餘清理照常且伺服器確實停止', async function() {
        //規格: @returns之stop「恆resolve，失敗時發出error事件」; R4「清理失敗以error事件轉出且不中斷其餘清理」; 以getInstWConverServer所得實體之clearBroadcast模擬拋錯(仍先照常釋放)
        let port = portOf('api-options', 11)
        let ormA = evem()
        let srv = null
        let blocker = net.createServer()
        try {
            srv = newServer('clear-throw', {
                port,
                ...valid(),
                kpOrm: { tabA: ormA },
                tableNamesSync: ['tabA'],
            })
            let errors = []
            srv.wsrv.on('error', (err) => {
                errors.push(err)
            })
            await srv.wsrv.ready()
            let inst = await srv.wsrv.getInstWConverServer()
            let clearBroadcast = inst.clearBroadcast
            inst.clearBroadcast = () => {
                clearBroadcast()
                throw new Error('clearBroadcast-boom')
            }
            assert.strict.deepEqual(ormA.listenerCount('change'), 1)
            await srv.wsrv.stop()
            assert.strict.deepEqual(errors.map((err) => err.message), ['clearBroadcast-boom'])
            assert.strict.deepEqual(ormA.listenerCount('change'), 0) //clearSync照常
            await listen(blocker, port) //伺服器已停止, port可再被綁定
        }
        finally {
            await cleanup(srv)
            await close(blocker)
        }
    })

    it('建構拋錯由使用端catch後, 行程應能自行結束(無殘留計時器)', async function() {
        let fd = useTempFolder('options-child-throw')
        try {
            let r = await runChildExit('ctor-throw', pThrow, fd)
            assert.strict.deepEqual(r.out.trim(), 'THROWN invalid opt.authorizeExec when useDbOrm=true')
            assert.strict.deepEqual([r.exited, r.code], [true, 0])
        }
        finally {
            removeTempFolder(fd)
        }
    })

    it('啟動失敗而未呼叫stop時, 行程應能自行結束(無殘留計時器)', async function() {
        let fd = useTempFolder('options-child-start-fail')
        try {
            let r = await runChildExit('start-fail', portOf('api-options', 10), fd)
            assert.strict.deepEqual(r.out.trim(), 'REJECTED EADDRINUSE')
            assert.strict.deepEqual([r.exited, r.code], [true, 0])
        }
        finally {
            removeTempFolder(fd)
        }
    })

    it('前端輪詢過後, 前端clearBroadcast與clearSync、伺服器stop之後, 行程應立即結束(無殘留之在線偵測計時器)', async function() {
        //原於w-serv-broadcast 1.1.6時, 伺服器端之在線偵測於前端輪詢後另起interval, stop後最長約10秒才清除(原已知限制L3), 1.1.7起clearBroadcast一併清除
        let fd = useTempFolder('options-child-polled-stop')
        try {
            let r = await runChildExit('polled-stop', portOf('api-options', 12), fd)
            let lines = r.out.split(/\r?\n/)
            let exitAfter = lines.filter((v) => {
                return v.startsWith('EXIT-AFTER ')
            }).map((v) => {
                return Number(v.replace('EXIT-AFTER ', ''))
            })
            assert.strict.deepEqual(lines.filter((v) => {
                return v === 'CLIENTS 1' || v === 'STOPPED'
            }), ['CLIENTS 1', 'STOPPED'])
            assert.strict.deepEqual([r.exited, r.code, exitAfter.length], [true, 0, 1])
            assert.strict.deepEqual(exitAfter[0] < 2000, true, `stop後${exitAfter[0]}ms才結束`)
        }
        finally {
            removeTempFolder(fd)
        }
    })

})
