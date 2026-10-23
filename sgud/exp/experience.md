# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.

## 依賴升版

- **下游之 patch 版號可能是破壞性變更,一律比對原始碼,不看版號**.w-serv-webdata 1.1.6→1.1.7 只動 patch,卻把 `useDbOrm` 預設由 true 改 false、新增必填 `authorizeExec`;本套件裝上即全數無法啟動.作法:`npm pack <套件>@<舊版> --pack-destination <scratchpad 新空目錄>`,解壓後 `diff -rq`/`diff -u` 對 `node_modules/<套件>/src`.
- **升版前先把現行下游之 src 備份到 scratchpad**(`npm i` 會覆蓋 `node_modules`,覆蓋後就只能再 `npm pack` 舊版來比對).2026-10-13 升 w-serv-webdata 1.1.8 即先備份 1.1.7、1.1.6 之 w-serv-webdata/w-sync-webdata/w-serv-broadcast 再安裝.
- **判定提報是否修正完畢,一律對新版逐項實測,不只讀 diff**:1.1.8 之 diff 看似大改,實測仍有 7 項未修;另有 2 項是下游以文件明訂規則處置(例如「同步表之 select 須對所有連線者放行,否則前端該表被清空」),屬已裁示之設計,本套件應移除對應之 pending 測試、在 JSDoc 引用該規則,不再重提.
- **下游補上檢核後,回頭查本套件有無把它吞掉**:w-serv-webdata 1.1.10 新增「fpTableTags 有給但無效即拋錯」,而本套件之舊名相容寫成「新名無效就改用舊名」,會把無效值換成 null 再轉傳,下游之檢核因此永遠觸發不到.相容或預設邏輯只能在「未給」時作用,有給之值一律原樣轉傳.
- **下游修好已知缺陷時,把 pending 測試改為正式測試**:1.1.10 修正同步層殘留與 stop 後之 kpOrm 監聽,兩個 pending 即改寫為斷言(監聽數為 0、時間戳檔未寫入),使下游日後回歸時本套件之測試會轉紅.
- **剛發布之版本 registry 可能數分鐘至十餘分鐘查不到**.以背景迴圈每 2 分鐘 `npm view <套件>@<版> version` 偵測(`run_in_background` 須明給 `timeout`,迴圈自帶上限);2026-10-13 w-serv-webdata 於第 2 次(約 2 分鐘)、w-converhp 2.1.7 於第 8 次(約 14 分鐘)查到.等待期間先做不依賴新版之工作.
- **上游工具之修正,要經下游重建產物才落到使用端**:w-package-tools 1.1.17 修正 worker 樣板(outer 層不再註冊 process 監聽),但 w-converhp 2.1.7 之 worker 產物仍以 1.1.16 建置(其 devDependency 未升),引用端照樣被註冊 3 個全域監聽(2026-10-13).驗收分兩段:以 1.1.17 之 rollupWorker 實建產物並數 process 監聽(工具本身已修),再 import 下游數監聽(是否已落地);只看工具之 diff 會誤判「已解決」.
- **dist 內嵌下游**:`toolg/gDistRollup.mjs` 之 external 不含 w-serv-webdata 與 w-converhp,`main`(dist)載入者用的是建置當時內嵌之下游版本;測試一律 import `src`.dist 由發布流程產製,要驗證 bundle 時自行執行 `node toolg/gDistRollup.mjs`.
- **下游已修正而未發布時,以 resolve hook 在本套件預驗繼承之行為**:`node --import <register.mjs>`,register 內以 `module.register` 掛一個 resolve hook,把 `'w-converhp/...'` 解析到本機 w-converhp repo;不動 node_modules.mocha 以 `--no-parallel` 跑(平行模式之 worker 是否帶入 hook 未驗).腳本放 AI 暫存區,不進本 repo(2026-10-13 預驗 L4 之修正).
- **依賴下游行為之測試,下游升版前以 pending 呈現**:條件須同時為「安裝版號等於已知缺陷之版號」與「觀察到舊行為」——只看行為會把日後之回歸也吞成 pending;只看版號則升版前無法以 resolve hook 預驗(本機 repo 之版號尚未更新).本套件自身之斷言(如監聽數)放在 pending 判定之前,使其不受版號影響(`test/api-verify-upload.test.mjs`).
- **對舊版下游跑對照組須設上限**:w-converhp 2.1.6 之伺服器無 upload 監聽時,官方 client 之 upload() 不會結束(2026-10-13 實測逾 2 分鐘而中止;依 w-converhp 之修正說明,舊版先傳完全部切片再無限輪詢合併).
- **下游新增選項且預設相容時,本套件(整包轉傳)只需補文件與行為測試**(2026-10-24,w-serv-webdata 1.1.16 之 `sysFuncsPublic`):`unit-optDoc` 轉紅即提醒補 `@param`;行為測試要證明「轉傳到達」而非只證明下游自己正確——需有「所給之值不同,結果即不同」的多組設定(預設、只公開 getFuncList、公開 getFuncList 與 getTableTags)與有給而無效之同步拋錯,否則「固定轉傳某一組」或「吞掉」之變異抓不到.
- **升下游時一併看傳遞依賴之鎖定版**:`npm i w-serv-webdata@^1.1.16` 不會更新已滿足 `^1.1.11` 之 w-serv-broadcast(留在 1.1.11),新安裝者卻取得 1.1.12;以 `npm update <傳遞依賴>` 只更新鎖檔與 node_modules 即可,不動 package.json.用「新安裝者實得之版本」測才與使用端一致.

