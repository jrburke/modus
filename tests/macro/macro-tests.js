
System.load(['a'], function(a) {
    doh.register(
        "macro",
        [
            function macro(t){
                t.is(5, a.add(3, 2));
            }
        ]
    );
    doh.run();
    }
);
