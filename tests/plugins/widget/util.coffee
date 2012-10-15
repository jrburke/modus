# Using requirejs API, need to better integrate modus parsing into core for it
# to use the modus APIs.
define
  toDom: (text) ->
    # Just for fun, not really usable, just need some goo to translate to JS
    node = document.createElement('div')
    node.innerHTML = text
    return node.firstChild
