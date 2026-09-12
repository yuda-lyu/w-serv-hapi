import assert from 'assert'
import fs from 'fs'
import { waitFor, startServer } from './api-setup.mjs'


/**
 * 驗證各資料表時間戳檔案之落點
 *
 * 規格來源: WServHapiServer之opt.fpTableTags「輸入儲存各資料表時間戳檔案路徑串，預設'./tableTags.json'」,
 * 其值須轉交w-serv-webdata(其只讀fpTableTags)方能生效
 */
describe('api-table-tags', function() {

    it('fpTableTags所指定之路徑應為時間戳落檔位置', async function() {
        let port = 8173
        let srv = await startServer({
            name: 'table-tags-fp',
            port,
            seed: {
                tabA: [{ id: 'id-tabA-peter', name: 'peter', value: 123 }],
            },
        })
        try {

            //時間戳應落於指定路徑
            let fp = `${srv.fd}/tableTags.json`
            await waitFor(() => {
                return fs.existsSync(fp)
            }, { msg: `tableTags file[${fp}] not found` })

            //內容應為各同步資料表之時間戳
            let o = JSON.parse(fs.readFileSync(fp, 'utf8'))
            assert.strict.deepEqual(Object.keys(o), ['tabA'])
            assert.strict.deepEqual(o.tabA, 'tag-1')

        }
        finally {
            await srv.stop()
        }
    })

    it('舊名fnTableTags應相容而指向同一落點', async function() {
        let port = 8174
        let fd = './tmp/test-table-tags-fn'
        let srv = await startServer({
            name: 'table-tags-fn',
            port,
            seed: {
                tabA: [{ id: 'id-tabA-peter', name: 'peter', value: 123 }],
            },
            optServer: {
                fpTableTags: null, //不給新名, 只給舊名
                fnTableTags: `${fd}/tableTags-legacy.json`,
            },
        })
        try {

            let fp = `${fd}/tableTags-legacy.json`
            await waitFor(() => {
                return fs.existsSync(fp)
            }, { msg: `tableTags file[${fp}] not found` })

            let o = JSON.parse(fs.readFileSync(fp, 'utf8'))
            assert.strict.deepEqual(Object.keys(o), ['tabA'])

        }
        finally {
            await srv.stop()
        }
    })

})
