import { createNewLookupObject } from '#handlebars/internal/create-new-lookup-object';

/**
 * Registers the built-in `inline` decorator.
 *
 * @param {{ registerDecorator(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export default function registerInline(instance) {
  instance.registerDecorator('inline', function(fn, props, container, options) {
    let wrapper;

    if (!props.partials) {
      props.partials = createNewLookupObject();
      wrapper = function(context, execOptions) {
        const original = container.partials;
        const originalPrograms = container.programs;
        container.partials = createNewLookupObject(original, props.partials);
        container.programs = [];
        try {
          return fn(context, execOptions);
        } finally {
          container.partials = original;
          container.programs = originalPrograms;
        }
      };
    }

    props.partials[options.args[0]] = options.fn;
    return wrapper;
  });
}
