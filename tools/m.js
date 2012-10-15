/**
 * @license modus 0.0.1 Copyright (c) 2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/modus for details
 */

/*jslint sloppy: true, regexp: true */
/*global location, XMLHttpRequest, ActiveXObject, process, require, Packages,
java, requirejs, document, esprima, eachProp, each, System: true */
(function () {
    var commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        defineRegExp = /(^|[^\.])define\s*\(/,
        keywordRegExp = /(^|[^\.])(import\s+|export\s+|from\s+)/,
        systemRegExp = /System\.\w/,
        moduleNameRegExp = /['"]([^'"]+)['"]/,
        startQuoteRegExp = /^['"]/,
        atRegExp = /\@/,
        sourceUrlRegExp = /\/\/@\s+sourceURL=/,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        oldLoad = requirejs.load,
        fs;

    function exec(content) {
        /*jslint evil: true */
        return eval(content);
    }

    /**
     * Strips off quotes
     * @param {String} id
     * @returns id
     */
    function cleanModuleId(id) {
        id = moduleNameRegExp.exec(id)[1];

        //Just a hack for now, convert '@' in 'plugin@resource' to be
        //'plugin!resource' just so the internal code in requirejs does
        //not have to change.
        return id.replace(atRegExp, '!');
    }

    function convertImportSyntax(tokens, start, end, moduleTarget) {
        var token = tokens[start],
            cursor = start,
            replacement = '',
            localVars = {},
            moduleRef,
            moduleId,
            star,
            currentVar;

        //Convert module target to an AMD usable name. If a string,
        //then needs to be accessed via require()
        if (startQuoteRegExp.test(moduleTarget)) {
            moduleId = cleanModuleId(moduleTarget);
            moduleRef = 'require("' + moduleId + '")';
        } else {
            moduleRef = moduleTarget;
        }

        //DO NOT SUPPORT import * for NOW
        /*
        if (token.type === 'Punctuator' && token.value === '*') {
            //import * from z
            //If not using a module ID that is a require call, then
            //discard it.
            if (moduleId) {
                star = moduleId;
                replacement = '/\*IMPORTSTAR:' + star + '\*\/\n';
            } else {
                throw new Error('import * on local reference ' + moduleTarget +
                                ' no supported.');
            }
        } else */
        if (token.type === 'Identifier') {
            //import y from z
            replacement += 'var ' + token.value + ' = ' +
                            moduleRef + '.' + token.value + ';';
        } else if (token.type === 'Punctuator' && token.value === '{') {
            //import {y} from z
            //import {x, y} from z
            //import {x: localX, y: localY} from z
            cursor += 1;
            token = tokens[cursor];
            while (cursor !== end && token.value !== '}') {
                if (token.type === 'Identifier') {
                    if (currentVar) {
                        localVars[currentVar] = token.value;
                        currentVar = null;
                    } else {
                        currentVar = token.value;
                    }
                } else if (token.type === 'Punctuator') {
                    if (token.value === ',') {
                        if (currentVar) {
                            localVars[currentVar] = currentVar;
                            currentVar = null;
                        }
                    }
                }
                cursor += 1;
                token = tokens[cursor];
            }
            if (currentVar) {
                localVars[currentVar] = currentVar;
            }

            //Now serialize the localVars
            eachProp(localVars, function (localName, importProp) {
                replacement += 'var ' + localName + ' = ' +
                                moduleRef + '.' + importProp + ';\n';
            });
        } else {
            throw new Error('Invalid import: import ' +
                token.value + ' ' + tokens[start + 1].value +
                ' ' + tokens[start + 2].value);
        }

        return {
            star: star,
            replacement: replacement
        };
    }

    function convertModuleSyntax(tokens, i) {
        //Converts `foo = 'bar'` to `foo = require('bar')`
        var varName = tokens[i],
            eq = tokens[i + 1],
            id = tokens[i + 2];

        if (varName.type === 'Identifier' &&
                eq.type === 'Punctuator' && eq.value === '=' &&
                id.type === 'String') {
            return varName.value + ' = require("' + cleanModuleId(id.value) + '")';
        } else {
            throw new Error('Invalid module reference: module ' +
                varName.value + ' ' + eq.value + ' ' + id.value);
        }
    }

    function compile(path, text) {
        var stars = [],
            moduleMap = {},
            transforms = {},
            targets = [],
            currentIndex = 0,
            //Remove comments from the text to be scanned
            scanText = text.replace(commentRegExp, ""),
            transformedText = text,
            transformInputText,
            startIndex,
            segmentIndex,
            match,
            tempText,
            transformed,
            tokens;

        try {
            tokens = esprima.parse(text, {
                tokens: true,
                range: true
            }).tokens;
        } catch (e) {
            throw new Error('Esprima cannot parse: ' + path + ': ' + e);
        }

        each(tokens, function (token, i) {
            if (token.type !== 'Keyword' && token.type !== 'Identifier') {
                //Not relevant, skip
                return;
            }

            var next = tokens[i + 1],
                next2 = tokens[i + 2],
                next3 = tokens[i + 3],
                cursor = i,
                replacement,
                moduleTarget,
                target,
                convertedImport;

            if (token.value === 'export') {
                // EXPORTS
                if (next.type === 'Keyword') {
                    if (next.value === 'var' || next.value === 'let') {
                        targets.push({
                            start: token.range[0],
                            end: next2.range[0],
                            replacement: 'exports.'
                        });
                    } else if (next.value === 'function' && next2.type === 'Identifier') {
                        targets.push({
                            start: token.range[0],
                            end: next2.range[1],
                            replacement: 'exports.' + next2.value +
                                         ' = function '
                        });
                    } else {
                        throw new Error('Invalid export: ' + token.value +
                                        ' ' + next.value + ' ' + tokens[i + 2]);
                    }
                } else if (next.type === 'Identifier') {
                    targets.push({
                        start: token.range[0],
                        end: next.range[1],
                        replacement: 'exports.' + next.value +
                                     ' = ' + next.value
                    });
                } else {
                    throw new Error('Invalid export: ' + token.value +
                                        ' ' + next.value + ' ' + tokens[i + 2]);
                }
            } else if (token.value === 'module') {
                // MODULE
                // module Bar = "bar.js";
                replacement = 'var ';
                target = {
                    start: token.range[0]
                };

                while (token.value === 'module' || (token.type === 'Punctuator'
                        && token.value === ',')) {
                    cursor = cursor + 1;
                    replacement += convertModuleSyntax(tokens, cursor);
                    token = tokens[cursor + 3];
                    //Current module spec does not allow for
                    //module a = 'a', b = 'b';
                    //must end in semicolon. But keep this in case for later,
                    //as comma separators would be nice.
                    //esprima will throw if comma is not allowed.
                    if ((token.type === 'Punctuator' && token.value === ',')) {
                        replacement += ',\n';
                    }
                }

                target.end = token.range[0];
                target.replacement = replacement;
                targets.push(target);
            } else if (token.value === 'import') {
                // IMPORT
                //import * from z;
                //import y from z;
                //import {y} from z;
                //import {x, y} from z;
                //import {x: localX, y: localY} from z;
                cursor = i;
                //Find the "from" in the stream
                while (tokens[cursor] &&
                        (tokens[cursor].type !== 'Identifier' ||
                        tokens[cursor].value !== 'from')) {
                    cursor += 1;
                }

                //Increase cursor one more value to find the module target
                moduleTarget = tokens[cursor + 1].value;
                convertedImport = convertImportSyntax(tokens, i + 1, cursor - 1, moduleTarget);
                replacement = convertedImport.replacement;
                if (convertedImport.star) {
                    stars.push(convertedImport.star);
                }

                targets.push({
                    start: token.range[0],
                    end: tokens[cursor + 3].range[0],
                    replacement: replacement
                });
            } else if (token.value === 'System') {
                debugger;
            }
        });

        //Now sort all the targets, but by start position, with the
        //furthest start position first, since we need to transpile
        //in reverse order.
        targets.sort(function (a, b) {
            return a.start > b.start ? -1 : 1;
        });

        //Now walk backwards through targets and do source modifications
        //to AMD. Going backwards is important since the modifications will
        //modify the length of the string.
        each(targets, function (target, i) {
            transformedText = transformedText.substring(0, target.start) +
                              target.replacement +
                              transformedText.substring(target.end, transformedText.length);
        });

        return {
            text: "define(function (require, exports, module) {\n" +
                  transformedText +
                  '\n});',
            stars: stars
        };
    }

    requirejs.modusVersion = '0.0.1';
    requirejs.createXhr = function () {
        //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
        var xhr, i, progId;
        if (typeof XMLHttpRequest !== "undefined") {
            return new XMLHttpRequest();
        } else if (typeof ActiveXObject !== "undefined") {
            for (i = 0; i < 3; i += 1) {
                progId = progIds[i];
                try {
                    xhr = new ActiveXObject(progId);
                } catch (e) {}

                if (xhr) {
                    progIds = [progId];  // so faster next time
                    break;
                }
            }
        }

        return xhr;
    };

    requirejs.xdRegExp = /^((\w+)\:)?\/\/([^\/\\]+)/;

    /**
     * Is an URL on another domain. Only works for browser use, returns
     * false in non-browser environments. Only used to know if an
     * optimized .js version of a text resource should be loaded
     * instead.
     * @param {String} url
     * @returns Boolean
     */
    requirejs.useXhr = function (url, protocol, hostname, port) {
        var uProtocol, uHostName, uPort,
            match = requirejs.xdRegExp.exec(url);
        if (!match) {
            return true;
        }
        uProtocol = match[2];
        uHostName = match[3];

        uHostName = uHostName.split(':');
        uPort = uHostName[1];
        uHostName = uHostName[0];

        return (!uProtocol || uProtocol === protocol) &&
               (!uHostName || uHostName === hostname) &&
               ((!uPort && !uHostName) || uPort === port);
    };

    if (typeof process !== "undefined" &&
             process.versions &&
             !!process.versions.node) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        requirejs.cget = function (url, callback) {
            var file = fs.readFileSync(url, 'utf8');
            //Remove BOM (Byte Mark Order) from utf8 files if it is there.
            if (file.indexOf('\uFEFF') === 0) {
                file = file.substring(1);
            }
            callback(file);
        };
    } else if (requirejs.createXhr()) {
        requirejs.cget = function (url, callback, errback, onXhr) {
            var xhr = requirejs.createXhr();
            xhr.open('GET', url, true);

            //Allow overrides specified in config
            if (onXhr) {
                onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        errback(err);
                    } else {
                        callback(xhr.responseText);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (typeof Packages !== 'undefined') {
        //Why Java, why is this so awkward?
        requirejs.cget = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                stringBuffer.append(line);

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    }

    requirejs.load = function (context, moduleName, url) {
        var useXhr = (context.config && context.config.modus &&
                     context.config.modus.useXhr) || requirejs.useXhr,
            onXhr = (context.config && context.config.modus &&
                     context.config.modus.onXhr);

        if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
            requirejs.cget(url, function (content) {
                //Determine if a wrapper is needed. First strip out comments.
                //This is not bulletproof, but it is good enough for elminating
                //false positives from comments.
                var temp = content.replace(commentRegExp, '');

                if (!defineRegExp.test(temp) && (keywordRegExp.test(temp) ||
                    systemRegExp.test(temp))) {

                    content = compile(url, content).text;
                }

                //Add sourceURL, but only if one is not already there.
                if (!sourceUrlRegExp.test(content)) {
                    //IE with conditional comments on cannot handle the
                    //sourceURL trick, so skip it if enabled.
                    /*@if (@_jscript) @else @*/
                    content += "\r\n//@ sourceURL=" + url;
                    /*@end@*/
                }

                exec(content);
                context.completeLoad(moduleName);

            }, function (err) {
                throw err;
            }, onXhr);
        } else {
            return oldLoad.apply(requirejs, arguments);
        }
    };

    System = {
        load: requirejs
    };
}());
