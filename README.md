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

    //The next one is not support yet, but is possible to do
    import { name: localGammaName } from 'gamma';

To statically indicate an export property:

    export var name = 'a';

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

For the runtime API, any `System.get('stringLiteral')` calls are parsed via
AST, and those dependencies are fetched and executed before executing the
current module. `System.get()` just returns the cached export for that
dependency during runtime.

By supporting the runtime API natively, this allows:

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

## What? Macros in JavaScript?

This project used macros as the static form to process because it was something
that had a concrete implementation, and the reader concept from the sweetjs
project is really neat. However, use of macros in this project does not mean that
macros are definitely coming to JavaScript, and if they do, they may look
differently than what is provided here. It is just to prove out doing static
work before dropping the code down into dynamic calls and dynamic module values.

The goal is to really show the kinds of static module work that can be done in
a way that still allows for a dynamic module API that would allow "single value"
exports and allowing "legacy JavaScript" to opt in to being used as an ES module
by calling a dynamic, runtime API.

All that said, sweetjs is pretty sweet, and it is really cool that they may
have figured out a way to construct
[a reader](http://calculist.org/blog/2012/04/17/homoiconicity-isnt-the-point/)
for JS. The reader may have some use even outside of macros, and there could be
JS use cases that really benefit from macros, in particular language variants
that are lighter than full transpilers.

## Unsupported syntax

1) "Built" forms, where there are named modules all combined together:

    module 'a' {
        module b from 'b';
        export var name = 'a';
        export b;
    }

    module 'b' {
        export var name = 'b';
    }

This should be possible, just need to work out the AST transforms. `module {}`
scope will be treated the same as `function () {}` scope.

2. No `import *`. It seems like it is on its way out. It could be supported
in the future, but only for static exports from a dependency.

## TODO

* Allow the built forms mentioned above.
* Allow a local `System.exports.prop = value`, to allow for cycle dependencies via the
runtime API?
* Allow a `System.module` that has a .id and .uri properties that give info on
the current module? This is similar to the `module` free variable in CommonJS/AMD
and is used often times to locate resources relative to the module.
* Change the loader plugin API to something that matches the Module Loader API,
like resolve vs normalize, anything else?
* Integrate modus parsing into the core of requirejs for the plugin path,
so transpiled languages can use the modus syntax.
* Throw if `System.set()` is used with the static `export var name` forms.
* Only `import y from 'a'` is supported, no destructure type of thing yet. Just a
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


