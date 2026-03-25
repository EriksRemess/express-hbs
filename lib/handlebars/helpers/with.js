import {
  appendContextPath,
  blockParams,
  createFrame,
  isEmpty
} from '#handlebars/utils';
import Exception from '#handlebars/exception';

/**
 * Registers the built-in `with` block helper.
 *
 * @param {{ registerHelper(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export default function(instance) {
  instance.registerHelper('with', function(context, options) {
    if (options === undefined) {
      throw new Exception('#with requires exactly one argument');
    }
    if (typeof context === 'function') {
      context = context.call(this);
    }

    let fn = options.fn;

    if (!isEmpty(context)) {
      let data = options.data;
      if (options.data && options.ids) {
        data = createFrame(options.data);
        data.contextPath = appendContextPath(
          options.data.contextPath,
          options.ids[0]
        );
      }

      return fn(context, {
        data,
        blockParams: blockParams([context], [data && data.contextPath])
      });
    }

    return options.inverse(this);
  });
}
