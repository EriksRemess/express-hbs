/**
 * String wrapper that tells Handlebars output escaping to trust the value.
 */
export default class SafeString {
    /**
     * @param {unknown} string
     */
    constructor(string: unknown);
    string: unknown;
    /**
     * @returns {string}
     */
    toString(): string;
    /**
     * @returns {string}
     */
    toHTML(): string;
}
