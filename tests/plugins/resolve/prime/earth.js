System.set({
    getA: function () {
        return System.get("../index@0?./a:./b:./c");
    },
    getC: function () {
        return System.get("../index@2?./a:./b:./c");
    },
    getB: function () {
        return System.get("../index@1?./a:./b:./c");
    }
});
