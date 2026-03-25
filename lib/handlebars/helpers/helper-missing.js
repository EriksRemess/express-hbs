import Exception from '#handlebars/exception';

/**
 * Registers the fallback helper used when a named helper cannot be resolved.
 *
 * @param {{ registerHelper(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export default function(instance) {
  instance.registerHelper('helperMissing', function(...args) {
    if (args.length === 1) {
      // A missing field in a {{foo}} construct.
      return undefined;
    }

    throw new Exception(`Missing helper: "${args.at(-1).name}"`);
  });
}
