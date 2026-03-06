import WhitespaceControl from '#handlebars/compiler/whitespace-control';

const HASH_KEY = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;

class TokenStream {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset];
  }

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

  done() {
    return this.index >= this.tokens.length;
  }
}

class ParserState {
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
    const nextTagIndex = this.input.indexOf('{{', this.index);
    const endIndex = nextTagIndex === -1 ? this.length : nextTagIndex;
    const value = this.input.slice(this.index, endIndex);
    this.index = endIndex;
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

    if (trimmed.startsWith('#')) {
      return {
        node: this.parseBlock(content, openStrip, closeStrip, 'BlockStatement'),
        control: null
      };
    }

    if (trimmed.startsWith('else ')) {
      return {
        node: null,
        control: {
          type: 'ELSE_CHAIN',
          ...parseBlockInvocation(trimmed.slice(5), true),
          strip: { open: openStrip, close: closeStrip }
        }
      };
    }

    if (trimmed === 'else') {
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
    const openBlock = parseBlockInvocation(source, allowBlockParams);
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

    return {
      type,
      path: openBlock.invocation.path,
      params: openBlock.invocation.params,
      hash: openBlock.invocation.hash,
      program: createProgram(parsed.body, openBlock.blockParams),
      inverse,
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

    if (
      closeControl.type !== 'BLOCK_END' ||
      closeControl.name.original !== control.invocation.path.original
    ) {
      throw new Error(
        `${control.invocation.path.original} doesn't match ${closeControl.name.original}`
      );
    }

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
      openStrip: { open: openStrip, close: closeStrip },
      inverseStrip: {},
      closeStrip: rawClose.strip
    };
  }

  readUntilTagClose(closeDelimiter) {
    let cursor = this.index;
    let quote = null;
    let depth = 0;

    while (cursor < this.length) {
      const char = this.input[cursor];
      if (quote) {
        if (char === '\\') {
          cursor += 2;
          continue;
        }
        if (char === quote) {
          quote = null;
        }
        cursor += 1;
        continue;
      }

      if (char === '"' || char === '\'') {
        quote = char;
        cursor += 1;
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

      if (depth === 0 && this.input.startsWith(`~${closeDelimiter}`, cursor)) {
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
        strip: { open: openStrip, close: closeStrip }
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
  let quote = null;
  let depth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
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

    if (depth !== 0 || char !== '|') {
      continue;
    }

    const asIndex = findBlockParamAsIndex(source, index);
    if (asIndex === -1) {
      continue;
    }

    const endIndex = source.indexOf('|', index + 1);
    if (endIndex === -1) {
      break;
    }

    const blockParamsSource = source.slice(index + 1, endIndex).trim();
    return {
      invocationSource: source.slice(0, asIndex).trim(),
      blockParams: blockParamsSource ? blockParamsSource.split(/\s+/) : []
    };
  }

  return {
    invocationSource: source.trim(),
    blockParams: undefined
  };
}

function findBlockParamAsIndex(source, pipeIndex) {
  let index = pipeIndex - 1;
  while (index >= 0 && /\s/.test(source[index])) {
    index -= 1;
  }

  if (index < 1 || source.slice(index - 1, index + 1) !== 'as') {
    return -1;
  }

  if (index > 1 && !/\s/.test(source[index - 2])) {
    return -1;
  }

  return index - 1;
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
  const source = data ? raw.slice(1) : raw;
  const tokens = tokenizePath(source);
  const parts = [];
  let depth = 0;

  for (const token of tokens) {
    const { part } = token;
    if (part === '..' || part === '.' || part === 'this') {
      if (parts.length > 0) {
        throw new Error(`Invalid path: ${raw}`);
      }
      if (part === '..') {
        depth += 1;
      }
      continue;
    }
    parts.push(part);
  }

  return {
    type: 'PathExpression',
    data,
    depth,
    parts,
    original: raw
  };
}

function tokenize(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
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
      const quote = char;
      index += 1;
      let value = '';
      while (index < source.length) {
        const current = source[index];
        if (current === '\\') {
          const next = source[index + 1];
          value += next;
          index += 2;
          continue;
        }
        if (current === quote) {
          index += 1;
          break;
        }
        value += current;
        index += 1;
      }
      tokens.push({ type: 'string', value });
      continue;
    }

    let end = index;
    let bracketDepth = 0;
    while (
      end < source.length &&
      (bracketDepth > 0 ||
        !/\s/.test(source[end]) &&
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
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
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

function tokenizePath(path) {
  const parts = [];
  let index = 0;
  let segment = '';

  while (index < path.length) {
    const char = path[index];

    if (char === '[') {
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
      if (segment || char === '/' || path === '.' || path === '..' || path === 'this') {
        if (segment) {
          parts.push({ part: segment });
          segment = '';
        }
      }
      index += 1;
      continue;
    }

    segment += char;
    index += 1;
  }

  if (segment) {
    parts.push({ part: segment });
  }

  if (parts.length === 0 && (path === '.' || path === '..' || path === 'this')) {
    return [{ part: path }];
  }

  return parts;
}

export function parseWithoutProcessing(input, options) {
  if (input?.type === 'Program') {
    return input;
  }

  const ast = new ParserState(String(input ?? '')).parse();
  ast.source = options?.srcName;
  return ast;
}

export function parse(input, options) {
  const ast = parseWithoutProcessing(input, options);
  const strip = new WhitespaceControl(options);
  return strip.accept(ast);
}

export default {
  parse,
  parseWithoutProcessing
};
