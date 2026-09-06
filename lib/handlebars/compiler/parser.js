import WhitespaceControl from '#handlebars/compiler/whitespace-control';
import Exception from '#handlebars/exception';

const HASH_KEY = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;
const NUMBER_LITERAL = /^-?\d+(?:\.\d+)?$/;
const WHITESPACE = /\s/;
const WHITESPACE_SEQUENCE = /\s+/;

/**
 * Lightweight token iterator used by the expression parser.
 */
class TokenStream {
  /**
   * @param {object[]} tokens
   */
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  /**
   * @param {number} offset
   * @returns {object | undefined}
   */
  peek(offset = 0) {
    return this.tokens[this.index + offset];
  }

  /**
   * @param {string} expectedType
   * @returns {object}
   */
  consume(expectedType) {
    const token = this.tokens[this.index];
    if (!token) {
      throw new Error('Unexpected end of expression');
    }
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but received ${token.type}`);
    }
    this.index += 1;
    return token;
  }

  /**
   * @returns {boolean}
   */
  done() {
    return this.index >= this.tokens.length;
  }
}

/**
 * Template parser that builds the local Handlebars AST.
 */
class ParserState {
  /**
   * @param {string} input
   */
  constructor(input) {
    this.input = input;
    this.length = input.length;
    this.index = 0;
  }

  parse() {
    const { body, control } = this.parseStatements();
    if (control) {
      throw new Error(`Unexpected ${control.type.toLowerCase()} tag`);
    }
    return createProgram(body);
  }

  parseStatements() {
    const body = [];

    while (!this.done()) {
      if (this.startsWith('{{')) {
        const tag = this.parseTag();
        if (tag.control) {
          return { body, control: tag.control };
        }
        body.push(tag.node);
        continue;
      }

      body.push(this.parseContent());
    }

    return { body, control: null };
  }

  parseContent() {
    let value = '';
    while (!this.done()) {
      const nextTagIndex = this.input.indexOf('{{', this.index);
      if (nextTagIndex === -1) {
        value += this.input.slice(this.index);
        this.index = this.length;
        break;
      }

      const prefix = this.input.slice(this.index, nextTagIndex);
      if (!prefix.endsWith('\\')) {
        value += prefix;
        this.index = nextTagIndex;
        break;
      }

      // Handlebars removes one backslash before a tag. Two or more leave
      // the tag active; a single backslash makes its opening braces literal.
      value += prefix.slice(0, -1);
      this.index = nextTagIndex;
      if (prefix.endsWith('\\\\')) {
        break;
      }
      value += '{{';
      this.index += 2;
    }
    return {
      type: 'ContentStatement',
      original: value,
      value
    };
  }

  parseTag() {
    if (this.startsWith('{{!--')) {
      return {
        node: this.parseCommentBlock(),
        control: null
      };
    }

    if (this.startsWith('{{{{')) {
      if (this.startsWith('{{{{/')) {
        throw new Error('Unexpected raw block end tag');
      }

      return {
        node: this.parseRawBlock(),
        control: null
      };
    }

    if (this.startsWith('{{{')) {
      return {
        node: this.parseMustacheTag(true),
        control: null
      };
    }

    this.index += 2;
    const openStrip = this.consumeOptional('~');
    const { content, closeStrip } = this.readUntilTagClose('}}');
    const trimmed = content.trim();

    if (trimmed.startsWith('!')) {
      return {
        node: {
          type: 'CommentStatement',
          value: content.slice(content.indexOf('!') + 1),
          strip: { open: openStrip, close: closeStrip }
        },
        control: null
      };
    }

    if (trimmed.startsWith('#>')) {
      return {
        node: this.parseBlock(content, openStrip, closeStrip, 'PartialBlockStatement'),
        control: null
      };
    }

    if (trimmed.startsWith('#*')) {
      return {
        node: this.parseBlock(content, openStrip, closeStrip, 'DecoratorBlock'),
        control: null
      };
    }

    if (trimmed.startsWith('#') || trimmed.startsWith('^') && trimmed !== '^') {
      return {
        node: this.parseBlock(content, openStrip, closeStrip, 'BlockStatement'),
        control: null
      };
    }

    if (trimmed.startsWith('else') && isWhitespace(trimmed[4] ?? '')) {
      return {
        node: null,
        control: {
          type: 'ELSE_CHAIN',
          ...parseBlockInvocation(trimmed.slice(4).trim(), true),
          strip: { open: openStrip, close: closeStrip }
        }
      };
    }

    if (trimmed === 'else' || trimmed === '^') {
      return {
        node: null,
        control: {
          type: 'ELSE',
          strip: { open: openStrip, close: closeStrip }
        }
      };
    }

    if (trimmed.startsWith('/')) {
      const name = parsePathExpression(trimmed.slice(1).trim());
      return {
        node: null,
        control: {
          type: 'BLOCK_END',
          name,
          strip: { open: openStrip, close: closeStrip }
        }
      };
    }

    if (trimmed.startsWith('>')) {
      return {
        node: this.parsePartial(content, openStrip, closeStrip),
        control: null
      };
    }

    if (trimmed.startsWith('*')) {
      return {
        node: this.parseMustacheFromContent(content.slice(content.indexOf('*') + 1), {
          open: openStrip,
          close: closeStrip
        }, true, 'Decorator'),
        control: null
      };
    }

    if (trimmed.startsWith('&')) {
      return {
        node: this.parseMustacheFromContent(content.slice(content.indexOf('&') + 1), {
          open: openStrip,
          close: closeStrip
        }, false),
        control: null
      };
    }

    return {
      node: this.parseMustacheFromContent(content, {
        open: openStrip,
        close: closeStrip
      }, true),
      control: null
    };
  }

  parseCommentBlock() {
    this.index += 5;
    const endIndex = this.input.indexOf('--}}', this.index);
    if (endIndex === -1) {
      throw new Error('Unterminated Handlebars comment');
    }
    const value = this.input.slice(this.index, endIndex);
    this.index = endIndex + 4;
    return {
      type: 'CommentStatement',
      value,
      strip: { open: false, close: false }
    };
  }

  parseMustacheTag() {
    this.index += 3;
    const { content } = this.readUntilTripleClose();
    return this.parseMustacheFromContent(content, { open: false, close: false }, false);
  }

  parseMustacheFromContent(content, strip, escaped, type = 'MustacheStatement') {
    const invocation = parseInvocation(content.trim());
    assertInvocationPath(invocation.path);
    return {
      type,
      path: invocation.path,
      params: invocation.params,
      hash: invocation.hash,
      escaped,
      strip
    };
  }

  parsePartial(content, openStrip, closeStrip) {
    const invocation = parseInvocation(content.trim().slice(1).trim());
    return {
      type: 'PartialStatement',
      name: invocation.path,
      params: invocation.params,
      hash: invocation.hash,
      indent: '',
      strip: { open: openStrip, close: closeStrip }
    };
  }

  parseBlock(content, openStrip, closeStrip, type) {
    const allowBlockParams = type === 'BlockStatement';
    const source = content.trim().slice(getBlockPrefixLength(type)).trim();
    const inverted = content.trim().startsWith('^');
    const openBlock = parseBlockInvocation(source, allowBlockParams);
    assertInvocationPath(openBlock.invocation.path);
    const parsed = this.parseStatements();

    if (!parsed.control) {
      throw new Error(`Missing closing tag for ${openBlock.invocation.path.original}`);
    }

    let inverse;
    let inverseStrip;
    let closeControl = parsed.control;

    if (parsed.control.type === 'ELSE') {
      inverseStrip = parsed.control.strip;
      const inverseResult = this.parseStatements();
      if (!inverseResult.control || inverseResult.control.type !== 'BLOCK_END') {
        throw new Error(`Missing closing tag for ${openBlock.invocation.path.original}`);
      }
      inverse = createProgram(inverseResult.body);
      closeControl = inverseResult.control;
    }

    if (parsed.control.type === 'ELSE_CHAIN') {
      inverseStrip = parsed.control.strip;
      const chain = this.parseChainedBlock(parsed.control);
      inverse = createChainedProgram(chain.block);
      closeControl = chain.closeControl;
    }

    if (
      closeControl.type !== 'BLOCK_END' ||
      closeControl.name.original !== openBlock.invocation.path.original
    ) {
      throw new Error(
        `${openBlock.invocation.path.original} doesn't match ${closeControl.name.original}`
      );
    }

    if (type === 'PartialBlockStatement') {
      return {
        type,
        name: openBlock.invocation.path,
        params: openBlock.invocation.params,
        hash: openBlock.invocation.hash,
        program: createProgram(parsed.body),
        openStrip: { open: openStrip, close: closeStrip },
        closeStrip: closeControl.strip
      };
    }

    const program = createProgram(parsed.body, openBlock.blockParams);
    return {
      type,
      path: openBlock.invocation.path,
      params: openBlock.invocation.params,
      hash: openBlock.invocation.hash,
      program: inverted ? inverse : program,
      inverse: inverted ? program : inverse,
      openStrip: { open: openStrip, close: closeStrip },
      inverseStrip,
      closeStrip: closeControl.strip
    };
  }

  parseChainedBlock(control) {
    const parsed = this.parseStatements();

    if (!parsed.control) {
      throw new Error(`Missing closing tag for ${control.invocation.path.original}`);
    }

    let inverse;
    let inverseStrip;
    let closeControl = parsed.control;

    if (parsed.control.type === 'ELSE') {
      inverseStrip = parsed.control.strip;
      const inverseResult = this.parseStatements();
      if (!inverseResult.control || inverseResult.control.type !== 'BLOCK_END') {
        throw new Error(`Missing closing tag for ${control.invocation.path.original}`);
      }
      inverse = createProgram(inverseResult.body);
      closeControl = inverseResult.control;
    }

    if (parsed.control.type === 'ELSE_CHAIN') {
      inverseStrip = parsed.control.strip;
      const chain = this.parseChainedBlock(parsed.control);
      inverse = createChainedProgram(chain.block);
      closeControl = chain.closeControl;
    }

    // The enclosing block owns the closing tag, including mixed helper chains.
    return {
      block: {
        type: 'BlockStatement',
        path: control.invocation.path,
        params: control.invocation.params,
        hash: control.invocation.hash,
        program: createProgram(parsed.body, control.blockParams),
        inverse,
        openStrip: control.strip,
        inverseStrip,
        closeStrip: closeControl.strip
      },
      closeControl
    };
  }

  parseRawBlock() {
    this.index += 4;
    const openStrip = this.consumeOptional('~');
    const { content, closeStrip } = this.readUntilTagClose('}}}}');
    const invocation = parseInvocation(content.trim());
    assertInvocationPath(invocation.path);
    const rawClose = this.readRawBlockClose(invocation.path.original);
    const body = rawClose.content
      ? [{
          type: 'ContentStatement',
          original: rawClose.content,
          value: rawClose.content
        }]
      : [];

    return {
      type: 'BlockStatement',
      path: invocation.path,
      params: invocation.params,
      hash: invocation.hash,
      program: createProgram(body),
      openStrip: createRawBlockStrip(openStrip, closeStrip),
      inverseStrip: {},
      closeStrip: rawClose.strip
    };
  }

  readUntilTagClose(closeDelimiter) {
    let cursor = this.index;
    let depth = 0;
    const stripCloseDelimiter = '~' + closeDelimiter;

    while (cursor < this.length) {
      const char = this.input[cursor];
      if (char === '"' || char === '\'') {
        cursor = quotedStringEnd(this.input, cursor) + 1;
        continue;
      }

      if (char === '(') {
        depth += 1;
        cursor += 1;
        continue;
      }

      if (char === ')') {
        depth -= 1;
        cursor += 1;
        continue;
      }

      if (depth === 0 && this.input.startsWith(stripCloseDelimiter, cursor)) {
        const content = this.input.slice(this.index, cursor);
        this.index = cursor + closeDelimiter.length + 1;
        return { content, closeStrip: true };
      }

      if (depth === 0 && this.input.startsWith(closeDelimiter, cursor)) {
        const content = this.input.slice(this.index, cursor);
        this.index = cursor + closeDelimiter.length;
        return { content, closeStrip: false };
      }

      cursor += 1;
    }

    throw new Error(`Unterminated tag: expected ${closeDelimiter}`);
  }

  readUntilTripleClose() {
    const endIndex = this.input.indexOf('}}}', this.index);
    if (endIndex === -1) {
      throw new Error('Unterminated triple-stash');
    }
    const content = this.input.slice(this.index, endIndex);
    this.index = endIndex + 3;
    return { content };
  }

  readRawBlockClose(name) {
    let searchIndex = this.index;

    while (searchIndex < this.length) {
      const startIndex = this.input.indexOf('{{{{', searchIndex);
      if (startIndex === -1) {
        throw new Error(`Missing closing tag for ${name}`);
      }

      let cursor = startIndex + 4;
      const openStrip = this.input[cursor] === '~';
      if (openStrip) {
        cursor += 1;
      }

      if (this.input[cursor] !== '/') {
        searchIndex = startIndex + 4;
        continue;
      }

      cursor += 1;
      const closeStart = cursor;
      const closeTagIndex = this.input.indexOf('}}}}', closeStart);
      if (closeTagIndex === -1) {
        throw new Error(`Missing closing tag for ${name}`);
      }

      const rawClose = this.input.slice(closeStart, closeTagIndex);
      const closeStrip = rawClose.endsWith('~');
      const closeName = parsePathExpression(rawClose.replace(/~$/, '').trim());

      if (closeName.original !== name) {
        searchIndex = startIndex + 4;
        continue;
      }

      const content = this.input.slice(this.index, startIndex);
      this.index = closeTagIndex + 4;
      return {
        content,
        strip: createRawBlockStrip(openStrip, closeStrip)
      };
    }

    throw new Error(`Missing closing tag for ${name}`);
  }

  consumeOptional(char) {
    if (this.input[this.index] !== char) {
      return false;
    }
    this.index += 1;
    return true;
  }

  startsWith(value) {
    return this.input.startsWith(value, this.index);
  }

  done() {
    return this.index >= this.length;
  }
}

