import {
  appendContextPath,
  blockParams,
  createFrame,
  markInternalOptions
} from '#handlebars/utils';
import Exception from '#handlebars/exception';

function getIteratorOwner(context) {
  let current = context;

  while (current) {
    if (Object.hasOwn(current, Symbol.iterator)) {
      return current;
    }

    current = Object.getPrototypeOf(current);
  }
}

function getSafeIterator(context) {
  if (typeof Symbol !== 'function') {
    return;
  }

  const iterator = context[Symbol.iterator];
  if (typeof iterator !== 'function') {
    return;
  }

  if (getIteratorOwner(context) !== Object.prototype) {
    return iterator;
  }
}

/**
 * Registers the built-in `each` block helper.
 *
 * @param {{ registerHelper(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export default function(instance) {
  instance.registerHelper('each', function(context, options) {
    if (!options) {
      throw new Exception('Must pass iterator to #each');
    }

    let fn = options.fn,
      inverse = options.inverse,
      usesBlockParams = !!fn.blockParams,
      i = 0,
      ret = '',
      data,
      contextPath,
      iterationOptions;
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

    if (!usesBlockParams) {
      iterationOptions = markInternalOptions({
        data,
        blockParams: undefined
      });
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

      if (usesBlockParams) {
        ret += fn(value, markInternalOptions({
          data,
          blockParams: blockParams(
            [value, field],
            [contextPath + field, null]
          )
        }));
        return;
      }

      ret += fn(value, iterationOptions);
    }

    function execIterator(iteratorFn) {
      const iterator = iteratorFn.call(context);
      let current = iterator.next();

      while (!current.done) {
        const next = iterator.next();
        execIteration.call(this, i, current.value, i, next.done);
        current = next;
        i += 1;
      }
    }

    function execObject() {
      let priorKey;

      for (const key in context) {
        if (!Object.hasOwn(context, key)) {
          continue;
        }

        // We're running the iterations one step out of sync so we can detect
        // the last iteration without have to scan the object twice and create
        // an itermediate keys array.
        if (priorKey !== undefined) {
          execIteration.call(this, priorKey, context[priorKey], i - 1);
        }
        priorKey = key;
        i += 1;
      }
      if (priorKey !== undefined) {
        execIteration.call(this, priorKey, context[priorKey], i - 1, true);
      }
    }

    if (context && typeof context === 'object') {
      if (Array.isArray(context)) {
        for (let j = context.length; i < j; i++) {
          if (!Object.hasOwn(context, i)) {
            continue;
          }

          if (usesBlockParams) {
            execIteration.call(this, i, context[i], i, i === context.length - 1);
          } else {
            execIteration(i, context[i], i, i === context.length - 1);
          }
        }
      } else {
        const iteratorFn = getSafeIterator(context);
        if (iteratorFn) {
          execIterator.call(this, iteratorFn);
        } else {
          execObject.call(this);
        }
      }
    }

    if (i === 0) {
      ret = inverse(this);
    }

    return ret;
  });
}
