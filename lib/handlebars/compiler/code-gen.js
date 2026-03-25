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
    const ret = [];

    for (let i = 0; i < chunk.length; i++) {
      ret.push(codeGen.wrap(chunk[i], loc));
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
    this.each(line => {
      source.add(['  ', line, '\n']);
    });
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
    const loc = this.currentLocation || { start: {} };
    return new SourceNode(loc.start.line, loc.start.column, this.srcFile);
  }

  /**
   * @param {unknown} chunk
   * @param {object} loc
   * @returns {SourceNode}
   */
  wrap(chunk, loc = this.currentLocation || { start: {} }) {
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
    return (
      '"' +
      String(str)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029') +
      '"'
    );
  }

  /**
   * @param {Record<string, unknown>} obj
   * @returns {SourceNode}
   */
  objectLiteral(obj) {
    const pairs = [];

    Object.keys(obj).forEach(key => {
      const value = castChunk(obj[key], this);
      if (value !== undefined && value !== 'undefined') {
        pairs.push([this.quotedString(key), ':', value]);
      }
    });

    const ret = this.generateList(pairs);
    ret.prepend('{');
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
