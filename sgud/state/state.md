# 現況

本檔記當前已開發功能之最新狀態(各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本),只記現況、不寫過程(過程見 `sgud/exp/experience.md`,藍圖見 `sgud/rule/rulebook.md`).

## 版本與相依

- 套件版本(package.json):1.1.9(本輪修改未發布,發布與升版由使用者/主控處理).
- 相依:w-converhp ^2.1.11、**w-serv-webdata ^1.1.18**(安裝 1.1.18)、wsemi ^1.9.25;傳遞依賴 w-serv-broadcast 1.1.13(lock)、w-sync-webdata 1.1.9;devDependencies:w-orm-lowdb ^1.0.38、w-package-tools ^1.1.21.
- dist 由發布流程重建(內嵌下層),本輪未重建.

## 功能現況

| 功能 | 規則 | 測試檔 | 現況 |
|---|---|---|---|
| 轉傳選項不另訂預設與檢核(含 `sysFuncsPublic`) | R1、R13 | unit-optDoc、api-options、api-sys-funcs、unit-client-init | 完成;JSDoc 已列 `sysFuncsPublic`(2026-10-24) |
| 設定錯誤同步拋出、環境錯誤走 error 事件 | R2、R3 | api-options、api-error-listener | 完成;含 `sysFuncsPublic` 無效值同步拋錯 |
| stop 與資源釋放 | R4、R12 | api-options、api-client-stop | 完成 |
| port 檢核與測試 port 配發 | R5、R7 | api-options、unit-ports | 完成;api-sys-funcs 配發 8 個、api-diaglog 配發 2 個 |
| process 全域監聽不註冊 | R6 | api-options | 完成 |
| 曝露與存取控制選項(useInert、pathStaticFiles、corsOrigins) | R9 | api-exposure、api-cors | 完成 |
| 前端(useWaitToken、getToken、停止) | R10、R11、R12 | unit-client-init、api-client-wait-token、api-client-stop、api-error-listener | 完成 |
| **身分驗證責任與系統函數關卡(`sysFuncsPublic`)** | R13 | api-sys-funcs、api-sync-authorize、api-authorize | 完成(2026-10-24):預設三者皆公開(相容),顯式設定原樣轉傳,輪詢之身分與 clientId 綁定;JSDoc、README〈Identity verification〉〈Upgrade Notes〉已載 |
| **診斷輸出選項(`logDetail`、`funLog`,w-serv-webdata 1.1.18 起)** | R1、R14 | api-diaglog、unit-client-init、unit-optDoc | 完成(2026-10-28):兩端整包轉傳,JSDoc 已列(載明預設不含個資、僅涵蓋 w-serv-webdata 自身之診斷輸出);前端 `useWaitToken=true` 時先行檢核(拋 `invalid opt.logDetail`、`invalid opt.funLog`);本套件自身之 console 輸出站不在其涵蓋,見已知缺口 |

## 最近一次驗證

- 2026-10-28(hapi-run01,w-serv-webdata 1.1.18 + w-serv-broadcast 1.1.13):修前(僅升 1.1.18)全套 138 案 **135 綠 3 紅**(`unit-optDoc` 兩條、`unit-client-init` 一條);修後 **147 綠 0 紅**(新增 `api-diaglog` 8 案、`unit-client-init` 1 案);eslint(改動檔)0 error;`api-diaglog` 連跑 5 次(4 次單檔、1 次含於全套)失敗 0/5;變異驗證 3 項(拿掉前端先行檢核、伺服端不轉傳、前端不轉傳)全被抓到,見帳本 R14.完整報告:任務資料夾 `agent-out/hapi-run01-修正報告.md`.(前一次 2026-10-24 之驗證紀錄見帳本 R13〈變異驗證紀錄〉.)

## 已知缺口與待辦

- 各 w-web-* 之 `sysFuncsPublic` 嚴格設定(只公開 `['[sys:getFuncList]']`;w-web-sso 不得採嚴格設定)由主控另輪連動,不在本套件.
- 使用方須顯式設定 `sysFuncsPublic` 才收緊(L14);換身分須重建前端連線(L13).
- **待裁示(L15)**:本套件自身 2 處 `console.error('[w-serv-hapi]', err)`(無 error 監聽者時;`WServHapiServer.mjs:337`、`WServHapiClient.mjs:319`)原樣輸出 error 事件值,可能含 token、使用者 id、錯誤原文,不經 `logDetail`、`funLog`;本輪只於 JSDoc 載明並提醒掛 error 監聽,是否改經出口由主控裁示.
- 其餘已知限制見帳本 L2、L9–L12、L13、L14、L15.
