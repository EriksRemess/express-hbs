/**
 * Copies enumerable own properties into a target lookup object while skipping unsafe keys.
 *
 * @param {object} target
 * @param {...unknown} sources
 * @returns {object}
 */
export function assignLookupObject(target: object, ...sources: unknown[]): object;
export function createNewLookupObject(...sources: any[]): any;
