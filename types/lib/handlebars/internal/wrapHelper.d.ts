/**
 * Wraps a helper so runtime property lookups use the current lookup guard.
 *
 * @param {unknown} helper
 * @param {(parent: object, propertyName: string) => unknown} lookupProperty
 * @returns {unknown}
 */
export function wrapHelper(helper: unknown, lookupProperty: (parent: object, propertyName: string) => unknown): unknown;
export const lookupPropertyOption: unique symbol;
