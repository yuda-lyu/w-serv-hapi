import assert from 'assert'
import fs from 'fs'
import path from 'path'
import wPorts from './tools/ports.mjs'

let { base, reserved, alloc, segs, portOf } = wPorts


/**
 * 守住test/tools/ports.mjs之配發規則
 *
 * 規格來源: test/tools/ports.mjs開頭所載之配發規則
 *   - reserved所列各號為保留區, 不得配發亦不得於其上啟動伺服器
 *   - 自base起依alloc之順序連續配發, 一檔一段, 且一律落於8千段
 *   - 測試檔不得自行手寫port字面值(本檔亦同, 故一律改以base與reserved推導)
 */
describe('unit-ports', function() {
    let fdTest = 'test'

    it('配發表不應有重複之測試檔名', function() {
        let names = alloc.map((v) => {
            return v[0]
        })
        assert.strict.deepEqual(names.length, new Set(names).size)
    })

    it('每個測試檔應至少配發一個port', function() {
        for (let [name, count] of alloc) {
            assert.strict.deepEqual(Number.isInteger(count) && count >= 1, true, `測試檔[${name}]之配發數不合法`)
        }
    })

    it('所配發之port不應重複', function() {
        let ports = allPorts()
        assert.strict.deepEqual(ports.length, new Set(ports).size)
    })

    it('所配發之port不應落入保留區', function() {
        let ports = allPorts()
        for (let k in reserved) {
            assert.strict.deepEqual(ports.includes(reserved[k]), false, `配發到保留區之${k}[${reserved[k]}]`)
        }
    })

    it('所配發之port應自base起連續且落於8千段', function() {
        let ports = allPorts()
        assert.strict.deepEqual(ports[0], base)
        assert.strict.deepEqual(ports[ports.length - 1], base + ports.length - 1)
        for (let v of ports) {
            assert.strict.deepEqual(Math.floor(v / 1000), 8, `port[${v}]未落於8千段`)
        }
    })

    it('portOf對未登記之測試檔應拋錯', function() {
        assert.throws(() => {
            portOf('api-not-exist')
        })
    })

    it('portOf對越界之索引應拋錯', function() {
        let [name, count] = alloc[0]
        assert.throws(() => {
            portOf(name, count)
        })
    })

    it('每個測試檔皆應登記於配發表', function() {
        let names = alloc.map((v) => {
            return v[0]
        })
        for (let fn of testFiles()) {

            //unit-層不起伺服器, 不需配發
            if (fn.indexOf('unit-') === 0) {
                continue
            }

            let name = fn.replace('.test.mjs', '')
            assert.strict.deepEqual(names.includes(name), true, `測試檔[${fn}]未登記於test/tools/ports.mjs之alloc`)

        }
    })

    it('測試檔內不應自行手寫port字面值', function() {
        for (let fn of testFiles()) {
            let c = fs.readFileSync(path.join(fdTest, fn), 'utf8')
            let ms = c.match(/(?<![.\d])8[0-9]{3}(?![.\d])/g) || []
            assert.strict.deepEqual(ms, [], `測試檔[${fn}]內出現port字面值${ms.join(',')}, 請改用test/tools/ports.mjs之portOf`)
        }
    })

    //allPorts, 取全部已配發之port
    function allPorts() {
        let ports = []
        for (let name in segs) {
            let s = segs[name]
            for (let i = 0; i < s.count; i++) {
                ports.push(s.from + i)
            }
        }
        return ports
    }

    //testFiles, 取test資料夾下之全部測試檔
    function testFiles() {
        return fs.readdirSync(fdTest).filter((v) => {
            return v.indexOf('.test.mjs') > 0
        })
    }

})
