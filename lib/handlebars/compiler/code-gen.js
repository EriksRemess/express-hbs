/**
 * Minimal source node used by the local code generator.
 */
class SourceNode {
  /**
   * @param {number} line
   * @param {number} column
   * @param {string} srcFile
   * @param {string | string[] | SourceNode} chunks
   */
  constructor(line, column, srcFile, chunks) {
    this.src = '';
    if (chunks) {
      this.add(chunks);
    }
  }

  /**
   * @param {string | string[] | SourceNode} chunks
   * @returns {void}
   */
  add(chunks) {
    if (Array.isArray(chunks)) {
      chunks = chunks.join('');
    }
    this.src += chunks;
  }

  /**
   * @param {string | string[] | SourceNode} chunks
   * @returns {void}
   */
  prepend(chunks) {
    if (Array.isArray(chunks)) {
      chunks = chunks.join('');
    }
    this.src = chunks + this.src;
  }

  /**
   * @returns {{ code: string }}
   */
  toStringWithSourceMap() {
    return { code: this.toString() };
  }

  /**
   * @returns {string}
   */
  toString() {
    return this.src;
  }
}

const emptyLocation = { start: {} };
const quotedStringEscapePattern = /[\\\"\n\r\u2028\u2029]/;

/**
 * Normalizes a generated chunk into a form accepted by `SourceNode`.
 *
 * @param {unknown} chunk
 * @param {CodeGen} codeGen
 * @param {object} loc
 * @returns {unknown}
 */
function castChunk(chunk, codeGen, loc) {
  if (Array.isArray(chunk)) {
    let ret = '';

    for (let i = 0; i < chunk.length; i++) {
      ret += codeGen.wrap(chunk[i], loc);
    }
    return ret;
  }
  if (typeof chunk === 'boolean' || typeof chunk === 'number') {
    return String(chunk);
  }
  return chunk;
}

/**
 * Small utility that assembles generated JavaScript fragments.
 */
export default class CodeGen {
  /**
   * @param {string} srcFile
   */
  constructor(srcFile) {
    this.srcFile = srcFile;
    this.source = [];
  }

  /**
   * @returns {boolean}
   */
  isEmpty() {
    return !this.source.length;
  }

  /**
   * @param {unknown} source
   * @param {object} loc
   * @returns {void}
   */
  prepend(source, loc) {
    this.source.unshift(this.wrap(source, loc));
  }

  /**
   * @param {unknown} source
   * @param {object} loc
   * @returns {void}
   */
  push(source, loc) {
    this.source.push(this.wrap(source, loc));
  }

  /**
   * @returns {SourceNode}
   */
  merge() {
    const source = this.empty();
    const lines = this.source;

    for (let i = 0; i < lines.length; i++) {
      source.add('  ');
      source.add(lines[i]);
      source.add('\n');
    }
    return source;
  }

  /**
   * @param {(line: SourceNode) => void} iter
   * @returns {void}
   */
  each(iter) {
    for (const line of this.source) {
      iter(line);
    }
  }

  /**
   * @returns {SourceNode}
   */
  empty() {
    const loc = this.currentLocation || emptyLocation;
    return new SourceNode(loc.start.line, loc.start.column, this.srcFile);
  }

  /**
   * @param {unknown} chunk
   * @param {object} loc
   * @returns {SourceNode}
   */
  wrap(chunk, loc = this.currentLocation || emptyLocation) {
    if (chunk instanceof SourceNode) {
      return chunk;
    }

    return new SourceNode(
      loc.start.line,
      loc.start.column,
      this.srcFile,
      castChunk(chunk, this, loc)
    );
  }

  /**
   * @param {string} fn
   * @param {string} type
   * @param {unknown[]} params
   * @returns {SourceNode}
   */
  functionCall(fn, type, params) {
    const list = this.generateList(params);
    return this.wrap([fn, type ? `.${type}(` : '(', list, ')']);
  }

  /**
   * @param {unknown} str
   * @returns {string}
   */
  quotedString(str) {
    const string = String(str);

    if (!quotedStringEscapePattern.test(string)) {
      return '"' + string + '"';
    }

    return '"' +
      string
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029') +
      '"';
  }

  /**
   * @param {Record<string, unknown>} obj
   * @returns {SourceNode}
   */
  objectLiteral(obj) {
    const ret = this.empty();
    const keys = Object.keys(obj);
    let hasPairs = false;

    ret.add('{');
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = castChunk(obj[key], this);
      if (value !== undefined && value !== 'undefined') {
        if (hasPairs) {
          ret.add(',');
        }
        ret.add(this.quotedString(key));
        ret.add(':');
        ret.add(value);
        hasPairs = true;
      }
    }

    ret.add('}');
    return ret;
  }

  /**
   * @param {unknown[]} entries
   * @returns {SourceNode}
   */
  generateList(entries) {
    const ret = this.empty();

    for (let i = 0; i < entries.length; i++) {
      if (i) {
        ret.add(',');
      }

      ret.add(castChunk(entries[i], this));
    }

    return ret;
  }

  /**
   * @param {unknown[]} entries
   * @returns {SourceNode}
   */
  generateArray(entries) {
    const ret = this.generateList(entries);
    ret.prepend('[');
    ret.add(']');
    return ret;
  }
}
