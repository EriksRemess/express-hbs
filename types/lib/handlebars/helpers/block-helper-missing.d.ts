/**
 * Registers the fallback block helper used when a block path does not resolve to a helper.
 *
 * @param {{ registerHelper(name: string, fn: Function): void, helpers: Record<string, Function> }} instance
 * @returns {void}
 */
export default function _default(instance: {
    registerHelper(name: string, fn: Function): void;
    helpers: Record<string, Function>;
}): void;
