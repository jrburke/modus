/*jslint sloppy: true */
/*global requirejs, doh, XMLHttpRequest, console */
var sweet = requirejs.sweet,
    lineEndRegExp = /[\r\n]\s*/g,
    op = Object.prototype,
    ostring = op.toString,
    hasOwn = op.hasOwnProperty,
    registry = {};

function stripLines(text) {
    return text && text.replace(lineEndRegExp, '');
}

function hasProp(obj, prop) {
    return hasOwn.call(obj, prop);
}

/**
 * Cycles over properties in an object and calls a function for each
 * property value. If the function returns a truthy value, then the
 * iteration is stopped.
 */
function eachProp(obj, func) {
    var prop;
    for (prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            if (func(obj[prop], prop)) {
                break;
            }
        }
    }
}

/**
 * Simple function to mix in properties from source into target,
 * but only if target does not already have a property of the same name.
 */
function mixin(target, source, force, deepStringMixin) {
    if (source) {
        eachProp(source, function (value, prop) {
            if (force || !hasProp(target, prop)) {
                if (deepStringMixin && typeof value !== 'string') {
                    if (!target[prop]) {
                        target[prop] = {};
                    }
                    mixin(target[prop], value, force, deepStringMixin);
                } else {
                    target[prop] = value;
                }
            }
        });
    }
    return target;
}

function getModule(id) {
    var m = registry[id];
    if (!m) {
        m = registry[id] = {
            text: undefined,
            macros: {},
            importMacros: {}
        };
    }
    return m;
}

function grind(text) {
    var readTree = sweet.parser.read(text),
        expanded = sweet.expander.expand(readTree),
        flattened = sweet.expander.flatten(expanded),
        ast = sweet.parser.parse(flattened),
        finalText = sweet.escodegen.generate(ast);

    return stripLines(finalText);
}

//This function MODIFIES the readTree to extract the imports
//that are macros and grab them from the other modules
function extractMacroImports(id, readTree) {
    var i, token, next, next2, next3, name,
        macros, moduleId, module, macro;

    for (i = 0; i < readTree.length; i += 1) {
        token = readTree[i].token;
        if (token.type === 4 && token.value === 'import') {
            //Look ahead
            next = readTree[i + 1].token;
            next2 = readTree[i + 2].token;
            next3 = readTree[i + 3].token;

            if (next.type === 3) {
                //A macro definition. grab the name then extract this
                //export token since it causes problems later when the
                //macro tokens are removed.
                //Do not need to roll back i, since it just means the readTree
                //for loop will just skip over the 'macro' token.
                name = next.value;
                moduleId = next3.value;
                module = registry[moduleId];
                macro = module.macros[name];

                if (macro) {
                    getModule(id).importMacros[name] = macro;
                    readTree.splice(i, 4);
                }
            }
        }
    }

    return macros;
}

//This function MODIFIES the readTree to extract the export
//keywords and to track what things will be exported.
function extractExportInfo(id, readTree) {
    var i, token, next, next2, name,
        module = getModule(id);

    for (i = 0; i < readTree.length; i += 1) {
        token = readTree[i].token;
        if (token.type === 4 && token.value === 'export') {
            //Look ahead
            next = readTree[i + 1].token;
            next2 = readTree[i + 2].token;
            if (next.type === 3 && next.value === 'macro') {
                //A macro definition. grab the name then extract this
                //export token since it causes problems later when the
                //macro tokens are removed.
                //Do not need to roll back i, since it just means the readTree
                //for loop will just skip over the 'macro' token.
                name = next2.value;
                readTree.splice(i, 1);

                module.macros[name] = undefined;
            }
        }
    }
}

function grindWithMacros(id, text) {
    var readTree, expanded, flattened, ast, finalText,
        exportProps, macros, foundMacros,
        module = getModule(id);

    readTree = sweet.parser.read(text);
    macros = extractMacroImports(id, readTree);
    extractExportInfo(id, readTree);

    expanded = sweet.expander.expand(readTree, module.importMacros);
    foundMacros = sweet.expander.foundMacros;

    //For any export of a macro, attach the macro definition to it.
    eachProp(module.macros, function (value, prop) {
        module.macros[prop] = foundMacros[prop];
    });

    flattened = sweet.expander.flatten(expanded);
    ast = sweet.parser.parse(flattened);
    finalText = sweet.escodegen.generate(ast);

    module.text = finalText;
}

function fetch(path) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path, false);
    xhr.send();
    return xhr.responseText;
}

function parse(text) {
    var readTree = sweet.parser.read(text),
        expanded = sweet.expander.expand(readTree),
        flattened = sweet.expander.flatten(expanded),
        syntax = sweet.expander.tokensToSyntax(readTree);

    return syntax;
}

console.log('FETCHED: ' + fetch('a.js'));

doh.register(
    "sweetTests",
    [
        function sweetTests(t) {
            'use strict';
            var text, a, b, aResult, bResult;

            text = "module b from 'b';";
            t.is(text, grind(text));

            text = "import y from 'b';";
            t.is(text, grind(text));

            text = "export var foo = function () {};";
            t.is(text, grind(text));

            //Try a macro extraction for use in another "module"
            a = fetch('a.js');
            b = fetch('b.js');

            grindWithMacros('a', a);
            grindWithMacros('b', b);

            console.log('transformed b.js is: ' + registry.b.text);
        }
    ]
);
doh.run();

