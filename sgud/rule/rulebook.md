# 規則帳本

本檔為套件設計與開發階段之規則帳本,為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.

盤點指令皆於 repo 根執行.全部測試:`npm test`;單檔:`npx mocha --no-parallel test/<檔名> --timeout 180000`.

## R1 轉傳選項不另訂預設與檢核,由下游單一擁有

**規則**:只負責轉傳給下游之選項,本套件不另訂預設值、不另做檢核,原樣交給下游;只有本套件自己使用之選項才在本套件內定預設與檢核.

**why**:2026-10-13 之事故——本套件對只轉傳之 `useDbOrm` 另訂預設 true,w-serv-webdata 1.1.7 改預設為 false 並新增必填 `authorizeExec` 後即分歧,所有使用端無法啟動;又因轉傳以物件逐項列舉,下游新增之 `authorizeExec` 被靜默丟棄.

**盤點**:`rg -n "get\(opt, '" src/WServHapiServer.mjs src/WServHapiClient.mjs`,逐一歸類.

| 選項 | 歸類 | 判準 |
|---|---|---|
| port、corsOrigins、useInert、pathStaticFiles、apis、useShowLog | 本套件自用 | 已套:本地預設與檢核;有給而無效之處置見 R9(corsOrigins、useInert、pathStaticFiles 同步拋錯;port 依 R5 取預設;apis、useShowLog 取預設) |
| fpTableTags(含舊名 fnTableTags) | 本套件處理舊名相容後轉傳 | 刻意:舊名相容須在本套件 |
| apiName、pathUploadTemp、tokenType、sizeSlice、sizeMsg、verifyConn、delayForSlice | 轉傳 w-converhp | 已套:原樣轉傳(2026-10-13 兩名審查者以 22–23 個邊界值實測與原本之本地預檢最終值零差異) |
| w-serv-webdata 之全部選項 | 轉傳 w-serv-webdata | 已套:`{ ...opt, fpTableTags }` 整包轉傳(含 1.1.16 起之 `sysFuncsPublic`:預設與檢核由下游單一擁有,本套件不訂,見 R13;1.1.18 起之 `logDetail`、`funLog`,見 R14) |
| corsOrigins → w-converhp | 不轉傳 | 刻意:w-converhp 只於自建伺服器時使用,serverHapi 模式下為死傳 |
| `src/WServHapiClient.mjs` 之 url、apiName、tokenType、sizeSlice、timeout、retryMain、retryUpload、retryDownload | 轉傳 w-converhp 前端 | 已套(2026-10-13):原樣轉傳.零差異由靜態控制流證明:各選項 w-converhp 之有效集合皆為原本地有效集合之子集(同一謂詞,或另加 `useLimitSafe`、`<= maxTimer`、上限截斷),且預設值相同,故對任一輸入 v,w-converhp(本地(v)) = w-converhp(v) |
| `src/WServHapiClient.mjs` 之 w-serv-webdata 前端選項 | 轉傳 w-serv-webdata 前端 | 已套(2026-10-13):`{ ...opt, getToken, getServerMethods, recvData }` 整包轉傳(原逐項列舉 7 個).getServerMethods、recvData 於下游為必填,由本套件提供預設;getToken 本套件等待 token 時自用 |
| 前端四個回調函數(getRefreshState 等)及 1.1.18 起之 `logDetail`(有給須為布林)、`funLog`(有給須為函數)之檢核 | 由 w-serv-webdata 擁有,本套件先行以同規則檢核 | 刻意:useWaitToken=true 時 w-serv-webdata 延後至取得 token 才建構,不先檢核則設定錯誤晚於建構才出現(R10).兩處一致由 `test/unit-client-init.test.mjs` 之行為比對守住(下游前端於建構時拋錯之每個選項與無效值,本套件 useWaitToken=true 時須同步拋出同一訊息,下游新增選項自動納入) |

**測試**:`test/unit-optDoc.test.mjs`(本套件伺服端與前端之 JSDoc 須列出 w-serv-webdata 對應端之全部選項,下游新增選項即轉紅;2026-10-24 w-serv-webdata 1.1.16 新增 `sysFuncsPublic` 時即轉紅,補 JSDoc 後轉綠);`test/api-options.test.mjs`(未給 useDbOrm、非布林 useDbOrm);`test/unit-client-init.test.mjs`(前端回調函數檢核之行為比對);`test/api-sys-funcs.test.mjs`(`sysFuncsPublic` 之轉傳,見 R13);`test/api-diaglog.test.mjs`(`logDetail`、`funLog` 之轉傳,見 R14).

## R2 設定錯誤於建構時同步拋出;環境與啟動錯誤經 error 事件與 ready() reject

**規則**:可同步判定之設定錯誤(下游之必填缺漏、hapi 之非法伺服器選項)於 `new WServHapiServer()` 時同步拋出,訊息原樣沿用下游(不改寫,以免形成第二個來源);環境與啟動錯誤(埠被占用、apis 路由衝突)走 error 事件並使 `ready()` 以原錯誤 reject.

**作法**:`new Hapi.Server`、`new WConverhpServer`(serverHapi 模式為全同步建構)、`new WServWebdataServer` 皆在建構子同步段;非同步段只有 register Inert、掛靜態路由與 apis、`server.start()`.

**盤點**:下游拋錯點全集 `rg -n "throw new Error" node_modules/w-serv-webdata/src/WServWebdataServer.mjs node_modules/w-serv-webdata/src/WServWebdataServerExec.mjs node_modules/w-serv-webdata/src/WServWebdataServerSync.mjs`.

| 錯誤(以 w-serv-webdata 1.1.12 為準,其伺服端之設定檢核與 1.1.10 相同,1.1.11 另增傳入之事件物件須具 emit、on、off(本套件傳 w-converhp 實體,恆符合);下游於建構其任何元件之前檢核,下游本身無殘留;惟本套件已先建構之 w-converhp 已建立 pathUploadTemp 資料夾,故 w-serv-webdata 之設定錯誤與其建構期執行期異常拋錯時該資料夾殘留,見 L9) | 通道 | 判準 |
|---|---|---|
| useDbOrm=true 缺 operOrm/tableNamesExec/authorizeExec/kpOrm、authorizeExec 非函數、kpOrm 非物件、methodsExec 有給但非陣列 | 同步拋 | 已套 |
| 未指定 useDbOrm 卻給了 operOrm、tableNamesExec、methodsExec、authorizeExec、kpOrm 或 tableNamesSync | 同步拋 | 已套 |
| tableNamesExec、methodsExec、tableNamesSync 之元素非非空字串;tableNamesSync 有給但非陣列 | 同步拋 | 已套 |
| getUserIdByToken、genTag 有給但非函數;fpTableTags 有給但非非空字串(本套件之舊名相容只在未給新名時作用,不吞此錯) | 同步拋 | 已套 |
| sysFuncsPublic(w-serv-webdata 1.1.16 起)有給但非陣列(`invalid opt.sysFuncsPublic`)或元素非三個系統函數名之一(`invalid opt.sysFuncsPublic[i]`);null 視為未給 | 同步拋 | 已套(`test/api-sys-funcs.test.mjs` 六個無效值與 null,2026-10-24) |
| kpFunExt 非純物件或值非函數;頂層名為表名、以 `[sys:` 開頭、路徑為空或含空段或含 `__proto__`/`constructor`/`prototype`、不同函數名解析為同一路徑或互為前綴 | 同步拋 | 已套 |
| tableNamesSync 含 kpOrm 所無之表、kpOrm 值不可監聽、同步表無表操作 select | 同步拋 | 已套 |
| apis 與通訊路由衝突 | error 事件 + ready reject + 不啟動 | 已套 |
| 埠被占用 | error 事件 + ready reject | 已套 |
| port 非法 | 取預設 8080(R5) | 已套 |
| corsOrigins、useInert、pathStaticFiles 有給而無效(R9) | 同步拋 `invalid opt.<名>`;檢核早於 Hapi 與 w-converhp 之建構,拋錯時無殘留 | 已套(2026-10-13) |
| corsOrigins 為 hapi 不接受之陣列(`[123]`、`[null]`、`['*', x]`) | 同步拋(hapi 原訊息),無殘留 | 已套 |
| verifyConn 有給而非函數(轉傳,R1) | w-converhp 建構期 error 事件(經 R3 於 ready 前送達)+ 通訊路由一律 permission denied | 已繼承(w-converhp 2.1.7 起;2.1.6 為放行,原 L4) |

**測試**:`test/api-options.test.mjs`.

## R3 建構期間之 error 延後至建構子回傳後轉出

**規則**:error 轉送監聽須在 w-serv-webdata 建構之前掛在 w-converhp 實體上;建構期間收到者先暫存,建構子回傳後以計時器依序轉出;啟動流程須先等轉出完成,使 `ready()` 之結果必晚於建構期之 error.

**why**:evem 為 eventemitter3,無監聽之 error 直接遺失;使用端只能在 `new` 回傳後才掛監聽.w-serv-webdata 1.1.7 於建構期同步 emit kpOrm 錯誤,1.1.8 已改為拋錯;目前建構期之 error 來自 w-converhp 之延後派發(例如暫存資料夾無法建立),本規則確保其於 `ready()` 結果之前送達.

**盤點**:`rg -n "emitError|constructing|pmFlush" src/WServHapiServer.mjs`.

**測試**:`test/api-options.test.mjs`「建構期間下游發出之error(暫存資料夾無法建立)應於ready完成前送達new之後立即掛上之監聽」.

## R4 失敗與停止時釋放本套件所建立之資源

**規則**(停止之完整語意與順序見 R12):非同步啟動失敗時、`stop()` 時,皆以 `clearDownstream()` 釋放下游於同一事件物件上所建立之資源:`clearBroadcast`(w-serv-broadcast 之輪詢計時器)、`clearSync`(w-serv-webdata 1.1.10 起之同名包裝:先移除其掛於 kpOrm 之 change 監聽,再呼叫 w-sync-webdata 之 clearSync 取消待推播並將未落檔之時間戳寫入);兩者以 isfun 防護、可重複呼叫,清理失敗以 error 事件轉出且不中斷其餘清理.`stop()` 先等啟動結束(成功或失敗),再 `clearDownstream()`、已啟動者 `server.stop()`,恆 resolve.w-serv-webdata 建構拋錯時之清理由其自行負責,本套件不重複處理.此規則即 w-serv-webdata 1.1.10 檔頭規則 9「停止服務時呼叫clearBroadcast與clearSync」.

**命名與呼叫路徑**:`clearSync` 一律經 w-serv-webdata 所建構之同一事件物件呼叫(2026-10-13 與 w-sync-webdata 主責 agent 確認).下游之釋放函數不可命名為 `stop`——w-converhp 已在同一物件上掛 `stop`(`WConverhpServer.mjs:2226`),各層皆擴充同一物件,同名即互相覆蓋.

**盤點**:`rg -n "clearDownstream|clearBroadcast|clearSync|server\.stop" src/WServHapiServer.mjs`.

**測試**:`test/api-options.test.mjs` 之兩個子行程案例(建構拋錯被 catch 後、啟動失敗未呼叫 stop,行程皆須於時限內自行結束)、「stop於啟動完成前呼叫時…」、「埠被占用時…stop仍可收尾」、「stop應釋放資料同步: 移除掛於kpOrm之change監聽, 之後資料表變更不再寫入時間戳檔」、「同步設定錯誤拋錯後不應殘留對kpOrm之change監聽與時間戳檔」、「下游之清理拋錯時stop仍resolve…」(清理之 try/catch)、「stop時尚未落檔之時間戳應寫入檔案…」、「時間戳落檔失敗時stop發出error事件且仍resolve」.

## R5 port 之檢核比照 w-converhp

**規則**:`ispint(port, { useLimitSafe: true })` 且不超過 65535,否則取 8080;檢核與 `cint` 正規化成對(ispint 亦接受數字字串).

**盤點**:`rg -n "ispint\(port" src/WServHapiServer.mjs node_modules/w-converhp/src/WConverhpServer.mjs`(兩處謂詞須一致).

**測試**:`test/api-options.test.mjs`「port超出範圍時取預設值」.

## R6 不註冊 process 之 unhandledRejection、uncaughtException 與 uncaughtExceptionMonitor 監聽

**規則**:函式庫不得於宿主程序註冊此三種監聽(含 import 時、建構時、執行期與 stop 後),全域錯誤政策由使用端自行決定.dist 內嵌下層(w-converhp、w-serv-webdata),故 dist 之監聽數取決於建置當時之下層:w-converhp 2.1.7 之三支 worker 產物 import 即註冊 3 個 `uncaughtExceptionMonitor`(原 L7),2.1.8 起為 0;dist 由發布流程以當下之相依重建,發布後以 `probe-listeners` 同法(import → ready → 切片上傳 → stop 各數一次)複驗.

**依據**:家族既有結論——w-package-tools `src/rollupWorkerCore.mjs:850-854` 之註解:註冊後宿主整個程序之未捕捉錯誤都會被改成只印 log 不終止,等於函式庫劫持所有下游 app 之全域錯誤語意.本套件原於每次建構各註冊一組(建構失敗亦累增),且前一實例之監聽會吞掉後一實例建構時之同步拋錯(2026-10-13 實測:移除後,先建實例服務中時,後建實例之設定錯誤使行程立即以 exit 1 結束).

**盤點**:`rg -n "process\.(on|once|addListener|prependListener)\(" src`(應無結果);發布前另對建置產物 `rg -c "outer:uncaughtExceptionMonitor|process\.(on|once)\(" dist`(應為 0).

**測試**:`test/api-options.test.mjs`「建構失敗時不增加process之全域監聽」、「建構成功與stop皆不註冊process之全域監聽」(兩案皆數三種監聽);「import本套件伺服端與前端前後, process之三種全域監聽數不變(子行程)」(`test/tools/child-import.mjs`;分辨力:同工具 import 以 w-converhp 2.1.7 建置之舊 dist 得 0→3).

## R7 測試 port 集中配發

**規則**:測試 port 一律由 `test/tools/ports.mjs` 之 `portOf` 取得,自 8700 起配發(與 w-converhp 之 8300 段錯開);8080 與 8199 保留;測試檔內不得出現 port 字面值(含註解).新增測試檔於 alloc 表末登記.

**測試**:`test/unit-ports.test.mjs`.

## R8 測試檔配置

**規則**:測試檔 `test/*.test.mjs` 以 `api-`、`unit-` 前綴分層;共用層與輔助工具置 `test/tools/`(不帶 `.test.`);測試暫存一律 `test/_tmp/<案名>`(gitignore),測完即刪;不得使用 `./tmp`.

**盤點**:`rg -n "['\"\x60]\./tmp" test`(只比對字串常值,應無結果;2026-10-14 前之指令 `rg -n "\./tmp" test` 會命中 `test/tools/api-setup.mjs` 說明 `./tmp` 為 AI 暫存區之註解而誤報).

## R9 曝露與存取控制之自用選項有給而無效時建構即同步拋錯,不得退回預設

