export macro def {
  case $name:ident $params $body => {
    function $name $params $body
  }
}

