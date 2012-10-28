An experiment relating to ECMAScript modules that tries out the following:

* "module loader plugins" that allow loading non-JS dependencies. This allows
easier use of transpilers and resources that are necessary for a module setup.
These resources are not JS in source form, but can be translated to a JS form.
Templates for browser-based widgets being a common example.
* Static module forms, but runtime values can be dynamic values. This allows
easier use of legacy (pre-ES.next code), and allow for modules to export a
single runtime value, like a constructor function, without needing the module to
give an explicit name to that value.
* Modules IDs that are string IDs, not identifiers or raw URLs. This allows for
the loader plugin-style of modules, a more direct relationship between
dependency references and module definitions, and a way for modules that are
all developed separately to all refer to the same exterior module with the
same module ID.

The output of this experiment is to generate a modus.js that could be used to
try out the module syntax and behavior in any ES5-compatible browser, possibly
even ES3. The collection of tests may be useful over the long term.

## Supported syntax

### Static API

To specify a dependency:

    module a from 'a';

To use a "loader plugin", specify the module ID of the plugin, then an '@'
separator, followed by a resource ID that the plugin handles:

    module template from 'text@template.html';

To import a statically known export:

    import y from 'a';

    //The next one is not supported yet in modus,
    //but will be at some point, need to update the parser.
    import { name: localGammaName } from 'gamma';

To statically indicate an export property:

    export var name = 'a';


To declare multiple modules:

    module 'a' {
        module b from 'b';
        export var name = 'a';
        export b;
    }

    module 'b' {
        export var name = 'b';
    }

`module 'b' {}` is treated as function scope, and the module bodies are not
executed until there is an explicit dependency reference for them.

Named modules are only visible within the current module or loader.

Example of local module definitions: For a module 'c' defined in c.js:

    module 'a' {
        module b from 'b';
        export var name = 'a';
        export b;
    }

    module 'b' {
        export var name = 'b';
    }

    module a from 'a';
    module b from 'b';

    export var aName = a.name;
    export var bName = b.name;

Modules 'a' and 'b' will not be visible outside of module 'c'.

### Runtime/Dynamic API

In addition to these forms, a "runtime API" is used to declare single value
exports. Right now it just uses the System.set() API:

```javascript
System.set(function () {});
```

Similarly, a module can use a runtime API to indicate a dependency, via
System.get():

```javascript
var dep = System.get('util/helper');
```

To define a named module (adapting the 'c' module example from the static
section):

```javascript

System.define('a', function (System) {
    var b = System.get('b');
    System.set({
        name: 'a',
        b: b
    });
});

System.define('b', function (System) {
    System.exports.name = 'b';
});

var a = System.get('a'),
    b = System.get('b');

System.exports.aName = a.name;
System.exports.bName = b.name;
```

For the runtime API, any `System.get('stringLiteral')` calls are parsed from the
reader token stream, and those dependencies are fetched and executed before
executing the current module. `System.get()` just returns the cached export for
that dependency during runtime.

Each module gets its own, local `System` variable that has the following
properties that are specific to each module:

* System.get(StringLiteral): Gets a module dependency's runtime exports value.
* System.set(Object): Sets the export value for this module.
* System.exports -- the exports object for the module, used if System.set()
is not called.
* System.module -- an object that has information about the current module:
    * System.module.id: the module ID.
    * System.module.uri: the URI for the module.
    * System.module.config(): A function that can be called to get runtime
      configuration passed to the module via a top level System.config() call.
* System.define(StringLiteral, Function): Allows defining a module inline.

This runtime API may be a bit wordy to use, it may be nicer to just support
local variables that look like:

* get(StringLiteral)
* set(Object)
* exports
* module
    * module.id
    * module.uri
    * module.config()
* define(StringLiteral, Function)

The `module` one may be tricky to support though in this fashion. If so, maybe
favor another name, maybe `me`?