function createProgram(body, blockParams) {
  const program = {
    type: 'Program',
    body,
    strip: {}
  };

  if (blockParams !== undefined) {
    program.blockParams = blockParams;
  }

  return program;
}

function createChainedProgram(block) {
  return {
    type: 'Program',
    body: [block],
    chained: true,
    strip: {}
  };
}

function getBlockPrefixLength(type) {
  if (type === 'PartialBlockStatement' || type === 'DecoratorBlock') {
    return 2;
  }

  return 1;
}

function parseBlockInvocation(source, allowBlockParams) {
  const { invocationSource, blockParams } = allowBlockParams
    ? extractBlockParams(source)
    : { invocationSource: source, blockParams: undefined };

  return {
    invocation: parseInvocation(invocationSource),
    blockParams
  };
}

function extractBlockParams(source) {
  let depth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (char === '"' || char === '\'') {
      index = quotedStringEnd(source, index);
      continue;
    }

    if (char === '(') {
      depth += 1;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      continue;
    }

    if (depth !== 0 || char !== 'a' || source[index + 1] !== 's') {
      continue;
    }

    const before = source[index - 1];
    const after = source[index + 2];
    if (before && !isWhitespace(before) || after && !isWhitespace(after) && after !== '|') {
      continue;
    }

    let cursor = index + 2;
    let hasWhitespaceAfterAs = false;
    while (cursor < source.length && isWhitespace(source[cursor])) {
      hasWhitespaceAfterAs = true;
      cursor += 1;
    }

    if (source[cursor] !== '|') {
      continue;
    }

    if (!hasWhitespaceAfterAs) {
      throw new Error('Invalid block params syntax');
    }

    const endIndex = source.indexOf('|', cursor + 1);
    if (endIndex === -1) {
      throw new Error('Invalid block params syntax');
    }

    const blockParamsSource = source.slice(cursor + 1, endIndex).trim();
    if (!blockParamsSource || source.slice(endIndex + 1).trim()) {
      throw new Error('Invalid block params syntax');
    }

    return {
      invocationSource: source.slice(0, index).trim(),
      blockParams: blockParamsSource ? blockParamsSource.split(WHITESPACE_SEQUENCE) : []
    };
  }

  return {
    invocationSource: source.trim(),
    blockParams: undefined
  };
}