**規則**:決定「哪些檔案不經授權即公開」(useInert、pathStaticFiles)與「哪些來源可跨來源讀取回應」(corsOrigins)之自用選項,未給(undefined、null)取預設;有給而無效時於建構時同步拋 `invalid opt.<名>`(R2 之通道,訊息格式同 w-serv-webdata),不得退回預設.檢核位於 Hapi 與 w-converhp 建構之前(w-converhp 建構時即建立 pathUploadTemp),拋錯時不留任何資源.corsOrigins 之值語意比照 w-converhp(其帳本 R26):`false`、`''`、`[]`、`['']` 代表停用跨域(`routes.cors` 為 false,不回應 CORS 標頭);非空字串 s 視為 `[s]`(`'*'` 即允許全部);陣列剔除空字串後交 hapi,hapi 不接受者由其同步拋錯(原訊息).

**why**:原本三者有給而無效即靜默改用預設,而 useInert 與 pathStaticFiles 之預設即公開資料夾——`useInert: 'false'`(環境變數之字串)、`0` 仍公開;`pathStaticFiles: ''`、`123` 即改公開 `dist`;corsOrigins 給 `false`、`[]`、`''`、`'http://a.example'`、`'*'`、`{}` 一律被換成 `['http://localhost']`,`[null]` 因 isearr 單元素陷阱被吞成預設、`[123]` 卻由 hapi 拋錯(同類值分屬兩通道).皆無任何訊號(2026-10-13 修正前實測).對標:expressjs/cors 與 @fastify/cors 之 `origin: false` 為停用、字串為單一來源;serve-static 與 @fastify/static 之 root 無效即設定時拋;hapi 之設定以 Joi 驗證,不合法即拋.

| 選項 | 未給 | 合法 | 有給而無效 |
|---|---|---|---|
| useInert | true | 布林 | 拋 `invalid opt.useInert` |
| pathStaticFiles | `'dist'` | 非空字串 | 拋 `invalid opt.pathStaticFiles`(不論 useInert,同 fpTableTags 之寫法) |
| corsOrigins | `['http://localhost']` | `false`/`''`/`[]`/`['']` 停用;字串 → `[s]`;陣列剔除 `''` 後交 hapi | 其他型別(true、數值、物件、函數)拋 `invalid opt.corsOrigins`;hapi 不接受之陣列由 hapi 拋 |

**盤點**:`rg -n "ownOpt\(" src/WServHapiServer.mjs`(恰 3 處呼叫:corsOrigins、useInert、pathStaticFiles);`rg -n "ownOpt\(|new Hapi.Server|new WConverhpServer" src/WServHapiServer.mjs`(後兩者之行號須大於三處呼叫).

| 刻意不套 | 理由(可挑戰) |
|---|---|
| port | R5:無效取 8080(比照 w-converhp) |
| apis、useShowLog | 無效值所取之預設即安全側(不加路由/印 log),比照 w-serv-webdata 之 useDbOrm「非布林值視為未指定」.apis 之 `[{}]` 因 isearr 單元素陷阱被視為未給、`[{}, {}]` 則於 start 時由 hapi 拒絕,兩者不一致但皆不曝露 |
| verifyConn(轉傳) | R1:由 w-converhp 單一擁有.w-converhp 2.1.7 起對有給而非函數者一律 permission denied,並於建構期發一則 error 事件(經 R3 於 ready 前送達);2.1.6 為放行(原 L4).與自用選項之通道不同(事件 vs 拋錯)係單一擁有之結果 |
| 包裝物件(`new Boolean(false)`、`new String('')`) | 家族共用之判定式(wsemi isbol 即 lodash isBoolean、isestr)接受之:前者為真值而仍公開,後者使資料夾成為 `'/'`.由程式碼推得,未實測;非實際用法,w-converhp 同判定式,不另訂 |
| corsOrigins 剔除空字串 | 變異驗證之等價變異:hapi 對 `['']` 本即無人相符,規格上觀察不到差別(只差預檢狀態碼 404 與 200,規格未定);保留以與 w-converhp 之實作與內部狀態一致 |

**測試**:`test/api-exposure.test.mjs`.

## R10 前端:回傳物件於回傳前即存在,設定錯誤同步拋出,等待 token 無上限且可取消

**規則**:

1. 函數型選項(getToken、getServerMethods、recvData、四個回調函數)未給(undefined、null)取預設,有給而非函數時建構即同步拋 `invalid opt.<名>`;useWaitToken=true 而未給 getToken 時同步拋 `invalid opt.getToken when opt.useWaitToken=true`.兩種 useWaitToken 皆同一通道.
2. 回傳 w-converhp 前端之事件物件(其建構不連線、不起計時器),於回傳前即建立;useWaitToken=false 時於建構子內同步建立資料同步(w-serv-webdata 於同一物件上擴充),true 時延後至取得 token.
3. 等待 token:每 100ms 呼叫 getToken,回傳非空字串(可為 promise)即建立資料同步;不設次數上限;前一次之 promise 未結束前不再呼叫;首次檢查於建構子回傳後.getToken 拋錯或 reject 時發一則 error 事件(內容為其拋出值)並停止等待.
4. clearBroadcast、clearSync 於回傳前即掛上:等待期間呼叫任一者即取消等待(清除計時器,其後 getToken 之結果不再作用、不發 error);建立資料同步後物件上之同名函數為 w-serv-webdata 所提供,等待期間取得之參照轉呼叫之.名稱沿用下游(R4).建立資料同步後之停止範圍見 R12.
5. 本套件自發之 error(等待期間 getToken 之拋錯、建立資料同步之非預期例外)於回傳物件無 error 監聽者時改以 console.error 輸出(前綴 `[w-serv-hapi]`),有監聽者時經 evEmit 派發(R11).同一物件上下層各自之 error 依其自身之政策:w-serv-broadcast、w-sync-webdata 無監聽者時 console.error,w-converhp、w-serv-webdata 無監聽者時不輸出(本套件不攔截下層之派發).

**why**:2026-10-13 w-serv-broadcast 主責 agent 提報(建議w-serv-hapi修正.md)與 L6:useWaitToken=true 或建構中出錯時回傳 null,失敗處理對 null emit 後再拋 → 未處理之 rejection → Node 行程 exit 1.盤查同類另得三項:wsemi 之 waitFun 預設 attemptNum 200(timeInterval 100 即約 20 秒)後 reject,同樣走到對 null emit;等待途中 getToken 拋錯於 waitFun 之 setInterval async 回呼內成未處理之 rejection;等待期間無任何停止手段.對標:socket.io-client(`autoConnect:false` 延後連線、`disconnect()` 任何時刻可呼叫、重連次數預設 Infinity)、graphql-ws(`lazy`、`dispose()`).

**盤點**:`rg -n "funOpt\(|startSync|checkToken|tWait|kpClear|cleared" src/WServHapiClient.mjs`.

| 刻意不套 | 理由(可挑戰) |
|---|---|
| useWaitToken、useShowLog 非布林 | 取預設(不等待、印 log),同伺服端 useShowLog 與 w-serv-webdata 之 useDbOrm「非布林值視為未指定」 |
| 建立資料同步後之停止 | 由下游之 clearBroadcast、clearSync 負責(單一擁有);其中止範圍與刻意不中止者見 R12 |
| 環境無 AbortController 之通道 | w-serv-broadcast 1.1.9、w-serv-webdata 1.1.12 於建構時拋 `AbortController is not available`:useWaitToken=false 同步拋出,true 則取得 token 後經 emitError 發一則 error 且不建立資料同步(通道與規則 1 不同).實際支援之環境皆具備,不另於本套件前置檢核(2026-10-14 裁示 F-b,見 L11) |
| 前端單一停止函數 | 不提供(2026-10-14 裁示 D-b):兩者皆須呼叫,JSDoc 與範例強調 |

原「刻意不套:本套件自發 error 於無監聽者時,eventemitter3 直接遺失,與同一物件上下游各層之 error 一致」於 2026-10-14 撤銷:該前提不成立(w-serv-broadcast、w-sync-webdata 無監聽者時印 console.error),改為規則 5(裁示 H-a).

**測試**:`test/unit-client-init.test.mjs`、`test/api-client-wait-token.test.mjs`、`test/api-error-listener.test.mjs`(前端案).

## R11 本套件自發之 error 一律經 wsemi 之 evEmit 派發

**規則**:伺服端之 emitError(含建構期暫存者之轉出;伺服端之 error 一律經此,含轉送之下層 error)與前端之 emitError,於派發當下外層事件物件無 error 監聽者時改經 wsemi 之 `getDiag` 出口輸出(預設只輸出固定標籤與安全摘要,`logDetail`／`funLog` 取細節,見 R16;2026-10-31 前為 `console.error('[w-serv-hapi]', maskDiagErr(err))`),否則以 `evEmit(ev, 'error', [err], optEmit)` 派發(`optEmit = { tag: 'w-serv-hapi', logDetail: get(opt, 'logDetail'), funLog: get(opt, 'funLog') }`,與 `diag` 同源〔使用端 opt〕,2026-11-01 起帶 `logDetail`／`funLog`,見 R16 規則 5);使用端 error 監聽器之同步拋錯由 evEmit 攔截並經 wsemi 之 `getDiag` 輸出通報(預設 `console.error('[wsemi w-serv-hapi] listener threw', { errType })`,不含拋出值;`logDetail:true` 輸出遮罩後細節;`funLog` 只交給它),不影響 ready 與 stop 之結果.

**why**:①伺服端之派發點位於計時器(pmFlush)、啟動失敗之 catch、stop 之內,直接 `ev.emit` 時監聽器之拋錯在計時器即成 uncaughtException、在 catch 即成未處理之 rejection(2026-10-13 子行程實測:修正前兩情境皆以 exit 1 結束),在 stop 內則使其 promise reject 而違反「恆 resolve」.②無監聽者時(2026-10-14 審計 F14,裁示 H-a):本套件常駐之轉送監聽(`instWConverServer.on('error', emitError)`)使下層判定「有人在聽」——wsemi `evEmit` 對下層監聽器之拋錯改 emit error 而不印、w-serv-broadcast 與 w-sync-webdata 之 error 不再走其「無監聽者即 console.error」——再於外層 eventemitter3 無人聽時丟棄,下層本會印出之錯誤經本套件後靜默.改為無監聽者即 console.error,與 w-serv-broadcast、w-sync-webdata 之「失敗不可無聲」一致.原「與下游各層之派發政策一致」只對派發安全(evEmit)成立,對無監聽者之處置不成立(w-converhp、w-serv-webdata 為靜默),已更正.

**盤點**:`rg -n "\.emit\('error'" src`(應無結果);`rg -n "evEmit\(|listenerCount\('error'\)" src`(伺服端、前端各 1 處 evEmit 與 1 處 listenerCount).

**測試**:`test/api-error-listener.test.mjs`(監聽器拋錯不崩潰:建構期 error、啟動失敗、前端 getToken 三端 × 預設／`logDetail:true`／`funLog` 三面向共 9 案〔2026-11-01 前為預設三案,斷言 stderr 含監聽器拋出之原文,wsemi 1.9.34 起 evEmit 預設只輸出安全摘要而轉紅〕;未掛 error 監聽時,伺服端之下層監聽器拋錯、伺服端自發之啟動失敗、前端自發之 getToken 拋錯皆以 `[w-serv-hapi]` 前綴出現於 stderr 之子行程案).

## R12 停止之範圍與順序(2026-10-14)

**規則**:

1. **前端**:停止須呼叫 clearBroadcast 與 clearSync 兩者.兩者皆呼叫後,本套件與下層自身之請求(w-serv-broadcast 之輪詢;w-serv-webdata 之取得函數清單、時間戳與同步表資料)不再送出,停止時在途者一併中止:不再重試、不再發出其各次嘗試失敗之 error、不再為其呼叫 getToken、不再撐住 Node 行程;伺服器已開始之處理照常完成而其結果忽略.中止由下層各自擁有(w-converhp 2.1.8 之 per-call `opt.signal`、w-serv-broadcast 1.1.9 之輪詢中止、w-serv-webdata 1.1.12 之 acSelf),本套件不另中止、不另包裝(R1 單一擁有);相依版本為其條件(package.json 已要求).
2. **只呼叫其一**:只呼叫 clearSync 時輪詢照常、行程不結束;只呼叫 clearBroadcast 時 w-sync-webdata 照常,停止時在途之同步表請求被中止而由其發一則 `{msg:'can not get table data: <表>', err:'stopped by clearBroadcast or clearSync', tableName, timeTag}`.
3. **伺服端 stop**:依序 clearBroadcast、clearSync(w-serv-webdata 伺服端規則 9),再 `server.stop()`(不帶參數).hapi 只等**連線**(閒置者立即 end,作用中者最多 5 秒後 destroy),不等也不中止應用處理(operOrm、kpFunExt)與上傳之合併 worker:連線已斷者 stop 即完成,處理續行並照常寫入副作用,行程待其完成.clearSync 補寫尚未落檔之時間戳,失敗發 error.stop 為終態:其後 ready 仍回原結果,勿以 getServer 所得實體重新 start(下游已釋放,只剩半個服務),再呼叫 stop 回傳同一 promise 而不再停;勿自行呼叫 getServer 所得 hapi 之 stop 或 getInstWConverServer 所得實體之 stop(並發時 hapi 於 stopping 階段拒絕,本套件 stop 發一則 `Cannot stop server while in stopping phase` 並提早 resolve).
4. **順序**:宜先停止前端再停止伺服器;先停伺服器時,前端停止前之輪詢失敗皆發 error.

**why**:2026-10-14 審計(建議書第 3 點):先停前端後立即停伺服器(retryMain=3),w-serv-webdata 1.1.11 下停止後仍有 4 則 error、6 行重試訊息、getToken 3 次、行程約 6 秒才結束(1.1.10 為 5 則);1.1.12 為 0/0/0、0–2ms;本套件之 `funcNamesOf`(api-options)即此情境,使 `npm test` 夾 12 行重試訊息.伺服端之語意由獨立複審實測更正(原以為「等在途請求最多 5 秒」,實為只等連線).

**盤點**:`rg -n "clearBroadcast|clearSync" src`(前端包裝 `src/WServHapiClient.mjs` 一處迴圈、伺服端 `clearDownstream` 一處迴圈);`rg -n "server\.stop\(" src`(恰 1 處,於 stop 內).

**站點全集**(前端停止時之在途點 × 結果;1.1.12+1.1.9):

| 在途點 | 停止後 error/重試訊息/getToken | 行程 | 測試 |
|---|---|---|---|
| 等待 token(計時器、getToken 之 promise) | 0/0/0 | 立即 | unit-client-init |
| 輪詢在途或其重試退避中(伺服器不可達、或已先停) | 0/0/0 | 立即 | api-client-stop「伺服器不可達…」「先停伺服器…」 |
| 首次輪詢成功時(取得函數清單在途) | 0/0/0 | 立即 | api-client-stop「首次輪詢成功時停止…」 |
| 取得函數清單後(取時間戳在途) | 0/0/0 | 立即 | api-client-stop「取得函數清單後立即停止…」 |
| 同步表 select 在途(伺服端處理中) | 0/0/0;伺服器 stop 不等該連線 | 待伺服端處理完成 | api-client-stop「同步表之select在途時停止…」 |
| 使用端 $fapi 在途 | 依設計不中止(見刻意不套) | 依其重試 | api-client-stop「$fapi在途時停止…」 |

