export default class Exception extends Error {
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
