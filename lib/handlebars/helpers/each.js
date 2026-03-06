import {
  appendContextPath,
  blockParams,
  createFrame
} from '#handlebars/utils';
import Exception from '#handlebars/exception';

export default function(instance) {
  instance.registerHelper('each', function(context, options) {
    if (!options) {
      throw new Exception('Must pass iterator to #each');
    }

    let fn = options.fn,
      inverse = options.inverse,
      i = 0,
      ret = '',
      data,
      contextPath;
    if (options.data && options.ids) {
      contextPath =
        appendContextPath(options.data.contextPath, options.ids[0]) + '.';
    }

    if (typeof context === 'function') {
      context = context.call(this);
    }

    if (options.data) {
      data = createFrame(options.data);
    }

    function execIteration(field, value, index, last) {
      if (data) {
        data.key = field;
        data.index = index;
        data.first = index === 0;
        data.last = !!last;

        if (contextPath) {
          data.contextPath = contextPath + field;
        }
      }

      const iterationOptions = {
        data,
        blockParams: blockParams(
          [value, field],
          [contextPath + field, null]
        )
      };

      ret += fn(value, iterationOptions);
    }

    if (context && typeof context === 'object') {
      if (Array.isArray(context)) {
        for (let j = context.length; i < j; i++) {
          if (i in context) {
            execIteration(i, context[i], i, i === context.length - 1);
          }
        }
      } else if (typeof Symbol === 'function' && context[Symbol.iterator]) {
        const iterator = context[Symbol.iterator]();
        let current = iterator.next();

        while (!current.done) {
          const next = iterator.next();
          execIteration(i, current.value, i, next.done);
          current = next;
          i += 1;
        }
      } else {
        let priorKey;

        for (const key in context) {
          if (!Object.hasOwn(context, key)) {
            continue;
          }

          // We're running the iterations one step out of sync so we can detect
          // the last iteration without have to scan the object twice and create
          // an itermediate keys array.
          if (priorKey !== undefined) {
            execIteration(priorKey, context[priorKey], i - 1);
          }
          priorKey = key;
          i += 1;
        }
        if (priorKey !== undefined) {
          execIteration(priorKey, context[priorKey], i - 1, true);
        }
      }
    }

    if (i === 0) {
      ret = inverse(this);
    }

    return ret;
  });
}
