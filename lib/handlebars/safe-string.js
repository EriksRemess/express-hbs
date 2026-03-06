// Build out our basic SafeString type
export default class SafeString {
  constructor(string) {
    this.string = string;
  }

  toString() {
    return String(this.string);
  }

  toHTML() {
    return this.toString();
  }
}
