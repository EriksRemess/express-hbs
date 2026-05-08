/**
 * String wrapper that tells Handlebars output escaping to trust the value.
 */
export default class SafeString {
  /** @type {unknown} */
  string;

  /** @type {() => string} */
  toHTML;

  /**
   * @param {unknown} string
   */
  constructor(string) {
    this.string = string;
    Object.defineProperty(this, 'toHTML', {
      configurable: true,
      value: this.toString.bind(this)
    });
  }

  /**
   * @returns {string}
   */
  toString() {
    return String(this.string);
  }

}