function parseInvocation(source) {
  const stream = new TokenStream(tokenize(source));
  const path = parseExpression(stream);
  const params = [];
  const pairs = [];

  while (!stream.done()) {
    const token = stream.peek();
    const next = stream.peek(1);

    if (
      token?.type === 'word' &&
      next?.type === 'equals' &&
      HASH_KEY.test(token.value)
    ) {
      const key = stream.consume('word').value;
      stream.consume('equals');
      pairs.push({
        type: 'HashPair',
        key,
        value: parseExpression(stream)
      });
      continue;
    }

    params.push(parseExpression(stream));
  }

  return {
    path,
    params,
    hash: pairs.length
      ? {
          type: 'Hash',
          pairs
        }
      : undefined
  };
}

function parseExpression(stream) {
  const token = stream.consume();

  if (token.type === 'parenOpen') {
    const invocation = parseInvocationUntil(stream, 'parenClose');
    stream.consume('parenClose');
    return {
      type: 'SubExpression',
      path: invocation.path,
      params: invocation.params,
      hash: invocation.hash
    };
  }

  if (token.type === 'string') {
    return {
      type: 'StringLiteral',
      value: token.value,
      original: token.value
    };
  }

  if (token.type === 'number') {
    const value = Number(token.value);
    return {
      type: 'NumberLiteral',
      value,
      original: value
    };
  }

  if (token.type === 'boolean') {
    const value = token.value === 'true';
    return {
      type: 'BooleanLiteral',
      value,
      original: value
    };
  }

  if (token.type === 'null') {
    return {
      type: 'NullLiteral',
      value: null,
      original: null
    };
  }

  if (token.type === 'undefined') {
    return {
      type: 'UndefinedLiteral',
      value: undefined,
      original: undefined
    };
  }

  if (token.type !== 'word') {
    throw new Error(`Unexpected token ${token.type}`);
  }

  return parsePathExpression(token.value);
}

