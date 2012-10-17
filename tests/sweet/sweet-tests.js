/*global requirejs, doh */
var sweet = requirejs.sweet;

function grind(text) {
    'use strict';
    var readTree = sweet.parser.read(text),
        expanded = sweet.expander.expand(readTree),
        flattened = sweet.expander.flatten(expanded),
        ast = sweet.parser.parse(flattened),
        finalText = sweet.escodegen.generate(ast);

    return finalText;
}

doh.register(
    "sweet",
    [
        function sweet(t) {
            'use strict';

            var text = "module b from 'b';";
            t.is(text, grind(text));
        }
    ]
);
doh.run();

