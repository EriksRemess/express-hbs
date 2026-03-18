/**
 * Creates a null-prototype lookup object for helper and partial registries.
 *
 * @param {...object} sources
 * @returns {object}
 */
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Copies enumerable own properties into a target lookup object while skipping unsafe keys.
 *
 * @param {object} target
 * @param {...unknown} sources
 * @returns {object}
 */
export function assignLookupObject(target, ...sources) {
  for (const source of sources) {
    if (source == null) {
      continue;
    }

    const copySource = Object(source);
    for (const key of Object.keys(copySource)) {
      if (unsafeKeys.has(key)) {
        continue;
      }

      target[key] = copySource[key];
    }
  }

  return target;
}

export function createNewLookupObject(...sources) {
  return assignLookupObject(Object.create(null), ...sources);
}
