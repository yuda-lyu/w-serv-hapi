import path from 'path'
import { pathToFileURL } from 'url'


/**
 * 供測試以子行程驗證「import前後process之全域監聽數不變」(CLAUDE_rulebook.md之R6)
 *
 * 用法: node test/tools/child-import.mjs <模組路徑>...(相對於repo根, 依序import)
 * 輸出: BEFORE <a,b,c>, 每個模組import後印 AFTER <模組路徑> <a,b,c>; a,b,c依序為uncaughtExceptionMonitor、uncaughtException、unhandledRejection之監聽數
 *
 * why 用子行程且動態import: 須於全新行程中比對import之前後, mocha行程與其他工具於載入時已import本套件
 */

let names = ['uncaughtExceptionMonitor', 'uncaughtException', 'unhandledRejection']

let counts = () => {
    return names.map((name) => {
        return process.listenerCount(name)
    }).join(',')
}

console.log(`BEFORE ${counts()}`)
for (let fp of process.argv.slice(2)) {
    await import(pathToFileURL(path.resolve(fp)).href)
    console.log(`AFTER ${fp} ${counts()}`)
}