function parseInvocationUntil(stream, endType) {
  const path = parseExpression(stream);
  assertInvocationPath(path);
  const params = [];
  const pairs = [];

  while (!stream.done() && stream.peek().type !== endType) {
    const token = stream.peek();
    const next = stream.peek(1);

    if (
      token?.type === 'word' &&
      next?.type === 'equals' &&
      HASH_KEY.test(token.value)
    ) {
      const key = stream.consume('word').value;
      stream.consume('equals');
      pairs.push({
        type: 'HashPair',
        key,
        value: parseExpression(stream)
      });
      continue;
    }

    params.push(parseExpression(stream));
  }

  return {
    path,
    params,
    hash: pairs.length
      ? {
          type: 'Hash',
          pairs
        }
      : undefined
  };
}

function parsePathExpression(raw) {
  const data = raw.startsWith('@');
  let source = data ? raw.slice(1) : raw;
  let depth = 0;

  while (source.startsWith('../')) {
    depth += 1;
    source = source.slice(3);
  }

  if (source === '..') {
    depth += 1;
    source = '';
  }

  if (source.startsWith('./')) {
    source = source.slice(2);
  } else if (source === '.') {
    source = '';
  }

  if (source.startsWith('this.')) {
    source = source.slice(5);
  } else if (source.startsWith('this/')) {
    source = source.slice(5);
  } else if (source === 'this') {
    source = '';
  }

  const tokens = tokenizePath(source);
  const parts = [];

  for (const token of tokens) {
    const { part } = token;
    if (part === '..' || part === '.' || part === 'this') {
      throw new Error(`Invalid path: ${raw}`);
    }
    parts.push(part);
  }

  return {
    type: 'PathExpression',
    data,
    depth,
    parts,
    original: canonicalizePathOriginal(raw)
  };
}

