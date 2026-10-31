import Hapi from '@hapi/hapi'
import Inert from '@hapi/inert'
import get from 'lodash-es/get.js'
import isarr from 'wsemi/src/isarr.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import isstr from 'wsemi/src/isstr.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import cint from 'wsemi/src/cint.mjs'
import evem from 'wsemi/src/evem.mjs'
import evEmit from 'wsemi/src/evEmit.mjs'
import getDiag from 'wsemi/src/getDiag.mjs'
import WConverhpServer from 'w-converhp/src/WConverhpServer.mjs'
import WServWebdataServer from 'w-serv-webdata/src/WServWebdataServer.mjs'


/**
 * Hapi伺服器端之資料控制與同步器
 *
 * 身分驗證責任(跨套件原則,見自有套件庫主控之 dspec「使用者身分驗證原則」): 本套件不驗證token, 只於各關卡呼叫使用方注入之函數; 未注入時之預設為放行或無身分(verifyConn未給即全部放行、getUserIdByToken預設回空字串).
 * 使用方須自行完整驗證——verifyConn驗連線之token(含本系統使用者存在、啟用、部署方授權); getUserIdByToken反查執行身分, 即驗證身分, 須同等完整, 不可只解碼或只查id; authorizeExec授權表操作(預設拒絕); apis路由不經verifyConn、與kpFunExt皆須各自把關, 含函數層級之角色或成員檢查.
 * 系統函數([sys:getFuncList]、[sys:getTableTags]、[sys:polling])之身分關卡由opt.sysFuncsPublic決定(原樣轉傳w-serv-webdata): 預設三者皆公開以相容既有前端元件, 使用方應於前端改用帶token之元件(WServHapiClient之getToken, 輪詢亦帶之)後顯式設為只公開['[sys:getFuncList]'], 使無有效身分者取不到同步表時間戳與廣播; 未登入須能進登入頁者須列出確實需要者. 輪詢之身分經getUserIdByToken每輪反查(已發布之舊前端元件之輪詢未帶token, 以無身分處理而不反查)並與clientId綁定, 同一前端連線中途換成他人身分(含無身分與有身分互換)會被拒絕, 換身分請重新載入頁面或重建前端連線.
 *
 * @class
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.port=8080] 輸入Hapi伺服器通訊port，須為1至65535之整數，無效時取預設8080
 * @param {Array} [opt.corsOrigins=['http://localhost']] 輸入允許跨域呼叫之網域陣列，給予['*']代表允許外部任意網域跨域('*'須單獨出現)。給予單一字串時視為只含該網域之陣列；給予false或[](含只有空字串者)代表停用跨域：不回應CORS標頭，瀏覽器無法跨來源讀取回應(伺服器端之存取控制仍由verifyConn決定)；陣列中之空字串會被忽略。未給(undefined或null)時取預設；給予其他值時建構即同步拋錯，不會退回預設；hapi不接受之陣列(如含非字串元素、'*'與其他網域並存)由hapi於建構時同步拋錯。允許跨域時，回應以Access-Control-Expose-Headers曝露Return-Type、Return-Msg、Return-Retryable、Content-Disposition四個標頭，使前端(browser)與API不同源時download仍可讀取成敗與檔名，預設['http://localhost']
 * @param {Boolean} [opt.useInert=true] 輸入是否使用@hapi/inert提供pathStaticFiles資料夾下之靜態檔案，靜態檔案不經verifyConn，即對所有連線者公開。未給(undefined或null)時取預設；有給但非布林值(如字串'false'、數值0)時建構即同步拋錯，不會退回提供，預設true
 * @param {String} [opt.pathStaticFiles='dist'] 輸入當useInert=true時指定伺服器資料夾名稱。未給(undefined或null)時取預設；有給但非非空字串時不論useInert皆建構即同步拋錯，不會改為公開預設資料夾，預設'dist'
 * @param {Array} [opt.apis=[]] 輸入額外之Hapi路由設定陣列，不經verifyConn須自行把關。路徑不得與本套件之通訊路由(以`/${apiName}/`開頭之main、ulctr、slc、dwgfn、dwgf、dw)衝突，衝突時伺服器不啟動，ready以該錯誤reject並發出error事件，預設[]
 * @param {String} [opt.apiName='api'] 輸入API名稱字串，原樣轉傳w-converhp，預設'api'
 * @param {String} [opt.pathUploadTemp='./uploadTemp'] 輸入暫時存放切片上傳檔案資料夾字串，原樣轉傳w-converhp，由其建立資料夾並以error事件回報失敗，預設'./uploadTemp'
 * @param {String} [opt.tokenType='Bearer'] 輸入token類型字串，原樣轉傳w-converhp，預設'Bearer'
 * @param {Integer} [opt.sizeSlice=1024*1024] 輸入切片上傳檔案之切片檔案大小整數，單位為Byte，原樣轉傳w-converhp，須與前端之sizeSlice一致，預設為1024*1024
 * @param {Integer} [opt.sizeMsg=100*1024*1024] 輸入單次請求本體大小上限整數，單位為Byte，原樣轉傳w-converhp。適用於除切片上傳外之各API，超過上限會回應413，大檔案請改用切片上傳，預設為100*1024*1024
 * @param {Integer} [opt.delayForSlice=100] 輸入切片上傳檔案API用延遲響應時間，單位ms，原樣轉傳w-converhp，預設100
 * @param {Function} [opt.verifyConn=()=>{return true}] 輸入呼叫API時之連線檢測函數，原樣轉傳w-converhp，可使用sync或async函數，回傳嚴格等於true才放行。作用於本套件之通訊路由(含切片上傳與下載)，不作用於靜態檔案與apis。未給(undefined或null)時全部放行；有給但非函數時不拋錯，通訊路由一律以permission denied拒絕，並由w-converhp於建構期間發出一則error事件。切片上傳另須於getInstWConverServer所得實體註冊upload監聽才會受理(本套件與w-serv-webdata皆不註冊)，未註冊時於寫入pathUploadTemp之前即回應'no listener for event[upload]'並發出error事件；註冊後若未給verifyConn，匿名請求亦可呼叫切片上傳而寫入pathUploadTemp。表操作之授權另由authorizeExec負責，預設()=>{return true}
 * @param {Function} [opt.getUserIdByToken=async()=>''] 輸入取得使用者ID的回調函數，原樣轉傳w-serv-webdata，傳入參數為前端提供之token字串(前端opt.getToken之值)，可使用sync或async函數，回傳非字串時視為空字串。此即驗證身分之步驟，須完整驗證(token有效、本系統使用者存在且啟用、部署方授權)，不可只解碼或只查id，與verifyConn所驗證者同等完整；其token取自請求內容(固定鍵__sysToken__)，與verifyConn所驗證者為不同來源，兩個身分各自須經完整驗證。系統函數與輪詢亦經此反查(帶token鍵之輪詢每輪反查一次；已發布之舊前端元件之輪詢未帶token鍵，以無身分處理而不反查)，預設回空字串即無身分，是否放行見sysFuncsPublic。拋錯或reject時一律拒絕該次呼叫(含列於sysFuncsPublic者)：一般呼叫其值原樣成為回應訊息並發出error事件；輪詢則前端只見固定訊息'[sys:polling] permission denied'，伺服端error事件為{ msg: '[sys:polling] verifyPolling error', err: 其值 }；有給但非函數時建構即同步拋錯，預設async()=>''
 * @param {Array} [opt.sysFuncsPublic=['[sys:getFuncList]','[sys:polling]','[sys:getTableTags]']] 輸入無須身分即可呼叫之系統函數名陣列，原樣轉傳w-serv-webdata(1.1.16起)，元素須為'[sys:getFuncList]'(函數名稱清單)、'[sys:getTableTags]'(同步表名與時間戳)、'[sys:polling]'(輪詢，取走該前端之廣播，含同步表時間戳廣播與部署方broadcast之內容)之一。列於其中者getUserIdByToken得空字串亦放行，未列者須得非空字串，否則拒絕：呼叫回應permission denied，輪詢則前端只見固定訊息'[sys:polling] permission denied'，原因經error事件供稽核。預設三者皆公開(相容既有行為：已發布之前端元件輪詢不帶token，預設收緊會使其即時同步失效)；框架預設為放行，使用方須自行設定——建議使用端於前端改用帶token之元件後，顯式設為只公開['[sys:getFuncList]']，使無有效身分者取不到同步表時間戳與廣播；空陣列則連函數名稱清單亦須身分。getUserIdByToken固定回空字串或沿用預設之部署(例如未登入須能進登入頁之單一登入系統)於嚴格設定下須列出前端未登入時要呼叫者(通常為三者)，否則前端因輪詢被拒絕而永不綁定。輪詢之身分與clientId綁定(以userId而非token計，同一使用者換另一枚token不受影響)：同一前端連線(同一clientId)中途改以他人身分輪詢會被拒絕，含無身分與有身分互換(預設三者皆公開時匿名亦被綁定，故由無身分變有身分亦被拒絕)，error事件原因為'clientId belongs to another userId'；嚴格設定下由有身分變無身分者則先被關卡拒絕(原因'empty userId')，不待歸屬解除且之後仍被拒絕。被拒絕之輪詢不刷新在線身分，至舊綁定因該clientId逾時離線(w-serv-broadcast之在線逾時約10秒)解除為止，期間之表變更推播不補送，故換身分(例如登出再以他人登入)請重新載入頁面或重建前端連線(新clientId)，不可只改getToken之回傳值。與useDbOrm無關；未給(undefined或null)時取預設；有給但非陣列或元素非上述三者之一時建構即同步拋錯(例如invalid opt.sysFuncsPublic)，建構後修改原陣列不生效，預設['[sys:getFuncList]','[sys:polling]','[sys:getTableTags]']
 * @param {Boolean} [opt.useDbOrm=false] 輸入是否開啟資料通道，原樣轉傳w-serv-webdata。給予true代表前端可直接呼叫由tableNamesExec與methodsExec組成之表操作(例如'tabA.select')，並自動同步tableNamesSync所指定之資料表至前端，此時operOrm、tableNamesExec、authorizeExec為必填，未給或無效時建構即同步拋錯。未指定(非布林值)時視為false，此時若給了operOrm、tableNamesExec、methodsExec、authorizeExec、kpOrm或tableNamesSync，建構即同步拋錯，預設false
 * @param {Object} [opt.kpOrm=null] 輸入各資料表的操作物件，原樣轉傳w-serv-webdata，用以提供由tableNamesSync指定資料表的change事件，key為表名而值為該表的操作器實體(可使用例如WOrmMongodb等建立)。useDbOrm=true時必填且須為物件，否則建構即同步拋錯；為空物件時不同步；tableNamesSync之各表須在其中且可監聽change事件，否則建構時同步拋錯，預設null
 * @param {Function} [opt.operOrm=null] 輸入各資料表的操作通用接口函數，原樣轉傳w-serv-webdata，傳入參數依序為userId、tableName、methodName、input，用以執行tableNamesExec所指定資料表之例如'select'、'insert'、'save'、'del'。前端呼叫表操作時須先通過authorizeExec授權才會呼叫operOrm，operOrm不負責授權。useDbOrm=true時必填，預設null
 * @param {Function} [opt.authorizeExec=null] 輸入資料表操作之授權函數，原樣轉傳w-serv-webdata，useDbOrm=true時必填。前端呼叫表操作時，於呼叫operOrm之前傳入物件{ userId, tableName, methodName, input }，可使用sync或async函數。採預設拒絕，回傳值須嚴格等於true才放行，其他值一律拒絕並回應'permission denied'且不呼叫operOrm；拋錯或reject時其值原樣成為回應訊息。userId取不到時為空字串，宜拒絕；methodName宜以白名單判斷。不作用於kpFunExt與系統函數，其拒絕亦不發出error事件。同步資料時前端以不帶參數之表操作select取整表，故tableNamesSync內之表其select須對所有連線者放行，否則被拒絕之前端取不到該表資料(既有資料維持不變)，且每次重抓皆於前端發出error事件，預設null
 * @param {Array} [opt.tableNamesExec=null] 輸入指定能被操作的表名陣列，原樣轉傳w-serv-webdata，各元素須為非空字串，useDbOrm=true時必填(可為空陣列)，否則建構即同步拋錯，預設null
 * @param {Array} [opt.methodsExec=['select','insert','save','del']] 輸入指定綁定操作器的方式陣列，原樣轉傳w-serv-webdata，各元素須為非空字串，可選'select'、'insert'、'save'、'del'、'delAll'。未給時取預設['select', 'insert', 'save', 'del']；useDbOrm=true時若有給須為陣列，否則建構即同步拋錯
 * @param {Array} [opt.tableNamesSync=null] 輸入指定能被同步的表名陣列，原樣轉傳w-serv-webdata，各元素須為非空字串。各表須在kpOrm中且可監聽change事件；前端以表操作select取同步資料，故各表亦須在tableNamesExec中且methodsExec含'select'(kpFunExt提供之同名函數不算)，違反者建構即同步拋錯；未給時不同步，預設null
 * @param {Object} [opt.kpFunExt=null] 輸入額外擴充執行函數物件，原樣轉傳w-serv-webdata，須為純物件，key為函數名而值為函數(值非函數時建構即同步拋錯)，函數第1參數為userId(取不到時為空字串)，之後為前端給予之參數。不經authorizeExec須各自把關。函數名須能被前端綁定：路徑不得為空或有空段，各段不得為'__proto__'、'constructor'、'prototype'，不得以'[sys:'開頭，頂層名不得為表名(例如表名為'tabA'時，'tabA'、'tabA.count'、'tabA[select]'皆不可)，且不同函數名不得解析為同一路徑或互為前綴(例如'a'與'a.b')，違反者建構時同步拋錯，預設null
 * @param {String} [opt.fpTableTags='./tableTags.json'] 輸入儲存各資料表時間戳檔案路徑串，轉傳w-serv-webdata，有給但非非空字串時建構即同步拋錯；未給時相容舊名fnTableTags，預設'./tableTags.json'
 * @param {Function} [opt.genTag=()=>'{random string}'] 輸入產生不重複識別碼函數，原樣轉傳w-serv-webdata，須回傳非空字串，有給但非函數時建構即同步拋錯，預設()=>'{random string}'
 * @param {Boolean} [opt.logDetail=false] 輸入診斷輸出是否還原為完整細節(含資料值與錯誤原文，供除錯)，原樣轉傳w-serv-webdata，本套件自身之診斷輸出(未監聽error時之console.error與error監聽器同步拋錯時之通報，見opt.funLog與@returns)亦依此選項(介面同wsemi之getDiag)。預設false時診斷輸出只含固定標籤與不含資料值、使用者id、token及錯誤原文之摘要(本套件自身者為標籤'[w-serv-hapi] error'加安全摘要，見opt.funLog)；憑證與token(網址帳密、password、token、Authorization、Bearer等鍵值，及w-serv-webdata所記住之token)無論如何皆遮罩為'***'(由wsemi之getDiag提供，範圍與限制見w-serv-webdata之opt.logDetail)。有給(非undefined、null)但非布林值時建構即同步拋錯，預設false
 * @param {Function} [opt.funLog=null] 輸入診斷輸出函數(label, safe, detail)，原樣轉傳w-serv-webdata，本套件自身之診斷輸出亦交給它。給予時診斷輸出只交給它而不寫console：label為固定標籤，safe為不含資料值之摘要，detail為完整細節(含資料值與錯誤原文，憑證與token已遮罩為'***'；無細節者不傳)，供使用端遮罩或轉送至自己的日誌；其拋錯與回傳promise之reject皆被吞下，不影響本套件流程。有給(非undefined、null)但非函數時建構即同步拋錯。涵蓋本套件與w-serv-webdata之診斷輸出，不涵蓋其他下層(w-converhp、w-serv-broadcast、w-sync-webdata)自身之輸出。本套件自身之診斷輸出共兩項：①回傳之事件物件無error監聽者時之error事件內容(含下層送來者與使用端函數如getUserIdByToken之拒絕值)——label為固定標籤'[w-serv-hapi] error'，safe為{ from, errType, errCode }(from為固定詞彙之來源別：downstream下層轉送、clear釋放下游資源失敗、start啟動失敗、stop停止失敗；errType為錯誤類別；errCode為白名單內之系統與Node錯誤代碼，例如EADDRINUSE；皆不含錯誤訊息文字與資料值)，detail為遮罩後之錯誤細節(經wsemi之getDiag，憑證樣式遮罩為'***'；不認識之裸字串密碼與token不在保證內)；未給funLog時預設console.error(label, safe)，opt.logDetail為true時改為console.error(label, detail)；②error監聽器同步拋錯時之通報(由wsemi之evEmit攔截後經getDiag輸出，行程不崩潰)——label為固定標籤'[wsemi w-serv-hapi] listener threw'，safe為{ errType, errCode }(監聽器所拋錯誤之類別與代碼，不含拋出值)，detail為{ event, err }(err為監聽器之拋出值，憑證樣式遮罩為'***')，輸出規則同①：預設console.error(label, safe)，opt.logDetail為true時改為console.error(label, detail)，給予funLog時只交給它。有error監聽者而其未拋錯時照常派發，不寫console亦不呼叫funLog(交給監聽器之值不經本套件遮罩)。opt.useShowLog之基本資訊行不屬診斷輸出，不經funLog，預設null
 * @param {Function} [opt.onTrace=null] 輸入觀察回調函數，格式為(e)=>{}，供測試與診斷以事件(而非等待毫秒)同步，原樣轉傳w-serv-webdata(1.1.19起)，其再原樣轉交所包之w-serv-broadcast伺服端之opt.onTrace。事件種類(alive、prune、emit、deliver、report、stop)與欄位、時機及回調之契約(同步呼叫、e為凍結物件、拋錯與回傳之rejection皆忽略、未給或非函數時忽略)以w-serv-webdata與w-serv-broadcast之JSDoc為準，本套件不增減事件；w-sync-webdata之onTrace不轉交(同w-serv-webdata)，預設null
 * @param {Boolean} [opt.useShowLog=true] 輸入是否使用console.log顯示基本資訊布林值，預設true
 * @returns {Object} 回傳事件物件，可監聽error事件，涵蓋啟動失敗與執行期錯誤(含w-converhp、w-serv-webdata、w-serv-broadcast、w-sync-webdata經本套件轉送者)，內容依來源層而異(hapi之Error、w-converhp之訊息字串、w-serv-broadcast與w-sync-webdata之{msg,err})；建構期間發生者於建構子回傳後才發出，故須於new之後立即監聽；未監聽error時改以console.error輸出(前綴[w-serv-hapi])，預設只輸出固定標籤與錯誤類別、代碼之安全摘要，不含錯誤訊息文字與資料值，細節由opt.logDetail或opt.funLog取得(見opt.funLog)；error監聽器之同步拋錯不會使行程崩潰(改以console.error輸出固定標籤'[wsemi w-serv-hapi] listener threw'與錯誤類別、代碼之安全摘要，不含拋出值；opt.logDetail為true時改輸出遮罩後之細節，給予opt.funLog時只交給它而不寫console，見opt.funLog)，亦不影響ready與stop之結果。設定錯誤(例如useDbOrm=true而未給authorizeExec、useInert有給但非布林值)於建構時同步拋出(w-serv-webdata之設定錯誤拋出時，pathUploadTemp資料夾可能已由w-converhp建立)。另提供：ready函數，回傳promise，伺服器啟動成功時resolve為hapi伺服器實體，啟動失敗(例如埠被占用、apis路由衝突)時以原錯誤reject；stop函數，回傳promise，等待啟動結束後依序釋放下游於同一事件物件上所建立之資源(w-serv-broadcast之輪詢計時器與在線偵測；資料同步：移除掛於kpOrm之change監聽、取消待推播之時間戳並將尚未落檔者寫入檔案，落檔失敗時發出error事件)再停止伺服器，恆resolve，失敗時發出error事件。停止時不再接受新連線，閒置之連線立即關閉，仍有請求進行中之連線最多等待5秒(hapi之預設)後中斷；stop只等連線，不等也不中止應用端之處理(operOrm、kpFunExt等)與上傳之合併worker：連線已中斷者(例如前端已停止而中止其請求)stop即完成，其處理仍續行並照常寫入副作用，Node行程待其完成才結束；前端未中止之請求(例如使用端之$fapi呼叫)於連線被中斷時失敗並依其重試設定重試，故宜先停止前端再停止伺服器。停止為終態：其後ready仍回傳原結果，再呼叫stop回傳同一promise而不再停止，請勿以getServer所得實體重新start(下游已釋放，只剩半個服務)。停止時w-serv-broadcast對已進入之前端補發之clientLeave與clientChange於其後約1ms才送達，可能晚於stop之promise；前端停止而伺服器繼續服務時，w-serv-broadcast約10秒(其在線逾時)後才判定該前端離線並發出clientLeave。同一行程內多個實例須給不同之fpTableTags與pathUploadTemp。本套件不註冊process之unhandledRejection、uncaughtException與uncaughtExceptionMonitor監聽，全域錯誤政策由使用端自行決定；getServer函數，回傳promise，resolve為hapi伺服器實體(不保證已啟動，確認啟動請用ready)，其stop、start請勿自行呼叫(並發時本物件之stop會於hapi停止前即resolve)，停止請一律用本物件之stop；getInstWConverServer函數，回傳promise，resolve為經w-serv-webdata擴充後之通訊實體，可於其上註冊upload監聽以受理切片上傳；其上另有w-converhp所掛之stop，呼叫會直接停止本伺服器而不釋放下游資源，停止請一律用本物件之stop
 * @example
 *
 * import fs from 'fs'
 * import _ from 'lodash-es'
 * // import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs' //自行選擇引用ORM
 * import WOrm from 'w-orm-lowdb/src/WOrmLowdb.mjs' //自行選擇引用ORM
 * import WServHapiServer from './src/WServHapiServer.mjs'
 *
 * async function run() {
 *
 *     //預先刪除w-orm-lowdb資料庫
 *     try {
 *         fs.unlinkSync('./db.json')
 *     }
 *     catch (err) {}
 *
 *     //optWOrm
 *     let optWOrm = {
 *         // url: 'mongodb://username:password@127.0.0.1:27017',
 *         // db: 'servhapi',
 *         url: './db.json',
 *         db: 'servhapi',
 *         cl: '',
 *     }
 *
 *     //tableNamesExec, tableNamesSync
 *     let tableNamesExec = ['tabA', 'tabB']
 *     let tableNamesSync = ['tabA']
 *
 *     //kpOrm
 *     let kpOrm = {}
 *     for (let k in tableNamesExec) {
 *         let v = tableNamesExec[k]
 *         let opt = { ...optWOrm, cl: v }
 *         let wo = new WOrm(opt)
 *         kpOrm[v] = wo
 *     }
 *
 *     async function saveData(cl, r) {
 *
 *         //w
 *         let w = kpOrm[cl] //一定要由woItems操作, 否則傳woItems進去WServHapiServer會無法收到change事件
 *
 *         //save
 *         await w.save(r) //autoInsert: false
 *             .then(function(msg) {
 *                 console.log('save then', cl, msg)
 *             })
 *             .catch(function(msg) {
 *                 console.log('save catch', cl, msg)
 *             })
 *
 *     }
 *
 *     let r
 *     r = [
 *         {
 *             id: 'id-tabA-peter',
 *             name: 'peter',
 *             value: 123,
 *         },
 *         {
 *             id: 'id-tabA-rosemary',
 *             name: 'rosemary',
 *             value: 123.456,
 *         },
 *         {
 *             id: 'id-tabA-kettle',
 *             name: 'kettle',
 *             value: 456,
 *         },
 *     ]
 *     await saveData('tabA', r)
 *     r = [
 *         {
 *             id: 'id-tabB-peter',
 *             name: 'peter',
 *             value: 123,
 *         },
 *         {
 *             id: 'id-tabB-rosemary',
 *             name: 'rosemary',
 *             value: 123.456,
 *         },
 *     ]
 *     await saveData('tabB', r)
 *
 *     let ntv = 0
 *     let genValue = () => {
 *         ntv++
 *         return `value-${ntv}`
 *     }
 *
 *     let n = 0
 *     let tn = setInterval(() => {
 *         n++
 *         console.log('update tabA', n)
 *         r = {
 *             id: 'id-tabA-peter',
 *             name: 'peter',
 *             value: genValue(),
 *         }
 *         saveData('tabA', r)
 *         if (n >= 5) {
 *             clearInterval(tn)
 *         }
 *     }, 3000)
 *
 *     let procCommon = async (userId, tableName, methodName, input) => {
 *         // console.log('procCommon call', tableName, methodName, input)
 *         let r = await kpOrm[tableName][methodName](input)
 *         // console.log('procCommon result', r)
 *         return r
 *     }
 *
 *     let uploadFile = async (userId, { name, u8a }) => {
 *         console.log('uploadFile', userId, name, _.size(u8a))
 *         // fs.writeFileSync(name, Buffer.from(u8a))
 *         console.log('uploadFile writeFileSync finish')
 *         return 'finish'
 *     }
 *
 *     let add = async (userId, { pa, pb }) => {
 *         // console.log('add', userId, pa, pb)
 *         return `result: pa+pb=${pa + pb}`
 *     }
 *
 *     let ntg = 0
 *     let genTag = () => {
 *         ntg++
 *         return `tag-${ntg}`
 *     }
 *
 *     //WServHapiServer
 *     let wsrv = new WServHapiServer({
 *         port: 8080,
 *         apis: [],
 *         verifyConn: ({ apiType, authorization, query, headers, req }) => {
 *             console.log('verifyConn', `apiType[${apiType}]`, `authorization[${authorization}]`)
 *             return true
 *         },
 *         getUserIdByToken: async (token) => { //可使用async或sync函數
 *             return 'id-for-admin'
 *         },
 *         useDbOrm: true, //開啟資料通道, 此時operOrm、tableNamesExec、authorizeExec為必填
 *         kpOrm,
 *         operOrm: procCommon, //procCommon的輸入為: userId, tableName, methodName, input
 *         authorizeExec: async ({ userId, tableName, methodName, input }) => { //可使用async或sync函數, 預設拒絕, 回傳嚴格等於true才放行
 *             if (userId !== 'id-for-admin') {
 *                 return false //取不到使用者時userId為空字串, 一律拒絕
 *             }
 *             if (tableName === 'tabB' && methodName !== 'select') {
 *                 return false //tabB僅供讀取
 *             }
 *             return true
 *         },
 *         tableNamesExec,
 *         methodsExec: ['select', 'insert', 'save', 'del'],
 *         tableNamesSync,
 *         kpFunExt: { //接收參數第1個為userId, 之後才是前端給予參數
 *             uploadFile,
 *             add,
 *             //...
 *         },
 *         // fpTableTags: 'tableTags-serv-hapi.json',
 *         genTag,
 *     })
 *
 *     wsrv.on('error', (err) => {
 *         console.log(err)
 *     })
 *
 *     //停止: 宜先停止前端(其clearBroadcast與clearSync), 再停止伺服器; stop恆resolve, 停止為終態
 *     // await wsrv.stop()
 *
 * }
 * run()
 *
 * // save then tabA [
 * //   { n: 1, nInserted: 1, ok: 1 },
 * //   { n: 1, nInserted: 1, ok: 1 },
 * //   { n: 1, nInserted: 1, ok: 1 }
 * // ]
 * // save then tabB [ { n: 1, nInserted: 1, ok: 1 }, { n: 1, nInserted: 1, ok: 1 } ]
 * // Server running at: http://DESKTOP-6R7USAO:8080
 * // Server[port:8080]: now clients: 1
 * // uploadFile id-for-admin zdata.b1 3
 * // uploadFile writeFileSync finish
 * // update tabA 1
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 * // update tabA 2
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 * // update tabA 3
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 * // update tabA 4
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 * // update tabA 5
 * // save then tabA [ { n: 1, nModified: 1, ok: 1 } ]
 *
 */
