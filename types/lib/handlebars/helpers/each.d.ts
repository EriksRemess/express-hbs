/**
 * Registers the built-in `each` block helper.
 *
 * @param {{ registerHelper(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export default function (instance: {
    registerHelper(name: string, fn: Function): void;
}): void;
