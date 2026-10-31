# 現況

本檔記當前已開發功能之最新狀態(各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本),只記現況、不寫過程(過程見 `sgud/exp/experience.md`,藍圖見 `sgud/rule/rulebook.md`).

## 版本與相依

- 套件版本(package.json):1.1.13(連動版;本輪修改未發布,發布與升版由使用者/主控處理).
- 相依:w-converhp ^2.1.13(安裝 2.1.13)、w-serv-webdata ^1.1.21(安裝 1.1.21)、**wsemi ^1.9.36**(安裝 1.9.36;本套件直接使用 `wsemi/src/getDiag.mjs`、`evEmit.mjs`);devDependencies:w-orm-lowdb ^1.0.41、w-package-tools ^1.1.21.
- dist 由發布流程重建(內嵌下層),本輪未重建.

## 功能現況

| 功能 | 規則 | 測試檔 | 現況 |
|---|---|---|---|
| 轉傳選項不另訂預設與檢核(含 `sysFuncsPublic`、`onTrace`) | R1、R13 | unit-optDoc、api-options、api-sys-funcs、unit-client-init、api-ontrace | 完成;JSDoc 已列 `sysFuncsPublic`、`onTrace`(2026-10-30);`onTrace` 只到 w-serv-webdata→w-serv-broadcast,不轉交 w-converhp(其前端同名選項為重試與合併輪詢事件) |
| 設定錯誤同步拋出、環境錯誤走 error 事件 | R2、R3 | api-options、api-error-listener | 完成;含 `sysFuncsPublic` 無效值同步拋錯 |
| **使用端 error 監聽器同步拋錯之通報受 `logDetail`／`funLog` 控制** | R11、R16 規則 5 | api-error-listener | 完成(2026-11-01,hapi234):兩端 `evEmit(…, optEmit)`,`optEmit = { tag, logDetail, funLog }`;預設 stderr 只含 `'[wsemi w-serv-hapi] listener threw'` 與 `{ errType }`(不含拋出值),`logDetail:true` 含遮罩後細節,`funLog` 只交給它;行程不崩潰、ready／stop 結果不受影響(既有語意不變).JSDoc 兩端、README〈Diagnostic output〉已載.原因:wsemi 1.9.34 起 `evEmit` 預設只輸出安全摘要(原三案斷言含原文而轉紅),且原呼叫只傳 `tag`,通報不受本套件之選項控制 |
| stop 與資源釋放 | R4、R12 | api-options、api-client-stop | 完成 |
| port 檢核與測試 port 配發 | R5、R7 | api-options、unit-ports | 完成;api-sys-funcs 配發 8 個、api-diaglog 2 個、api-diaglog-mask 2 個、api-ontrace 1 個 |
| process 全域監聽不註冊 | R6 | api-options | 完成 |
| 曝露與存取控制選項(useInert、pathStaticFiles、corsOrigins) | R9 | api-exposure、api-cors | 完成 |
| 前端(useWaitToken、getToken、停止) | R10、R11、R12 | unit-client-init、api-client-wait-token、api-client-stop、api-error-listener | 完成 |
| 身分驗證責任與系統函數關卡(`sysFuncsPublic`) | R13 | api-sys-funcs、api-sync-authorize、api-authorize | 完成(2026-10-24):預設三者皆公開(相容),顯式設定原樣轉傳,輪詢之身分與 clientId 綁定;JSDoc、README〈Identity verification〉〈Upgrade Notes〉已載 |
| 診斷輸出選項(`logDetail`、`funLog`,w-serv-webdata 1.1.18 起) | R1、R14 | api-diaglog、unit-client-init、unit-optDoc | 完成:兩端整包轉傳,JSDoc 已列(遮罩字樣依 w-serv-webdata 1.1.20 改為 `***`);前端 `useWaitToken=true` 時先行檢核(拋 `invalid opt.logDetail`、`invalid opt.funLog`) |
| **診斷輸出與遮罩由 wsemi 單一擁有(本套件之 console 出口與自發 error)** | R15、R16 | api-diaglog-mask、api-ontrace、api-diaglog、api-error-listener | 完成(2026-10-30,排程第 161 項):本套件為轉傳端,不持有秘密、不寫遮罩;前端 `getToken` 之拋出／reject 值於 catch 站點先遮罩(現經 `diag.err`);交給使用端監聽器之下游值原樣;L15 解除.console 出口之處置由 R16 取代(下行) |
| **console 出口預設只輸出安全摘要,`logDetail`／`funLog` 取細節** | R16 | api-diaglog-console、api-diaglog-mask、api-error-listener | 完成(2026-10-31,排程第 158 項):兩端無 error 監聽者時 `diag('[w-serv-hapi] error', { from, ...diag.brief(err) }, () => err, 'error')`(wsemi `getDiag`):預設 `console.error(標籤, { from, errType, errCode? })` 不含錯誤原文與使用端之值;`logDetail:true` 輸出遮罩後細節;`funLog` 只收 `(label, safe, detail)`;有監聽者不經出口.`from` 為固定詞彙(downstream、clear、start、stop;getToken、startSync).全部 console.* 站點全表見 R16;4 處 `useShowLog` 資訊行刻意不套.README〈Breaking changes〉已載 |