If this local variable approach was taken, then it may be worth considering
just using the AMD definitions of these items. This would have the benefit
of allowing many existing scripts to be used as-is, and a good portion of
Node/CommonJS modules would work out of the box too. The only ones that would
not work would be ones that used dynamic/imperative require() calls:

    var id = 'something' + someDynamicCall();
    var dep = require(dep);

Those would either need to be converted to a callback-style System.load/AMD-style
callback require, or perhaps allow a module hook that Node could implement to
allow the synchronous trace of that module to work.

Whatever the runtime API is though, by supporting the runtime API, this allows:

* "Legacy" JS to opt-in to being used by an ES.next module system, in a way that
allows the the legacy script to work in non-ES.next systems (1JS concerns).
* Makes it clear that the exported value is a dynamic value. The use of
`System.set()` should throw an error if `export var name` is used in the same
module.
* By not using a loader plugin to load legacy scripts, it allows the script to
"upgrade" to static forms later without all callers having to then change their
dependency reference IDs.

If there is a conflict where `System.get/set` actually referred to some other API,
then a loader plugin could be used to load those scripts.

## 'Global' API

`System.load()` is used to kick off top level module loading, but it uses
an array for the first arg, to allow multiple IDs to be loaded in one call.
Multiple IDs loaded in one call are useful since the only top level loading can
be through this method call. It may be though that the preferred form will look
more like `System.load('a', 'b', function (a, b) {})`.

## Loader plugin API.

Loader plugins are called called via module IDs like `'pluginId@resourceId'`.

If the module at ID `pluginId` implements the following loader plugin API, it
will be responsible for determining a value for the resource specified by
`'pluginId@resourceId'`.

API:

### resolve: function (resourceId, resolve) [Optional]

If the resourceId value is something that does not behave like a simple JS module
ID, then the plugin can implement a resolve method that resolves the ID to an
absolute ID usable by the loader for module value caching. The resolve method
is passed the following arguments:

* **resourceId**: String. the resourceId to resolve.
* **resolve**: Function. A function that can be called to resolve a segment of
the resourceId according to the loader's configuration.

Example,

### load: function (resourceId, System, request, config) {}

Where the values passed to the plugin's fetch method are:

* **resourceId**: String. The fully resolved, absolute resourceId. If the plugin
implemented a resolve method, then this value will have already been resolved.
* **System**: Object. A local System object that can be used to load modules. It
has the same API as the top level System, with relative module IDs resolved
relative to the module that specified this loader plugin ID.
* **request**: Object. Has the following methods on it:
    **fullfill**: Function. Call it and pass a value that is the value for the
    resourceId.
    **reject**: Function. Call it with an Error object if there was an error
    in determining the value for the resourceId.
    **exec**: Function. Call it with a string of JavaScript that represents
    the module source for that resource ID. The JS string can use the normal
    module API to declare dependencies and specify an export value.

Typically transpiler plugins will use request.exec(string) where other types of
plugins (feature detection plugins, text, css plugins) will use
request.fulfill(value).
* **config**: Object. Loader specific object that may have additional loader
info. Most commonly used by build tools/concatenators to indicate to a plugin
that it is running in "build mode" via config.isBuild === true.

TODO: APIs for build tools, write, writeFile, pluginBuilder?

## How does it work?

