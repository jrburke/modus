#!/usr/bin/env node

/*jslint nomen: true, node: true */

var fs = require('fs'),
    path = require('path'),
    m = fs.readFileSync(path.join(__dirname, 'm2.js'), 'utf8'),
    sweet = fs.readFileSync(path.join(__dirname, 'sweet.js'), 'utf8'),
    combined = '',
    sweetMarker = '//INSERT SWEET HERE',
    insertIndex = m.indexOf(sweetMarker);

//Brittle: insert esprima after first set of require local variables.
combined = m.substring(0, insertIndex + sweetMarker.length) +
           '\n' + sweet +
           m.substring(insertIndex + sweetMarker.length, m.length);

fs.writeFileSync(path.join(__dirname, '..', 'modus2.js'), combined, 'utf8');