## 事件與生命週期

- **wsemi 之 `evem` 是 eventemitter3:無監聽之 `error` 不拋也不保留,直接遺失**(與 Node 之 EventEmitter 相反).下游在建構子內同步 emit 之 error,呼叫端於 `new` 之後才掛監聽必收不到.解法是轉送監聽先於下游建構掛上、建構期間暫存、建構子回傳後以計時器轉出(同 w-converhp 之 `evEmitDelay`).
- **轉出計時器到期前 listen 可能已完成**:只延後轉出時,使用端 `await ready()` 後可能還沒收到建構期之 error;須讓啟動流程先 await 轉出完成.
- **hapi 之 `server.info.started` 於 listen 之前即設定,失敗時不歸零**(`@hapi/hapi/lib/core.js` 之 `_start`),不可用來判斷是否已啟動;以 `server.start()` 之 promise(本套件 `ready()`)判定.
- **含 inert handler(directory/file)之路由須在 `server.register(Inert)` 之後才能掛**,否則 `Unknown handler`;w-converhp 之六條路由為函數 handler,可在 Inert 之前掛.hapi 依路徑具體度比對,與註冊順序無關.
- **w-serv-webdata 各擴充層(broadcast、Exec、Sync、w-sync-webdata)都在同一個事件物件上擴充並回傳它本身**,故在 w-converhp 實體上掛一次 error 轉送即涵蓋各層;清理所需之 `clearBroadcast` 也掛在同一物件上.
- **下游之釋放函數各自命名、不可叫 `stop`**:各層擴充同一個事件物件,w-converhp 已掛 `stop`,同名即互相覆蓋;故 w-serv-broadcast 用 `clearBroadcast`、w-sync-webdata 用 `clearSync`(2026-10-13 與 w-sync-webdata 主責 agent 確認),本套件 `stop()` 經同一物件逐一呼叫(`clearDownstream`).
- **w-serv-broadcast 伺服端有 1 秒 interval,不 `clearBroadcast()` 則行程不會自行結束**;前端輪詢過後之在線偵測 interval 於 1.1.7 起由 clearBroadcast 一併清除(原最長約 10 秒).其停止時對已進入之前端補發之 clientLeave、clientChange 以 1ms 計時器派發,會晚於本套件 stop 之 resolve(L10).
- **前端延後啟動時,回傳物件須於回傳前即存在**:以 w-converhp 前端之事件物件(建構不連線、不起計時器)作回傳值,w-serv-webdata 延後至取得 token 才於同一物件上擴充;停止函數於回傳前即掛上,等待中呼叫即取消,建立資料同步後由下游之同名函數覆寫,等待期間取得之參照則轉呼叫下游(R10).
- **wsemi 之 waitFun 不適合「等使用者登入」**:預設 attemptNum 200(配 timeInterval 100 約 20 秒)即 reject;其 setInterval 之 async 回呼內 fun 拋錯即成未處理之 rejection;無取消;前次 promise 未結束時下一次照樣呼叫.改用 setTimeout 串接(前次結束才排下次)、無上限、可取消之迴圈.
- **下游各層前端之停止與在途請求**(2026-10-14 起):w-serv-broadcast 1.1.9 中止在途之輪詢,w-serv-webdata 1.1.12 中止自身在途之請求(皆經 w-converhp 2.1.8 之 per-call `opt.signal`);使用端之 $fapi 與直接 execute/upload/download 依設計不中止(upload 合併輪詢於兩端停止後無上界).2026-10-13 時(webdata 1.1.10、broadcast 1.1.7)為「只停計時器、不停進行中之流程」(原 L8).
- **歸因下層改善要用版本矩陣實測,不看 changelog**:同一情境(先停前端後立即停伺服器,retryMain=3)以 resolve hook 換入各版副本對照,webdata 1.1.10/1.1.11/1.1.12 為 5/4/0 則、broadcast 1.1.8/1.1.9 則只影響「輪詢在途或退避中停止」;原以為 5→4 是 broadcast 之功,實為 webdata 1.1.11.
- **本套件自發之 error 一律經 evEmit**:派發點在計時器、catch、stop 之內時,直接 `ev.emit` 遇監聽器拋錯即成 uncaughtException 或未處理之 rejection,stop 亦不再恆 resolve(R11).
- **getInstWConverServer 所得實體上之 stop 是 w-converhp 的,不是本套件的**:serverHapi 模式下它直接 `server.stop()`,會停掉本伺服器(埠釋放)但不呼叫 clearBroadcast/clearSync,行程因上述 interval 無法自行結束(2026-10-13 子行程實測:8 秒未結束;改呼叫本套件之 stop 則結束).JSDoc 之 @returns 已註明.