| 刻意不套 | 理由(可挑戰) |
|---|---|
| 使用端經 getServerMethods 所取得函數($fapi)之呼叫 | w-serv-webdata 檔頭明載不受停止影響;停止後先前取得之函數仍可呼叫;連同中止須改變其語意(2026-10-14 裁示不立項 A2) |
| 直接呼叫回傳物件之 execute、upload、download | w-converhp 之 per-call `opt.signal` 由使用端自帶;upload 合併輪詢於兩端停止後無上界(w-converhp 設計「持續至應用端接受為止」),JSDoc 載明須帶 signal |
| 伺服端 stop 之 hapi timeout | 不開放參數(2026-10-14 裁示 F3 (a)) |
| stop 後補發之 clientLeave、clientChange | w-serv-broadcast 以 1ms 計時器補發,可能晚於 stop 之 resolve;本套件不等待(依賴下層內部延遲,裁示 G-b,見 L10) |
| 前端單一停止函數 | 不提供(裁示 D-b) |

**測試**:`test/api-client-stop.test.mjs`(子行程:停止後 error 0 則、重試訊息 0 行、getToken 0 次、伺服器 stop 後 500ms 內結束;$fapi 在途照常 resolve);`test/api-options.test.mjs`(下游清理拋錯、補寫、補寫失敗);`test/tools/child-exit.mjs` 之 stop-* 模式.

## R13 身分驗證責任與系統函數之身分關卡由下游單一擁有,本套件不訂預設(2026-10-24)

**規則**:

1. 本套件不驗證 token,只於各關卡轉交使用方注入之函數:`verifyConn` 交 w-converhp,`getUserIdByToken`、`authorizeExec`、`sysFuncsPublic` 交 w-serv-webdata,皆原樣轉傳(R1).未注入時之預設為放行或無身分,使用方不得依賴預設.JSDoc 須載明:伺服端類別開頭、`getUserIdByToken`(「此即驗證身分之步驟,須完整驗證」,不可只解碼或只查 id,與 `verifyConn` 同等完整)、`sysFuncsPublic`、前端 `getToken`;README 載明〈Identity verification〉與〈Upgrade Notes〉.跨套件原則:`C:\opensrcOper\dspec\使用者身分驗證原則.md`.
2. `sysFuncsPublic`(w-serv-webdata 1.1.16 起):未給(undefined、null)取下游預設——`[sys:getFuncList]`、`[sys:polling]`、`[sys:getTableTags]` 三者皆公開(相容既有前端元件);有給時原樣轉傳,無效由下游同步拋(R2).**本套件不另訂預設、不收緊、不檢核**:收緊之預設會使已發布之前端元件(輪詢不帶 token)即時同步失效,嚴格設定由使用方顯式為之.建議使用方於前端改用帶 token 之元件後顯式設為只公開 `['[sys:getFuncList]']`;未登入須能進登入頁者(如 w-web-sso)須列出確實需要者.
3. 輪詢之身分與 clientId 綁定(下游規則,本套件 JSDoc 與 README 轉述;以 userId 計,同一使用者換另一枚 token 不受影響):同一前端連線(同一 clientId)中途換成他人身分之輪詢被拒,error 事件原因因情境而異——換成他人有效身分,或預設(三者公開)下無身分與有身分互換(匿名亦被綁定為空身分):`clientId belongs to another userId`,至舊綁定因該 clientId 逾時離線解除為止(實測約 9 秒;期間之表變更推播不補送);嚴格設定(未公開 `[sys:polling]`)下由有身分變無身分:先被關卡拒絕(`empty userId`),不進歸屬檢查,且之後仍被拒.換身分須重載頁面或重建前端連線.**測試不得以中途換 token 模擬「無權限」**——測到的是歸屬而非授權,無權限一律由 `authorizeExec` 之回應模擬,亦不得以放寬歸屬處理.
4. `getUserIdByToken` 拋錯或 reject 一律拒絕(含列於 `sysFuncsPublic` 者,且先於是否公開之判定):一般呼叫回應其值並發 error 事件(該值本身);輪詢前端只見固定訊息 `[sys:polling] permission denied`,伺服端 error 事件為 `{ msg:'[sys:polling] verifyPolling error', err: 其值 }`.缺 `__sysToken__` 鍵之輪詢(已發布之舊前端元件)不反查、以無身分處理——故「輪詢每輪反查一次」只適用帶鍵者,JSDoc 與 README 已限定.

**why**:2026-10-24 w-serv-webdata 1.1.16(含 w-serv-broadcast 1.1.11 起之輪詢驗證鉤子 `verifyPolling`、前端 `getToken`)新增系統函數之身分關卡;主控裁定預設相容(自有套件發布只升 patch,下游以 `^` 範圍自動取得框架新版,而已發布之下游前端建置檔仍為舊元件,故框架新增之收緊預設須相容,嚴格設定由使用方於其前端改用新元件之同一版本顯式開啟).本套件原即整包轉傳(R1),選項自動到達下游,只需文件(`unit-optDoc` 轉紅提醒)與行為測試.

**盤點**:`rg -n "sysFuncsPublic" src`(應只見 JSDoc 與註解,無本地預設或檢核之程式碼);`rg -n "\.\.\.opt" src/WServHapiServer.mjs src/WServHapiClient.mjs`(兩端各一處整包轉傳).

**站點全集**(系統函數 × token 狀態 × 設定;「放」為放行、「拒」為以固定訊息拒絕並發 error 事件、「值」為以 `getUserIdByToken` 之拒絕值拒絕〔輪詢前端則只見固定訊息,記為「拒」〕;token 狀態依序為無 token、無效 token〔getUserIdByToken 回空字串〕、有效 token、驗證失敗〔getUserIdByToken reject〕;皆於真 HTTP 以 `WConverhpClient.execute` 直打,`test/api-sys-funcs.test.mjs` 以人工列出之預期表斷言,並逐項斷言期間伺服端新增之 error 事件無多無少):

| 設定(八種子集中取五,各函數獨立以是否列於陣列判定) | `[sys:getFuncList]` | `[sys:getTableTags]` | `[sys:polling]` |
|---|---|---|---|
| 未給(及 null) | 放/放/放/值 | 放/放/放/值 | 放/放/放/拒 |
| `['[sys:getFuncList]']` | 放/放/放/值 | 拒/拒/放/值 | 拒/拒/放/拒 |
| `['[sys:getFuncList]','[sys:getTableTags]']` | 放/放/放/值 | 放/放/放/值 | 拒/拒/放/拒 |
| `['[sys:polling]']` | 拒/拒/放/值 | 拒/拒/放/值 | 放/放/放/拒 |
| `[]`(且建構後對原陣列 push 三者,不生效) | 拒/拒/放/值 | 拒/拒/放/值 | 拒/拒/放/拒 |
| `['[sys:getFuncList]']` 且不開資料通道(useDbOrm 未指定;無表操作與同步表,故只驗清單與輪詢) | 放/放/放/值 | — | 拒/拒/放/拒 |

| 前端 × 設定 | 結果 | 測試 |
|---|---|---|
| 無 token(getToken 回空字串)× 未給 | 綁定、同步表資料到達、變更後收推播,無 error | api-sys-funcs「無token之前端(getToken回空字串)可綁定…」 |
| 舊前端元件(輪詢輸入恰為 `{ clientId }`)× 未給 | 同上 | 「舊前端元件…可綁定」(夾具:包裝通訊物件之 execute 剝除 `__sysToken__`,並以伺服端被動觀察者確認輸入鍵) |
| 舊前端元件 × 未給 × getUserIdByToken 對空 token 拒絕(perm 型,fail-closed) | 綁定、同步、收推播;伺服端記錄之反查 token 無空字串(缺鍵之輪詢不反查);新元件亦可,與舊元件並存 | 「getUserIdByToken對空token拒絕…」兩案 |
| 無 token × 嚴格 | 不綁定、無資料、前端見 `[sys:polling] permission denied`、伺服端見 `{ msg:'[sys:polling] permission denied', err:'empty userId' }`;觀察屏障為變更之後又經一輪被拒之輪詢 | 「無token之前端不綁定…」 |
| 舊前端元件 × 嚴格 | 同上(輸入鍵確認為 `clientId`) | 「舊前端元件…被拒絕而不綁定」 |
| 有效 token × 嚴格 | 綁定、同步、收推播,無 error(對照:輪詢輸入鍵為 `__sysToken__,clientId`) | 「有效token之前端可綁定…」 |
| 無 token × 清單與時間戳公開、輪詢私有 | 不綁定(元件須先輪詢成功才取清單與時間戳) | 「公開[sys:getFuncList]與[sys:getTableTags]: 無token之前端…」 |
| 無 token × 輪詢公開、清單私有 | 輪詢成功但取清單被拒,不綁定、無資料 | 「只公開[sys:polling]: 無token之前端…」 |
| 換身分 × 預設 × 他人有效身分 | 同 clientId 之輪詢被拒(原因 `clientId belongs to another userId`)、期間變更不送達;重建前端(新 clientId)正常 | 「…於預設下亦被拒絕…」 |
| 換身分 × 預設 × 由無身分變有身分 | 同上(匿名亦被綁定) | 「…由無身分變有身分…」 |
| 換身分 × 預設 × 同一使用者另一枚 token | 輪詢不受影響、變更照常送達、無 error | 「同一使用者換另一枚token…」 |
| 換身分 × 嚴格 × 他人有效身分 | 同預設(原因 `clientId belongs to another userId`) | 「同一前端連線中途換成他人身分之輪詢被拒絕…」 |
| 換身分 × 嚴格 × 有身分變無身分 | 被關卡拒絕(原因 `empty userId`),不待歸屬解除,不重建為無身分仍被拒 | 「…由有身分變無身分…」 |
| 有給而無效(字串、物件、0、false、含非系統函數名、含 null 之陣列) | `new` 即同步拋 `invalid opt.sysFuncsPublic[...]`(直接以 `assert.throws(() => new WServHapiServer(…))` 觀察同步性),不退回預設 | 六案;null 視為未給取預設 |

| 刻意不套 | 理由(可挑戰) |
|---|---|
| 本套件訂嚴格預設或檢核 `sysFuncsPublic` | 違反 R1 單一擁有;嚴格預設使已發布之前端元件失效(主控 2026-10-24 裁示預設相容).各 w-web-* 之嚴格設定由主控另輪連動 |
| 測試等待 10 秒讓歸屬綁定逾時解除 | 慢測且屬下游規則(w-serv-webdata 之 R17);以一次性探針實測(2026-10-24:換身分後第 1 至 5 次輪詢被拒、約 9 秒後恢復放行,其後之變更送達;換身分當時之變更未補送)記於 README 與 JSDoc,不入測試 |
| 非字串 token 或 userId 之轉換(raw 請求經 cstr、前端元件非字串 token 轉空字串、反查回傳非字串視為空身分)、被拒輪詢不建立在線身分與佇列且不刷新存活時間、反查在途時停止與停止後之輪詢 | 下游自身邊界,由 w-serv-webdata(genPollingGate、Exec)與 w-serv-broadcast 單一擁有並測試(R1);本套件測的是「選項與 token 確實到達下游,行為與所給之設定一致」 |
| 八種子集全測 | 各函數獨立以 `includes(func)` 判定(下游 Exec);五種涵蓋未給、單一函數、兩函數、空、僅輪詢,足以分辨「固定某一組」「只取第 1 個」「空陣列視為未給」等轉傳變異(變異驗證) |
| 反查結果快取 | 下游不快取(每輪多一次 getUserIdByToken),成本與撤銷延遲之取捨由使用方決定 |
| `apis` 路由與 `kpFunExt` 之身分把關 | 使用方各自為之(JSDoc 已載);本套件不介入 |

**下游觀察(外審提出,推測,未實測,不在本套件修正範圍)**:w-serv-broadcast 1.1.12 於 clientId 逾時離線時「先清佇列、再以約 1ms 計時器發 clientLeave」,而 w-serv-webdata 於 clientLeave 才解除該 clientId 之歸屬綁定;若同一前端於此約 1ms 內重新輪詢(仍通過舊綁定),其後舊 clientLeave 到達即解除綁定,他人再以同一 clientId 輪詢可重新綁定並取走新佇列(`w-serv-broadcast/src/WServBroadcastServer.mjs:127-136`、`w-serv-webdata/src/genPollingGate.mjs:59-75`).時間窗為毫秒級,前端輪詢間隔 2 秒;已列入報告供主控轉下游,本套件不處理.

**測試**:`test/api-sys-funcs.test.mjs`(新,27 案,port 8 個)、`test/api-sync-authorize.test.mjs`(改以授權函數模擬無權限)、`test/unit-optDoc.test.mjs`.

## R14 診斷輸出選項(logDetail、funLog)由下游單一擁有,原樣轉傳;前端於 useWaitToken=true 時先行檢核(2026-10-28)

**規則**:

1. w-serv-webdata 1.1.18 起之 `opt.logDetail`(布林,預設 false:診斷輸出只含固定標籤與不含資料值、使用者 id、token、錯誤原文之摘要;true 還原完整細節)、`opt.funLog(label, safe, detail)`(給予時診斷輸出只交給它而不寫 console)為只負責轉傳之選項(R1):伺服端 `{ ...opt, fpTableTags }`、前端 `{ ...opt, getToken, getServerMethods, recvData }` 整包轉傳,本套件不訂預設.憑證與 token 一律遮罩為 `***`(下游契約;w-serv-webdata 1.1.20 起經 wsemi 共用模組,原為 `[token]`,見 R15).
2. 前端 `useWaitToken=true` 時 w-serv-webdata 延後至取得 token 才建構,故 `logDetail`(有給非 undefined、null 須為布林)與 `funLog`(有給須為函數)與四個回調函數同理由本套件先行檢核,拋 `invalid opt.logDetail`、`invalid opt.funLog`(不論 useWaitToken).未先行檢核時無效值晚於建構才以 error 事件出現,`unit-client-init` 之行為比對自下游前端 JSDoc 取選項名,新增選項即轉紅(2026-10-28 實際轉紅).
3. JSDoc 兩端各列 `@param opt.logDetail`、`@param opt.funLog`,載明預設不含個資,並載明其涵蓋本套件與 w-serv-webdata 之診斷輸出、不涵蓋其他下層(w-converhp、w-serv-broadcast、w-sync-webdata)自身之輸出(2026-10-31 起:本套件自身之無監聽者 console 出口預設只輸出安全摘要,`logDetail`／`funLog` 取細節,見 R16;原僅涵蓋 w-serv-webdata,本套件出口以 `maskDiagErr` 遮罩,見 R15).

**why**:2026-10-28 w-serv-webdata 1.1.18 新增二選項(診斷輸出預設改為不含個資);本套件原即整包轉傳,選項自動到達下游,只需文件(`unit-optDoc` 轉紅提醒)、先行檢核(`unit-client-init` 轉紅提醒)與行為測試.下游之診斷輸出站:前端回調函數於停止後才拋錯(`[w-serv-webdata] callback error after stop`)、伺服端 `instWConverServer` 非有效物件(經本套件建構恆為物件,不會觸發).