function WServHapiServer(opt = {}) {
    let ev = evem()

    //port, 比照w-converhp: 須為安全正整數且不超過65535, 否則取預設; 檢核與正規化須成對(ispint亦接受數字字串)
    //why: 原以isint檢核, -1於hapi建構時拋錯、70000則至啟動時才失敗, 同一選項之非法值分屬兩個通道
    let port = get(opt, 'port')
    if (!ispint(port, { useLimitSafe: true }) || cint(port) > 65535) {
        port = 8080
    }
    port = cint(port)

    //ownOpt, 曝露與存取控制之自用選項(corsOrigins、useInert、pathStaticFiles)之共同規則: 未給(undefined或null)取預設, 有給而無效時建構即同步拋錯, 不得退回預設
    //why: 原對有給而無效者靜默改用預設, 而useInert與pathStaticFiles之預設即公開資料夾(給予'false'、0仍公開, 給予''即改公開dist), corsOrigins給予false、[]亦被換成允許http://localhost, 使用端以為已關閉而實際未關且無任何訊號
    //通道依R2(可同步判定之設定錯誤於建構時同步拋出), 訊息比照w-serv-webdata之'invalid opt.X'; 檢核須早於Hapi與w-converhp之建構, 使拋錯時不留任何資源(w-converhp建構時即建立pathUploadTemp)
    //port(R5)、apis、useShowLog不適用: 其無效值所取之預設即安全側, 比照w-serv-webdata之useDbOrm「非布林值視為未指定」
    let ownOpt = (name, def, isValid) => {
        let v = get(opt, name)
        if (v === undefined || v === null) {
            return def
        }
        if (!isValid(v)) {
            throw new Error(`invalid opt.${name}`)
        }
        return v
    }

    //corsOrigins, 供本套件自建之Hapi伺服器設定cors, 預設刻意與w-converhp之預設['*']不同
    //值之語意比照w-converhp: false、''、[](含只有空字串者)代表停用跨域; 單一字串視為只含該網域之陣列; 陣列剔除空字串後交hapi判定, hapi不接受者(含非字串元素、'*'與其他網域並存)由其於建構Hapi伺服器時同步拋錯
    let corsOrigins = ownOpt('corsOrigins', ['http://localhost'], (v) => {
        return v === false || isstr(v) || isarr(v)
    })
    if (corsOrigins === false) {
        corsOrigins = []
    }
    if (isstr(corsOrigins)) {
        corsOrigins = [corsOrigins]
    }
    corsOrigins = corsOrigins.filter((v) => {
        return v !== ''
    })

    //useInert
    let useInert = ownOpt('useInert', true, isbol)

    //pathStaticFiles, 不論useInert皆檢核
    let pathStaticFiles = ownOpt('pathStaticFiles', 'dist', isestr)

    //apis
    let apis = get(opt, 'apis')
    if (!isearr(apis)) {
        apis = []
    }

    //fpTableTags, 相容舊名fnTableTags(w-serv-webdata只讀fpTableTags, 舊名傳下去等同未給而恆取其預設值)
    //僅於未給新名時才改用舊名, 有給之值原樣轉傳, 由w-serv-webdata檢核(有給但非非空字串時拋錯), 不可因無效而靜默改用舊名或預設
    let fpTableTags = get(opt, 'fpTableTags', null)
    if (fpTableTags === null || fpTableTags === undefined) {
        fpTableTags = get(opt, 'fnTableTags', null)
    }

    //useShowLog
    let useShowLog = get(opt, 'useShowLog')
    if (!isbol(useShowLog)) {
        useShowLog = true
    }

    //轉傳選項: 交給w-converhp(apiName、pathUploadTemp、tokenType、sizeSlice、sizeMsg、verifyConn、delayForSlice)與w-serv-webdata(useDbOrm、authorizeExec、operOrm等)者一律原樣轉傳, 本套件不另訂預設與檢核
    //why: 本套件曾對只負責轉傳之useDbOrm另訂預設true, w-serv-webdata 1.1.7改預設為false並新增必填authorizeExec後即分歧, 使用端一律無法啟動; 預設與檢核由下游單一擁有

    //emitError, 建構期間之error先暫存, 待建構子回傳後才依序轉出
    //why: 建構期間下游可能同步emit error(例如w-serv-webdata於useDbOrm=true而kpOrm無效時), 此時使用端尚未能監聽, 而evem為eventemitter3, 無監聽之error不拋亦不保留而直接遺失; 比照w-converhp之evEmitDelay
    //經wsemi之evEmit發出, 使用端error監聽器之同步拋錯由其攔截(改以console.error輸出): 轉出位於計時器、啟動失敗之catch與stop之內, 直接emit時其拋錯即成uncaughtException或未處理之rejection而使行程崩潰, stop亦不再恆resolve
    //無error監聽者時改以console.error輸出(CLAUDE_rulebook.md之R11), 一律經wsemi之getDiag之出口diag(R16; 診斷輸出與遮罩由wsemi單一擁有, 本套件不另寫遮罩)
    //why: 本套件常駐之轉送監聽(instWConverServer.on('error'))使下層判定有人在聽, 不再走其無監聽者即console.error之處置, 外層無人聽時即遺失而使下層本會印出之錯誤靜默
    //why 預設只輸出安全摘要: err含下層送來者(w-converhp之訊息字串、w-serv-broadcast與w-sync-webdata之{msg,err}等)與使用端函數之拒絕值(getUserIdByToken等), 可能夾帶使用者識別與使用端自填之值, 其不含憑證樣式者遮罩不會處理, 原樣印出會寫入使用端日誌;
    //故預設只輸出固定標籤'[w-serv-hapi] error'與{ from(固定詞彙之來源別), errType(錯誤類別), errCode(白名單內之錯誤代碼) }, opt.logDetail為true時輸出遮罩憑證後之細節, opt.funLog給予時只交給它(同w-serv-webdata之診斷輸出, 規則見getDiag)
    //本套件不持有靜態秘密(token屬使用端函數與w-serv-webdata所記住者), 故不給秘密清單, 只套通用憑證樣式(網址帳密、password=、token=、Authorization、Bearer等); nested: ['err']使w-serv-broadcast與w-sync-webdata之{msg,err}亦取得其err之代碼
    //交給使用端error監聽器之值不經遮罩(轉送端不改下游之值, 下游對自己交出之值負責), 有監聽者時亦不寫console與不呼叫funLog
    let diag = getDiag(opt, { safeKeys: ['from'], nested: ['err'] })
    //optEmit, evEmit攔截使用端error監聽器之同步拋錯後, 通報(其診斷輸出)亦屬本套件之診斷輸出, 故logDetail、funLog與上同源(使用端opt, 建構時取快照)一併交給evEmit, 由其經getDiag輸出:
    //預設只輸出固定標籤'[wsemi w-serv-hapi] listener threw'與{ errType, errCode }(不含拋出值), logDetail為true時輸出遮罩後細節, funLog給予時只交給它而不寫console
    //why: 只給tag時evEmit不知使用端之選項, 通報恆走console而不受logDetail、funLog控制, 與「本套件之診斷輸出依此二選項」之契約不一致(給funLog者仍會在stderr見到通報)
    let optEmit = { tag: 'w-serv-hapi', logDetail: get(opt, 'logDetail'), funLog: get(opt, 'funLog') }
    let constructing = true
    let errsPending = []
    let emitError = (err, from) => {
        if (constructing) {
            errsPending.push({ err, from })
            return
        }
        if (ev.listenerCount('error') === 0) {
            diag('[w-serv-hapi] error', { from, ...diag.brief(err) }, () => err, 'error')
            return
        }
        evEmit(ev, 'error', [err], optEmit)
    }

    //cors, corsOrigins為空(停用跨域)時給予false, hapi即不回應CORS標頭
    let cors = false
    if (corsOrigins.length > 0) {
        cors = {
            origin: corsOrigins, //Access-Control-Allow-Origin
            credentials: false, //Access-Control-Allow-Credentials
            //additionalExposedHeaders, w-converhp之回應協定除本體外另靠此四個標頭傳成敗(Return-Type/Return-Msg)、可否重試(Return-Retryable)與檔名(Content-Disposition),
            //瀏覽器對跨來源回應只讓JS讀Access-Control-Expose-Headers列出者, 未列則client讀到空字串而使download整條失效;
            //本套件以serverHapi將此伺服器交予WConverhpServer, 依其契約須由外部提供者自行設定, 用additional以保留hapi預設兩項
            additionalExposedHeaders: ['Return-Type', 'Return-Msg', 'Return-Retryable', 'Content-Disposition'],
        }
    }

    //server, Hapi.Server於同步段建構, 非法之伺服器選項由hapi同步拋出
    let server = new Hapi.Server({
        port,
        routes: {
            timeout: {
                server: false, //關閉伺服器超時
                socket: false, //關閉socket超時
            },
            cors,
        },
    })

    //instWConverServer, WConverhpServer於外部serverHapi模式下為全同步建構(同步掛路由, 不register Inert, 不start)
    //corsOrigins不轉傳: w-converhp只於自建伺服器時使用之, serverHapi模式下為死傳
    let instWConverServer = new WConverhpServer({
        serverHapi: server,
        apiName: get(opt, 'apiName'),
        pathUploadTemp: get(opt, 'pathUploadTemp'),
        tokenType: get(opt, 'tokenType'),
        sizeSlice: get(opt, 'sizeSlice'),
        sizeMsg: get(opt, 'sizeMsg'),
        verifyConn: get(opt, 'verifyConn'),
        delayForSlice: get(opt, 'delayForSlice'),
    })

    //error, 須先於w-serv-webdata之建構掛上; w-serv-webdata、w-serv-broadcast、w-sync-webdata皆於同一事件物件上擴充, 故掛一次即涵蓋各層之error
    instWConverServer.on('error', (err) => {
        emitError(err, 'downstream')
    })

    //clientChange, 由w-serv-broadcast於同一事件物件派發(w-converhp本身僅派發execute、upload、download、handler、error)
    instWConverServer.on('clientChange', function(num) {
        if (useShowLog) {
            console.log(`Server[port:${port}]: now clients: ${num}`)
        }
    })

    //clearDownstream, 釋放下游於同一事件物件上所建立之資源, 皆可重複呼叫:
    //clearBroadcast清除w-serv-broadcast之輪詢計時器(其於w-serv-webdata建構時即啟動); clearSync釋放資料同步: w-serv-webdata(1.1.10起)以同名包裝, 先移除其掛於kpOrm之change監聽, 再呼叫w-sync-webdata之clearSync取消待推播並將未落檔之時間戳寫入
    //clearSync一律經w-serv-webdata所建構之同一事件物件呼叫(與w-sync-webdata主責agent確認之路徑); 名稱不可為stop, 因w-converhp已於同一物件掛stop
    //下游之清理失敗以error事件轉出, 不中斷其餘清理, 使stop恆resolve
    let clearDownstream = () => {
        for (let name of ['clearBroadcast', 'clearSync']) {
            if (isfun(instWConverServer[name])) {
                try {
                    instWConverServer[name]()
                }
                catch (err) {
                    emitError(err, 'clear')
                }
            }
        }
    }

    //WServWebdataServer, 同步建構: 設定錯誤(例如useDbOrm為true而缺authorizeExec)由w-serv-webdata同步拋出, 直接傳給使用端
    //why 同步: 原於async流程內建構, 其拋錯被轉為error事件且伺服器不啟動, 使用端只見程序存活而伺服器未起
    //選項整包轉傳, 使w-serv-webdata新增之選項無須本套件逐項列舉(本套件曾因逐項列舉而漏轉authorizeExec)
    //拋錯前之計時器清理由w-serv-webdata負責(1.1.8起於拋錯前停止廣播計時器), 本套件不重複處理
    instWConverServer = new WServWebdataServer(instWConverServer, {
        ...opt,
        fpTableTags,
    })

    //不註冊process之unhandledRejection與uncaughtException監聽
    //why: 函式庫於宿主程序註冊此二監聽, 會把整個程序之未捕捉錯誤改成只印log不終止, 等於劫持使用端之全域錯誤語意(同w-package-tools之worker樣板所定);
    //原於每次建構各註冊一組, 建構失敗亦累增, 且前一實例之監聽會吞掉後一實例建構時之同步拋錯. 全域錯誤政策由使用端自行決定

    //pmFlush, 建構子回傳後才轉出建構期間暫存之error
    //先resolve: 即使使用端之error監聽拋錯, 啟動亦不因此懸置; 其後之同步轉出仍先於start之接續執行
    let pmFlush = new Promise((resolve) => {
        setTimeout(() => {
            constructing = false
            resolve()
            let errs = errsPending
            errsPending = []
            for (let v of errs) {
                emitError(v.err, v.from)
            }
        }, 1)
    })

    //start, 非同步段: register Inert須await, 而含inert handler(directory)之路由須於其後才能掛, 故靜態路由與apis一併於此
    let started = false
    let start = async () => {

        //等建構期間之error轉出後才啟動, 使ready之結果必晚於建構期之error
        //why: listen可能於轉出計時器到期前即完成, 致使用端await ready後尚未收到建構期之error
        await pmFlush

        //register inert
        if (useInert) {
            await server.register(Inert)
        }

        //apiRoutes
        let apiRoutes = []
        if (useInert) {
            apiRoutes = [
                {
                    method: 'GET',
                    path: '/{file*}',
                    handler: {
                        directory: {
                            path: `${pathStaticFiles}/`
                        }
                    },
                },
            ]
        }
        apiRoutes = [
            ...apiRoutes,
            ...apis,
        ]

        //route apiRoutes, 與w-converhp已掛之通訊路由衝突時於此拋錯
        server.route(apiRoutes)

        //start
        await server.start()
        started = true
        if (useShowLog) {
            console.log(`Server running at: ${server.info.uri}`)
        }

        return server
    }
    let pmStart = start()
    pmStart.catch((err) => {
        clearDownstream() //啟動失敗則不再服務, 釋放下游資源使行程可自行結束
        emitError(err, 'start')
    })

    //ready, 伺服器啟動成功時resolve為hapi伺服器實體, 失敗時以原錯誤reject
    //why: hapi於listen之前即設定info.started且失敗時不歸零, 無法以其判定是否已啟動
    let ready = () => {
        return pmStart
    }

    //stop, 等啟動結束(成功或失敗)後才停, 恆resolve, 失敗以error事件通知
    //why 須等啟動結束: hapi於啟動階段拒絕stop, 而伺服器其後照樣起來並持續服務
    let pmStop = null
    let stop = () => {
        if (pmStop !== null) {
            return pmStop
        }
        pmStop = (async () => {
            await pmStart.catch(() => {})
            clearDownstream()
            if (started) {
                try {
                    await server.stop()
                }
                catch (err) {
                    emitError(err, 'stop')
                }
            }
        })()
        return pmStop
    }

    //getServer, 回傳hapi伺服器實體, 不保證已啟動(確認啟動請用ready)
    let getServer = async () => {
        return server
    }

    //getInstWConverServer, 回傳經w-serv-webdata擴充後之通訊實體
    let getInstWConverServer = async () => {
        return instWConverServer
    }

    //save
    ev.ready = ready
    ev.stop = stop
    ev.getServer = getServer
    ev.getInstWConverServer = getInstWConverServer

    return ev
}


export default WServHapiServer
