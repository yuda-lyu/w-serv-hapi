# 現況

本檔記當前已開發功能之最新狀態(各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本),只記現況、不寫過程(過程見 `sgud/exp/experience.md`,藍圖見 `sgud/rule/rulebook.md`).

## 版本與相依

- 套件版本(package.json):1.1.10(本輪修改未發布,發布與升版由使用者/主控處理).
- 相依:w-converhp ^2.1.12(安裝 2.1.12)、**w-serv-webdata ^1.1.20**(安裝 1.1.20)、wsemi ^1.9.31(安裝 1.9.31);傳遞依賴 w-serv-broadcast 1.1.14、w-sync-webdata 1.1.10;devDependencies:w-orm-lowdb ^1.0.40、w-package-tools ^1.1.21.
- dist 由發布流程重建(內嵌下層),本輪未重建.

## 功能現況

| 功能 | 規則 | 測試檔 | 現況 |
|---|---|---|---|
| 轉傳選項不另訂預設與檢核(含 `sysFuncsPublic`、`onTrace`) | R1、R13 | unit-optDoc、api-options、api-sys-funcs、unit-client-init、api-ontrace | 完成;JSDoc 已列 `sysFuncsPublic`、`onTrace`(2026-10-30);`onTrace` 只到 w-serv-webdata→w-serv-broadcast,不轉交 w-converhp(其前端同名選項為重試與合併輪詢事件) |
| 設定錯誤同步拋出、環境錯誤走 error 事件 | R2、R3 | api-options、api-error-listener | 完成;含 `sysFuncsPublic` 無效值同步拋錯 |
| stop 與資源釋放 | R4、R12 | api-options、api-client-stop | 完成 |
| port 檢核與測試 port 配發 | R5、R7 | api-options、unit-ports | 完成;api-sys-funcs 配發 8 個、api-diaglog 2 個、api-diaglog-mask 2 個、api-ontrace 1 個 |
| process 全域監聽不註冊 | R6 | api-options | 完成 |
| 曝露與存取控制選項(useInert、pathStaticFiles、corsOrigins) | R9 | api-exposure、api-cors | 完成 |
| 前端(useWaitToken、getToken、停止) | R10、R11、R12 | unit-client-init、api-client-wait-token、api-client-stop、api-error-listener | 完成 |
| 身分驗證責任與系統函數關卡(`sysFuncsPublic`) | R13 | api-sys-funcs、api-sync-authorize、api-authorize | 完成(2026-10-24):預設三者皆公開(相容),顯式設定原樣轉傳,輪詢之身分與 clientId 綁定;JSDoc、README〈Identity verification〉〈Upgrade Notes〉已載 |
| 診斷輸出選項(`logDetail`、`funLog`,w-serv-webdata 1.1.18 起) | R1、R14 | api-diaglog、unit-client-init、unit-optDoc | 完成:兩端整包轉傳,JSDoc 已列(遮罩字樣依 w-serv-webdata 1.1.20 改為 `***`);前端 `useWaitToken=true` 時先行檢核(拋 `invalid opt.logDetail`、`invalid opt.funLog`) |
| **診斷輸出與遮罩由 wsemi 單一擁有(本套件之 console 出口與自發 error)** | R15 | api-diaglog-mask、api-ontrace、api-diaglog、api-error-listener | 完成(2026-10-30,排程第 161 項):本套件為轉傳端,不持有秘密、不寫遮罩;無 error 監聽者時兩端之 `console.error('[w-serv-hapi]', …)` 經 `maskDiagErr`;前端 `getToken` 之拋出／reject 值於 catch 站點先遮罩;交給使用端監聽器之下游值原樣;站點全集與處置見 R15;L15 解除 |

## 最近一次驗證

- 2026-10-30(排程第 161 項遷移,wsemi 1.9.31 + w-serv-webdata 1.1.20 + w-converhp 2.1.12):最終碼階段 A(`api-diaglog-mask`＋`api-ontrace`＋`unit-optDoc`＋`api-diaglog`＋`unit-ports`)**40 綠 0 紅**;修前紅(src 退回 HEAD)13 紅(`api-diaglog-mask` 11、`unit-optDoc` 2)、HEAD 版 `api-diaglog` 於新依賴下 4 紅;變異 12/12 被抓到.全套結果見下行.eslint(改動檔)0 error.變異與修前紅紀錄:帳本〈變異驗證紀錄〉2026-10-30.
- 全套 `npm test`(`quiet-run --lock`,最終碼):**168 綠 0 紅**(約 1 分鐘;原 147 + `api-diaglog-mask` 18 + `api-ontrace` 3).

## 已知缺口與待辦

- 各 w-web-* 之 `sysFuncsPublic` 嚴格設定(只公開 `['[sys:getFuncList]']`;w-web-sso 不得採嚴格設定)由主控另輪連動,不在本套件.
- 使用方須顯式設定 `sysFuncsPublic` 才收緊(L14);換身分須重建前端連線(L13).
- 本套件不持有秘密,不認識之裸字串密碼與 token 不在 console 出口遮罩之保證內;錯誤原文與資料值仍可能出現,宜掛 error 監聽(R15、L15).
- w-converhp 之同型 console 出口(`verifyConn error for apiType[…]`、`listener of event[…] error`)另案,不在本套件.
- 待裁示(可選,低優先):是否另轉交 w-converhp 前端之 `onTrace`(重試與合併輪詢事件;目前不轉交,理由見 R15 與 JSDoc).
- 受影響之下游(依賴 w-serv-hapi `^1.1.10`):w-web-sso、w-web-api、w-web-task、w-web-perm——升版後日誌之 `[w-serv-hapi]` 行不再含原始憑證樣式;發布與連動由主控處理.
- 其餘已知限制見帳本 L2、L9–L12、L13、L14.
