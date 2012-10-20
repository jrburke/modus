/**
 * @license modus 0.0.1 Copyright (c) 2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/modus for details
 */

/*jslint sloppy: true, nomen: true */
/*global window, navigator, document, XMLHttpRequest, console, importScripts,
  setTimeout */
var Loader, System, modus;
(function (global) {
    var sweet,
        contexts = {},
        lineEndRegExp = /[\r\n]\s*/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        //Used to filter out dependencies that are already paths.
        jsExtRegExp = /^\/|:|\?|\.js$/,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        aps = ap.slice,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && navigator && document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        contextCounter = 0;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
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

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, moduleIds) {
        var e = new Error(msg + '\nError #' + id);
        e.requireType = id;
        e.moduleIds = moduleIds;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    function exec(content) {
        /*jslint evil: true */
        return eval(content);
    }

    function strictExec(content) {
        /*jslint evil: true */
        return eval("'use strict';\n" + content);
    }

    /**
     * Trims the . and .. from an array of path segments.
     * It will keep a leading path segment if a .. will become
     * the first path segment, to help with module name lookups,
     * which act like paths, but can be remapped. But the end result,
     * all paths that use this function should look normalized.
     * NOTE: this method MODIFIES the input array.
     * @param {Array} ary the array of path segments.
     */
    function trimDots(ary) {
        var i, part;
        for (i = 0; ary[i]; i += 1) {
            part = ary[i];
            if (part === '.') {
                ary.splice(i, 1);
                i -= 1;
            } else if (part === '..') {
                if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                    //End of the line. Keep at least one non-dot
                    //path segment at the front so it can be mapped
                    //correctly to disk. Otherwise, there is likely
                    //no path mapping for a path starting with '..'.
                    //This can still fail, but catches the most reasonable
                    //uses of ..
                    break;
                } else if (i > 0) {
                    ary.splice(i - 1, 2);
                    i -= 2;
                }
            }
        }
    }

    function generateContextName(name) {
        if (!name || contexts.hasOwnProperty(name)) {
            name = (name || '') + '_' + (contextCounter += 1);
        }

        return name;
    }

    function newContext(parent, options, context) {
        var Module, inCheckLoaded, checkLoadedTimeoutId, handlers,
            contextName = generateContextName(options.name),
            config = {
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                pkgs: {},
                shim: {},
                map: {},
                moduleConfig: {}
            },
            registry = {},
            undefEvents = {},
            defined = {},
            urlFetched = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        contexts[contextName] = context;

        handlers = {
            //TODO: handled the special 'require', 'exports' and 'module'
            //dependencies in AMD.
        };

        function hasPathFallback(id) {
            var pathConfig = config.paths[id];
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);
                context.require([id]);
                return true;
            }
        }

        //Turns a plugin@resource or plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = -1;

            if (name) {
                index = name.indexOf('@');
                if (index === -1) {
                    //Fall back to also supporting requirejs plug!resource ids.
                    index = name.indexOf('!');
                }
            }

            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via context.resolve()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = context.resolve(prefix, parentName, applyMap);
                pluginModule = defined[prefix];
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.resolve(name, function (name) {
                            return context.resolve(name, parentName, applyMap);
                        });
                    } else {
                        normalizedName = context.resolve(name, parentName, applyMap);
                    }
                } else {
                    //A regular module.
                    normalizedName = context.resolve(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '@' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = registry[id];

            if (!mod) {
                mod = registry[id] = new Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = registry[id];

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else if (hasProp(registry, id) && mod && name === 'staticDone') {
                if (mod.staticDone) {
                    fn(mod);
                }
            } else {
                getModule(depMap).on(name, fn);
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = registry[id];
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    context.onError(err);
                }
            }
        }

        /**
         * Called to enable a module if it is still in the registry
         * awaiting enablement. parent module is passed in for context,
         * used by the optimizer.
         * TODO: r.js optimizer overrides this to do building. In requirejs
         * this was on the context, but now context is visible loader
         * instance so need to rethink optimization.
         */
        function enable(depMap, parent) {
            var mod = registry[depMap.id];
            if (mod) {
                getModule(depMap).enable();
            }
        }

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = registry[depId];

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (traced[depId]) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var map, modId, err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(registry, function (mod) {
                map = mod.map;
                modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            //NOTE: this implies the fetch: function on the
                            //loader returns an object with an abort() method.
                            //INCLUDE THIS IN SPEC?
                            if (mod.fetcher && mod.fetcher.abort) {
                                mod.fetcher.abort();
                            }
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if (typeof setTimeout === 'function' && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        function makeLocalSystem(relMap, options) {
            options = options || {};

            var system = {
                get: function (id) {
                    var map;

                    //If require|exports|module are requested, get the
                    //value for them from the special handlers. Caveat:
                    //this only works while module is being defined.
                    if (relMap && handlers[id]) {
                        return handlers[id](registry[relMap.id]);
                    }

                    //Synchronous access to one module. If require.get is
                    //available (as in the Node adapter), prefer that.
                    if (context.syncGet) {
                        return context.syncGet(context, id, relMap);
                    }

                    //Normalize module name, if it contains . or ..
                    map = makeModuleMap(id, relMap, false, true);
                    id = map.id;

                    if (!hasProp(defined, id)) {
                        return onError(makeError('notloaded', 'Module name "' +
                                    id +
                                    '" has not been loaded yet for context: ' +
                                    contextName +
                                    (relMap ? '' : '. Use require([])')));
                    }
                    return defined[id];
                },

                load: function (deps, callback, errback) {
                    var id, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }


                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return system;
                },

                isBrowser: isBrowser,

                /**
                 * Converts a module name + .extension into an URL path.
                 * *Requires* the use of a module name. It does not support using
                 * plain URLs like nameToUrl.
                 */
                toUrl: function (moduleNamePlusExt) {
                    var index = moduleNamePlusExt.lastIndexOf('.'),
                        ext = null;

                    if (index !== -1) {
                        ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                        moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                    }

                    return context.nameToUrl(context.resolve(moduleNamePlusExt,
                                            relMap && relMap.id, true), ext);
                },

                defined: function (id) {
                    return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                },

                specified: function (id) {
                    id = makeModuleMap(id, relMap, false, true).id;
                    return hasProp(defined, id) || hasProp(registry, id);
                }
            };

            //Only allow undef on top level require calls
            if (!relMap) {
                system.undef = function (id) {
                    var map = makeModuleMap(id, relMap, true),
                        mod = registry[id];

                    delete defined[id];
                    delete urlFetched[map.url];
                    delete undefEvents[id];

                    if (mod) {
                        //Hold on to listeners in case the
                        //module will be attempted to be reloaded
                        //using a different config.
                        if (mod.events.defined) {
                            undefEvents[id] = mod.events;
                        }

                        cleanRegistry(id);
                    }
                };
            }

            return system;
        }

        Module = function (map) {
            this.events = undefEvents[map.id] || {};
            this.map = map;
            this.shim = config.shim[map.id];
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;
            this.staticDepMatched = [];
            this.staticDepCount = 0;

            this.modus = {
                deps: [],
                depSet: {},
                text: undefined,
                macros: {},
                importMacros: {},
                staticExports: {},
                isDynamic: true,
                checks: {}
            };

        };

        Module.prototype = {

            extractImports: function () {
                var i, token, next, next2, next3, name, current,
                    macros, moduleId, module, macro,
                    readTree = this.modus.readTree;

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
                            if (!this.modus.depsSet.hasOwnProperty(moduleId)) {
                                this.modus.deps.push(moduleId);
                                this.modus.depsSet[moduleId] = true;
                            }

                            if (macro) {
                                //Grab the name then extract this
                                //export token since it causes problems later when the
                                //macro tokens are removed.
                                //Do not need to roll back i, since it just means the readTree
                                //for loop will just skip over the 'macro' token.
                                this.modus.importMacros[name] = macro;
                                readTree.splice(i, 4);
                            } else if (module.staticExports.hasOwnProperty(name)) {
                                this.modus.checks.staticImport = true;
                                if (this.modus.checks.dynamicImport) {
                                    throw new Error('"' + this.map.id + '": static and dynamic import not allowed');
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
                            this.modus.checks.dynamicImport = true;
                            if (this.modus.checks.staticImport) {
                                throw new Error('"' + this.map.id + '": static and dynamic import not allowed');
                            }

                            if (current.type === 8) {
                                name = current.value;
                                if (!this.modus.depsSet.hasOwnProperty(name)) {
                                    this.modus.deps.push(name);
                                    this.modus.depsSet[name] = true;
                                }
                            }
                        }
                    }
                }
            },

            extractExports: function () {
                var i, token, next, next2, next3, next4, name,
                    readTree = this.modus.readTree;

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

                            this.modus.macros[name] = undefined;
                        } else if (next.type === 4) { //Keyword

                            //Mark that a dynamic export was done, restricts static export use.
                            this.modus.checks.staticExport = true;
                            if (this.modus.checks.dynamicExport) {
                                throw new Error('"' + this.map.id + '": static and dynamic export not allowed.');
                            }

                            //Mark the module as not dynamic,
                            //since a non-macro static export was indicated.
                            this.modus.isDynamic = false;

                            if (next.value === 'var') {
                                next3 = readTree[i + 3].token;
                                next4 = readTree[i + 4].token;
                                name = next2.value;

                                this.modus.staticExports[name] = next4.value === 'function' ? 'function' : 'var';
                            } else if (next.value === 'function' && next2.type === 3) { //Identifier
                                this.modus.staticExports[next2.value] = 'function';
                            } else if (next.value === 'module') {
                                this.modus.staticExports[next2.value] = 'module';
                            }
                        }
                    } else if (token.type === 3 && token.value === 'System') {
                        next = readTree[i + 1].token;
                        next2 = readTree[i + 2].token;
                        if (next.value === '.' && next2.value === 'set') {
                            //Mark that a dynamic export was done, restricts static export use.
                            this.modus.checks.dynamicExport = true;
                            if (this.modus.checks.staticExport) {
                                throw new Error('"' + this.map.id + '": static and dynamic export not allowed.');
                            }
                        }
                    }
                }
            },


            textFetched: function (text) {
                //Raw text for the module.
                this.modus.readTree = sweet.parser.read(text);

                this.extractImports();
                this.extractExports();

                this.staticCheck();
            },

            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;

                    this.fetcher = context.fetch(this.map.id, url, {
                        fulfill: bind(this, this.textFetched),
                        reject: (bind(this, function (err) {
                            this.emit('error', err);
                        }))
                    });
                }
            },

            enable: function () {
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = handlers[depMap.id];

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;
                        this.staticDepCount += 1;

                        //Once static step on dependency is done, note it here.
                        on(depMap, 'staticDone', bind(this, function (depModule) {
                            this.staticDepDone(i, depModule);
                        }));

                        on(depMap, 'defined', bind(this, function (depExports) {
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', this.errback);
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!handlers[id] && mod && !mod.enabled) {
                        enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = registry[pluginMap.id];
                    if (mod && !mod.enabled) {
                        enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            staticDepDone: function (i, depModule) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.staticDepMatched[i]) {
                    this.staticDepMatched[i] = true;
                    this.staticDepCount -= 1;
                    if (this.staticDepCount === 0) {
                        this.staticCheck();
                    }
                }
            },

            staticCheck: function () {
                if (!this.enabled || this.staticDepCount > 0) {
                    return;
                }

                //Expand the macros and collect them for use by other modules.
                var flattened, ast, finalText,
                    expanded = sweet.expander.expand(this.modus.readTree, this.modus.importMacros),
                    foundMacros = sweet.expander.foundMacros;

                //For any export of a macro, attach the macro definition to it.
                eachProp(this.modus.macros, bind(this, function (value, prop) {
                    this.modus.macros[prop] = foundMacros[prop];
                }));

                //Expand macros to end up with final module text.
                flattened = sweet.expander.flatten(expanded);
                ast = sweet.parser.parse(flattened);
                finalText = sweet.escodegen.generate(ast);

                this.modus.text = finalText;

                this.staticDone = true;
                this.emit('staticDone', this);
                this.check();
            },

            /**
             * Checks is the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetch();
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error.
                            if (this.events.error) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            if (this.map.isDefine) {
                                //If setting exports via 'module' is in play,
                                //favor that over return value and exports. After that,
                                //favor a non-undefined return value over exports use.
                                cjsModule = this.module;
                                if (cjsModule &&
                                        cjsModule.exports !== undefined &&
                                        //Make sure it is not already the exports value
                                        cjsModule.exports !== this.exports) {
                                    exports = cjsModule.exports;
                                } else if (exports === undefined && this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = [this.map.id];
                                err.requireType = 'define';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (context.onResourceLoad) {
                                context.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true,
                            skipMap: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return context.resolve(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '@' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = registry[normalizedMap.id];
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName);

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        try {
                            //This should allow for the static analysis and such.
                            TODO.exec(text);
                        } catch (e) {
                            throw new Error('fromText eval for ' + moduleName +
                                            ' failed: ' + e);
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        //"private" things exposed publicly for debugging modus itself.
        context._ = {
            config: config,
            registry: registry,
            defined: defined,
            undefEvents: undefEvents,
            urlFetched: urlFetched
        };

        mixin(context, {
            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            config: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths and packages since they require special processing,
                //they are additive.
                var pkgs = config.pkgs,
                    shim = config.shim,
                    objs = {
                        paths: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (prop === 'map') {
                            mixin(config[prop], value, true, true);
                        } else {
                            mixin(config[prop], value, true);
                        }
                    } else {
                        config[prop] = value;
                    }
                });

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if (value.exports && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;
                        location = pkgObj.location;

                        //Create a brand new object on pkgs, since currentPackages can
                        //be passed in again, and config.pkgs is the internal transformed
                        //state for all package configs.
                        pkgs[pkgObj.name] = {
                            name: pkgObj.name,
                            location: location || pkgObj.name,
                            //Remove leading dot in main, so main paths are normalized,
                            //and remove any trailing .js, since different package
                            //envs have different conventions: some use a module name,
                            //some use a file name.
                            main: (pkgObj.main || 'main')
                                  .replace(currDirRegExp, '')
                                  .replace(jsSuffixRegExp, '')
                        };
                    });

                    //Done with modifications, assing packages back to context config
                    config.pkgs = pkgs;
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    this.load(cfg.deps || [], cfg.callback);
                }
            },

            /**
             * Given a relative module name, like ./something, normalize it to
             * a real name that can be mapped to a path.
             * @param {String} name the relative name
             * @param {String} baseName a real name that the name arg is relative
             * to.
             * @param {Boolean} applyMap apply the map config to the value. Should
             * only be done if this normalization is for a dependency ID.
             * @returns {String} normalized name
             */
            resolve: function (name, baseName, applyMap) {
                var pkgName, pkgConfig, mapValue, nameParts, i, j, nameSegment,
                    foundMap, foundI, foundStarMap, starI,
                    baseParts = baseName && baseName.split('/'),
                    normalizedBaseParts = baseParts,
                    map = config.map,
                    starMap = map && map['*'];

                //Adjust any relative paths.
                if (name && name.charAt(0) === '.') {
                    //If have a base name, try to normalize against it,
                    //otherwise, assume it is a top-level require that will
                    //be relative to baseUrl in the end.
                    if (baseName) {
                        if (config.pkgs[baseName]) {
                            //If the baseName is a package name, then just treat it as one
                            //name to concat the name with.
                            normalizedBaseParts = baseParts = [baseName];
                        } else {
                            //Convert baseName to array, and lop off the last part,
                            //so that . matches that 'directory' and not name of the baseName's
                            //module. For instance, baseName of 'one/two/three', maps to
                            //'one/two/three.js', but we want the directory, 'one/two' for
                            //this normalization.
                            normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                        }

                        name = normalizedBaseParts.concat(name.split('/'));
                        trimDots(name);

                        //Some use of packages may use a . path to reference the
                        //'main' module name, so normalize for that.
                        pkgConfig = config.pkgs[(pkgName = name[0])];
                        name = name.join('/');
                        if (pkgConfig && name === pkgName + '/' + pkgConfig.main) {
                            name = pkgName;
                        }
                    } else if (name.indexOf('./') === 0) {
                        // No baseName, so this is ID is resolved relative
                        // to baseUrl, pull off the leading dot.
                        name = name.substring(2);
                    }
                }

                //Apply map config if available.
                if (applyMap && (baseParts || starMap) && map) {
                    nameParts = name.split('/');

                    for (i = nameParts.length; i > 0; i -= 1) {
                        nameSegment = nameParts.slice(0, i).join('/');

                        if (baseParts) {
                            //Find the longest baseName segment match in the config.
                            //So, do joins on the biggest to smallest lengths of baseParts.
                            for (j = baseParts.length; j > 0; j -= 1) {
                                mapValue = map[baseParts.slice(0, j).join('/')];

                                //baseName segment has config, find if it has one for
                                //this name.
                                if (mapValue) {
                                    mapValue = mapValue[nameSegment];
                                    if (mapValue) {
                                        //Match, update name to the new value.
                                        foundMap = mapValue;
                                        foundI = i;
                                        break;
                                    }
                                }
                            }
                        }

                        if (foundMap) {
                            break;
                        }

                        //Check for a star map match, but just hold on to it,
                        //if there is a shorter segment match later in a matching
                        //config, then favor over this star map.
                        if (!foundStarMap && starMap && starMap[nameSegment]) {
                            foundStarMap = starMap[nameSegment];
                            starI = i;
                        }
                    }

                    if (!foundMap && foundStarMap) {
                        foundMap = foundStarMap;
                        foundI = starI;
                    }

                    if (foundMap) {
                        nameParts.splice(0, foundI, foundMap);
                        name = nameParts.join('/');
                    }
                }

                return name;
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext) {
                var paths, pkgs, pkg, pkgPath, syms, i, parentModule, url,
                    parentPath;

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;
                    pkgs = config.pkgs;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');
                        pkg = pkgs[parentModule];
                        parentPath = paths[parentModule];
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        } else if (pkg) {
                            //If module name is just the package name, then looking
                            //for the main module.
                            if (moduleName === pkg.name) {
                                pkgPath = pkg.location + '/' + pkg.main;
                            } else {
                                pkgPath = pkg.location;
                            }
                            syms.splice(0, i, pkgPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/\?/.test(url) ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            },

            fetch: function (id, url, request) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);

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
                            request.reject(err);
                        } else {
                            request.fulfill(xhr.responseText);
                        }
                    }
                };
                xhr.send(null);

                return xhr;
            }
        });

        mixin(context, makeLocalSystem());

        context.global = options.global || global;
        context.strict = options.hasOwnProperty('strict') ? !!options.strict : true;
        if (options.fetch) {
            context.fetch = options.fetch;
        }

        //Useful for synchronous load.get() runtime calls, in node?
        //Based on requirejs.get that is used in node.
        if (options.syncGet) {
            context.syncGet = options.syncGet;
        }

        //Hook used by requirejs optimizer to know order of items built.
        //May or may not need different type of hook for es modules.
        if (options.onResourceLoad) {
            context.onResourceLoad = options.onResourceLoad;
        }

        context.nextTick = options.nextTick || (typeof setTimeout === 'function' ? function (fn) {
            setTimeout(fn, 0);
        } : function (fn) { fn(); });

        //Handle "global" errors, when an errback to a loader.load is
        //not passed.
        context.onError = options.onError || function (err) {
            throw err;
        };

        context.config(options);

        return context;
    }

    Loader = function Loader(parent, options) {
        return newContext(parent, {
            name: 'System'
        }, this);
    };

    System = new global.Loader();

    //Expose all the contexts, just for debugging.
    modus = {
        contexts: contexts
    };

    //INSERT SWEET HERE
}(this));