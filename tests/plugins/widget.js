module template from 'text@widget/template.html';
module util from 'cs@widget/util';

function widget() {
    return {
        template: template,
        util: util
    }
}
//Show how a dynamic single value can be exported
System.set(widget);