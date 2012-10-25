/*global System, doh */
System.load(['lib'], function (lib) {
    'use strict';
    doh.register(
        "simple",
        [
            function simple(t) {
                t.is('a', lib.aName);
                t.is('b', lib.bName);
            }
        ]
    );
    doh.run();
});
