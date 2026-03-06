/**
 * String wrapper that tells Handlebars output escaping to trust the value.
 */
export default class SafeString {
  /**
   * @param {unknown} string
   */
  constructor(string) {
    this.string = string;
  }

  /**
   * @returns {string}
   */
  toString() {
    return String(this.string);
  }

  /**
   * @returns {string}
   */
  toHTML() {
    return this.toString();
  }
}
