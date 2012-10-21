/*jslint sloppy: true */
/*global modus, doh, XMLHttpRequest, console */
var sweet = modus.sweet,
    lineEndRegExp = /[\r\n]\s*/g;

function stripLines(text) {
    return text && text.replace(lineEndRegExp, '');
}

function grind(text) {
    var readTree = sweet.parser.read(text),
        expanded = sweet.expander.expand(readTree),
        flattened = sweet.expander.flatten(expanded),
        ast = sweet.parser.parse(flattened),
        finalText = sweet.escodegen.generate(ast);

    return stripLines(finalText);
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
        }
    ]
);
doh.run();

