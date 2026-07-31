/**
 * Escapes a value for safe HTML output.
 *
 * @param {unknown} string
 * @returns {string}
 */
export function escapeExpression(string: unknown): string;
/**
 * Implements Handlebars emptiness semantics used by built-in helpers.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmpty(value: unknown): boolean;
/**
 * Creates a child data frame linked to a parent frame.
 *
 * @param {Record<string, unknown>} object
 * @returns {Record<string, unknown> & { _parent: Record<string, unknown> }}
 */
export function createFrame(object: Record<string, unknown>): Record<string, unknown> & {
    _parent: Record<string, unknown>;
};
/**
 * Marks internally-created runtime options so the program wrapper can trust their shape.
 *
 * @param {Record<PropertyKey, unknown>} options
 * @returns {Record<PropertyKey, unknown>}
 */
export function markInternalOptions(options: Record<PropertyKey, unknown>): Record<PropertyKey, unknown>;
/**
 * Checks whether an options object was created by the runtime/helpers.
 *
 * @param {unknown} options
 * @returns {boolean}
 */
export function isInternalOptions(options: unknown): boolean;
/**
 * Attaches block-param path metadata to the params array.
 *
 * @param {unknown[] & { path?: unknown }} params
 * @param {unknown} ids
 * @returns {unknown[] & { path: unknown }}
 */
export function blockParams(params: unknown[] & {
    path?: unknown;
}, ids: unknown): unknown[] & {
    path: unknown;
};
/**
 * Appends a child path segment to a Handlebars context path.
 *
 * @param {string | undefined} contextPath
 * @param {string} id
 * @returns {string}
 */
export function appendContextPath(contextPath: string | undefined, id: string): string;
