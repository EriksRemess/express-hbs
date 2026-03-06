import { isArray } from '#handlebars/utils';

class SourceNode {
  constructor(line, column, srcFile, chunks) {
    this.src = '';
    if (chunks) {
      this.add(chunks);
    }
  }

  add(chunks) {
    if (isArray(chunks)) {
      chunks = chunks.join('');
    }
    this.src += chunks;
  }

  prepend(chunks) {
    if (isArray(chunks)) {
      chunks = chunks.join('');
    }
    this.src = chunks + this.src;
  }

  toStringWithSourceMap() {
    return { code: this.toString() };
  }

  toString() {
    return this.src;
  }
}

function castChunk(chunk, codeGen, loc) {
  if (isArray(chunk)) {
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

export default class CodeGen {
  constructor(srcFile) {
    this.srcFile = srcFile;
    this.source = [];
  }

  isEmpty() {
    return !this.source.length;
  }

  prepend(source, loc) {
    this.source.unshift(this.wrap(source, loc));
  }

  push(source, loc) {
    this.source.push(this.wrap(source, loc));
  }

  merge() {
    const source = this.empty();
    this.each(line => {
      source.add(['  ', line, '\n']);
    });
    return source;
  }

  each(iter) {
    for (const line of this.source) {
      iter(line);
    }
  }

  empty() {
    const loc = this.currentLocation || { start: {} };
    return new SourceNode(loc.start.line, loc.start.column, this.srcFile);
  }

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

  functionCall(fn, type, params) {
    const list = this.generateList(params);
    return this.wrap([fn, type ? `.${type}(` : '(', list, ')']);
  }

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

  generateArray(entries) {
    const ret = this.generateList(entries);
    ret.prepend('[');
    ret.add(']');
    return ret;
  }
}
