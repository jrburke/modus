An experiment relating to ECMAScript modules that tries out the following:

* "module loader plugins" that allow loading non-JS dependencies. This allows
easier use of transpilers and resources that are necessary for a module setup
but are not JS in source form, but can be translated to a JS form. Templates
for browser-based widgets being a common example.
* Static module entities, but runtime values can be dynamic values. This allows
easier use of legacy (pre-ES.next code), and allow for modules to export a single
runtime value, like a constructor function, without needing the module to
give an explicit name to that value.
* Strings used for module names, instead of identifiers. This allows for the
loader plugin-style of modules and for a more direct relationship between
dependency references and module definitions.

## Supported syntax

### Static API

To use a module:

    module a from 'a';

To use a "loader plugin", specify the module ID of the plugin, then an '@'
separator, followed by a resource ID that the plugin handles:

    module template from 'text!template.html';

To import a statically known exports:

    import y from 'a';
    import { name: localGammaName } from gamma;


To export a property on an exported value:

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
current function. `System.get()` just returns the cached export for that
dependency.

By supporting the runtime API natively, this allows:

* "Legacy" JS to opt-in to being used by an ES.next module system, in a way that
allows the the legacy script to work in non-ES.next systems (1JS concerns).
* By not using a loader plugin to load legacy scripts, it allows the script to
"upgrade" to static forms later without all callers having to then change their
dependency reference IDs.

If there is a conflict where `System.get/set` actually referred to some other API,
then a loader plugin could be used to load those scripts.

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

This shold be possible, just need to work out the AST transforms. `module {}`
scope will be treated the same as `function () {}` scope.

## 'Global' API

`System.load()` is used to kick off top level module loading. Right now it is
just an alias to the `require([], function () {})` API, but it can be adapted
to another form. It seemed that allowing multiple modules to load from a single
load call, since that API is the only API to do a top-level script load. Maybe
that is just meant to look like `System.load('a', 'b', function (a, b) {})`.

## How does it work?

RequireJS is used under the covers, but instead of loading scripts via a script
tags, it uses XMLHttpRequest (XHR) calls to load the text, then the text is
parsed via esprima.js to find the module APIs, and they are converted to
requirejs APIs.

This is just a start, to get a feel for the surface syntax, but the approach
will be changed more over time as the TODO items are done. In particular, the
goal is to simulate injecting static exports before execution, to do a proof
of concept of the static forms mixing with dynamic values.

## TODO

* Integrate sweetjs (or something else?) as a proof of concept of a static
entity working alongside the dynamic, runtime module values.
* Allow a `System.exports = value`, to allow for cycle dependencies via the
runtime API?
* Allow a `System.module` that has a .id and .uri properties that give info on
the current module? This is similar to the `module` free variable in CommonJS/AMD
and is used often times to locate resources relative to the module.
* Change the loader plugin API to something that matches the Module Loader API,
like resolve vs normalize, anything else?
* Integrate modus parsing into the core of requirejs for the plugin path,
so transpiled languages can use the modus syntax.