function createRawBlockStrip(open, close) {
  if (!open && !close) {
    return {};
  }

  return { open, close };
}

function canonicalizePathOriginal(raw) {
  return raw.includes('[')
    ? raw.replaceAll('[', '').replaceAll(']', '')
    : raw;
}

function assertInvocationPath(path) {
  if (path.type === 'SubExpression') {
    throw new Error('Subexpressions cannot be used as invocation paths');
  }
}

/**
 * Finds a closing quote using Handlebars string-literal semantics.
 * An escaped quote belongs to the value when a later quote can close it;
 * otherwise the last quote closes the string and preserves its backslashes.
 *
 * @param {string} source
 * @param {number} start
 * @returns {number}
 */
function quotedStringEnd(source, start) {
  const quote = source[start];
  let end = source.indexOf(quote, start + 1);
  if (end === -1) {
    throw new Error('Unterminated quoted string');
  }

  while (source[end - 1] === '\\') {
    const next = source.indexOf(quote, end + 1);
    if (next === -1) {
      break;
    }
    end = next;
  }

  return end;
}

function tokenize(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (isWhitespace(char)) {
      index += 1;
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'parenOpen' });
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'parenClose' });
      index += 1;
      continue;
    }

    if (char === '=') {
      tokens.push({ type: 'equals' });
      index += 1;
      continue;
    }

    if (char === '"' || char === '\'') {
      const end = quotedStringEnd(source, index);
      const value = source.slice(index + 1, end).replaceAll('\\' + char, char);
      index = end + 1;
      tokens.push({ type: 'string', value });
      continue;
    }

    let end = index;
    let bracketDepth = 0;
    while (
      end < source.length &&
      (bracketDepth > 0 ||
        !isWhitespace(source[end]) &&
        source[end] !== '(' &&
        source[end] !== ')' &&
        source[end] !== '=')
    ) {
      if (source[end] === '[') {
        bracketDepth += 1;
      } else if (source[end] === ']' && bracketDepth > 0) {
        bracketDepth -= 1;
      }
      end += 1;
    }

    const value = source.slice(index, end);
    tokens.push({
      type: classifyWord(value),
      value
    });
    index = end;
  }

  return tokens;
}

