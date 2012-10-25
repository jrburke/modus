var crazyScope = 1;

module 'a' {
    export var name = 'a';
    crazyScope += 1;
}

module 'b' {
    export var name = 'b';
    crazyScope += 1;
}

module a from 'a';
module b from 'b';

export var aName = a;
export var bName = b;
export var scopeTest = crazyScope;
