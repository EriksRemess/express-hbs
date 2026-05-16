import { isEmpty } from '#handlebars/utils';
import Exception from '#handlebars/exception';

/**
 * Registers the built-in `if` and `unless` helpers.
 *
 * @param {{ registerHelper(name: string, fn: Function): void, helpers: Record<string, Function> }} instance
 * @returns {void}
 */
export default function(instance) {
  instance.registerHelper('if', function(conditional, options) {
    if (options === undefined) {
      throw new Exception('#if requires exactly one argument');
    }
    if (typeof conditional === 'function') {
      conditional = conditional.call(this);
    }

    // Default behavior is to render the positive path if the value is truthy and not empty.
    // The `includeZero` option may be set to treat the condtional as purely not empty based on the
    // behavior of isEmpty. Effectively this determines if 0 is handled by the positive path or negative.
    if (!options.hash.includeZero && !conditional || isEmpty(conditional)) {
      return options.inverse(this);
    }

    return options.fn(this);
  });

  instance.registerHelper('unless', function(conditional, options) {
    if (options === undefined) {
      throw new Exception('#unless requires exactly one argument');
    }
    if (typeof conditional === 'function') {
      conditional = conditional.call(this);
    }

    if (!options.hash.includeZero && !conditional || isEmpty(conditional)) {
      return options.fn(this);
    }

    return options.inverse(this);
  });
}
