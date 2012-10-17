#!/usr/bin/env node

/*jslint nomen: true, node: true */

var fs = require('fs'),
    path = require('path'),
    r = fs.readFileSync(path.join(__dirname, 'require.js'), 'utf8'),
    e = fs.readFileSync(path.join(__dirname, 'esprima.js'), 'utf8'),
    m = fs.readFileSync(path.join(__dirname, 'm.js'), 'utf8'),
    sweet = fs.readFileSync(path.join(__dirname, 'sweet.js'), 'utf8'),
    combined = '',
    insertIndex = r.indexOf('function isFunction(it) {');

//Brittle: insert esprima after first set of require local variables.
combined = r.substring(0, insertIndex) +
           e + '\n' + sweet +
           r.substring(insertIndex, r.length);

//Brittle: looking for something after the initial requirejs.load
//definition, but before any data-main or config-based loading is done.
combined = combined.replace(/function\s*getInteractiveScript\s*\(\s*\)\s*\{/, m + '\n$&') +
           '\nvar modus = requirejs;';

fs.writeFileSync(path.join(__dirname, '..', 'modus.js'), combined, 'utf8');
