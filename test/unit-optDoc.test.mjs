import assert from 'assert'
import fs from 'fs'


/**
 * 守住「本套件之JSDoc列出w-serv-webdata之全部選項」(伺服器端與前端)
 *
 * 規格來源: CLAUDE_rulebook.md「轉傳選項」一節: 本套件以{ ...opt }整包轉傳w-serv-webdata(伺服器端與前端皆然), 其選項即為本套件之公開選項, 文件須同步列出;
 * 下游新增選項時本測試轉紅, 提醒補上說明(本套件曾因逐項列舉轉傳而漏轉authorizeExec)
 */
describe('unit-optDoc', function() {

    //keysOf, 取JSDoc中@param opt.X之選項名(含選填之[opt.X]與必填之opt.X)
    let keysOf = (fp) => {
        let c = fs.readFileSync(fp, 'utf8')
        let ms = c.match(/@param \{[^}]+\} \[?opt\.(\w+)/g) || []
        return ms.map((m) => {
            return m.replace(/^.*opt\./, '')
        })
    }

    //missingOf, 下游有而本套件JSDoc未列之選項
    let missingOf = (fpDown, fpOwn) => {
        let kd = keysOf(fpDown)
        let kh = keysOf(fpOwn)
        assert.strict.deepEqual(kd.length > 0, true, `未能自${fpDown}取得任何選項, 解析規則可能已失效`)
        return kd.filter((k) => {
            return !kh.includes(k)
        })
    }

    it('w-serv-webdata伺服器端之各選項皆應列於本套件伺服器端之JSDoc', function() {
        assert.strict.deepEqual(missingOf('./node_modules/w-serv-webdata/src/WServWebdataServer.mjs', './src/WServHapiServer.mjs'), [])
    })

    it('w-serv-webdata前端之各選項皆應列於本套件前端之JSDoc', function() {
        assert.strict.deepEqual(missingOf('./node_modules/w-serv-webdata/src/WServWebdataClient.mjs', './src/WServHapiClient.mjs'), [])
    })

})
