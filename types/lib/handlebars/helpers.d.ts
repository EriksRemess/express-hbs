/**
 * Registers the built-in helpers exposed by the local Handlebars runtime.
 *
 * @param {{ registerHelper(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export function registerDefaultHelpers(instance: {
    registerHelper(name: string, fn: Function): void;
}): void;
/**
 * Mirrors a helper onto the runtime hook table.
 *
 * @param {{ helpers: Record<string, Function>, hooks: Record<string, Function> }} instance
 * @param {string} helperName
 * @param {boolean} keepHelper
 * @returns {void}
 */
export function moveHelperToHooks(instance: {
    helpers: Record<string, Function>;
    hooks: Record<string, Function>;
}, helperName: string, keepHelper: boolean): void;
