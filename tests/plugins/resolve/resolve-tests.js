/*global System, doh */
System.load(['earth', 'prime/earth'], function (earth, primeEarth) {
    'use strict';

    doh.register(
        "pluginsResolve",
        [
            function pluginsResolve(t) {
                t.is("a", earth.getA().name);
                t.is("c", earth.getC().name);
                t.is("b", earth.getB().name);
                t.is("aPrime", primeEarth.getA().name);
                t.is("cPrime", primeEarth.getC().name);
                t.is("bPrime", primeEarth.getB().name);
            }
        ]
    );
    doh.run();
});
