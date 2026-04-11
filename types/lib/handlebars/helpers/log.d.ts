/**
 * Registers the built-in `log` helper.
 *
 * @param {{ registerHelper(name: string, fn: Function): void, log(level: string | number, ...message: unknown[]): void }} instance
 * @returns {void}
 */
export default function registerLog(instance: {
    registerHelper(name: string, fn: Function): void;
    log(level: string | number, ...message: unknown[]): void;
}): void;
