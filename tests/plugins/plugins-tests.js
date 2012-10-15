/*global System, doh */
System.load(['text@template.html', 'widget'], function (template, widget) {
    'use strict';
    var w = widget();

    doh.register(
        "plugins",
        [
            function simple(t) {
                t.is('<h1>Hello World</h1>', template.trim());
                t.is('<div>widget</div>', w.template.trim());
                t.is('function', typeof w.util.toDom);
            }
        ]
    );
    doh.run();
});
