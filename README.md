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

## How does it work?
