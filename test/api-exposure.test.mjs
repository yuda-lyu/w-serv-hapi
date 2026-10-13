import assert from 'assert'
import fs from 'fs'
import WServHapiServer from '../src/WServHapiServer.mjs'
import { useTempFolder, removeTempFolder } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf } = wPorts


/**
 * 驗證曝露與存取控制之自用選項(useInert、pathStaticFiles、corsOrigins)之值域
 *
 * 規格來源: WServHapiServer之JSDoc與CLAUDE_rulebook.md之R9
 * - opt.useInert「靜態檔案不經verifyConn，即對所有連線者公開。未給(undefined或null)時取預設；有給但非布林值(如字串'false'、數值0)時建構即同步拋錯，不會退回提供，預設true」
 * - opt.pathStaticFiles「未給(undefined或null)時取預設；有給但非非空字串時不論useInert皆建構即同步拋錯，不會改為公開預設資料夾，預設'dist'」
 * - opt.corsOrigins「給予['*']代表允許外部任意網域跨域('*'須單獨出現)。給予單一字串時視為只含該網域之陣列；給予false或[](含只有空字串者)代表停用跨域：不回應CORS標頭…陣列中之空字串會被忽略。未給(undefined或null)時取預設；給予其他值時建構即同步拋錯，不會退回預設；hapi不接受之陣列(如含非字串元素、'*'與其他網域並存)由hapi於建構時同步拋錯…預設['http://localhost']」
 * - R9「檢核早於Hapi與w-converhp之建構, 拋錯時不留任何資源」: 以w-converhp建構時即建立之pathUploadTemp是否存在斷言
 *
 * 各案例之建構一律置於try內, 使建構失敗(含回歸)時仍會關閉佔埠伺服器與刪除暫存資料夾, 而以失敗呈現而非使測試行程掛住
 */