**盤點**:`rg -n "console\.(log|error)\(" src/*.mjs`(本套件自身之輸出站,全集 6 處,逐站處置見 R15);`rg -n "logDetail|funLog" src/*.mjs`(轉傳為整包 `...opt`,僅前端有先行檢核).

| 站點 | 歸類 | 判準 |
|---|---|---|
| 伺服端 `{ ...opt, fpTableTags }`(`src/WServHapiServer.mjs` 之 new WServWebdataServer) | 轉傳 | 已套 |
| 前端 `optWebdata = { ...opt, ... }`(`src/WServHapiClient.mjs`) | 轉傳 | 已套 |
| 前端 logDetail、funLog 先行檢核 | 先行檢核 | 已套(同回調函數,見 R1 表) |
| 伺服端 `new WServHapiServer` 之 logDetail、funLog 檢核 | 下游擁有 | 刻意不套(R1):下游於建構時同步拋錯 |

**測試**:`test/api-diaglog.test.mjs`(8 案,port 2 個)——伺服端無效值同步拋錯與有效值不拋(伺服端於經本套件建構時無診斷輸出站,以此證明選項已到達下游);前端以 `recvData` 於前端停止後才拋錯觸發下游診斷輸出,三組(預設:只含標籤與摘要、不含錯誤原文與 token;`logDetail:true`:還原完整細節、token 遮罩;`funLog`:只交 funLog、不寫 console、detail 含原文且 token 遮罩)× `useWaitToken` 兩種;`test/unit-client-init.test.mjs` 之 logDetail、funLog 先行檢核(兩種 useWaitToken、無效值與 undefined、null、有效值)與下游行為比對;`test/unit-optDoc.test.mjs`.

## R15 診斷輸出與遮罩由 wsemi 單一擁有,本套件之 console 出口與自發 error 經 `maskDiagErr`(2026-10-30)

> **2026-10-31 更正(排程第 158 項,見 R16)**:console 出口改為預設只輸出安全摘要,並由 wsemi 之 `getDiag` 之出口 `diag` 輸出(`logDetail`／`funLog` 取細節;遮罩由 `diag` 內之 maskDiagCopy 與 `diag.err` 提供),故下列規則 1(「無 `getDiag` 實例、無 `diag` 站點」)與規則 3(「console 出口一律 `maskDiagErr`」)及站點表之 console 出口列、行號**由 R16 取代**;規則 2(無靜態秘密)、4(交監聽器之值)、5、6 不變(規則 4 之前端 `getToken` 遮罩由 `maskDiagErr` 改為等價之 `diag.err`).下文保留原貌供對照.

**依據**:主控 dspec〈診斷輸出與遮罩〉(`C:\opensrcOper\dspec\診斷輸出與遮罩.md`,D1～D5、Q1～Q4、P1～P9;排程第 161 項)與 wsemi 規則帳本 `sgud/rule/rulebook_diag.md` R-DIAG-01(wsemi 1.9.31 起之共用模組:`getDiag`、`getDiagSecrets`、`maskDiagText`、`maskDiagCopy`、`maskDiagErr`、`maskDiagUrl`、`getDiagBriefErr`、`genDiagFunLog`).**本節只記本套件之宣告與處置,遮罩規則本身以 wsemi 為準,不在此重述.**

**規則**:

1. 本套件是**轉傳端**(設計 §1;非 14 份自製實作之一):無 `getDiag` 實例、無 `diag(label, safe, detail)` 站點、不宣告 `secrets`／`safeKeys`／`patterns`／`codes`／`types`／`nested`,也**不另寫任何遮罩**(無 `src/getDiag.mjs` 類檔案,亦不新增);`logDetail`、`funLog`、`onTrace` 整包轉傳 w-serv-webdata(R1、R14).`bare`／`method`／`isErr` 類舊參數、結果物件之逐筆 `err`:本套件皆無(N/A).
2. 本套件**不持有靜態秘密**:token 為 `getToken` 之動態回傳值,由 w-serv-webdata 之 token 簿記住;故遮罩**不給秘密清單**,只套 wsemi 之通用憑證樣式(網址帳密、`password=`、`token=`、`Authorization`、`Bearer`),不含者原樣(身分不變).**不以近期取得之 token 作前端遮罩秘密**(曾擬 `tokenSeen`,棄用):前端 `getToken` 拋錯時恆無已取得之 token,唯一會作用之 `startSync` 之 catch 只見 w-serv-webdata 建構時之固定詞彙錯誤(`AbortController is not available` 等),套用秘密比對有「挖空後反推短 token」之風險(dspec D3:固定詞彙之 reject 不包).
3. **console 出口一律 `maskDiagErr(err)`**:伺服端 `emitError`(無 error 監聽者時)與前端 `emitError`(無 error 監聽者時)各 1 處;所有 `emitError` 之呼叫(下層轉送、clearDownstream 之 catch、啟動失敗、stop 內 server.stop 之 catch;前端之 getToken 與 startSync)皆經此出口,不得另有繞過它直接 `console.error` 之站點.
4. **交給使用端 error 監聽器之值**:伺服端**原樣**(轉送端不改下游之值;下游自負其遮罩——w-serv-webdata 1.1.20 已對自身所發之 error 經 `diag.err`;w-converhp 之同型出口另案).前端僅 **`getToken` 之拋出值與 reject 值**於 catch 站點(`checkToken`)先 `maskDiagErr`(使用端回調之外來值;`useWaitToken=false` 時由 w-serv-webdata 遮罩其拋錯,兩模式須一致);`startSync` 之例外(w-serv-webdata 建構時之固定詞彙錯誤)不遮罩.
5. 固定詞彙之同步拋錯(`invalid opt.X`、`invalid opt.getToken when opt.useWaitToken=true`)不經遮罩;`ready()` 之 reject 為 hapi 啟動錯誤之原值(R2:以原錯誤 reject),不經遮罩.
6. 發現 wsemi 函數之缺陷依全域設定 §5.2 通報(`建議wsemi修正.md`),**不在本套件繞道**.

**why**:2026-10-28 L15(待裁示):本套件 2 處無監聽者之 `console.error` 原樣輸出 error 事件值,可能含下層轉送之使用端錯誤原文、`getToken` 之拋出值,不經任何遮罩(設計 §2.5 補表、§6.10 X20).2026-10-30 起改經 `maskDiagErr`(L15 解除).

**站點全集**(盤點 `rg -n "console\.(log|error)\(|emitError\(|evEmit\(|throw new Error|\.on\('error'" src/*.mjs`;無空白格):

| 檔:行 | 站點 | 值之來源 | 處置 | 守住之測試 |
|---|---|---|---|---|
| `WServHapiServer.mjs:341` | console.error 出口(emitError,無監聽者) | 下層轉送、hapi 與本套件自發 | **包 `maskDiagErr`** | api-diaglog-mask:伺服端 console 出口 6 案、語料 T07／R01 |
| `WServHapiServer.mjs:344` | evEmit 交監聽器 | 同上 | 不包(轉送端不改下游之值) | api-diaglog-mask:伺服端交給監聽器之值 1 案 |
| `WServHapiServer.mjs:386` | 轉送監聽 `instWConverServer.on('error', emitError)` | w-converhp、w-serv-webdata(已遮)、w-serv-broadcast、w-sync-webdata 之 error | 不包,經 :341 出口 | 同上(`inst.emit('error', …)`) |
| `WServHapiServer.mjs:434` | 建構期暫存之轉出 | 建構期下層 error | 不包,經 :341 出口 | api-error-listener(R3) |
| `WServHapiServer.mjs:406` | clearDownstream 之 catch | w-serv-webdata 之 clearSync 等拋錯 | 不包,經 :341 出口 | api-diaglog-mask:clearDownstream 案 |
| `WServHapiServer.mjs:487` | 啟動失敗 `pmStart.catch` | hapi／inert／路由衝突／listen 之錯誤 | 不包,經 :341 出口 | api-diaglog-mask:啟動失敗案(路由衝突訊息含 `password=`) |
| `WServHapiServer.mjs:511` | stop 內 `server.stop` 之 catch | hapi 停止之錯誤 | 不包,經 :341 出口 | api-diaglog-mask:server.stop 案 |
| `WServHapiServer.mjs:493` | `ready()` 之 reject | pmStart 之原錯誤 | 不包(R2:以原錯誤 reject;無秘密來源) | api-diaglog-mask:啟動失敗案(reject 仍含原文) |
| `WServHapiServer.mjs:278` | `throw new Error('invalid opt.X')` | 固定詞彙 | 不包 | api-options、api-exposure、api-diaglog |
| `WServHapiServer.mjs:391` | console.log `now clients: N` | 固定格式＋客戶端數(w-serv-broadcast)、port | 不包(無外來字串) | — |
| `WServHapiServer.mjs:479` | console.log `Server running at: <uri>` | hapi `server.info.uri`(協定、主機、port;無帳密) | 不包 | — |
| `WServHapiClient.mjs:324` | console.error 出口(emitError,無監聽者) | `getToken` 之拋出值(已先遮罩)、startSync 之例外 | **包 `maskDiagErr`** | api-diaglog-mask:前端 console 出口、語料 T07／R01 |
| `WServHapiClient.mjs:327` | evEmit 交監聽器 | 同上 | 不包(值於 catch 站點處理,見 :384) | api-diaglog-mask:前端交給監聽器之值 |
| `WServHapiClient.mjs:384` | `checkToken` 之 catch(`getToken` 拋出／reject) | 使用端回調之外來值 | **包 `maskDiagErr`** | api-diaglog-mask:前端 getToken 3 案、語料 T07／R01 |
| `WServHapiClient.mjs:402` | `startSync` 之 catch | w-serv-webdata 建構時之固定詞彙錯誤 | 不包(固定詞彙不包);console 出口仍遮罩 | api-diaglog-mask:startSync 案 |
| `WServHapiClient.mjs:265`、`:274`、`:298` | 同步 `throw new Error('invalid opt.…')` | 固定詞彙 | 不包 | unit-client-init、api-diaglog |
| `WServHapiClient.mjs:371`、`:396` | console.log `waiting token...`、`get token` | 固定文字(不含 token 值) | 不包 | — |

**共用語料之適用子集**(`import cases from 'wsemi/src/_diagCases.mjs'`,wire:true 共 20 案):經本套件三條出口(伺服端 console、前端 console、前端交監聽器之值)重跑者 **T07**(未登錄之 Bearer／`token=`／`"password":`／`authorization:` 樣式)、**R01**(不含憑證之錯誤回傳同一物件);其餘 18 案不適用,理由逐案載於測試檔 `WIRE` 表(T01／R02／R04／R07 需已登錄之秘密、R11／R12 含 detail 側、K01／K09／V02／E01／E07／P01／S07 為細節拷貝、C01 為摘要、O01／O15／A01／A07 為 getDiag／genDiagFunLog);語料新增 wire 案例而 `WIRE` 表未判定者,`api-diaglog-mask` 轉紅.

**測試**:`test/api-diaglog-mask.test.mjs`(站點案＋語料接線案,port 2 個)、`test/api-ontrace.test.mjs`(onTrace 轉傳,port 1 個);既有 `api-diaglog`(下游遮罩字樣改 `***`)、`api-error-listener`、`unit-client-init`、`unit-optDoc` 保留為接線測試.

## R16 console 出口預設只輸出安全摘要,`logDetail`／`funLog` 取細節(2026-10-31,排程第 158 項)

**依據**:主控 dspec〈診斷輸出與遮罩〉D1(單一實作)、D2(預設不輸出資料值;`opt.logDetail` 還原細節、`opt.funLog(label, safe, detail)` 由使用端收完整細節);wsemi 1.9.33 之 `getDiag` 一致介面(`diag(label, safe, getDetail, level)`、`diag.brief`、`diag.err`).**遮罩與摘要規則以 wsemi 為準,本節只記本套件之宣告與站點.**

**規則**:

1. 兩端 `emitError` 於派發當下外層事件物件無 error 監聽者時,經 `let diag = getDiag(opt, { safeKeys: ['from'], nested: ['err'] })` 以 `diag('[w-serv-hapi] error', { from, ...diag.brief(err) }, () => err, 'error')` 輸出:**預設** `console.error(label, { from, errType, errCode? })`,不含錯誤訊息文字、`getToken` 之拋出值、`getUserIdByToken` 之拒絕值、使用者識別與任何使用端自填之值;`opt.logDetail===true` → `console.error(label, detail)`(detail 為經 wsemi `maskDiagCopy` 遮罩憑證樣式之拷貝);`opt.funLog` 為函數 → 只交 `funLog(label, safe, detail)`,不寫 console(其拋錯與回傳 promise 之 reject 由 getDiag 吞下).有 error 監聽者 → 照常 `evEmit`,**不寫 console、不呼叫 funLog**,交給監聽器之值依 R15 規則 4(伺服端原樣;前端 `getToken` 之拋出值經 `diag.err` 遮罩).
2. `from` 為固定詞彙(`safeKeys` 白名單,值皆程式內字面值):伺服端 `downstream`(`instWConverServer.on('error')` 轉送之下層 error)、`clear`(clearDownstream 之 catch)、`start`(啟動失敗)、`stop`(stop 內 server.stop 之 catch);前端 `getToken`、`startSync`.建構期暫存之 error 保留其來源別(暫存項為 `{ err, from }`).`errType`、`errCode` 由 `diag.brief` 產生:`errCode` 只取 wsemi 白名單(SYS、NODE 代碼集合)內者,`nested: ['err']` 使 w-serv-broadcast、w-sync-webdata 之 `{ msg, err }` 取其 `err` 之代碼;字串與其他非物件值只有類別(`string` 等).
3. 本套件仍**不另寫遮罩、不持有靜態秘密、不給秘密清單**(R15 規則 2 不變):遮罩只套 wsemi 之通用憑證樣式;不認識之裸字串密碼與 token、不含憑證樣式之錯誤原文與使用端自填之值**不在 `logDetail` 輸出之遮罩保證內**(故預設不輸出).
4. `useShowLog` 之 4 處 `console.log`(伺服端 `now clients: N`、`Server running at: <uri>`;前端 `waiting token...`、`get token`)**刻意不套**:內容為固定詞彙加 port、hapi 之 `server.info.uri`、客戶端人數,無外來值,屬 `useShowLog`(預設 true)既有開關之資訊行而非 error 診斷,仍由 `useShowLog` 控制,`funLog` 不涵蓋(JSDoc、README 已載).
5. **使用端 error 監聽器同步拋錯之通報(2026-11-01,hapi234)亦屬本套件之診斷輸出,同受 `logDetail`／`funLog` 控制**:兩端 `evEmit(…, 'error', [err], optEmit)` 之 `optEmit = { tag: 'w-serv-hapi', logDetail: get(opt, 'logDetail'), funLog: get(opt, 'funLog') }`(建構時取快照,與 `diag` 同源),由 wsemi 之 `evEmit` 經 `getDiag(optEmit)` 輸出:**預設** `console.error('[wsemi w-serv-hapi] listener threw', { errType })`(不含拋出值);`logDetail===true` → `console.error(label, { event, err })`(`err` 為監聽器之拋出值,經 getDiag 遮罩憑證樣式);`funLog` 為函數 → 只交 `funLog(label, safe, detail)`,不寫 console.label 由 wsemi 以 `tag` 組成(`[wsemi <tag>] listener threw`),故 `tag` 不可省.**why**:HEAD(1.1.13)只傳 `{ tag }`,`evEmit` 不知使用端之選項,通報恆走 console、不受 `logDetail`／`funLog` 控制——與 JSDoc「本套件自身之診斷輸出依此二選項」不一致(給 `funLog` 者仍在 stderr 見到通報);且 wsemi 1.9.34(f7cd1d4d3)起 `evEmit` 預設只輸出安全摘要,原斷言「stderr 含監聽器拋出之原文」三案因而轉紅(行程不崩潰、離開碼 0 仍成立).**盤點**:`rg -n "evEmit\(" src/*.mjs`(兩端各 1 處,第 4 參數必為 `optEmit`,不得為字面物件);`rg -n "optEmit =" src/*.mjs`(兩端各 1 處,三鍵齊全).