## 最近一次驗證

- 2026-11-01(hapi234,wsemi 1.9.36 + w-serv-webdata 1.1.21 + w-converhp 2.1.13):全套 `npm test`(`quiet-run`,於同一次取鎖內)**197 綠 0 紅**(約 1.4 分鐘;原 191 + `api-error-listener` 由 3 案改寫為 9 案〔淨增 6〕).修前:HEAD 原 `api-error-listener` 對 HEAD src **3 紅**(監聽器拋錯三案斷言 stderr 含原文,實得不含);新測試對 HEAD src 6 紅(logDetail 3、funLog 3);修後全綠.變異 10/10 被抓到、預期紅集合逐項相符(帳本〈變異驗證紀錄〉2026-11-01);repo 之 src 未被變異.eslint(改動檔)0 error.
- 2026-10-31(排程第 158 項,wsemi 1.9.33 + w-serv-webdata 1.1.20 + w-converhp 2.1.12):全套 `npm test`(`quiet-run --lock`,凍結碼)**191 綠 0 紅**(約 1.5 分鐘;原 168 + `api-diaglog-console` 16 + `api-diaglog-mask` 新增 funLog 與 K09、P01 路徑 + `api-error-listener` 新增 logDetail 2 案).修前紅(src 為 HEAD、新測試):`api-diaglog-console` 16 案中 **14 紅 2 綠**(2 綠為「有 error 監聽者」之守住案);變異 16/16 被抓到、src 逐位元組還原(帳本〈變異驗證紀錄〉2026-10-31).eslint(改動檔)0 error.

- 2026-10-30(排程第 161 項遷移,wsemi 1.9.31 + w-serv-webdata 1.1.20 + w-converhp 2.1.12):最終碼階段 A(`api-diaglog-mask`＋`api-ontrace`＋`unit-optDoc`＋`api-diaglog`＋`unit-ports`)**40 綠 0 紅**;修前紅(src 退回 HEAD)13 紅(`api-diaglog-mask` 11、`unit-optDoc` 2)、HEAD 版 `api-diaglog` 於新依賴下 4 紅;變異 12/12 被抓到.全套結果見下行.eslint(改動檔)0 error.變異與修前紅紀錄:帳本〈變異驗證紀錄〉2026-10-30.
- 全套 `npm test`(`quiet-run --lock`,最終碼):**168 綠 0 紅**(約 1 分鐘;原 147 + `api-diaglog-mask` 18 + `api-ontrace` 3).

## 已知缺口與待辦

- 各 w-web-* 之 `sysFuncsPublic` 嚴格設定(只公開 `['[sys:getFuncList]']`;w-web-sso 不得採嚴格設定)由主控另輪連動,不在本套件.
- 使用方須顯式設定 `sysFuncsPublic` 才收緊(L14);換身分須重建前端連線(L13).
- 本套件不持有秘密,不認識之裸字串密碼與 token、不含憑證樣式之錯誤原文與使用端自填之值不在 `logDetail` 細節輸出之遮罩保證內(2026-10-31 起預設只輸出安全摘要,不輸出之;給 `logDetail:true`／`funLog` 者自負,R16、L15).
- w-converhp 之同型 console 出口(`verifyConn error for apiType[…]`、`listener of event[…] error`)另案,不在本套件.
- 待裁示(可選,低優先):是否另轉交 w-converhp 前端之 `onTrace`(重試與合併輪詢事件;目前不轉交,理由見 R15 與 JSDoc).
- 受影響之下游(依賴 w-serv-hapi `^1.1.10`):w-web-sso、w-web-api、w-web-task、w-web-perm——升版後日誌之 `[w-serv-hapi]` 行不再含原始憑證樣式;**2026-10-31 起該行預設只含 `[w-serv-hapi] error { from, errType, errCode? }`,不再含錯誤原文**(需原文者掛 error 監聽,或給 `logDetail:true`／`funLog`;其日誌過濾若比對訊息文字須檢視);發布與連動由主控處理.
- 其餘已知限制見帳本 L2、L9–L12、L13、L14.
