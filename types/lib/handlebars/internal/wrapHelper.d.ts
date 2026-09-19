export declare const lookupPropertyOption: unique symbol;
/**
 * Wraps a helper so runtime property lookups use the current lookup guard.
 *
 * @param {unknown} helper
 * @param {(parent: object, propertyName: string) => unknown} lookupProperty
 * @returns {unknown}
 */
export declare function wrapHelper(helper: unknown, lookupProperty: (parent: object, propertyName: string) => unknown): unknown;