**why**:2026-10-31 排程第 158 項:R15 之 console 出口雖經 `maskDiagErr`,但 `maskDiagErr` 只遮憑證,不遮使用者識別與使用端自填之值;error 事件內容可含 `getUserIdByToken` 之拒絕值(實測:真實路徑經 w-serv-webdata 以 error 事件送出,本套件轉送後無監聽者時整個 Error 含 stack 與使用者識別被印出,見 `api-diaglog-console` 修前紅)、`getToken` 之拋出值.比照 wsemi `getDiag` 之一致介面:預設只輸出安全摘要(D2),細節由使用端以 `logDetail`／`funLog` 明示取得.

**盤點**:`rg -n "console\.(log|error|warn|info|debug)\(" src/*.mjs`(去掉 JSDoc 示例後全集 6 處,本表逐站列出,無空白格);`rg -n "emitError\(|diag\(|getDiag\(" src/*.mjs`(`diag(` 伺服端、前端各 1 處,不得另有繞過它直接 `console.error` 之站點).

**站點全表**(行號依 2026-10-31 之 src;2026-11-01 起 src 於 emitError 前增 `optEmit` 數行〔伺服端 :336–:339、前端 :325–:327〕,表內其後之行號伺服端約 +4、前端約 +3,以盤點指令為準):

| 檔:行 | 站點 | 值之來源 | 處置 | 守住之測試 |
|---|---|---|---|---|
| `WServHapiServer.mjs:344` | `diag(...)` 出口(emitError,無監聽者;唯一之 error 診斷出口) | 下層轉送、clearDownstream、啟動失敗、server.stop、建構期暫存之轉出 | **改**:預設只輸出標籤與 `{from,errType,errCode?}`;logDetail 輸出遮罩細節;funLog 取代 console | api-diaglog-console 伺服端 10 案(預設 7 案:Error、{msg,err}、字串、getUserIdByToken 真實路徑、clear 與 stop、start〔EADDRINUSE〕、建構期暫存;logDetail、funLog、有監聽者各 1 案);api-diaglog-mask(logDetail 細節之遮罩);api-error-listener(子行程 stderr:預設與 logDetail 兩種) |
| `WServHapiServer.mjs:351`(原 :347) | `evEmit(ev, 'error', [err], optEmit)` 交監聽器 | 同上;監聽器同步拋錯時之通報(wsemi 輸出) | 交監聽器之值不改(轉送端不改下游之值;有監聽者不經 diag);**通報改**(2026-11-01,規則 5):帶 `optEmit`〔`tag`、`logDetail`、`funLog`〕 | api-diaglog-console:有監聽者案;api-diaglog-mask:交給監聽器之值;api-error-listener:伺服端 6 案(建構期、啟動失敗 × 預設／logDetail／funLog) |
| `WServHapiServer.mjs:389-390` | 轉送監聽 `instWConverServer.on('error', …emitError(err, 'downstream'))` | w-converhp、w-serv-webdata、w-serv-broadcast、w-sync-webdata 之 error | **改**:帶來源別 `downstream` | api-diaglog-console(from 斷言) |
| `WServHapiServer.mjs:411` | clearDownstream 之 catch → `emitError(err, 'clear')` | 下游清理之拋錯 | 改(來源別) | api-diaglog-console:clear 與 stop 案 |
| `WServHapiServer.mjs:439` | 建構期暫存之轉出 `emitError(v.err, v.from)` | 建構期下層 error | 改(保留來源別) | api-diaglog-console:建構期暫存案;api-error-listener(R3) |
| `WServHapiServer.mjs:492` | 啟動失敗 `emitError(err, 'start')` | hapi／inert／路由衝突／listen 之錯誤 | 改(來源別) | api-diaglog-console:start 案(EADDRINUSE 代碼);api-error-listener(路由衝突之子行程) |
| `WServHapiServer.mjs:516` | stop 內 server.stop 之 catch → `emitError(err, 'stop')` | hapi 停止之錯誤 | 改(來源別) | api-diaglog-console:clear 與 stop 案 |
| `WServHapiServer.mjs:396` | console.log `Server[port:N]: now clients: M` | w-serv-broadcast 之人數、port | **刻意不套**(R16 規則 4) | — |
| `WServHapiServer.mjs:484` | console.log `Server running at: <uri>` | hapi `server.info.uri`(協定、主機、port;無帳密) | **刻意不套** | — |
| `WServHapiClient.mjs:327` | `diag(...)` 出口(emitError,無監聽者) | `getToken` 之拋出值(已先 `diag.err`)、startSync 之例外 | **改**(同伺服端) | api-diaglog-console 前端 6 案(預設 3 案:同步拋出含代碼、reject 字串、startSync;logDetail、funLog、有監聽者各 1 案);api-diaglog-mask;api-error-listener(子行程) |
| `WServHapiClient.mjs:333`(原 :330) | `evEmit(instWConverClient, 'error', [err], optEmit)` 交監聽器 | 同上;監聽器同步拋錯時之通報 | 交監聽器之值不改;**通報改**(規則 5):帶 `optEmit` | api-diaglog-console:有監聽者案;api-diaglog-mask;api-error-listener:前端 3 案(預設／logDetail／funLog) |
| `WServHapiClient.mjs:387` | checkToken 之 catch → `emitError(diag.err(err), 'getToken')` | 使用端回調之外來值 | 改:`maskDiagErr` → 等價之 `diag.err`,帶來源別 | api-diaglog-console、api-diaglog-mask(前端 getToken 3 案、語料 T07／R01) |
| `WServHapiClient.mjs:405` | startSync 之 catch → `emitError(err, 'startSync')` | w-serv-webdata 建構時之固定詞彙錯誤 | 改(來源別);不遮罩(固定詞彙) | api-diaglog-console:startSync 案;api-diaglog-mask:startSync 案 |
| `WServHapiClient.mjs:374`、`:399` | console.log `waiting token...`、`get token` | 固定文字 | **刻意不套**(R16 規則 4) | — |
| `WServHapiServer.mjs:278`、`WServHapiClient.mjs:265`、`:274`、`:298` | 同步 `throw new Error('invalid opt.…')` | 固定詞彙 | 不改(非 console) | api-options、api-exposure、api-diaglog、unit-client-init |
| src 兩檔 JSDoc `@example` 內之 `console.log`(伺服端 :103、:106、:153、:166、:168、:173、:175、:180、:195、:226;前端 :53–:120 共 17 行) | 註解中之使用範例 | — | 非站點,不改 | — |
| `README.md`、`docs/`(jsdoc 產物)、`scl.mjs`(17)、`srv.mjs`(10)、`web.html`(21) 內之 `console.*` | 範例與示範腳本(隨包發布,但非套件之執行碼) | — | 非站點,不改 | — |
| `test/tools/child-exit.mjs`(29)、`child-client.mjs`(8)、`child-import.mjs`(2) 內之 `console.log` | 子行程之標記輸出(測試工具) | — | 非套件程式,不改 | — |

**共用語料之適用子集**(`wsemi/src/_diagCases.mjs`,wsemi 1.9.33 起 wire:true 共 23 案;新增 A11、C14、U22 為 `genDiagFunLog`、`getDiagBriefErr`、`getDiagSecrets` 之案,判不適用):經本套件之出口重跑者 **T07**(未登錄之憑證樣式)經伺服端 console(logDetail)、伺服端 funLog 之 detail、前端 console(logDetail)、前端交給監聽器之值 4 條出口;**R01**(不含憑證之錯誤回傳同一物件)經前端交給監聽器之值;**K09**(憑證鍵名之值整體 `***`)、**P01**(存取器屬性不執行)經三條細節出口(伺服端 console、伺服端 funLog、前端 console);其餘判定與理由載於 `api-diaglog-mask` 之 `WIRE` 表,語料新增 wire 案例而 `WIRE` 表未判定者轉紅.

**測試**:`test/api-diaglog-console.test.mjs`(新,16 案,port 2 個)——預設輸出、logDetail、funLog、有監聽者四面向 × 兩端;`test/api-diaglog-mask.test.mjs`(改:console 出口案給 `logDetail:true`,新增 funLog 之 detail 路徑、K09、P01 與 WIRE 表之 A11、C14、U22 判定)、`test/api-error-listener.test.mjs`(改:子行程 stderr 預設只含標籤與摘要、不含原文;新增 `logDetail` 兩案,`test/tools/child-exit.mjs` 第 6 參數 `detail`、`child-client.mjs` 之 `no-listener-detail` 模式)。

## 測試總表(由規格衍生)

| 檔案 | 驗證對象 | 規格來源 |
|---|---|---|
| `test/api-diaglog-console.test.mjs` | R16:兩端無 error 監聽者時 console 出口預設只輸出 `'[w-serv-hapi] error'` 與 `{from,errType,errCode?}`(不含錯誤原文、getToken 拋出值、getUserIdByToken 拒絕值〔真實路徑〕、使用端自填之值);`logDetail:true` 輸出遮罩後之細節;`funLog` 只收 `(label, safe, detail)` 不寫 console;有 error 監聽者時不經出口、不呼叫 funLog、交監聽器之值依 R15 規則 4 | JSDoc 之 logDetail、funLog、@returns;R16 |
| `test/api-diaglog-mask.test.mjs` | R15、R16:本套件細節出口(`logDetail:true` 之 console、`funLog` 之 detail)與自發 error 之遮罩接線——伺服端無監聽者時(下層轉送之 Error／{msg,err}、clearDownstream、server.stop、啟動失敗)細節遮罩憑證、細節為同類別副本(原物件不改);交給監聽器之值原樣;前端 getToken 拋出／reject 值遮罩、startSync 之例外不遮罩;共用語料 T07 經 4 條出口、R01 經前端監聽器、K09 與 P01 經 3 條細節出口;語料 wire 案例判定表(含 wsemi 1.9.33 新增之 A11、C14、U22) | JSDoc 之 funLog、@returns;R15、R16 |
| `test/api-ontrace.test.mjs` | `opt.onTrace` 到達 w-serv-broadcast(伺服端 stop 事件、前端 start／request／result／stop 事件、事件凍結)、非函數時忽略、**不到達 w-converhp**(無 retry-wait 等) | JSDoc 之 onTrace;R1 |
| `test/api-exec.test.mjs` | 函數清單、select、kpFunExt 之 userId 首參、同步推送與不推送 | JSDoc 之 tableNamesExec、methodsExec、tableNamesSync、kpFunExt |
| `test/api-authorize.test.mjs` | authorizeExec 擋在 operOrm 之前:放行、拒絕、非嚴格 true、reject 字串、空 userId、kpFunExt 不經授權、getUserIdByToken 拒絕 | JSDoc 之 authorizeExec、getUserIdByToken |
| `test/api-sync-authorize.test.mjs` | 同步表之 select 被拒:前端發出帶表名與原拒絕值之 error、不呼叫 recvData;權限恢復後可再同步.無權限以授權函數之回應模擬(`denied` 旗標,token 與身分全程不變);不以中途換 token 模擬(輪詢之 clientId 歸屬會先擋下,R13 規則 3) | JSDoc 之 authorizeExec(轉述 w-serv-webdata 1.1.10 檔頭規則 4)、WServHapiClient 之 recvData |
| `test/api-sys-funcs.test.mjs` | R13:`sysFuncsPublic` 之轉傳——未給與 null 時三者皆公開(無 token 前端、舊前端元件〔含 getUserIdByToken 對空 token 拒絕之 perm 型〕可綁定同步收推播);只公開 `[sys:getFuncList]` 時無 token 與無效 token 之 `[sys:getTableTags]`、`[sys:polling]` 被拒(伺服端 error 事件、前端不綁定)、有效 token 正常;其他子集(清單與時間戳、僅輪詢、空陣列且建構後修改原陣列不生效)與不開資料通道;getUserIdByToken reject 一律拒絕;換身分(他人、無身分與有身分互換、同一使用者換 token)之輪詢結果與重建前端連線;有給而無效 `new` 即同步拋錯 | JSDoc 之 sysFuncsPublic、getUserIdByToken;README〈Upgrade Notes〉 |
| `test/api-diaglog.test.mjs` | R14:`logDetail`、`funLog` 之轉傳——伺服端無效值同步拋錯、有效值不拋;前端(兩種 useWaitToken)預設只輸出標籤與摘要、`logDetail:true` 還原完整細節、`funLog` 取代 console,皆 token 遮罩 | JSDoc 之 logDetail、funLog |
| `test/api-options.test.mjs` | R2–R6;前端於取得函數清單後停止、間隔 500ms 再停伺服器,行程於伺服器 stop 後 2 秒內結束(原 L3,為 R12 之 P6×W2 回歸);三種 process 監聽(含 import 前後之子行程);下游清理拋錯、時間戳補寫與補寫失敗(R4、R12) | JSDoc 之 useDbOrm、kpOrm、kpFunExt、apis、port、@returns(stop) |
| `test/api-client-stop.test.mjs` | R12:經本套件前端(retryMain=3)於各在途點停止前端、立即停伺服器,停止後 error 0 則、重試訊息 0 行、getToken 0 次、行程於伺服器 stop 後 500ms 內結束;同步表 select 在途時伺服器 stop 不等該連線;$fapi 在途照常完成 | 兩端之 @returns(停止);R12 |
| `test/api-cors.test.mjs` | 曝露 w-converhp 協定之四個標頭、允許與不允許之來源 | JSDoc 之 corsOrigins、w-converhp 之 serverHapi 契約 |
| `test/api-table-tags.test.mjs` | fpTableTags 落點、舊名 fnTableTags 相容 | JSDoc 之 fpTableTags |
| `test/unit-optDoc.test.mjs` | R1 之文件涵蓋(伺服端與前端) | R1 |
| `test/unit-client-init.test.mjs` | 前端函數型選項及 logDetail、funLog 之同步拋錯(兩種 useWaitToken)、與 w-serv-webdata 前端檢核之行為比對、未給取預設、等待中以 clearBroadcast 或 clearSync 取消、等待逾 200 次仍持續、getToken 拋錯或 reject 一則 error 並停止、首次檢查之 error 送達 new 之後之監聽、promise 未結束不重疊呼叫且停止後其結果不作用;子行程:未給 getToken 同步拋錯無 rejection、等待中停止後行程自行結束 | WServHapiClient 之 JSDoc(useWaitToken、getToken、getServerMethods、recvData、各回調、@returns);R10 |
| `test/api-client-wait-token.test.mjs` | useWaitToken=true:取得 token 前伺服器未收到輪詢;取得後於同一物件建立資料同步、取得函數清單並收到同步表資料;等待期間取得之停止函數參照於建立資料同步後仍停止輪詢 | WServHapiClient 之 JSDoc(useWaitToken、@returns);R10 |
| `test/api-error-listener.test.mjs` | error 監聽器同步拋錯時行程不崩潰(子行程):伺服端建構期 error 後照常 ready 與 stop、伺服端啟動失敗時 ready 照常 reject 且 stop 照常 resolve、前端等待期 getToken 拋錯——三端 × 三面向共 9 案:預設(stderr 含 `'[wsemi w-serv-hapi] listener threw'` 與 `errType: 'Error'`、**不含**監聽器拋出之原文)、`logDetail:true`(含遮罩後細節與原文)、`funLog`(通報只交給它、stderr 無標籤亦無原文;`test/tools/child-exit.mjs` 第 5 參數 `detail`／`funlog`、`child-client.mjs` 之 `listener-throw-detail`／`listener-throw-funlog` 模式)(R16 規則 5);未掛 error 監聽時以 `[w-serv-hapi]` 輸出至 stderr(子行程):伺服端之下層監聽器拋錯與自發之啟動失敗、前端自發之 getToken 拋錯——預設只含標籤與安全摘要(`from: 'downstream'`／`'start'`／`'getToken'`)、不含錯誤原文;給 `logDetail:true` 時含遮罩後之原文(R16) | 兩端之 @returns;R10 規則 5、R11、R16 |
| `test/unit-ports.test.mjs` | R7 | R7 |
| `test/api-exposure.test.mjs` | useInert、pathStaticFiles、corsOrigins 之值域:未給與 null 取預設、合法寫法、有給而無效同步拋且無殘留;corsOrigins 各值以各來源之預檢(通訊路由)與實際請求(apis 路由)之 ACAO 驗證 | JSDoc 之 useInert、pathStaticFiles、corsOrigins;R9 |
| `test/api-verify-upload.test.mjs` | 本套件與 w-serv-webdata 皆不註冊 upload、download 監聽;未註冊時匿名切片上傳於寫入前被拒並發 error 事件;註冊後可寫入;verifyConn 非函數時建構期 error 於 ready 前送達且一律 permission denied | JSDoc 之 verifyConn(w-converhp 2.1.7 起三案皆為正式斷言,原 L4 之 pending 判定已移除) |

