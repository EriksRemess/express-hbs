import generateId from './generate-id.js';

/**
 * @typedef {Map<string, Promise<unknown>> | Record<string, Promise<unknown>>} ResolverCache
 */

const ID_LENGTH = 8;
const ID_PREFIX = '__aSyNcId__';

// NOTE: We must include a character which is escaped by Handlebars in the "async id"
// This is so that when using an async helper "inline", such as {{asyncHelper "foo"}}
// the content is correctly escaped depending on whether double or triple braces.
const ID_ESCAPED_STRING = '<_';

const ID_SUFFIX = '__';

/**
 * Stores a pending promise in resolver cache regardless of cache shape.
 *
 * @param {ResolverCache} cache
 * @param {string} key
 * @param {Promise<unknown>} value
 * @returns {void}
 */
function setCacheValue(cache, key, value) {
  if (cache instanceof Map) {
    cache.set(key, value);
    return;
  }
  cache[key] = value;
}

/**
 * Creates and stores an async placeholder id.
 *
 * @param {ResolverCache} cache
 * @param {(context: unknown, cb: (value: unknown) => void) => void} fn
 * @param {unknown} context
 * @returns {string}
 */
function resolve(cache, fn, context) {
  const id = `${ID_PREFIX}${ID_ESCAPED_STRING}${generateId(ID_LENGTH)}${ID_SUFFIX}`;
  const pending = new Promise((resolvePromise, rejectPromise) => {
    try {
      fn(context, resolvePromise);
    } catch (error) {
      rejectPromise(error);
    }
  });
  setCacheValue(cache, id, pending);
  return id;
}

/**
 * Resolves all pending async helper placeholders in cache.
 *
 * @param {ResolverCache} cache
 * @param {(err: Error | null, resolvedCache?: Record<string, unknown>) => void} [callback]
 * @returns {Promise<Record<string, unknown>> | void}
 */
function done(cache, callback) {
  let keys;
  let pending;
  if (cache instanceof Map) {
    keys = [];
    pending = [];
    for (const [key, value] of cache) {
      keys.push(key);
      pending.push(value);
    }
  } else {
    keys = Object.keys(cache);
    pending = new Array(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
      pending[index] = cache[keys[index]];
    }
  }
  const promise = Promise.all(pending)
    .then((values) => {
      const resolvedCache = Object.create(null);
      for (let index = 0; index < keys.length; index += 1) {
        resolvedCache[keys[index]] = values[index];
      }
      return resolvedCache;
    });

  if (typeof callback === 'function') {
    void (async () => {
      try {
        const resolvedCache = await promise;
        callback(null, resolvedCache);
      } catch (error) {
        callback(error);
      }
    })();
    return;
  }

  return promise;
}

/**
 * Checks whether string still contains unresolved async placeholders.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
const hasResolvers = (text) => {
  // NOTE: We specifically search the text for the ID_PREFIX **NOT** including the escapable character
  // This is because that character can be escaped in the text, and lead us to not finding unresolved
  // async helper outputs.
  return typeof text === 'string' && text.includes(ID_PREFIX);
};

export {
  done,
  hasResolvers,
  resolve
};
