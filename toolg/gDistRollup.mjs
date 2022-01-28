import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'


let fdSrc = './src'
let fdTar = './dist'


rollupFiles({
    fns: ['WServHapiServer.mjs', 'WServHapiClient.mjs'],
    fdSrc,
    fdTar,
    nameDistType: 'kebabCase',
    globals: {
        '@hapi/hapi': '@hapi/hapi',
        '@hapi/inert': '@hapi/inert',
        'path': 'path',
        'fs': 'fs',
        'events': 'events',
        'stream': 'stream',
        // 'form-data': 'FormData',
        'crypto': 'crypto', //因crypto-js修改使用內建crypto方式, 會偵測nodejs並使用require內建的crypto, 故需剔除
    },
    external: [
        '@hapi/hapi',
        '@hapi/inert',
        'path',
        'fs',
        'events',
        'stream',
        // 'form-data',
        'crypto',
    ],
})

