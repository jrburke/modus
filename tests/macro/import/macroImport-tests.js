
System.load(['b'], function(b) {
    doh.register(
        "macroImport",
        [
            function macroImport(t){
                t.is(1, b.subtract(3, 2));
            }
        ]
    );
    doh.run();
    }
);