## 變異驗證紀錄(2026-10-13)

逐項把 src 改回錯誤寫法,確認對應測試轉紅後還原(腳本以 `spawnSync` 跑 mocha 並設逾時):

| 變異 | 轉紅之測試 |
|---|---|
| 不轉傳 authorizeExec | api-authorize、api-exec(伺服器起不來) |
| 恢復本地 useDbOrm 預設 true | api-options 8 條 |
| w-serv-webdata 設定錯誤改回 error 事件 | api-options 全部同步拋錯案與子行程案(8 條) |
| 啟動失敗時不清 broadcast 計時器 | 子行程「啟動失敗而未呼叫stop…」 |
| ready 不等啟動結果 | 4 條 |
| 重新於建構子註冊 process 監聽 | 「建構成功與stop皆不註冊…」、「stop於啟動完成前…」 |
| 啟動流程不等建構期 error 轉出(拿掉 `await pmFlush`) | 「建構期間下游發出之error(暫存資料夾無法建立)…」等 3 條,連跑 3 次皆轉紅 |
| clearDownstream 不呼叫 clearSync | 「stop應釋放資料同步…」(1.1.10 下同時驗 kpOrm 監聽數與時間戳檔) |
| fpTableTags 無效時改用舊名(1.1.10 前之寫法) | 「fpTableTags有給但無效時建構即同步拋錯, 不改用舊名或預設」 |

w-serv-webdata 1.1.8 起,建構拋錯時之計時器清理改由其自行負責、建構期不再同步 emit error,故原「建構拋錯時不清 broadcast 計時器」「error 轉送改回建構後才掛」兩項變異之程式碼已不存在或不再可由現行測試區分,已自本表移除.

R9 與 L4 相關(2026-10-13,跑 `test/api-exposure.test.mjs` 與 `test/api-verify-upload.test.mjs`,每項後逐位元組還原並回驗):

| 變異 | 轉紅之測試 |
|---|---|
| useInert 有給而無效退回 true | 「有給但非布林值時建構即同步拋錯…」 |
| pathStaticFiles 有給而無效退回 dist | 「有給但非非空字串時不論useInert皆…」 |
| corsOrigins 之 false 不停用 | 「給予false代表停用跨域…」 |
| corsOrigins 之單一字串被忽略 | 空字串、單一字串、字串 `*` 三案 |
| corsOrigins 其他型別不檢核 | 「給予其他型別時建構即同步拋錯…」 |
| corsOrigins 為空時不停用而交 hapi | false、`[]`、`['']`、`''` 四案 |
| null 不視為未給 | useInert 與 pathStaticFiles 之 null 兩案 |
| 本套件自行註冊 upload 監聽 | api-verify-upload 第一案(安裝版 2.1.6 下亦轉紅:監聽數之斷言先於 pending 之判定) |
| corsOrigins 不剔除空字串 | 無:等價變異(見 R9 刻意不套) |

R10 與 R11(2026-10-13,只跑對應之測試檔,每項後逐位元組還原並回驗;錨點須依工作樹之 CRLF 轉換):

| 變異 | 轉紅之測試 |
|---|---|
| 不先檢核四個回調函數(只靠 w-serv-webdata) | unit-client-init「函數型選項…不論useWaitToken」與行為比對案 |
| getServerMethods、recvData 有給而非函數時靜默改用預設 | 同上兩案 |
| 等待設上限 200 次(舊版 waitFun 之預設) | 「等待不設上限…」 |
| clearBroadcast、clearSync 不取消等待 | 兩個「等待中呼叫…即取消等待」、「promise未結束前不再呼叫…」、子行程「等待token期間呼叫clearBroadcast後…」 |
| 等待期間之停止函數於建立資料同步後不轉呼叫下游 | api-client-wait-token「等待期間取得之…參照…」 |
| 前端自發之 error 直接 emit | api-error-listener 前端案 |
| getToken 之 promise 未結束即排下一次(重疊呼叫) | unit-client-init 6 案失敗後 mocha 不結束(HANG,殘留計時器) |
| 停止後 getToken 之 reject 仍發出 error | 「promise未結束前不再呼叫; 停止後…」 |
| 首次檢查於建構子內同步進行 | 「getToken於首次檢查即同步拋錯…」 |
| useWaitToken=true 時不等 token 即建立資料同步 | api-client-wait-token 2 案失敗後 HANG(雙重輪詢殘留) |
| 伺服端自發之 error 直接 emit | api-error-listener 伺服端兩案 |
| 前端轉傳 w-converhp 之選項改回本地預設 | 未做:等價變異(R1 之靜態證明) |

2026-10-14 審計重驗(src 副本+resolve hook,受追蹤檔不動):不呼叫 clearDownstream、clearBroadcast/clearSync 不取消等待、前端自發 error 直接 emit、不等 pmFlush、useInert 退回 true、port 不限 65535 六項,轉紅之測試皆與上列紀錄相符.

R6、R10 規則 5、R11(H-a)、R12(2026-10-14,變異以 `tmp/run02/run-mut2.mjs` 對現行 src 之副本;下層紅證以 resolve hook 換入舊版下層之副本,受追蹤檔與 node_modules 皆不動):

| 變異/對照 | 轉紅之測試 |
|---|---|
| 伺服端 emitError 無監聽者時不改 console.error(修正前) | api-error-listener「伺服器: 未監聽error時…」 |
| 前端 emitError 無監聽者時不改 console.error(修正前) | api-error-listener「前端: 未監聽error時…」 |
| clearDownstream 不攔截下游清理之拋錯 | api-options「下游之清理拋錯時stop仍resolve…」(其後 mocha 因伺服器未停而 HANG) |
| clearDownstream 不呼叫 clearSync | api-options「stop應釋放資料同步…」「stop時尚未落檔之時間戳應寫入檔案…」「時間戳落檔失敗時…」「下游之清理拋錯時…」 |
| w-serv-webdata 換回 1.1.11(e0b26af) | api-client-stop「取得函數清單後立即停止…」「首次輪詢成功時…」「同步表之select在途時…」:各 4 則 error(ECONNRESET 或 socket hang up,後 3 則 ECONNREFUSED);其餘 3 案仍綠 |
| w-serv-broadcast 換回 1.1.8(c298f91) | api-client-stop「伺服器不可達時…」「收到同步表資料後先停伺服器…」:各 3 則 ECONNREFUSED;其餘 4 案仍綠 |
| import 以 w-converhp 2.1.7 建置之舊 dist(`test/tools/child-import.mjs dist/w-serv-hapi-server.umd.js`) | `AFTER … 3,0,0`(uncaughtExceptionMonitor 0→3);src 為 0,0,0 |

R13(2026-10-24,`tmp/hapi-run01/run-mut.mjs` 於 `tmp/hapi-run01/mut` 之 src 與 test 副本逐一施變異,repo 之 src 與 test 不動;`--bail` 於首個失敗即停,對照 M00 不加 --bail;mocha 以 `spawnSync` 不經 shell、設 360 秒逾時;錨點容 CRLF;跑 `api-sys-funcs`、`api-sync-authorize`、`unit-optDoc` 三檔):

| 變異 | 結果 |
|---|---|
| M00 無變異(對照) | 32 綠 |
| M01 拿掉 `sysFuncsPublic` 之轉傳(整包轉傳後覆蓋為 undefined) | 被抓到:api-sys-funcs「只公開[sys:getFuncList]…」(嚴格設定被吞,無 token 者全放行) |
| M02 固定轉傳只公開 getFuncList(忽略使用端所給) | 被抓到:「未給sysFuncsPublic(預設)…」 |
| M03 固定轉傳三者皆公開 | 被抓到:「只公開[sys:getFuncList]…」 |
| M04 非陣列之值靜默改為未給 | 被抓到:「給予字串時new即同步拋錯」 |
| M05 只轉傳陣列第 1 個元素 | 被抓到:「公開[sys:getFuncList]與[sys:getTableTags]…」 |
| M06 null 改為空陣列 | 被抓到:「給予null視為未給」 |
| M07 不轉傳 getUserIdByToken | 被抓到:「未給sysFuncsPublic(預設)…」(有效 token 亦成無身分) |
| M08 JSDoc 缺 `@param opt.sysFuncsPublic` | 被抓到:unit-optDoc |
| M09 前端不將 getToken 交 w-serv-webdata | 被抓到:「同一前端連線中途換成他人身分…於預設下…」 |
| M10 空陣列視為未給(退回預設,fail-open) | 被抓到:「空陣列: 三個系統函數對無token者皆被拒絕…」 |
| M11 getUserIdByToken 拋錯或 reject 時改回空字串(fail-open) | 被抓到:「未給sysFuncsPublic(預設)…驗證失敗(reject)者一律拒絕」 |
| M12 `sysFuncsPublic` 僅於開資料通道時轉傳 | 被抓到:「不開資料通道(useDbOrm未指定)…」 |

修前紅(2026-10-24,`tmp/hapi-run01/pre`:src 與 test 同現行,`node_modules` 內為升級前之 w-serv-webdata 1.1.15 + w-serv-broadcast 1.1.10,其餘相依向上解析):新測試 `api-sys-funcs` 27 案中 **22 紅 5 綠**——5 綠為鎖定相容之案(預設下無 token 前端、舊前端元件、同一使用者換 token、perm 型舊/新前端元件),修前後皆應綠;`api-sync-authorize` 3 案兩邊皆綠;`unit-optDoc` 在 1.1.15 為綠、裝 1.1.16 後轉紅(補 JSDoc 後綠).

R14(2026-10-28,直接對 repo 之 src 逐一施變異後以 Edit 還原,還原後 `git diff -- src` 僅含預期之 JSDoc 與先行檢核;w-serv-webdata 1.1.18):

| 變異 | 結果 |
|---|---|
| 前端拿掉 logDetail、funLog 先行檢核 | 被抓到:unit-client-init「logDetail有給但非布林值、funLog有給但非函數時…」(useWaitToken=true 時 logDetail 3 個、funLog 4 個無效值皆未拋)與下游行為比對案,共 2 紅 |
| 伺服端 `...opt` 後覆蓋 `logDetail`、`funLog` 為 undefined | 被抓到:api-diaglog 伺服端兩案(無效值不拋)共 2 紅,前端案仍綠 |
| 前端 `optWebdata` 覆蓋 `logDetail`、`funLog` 為 undefined | 被抓到:api-diaglog 前端 `logDetail:true`、`funLog` 兩組 × 兩種 useWaitToken 共 4 紅,伺服端案與預設組仍綠 |
| JSDoc 缺 `@param opt.logDetail`、`opt.funLog`(未改碼時之實際狀態) | 被抓到:unit-optDoc 伺服端與前端各 1 紅 |

修前紅(2026-10-28,w-serv-webdata 由 1.1.17 升 1.1.18、src 未改):全套 138 案 **135 綠 3 紅**——`unit-optDoc` 伺服端與前端各 1 紅(缺 `logDetail`、`funLog`)、`unit-client-init`「w-serv-webdata前端於建構時拋錯之選項, useWaitToken=true…」1 紅(`logDetail`、`funLog` 之無效值 `useWaitToken=true` 時未同步拋).修後 147 綠 0 紅(新增 8 + 1 案).

### 2026-10-30(R15:console 出口與自發 error 之遮罩;腳本 `tmp/mig-hapi/mutrun.mjs`,一次取鎖,日誌 `tmp/mig-hapi/mutrun-*.log`)

階段 A 最終碼:`api-diaglog-mask`＋`api-ontrace`＋`unit-optDoc`＋`api-diaglog`＋`unit-ports` 共 **40 綠 0 紅**.

修前紅(src 退回 HEAD、測試為最終版,w-serv-webdata 1.1.20、wsemi 1.9.31 已裝):**13 紅**——`api-diaglog-mask` 11(伺服端 console 出口 5 案〔Error 保型副本、{msg,err} 物件、clearDownstream、server.stop、啟動失敗〕、前端 getToken 拋出與 reject 2 案、startSync 之 console 出口 1 案、語料 T07 經三條出口各 1 案)＋`unit-optDoc` 2(缺 `opt.onTrace`);原樣保留之案(身分不變、交監聽器之值原樣、語料 R01)修前即綠,因行為本無差異.另 HEAD 版 `api-diaglog` 於新依賴下 **4 紅**(logDetail、funLog 兩組 × 兩種 useWaitToken,斷言 `[token]` 而下游已改 `***`).`api-ontrace` 3 案修前即綠(`...opt` 整包轉傳本即到達下游),僅作轉傳之釘住.

