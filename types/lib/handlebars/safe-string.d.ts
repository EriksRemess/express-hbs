/**
 * String wrapper that tells Handlebars output escaping to trust the value.
 */
export default class SafeString {
    /** @type {unknown} */
    string: unknown;
    /** @type {() => string} */
    toHTML: () => string;
    /**
     * @param {unknown} string
     */
    constructor(string: unknown);
    /**
     * @returns {string}
     */
    toString(): string;
}
