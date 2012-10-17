macro def {
  case $name:ident $params $body => {
    function $name $params $body
  }
}

def add (a, b) {
  return a + b;
}

System.set({
    add: add
});