function classifyWord(value) {
  if (NUMBER_LITERAL.test(value)) {
    return 'number';
  }
  if (value === 'true' || value === 'false') {
    return 'boolean';
  }
  if (value === 'null') {
    return 'null';
  }
  if (value === 'undefined') {
    return 'undefined';
  }
  return 'word';
}

function isWhitespace(char) {
  return WHITESPACE.test(char);
}

function tokenizePath(path) {
  const parts = [];
  let index = 0;
  let segment = '';
  let sawSeparator = false;

  while (index < path.length) {
    const char = path[index];

    if (char === '[') {
      if (sawSeparator) {
        sawSeparator = false;
      }

      if (segment) {
        parts.push({ part: segment });
        segment = '';
      }

      const endIndex = path.indexOf(']', index + 1);
      if (endIndex === -1) {
        throw new Error(`Unterminated path literal: ${path}`);
      }

      parts.push({ part: path.slice(index + 1, endIndex) });
      index = endIndex + 1;
      continue;
    }

    if (char === '.' || char === '/') {
      if (sawSeparator || !segment && path[index + 1] !== '[') {
        throw new Error(`Invalid path: ${path}`);
      }

      if (segment) {
        parts.push({ part: segment });
        segment = '';
      }
      sawSeparator = true;
      index += 1;
      continue;
    }

    sawSeparator = false;
    segment += char;
    index += 1;
  }

  if (segment) {
    parts.push({ part: segment });
  }

  if (sawSeparator) {
    throw new Error(`Invalid path: ${path}`);
  }

  return parts;
}

/**
 * Parses a template string into an AST without running whitespace control.
 *
 * @param {string | { type: string }} input
 * @param {{ srcName?: string }} options
 * @returns {object}
 */
export function parseWithoutProcessing(input, options) {
  if (isProgramAst(input)) {
    validateInputAst(input);
    return input;
  }

  const ast = new ParserState(String(input ?? '')).parse();
  ast.source = options?.srcName;
  return ast;
}

/**
 * Parses a template string into an AST and applies whitespace control.
 *
 * @param {string | { type: string }} input
 * @param {{ ignoreStandalone?: boolean, srcName?: string }} options
 * @returns {object}
 */
export function parse(input, options) {
  const ast = parseWithoutProcessing(input, options);
  const strip = new WhitespaceControl(options);
  return strip.accept(ast);
}

export default {
  parse,
  parseWithoutProcessing
};

/**
 * Validates user-supplied ASTs before they reach JavaScript code generation.
 *
 * @param {object} ast
 * @returns {void}
 */
function validateInputAst(ast) {
  validateAstNode(ast);
}

/**
 * @param {unknown} node
 * @returns {void}
 */
function validateAstNode(node) {
  if (node == null) {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach(validateAstNode);
    return;
  }

  if (typeof node !== 'object') {
    return;
  }

  const nodeType = Object.hasOwn(Object(node), 'type')
    ? node.type
    : undefined;

  if (nodeType === 'Program') {
    validateProgram(node);
  } else if (nodeType === 'MustacheStatement') {
    validateMustacheStatement(node);
  } else if (nodeType === 'BlockStatement') {
    validateBlockStatement(node);
  } else if (nodeType === 'PartialStatement') {
    validatePartialStatement(node);
  } else if (nodeType === 'PartialBlockStatement') {
    validatePartialBlockStatement(node);
  } else if (nodeType === 'Decorator') {
    validateDecorator(node);
  } else if (nodeType === 'DecoratorBlock') {
    validateDecoratorBlock(node);
  } else if (nodeType === 'ContentStatement') {
    validateContentStatement(node);
  } else if (nodeType === 'CommentStatement') {
    validateCommentStatement(node);
  } else if (nodeType === 'PathExpression') {
    validatePathExpression(node);
  } else if (nodeType === 'SubExpression') {
    validateSubExpression(node);
  } else if (nodeType === 'StringLiteral') {
    validateStringLiteral(node);
  } else if (nodeType === 'NumberLiteral') {
    validateNumberLiteral(node);
  } else if (nodeType === 'BooleanLiteral') {
    validateBooleanLiteral(node);
  } else if (nodeType === 'Hash') {
    validateHash(node);
  } else if (nodeType === 'HashPair') {
    validateHashPair(node);
  } else if (nodeType !== undefined) {
    throw new Exception(`Unknown type: ${nodeType}`, node);
  }

  Object.keys(node).forEach(propertyName => {
    if (propertyName !== 'loc') {
      validateAstNode(node[propertyName]);
    }
  });
}

/**
 * @param {unknown} input
 * @returns {boolean}
 */
