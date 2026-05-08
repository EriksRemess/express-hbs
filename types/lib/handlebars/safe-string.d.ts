/**
 * String wrapper that tells Handlebars output escaping to trust the value.
 */
export default class SafeString {
    /**
     * @param {unknown} string
     */
    constructor(string: unknown);
    /** @type {unknown} */
    string: unknown;
    /** @type {() => string} */
    toHTML: () => string;
    /**
     * @returns {string}
     */
    toString(): string;
}
