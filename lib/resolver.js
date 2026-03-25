/**
 * @typedef {Map<string, Promise<unknown>> | Record<string, Promise<unknown>>} ResolverCache
 */

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_';
const alphabetLength = alphabet.length;
const ID_LENGTH = 8;
const ID_PREFIX = '__aSyNcId__';

// NOTE: We must include a character which is escaped by Handlebars in the "async id"
// This is so that when using an async helper "inline", such as {{asyncHelper "foo"}}
// the content is correctly escaped depending on whether double or triple braces.
const ID_ESCAPED_STRING = '<_';

const ID_SUFFIX = '__';
const RESOLVER_ID_PATTERN = /__aSyNcId__(?:<_|&lt;_)[A-Za-z_]{8}__/;
let nextId = 0;
const resolverCacheError = 'Resolver cache must be a Map or an object.';

/**
 * @param {unknown} cache
 * @returns {boolean}
 */
function isResolverCache(cache) {
  return cache instanceof Map || !!cache && typeof cache === 'object' && !Array.isArray(cache);
}

/**
 * @param {unknown} cache
 * @returns {void}
 */
function assertResolverCache(cache) {
  if (!isResolverCache(cache)) {
    throw new TypeError(resolverCacheError);
  }
}

/**
 * @param {unknown} fn
 * @returns {void}
 */
function assertResolverFn(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('Resolver callback must be a function.');
  }
}

/**
 * @param {unknown} callback
 * @returns {void}
 */
function assertDoneCallback(callback) {
  if (callback !== undefined && typeof callback !== 'function') {
    throw new TypeError('Resolver completion callback must be a function.');
  }
}

function generateId(length = ID_LENGTH) {
  let value = nextId;
  let encoded = '';

  do {
    encoded = alphabet[value % alphabetLength] + encoded;
    value = Math.floor(value / alphabetLength);
  } while (value > 0);

  while (encoded.length < length) {
    encoded = `${alphabet[0]}${encoded}`;
  }

  nextId += 1;
  return encoded.length > length ? encoded.slice(-length) : encoded;
}

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
export function resolve(cache, fn, context) {
  assertResolverCache(cache);
  assertResolverFn(fn);

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
export function done(cache, callback) {
  assertResolverCache(cache);
  assertDoneCallback(callback);

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
export const hasResolvers = (text) => {
  // Match complete ids and also account for Handlebars escaping "<" to "&lt;".
  return typeof text === 'string' && RESOLVER_ID_PATTERN.test(text);
};
