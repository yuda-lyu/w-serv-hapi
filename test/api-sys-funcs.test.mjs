import assert from 'assert'
import WConverhpClient from 'w-converhp/src/WConverhpClient.mjs'
import WServHapiServer from '../src/WServHapiServer.mjs'
import { waitFor, startServer, startClient, useTempFolder, removeTempFolder } from './tools/api-setup.mjs'
import wPorts from './tools/ports.mjs'

let { portOf } = wPorts


/**
 * 驗證系統函數([sys:getFuncList]、[sys:getTableTags]、[sys:polling])之身分關卡opt.sysFuncsPublic經本套件原樣轉傳w-serv-webdata後之行為
 *
 * 規格來源: WServHapiServer之opt.sysFuncsPublic與opt.getUserIdByToken(身分驗證責任)
 *   (1) 未給(undefined或null)時三者皆公開, 相容既有行為: 無token者、已發布之舊前端元件(輪詢不帶__sysToken__)皆可綁定、同步並收推播
 *   (2) 列於其中者getUserIdByToken得空字串亦放行, 未列者須得非空字串, 否則拒絕(呼叫回應permission denied, 輪詢前端只見固定訊息'[sys:polling] permission denied', 原因經error事件供稽核)
 *   (3) getUserIdByToken拋錯或reject一律拒絕(含列於其中者): 呼叫回應其值, 輪詢前端只見固定訊息, 伺服端error事件含其值
 *   (4) 建議設為只公開['[sys:getFuncList]']: 無有效身分者取不到同步表時間戳與廣播, 有效token者正常; 空陣列則連函數名稱清單亦須身分; 建構後修改原陣列不生效
 *   (5) 有給但非陣列或元素非三個系統函數名之一時建構即同步拋錯; 與useDbOrm無關
 *   (6) 輪詢之身分與clientId綁定: 同一前端連線中途換成他人身分(或無身分與有身分互換)會被拒絕, 重建前端連線(新clientId)則正常; 同一使用者換另一枚token不受影響
 *
 * 表操作之授權與系統函數之關卡無關, 故本檔之authorizeExec對select放行所有身分, 同步表資料之有無只取決於系統函數之關卡
 * 下層自身之邊界(非字串token或userId之轉換、被拒絕輪詢不建立在線身分與佇列、停止路徑)由w-serv-webdata與w-serv-broadcast單一擁有並測試(規則帳本R1、R13), 本檔不重複
 */