## 測試

- **test script 依全域規範不帶 `--exit`**,任何殘留之伺服器、計時器或佔埠之 net 伺服器都會讓 mocha 掛住而非失敗.案例之建構一律放在 `try` 內、清理放 `finally`;「預期拋錯」之輔助函數若建構意外成功,須先停掉伺服器再回報.
- **變異驗證以 `spawnSync` 跑 mocha 時須給 `timeout`**:2026-10-13 一項變異使佔埠伺服器未關閉,mocha 不結束,變異腳本卡住超過 10 分鐘,src 停在變異狀態;逾時應標 HANG 並保留已輸出之摘要.腳本須在 finally 還原,並於結束後核對 src 無變異殘留.
- **「拋錯後無殘留計時器」不能在 mocha 行程內以 `process.getActiveResourcesInfo()` 斷言**(worker 會被重用、mocha 自有計時器),改以子行程(`test/tools/child-exit.mjs`)驗證能在時限內自行結束.
- **unit-ports 守門會掃註解**:測試檔內連註解也不可寫 `8xxx` 之 port 字面值,引用預設值請寫 `reserved.packageDefault`.
- 測試暫存一律 `test/_tmp/<案名>`(已列 gitignore),`./tmp` 是 AI 代理暫存區、隨時可能被清空,測試不可用.
- **以官方 client 上傳時,前後端之 sizeSlice 須一致**,否則 client 以 `sizeSlice mismatch: client[…] and server[…] must be equal` reject(w-converhp 之協定,伺服端 JSDoc 已載);2026-10-13 驗收腳本誤設 client 1024、伺服器取預設 1MB 而誤判.
- **以舊碼重現新測試時,舊碼之缺陷本身會留下殭屍**:舊碼回傳 null 而無法停止之前端,於案例失敗後持續輪詢;mocha 因此不結束,其輪詢更打到之後另一次執行於同一 port 啟動之伺服器,使該次之輪詢計數誤判(2026-10-13:t5 案 3→5 次,以探針確認實作正確後才查到).重現完立即結束該行程.TaskStop 只結束外層 bash,node 孫行程(npx→mocha)仍在,須以 `ps -W` 依啟動時刻找 WINPID 後 `taskkill /F /T`,並回驗(行程清單無殘留、log 不再增長).
- **「停止後行程可立即結束」之測試須隔離所測對象,且要確認真的走到所測之在途點**:webdata 1.1.12 起前端停止即中止自身在途請求,不必再先等 500ms(polled-stop 之間隔保留為「間隔停止」之回歸);各在途點各立一案(`test/api-client-stop.test.mjs`),子行程印情境標記(METHODS、OPEN-ONCE、SELECT-INFLIGHT…)再斷言,否則可能停在「什麼都不在途」之時點而空斷言.2026-10-14 實例:原「先停伺服器、輪詢退避中再停前端」一案停止時在途者其實是取時間戳之請求,換入 broadcast 1.1.8 仍綠;改為收到同步資料後才停伺服器,才真正守住輪詢之中止.
- **伺服端 stop(hapi)只等連線,不等 handler**:連線先被前端中止者 stop 立即 resolve,應用處理續跑並照常寫副作用,行程待其完成;要驗「stop 不等已中止之連線」須把伺服端處理以 deferred 掛住、stop 完成後才放行,否則舊版(不中止)時 stop 會等到 hapi 之 5 秒逾時.
- **工作樹之換行依 git 之 core.autocrlf(本 repo 為 true:工作樹 CRLF、index LF)**:以字串錨點做變異之腳本,錨點之 `\n` 須轉為檔案實際之換行,否則多行錨點全數找不到(2026-10-13 第一次執行 11 項中 9 項 ANCHOR-0).換行差異不進提交(git 依 autocrlf 正規化).
- **Grep 工具搜 node_modules 內容時,path 直接指到套件目錄**:以 path=node_modules 加 glob 過濾時結果不完整(2026-10-13 漏掉 w-converhp 之三支 worker 產物).
- **不以「中途換 token」模擬無權限**(2026-10-24):w-serv-webdata 1.1.16 起輪詢之身分與 clientId 綁定,同一前端連線換成他人或無身分,輪詢先被歸屬擋下、前端收不到表變更之推播(`api-sync-authorize` 因此逾時),測到的是歸屬而非授權.無權限一律由 `authorizeExec` 之回應模擬(`denied` 旗標,token 全程不變);也不為了讓舊測試通過而放寬歸屬.
- **模擬「已發布之舊前端元件」**(輪詢輸入恰為 `{ clientId }`,不帶 `__sysToken__`):本套件前端以 `useWaitToken: true` 延後建立資料同步,故 `startClient` 回傳後立即同步包裝 `cli.execute`(對 `[sys:polling]` 剝除 `__sysToken__`)即先於首次輪詢;`cli.clientId` 不存在,clientId 由包裝後之 execute 取得;再以伺服端被動觀察者(`await wsrv.getInstWConverServer()` 後 `.on('execute', (func, input) => …)`,不結算 pm)確認輸入鍵,否則夾具失效時測試空過.對照組:本版前端之輪詢輸入鍵為 `__sysToken__,clientId`(排序後).
- **「修前紅」用舊版相依之副本**:`npm pack <套件>@<舊版> --pack-destination ./tmp/…/tgz`,解壓(`tar -xzf … --strip-components=1`)到 `./tmp/…/pre/node_modules/<套件>`,連同 src 與 test 複製到 `pre/`;Node 對其餘相依向上解析至 repo 之 node_modules,mocha 以絕對路徑、cwd 設 `pre`(`quiet-run --cwd`)執行,repo 不動.2026-10-24 以 webdata 1.1.15 + broadcast 1.1.10 還原升級前環境.
- **「預期建構拋錯」之案例,建構意外成功時須即時停掉伺服器**:否則占住共用 port,其後同 port 之案例連帶以 EADDRINUSE 失敗,「紅幾條」失真(2026-10-24 修前紅時首次執行 7 條中 1 條為連帶).
- **各案須能獨立執行**(`--grep` 單跑):避免案例 B 靠案例 A 留下之資料或 error 事件;比對 error 事件用「案例開始前之長度」切片,同步表資料就緒用「非空」而非前案留下之具體值.
- **變異驗證之錨點須容 CRLF**:正則寫 `\r?\n`;副本除 `src` 與 `test` 外,`unit-optDoc` 以 cwd 相對路徑讀 `./node_modules/w-serv-webdata/src`,故副本內需有該目錄(其餘相依靠 Node 向上解析,不需目錄連接點);`spawnSync` 不用 shell、設 `timeout`,結束後核對 repo 之 src 無變異殘留(變異只動副本).
- **跨來源之驗證以「預檢(通訊路由)+ 實際請求(apis 路由)」各取 ACAO**:實際請求打 `/api/main` 會因封包格式不符而觸發 w-converhp 之 error 事件,改打 apis 之路由即無雜訊,且與通訊路由共用伺服器層之 cors 設定(`test/api-exposure.test.mjs`).

