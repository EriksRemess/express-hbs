import { createFrame, HandlebarsEnvironment } from '#handlebars/base';
import SafeString from '#handlebars/safe-string';
import * as Utils from '#handlebars/utils';

/**
 * Creates a runtime-only Handlebars instance with utilities and built-ins attached.
 *
 * @returns {import('../handlebars.d.ts').LocalHandlebars}
 */
function create() {
  const hb = new HandlebarsEnvironment();
  hb.create = create;
  hb.SafeString = SafeString;
  hb.Utils = Utils;
  hb.createFrame = createFrame;
  hb.escapeExpression = Utils.escapeExpression;

  return hb;
}

const inst = create();

export default inst;
