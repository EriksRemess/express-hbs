/**
 * Parses a template string into an AST without running whitespace control.
 *
 * @param {string | { type: string }} input
 * @param {{ srcName?: string }} options
 * @returns {object}
 */
export function parseWithoutProcessing(input: string | {
    type: string;
}, options: {
    srcName?: string;
}): object;
/**
 * Parses a template string into an AST and applies whitespace control.
 *
 * @param {string | { type: string }} input
 * @param {{ ignoreStandalone?: boolean, srcName?: string }} options
 * @returns {object}
 */
export function parse(input: string | {
    type: string;
}, options: {
    ignoreStandalone?: boolean;
    srcName?: string;
}): object;
declare namespace _default {
    export { parse };
    export { parseWithoutProcessing };
}
export default _default;
