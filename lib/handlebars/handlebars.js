import runtime from '#handlebars/handlebars.runtime';

import { parse } from '#handlebars/compiler/parser';
import { compile, precompile } from '#handlebars/compiler/compiler';

const _create = runtime.create;

/**
 * Creates a full Handlebars instance with parser, compiler, and runtime APIs.
 *
 * @returns {import('../handlebars.d.ts').LocalHandlebars}
 */
function create() {
  const hb = _create();
  hb.create = create;
  hb.parse = parse;
  hb.precompile = function(input, options) {
    return precompile(input, options);
  };
  hb.compile = function(input, options) {
    return compile(input, options, hb);
  };

  return hb;
}

const inst = create();

export default inst;
