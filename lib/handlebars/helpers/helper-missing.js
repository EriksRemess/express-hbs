import Exception from '#handlebars/exception';

/**
 * Registers the fallback helper used when a named helper cannot be resolved.
 *
 * @param {{ registerHelper(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export default function(instance) {
  instance.registerHelper('helperMissing', function(options) {
    if (arguments.length === 1) {
      // A missing field in a {{foo}} construct.
      return undefined;
    }

    options = arguments[arguments.length - 1];
    throw new Exception(`Missing helper: "${options.name}"`);
  });
}
