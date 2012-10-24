/*global System */
(function () {
    'use strict';

    function parse(name) {
        var parts = name.split('?'),
            index = parseInt(parts[0], 10),
            choices = parts[1].split(':'),
            choice = choices[index];

        return {
            index: index,
            choices: choices,
            choice: choice
        };
    }

    System.set({
        resolve: function (resourceId, resolve) {
            var parsed = parse(resourceId),
                choices = parsed.choices,
                i;

            //Normalize each path choice.
            for (i = 0; i < choices.length; i += 1) {
                choices[i] = resolve(choices[i]);
            }

            return parsed.index + '?' + choices.join(':');
        },

        load: function (resourceId, System, request, config) {
            System.load([parse(resourceId).choice], request.fulfill, request.reject);
        },

        //This is strictly not necessary (and *not* recommended),
        //but just doing it as a test.
        write: function (pluginName, moduleName, write) {
            var parsed = parse(moduleName);
            write("define('" + pluginName + "!" + moduleName  +
                  "', ['" + parsed.choice + "'], function (value) { return value;});\n");
        }
    });

}());
