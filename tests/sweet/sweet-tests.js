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
            deps: [],
            depsSet: {},
            text: undefined,
            macros: {},
            importMacros: {},
            staticExports: {},
            isDynamic: true,
            checks: {}
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

//This function MODIFIES the readTree to extract the imports.
//For macros, grab them from the module that defines them.
function extractImports(id, readTree) {
    var i, token, next, next2, next3, name, current,
        macros, moduleId, module, macro,
        currentModule = getModule(id);

    for (i = 0; i < readTree.length; i += 1) {
        token = readTree[i].token;
        if (token.type === 4 && token.value === 'import') {
            //Look ahead
            next = readTree[i + 1].token;
            next2 = readTree[i + 2].token;
            next3 = readTree[i + 3].token;

            if (next.type === 3) {
                //An import.
                name = next.value;
                moduleId = next3.value;
                module = registry[moduleId];
                macro = module.macros[name];
                if (!currentModule.depsSet.hasOwnProperty(moduleId)) {
                    currentModule.deps.push(moduleId);
                    currentModule.depsSet[moduleId] = true;
                }

                if (macro) {
                    //Grab the name then extract this
                    //export token since it causes problems later when the
                    //macro tokens are removed.
                    //Do not need to roll back i, since it just means the readTree
                    //for loop will just skip over the 'macro' token.
                    currentModule.importMacros[name] = macro;
                    readTree.splice(i, 4);
                } else if (module.staticExports.hasOwnProperty(name)) {
                    currentModule.checks.staticImport = true;
                    if (currentModule.checks.dynamicImport) {
                        throw new Error('"' + id + '": static and dynamic import not allowed');
                    }
                } else {
                    throw new Error('"' + moduleId + '" does not export "' + name + '"');
                }
            }
        } else if (token.type === 3 && token.value === 'System') {
            next = readTree[i + 1].token;
            next2 = readTree[i + 2].token;
            next3 = readTree[i + 3].token;
            if (next.value === '.' && next2.value === 'get' &&
                    next3.value === '()' && next3.inner.length === 1) {
                current = next3.inner[0].token;

                //Mark that a dynamic import was done, restricts static import use.
                currentModule.checks.dynamicImport = true;
                if (currentModule.checks.staticImport) {
                    throw new Error('"' + id + '": static and dynamic import not allowed');
                }

                if (current.type === 8) {
                    name = current.value;
                    if (!currentModule.depsSet.hasOwnProperty(name)) {
                        currentModule.deps.push(name);
                        currentModule.depsSet[name] = true;
                    }
                }
            }
        }
    }

    return macros;
}

//This function MODIFIES the readTree to extract the export
//keywords and to track what things will be exported.
function extractExportInfo(id, readTree) {
    var i, token, next, next2, next3, next4, name,
        module = getModule(id);

    for (i = 0; i < readTree.length; i += 1) {
        token = readTree[i].token;
        if (token.type === 4 && token.value === 'export') {

            //Look ahead
            next = readTree[i + 1].token;
            next2 = readTree[i + 2].token;
            if (next.type === 3 && next.value === 'macro') { //Identifier
                //A macro definition. grab the name then extract this
                //export token since it causes problems later when the
                //macro tokens are removed.
                //Do not need to roll back i, since it just means the readTree
                //for loop will just skip over the 'macro' token.
                name = next2.value;
                readTree.splice(i, 1);

                module.macros[name] = undefined;
            } else if (next.type === 4) { //Keyword

                //Mark that a dynamic export was done, restricts static export use.
                module.checks.staticExport = true;
                if (module.checks.dynamicExport) {
                    throw new Error('"' + id + '": static and dynamic export not allowed.');
                }

                //Mark the module as not dynamic,
                //since a non-macro static export was indicated.
                module.isDynamic = false;

                if (next.value === 'var') {
                    next3 = readTree[i + 3].token;
                    next4 = readTree[i + 4].token;
                    name = next2.value;

                    module.staticExports[name] = next4.value === 'function' ? 'function' : 'var';
                } else if (next.value === 'function' && next2.type === 3) { //Identifier
                    module.staticExports[next2.value] = 'function';
                } else if (next.value === 'module') {
                    module.staticExports[next2.value] = 'module';
                }
            }
        } else if (token.type === 3 && token.value === 'System') {
            next = readTree[i + 1].token;
            next2 = readTree[i + 2].token;
            if (next.value === '.' && next2.value === 'set') {
                //Mark that a dynamic export was done, restricts static export use.
                module.checks.dynamicExport = true;
                if (module.checks.staticExport) {
                    throw new Error('"' + id + '": static and dynamic export not allowed.');
                }
            }
        }
    }
}

function grindWithMacros(id, text) {
    var readTree, expanded, flattened, ast, finalText,
        exportProps, macros, foundMacros,
        module = getModule(id);

    readTree = sweet.parser.read(text);
    macros = extractImports(id, readTree);
    extractExportInfo(id, readTree);

    expanded = sweet.expander.expand(readTree, module.importMacros);
    foundMacros = sweet.expander.foundMacros;

    //For any export of a macro, attach the macro definition to it.
    eachProp(module.macros, function (value, prop) {
        module.macros[prop] = foundMacros[prop];
    });

    //Expand macros to end up with final module text.
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

doh.register(
    "sweetTests",
    [
        function sweetTests(t) {
            'use strict';
            var text, a, b, e, aResult, bResult;

            text = "module b from 'b';";
            t.is(text, grind(text));

            text = "import y from 'b';";
            t.is(text, grind(text));

            text = "export var foo = function () {};";
            t.is(text, grind(text));

            //Try a macro extraction for use in another "module"
            a = fetch('a.js');
            b = fetch('b.js');
            e = fetch('e.js');

            grindWithMacros('a', a);
            grindWithMacros('b', b);
            grindWithMacros('e', e);

            //console.log('transformed b.js is: ' + registry.b.text);
        }
    ]
);
doh.run();

