/**
 * Parses a template string into an AST without running whitespace control.
 *
 * @param {string | { type: string }} input
 * @param {{ srcName?: string }} options
 * @returns {object}
 */
export declare function parseWithoutProcessing(input: string | {
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
export declare function parse(input: string | {
    type: string;
}, options: {
    ignoreStandalone?: boolean;
    srcName?: string;
}): object;
declare const _default: {
    parse: typeof parse;
    parseWithoutProcessing: typeof parseWithoutProcessing;
};
export default _default;
