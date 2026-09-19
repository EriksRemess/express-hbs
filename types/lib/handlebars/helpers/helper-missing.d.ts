/**
 * Registers the fallback helper used when a named helper cannot be resolved.
 *
 * @param {{ registerHelper(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export default function (instance: {
    registerHelper(name: string, fn: Function): void;
}): void;
