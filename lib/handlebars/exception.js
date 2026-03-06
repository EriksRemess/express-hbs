/**
 * Handlebars-flavored error with optional location metadata from the AST.
 */
export default class Exception extends Error {
  /**
   * @param {string} message
   * @param {{ loc?: { start: { line: number, column: number }, end: { line: number, column: number } } }} [node]
   */
  constructor(message, node) {
    const loc = node?.loc;
    const finalMessage = loc
      ? `${message} - ${loc.start.line}:${loc.start.column}`
      : message;

    super(finalMessage);
    this.name = 'Error';

    if (!loc) {
      return;
    }

    this.lineNumber = loc.start.line;
    this.endLineNumber = loc.end.line;

    Object.defineProperty(this, 'column', {
      value: loc.start.column,
      enumerable: true
    });
    Object.defineProperty(this, 'endColumn', {
      value: loc.end.column,
      enumerable: true
    });
  }
}
