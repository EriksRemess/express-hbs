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
    this.children = [];
    if (chunks !== undefined) {
      this.add(chunks);
    }
  }

  /**
   * @param {string | string[] | SourceNode} chunks
   * @returns {void}
   */
  add(chunks) {
    addChunks(this.children, chunks);
  }

  /**
   * @param {string | string[] | SourceNode} chunks
   * @returns {void}
   */
  prepend(chunks) {
    const children = [];
    addChunks(children, chunks);
    this.children.unshift(...children);
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
    return stringifyChunk(this.children, false) || '';
  }
}

const emptyLocation = { start: {} };
const quotedStringEscapePattern = /[\\\"\n\r\u2028\u2029]/;

/**
 * Appends generated fragments while preserving SourceNode identity for alias rewriting.
 *
 * @param {unknown[]} target
 * @param {unknown} chunks
 * @returns {void}
 */
function addChunks(target, chunks) {
  if (Array.isArray(chunks)) {
    for (let i = 0; i < chunks.length; i++) {
      target.push(chunks[i]);
    }
    return;
  }

  target.push(chunks);
}

/**
 * Converts generated fragments into source text.
 *
 * @param {unknown} chunk
 * @param {boolean} wrapped
 * @returns {string | undefined}
 */
function stringifyChunk(chunk, wrapped) {
  if (Array.isArray(chunk)) {
    let ret = '';

    for (let i = 0; i < chunk.length; i++) {
      const value = stringifyChunk(chunk[i], true);
      if (value !== undefined) {
        ret += value;
      }
    }
    return ret;
  }

  switch (typeof chunk) {
    case 'boolean':
    case 'number':
    case 'bigint':
      return String(chunk);
    case 'undefined':
      return undefined;
    case 'object':
      if (chunk === null) {
        return wrapped ? undefined : 'null';
      }
      return chunk.toString();
    default:
      return chunk.toString();
  }
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
      chunk
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
      const value = stringifyChunk(obj[key], false);
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

      ret.add(entries[i]);
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
