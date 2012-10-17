/*global requirejs, doh */
var sweet = requirejs.sweet,
    lineEndRegExp = /[\r\n]\s*/g;

function grind(text) {
    'use strict';
    var readTree = sweet.parser.read(text),
        expanded = sweet.expander.expand(readTree),
        flattened = sweet.expander.flatten(expanded),
        ast = sweet.parser.parse(flattened),
        finalText = sweet.escodegen.generate(ast);

    return stripLines(finalText);
}

function stripLines(text) {
    return text && text.replace(lineEndRegExp, '');
}

doh.register(
    "sweet",
    [
        function sweet(t) {
            'use strict';

            var text = "module b from 'b';";
            t.is(text, grind(text));

            text = "import y from 'b';";
            t.is(text, grind(text));

            text = "export var foo = function () {};";
            t.is(text, grind(text));
        }
    ]
);
doh.run();

