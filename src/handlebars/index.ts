import add from './add';

const prefix = 'acm';

export function registerHelpers() {
  Handlebars.registerHelper(`${prefix}-add`, add);
}