| 變異 | 結果 |
|---|---|
| M1 伺服端 console 出口不遮罩 | 被抓到:`api-diaglog-mask` 6 紅(Error 保型、{msg,err}、clearDownstream、server.stop、啟動失敗、語料 T07 伺服端) |
| M2 前端 console 出口不遮罩 | 被抓到:1 紅(startSync 之 console 出口;getToken 之值已於 catch 站點先遮罩,故僅此案抓得到) |
| M3 前端 getToken 之 catch 站點漏包 | 被抓到:2 紅(reject 案、語料 T07 經前端監聽器) |
| M4 誤包:前端 startSync 之 catch 被遮罩 | 被抓到:1 紅(監聽器須收到同一物件) |
| M5 誤包:伺服端交給監聽器之值被遮罩 | 被抓到:1 紅 |
| M6 誤包:前端交給監聽器之值一律遮罩 | 被抓到:1 紅(startSync 案) |
| M7 漏包站點:clearDownstream 之 catch 繞過出口直接 console.error | 被抓到:1 紅 |
| M8 漏包站點:啟動失敗之 catch 繞過出口 | 被抓到:1 紅 |
| M9 漏包站點:stop 內 server.stop 之 catch 繞過出口 | 被抓到:1 紅 |
| M10 伺服端 onTrace 不到達下游 | 被抓到:`api-ontrace` 1 紅 |
| M11 前端 onTrace 不到達下游 | 被抓到:1 紅 |
| M12 誤轉交:前端 onTrace 另轉交 w-converhp | 被抓到:1 紅(負向案) |

12/12 被抓到,0 倖存,0 INCONCLUSIVE;每項變異後還原並以位元組比對備份一致.「逐筆 err 未遮」一類變異:本套件無結果物件之逐筆 err(N/A).

### 2026-10-31(R16:console 出口預設只輸出安全摘要;腳本 `tmp/hapi/mutate.mjs`,一次取鎖,結果 `tmp/hapi/mutation-result.json`,結束已清)

wsemi 1.9.33、w-serv-webdata 1.1.20、w-converhp 2.1.12.

修前紅(src 為 HEAD〔仍為 `maskDiagErr` 之 console 出口〕、新測試 `api-diaglog-console`):**16 案中 14 紅 2 綠**——14 紅涵蓋伺服端預設 7 案(Error、{msg,err}、字串、getUserIdByToken 真實路徑〔整個 Error 含 stack 與使用者識別被印出〕、clear 與 stop、start、建構期暫存)、logDetail 與 funLog 各 1 案、前端預設 3 案、logDetail 與 funLog 各 1 案;2 綠為「有 error 監聽者」案(伺服端、前端),行為本無差異,作釘住之用.`api-diaglog-mask` 與 `api-error-listener` 之舊斷言於修後轉紅(舊版之 console 引數形狀與原文),已依新規格改寫.

變異跑 `api-diaglog-console`＋`api-diaglog-mask`＋`api-error-listener` 三檔(對照:無變異 46 綠 0 紅):

| 變異 | 結果 |
|---|---|
| M01 伺服端 console 出口退回原樣輸出 err(不經 diag) | 被抓到:22 紅 |
| M02 前端 console 出口退回原樣輸出 err | 被抓到:6 紅 |
| M03 伺服端 `getDiag({}, …)` 不讀 opt(logDetail、funLog 失效) | 被抓到:15 紅 |
| M04 前端 `getDiag({}, …)` | 被抓到:8 紅 |
| M05 伺服端恆為 `logDetail:true`(預設即輸出細節) | 被抓到:8 紅 |
| M06 前端恆為 `logDetail:true` | 被抓到:4 紅 |
| M07 伺服端摘要不含 `from` | 被抓到:9 紅 |
| M08 伺服端未宣告 `nested:['err']`({msg,err} 取不到代碼) | 被抓到:1 紅 |
| M09 伺服端有監聽者仍走診斷出口(`if (true)`) | 被抓到:4 紅 |
| M10 前端 getToken 拋出值交監聽器前不遮罩 | 被抓到:3 紅 |
| M11 伺服端下層轉送之來源別誤標為 `start` | 被抓到:7 紅 |
| M12 伺服端建構期暫存之來源別遺失 | 被抓到:1 紅 |
| M13 伺服端摘要夾帶錯誤訊息文字(`safeKeys` 加 `msg`) | 被抓到:9 紅 |
| M14 前端摘要夾帶錯誤訊息文字 | 被抓到:5 紅 |
| M15 前端 getToken 之來源別誤標為 `startSync` | 被抓到:4 紅 |
| M16 伺服端 clearDownstream 之來源別誤標為 `stop` | 被抓到:1 紅 |

16/16 被抓到,0 倖存,0 INCONCLUSIVE;腳本先備份兩個 src,每項後 `copyFileSync` 還原,結束以 sha256 比對備份一致(兩檔皆 true).

### 2026-11-01(R16 規則 5:error 監聽器拋錯之通報受 `logDetail`／`funLog` 控制;hapi234;腳本 `tmp/hapi234/{probe-stderr,mutate-full}.mjs`,一次取鎖,結束已清)

wsemi 1.9.36、w-serv-webdata 1.1.21、w-converhp 2.1.13.變異在複本(`tmp/hapi234/mut`)上進行,repo 之 src 不動;複本每項後還原,結束核對兩檔與現行 src 逐字相同.

修前:HEAD 之原 `api-error-listener`(3 案斷言 stderr 含 `listener-err`)對 HEAD 之 src **7 案中 3 紅**(`[exited, code, includes]` 實得 `[true, 0, false]`,與主控盤查相同形狀);新測試(9 案)對 HEAD 之 src **13 案中 6 紅**(logDetail 3、funLog 3;預設 3 案在 HEAD 即綠,因 HEAD 已帶 `tag`).HEAD 實跑 stderr:三端、三面向(預設／`logDetail:true`／`funLog`)**皆只有** `[wsemi w-serv-hapi] listener threw { errType: 'Error' }`——給了 `logDetail:true` 或 `funLog` 仍不受控,即規則 5 所指之不一致.修後 13 案全綠.

變異跑 `api-error-listener` 單檔(對照 M0:無變異 13 綠,監聽器拋錯案 9 案);「預期紅」依各變異所破壞之面向事先列出,實際紅之標題集合須與之逐項相同:

| 變異 | 預期紅 | 結果 |
|---|---|---|
| M1 伺服端 `optEmit` 只剩 `{ tag }`(=HEAD) | 伺服端 logDetail 2、funLog 2 | 被抓到:4 紅,集合相符 |
| M2 前端 `optEmit` 只剩 `{ tag }`(=HEAD) | 前端 logDetail 1、funLog 1 | 被抓到:2 紅,集合相符 |
| M3 伺服端漏 `funLog` | 伺服端 funLog 2 | 被抓到:2 紅,集合相符 |
| M4 伺服端漏 `logDetail` | 伺服端 logDetail 2 | 被抓到:2 紅,集合相符 |
| M5 伺服端 `logDetail` 恆 true(預設即輸出原文) | 伺服端預設 2 | 被抓到:2 紅,集合相符 |
| M6 前端 `logDetail` 恆 true | 前端預設 1 | 被抓到:1 紅,集合相符 |
| M7 伺服端漏 `tag`(標籤變 `[wsemi evem] …`) | 伺服端 6(三面向 × 兩情境) | 被抓到:6 紅,集合相符 |
| M8 前端漏 `funLog` | 前端 funLog 1 | 被抓到:1 紅,集合相符 |
| M9 前端漏 `logDetail` | 前端 logDetail 1 | 被抓到:1 紅,集合相符 |
| M10 前端漏 `tag` | 前端 3 | 被抓到:3 紅,集合相符 |

10/10 被抓到,0 倖存,0 INCONCLUSIVE.

## 已知限制

- **L2(設計事實)**:同步表之 select 須對所有連線者放行;被拒之前端取不到該表資料(既有資料維持不變),每次重抓皆發出 error.依 w-serv-webdata 1.1.10 檔頭規則 4,本套件 JSDoc 之 authorizeExec 已註明,`test/api-sync-authorize.test.mjs` 驗證.(1.1.8 時為「該表被清空且無 error」,1.1.10 改為現行為.)
- **已解除**:L1(同步層設定錯誤拋錯後殘留 kpOrm 監聽與時間戳檔)與 L5(`stop()` 後 kpOrm 監聽仍在)於 w-serv-webdata 1.1.10 修正(設定檢核先於建構、clearSync 包裝移除監聽),原 pending 測試已改為正式測試.
- **已解除(2026-10-13)**:L3(w-serv-broadcast 1.1.6 之伺服端在線偵測於 stop 後最長約 10 秒才清除)於 w-serv-broadcast 1.1.7 修正(clearBroadcast 一併 `ea.clear()`),實測 stop 後 1ms 結束,`test/api-options.test.mjs` 新增回歸案.L4(w-converhp 2.1.6 之上傳管線不檢查 upload 監聽、verifyConn 非函數放行)於 w-converhp 2.1.7 修正,`test/api-verify-upload.test.mjs` 之 pending 判定已移除.L6(前端 useWaitToken=true 時回傳 null)由本套件修正,見 R10.
- **已解除(2026-10-14)**:L7(w-converhp 2.1.7 之 worker 產物 import 即註冊 3 個 `uncaughtExceptionMonitor`)於 w-converhp 2.1.8 解除:其 src 與以其暫存建置之本套件 dist 皆 0 個(import → ready → 切片上傳 → stop 全程);受追蹤之舊 dist 仍 3 個,由發布流程重建,R6 之子行程測試守住 src.L8(前端停止不中止進行中之流程)於 w-serv-broadcast 1.1.9(中止在途之輪詢)與 w-serv-webdata 1.1.12(中止自身在途之請求)解除;使用端之 $fapi 與直接呼叫者依設計不中止(R12 刻意不套).歸因實測:先停前端後立即停伺服器(retryMain=3)停止後之 error,webdata 1.1.10 為 5 則、1.1.11 為 4 則、1.1.12 為 0 則;broadcast 1.1.8 → 1.1.9 改善「輪詢在途或重試退避中停止」(3 則 → 0 則).
- **L9(設計事實,2026-10-14 裁示 E1)**:w-serv-webdata 之設定錯誤或其建構期執行期異常(如 genTag 拋錯)於本套件建構子同步拋出時,pathUploadTemp 資料夾已由先建構之 w-converhp 建立而殘留(空資料夾);kpOrm 監聽、時間戳檔無殘留,行程照常結束.自用選項與 hapi 之設定錯誤檢核早於 w-converhp 之建構,無殘留(R9).不在本套件回收:須知 w-converhp 之預設路徑,違反 R1 單一擁有;w-serv-webdata 之 `parseOpt` 未匯出.
- **L10(設計事實,裁示 G-b)**:伺服端 stop 之 promise resolve 後,仍可能收到 w-serv-broadcast 對已進入之前端補發之 clientLeave 與 clientChange(其以 1ms 計時器派發),本套件之 clientChange 監聽(useShowLog)因此於 stop 後才印「now clients: 0」.2026-10-14 實測 5/5.
- **L11(設計事實,裁示 F-b)**:執行環境無 AbortController 時(w-serv-broadcast 1.1.9、w-serv-webdata 1.1.12 之建構檢核),useWaitToken=false 建構即同步拋 `AbortController is not available`,true 則取得 token 後發一則同訊息之 error 且不建立資料同步.實際支援之環境(Chrome 66、Firefox 57、Safari 11.1、Node 14.17 以上)皆具備.
- **L12(設計事實)**:前端停止後先前取得之 $fapi 仍可呼叫;建立資料同步後 token 失效(登出)不回到等待,輪詢與請求持續失敗並發 error,請停止後另建新實體;回傳物件上下層所掛之其他函數(如 w-sync-webdata 之 pollingTableTags,於本系統恆失敗)非本套件契約;同一行程多實例須給不同之 fpTableTags 與 pathUploadTemp.皆載於 JSDoc.

- **L13(設計事實,下游規則,2026-10-24)**:輪詢之身分與 clientId 綁定——同一前端連線(同一 clientId)中途改以他人身分(含預設下無身分與有身分互換)輪詢被拒(error 事件 `clientId belongs to another userId`;嚴格設定下由有身分變無身分則為 `empty userId`,見 R13 規則 3),被拒之輪詢不刷新在線身分,至舊綁定因該 clientId 逾時離線(w-serv-broadcast 在線逾時約 10 秒)解除;期間之表變更推播不補送.實測(w-serv-webdata 1.1.16 + w-serv-broadcast 1.1.12,只公開 `[sys:getFuncList]`,換身分後):第 1 至 5 次輪詢被拒(0.5、2.5、4.5、6.5、8.5 秒),其後放行,20 秒時之變更送達;換身分當時(1.5 秒)之變更 30 秒內未送達.換身分須重載頁面或重建前端連線,載於 JSDoc(sysFuncsPublic、前端 getToken)與 README.
- **L14(設計事實)**:`sysFuncsPublic` 預設三者皆公開(相容),故未顯式設定之部署,無身分者仍可取得函數名稱清單、同步表時間戳並取走自己 clientId 之廣播;嚴格設定由使用方於前端改用帶 token 之元件後顯式為之(JSDoc、README、R13).本套件不訂預設(R1).
- **L15(已解除,2026-10-30;原待裁示,2026-10-28)**:主控以排程第 161 項裁示改經 wsemi 共用模組:2 處無監聽者之 `console.error` 現經 `maskDiagErr` 遮罩憑證樣式(R15,站點全集與處置見該節);仍存之限制:本套件不持有秘密,不認識之裸字串密碼與 token 不在保證內,錯誤原文與資料值仍可能出現(宜掛 error 監聽);w-converhp 之同型出口(`verifyConn error for apiType[…]`、`listener of event[…] error`)另案.下文為解除前之盤點:`logDetail`、`funLog` 只涵蓋 w-serv-webdata 自身之診斷輸出;本套件自身之 console 輸出站全集 6 處(`rg -n "console\.(log|error)\(" src/*.mjs`),其中 2 處於無 error 監聽者時以 `console.error('[w-serv-hapi]', err)` **原樣輸出 error 事件值**,不經 `logDetail`、`funLog`:`src/WServHapiServer.mjs:337`(伺服端:hapi 之 Error〔啟動失敗、路由衝突,無個資〕,及下層轉送者——w-converhp 之訊息字串〔如 `verifyConn error for apiType[…]: <使用端錯誤訊息>`、`listener of event[…] error: …`〕、w-serv-broadcast 與 w-sync-webdata 之 `{msg, err}`〔可能含 `getUserIdByToken` 之原拒絕值〕)與 `src/WServHapiClient.mjs:319`(前端:`getToken` 之拋出值,可能夾帶 token;下層 `{msg, err}`)——內容視使用端函數之錯誤訊息而定,可能含 token、使用者 id、錯誤原文,且**本套件不遮罩**.其餘 4 處不含個資:`WServHapiServer.mjs:387`(連線數)、`:475`(伺服器 uri)、`WServHapiClient.mjs:366`、`:391`(固定文字 `waiting token...`、`get token`;`useShowLog` 控制).JSDoc 已載明此範圍與「宜掛 error 監聽」.是否改經 `logDetail`／`funLog` 出口(預設只輸出摘要)由主控裁示;下游 README 亦明訂此類輸出不在其涵蓋(使用端應對回傳之事件物件掛 error 監聽,且監聽器不可拋錯).**2026-10-31(排程第 158 項,R16)**:其中「不遮使用者識別與使用端自填之值」之殘餘風險改以預設只輸出安全摘要處理——console 出口預設只輸出 `'[w-serv-hapi] error'` 與 `{from,errType,errCode?}`,`logDetail`／`funLog` 取遮罩後之細節(上述兩站與 4 處 `useShowLog` 資訊行之處置全表見 R16).