describe('api-sys-funcs', function() {
    let portDef = portOf('api-sys-funcs', 0) //未給sysFuncsPublic
    let portStrict = portOf('api-sys-funcs', 1) //['[sys:getFuncList]']
    let portMid = portOf('api-sys-funcs', 2) //['[sys:getFuncList]', '[sys:getTableTags]']
    let portEmpty = portOf('api-sys-funcs', 3) //[]
    let portPoll = portOf('api-sys-funcs', 4) //['[sys:polling]']
    let portPerm = portOf('api-sys-funcs', 5) //未給sysFuncsPublic, getUserIdByToken對空token拒絕(fail-closed)
    let portNoOrm = portOf('api-sys-funcs', 6) //['[sys:getFuncList]'], 不開資料通道(useDbOrm未指定)
    let portCheck = portOf('api-sys-funcs', 7) //建構即同步拋錯與null之情境共用

    let funcList = '[sys:getFuncList]'
    let funcTags = '[sys:getTableTags]'
    let funcPolling = '[sys:polling]'

    //tokens, 有效token與其userId; 其餘token(含空字串)視為無身分(getUserIdByToken回空字串); token-revoked模擬驗證失敗(reject)
    let tokens = {
        'token-admin': 'id-for-admin',
        'token-admin2': 'id-for-admin', //同一使用者之另一枚token
        'token-other': 'id-for-other',
    }
    let errRevoked = 'errTokenRevoked'
    let errEmptyToken = 'errEmptyToken'
    let lookup = async (t) => {
        if (t === 'token-revoked') {
            throw errRevoked
        }
        return Object.prototype.hasOwnProperty.call(tokens, t) ? tokens[t] : ''
    }

    //pollingDenied, 輪詢被拒絕之伺服端error事件({ msg, err })
    let pollingDenied = (err) => {
        return { msg: '[sys:polling] permission denied', err }
    }

    //revokedErrs, 三個系統函數各以token-revoked呼叫一次之伺服端error事件: 呼叫為其拒絕值, 輪詢為{ msg: '[sys:polling] verifyPolling error', err }
    let revokedErrs = [
        errRevoked,
        errRevoked,
        { msg: '[sys:polling] verifyPolling error', err: errRevoked },
    ]

    let seed = {
        tabA: [
            { id: 'id-tabA-peter', name: 'peter', value: 'v-seed' },
        ],
    }

    //cleans, 伺服器之清理; clients, 本案建立之前端(afterEach停止, 避免斷言失敗時殘留而干擾後續案)
    let cleans = []
    let clients = []

    //mkServer, 起伺服器(開資料通道)並以被動觀察者記錄收到之輪詢輸入(僅記鍵名與clientId, 不結算pm)
    let mkServer = async (name, port, optServer) => {
        let srv = await startServer({
            name,
            port,
            seed,
            authorizeExec: ({ methodName }) => {
                return methodName === 'select'
            },
            optServer: {
                getUserIdByToken: lookup,
                ...optServer,
            },
        })
        let seen = []
        let inst = await srv.wsrv.getInstWConverServer()
        inst.on('execute', (func, input) => {
            if (func === funcPolling) {
                seen.push({ keys: Object.keys(input).sort().join(','), clientId: input.clientId })
            }
        })
        cleans.push(() => {
            return srv.stop()
        })
        return { srv, seen }
    }

    //mkServerNoOrm, 起不開資料通道之伺服器(useDbOrm未指定, 系統函數仍存在)
    let mkServerNoOrm = async (name, port, optServer) => {
        let fd = useTempFolder(name)
        let wsrv = new WServHapiServer({
            port,
            apis: [],
            useInert: false,
            useShowLog: false,
            pathUploadTemp: `${fd}/uploadTemp`,
            fpTableTags: `${fd}/tableTags.json`,
            getUserIdByToken: lookup,
            ...optServer,
        })
        let errors = []
        wsrv.on('error', (err) => {
            errors.push(err)
        })
        await wsrv.ready()
        cleans.push(async () => {
            await wsrv.stop()
            removeTempFolder(fd)
        })
        return { srv: { wsrv, errors }, seen: [] }
    }

    //mkClient, 起前端(retryMain=0不重試, 避免重試訊息混入輸出), bound為是否已取得函數清單(綁定$fapi), clientId為此前端輪詢所用之clientId(經通訊物件之execute取得)
    //oldFront為true時模擬已發布之舊前端元件: 輪詢輸入剝除__sysToken__而恰為{ clientId }(其餘請求照常帶token)
    //  作法: useWaitToken使資料同步延至建構子回傳後才建立, 故可於其前換掉通訊物件之execute
    let mkClient = ({ port, getToken, oldFront = false }) => {
        let c = startClient({
            port,
            optClient: {
                retryMain: 0,
                getToken,
                ...(oldFront ? { useWaitToken: true } : {}),
            },
        })
        let execute = c.cli.execute
        c.cli.execute = function(func, input, ...rest) {
            if (func === funcPolling) {
                c.clientId = input.clientId
                if (oldFront) {
                    input = { clientId: input.clientId }
                }
            }
            return execute.call(this, func, input, ...rest)
        }
        c.clientId = null
        c.bound = false
        c.methods.then((fapi) => {
            c.bound = true
            c.fapi = fapi
        })
        clients.push(c)
        return c
    }

    //valuesOfRecv, 取前端各次收到之tabA資料中peter之值
    let valuesOfRecv = (c) => {
        return c.recvs
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

    //sleep
    let sleep = (ms) => {
        return new Promise((resolve) => {
            setTimeout(resolve, ms)
        })
    }

    //judge, 依函數與回應判定'allow'(放行)、'deny'(以固定訊息拒絕)、'reject:<值>'(以getUserIdByToken之拒絕值拒絕)或'unexpected: ...'
    let judge = (func, r) => {
        if (func === funcPolling) {
            if (r.ok && Array.isArray(r.v)) {
                return 'allow'
            }
            if (!r.ok && r.err === '[sys:polling] permission denied') {
                return 'deny' //輪詢無論空身分或反查拋錯, 前端皆只見固定訊息
            }
        }
        else {
            if (r.ok && r.v && r.v.state === 'success') {
                return 'allow'
            }
            if (r.ok && r.v && r.v.state === 'error') {
                return r.v.msg === 'permission denied' ? 'deny' : `reject:${r.v.msg}`
            }
        }
        return `unexpected: ${JSON.stringify(r)}`
    }

    //rawCall, 直接以WConverhpClient.execute呼叫系統函數(不經前端元件, 不重試), 每次使用新的clientId
    let nRaw = 0
    let rawCall = async (port, func, token) => {
        let cl = new WConverhpClient({ url: `http://localhost:${port}`, retryMain: 0 })
        cl.on('error', () => {})
        nRaw += 1
        let input = func === funcPolling ? { clientId: `raw-${nRaw}`, __sysToken__: token } : { __sysInputArgs__: [], __sysToken__: token }
        let r = null
        try {
            r = { ok: true, v: await cl.execute(func, input) }
        }
        catch (err) {
            r = { ok: false, err }
        }
        return judge(func, r)
    }

    //matrixOf, 各系統函數對四種token(無token、無效token、有效token、驗證失敗)之結果
    let matrixOf = async (port, funcs = [funcList, funcTags, funcPolling]) => {
        let r = {}
        for (let func of funcs) {
            r[func] = []
            for (let token of ['', 'token-bad', 'token-admin', 'token-revoked']) {
                r[func].push(await rawCall(port, func, token))
            }
        }
        return r
    }

    //errsOf, 取伺服端error事件之排序後JSON字串陣列(與順序無關)
    let errsOf = (errors) => {
        return errors.map((e) => {
            return JSON.stringify(e)
        }).sort()
    }

    //checkMatrix, 直打各系統函數之結果(expMatrix)與期間伺服端新增之error事件(expErrs, 無多無少)
    let checkMatrix = async (s, port, expMatrix, expErrs) => {
        let n = s.srv.errors.length
        let r = await matrixOf(port, Object.keys(expMatrix))
        assert.strict.deepEqual(r, expMatrix)
        let expected = errsOf(expErrs)
        await waitFor(() => s.srv.errors.length - n >= expected.length, { msg: 'error events timeout' })
        await sleep(200) //再等一小段, 使多發之事件現形
        assert.strict.deepEqual(errsOf(s.srv.errors.slice(n)), expected)
    }

    //nDenied, 自第n則起, 伺服端見到之輪詢被拒絕事件(原因為err)之則數
    let nDenied = (s, n, err) => {
        let key = JSON.stringify(pollingDenied(err))
        return errsOf(s.srv.errors.slice(n)).filter((v) => {
            return v === key
        }).length
    }

    //checkSwitchDenied, 同一前端連線中途由token from換成token to, 輪詢被拒絕(伺服端原因為reason, 前端只見固定訊息), 被拒絕期間表變更不送達;
    //  rebuild為true時再重建前端連線(新clientId)以token to: 可綁定並同步到最新資料
    let checkSwitchDenied = async (s, port, tag, { from, to, reason, rebuild }) => {
        let token = from
        let c1 = mkClient({ port, getToken: () => token })
        await waitFor(() => c1.bound, { msg: `${tag}: c1 bound timeout`, timeout: 20000 })
        await waitFor(() => valuesOfRecv(c1).length > 0, { msg: `${tag}: c1 initial sync timeout`, timeout: 20000 })

        //換token後: 伺服端見到原因, 前端見到固定訊息(兩者分別等待, 不以其中一方推定另一方已完成)
        let n = s.srv.errors.length
        token = to
        await waitFor(() => nDenied(s, n, reason) > 0, { msg: `${tag}: denial reason[${reason}] timeout`, timeout: 20000 })
        await waitFor(() => c1.errors.includes('[sys:polling] permission denied'), { msg: `${tag}: c1 fixed message timeout`, timeout: 20000 })

        //被拒絕期間表變更不送達此前端: 以「變更之後又有一輪輪詢被拒絕」為觀察屏障(證明已經歷完整一輪, 而非固定等待)
        let value = `v-${tag}-switch`
        await s.srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value })
        let nd = nDenied(s, n, reason)
        await waitFor(() => nDenied(s, n, reason) > nd, { msg: `${tag}: next denied polling timeout`, timeout: 20000 })
        assert.strict.equal(valuesOfRecv(c1).includes(value), false)
        c1.stop()

        if (rebuild) {
            let c2 = mkClient({ port, getToken: () => to })
            await waitFor(() => c2.bound, { msg: `${tag}: c2 bound timeout`, timeout: 20000 })
            await waitFor(() => valuesOfRecv(c2).includes(value), { msg: `${tag}: c2 initial sync timeout`, timeout: 20000 })
            c2.stop()
            assert.strict.deepEqual(c2.errors, [])
        }
    }

    //checkSwitchAllowed, 同一使用者換另一枚token: 輪詢不受影響(歸屬以userId而非token), 表變更照常送達, 無error
    let checkSwitchAllowed = async (s, port, tag, { from, to }) => {
        let token = from
        let n = s.srv.errors.length
        let c = mkClient({ port, getToken: () => token })
        await waitFor(() => c.bound, { msg: `${tag}: bound timeout`, timeout: 20000 })
        await waitFor(() => valuesOfRecv(c).length > 0, { msg: `${tag}: initial sync timeout`, timeout: 20000 })
        token = to
        let value = `v-${tag}-switch`
        await s.srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value })
        await waitFor(() => valuesOfRecv(c).includes(value), { msg: `${tag}: pushed change timeout`, timeout: 20000 })
        c.stop()
        assert.strict.deepEqual(c.errors, [])
        assert.strict.deepEqual(s.srv.errors.slice(n), [])
    }

    let sv = {}

    //arrEmpty, 以空陣列建構後再於外部修改, 驗證建構後修改原陣列不生效
    let arrEmpty = []

    before(async function() {
        sv.def = await mkServer('sys-funcs-def', portDef, {}) //不給sysFuncsPublic
        sv.strict = await mkServer('sys-funcs-strict', portStrict, { sysFuncsPublic: [funcList] })
        sv.mid = await mkServer('sys-funcs-mid', portMid, { sysFuncsPublic: [funcList, funcTags] })
        sv.empty = await mkServer('sys-funcs-empty', portEmpty, { sysFuncsPublic: arrEmpty })
        arrEmpty.push(funcList, funcTags, funcPolling)
        sv.poll = await mkServer('sys-funcs-poll', portPoll, { sysFuncsPublic: [funcPolling] })

        //perm型: 未給sysFuncsPublic, getUserIdByToken對空token拒絕(fail-closed), 記錄收到之token
        sv.permCalls = []
        sv.perm = await mkServer('sys-funcs-perm', portPerm, {
            getUserIdByToken: async (t) => {
                sv.permCalls.push(t)
                if (t === '') {
                    throw errEmptyToken //拒絕值為字串(下游以字串作語系鍵), 同errRevoked
                }
                return lookup(t)
            },
        })

        //不開資料通道(useDbOrm未指定)
        sv.noOrm = await mkServerNoOrm('sys-funcs-noorm', portNoOrm, { sysFuncsPublic: [funcList] })
    })

    afterEach(function() {
        for (let c of clients.splice(0)) {
            c.stop()
        }
    })

    after(async function() {
        let errs = []
        for (let f of cleans.reverse()) {
            try {
                await f()
            }
            catch (err) {
                errs.push(err) //一項清理失敗不中止其餘清理
            }
        }
        if (errs.length > 0) {
            throw errs[0]
        }
    })

    describe('未給sysFuncsPublic(預設): 三者皆公開, 舊行為不變', function() {

        it('無token與無效token者三個系統函數皆放行, 有效token亦放行; 驗證失敗(reject)者一律拒絕', async function() {
            //規格(1)(3): 未給時三者皆公開, getUserIdByToken得空字串亦放行; 拋錯或reject一律拒絕(含公開者)
            await checkMatrix(sv.def, portDef, {
                [funcList]: ['allow', 'allow', 'allow', `reject:${errRevoked}`],
                [funcTags]: ['allow', 'allow', 'allow', `reject:${errRevoked}`],
                [funcPolling]: ['allow', 'allow', 'allow', 'deny'],
            }, revokedErrs)
        })

        it('無token之前端(getToken回空字串)可綁定, 同步表資料到達, 表變更後收到推播', async function() {
            //規格(1): 無token者可綁定、同步並收推播
            let n = sv.def.srv.errors.length
            let c = mkClient({ port: portDef, getToken: () => '' })
            await waitFor(() => c.bound, { msg: 'anonymous client bound timeout', timeout: 20000 })
            await waitFor(() => valuesOfRecv(c).length > 0, { msg: 'initial sync timeout', timeout: 20000 })
            await sv.def.srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value: 'v-def-1' })
            await waitFor(() => valuesOfRecv(c).includes('v-def-1'), { msg: 'pushed change timeout', timeout: 20000 })
            c.stop()
            assert.strict.deepEqual(c.errors, [])
            assert.strict.deepEqual(sv.def.srv.errors.slice(n), [])
        })

        it('舊前端元件(輪詢不帶__sysToken__)可綁定, 同步表資料到達, 表變更後收到推播', async function() {
            //規格(1): 已發布之舊前端元件相容; 夾具確認伺服端所見之輪詢輸入恰為{ clientId }
            let n = sv.def.srv.errors.length
            let c = mkClient({ port: portDef, getToken: () => 'token-admin', oldFront: true })
            await waitFor(() => c.bound, { msg: 'old front bound timeout', timeout: 20000 })
            await waitFor(() => valuesOfRecv(c).length > 0, { msg: 'old front initial sync timeout', timeout: 20000 })
            await sv.def.srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value: 'v-def-2' })
            await waitFor(() => valuesOfRecv(c).includes('v-def-2'), { msg: 'old front pushed change timeout', timeout: 20000 })
            c.stop()
            assert.strict.ok(c.clientId, '夾具應已取得此前端之clientId')
            let mine = sv.def.seen.filter((s) => {
                return s.clientId === c.clientId
            })
            assert.strict.ok(mine.length > 0, '伺服端應見到此前端之輪詢')
            assert.strict.deepEqual(mine.map((s) => s.keys), mine.map(() => 'clientId'), '輪詢輸入應恰為{ clientId }(夾具有效)')
            assert.strict.deepEqual(c.errors, [])
            assert.strict.deepEqual(sv.def.srv.errors.slice(n), [])
        })

        it('同一前端連線中途換成他人身分之輪詢於預設下亦被拒絕(歸屬與sysFuncsPublic無關), 重建前端連線後正常', async function() {
            //規格(6): 公開只放寬空身分, 不放寬歸屬
            await checkSwitchDenied(sv.def, portDef, 'def-other', { from: 'token-admin', to: 'token-other', reason: 'clientId belongs to another userId', rebuild: true })
        })

        it('同一前端連線由無身分變有身分之輪詢於預設下被拒絕(匿名亦被綁定), 重建前端連線後正常', async function() {
            //規格(6): 無身分與有身分互換亦屬換身分
            await checkSwitchDenied(sv.def, portDef, 'def-login', { from: '', to: 'token-admin', reason: 'clientId belongs to another userId', rebuild: true })
        })

        it('同一使用者換另一枚token之輪詢不受影響, 表變更照常送達', async function() {
            //規格(6): 歸屬以userId而非token
            await checkSwitchAllowed(sv.def, portDef, 'def-same-user', { from: 'token-admin', to: 'token-admin2' })
        })

    })

    describe('sysFuncsPublic只公開[sys:getFuncList](建議之嚴格設定)', function() {

        it('無token與無效token者之[sys:getTableTags]、[sys:polling]被拒絕而[sys:getFuncList]放行, 有效token三者皆放行, 被拒絕者於伺服端發出error事件', async function() {
            //規格(2)(3)(4): 未列者須得非空字串; 列於其中者空字串亦放行; 拒絕之原因經error事件供稽核
            //  呼叫為{ msg: 'permission denied', func }, 輪詢為{ msg: '[sys:polling] permission denied', err: 'empty userId' }; 無token與無效token各兩則
            await checkMatrix(sv.strict, portStrict, {
                [funcList]: ['allow', 'allow', 'allow', `reject:${errRevoked}`],
                [funcTags]: ['deny', 'deny', 'allow', `reject:${errRevoked}`],
                [funcPolling]: ['deny', 'deny', 'allow', 'deny'],
            }, [
                { msg: 'permission denied', func: funcTags },
                { msg: 'permission denied', func: funcTags },
                pollingDenied('empty userId'),
                pollingDenied('empty userId'),
                ...revokedErrs,
            ])
        })

        it('無token之前端不綁定, 收不到同步表資料與推播, 前端發出輪詢被拒絕之error', async function() {
            //規格(4): 無有效身分者取不到同步表時間戳與廣播
            let n = sv.strict.srv.errors.length
            let c = mkClient({ port: portStrict, getToken: () => '' })
            await waitFor(() => c.errors.includes('[sys:polling] permission denied'), { msg: 'client polling denied error timeout', timeout: 20000 })
            await sv.strict.srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value: 'v-strict-anon' })
            let nd = nDenied(sv.strict, n, 'empty userId')
            await waitFor(() => nDenied(sv.strict, n, 'empty userId') > nd, { msg: 'next denied polling timeout', timeout: 20000 }) //變更之後又經歷一輪被拒絕之輪詢
            c.stop()
            assert.strict.equal(c.bound, false)
            assert.strict.deepEqual(c.recvs, [])
        })

        it('舊前端元件(輪詢不帶__sysToken__)被拒絕而不綁定', async function() {
            //規格(2)(4): 輪詢未帶token者以空身分處理, 未公開即拒絕(原因empty userId); 夾具確認輪詢輸入恰為{ clientId }
            let n = sv.strict.srv.errors.length
            let c = mkClient({ port: portStrict, getToken: () => 'token-admin', oldFront: true })
            await waitFor(() => c.errors.includes('[sys:polling] permission denied'), { msg: 'old front polling denied error timeout', timeout: 20000 })
            await waitFor(() => nDenied(sv.strict, n, 'empty userId') > 0, { msg: 'old front server error timeout' })
            c.stop()
            assert.strict.ok(c.clientId, '夾具應已取得此前端之clientId')
            let mine = sv.strict.seen.filter((s) => {
                return s.clientId === c.clientId
            })
            assert.strict.ok(mine.length > 0, '伺服端應見到此前端之輪詢')
            assert.strict.deepEqual(mine.map((s) => s.keys), mine.map(() => 'clientId'), '輪詢輸入應恰為{ clientId }(夾具有效)')
            assert.strict.equal(c.bound, false)
            assert.strict.deepEqual(c.recvs, [])
        })

        it('有效token之前端可綁定, 同步表資料到達, 表變更後收到推播', async function() {
            //規格(4): 有效token者正常
            let n = sv.strict.srv.errors.length
            let c = mkClient({ port: portStrict, getToken: () => 'token-admin' })
            await waitFor(() => c.bound, { msg: 'valid token client bound timeout', timeout: 20000 })
            await waitFor(() => valuesOfRecv(c).length > 0, { msg: 'initial sync timeout', timeout: 20000 })
            await sv.strict.srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value: 'v-strict-admin' })
            await waitFor(() => valuesOfRecv(c).includes('v-strict-admin'), { msg: 'pushed change timeout', timeout: 20000 })
            c.stop()
            assert.strict.deepEqual(c.errors, [])
            assert.strict.deepEqual(sv.strict.srv.errors.slice(n), [])

            //對照夾具: 本版前端元件之輪詢輸入含__sysToken__(舊前端元件夾具之輸入不含, 見上一案)
            let mine = sv.strict.seen.filter((s) => {
                return s.clientId === c.clientId
            })
            assert.strict.ok(mine.length > 0, '伺服端應見到此前端之輪詢')
            assert.strict.deepEqual(mine.map((s) => s.keys), mine.map(() => '__sysToken__,clientId'))
        })

        it('同一前端連線中途換成他人身分之輪詢被拒絕, 重建前端連線(新clientId)後正常', async function() {
            //規格(6): 輪詢之身分與clientId綁定; 換身分請重建前端連線
            await checkSwitchDenied(sv.strict, portStrict, 'strict-other', { from: 'token-admin', to: 'token-other', reason: 'clientId belongs to another userId', rebuild: true })
        })

        it('同一前端連線由有身分變無身分之輪詢被拒絕(原因為empty userId, 不待歸屬解除)', async function() {
            //規格(2)(6): 嚴格設定下無身分先被關卡拒絕, 不進歸屬檢查; 重建為無身分之前端仍被拒絕(不重建)
            await checkSwitchDenied(sv.strict, portStrict, 'strict-logout', { from: 'token-admin', to: '', reason: 'empty userId', rebuild: false })
        })

    })

    describe('sysFuncsPublic為其他子集', function() {

        it('公開[sys:getFuncList]與[sys:getTableTags]: 無token者之[sys:polling]被拒絕, 其餘放行', async function() {
            //規格(2): 列於其中者空字串亦放行, 未列者拒絕; 實際轉傳所給之陣列而非固定某一組
            await checkMatrix(sv.mid, portMid, {
                [funcList]: ['allow', 'allow', 'allow', `reject:${errRevoked}`],
                [funcTags]: ['allow', 'allow', 'allow', `reject:${errRevoked}`],
                [funcPolling]: ['deny', 'deny', 'allow', 'deny'],
            }, [
                pollingDenied('empty userId'),
                pollingDenied('empty userId'),
                ...revokedErrs,
            ])
        })

        it('公開[sys:getFuncList]與[sys:getTableTags]: 無token之前端因輪詢被拒絕而不綁定(元件須先輪詢成功才取清單與時間戳)', async function() {
            //規格(2)(4): 前端表之啟動順序分歧——清單與時間戳公開、輪詢私有者, 匿名前端仍不綁定
            let n = sv.mid.srv.errors.length
            let c = mkClient({ port: portMid, getToken: () => '' })
            await waitFor(() => nDenied(sv.mid, n, 'empty userId') > 0, { msg: 'polling denied timeout', timeout: 20000 })
            let nd = nDenied(sv.mid, n, 'empty userId')
            await waitFor(() => nDenied(sv.mid, n, 'empty userId') > nd, { msg: 'next denied polling timeout', timeout: 20000 })
            c.stop()
            assert.strict.equal(c.bound, false)
            assert.strict.deepEqual(c.recvs, [])
        })

        it('空陣列: 三個系統函數對無token者皆被拒絕(含函數名稱清單), 且建構後修改原陣列不生效', async function() {
            //規格(4): 空陣列則連函數名稱清單亦須身分(不可被視為未給而退回預設); 建構後(before內)已對原陣列push三者, 結果仍為全部須身分
            await checkMatrix(sv.empty, portEmpty, {
                [funcList]: ['deny', 'deny', 'allow', `reject:${errRevoked}`],
                [funcTags]: ['deny', 'deny', 'allow', `reject:${errRevoked}`],
                [funcPolling]: ['deny', 'deny', 'allow', 'deny'],
            }, [
                { msg: 'permission denied', func: funcList },
                { msg: 'permission denied', func: funcList },
                { msg: 'permission denied', func: funcTags },
                { msg: 'permission denied', func: funcTags },
                pollingDenied('empty userId'),
                pollingDenied('empty userId'),
                ...revokedErrs,
            ])
            assert.strict.deepEqual(arrEmpty, [funcList, funcTags, funcPolling], '夾具: 原陣列確實已被修改')
        })

        it('只公開[sys:polling]: 無token者之[sys:getFuncList]與[sys:getTableTags]被拒絕, 輪詢放行', async function() {
            //規格(2): 各函數獨立以是否列於陣列判定
            await checkMatrix(sv.poll, portPoll, {
                [funcList]: ['deny', 'deny', 'allow', `reject:${errRevoked}`],
                [funcTags]: ['deny', 'deny', 'allow', `reject:${errRevoked}`],
                [funcPolling]: ['allow', 'allow', 'allow', 'deny'],
            }, [
                { msg: 'permission denied', func: funcList },
                { msg: 'permission denied', func: funcList },
                { msg: 'permission denied', func: funcTags },
                { msg: 'permission denied', func: funcTags },
                ...revokedErrs,
            ])
        })

        it('只公開[sys:polling]: 無token之前端輪詢成功但取不到函數清單而不綁定', async function() {
            //規格(2)(4): 前端表之啟動順序分歧——輪詢公開、清單私有者, 匿名前端輪詢成功卻不綁定
            let n = sv.poll.srv.errors.length
            let c = mkClient({ port: portPoll, getToken: () => '' })
            await waitFor(() => sv.poll.srv.errors.slice(n).some((e) => e && e.msg === 'permission denied' && e.func === funcList), { msg: 'getFuncList denied timeout', timeout: 20000 })
            await waitFor(() => c.clientId !== null, { msg: 'clientId timeout', timeout: 20000 }) //輪詢已送出(夾具取得其clientId)
            c.stop()
            assert.strict.equal(c.bound, false)
            assert.strict.deepEqual(c.recvs, [])
            assert.strict.equal(nDenied(sv.poll, n, 'empty userId'), 0, '輪詢本身被放行')
        })

    })

    describe('getUserIdByToken對空token拒絕(fail-closed)之部署(perm型), 未給sysFuncsPublic', function() {

        it('舊前端元件(輪詢不帶__sysToken__)可綁定、同步並收推播, 輪詢不以空token反查', async function() {
            //規格(1): 預設相容; 缺鍵之輪詢未出示token, 以空身分處理而不反查, 故即使getUserIdByToken對空token拒絕亦不失敗
            let n = sv.perm.srv.errors.length
            let nCalls = sv.permCalls.length
            let c = mkClient({ port: portPerm, getToken: () => 'token-admin', oldFront: true })
            await waitFor(() => c.bound, { msg: 'old front bound timeout', timeout: 20000 })
            await waitFor(() => valuesOfRecv(c).length > 0, { msg: 'old front initial sync timeout', timeout: 20000 })
            await sv.perm.srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value: 'v-perm-1' })
            await waitFor(() => valuesOfRecv(c).includes('v-perm-1'), { msg: 'old front pushed change timeout', timeout: 20000 })
            c.stop()
            let mine = sv.perm.seen.filter((s) => {
                return s.clientId === c.clientId
            })
            assert.strict.ok(mine.length > 0, '伺服端應見到此前端之輪詢')
            assert.strict.deepEqual(mine.map((s) => s.keys), mine.map(() => 'clientId'), '輪詢輸入應恰為{ clientId }(夾具有效)')
            let calls = sv.permCalls.slice(nCalls)
            assert.strict.ok(calls.length > 0, '其餘請求(取函數清單、時間戳、select)仍反查')
            assert.strict.deepEqual(calls.filter((t) => t === ''), [], '不得以空token反查')
            assert.strict.deepEqual(c.errors, [])
            assert.strict.deepEqual(sv.perm.srv.errors.slice(n), [])
        })

        it('本版前端元件(輪詢帶有效token)亦可綁定、同步並收推播', async function() {
            //規格(1): 新、舊元件並存
            let n = sv.perm.srv.errors.length
            let c = mkClient({ port: portPerm, getToken: () => 'token-admin' })
            await waitFor(() => c.bound, { msg: 'new front bound timeout', timeout: 20000 })
            await waitFor(() => valuesOfRecv(c).length > 0, { msg: 'new front initial sync timeout', timeout: 20000 })
            await sv.perm.srv.kpOrm.tabA.save({ id: 'id-tabA-peter', name: 'peter', value: 'v-perm-2' })
            await waitFor(() => valuesOfRecv(c).includes('v-perm-2'), { msg: 'new front pushed change timeout', timeout: 20000 })
            c.stop()
            assert.strict.deepEqual(c.errors, [])
            assert.strict.deepEqual(sv.perm.srv.errors.slice(n), [])
        })

    })

    describe('不開資料通道(useDbOrm未指定)', function() {

        it('只公開[sys:getFuncList]: 無token者之[sys:polling]被拒絕, 函數清單放行(關卡與useDbOrm無關)', async function() {
            //規格(5): 與useDbOrm無關; 此時無表操作與同步表, 故只驗函數清單與輪詢
            await checkMatrix(sv.noOrm, portNoOrm, {
                [funcList]: ['allow', 'allow', 'allow', `reject:${errRevoked}`],
                [funcPolling]: ['deny', 'deny', 'allow', 'deny'],
            }, [
                pollingDenied('empty userId'),
                pollingDenied('empty userId'),
                errRevoked,
                { msg: '[sys:polling] verifyPolling error', err: errRevoked },
            ])
        })

    })

    describe('sysFuncsPublic有給而無效時建構即同步拋錯, null視為未給', function() {

        let cases = [
            { name: '字串', v: funcPolling, msg: 'invalid opt.sysFuncsPublic' },
            { name: '物件', v: {}, msg: 'invalid opt.sysFuncsPublic' },
            { name: '數字0', v: 0, msg: 'invalid opt.sysFuncsPublic' },
            { name: '布林false', v: false, msg: 'invalid opt.sysFuncsPublic' },
            { name: '含非系統函數名之元素', v: [funcList, 'tabA.select'], msg: 'invalid opt.sysFuncsPublic[1]' },
            { name: '含null之元素', v: [null], msg: 'invalid opt.sysFuncsPublic[0]' },
        ]
        for (let [i, c] of cases.entries()) {
            it(`給予${c.name}時new即同步拋錯, 不退回預設`, async function() {
                //規格(5): 有給但非陣列或元素非三個系統函數名之一時建構即同步拋錯, 訊息原樣沿用下游
                //直接以new判定同步性; 若未拋錯(伺服器已建構)即時停止, 以免占住portCheck而使後續案連帶失敗
                let fd = useTempFolder(`sys-funcs-invalid-${i}`)
                let w = null
                try {
                    assert.throws(
                        () => {
                            w = new WServHapiServer({
                                port: portCheck,
                                apis: [],
                                useInert: false,
                                useShowLog: false,
                                pathUploadTemp: `${fd}/uploadTemp`,
                                fpTableTags: `${fd}/tableTags.json`,
                                sysFuncsPublic: c.v,
                            })
                        },
                        (err) => {
                            assert.strict.equal(err.message, c.msg)
                            return true
                        }
                    )
                }
                finally {
                    if (w) {
                        await w.stop()
                    }
                    removeTempFolder(fd)
                }
            })
        }

        it('給予null視為未給(取預設三者皆公開)', async function() {
            //規格(1): 未給(undefined或null)時三者皆公開
            let s = await mkServer('sys-funcs-null', portCheck, { sysFuncsPublic: null })
            await checkMatrix(s, portCheck, {
                [funcList]: ['allow', 'allow', 'allow', `reject:${errRevoked}`],
                [funcTags]: ['allow', 'allow', 'allow', `reject:${errRevoked}`],
                [funcPolling]: ['allow', 'allow', 'allow', 'deny'],
            }, revokedErrs)
        })

    })

})
