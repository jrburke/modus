export macro def {
  case $name:ident $params $body => {
    function $name $params $body
  }
}

export var name = 'a';

export function foo () {

};

export var bar = function() {

};

export var baz = function temp() {

};

export module d from 'd';