## 選項值域

- **預設落在寬鬆側之選項,「無效取預設」就是 fail-open**:useInert 預設公開、pathStaticFiles 預設公開 dist,給錯值(環境變數之字串 `'false'`、空字串)即公開.判準不是「有沒有檢核」,而是「無效時落在哪一側」;預設即安全側者(useDbOrm=false、apis=[]、useShowLog)才可沿用「非 X 視為未指定」(2026-10-13,R9).
- **wsemi 之 isearr 有單元素陷阱**:`isearr([null])`、`isearr([''])`、`isearr([{}])` 皆為 false(長度為 1 時以 iser 判空),會把有給之陣列當成未給;要判「是不是陣列」用 isarr,空陣列另判.
- **hapi 之 cors.origin**:Joi 只驗 `array().min(1).allow('ignore')`,元素到 `lib/cors.js` 才處理——非字串元素拋 TypeError、`'*'` 與其他並存為 assert,皆於 `new Hapi.Server` 時同步拋;`[]` 被 Joi 拒絕,故「停用跨域」須給 `routes.cors: false`.停用後預檢回 404、實際請求無 ACAO(2026-10-13 實測,含真瀏覽器跨來源 fetch 失敗).

## 判斷

- **標「待使用者裁示」之前,先查家族套件有無既有結論**.2026-10-13 原把「是否移除 process 之 uncaughtException/unhandledRejection 監聽」列待裁示,事後在 w-package-tools `src/rollupWorkerCore.mjs:850-854` 之樣板註解找到已定案之同族規則(函式庫不得劫持宿主之全域錯誤語意),遂直接依其移除.自有套件之註解、帳本與樣板是規格來源,不是只能參考的線索.
- 引用 w-converhp 2.1.7 以前之程式,未捕捉例外會被印三次 `outer:uncaughtExceptionMonitor`:來自其三支 worker bundle 之 outer 層各自註冊之全域 monitor(w-package-tools 1.1.16 樣板).w-converhp 2.1.8 起已以修正後之樣板重建(原 L7 解除);本套件受追蹤之 dist 若仍以舊版建置則仍帶 3 個,發布時重建,以 `test/tools/child-import.mjs` 對 dist 實測 import 前後即可分辨(舊 dist 0→3).
- **轉送監聽會改變下層「無監聽者」之政策**:本套件伺服端常駐 `instWConverServer.on('error', emitError)`,下層(wsemi evEmit、w-serv-broadcast、w-sync-webdata)因此判定「有人在聽」而不再 console.error,外層無人聽時錯誤即消失——比直接用下層更安靜.任何「轉送 error」之包裝層都要自己負責無監聽者時之輸出(2026-10-14 審計 F14,R11).
- **修 bug 之範疇取類別,不取提報句**:提報只寫「前端回傳 null、catch 內再拋」,依類別(前端之建構、等待、停止,與本套件自發 error 之派發)盤查另得 waitFun 約 20 秒即放棄、等待中 getToken 拋錯之未處理 rejection、等待中無法停止、伺服端三處直接 emit(計時器、catch、stop),驗收停止路徑時再得下游前端停止不中止進行中流程(L8).結論已併入帳本 R10、R11.

