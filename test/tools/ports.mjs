/**
 * 測試用 port 之集中配發
 *
 * why 集中:mocha 以 `--parallel` 同時跑 `test/*.test.mjs`(見 package.json 之 test script),
 * 同一次執行內各測試檔之 port 必須互斥;而各檔自行手寫固定值會使新增測試檔時須自行 grep 找空號,
 * 以隨機值(如 `3000 + Math.random()`)取號則撞到即 EADDRINUSE、下次跑又過,是最難查之 flake。
 * 交由作業系統分配(`port: 0`)雖不會撞,但號碼落在動態範圍(實測 5 萬多),
 * 與本家族套件「測試 port 一律 8 千段」之慣例不符,亦無從於防火牆或批次腳本內預先開放。
 *
 * 配發規則:
 *   - `8080` 套件預設值。**任何測試不得佔用** —— 保留給「port 未給或非法時取預設」之斷言
 *   - `8199` 保留:供「連線失敗」測試指向,任何測試不得於此啟動伺服器
 *   - `8700` 起依 `alloc` 之順序連續配發,一檔一段
 *
 * why 自 8700 起:同家族之 w-converhp 其測試自 8300 起配發約 60 餘號(見該專案 test/tools/ports.mjs),
 * 批次對多專案同時跑測試時會與之重疊,故本專案錯開至 8700 並留其成長空間。
 *
 * 新增測試檔:於 `alloc` **表末**加一行並填需要幾個 port,不必自行找空號。
 * 重複、遺漏、以及測試檔內自行手寫 port 字面值,皆由 `test/unit-ports.test.mjs` 擋住。
 */

//base, 配發起點
let base = 8700

//reserved, 保留區: 不得配發, 亦不得於其上啟動伺服器
let reserved = {
    packageDefault: 8080, //套件之 port 預設值; 空出以供「port 未給或非法時取預設」之斷言
    closed: 8199, //刻意無人監聽: 供連線失敗之測試指向
}

//alloc, 配發表: [測試檔名(不含副檔名), 需要幾個 port, 用途]
//順序即配發順序; **新增一律加在表末**, 使既有配發不位移
let alloc = [
    ['api-exec', 1, ''],
    ['api-cors', 1, ''],
    ['api-table-tags', 2, 'fpTableTags 與舊名 fnTableTags 各起一台'],
]

//segs, 依 alloc 之順序自 base 起連續配發
let segs = {}
let cur = base
for (let [name, count] of alloc) {
    segs[name] = { from: cur, count }
    cur += count
}

//portOf, 取某測試檔之第 i 個 port(i 自 0 起算)
//名稱打錯或索引越界一律拋錯, 不靜默回一個可用但錯誤之號碼
let portOf = (name, i = 0) => {
    let s = segs[name]
    if (!s) {
        throw new Error(`portOf: 測試檔[${name}]未登記於 test/tools/ports.mjs 之 alloc`)
    }
    if (!Number.isInteger(i) || i < 0 || i >= s.count) {
        throw new Error(`portOf: 測試檔[${name}]只配發 ${s.count} 個 port, 取不到第 ${i} 個(自 0 起算)`)
    }
    return s.from + i
}


let r = {
    base,
    reserved,
    alloc,
    segs,
    portOf,
}


export default r