describe('api-exposure', function() {

    //pThrow, 供建構即同步拋錯之情境共用(正常情況下從未綁定)
    let pThrow = portOf('api-exposure', 0)

    //fdStatic, 供靜態檔案之資料夾, 內含a.txt
    let fdBase = null
    let fdStatic = null

    before(function() {
        fdBase = useTempFolder('exposure-base')
        fdStatic = `${fdBase}/static`
        fs.mkdirSync(fdStatic, { recursive: true })
        fs.writeFileSync(`${fdStatic}/a.txt`, 'A')
    })

    after(function() {
        removeTempFolder(fdBase)
    })

    //newServer, 直接呼叫建構子; 建構拋錯時先刪暫存資料夾再拋
    function newServer(name, extra = {}) {
        let fd = useTempFolder(`exposure-${name}`)
        try {
            let wsrv = new WServHapiServer({
                useInert: false,
                useShowLog: false,
                pathUploadTemp: `${fd}/uploadTemp`,
                fpTableTags: `${fd}/tableTags.json`,
                ...extra,
            })
            wsrv.on('error', () => {})
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

    //throwOf, 回傳建構時同步拋出之錯誤與拋錯當下pathUploadTemp是否已被建立; 未拋錯時先停掉意外啟動之伺服器再回err為null
    async function throwOf(name, extra) {
        let fd = useTempFolder(`exposure-${name}`)
        let wsrv = null
        try {
            wsrv = new WServHapiServer({
                port: pThrow,
                useInert: false,
                useShowLog: false,
                pathUploadTemp: `${fd}/uploadTemp`,
                fpTableTags: `${fd}/tableTags.json`,
                ...extra,
            })
        }
        catch (err) {
            let residue = fs.existsSync(`${fd}/uploadTemp`)
            removeTempFolder(fd)
            return { err, residue }
        }
        wsrv.on('error', () => {})
        await wsrv.stop()
        removeTempFolder(fd)
        return { err: null, residue: null }
    }

    //getStatus, 取靜態檔案之狀態碼
    async function getStatus(port, file) {
        let res = await fetch(`http://localhost:${port}/${file}`)
        await res.arrayBuffer()
        return res.status
    }

    //acaoOf, 對各來源分別以預檢(通訊路由)與實際請求(apis路由)取Access-Control-Allow-Origin
    let origins = ['http://localhost', 'http://a.example', 'http://evil.example']
    async function acaoOf(port) {
        let r = {}
        for (let origin of origins) {
            let pre = await fetch(`http://localhost:${port}/api/main`, {
                method: 'OPTIONS',
                headers: {
                    'Origin': origin,
                    'Access-Control-Request-Method': 'POST',
                    'Access-Control-Request-Headers': 'content-type',
                },
            })
            await pre.arrayBuffer()
            let act = await fetch(`http://localhost:${port}/ping`, {
                headers: {
                    'Origin': origin,
                },
            })
            await act.arrayBuffer()
            r[origin] = [pre.headers.get('access-control-allow-origin'), act.headers.get('access-control-allow-origin')]
        }
        return r
    }

    //expectAcao, 各來源之預檢與實際請求皆應得相同之ACAO; allowed為被允許之來源清單, 被允許者ACAO為該來源, 其餘為null
    function expectAcao(allowed) {
        let r = {}
        for (let origin of origins) {
            let v = allowed.includes(origin) ? origin : null
            r[origin] = [v, v]
        }
        return r
    }

    //ping, 供實際請求之apis路由(與通訊路由共用伺服器層之cors設定)
    let ping = [{ method: 'GET', path: '/ping', handler: () => 'pong' }]

    describe('useInert', function() {

        it('未給時取預設true: 公開pathStaticFiles下之檔案', async function() {
            let port = portOf('api-exposure', 1)
            let srv = null
            try {
                srv = newServer('useInert-undefined', { port, useInert: undefined, pathStaticFiles: fdStatic })
                await srv.wsrv.ready()
                assert.strict.deepEqual(await getStatus(port, 'a.txt'), 200)
            }
            finally {
                await cleanup(srv)
            }
        })

        it('給予null時視為未給而取預設true', async function() {
            let port = portOf('api-exposure', 2)
            let srv = null
            try {
                srv = newServer('useInert-null', { port, useInert: null, pathStaticFiles: fdStatic })
                await srv.wsrv.ready()
                assert.strict.deepEqual(await getStatus(port, 'a.txt'), 200)
            }
            finally {
                await cleanup(srv)
            }
        })

        it('給予false時不公開', async function() {
            let port = portOf('api-exposure', 3)
            let srv = null
            try {
                srv = newServer('useInert-false', { port, useInert: false, pathStaticFiles: fdStatic })
                await srv.wsrv.ready()
                assert.strict.deepEqual(await getStatus(port, 'a.txt'), 404)
            }
            finally {
                await cleanup(srv)
            }
        })

        it('有給但非布林值時建構即同步拋錯, 不退回公開且無殘留', async function() {
            let vs = ['false', 'true', 0, 1, {}]
            for (let i = 0; i < vs.length; i++) {
                let { err, residue } = await throwOf(`useInert-invalid-${i}`, { useInert: vs[i], pathStaticFiles: fdStatic })
                assert.strict.deepEqual([err && err.message, residue], ['invalid opt.useInert', false], `useInert[${JSON.stringify(vs[i])}]`)
            }
        })

    })

    describe('pathStaticFiles', function() {

        it('給予null時視為未給而取預設dist', async function() {
            let port = portOf('api-exposure', 4)
            let srv = null
            try {
                //預設資料夾dist為本套件之建置產物, 以package.json之main所指檔案驗證確實公開
                let fn = JSON.parse(fs.readFileSync('./package.json', 'utf8')).main.replace('dist/', '')
                srv = newServer('pathStaticFiles-null', { port, useInert: true, pathStaticFiles: null })
                await srv.wsrv.ready()
                assert.strict.deepEqual(await getStatus(port, fn), 200)
            }
            finally {
                await cleanup(srv)
            }
        })

        it('有給但非非空字串時不論useInert皆建構即同步拋錯, 不改公開預設資料夾且無殘留', async function() {
            let cases = [
                [true, ''],
                [true, 123],
                [true, {}],
                [false, ''],
                [false, 123],
            ]
            for (let i = 0; i < cases.length; i++) {
                let [useInert, pathStaticFiles] = cases[i]
                let { err, residue } = await throwOf(`pathStaticFiles-invalid-${i}`, { useInert, pathStaticFiles })
                assert.strict.deepEqual([err && err.message, residue], ['invalid opt.pathStaticFiles', false], `useInert[${useInert}] pathStaticFiles[${JSON.stringify(pathStaticFiles)}]`)
            }
        })

    })

    describe('corsOrigins', function() {

        //各值與其應允許之來源; 第3欄為使用之port索引
        let cases = [
            ['未給時取預設, 只允許http://localhost', undefined, ['http://localhost'], 5],
            ['給予false代表停用跨域, 任何來源皆無CORS標頭', false, [], 6],
            ['給予空陣列代表停用跨域', [], [], 7],
            ['給予只有空字串之陣列代表停用跨域', [''], [], 8],
            ['給予空字串代表停用跨域(視為只含空字串之陣列)', '', [], 9],
            ['給予單一字串時視為只含該網域之陣列', 'http://a.example', ['http://a.example'], 10],
            ['給予字串*時允許任意網域', '*', origins, 11],
            ['陣列中之空字串會被忽略', ['', 'http://a.example'], ['http://a.example'], 12],
        ]
        for (let [title, corsOrigins, allowed, k] of cases) {
            it(title, async function() {
                let port = portOf('api-exposure', k)
                let srv = null
                try {
                    srv = newServer(`cors-${k}`, { port, corsOrigins, apis: ping })
                    await srv.wsrv.ready()
                    assert.strict.deepEqual(await acaoOf(port), expectAcao(allowed))
                }
                finally {
                    await cleanup(srv)
                }
            })
        }

        it('給予其他型別時建構即同步拋錯, 不退回預設且無殘留', async function() {
            let vs = [true, 123, {}, () => {}]
            for (let i = 0; i < vs.length; i++) {
                let { err, residue } = await throwOf(`cors-invalid-${i}`, { corsOrigins: vs[i] })
                assert.strict.deepEqual([err && err.message, residue], ['invalid opt.corsOrigins', false], `corsOrigins[${String(vs[i])}]`)
            }
        })

        it('hapi不接受之陣列由hapi於建構時同步拋錯, 訊息原樣且無殘留', async function() {
            let r = await throwOf('cors-hapi-star', { corsOrigins: ['*', 'http://a.example'] })
            assert.strict.deepEqual([r.err && r.err.message, r.residue], ['Cannot specify cors.origin * together with other values', false])
            for (let v of [[123], [null]]) {
                let { err, residue } = await throwOf('cors-hapi-type', { corsOrigins: v })
                assert.strict.deepEqual([err instanceof TypeError, residue], [true, false], `corsOrigins[${JSON.stringify(v)}]`)
            }
        })

    })

})
