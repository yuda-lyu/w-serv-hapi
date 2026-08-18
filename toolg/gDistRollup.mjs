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
    },
    external: [
        '@hapi/hapi',
        '@hapi/inert',
        'path',
        'fs',
        'events',
        'stream',
        // 'form-data',
    ],
})

