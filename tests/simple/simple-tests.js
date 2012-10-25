System.load(['a'], function(a) {
    doh.register(
        "simple",
        [
            function simple(t){
                t.is('a', a.name);
                t.is('b', a.b.name);
                t.is('c', a.b.c.name);
            }
        ]
    );
    doh.run();
    }
);
