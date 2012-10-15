
System.load(['a'], function(a) {
    doh.register(
        "exports",
        [
            function exports(t){
                t.is('a', a.name);
                t.is('blue', a.color);
            }
        ]
    );
    doh.run();
    }
);
