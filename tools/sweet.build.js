//Run this build by doing
//node r.js -o sweet.build.js
//Assumes sweetjs git clone is at the baseUrl location below.
({
    baseUrl: '../../sweet.js-jrburke/src/',
    paths: {
        'escodegen': '../browser/scripts/escodegen',
        'underscore': '../browser/scripts/underscore',
        'almond': '../../modus/tools/almond'
    },
    include: ['almond', 'sweet'],
    wrap: {
        start: 'var sweet = (function () {',
        end: 'return { parse: require("sweet").parse,\n' +
             '         escodegen: require("escodegen"),\n' +
             '         expander: require("expander"),\n' +
             '         parser: require("parser")\n' +
             '};\n' +
             '}());\n'
    },
    optimize: 'none',
    out: 'sweet.js'
})