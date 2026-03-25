import { appendContextPath, createFrame } from '#handlebars/utils';

/**
 * Registers the fallback block helper used when a block path does not resolve to a helper.
 *
 * @param {{ registerHelper(name: string, fn: Function): void, helpers: Record<string, Function> }} instance
 * @returns {void}
 */
export default function(instance) {
  instance.registerHelper('blockHelperMissing', function(context, options) {
    let inverse = options.inverse,
      fn = options.fn;

    if (context === true) {
      return fn(this);
    } else if (context === false || context == null) {
      return inverse(this);
    } else if (Array.isArray(context)) {
      if (context.length > 0) {
        if (options.ids) {
          options.ids = [options.name];
        }

        return instance.helpers.each(context, options);
      } 
        return inverse(this);
      
    } 
      if (options.data && options.ids) {
        let data = createFrame(options.data);
        data.contextPath = appendContextPath(
          options.data.contextPath,
          options.name
        );
        options = { data: data };
      }

      return fn(context, options);
    
  });
}
