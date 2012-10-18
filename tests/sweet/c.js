  macro mymac {
    case $name {...} => { macro $name { ... } }
  }

  // have no idea at read time this will be a macro definition
  export mymac f {
    case $name:ident $params $body => {
    function $name $params $body
  }
