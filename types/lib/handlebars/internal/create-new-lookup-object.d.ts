/**
 * Copies enumerable own properties into a target lookup object while skipping unsafe keys.
 *
 * @param {object} target
 * @param {...unknown} sources
 * @returns {object}
 */
export function assignLookupObject(target: object, ...sources: unknown[]): object;
/**
 * Creates a null-prototype lookup object for helper and partial registries.
 *
 * @param {...object} sources
 * @returns {object}
 */
export function createNewLookupObject(...sources: object[]): object;