## 破壞性變更紀錄

**2026-10-31(排程第 158 項:console 出口預設只輸出安全摘要,R16;不留舊版相容)**

- 依賴:wsemi 下限升為 `^1.9.33`(本套件新增直接引用 `wsemi/src/getDiag.mjs`,不再直接引用 `maskDiagErr`).
- **本套件**:兩端無 error 監聽者時之 console 輸出由 `console.error('[w-serv-hapi]', maskDiagErr(err))` 改為 `console.error('[w-serv-hapi] error', { from, errType, errCode? })`——**預設不再含錯誤訊息文字與值**(原只遮憑證,不遮使用者識別與使用端自填之值,如 `getUserIdByToken` 之拒絕值、`getToken` 之拋出值).第一個引數由 `'[w-serv-hapi]'` 變為 `'[w-serv-hapi] error'`(子字串比對 `[w-serv-hapi]` 仍成立).`logDetail:true` 輸出遮罩後之細節(第二引數為細節),`funLog(label, safe, detail)` 只收診斷輸出而不寫 console(`logDetail`、`funLog` 原只轉傳 w-serv-webdata,現亦作用於本套件自身出口).有 error 監聽者時行為不變(不經出口、不呼叫 funLog);交給監聽器之值不變.
- 受影響之下游(依賴 w-serv-hapi):w-web-sso、w-web-api、w-web-task、w-web-perm 等——升版後日誌之 `[w-serv-hapi]` 行不再含錯誤原文;其日誌過濾或測試若比對該行之訊息文字須改為掛 error 監聽或給 `logDetail:true`／`funLog`(盤點時未見比對之者,依賴升版後由主控連動檢視).
- 測試:新增 `test/api-diaglog-console.test.mjs`(port 2 個);`api-diaglog-mask` 之 console 出口案改給 `logDetail:true` 並補 funLog 路徑、K09、P01 與 WIRE 表(A11、C14、U22);`api-error-listener` 之子行程案改為預設只含摘要並新增 `logDetail` 兩案.文件:兩端 JSDoc(logDetail、funLog、@returns、useWaitToken)、README〈Diagnostic output〉〈Breaking changes〉.

**2026-10-30(因應 wsemi 1.9.31 共用診斷模組、w-serv-webdata 1.1.19–1.1.20、w-converhp 2.1.12;不留舊版相容)**

- 依賴:w-serv-webdata 下限升為 `^1.1.20`、w-converhp `^2.1.12`、wsemi `^1.9.31`(devDependencies:w-orm-lowdb `^1.0.40`).
- **遮罩字樣 `[token]` → `***`**(下游 w-serv-webdata 1.1.20;`funLog` 之 detail、`logDetail` 之輸出);遮罩範圍擴及網址帳密、`password`／`Authorization`／`Bearer` 等憑證,長度不足 4 字元之 token 不遮.
- **對外錯誤值遮罩(下游)**:w-serv-webdata 之 error 事件、前端請求之 reject 值、回給遠端之 `{ state:'error', msg }` 含憑證或近期 token 者改為遮罩後之副本,不含者原樣.經本套件到達使用端.
- **本套件**:無 error 監聽者時之 `console.error('[w-serv-hapi]', …)` 輸出改經 `maskDiagErr`(原樣輸出);前端 `useWaitToken=true` 時 `getToken` 之拋出／reject 值含憑證樣式者,error 事件收到遮罩後之副本(同類別,原物件不改;不含者同一物件)(R15).
- 新選項 `onTrace` 經整包轉傳到達 w-serv-webdata(再到 w-serv-broadcast),不轉交 w-converhp.
- 測試:新增 `test/api-diaglog-mask.test.mjs`(port 2 個)、`test/api-ontrace.test.mjs`(port 1 個);`api-diaglog` 之遮罩字樣斷言改 `***`.文件:兩端 JSDoc 改 `***` 字樣、補 `opt.onTrace`;README 新增〈Diagnostic output〉〈Breaking changes〉.
- 受影響之下游(依賴 w-serv-hapi `^1.1.10`):w-web-sso、w-web-api、w-web-task、w-web-perm——升版後其日誌之 `[w-serv-hapi]` 行不再含原始憑證樣式;其測試若比對 `[token]` 字樣或 error 事件原文須檢視(盤點時未見).

**2026-10-28(因應 w-serv-webdata 1.1.18;預設相容,對外行為不變)**

- 依賴:w-serv-webdata 下限升為 `^1.1.18`(傳遞依賴 w-serv-broadcast 1.1.13、w-sync-webdata 1.1.9).
- 新選項 `logDetail`、`funLog` 經整包轉傳到達下游(R1、R14):未給時行為與升級前相同(本套件無新增輸出);有給而無效時建構即同步拋錯(`invalid opt.logDetail`、`invalid opt.funLog`),前端於 `useWaitToken=true` 時亦同步拋出(本套件先行檢核).**升級後下游預設的前端診斷輸出(回調函數於停止後才拋錯)改為只輸出摘要,不再含錯誤本身**——需要原輸出者設 `logDetail: true`.
- 測試:新增 `test/api-diaglog.test.mjs`(port 2 個)、`unit-client-init` 新增 1 案.文件:兩端 JSDoc 新增 `logDetail`、`funLog`.

**2026-10-24(因應 w-serv-webdata 1.1.16 與 w-serv-broadcast 1.1.11–1.1.12;預設相容,行為不變)**

- 依賴:w-serv-webdata 下限升為 `^1.1.16`;傳遞依賴 w-serv-broadcast 於 package-lock 由 1.1.11 更新為 1.1.12(離線時先清佇列;新安裝者本即取得 1.1.12).
- 新選項 `sysFuncsPublic` 經整包轉傳到達下游(R1、R13):**未給時三個系統函數皆公開,與升級前行為相同**;有給而無效時建構即同步拋錯(`invalid opt.sysFuncsPublic`、`invalid opt.sysFuncsPublic[i]`).
- 輪詢帶 token 並經 `getUserIdByToken` 反查、與 clientId 綁定(下游):使用本版前端之部署,於未登入(`getUserIdByToken` 回空字串)且未公開 `[sys:polling]` 時輪詢被拒;同一前端連線中途換成他人身分被拒(L13).此二者在預設(三者公開)下:無 token 者放行,但換成**他人有效身分**或由無身分變有身分仍被拒(歸屬在預設下亦作用,匿名亦被綁定);同一使用者換另一枚 token 不受影響.
- 測試:`test/api-sync-authorize.test.mjs` 之無權限模擬由中途換 token 改為授權函數之回應;新增 `test/api-sys-funcs.test.mjs`(port 4 個).
- 文件:JSDoc(伺服端類別開頭、getUserIdByToken、sysFuncsPublic;前端 getToken)與 README〈Identity verification〉〈Upgrade Notes〉.

**2026-10-13(因應 w-serv-webdata 1.1.7)**

- `useDbOrm` 未給時由開啟改為關閉:前端呼叫表操作得 `invalid func[tabX.select]`;非布林值一律視為關閉(原本非布林視為開啟).
- `useDbOrm` 為 true 時 `authorizeExec` 必填(預設拒絕,回傳嚴格等於 true 才放行).
- 設定錯誤由 error 事件(伺服器不啟動、行程存活)改為建構時同步拋出.
- apis 與通訊路由衝突:由「w-converhp 路由靜默掛不上、伺服器照常啟動」改為「不啟動、ready reject、發 error」.
- port 非法值一律取 8080(原本 -1 於建構拋錯、70000 至啟動才失敗).
- 新增 `ready()`、`stop()`;`getServer()`、`getInstWConverServer()` 立即回傳,不保證已啟動.
- 移除 process 層 `unhandledRejection`/`uncaughtException` 監聽:行程之未捕捉例外改依 Node 預設處置(印出並終止);原本被本套件攔下,只印 log 並發 error 事件,行程繼續存活.
- pathUploadTemp 改由 w-converhp 建立(本套件不再自建);corsOrigins 不再轉傳 w-converhp(皆無行為差異).

**2026-10-13(因應 w-serv-webdata 1.1.8,皆為下游規則,本套件原樣繼承)**

- 未指定 useDbOrm(非布林值)卻給了 operOrm、tableNamesExec、methodsExec、authorizeExec、kpOrm 或 tableNamesSync 時,建構即同步拋錯(原本靜默不生效).
- useDbOrm=true 時 kpOrm 非物件由「發 error 事件、伺服器照常啟動但不同步」改為建構即同步拋錯;methodsExec 有給但非陣列時拋錯(原本靜默改用預設).
- kpFunExt 命名限制擴大:頂層名不得為表名、不得以 `[sys:` 開頭、路徑各段不得為 `__proto__`/`constructor`/`prototype`.
- 缺 tableNamesExec 之錯誤訊息改為 `invalid opt.tableNamesExec when useDbOrm=true`.

**2026-10-13(因應 w-serv-webdata 1.1.10 與 w-sync-webdata 1.1.7)**

- 下游新增之設定檢核(皆於建構任何元件之前同步拋錯):各表名與方法名須為非空字串;tableNamesSync 有給須為陣列,且每個同步表須有表操作 select;getUserIdByToken、genTag 有給須為函數,genTag 須回傳非空字串;fpTableTags 有給須為非空字串;kpFunExt 須為純物件且值須為函數;函數名不得為空或含空段,不同函數名不得解析為同一路徑或互為前綴.
- 本套件之 fpTableTags 舊名相容改為只在未給新名時才改用 fnTableTags;原本新名無效即改用舊名或預設,會吞掉下游之檢核.
- 同步表之 select 被拒時,前端由「該表被清空、無 error」改為「不呼叫 recvData、既有資料不變、發出帶表名之 error,之後重抓」.
- `stop()` 呼叫之 clearSync 改為 w-serv-webdata 之同名包裝,一併移除掛於 kpOrm 之 change 監聽.
- 前端之 getRefreshState 等回調函數有給但非函數時,以 error 事件通知且不建立資料同步(原本靜默不呼叫).

**2026-10-13(曝露與存取控制選項之值域,R9)**

- useInert 有給但非布林值(如 `'false'`、`0`、`1`)由「視為 true 而公開靜態檔」改為建構即同步拋 `invalid opt.useInert`.
- pathStaticFiles 有給但非非空字串由「改用 `'dist'`」改為建構即同步拋 `invalid opt.pathStaticFiles`,不論 useInert.
- corsOrigins:`false`、`''`、`[]`、`['']` 由「允許 http://localhost」改為停用跨域;單一字串(含 `'*'`)由「忽略而允許 http://localhost」改為視為只含該網域之陣列;`[null]` 由「允許 http://localhost」改為由 hapi 拋錯(同 `[123]`);含空字串之陣列先剔除空字串(`['*', '']` 由 hapi 拋錯改為允許全部);其他型別(true、數值、物件、函數)由「允許 http://localhost」改為建構即同步拋 `invalid opt.corsOrigins`.
- JSDoc 之 verifyConn 改依 w-converhp 修正後之行為(切片上傳須於 getInstWConverServer 所得實體註冊 upload 監聽;有給而非函數時一律拒絕並發 error 事件);實際生效待升級 w-converhp(L4).

**2026-10-13(前端之建構與停止 R10、自發 error 之派發 R11;因應 w-converhp 2.1.7、w-serv-broadcast 1.1.7、w-package-tools 1.1.17)**

- 前端 useWaitToken=true:由「回傳 null(無法監聽、無法停止),約 20 秒未取得 token 即使行程崩潰」改為回傳事件物件、不設等待上限,等待期間可以 clearBroadcast 或 clearSync 取消;getToken 拋錯或 reject 由「行程崩潰」改為發一則 error 事件並停止等待;首次呼叫 getToken 由建構子內改為建構子回傳後.
- 前端設定錯誤改為建構時同步拋出(不論 useWaitToken):getToken、getServerMethods、recvData 有給而非函數(原靜默改用預設);四個回調函數有給而非函數(原為 error 事件且不建立資料同步);useWaitToken=true 而未給 getToken(原回傳 null 後崩潰).
- 前端轉傳 w-converhp 之選項改為原樣轉傳(最終值零差異);轉傳 w-serv-webdata 之選項由逐項列舉改為整包轉傳.
- 伺服端與前端:error 監聽器之同步拋錯不再使行程崩潰,改以 console.error 輸出;伺服端 stop 於此情形仍 resolve.
- 依賴:w-converhp ^2.1.7(upload 監聽檢查、verifyConn 非函數一律拒絕自此生效)、wsemi ^1.9.14;devDependency w-package-tools ^1.1.17.w-serv-broadcast 1.1.7(經 w-serv-webdata)之 error 事件內容改為 `{ msg, err }`(輪詢失敗為 `{ msg: '[sys:polling] error', err }`).

**2026-10-14(停止之範圍 R12、無監聽者之 error R10/R11;因應 w-converhp 2.1.8–2.1.9、w-serv-broadcast 1.1.9、w-serv-webdata 1.1.12)**

- 未監聽 error 時改以 console.error 輸出(前綴 `[w-serv-hapi]`):伺服端之 error 一律經本套件轉送,含下層者(原靜默——本套件之轉送監聽使 w-serv-broadcast、w-sync-webdata 原本之 console.error 失效);前端為本套件自發者(原靜默),同一物件上下層之 error 依其自身之政策.
- 前端停止(兩者皆呼叫)後,本套件與下層自身之在途請求一併中止:不再重試、不再發其 error、不再呼叫 getToken、不撐住行程(原:webdata 1.1.11 下仍重試並逐次發 error,retryMain=3 時約 6 秒);只呼叫 clearBroadcast 而同步表請求在途時,改由 w-sync-webdata 發一則帶表名之 error(原 0 則).行為由下層提供,本套件程式未改.
- 依賴:w-converhp ^2.1.9(per-call `opt.signal`;結局不以外來值之形狀判定;下載須帶 Content-Disposition,本套件伺服端已曝露)、w-serv-webdata ^1.1.12(要求 w-serv-broadcast ^1.1.9;前端之建構另要求 AbortController,見 L11).
- JSDoc 補述停止之範圍與順序(R12)、伺服端 stop 只等連線不等應用處理與 worker、stop 為終態、error 之形狀與無監聽者之處置、useShowLog 只控制本套件自身之輸出;範例與 README 末尾補停止之寫法.
