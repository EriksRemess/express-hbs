/**
 * Compiles a template string or AST into a JavaScript template specification.
 *
 * @param {string | { type: string }} input
 * @param {Record<string, unknown>} options
 * @returns {unknown}
 */
export function precompile(input: string | {
    type: string;
}, options: Record<string, unknown>): unknown;
/**
 * Compiles a template string or AST into a lazily initialized render function.
 *
 * @param {string | { type: string }} input
 * @param {Record<string, unknown>} options
 * @param {Record<string, unknown>} env
 * @returns {Function}
 */
export function compile(input: string | {
    type: string;
}, options: Record<string, unknown>, env: Record<string, unknown>): Function;
