# 現況

本檔記當前已開發功能之最新狀態(各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本),只記現況、不寫過程(過程見 `sgud/exp/experience.md`,藍圖見 `sgud/rule/rulebook.md`).

## 版本與相依

- 套件版本(package.json):1.1.7(本輪修改未發布,發布與升版由使用者/主控處理).
- 相依:w-converhp ^2.1.10、**w-serv-webdata ^1.1.16**(安裝 1.1.16)、wsemi ^1.9.21;傳遞依賴 w-serv-broadcast 1.1.12(lock)、w-sync-webdata 1.1.8;devDependencies:w-orm-lowdb ^1.0.35、w-package-tools ^1.1.21.
- dist 由發布流程重建(內嵌下層),本輪未重建.

## 功能現況

| 功能 | 規則 | 測試檔 | 現況 |
|---|---|---|---|
| 轉傳選項不另訂預設與檢核(含 `sysFuncsPublic`) | R1、R13 | unit-optDoc、api-options、api-sys-funcs、unit-client-init | 完成;JSDoc 已列 `sysFuncsPublic`(2026-10-24) |
| 設定錯誤同步拋出、環境錯誤走 error 事件 | R2、R3 | api-options、api-error-listener | 完成;含 `sysFuncsPublic` 無效值同步拋錯 |
| stop 與資源釋放 | R4、R12 | api-options、api-client-stop | 完成 |
| port 檢核與測試 port 配發 | R5、R7 | api-options、unit-ports | 完成;api-sys-funcs 配發 4 個 |
| process 全域監聽不註冊 | R6 | api-options | 完成 |
| 曝露與存取控制選項(useInert、pathStaticFiles、corsOrigins) | R9 | api-exposure、api-cors | 完成 |
| 前端(useWaitToken、getToken、停止) | R10、R11、R12 | unit-client-init、api-client-wait-token、api-client-stop、api-error-listener | 完成 |
| **身分驗證責任與系統函數關卡(`sysFuncsPublic`)** | R13 | api-sys-funcs、api-sync-authorize、api-authorize | 完成(2026-10-24):預設三者皆公開(相容),顯式設定原樣轉傳,輪詢之身分與 clientId 綁定;JSDoc、README〈Identity verification〉〈Upgrade Notes〉已載 |

## 最近一次驗證

- 2026-10-24(hapi-run01,w-serv-webdata 1.1.16 + w-serv-broadcast 1.1.12):全套 `npm test` 等效指令 **138 綠 0 紅**(基準 111;新增 `api-sys-funcs` 27 案,`api-sync-authorize` 改法後仍 3 案);eslint 0 error;定稿後之 `api-sys-funcs` 連跑 5 次(3 次單檔組合重跑、2 次含於全套)全綠,失敗 0/5;修前(w-serv-webdata 1.1.15 + w-serv-broadcast 1.1.10 副本)新測試 27 案中 22 紅、5 綠(鎖定相容);變異驗證 12 項(含拿掉轉傳)全被抓到,見帳本〈變異驗證紀錄〉2026-10-24.完整報告:任務資料夾 `agent-out/hapi-run01-修正報告.md`.

## 已知缺口與待辦

- 各 w-web-* 之 `sysFuncsPublic` 嚴格設定(只公開 `['[sys:getFuncList]']`;w-web-sso 不得採嚴格設定)由主控另輪連動,不在本套件.
- 使用方須顯式設定 `sysFuncsPublic` 才收緊(L14);換身分須重建前端連線(L13).
- 其餘已知限制見帳本 L2、L9–L12、L13、L14.
