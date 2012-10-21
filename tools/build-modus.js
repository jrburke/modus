#!/usr/bin/env node

/*jslint nomen: true, node: true */

var fs = require('fs'),
    path = require('path'),
    m = fs.readFileSync(path.join(__dirname, 'm.js'), 'utf8'),
    sweet = fs.readFileSync(path.join(__dirname, 'sweet.js'), 'utf8'),
    esprima = fs.readFileSync(path.join(__dirname, 'esprima.js'), 'utf8'),
    combined = '',
    sweetMarker = '//INSERT SWEET HERE',
    esprimaMarker = '//INSERT ESPRIMA HERE',
    esprimaIndex = m.indexOf(esprimaMarker),
    sweetIndex = m.indexOf(sweetMarker);

combined = m.substring(0, sweetIndex + sweetMarker.length) +
           '\n' + sweet +
           m.substring(sweetIndex + sweetMarker.length, m.length);

combined = combined.substring(0, esprimaIndex + esprimaMarker.length) +
           '\n' + esprima +
           combined.substring(esprimaIndex + esprimaMarker.length, combined.length);

fs.writeFileSync(path.join(__dirname, '..', 'modus.js'), combined, 'utf8');