Scripts are fetched via XMLHttpRequest (XHR) calls. The text is then converted
to a stream of tokens using a
[modified version](https://github.com/jrburke/sweet.js) of the
[sweet.js](https://github.com/mozilla/sweet.js) reader, so it is not a fully
lexed JS token stream. This allows analyzing the contents for forms that may not
be valid JS.

Static import and export constructs are pulled out of the read stream, as well
as the dynamic API calls mentioned above. That information is used to fetch
dependencies. Once the dependencies have been fetched and passed through the
read stream, a static pass is used to import macros from other files and to
collect the macros from the module that have been exported.

Once the static pass is done with any macros inserted, then a runtime pass is
done, converting any remaining static `import`, `export` and `module` use to
runtime equivalents so the result is string of ES5-compatible JS. That JS is
then executed.

The internals of module tracking and execution is lifted from
[requirejs](http://requirejs.org), but modified to only do XHR loading and to
use sweetjs and esprima for a static phase in module processing.

The module execution though fits how most AMD loaders work: fetch and execute
dependencies before executing the current module, with the module API at runtime
just getting the cached value for the dependencies. Also, allow for registering
modules but not tracing dependencies and doing the static changes and execution
until the module is part of a dependency chain that is triggered from a top
level load call.

## How to use it

`modus.js` is the script to use. See the tests on how it is put in a page.

`modus.js` is constructed by using some files in the `tools` directory. The
`tools/m.js` file is the main implementation. The `tools/build-modus.js` build
script injects the modified sweetjs and esprima into m.js and saves that output
as modus.js. If you want to do modifications to modus, change m.js, then generate
modus.js via the build script to get an updated file.

## Macros in JavaScript?

This project needed a static transform to do, to test the static, then dynamic
execution execution of modules. Macros via the sweetjs implementation were chosen
to demonstrate the kind of work that could be done in the static phase. The
reader concept from sweetjs was also useful since it allowed experimenting with
new syntax a bit easier. Use of macros in this project does not mean that
macros are definitely coming to JavaScript, and if they do, they may look
differently than what is provided here. For example, this project does not allow
macros to generate `module`, `import` or `export` statements, because those are
the code boundaries used to define code units, and they are found before applying
macros.

All that said, sweetjs is pretty sweet, and it is really cool that they may
have figured out a way to construct
[a reader](http://calculist.org/blog/2012/04/17/homoiconicity-isnt-the-point/)
for JS. The reader may have some use even outside of macros, and there could be
JS use cases that really benefit from macros, in particular language variants
that are lighter than full transpilers.

However, the use of macros should not be seen as necessary to support the
module approach in this project, it is just an example static processing form
for this project's approach to a module lifecycle.

## Unsupported syntax

1. No `import *`. It seems like it is on its way out. It could be supported
in the future, but only for static exports from a dependency.

## TODO

* Do an example of a transpiler plugin that outputs JS using the static API.
* Throw if `System.set()` is used with the static `export var name` forms.
* Only `import y from 'a'` is supported, no destructure of import yet. Just a
lack of getting the parser logic correct, no inherent problem.

# To think about

1) Cycles are only possible via:

    module a from 'a';

not via:

    import y from 'a'

Since the implementation is just using ASTs but then desugaring to JS that runs
in today's engines -- it cannot seed a function or var placeholder for y such
that the import works correctly. However, using the module approach just gives
the exports value for the module, and using `a.y` later works.

2) Is this allowed?

    import bar from 'a';
    export bar;

The doku wiki just seems to allow ExportSpecifierSet, VariableDeclaration,
FunctionDeclaration, ModuleDeclaration. Need to figure the exact extent of
those values, but the names imply it is not.

3) Transpiler loader plugins take up two names: 'cs@widget/util' ends up
defining a pure JS module 'widget/util', at least in source load form. Does
that cause problems for someone wanting to define a real widget/util.js on
disk? This has not come up in requirejs-land, usually if a transpiler is
involved, the use case does not overlap -- the developer wants to be in all
transpiler mode. Is this an implementation quirk or a restriction of the module
ID namespacing?

4) Skip static work for System.load() calls, in Module.init? Does that dichotomy
have larger implications either on implementation or conceptual understanding?
Probably just harmless implementation detail.

5) Confirm rules around visibility of local modules. In particular if a module "a'" needs to be loaded, and there are say, three levels of nested modules, and both the outer and most inner need "a", do they both get the same module value? I would like to say no, need to contain how far up the chains lookups need to go?

6) Script from inline script tags are treated just a like a module loaded from the top level. However, this may not be desired as the code will actually finish async. Right now due to loader plugin lookups in textFetched. Need to think more over what that means, if that needs to really be synchronous execution.