function isProgramAst(input) {
  return !!input &&
    typeof input === 'object' &&
    Object.hasOwn(Object(input), 'type') &&
    input.type === 'Program';
}

/**
 * @param {object} node
 * @param {string} propertyName
 * @param {string} label
 * @returns {void}
 */
function requireOwnProperty(node, propertyName, label) {
  if (!Object.hasOwn(Object(node), propertyName)) {
    throw new Exception(`Invalid AST: ${label} must be an own property`);
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {void}
 */
function validateObject(value, label) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Exception(`Invalid AST: ${label} must be an object`);
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {void}
 */
function validateArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Exception(`Invalid AST: ${label} must be an array`);
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {void}
 */
function validateStringArray(value, label) {
  validateArray(value, label);

  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw new Exception(`Invalid AST: ${label} must only contain strings`);
    }
  }
}

/**
 * @param {object} node
 * @param {string} propertyName
 * @param {string} label
 * @returns {unknown}
 */
function requireObjectProperty(node, propertyName, label) {
  requireOwnProperty(node, propertyName, label);
  const value = node[propertyName];
  validateObject(value, label);
  return value;
}

/**
 * @param {object} node
 * @param {string} propertyName
 * @param {string} label
 * @returns {unknown[]}
 */
function requireArrayProperty(node, propertyName, label) {
  requireOwnProperty(node, propertyName, label);
  validateArray(node[propertyName], label);
  return node[propertyName];
}

/**
 * @param {object} node
 * @param {string} label
 * @param {string} pathProperty
 * @returns {void}
 */
