import WServHapiClient from '../../src/WServHapiClient.mjs'
import wPorts from './ports.mjs'


/**
 * 供測試以子行程驗證前端「失敗或停止後行程可自行結束(無殘留計時器)」與「error監聽器拋錯時行程不崩潰」
 *
 * 用法: node test/tools/child-client.mjs <mode>
 * - mode 'ctor-throw': useWaitToken=true而未給getToken, 建構同步拋錯後由使用端catch
 * - mode 'wait-clear': useWaitToken=true而getToken恆回傳空字串, 等待中呼叫clearBroadcast
 * - mode 'listener-throw': useWaitToken=true而getToken拋錯, 其error監聽器同步拋錯(預設只輸出標籤與安全摘要)
 * - mode 'listener-throw-detail': 同上而給logDetail:true
 * - mode 'listener-throw-funlog': 同上而給funLog, 其收到之通報以FUNLOG行印至stdout
 * - mode 'no-listener': useWaitToken=true而getToken拋錯, 不掛error監聽: 本套件自發之error須以[w-serv-hapi]前綴出現於stderr(預設只含標籤與安全摘要)
 * - mode 'no-listener-detail': 同上而給logDetail:true, stderr含遮罩後之錯誤原文
 * 之後不再有任何動作; 輸出逐行印出, 行程須以離開碼0於時限內自行結束
 *
 * why 用子行程: mocha會攔截未捕捉之錯誤, 觀察不到行程崩潰; 其worker會被重用且自有計時器, 亦無法斷言行程可自行結束
 */

let mode = process.argv[2]

//url, 刻意無人監聽之port: 各情境皆未取得token, 不應連線
let url = `http://localhost:${wPorts.reserved.closed}`

let sleep = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

if (mode === 'ctor-throw') {
    try {
        let r = new WServHapiClient({ url, useShowLog: false, useWaitToken: true })
        console.log(`NOT-THROWN ${r === null ? 'null' : typeof r}`)
    }
    catch (err) {
        console.log(`THROWN ${err.message}`)
    }
}
else if (mode === 'wait-clear') {
    let n = 0
    let cli = new WServHapiClient({
        url,
        useShowLog: false,
        useWaitToken: true,
        getToken: () => {
            n += 1
            return ''
        },
    })
    cli.on('error', (err) => {
        console.log(`ERROR ${err}`)
    })
    await sleep(300)
    cli.clearBroadcast()
    console.log(`CLEARED ${n > 0 ? 'checked' : 'unchecked'}`)
}
else if (mode === 'listener-throw' || mode === 'listener-throw-detail' || mode === 'listener-throw-funlog') {
    let optLog = {}
    if (mode === 'listener-throw-detail') {
        optLog = { logDetail: true }
    }
    else if (mode === 'listener-throw-funlog') {
        optLog = {
            funLog: (label, safe, detail) => {
                console.log(`FUNLOG ${label} ${JSON.stringify(safe)} ${detail && detail.event} ${detail && detail.err && detail.err.message}`)
            },
        }
    }
    let cli = new WServHapiClient({
        url,
        useShowLog: false,
        useWaitToken: true,
        ...optLog,
        getToken: () => {
            throw new Error('token-err')
        },
    })
    cli.on('error', (err) => {
        console.log(`LISTENER ${err.message}`)
        throw new Error('listener-err')
    })
    await sleep(300)
    console.log('DONE')
}
else if (mode === 'no-listener' || mode === 'no-listener-detail') {
    //no-listener-detail: 給logDetail:true(細節出口, 含遮罩後之錯誤原文); no-listener為預設(只輸出標籤與安全摘要)
    new WServHapiClient({
        url,
        useShowLog: false,
        useWaitToken: true,
        ...(mode === 'no-listener-detail' ? { logDetail: true } : {}),
        getToken: () => {
            throw new Error('token-err-no-listener')
        },
    })
    await sleep(300)
    console.log('DONE')
}
else {
    console.log(`INVALID-MODE ${mode}`)
}
