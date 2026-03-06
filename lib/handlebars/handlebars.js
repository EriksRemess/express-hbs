import runtime from '#handlebars/handlebars.runtime';

import { parse } from '#handlebars/compiler/base';
import { compile, precompile } from '#handlebars/compiler/compiler';

const _create = runtime.create;
function create() {
  const hb = _create();
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
inst.create = create;

export default inst;
