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

export var aName = a.name;
export var bName = b.name;
//This seems awkward. Wanted to just do
//export crazyScope, but that does not seem to be allowed in spec?
export var scopeTest = crazyScope;