- **文件轉述下游規則所含之數值或時序,先以探針實測再寫**(2026-10-24):下游文件寫「歸屬綁定逾時約 10 秒解除」,探針(換身分後逐次記錄被拒時刻)實測為被拒 5 次(0.5–8.5 秒)後放行,且換身分當時之變更不補送;我最初擬寫的「換 token 後約 10 秒恢復」若不測,「推播會恢復送達」之暗示會是錯的.探針落 `./tmp/…`,結果寫入帳本 L13,不入測試(慢測且屬下游規則).

## 派工審查

- 2026-10-13 以 `dispatch-claude`(`claude-opus-5-5`、`--effort max`)×2 與 `dispatch-codex`(`gpt-6.1-sol`、`model_reasoning_effort="max"`)×1 獨立審查,各約 23–26 分鐘.Claude 給 `--tools Read,Glob,Grep,Bash` 白名單加 `--allowedTools 'Read,Glob,Grep,Bash(node *),Bash(git *)'`、`--setting-sources project`、`--strict-mcp-config`,報告走 stdout 回收;Codex 用 `read-only` 沙箱加 `--output-last-message` 回收報告,提示詞寫明以 `rg -n '^' --` 讀中文檔且不寫「不能執行指令」.以建議檔中文行作 canary,三份皆逐字命中.
- 審查材料先附輸入空間表再附方案;三份審查找出之表缺漏(建構期 error 遺失、同步拉表被拒得空表、Sync 段殘留、port 兩通道、apis 衝突翻轉、`info.started` 誤判)皆屬實,原方案之 Q5、Q7 結論被推翻.自審之表一定有洞.
- 2026-10-14 審計(停止之生命週期):以 Agent 工具派 Claude 子代理(opus,唯讀,暫存落 `tmp/review01/`,限用 port 8740–8744)挑戰全盤表,其自寫探針經本套件真實 API 跑 28 情境,約 26 分鐘,回 57 條;逐條對原始碼或其結果檔核對後全採 53、部分採納 3、駁回 1,表由 65 列補至 104 列並更正 4 格——最重要者:伺服端 stop 只等連線不等 handler、本套件之轉送監聽使無監聽者時之錯誤靜默(F14)、使用端 upload 合併輪詢於兩端停止後無上界.駁回之一例:「以時間戳補寫失敗作清理拋錯之真實觸發」不成立,因 w-sync-webdata 於 clearSync 內攔截並以事件發出、不拋出.
- 變異驗證以 `spawnSync` 跑 mocha 而逾時時,`shell: true` 只殺外層 shell,npx→mocha 之孫行程留下(且常帶著未停之伺服器或計時器);每次變異執行後以 `Get-CimInstance Win32_Process` 比對 CommandLine 撈本 repo 之殘留,`taskkill /F /T` 後回驗(2026-10-14 兩度發生:清理不呼叫 clearDownstream、清理不攔拋錯).