function validateInvocation(node, label, pathProperty = 'path') {
  requireObjectProperty(node, pathProperty, `${label}.${pathProperty}`);
  requireArrayProperty(node, 'params', `${label}.params`);

  if (Object.hasOwn(Object(node), 'hash') && node.hash != null) {
    validateObject(node.hash, `${label}.hash`);
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {void}
 */
function validateStripObject(value, label) {
  validateObject(value, label);

  for (const propertyName of ['open', 'close']) {
    if (
      Object.hasOwn(Object(value), propertyName) &&
      typeof value[propertyName] !== 'boolean'
    ) {
      throw new Exception(`Invalid AST: ${label}.${propertyName} must be a boolean`);
    }
  }
}

/**
 * @param {object} node
 * @param {string} propertyName
 * @param {string} label
 * @returns {void}
 */
function requireStripProperty(node, propertyName, label) {
  requireOwnProperty(node, propertyName, label);
  validateStripObject(node[propertyName], label);
}

/**
 * @param {{ body?: unknown }} node
 * @returns {void}
 */
function validateProgram(node) {
  requireOwnProperty(node, 'body', 'Program.body');
  validateArray(node.body, 'Program.body');

  if (Object.hasOwn(Object(node), 'blockParams') && node.blockParams !== undefined) {
    validateStringArray(node.blockParams, 'Program.blockParams');
  }
}

/**
 * @param {{ escaped?: unknown }} node
 * @returns {void}
 */
function validateMustacheStatement(node) {
  validateInvocation(node, 'MustacheStatement');
  requireOwnProperty(node, 'escaped', 'MustacheStatement.escaped');

  if (typeof node.escaped !== 'boolean') {
    throw new Exception('Invalid AST: MustacheStatement.escaped must be a boolean');
  }
}

/**
 * @param {object} node
 * @returns {void}
 */
function validateSubExpression(node) {
  validateInvocation(node, 'SubExpression');
}

/**
 * @param {object} node
 * @returns {void}
 */
function validateBlockStatement(node) {
  validateInvocation(node, 'BlockStatement');
  requireObjectProperty(node, 'program', 'BlockStatement.program');
  if (Object.hasOwn(Object(node), 'inverse') && node.inverse != null) {
    validateObject(node.inverse, 'BlockStatement.inverse');
  }
  requireStripProperty(node, 'openStrip', 'BlockStatement.openStrip');
  requireStripProperty(node, 'closeStrip', 'BlockStatement.closeStrip');
  if (Object.hasOwn(Object(node), 'inverseStrip') && node.inverseStrip != null) {
    validateStripObject(node.inverseStrip, 'BlockStatement.inverseStrip');
  }
}

/**
 * @param {object} node
 * @returns {void}
 */
function validatePartialStatement(node) {
  validateInvocation(node, 'PartialStatement', 'name');
  if (Object.hasOwn(Object(node), 'program') && node.program != null) {
    validateObject(node.program, 'PartialStatement.program');
  }
  if (Object.hasOwn(Object(node), 'indent') && typeof node.indent !== 'string') {
    throw new Exception('Invalid AST: PartialStatement.indent must be a string');
  }
}

/**
 * @param {object} node
 * @returns {void}
 */
function validatePartialBlockStatement(node) {
  validateInvocation(node, 'PartialBlockStatement', 'name');
  requireObjectProperty(node, 'program', 'PartialBlockStatement.program');
  requireStripProperty(node, 'openStrip', 'PartialBlockStatement.openStrip');
  requireStripProperty(node, 'closeStrip', 'PartialBlockStatement.closeStrip');
}

/**
 * @param {object} node
 * @returns {void}
 */
function validateDecorator(node) {
  validateInvocation(node, 'Decorator');
}

/**
 * @param {object} node
 * @returns {void}
 */
function validateDecoratorBlock(node) {
  validateInvocation(node, 'DecoratorBlock');
  requireObjectProperty(node, 'program', 'DecoratorBlock.program');
  requireStripProperty(node, 'openStrip', 'DecoratorBlock.openStrip');
  requireStripProperty(node, 'closeStrip', 'DecoratorBlock.closeStrip');
}

/**
 * @param {{ value?: unknown }} node
 * @returns {void}
 */
function validateContentStatement(node) {
  requireOwnProperty(node, 'value', 'ContentStatement.value');

  if (typeof node.value !== 'string') {
    throw new Exception('Invalid AST: ContentStatement.value must be a string');
  }
}

/**
 * @param {{ value?: unknown }} node
 * @returns {void}
 */
function validateCommentStatement(node) {
  requireOwnProperty(node, 'value', 'CommentStatement.value');
  requireStripProperty(node, 'strip', 'CommentStatement.strip');

  if (typeof node.value !== 'string') {
    throw new Exception('Invalid AST: CommentStatement.value must be a string');
  }
}

/**
 * @param {{ depth?: unknown, parts?: unknown }} node
 * @returns {void}
 */
function validatePathExpression(node) {
  requireOwnProperty(node, 'data', 'PathExpression.data');
  requireOwnProperty(node, 'depth', 'PathExpression.depth');
  requireOwnProperty(node, 'parts', 'PathExpression.parts');
  requireOwnProperty(node, 'original', 'PathExpression.original');

  if (typeof node.data !== 'boolean') {
    throw new Exception('Invalid AST: PathExpression.data must be a boolean');
  }

  if (!isValidDepth(node.depth)) {
    throw new Exception('Invalid AST: PathExpression.depth must be an integer');
  }

  validateStringArray(node.parts, 'PathExpression.parts');

  if (typeof node.original !== 'string') {
    throw new Exception('Invalid AST: PathExpression.original must be a string');
  }
}

/**
 * @param {{ value?: unknown }} node
 * @returns {void}
 */
function validateStringLiteral(node) {
  requireOwnProperty(node, 'value', 'StringLiteral.value');

  if (typeof node.value !== 'string') {
    throw new Exception('Invalid AST: StringLiteral.value must be a string');
  }
}

/**
 * @param {{ value?: unknown }} node
 * @returns {void}
 */
function validateNumberLiteral(node) {
  requireOwnProperty(node, 'value', 'NumberLiteral.value');

  if (typeof node.value !== 'number' || !Number.isFinite(node.value)) {
    throw new Exception('Invalid AST: NumberLiteral.value must be a number');
  }
}

/**
 * @param {{ value?: unknown }} node
 * @returns {void}
 */
function validateBooleanLiteral(node) {
  requireOwnProperty(node, 'value', 'BooleanLiteral.value');

  if (typeof node.value !== 'boolean') {
    throw new Exception('Invalid AST: BooleanLiteral.value must be a boolean');
  }
}

/**
 * @param {{ pairs?: unknown }} node
 * @returns {void}
 */
function validateHash(node) {
  requireOwnProperty(node, 'pairs', 'Hash.pairs');
  validateArray(node.pairs, 'Hash.pairs');
}

/**
 * @param {{ key?: unknown }} node
 * @returns {void}
 */
function validateHashPair(node) {
  requireOwnProperty(node, 'key', 'HashPair.key');
  requireObjectProperty(node, 'value', 'HashPair.value');

  if (typeof node.key !== 'string') {
    throw new Exception('Invalid AST: HashPair.key must be a string');
  }
}

/**
 * @param {unknown} depth
 * @returns {boolean}
 */
function isValidDepth(depth) {
  return Number.isInteger(depth) && depth >= 0;
}
