import Exception from '#handlebars/exception';

/**
 * Validates that the closing tag matches the opening tag path.
 *
 * @param {{ path: { original: string, loc?: unknown } }} open
 * @param {{ path?: { original: string } } | string} close
 * @returns {void}
 */
function validateClose(open, close) {
  close = close.path ? close.path.original : close;

  if (open.path.original !== close) {
    throw new Exception(`${open.path.original} doesn't match ${close}`, {
      loc: open.path.loc
    });
  }
}

/**
 * Normalized source location wrapper used by parser helpers.
 */
export class SourceLocation {
  /**
   * @param {string | undefined} source
   * @param {{ first_line: number, first_column: number, last_line: number, last_column: number }} locInfo
   */
  constructor(source, locInfo) {
    this.source = source;
    this.start = {
      line: locInfo.first_line,
      column: locInfo.first_column
    };
    this.end = {
      line: locInfo.last_line,
      column: locInfo.last_column
    };
  }
}

/**
 * Unwraps bracketed path segments used in literal path syntax.
 *
 * @param {string} token
 * @returns {string}
 */
export function id(token) {
  if (/^\[.*\]$/.test(token)) {
    return token.substring(1, token.length - 1);
  }

  return token;
}

/**
 * Extracts standalone whitespace strip flags from opening and closing tokens.
 *
 * @param {string} open
 * @param {string} close
 * @returns {{ open: boolean, close: boolean }}
 */
export function stripFlags(open, close) {
  return {
    open: open[2] === '~',
    close: close.at(-3) === '~'
  };
}

/**
 * Removes Handlebars comment delimiters while preserving inner text.
 *
 * @param {string} comment
 * @returns {string}
 */
export function stripComment(comment) {
  return comment.replace(/^\{\{~?!-?-?/, '').replace(/-?-?~?\}\}$/, '');
}

/**
 * Builds a normalized `PathExpression` node from parsed path segments.
 *
 * @this {{ locInfo(loc: unknown): unknown }}
 * @param {boolean} data
 * @param {{ part: string, original?: string, separator?: string }[]} parts
 * @param {unknown} loc
 * @returns {{ type: string, data: boolean, depth: number, parts: string[], original: string, loc: unknown }}
 */
export function preparePath(data, parts, loc) {
  loc = this.locInfo(loc);

  let original = data ? '@' : '';
  const dig = [];
  let depth = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].part;
    const isLiteral = parts[i].original !== part;
    original += (parts[i].separator || '') + part;

    if (!isLiteral && (part === '..' || part === '.' || part === 'this')) {
      if (dig.length > 0) {
        throw new Exception(`Invalid path: ${original}`, { loc });
      }
      if (part === '..') {
        depth++;
      }
    } else {
      dig.push(part);
    }
  }

  return {
    type: 'PathExpression',
    data,
    depth,
    parts: dig,
    original,
    loc
  };
}

/**
 * Constructs a mustache or decorator AST node from parsed invocation parts.
 *
 * @this {{ locInfo(loc: unknown): unknown }}
 * @param {unknown} path
 * @param {unknown[]} params
 * @param {unknown} hash
 * @param {...unknown} rest
 * @returns {{ type: string, path: unknown, params: unknown[], hash: unknown, escaped: boolean, strip: unknown, loc: unknown }}
 */
export function prepareMustache(path, params, hash, ...rest) {
  const [open, strip, locInfo] = rest;
  const escapeFlag = open[3] || open[2];
  const escaped = escapeFlag !== '{' && escapeFlag !== '&';

  return {
    type: /\*/.test(open) ? 'Decorator' : 'MustacheStatement',
    path,
    params,
    hash,
    escaped,
    strip,
    loc: this.locInfo(locInfo)
  };
}

/**
 * Builds the AST node for a raw block.
 *
 * @this {{ locInfo(loc: unknown): unknown }}
 * @param {{ path: { original: string }, params: unknown[], hash: unknown }} openRawBlock
 * @param {unknown[]} contents
 * @param {unknown} close
 * @param {unknown} locInfo
 * @returns {object}
 */
export function prepareRawBlock(openRawBlock, contents, close, locInfo) {
  validateClose(openRawBlock, close);

  locInfo = this.locInfo(locInfo);
  const program = {
    type: 'Program',
    body: contents,
    strip: {},
    loc: locInfo
  };

  return {
    type: 'BlockStatement',
    path: openRawBlock.path,
    params: openRawBlock.params,
    hash: openRawBlock.hash,
    program,
    openStrip: {},
    inverseStrip: {},
    closeStrip: {},
    loc: locInfo
  };
}

/**
 * Builds the AST node for a normal or decorator block statement.
 *
 * @this {{ locInfo(loc: unknown): unknown }}
 * @param {object} openBlock
 * @param {object} program
 * @param {object | undefined} inverseAndProgram
 * @param {...unknown} rest
 * @returns {object}
 */
export function prepareBlock(openBlock, program, inverseAndProgram, ...rest) {
  let [close, inverted, locInfo] = rest;
  if (close?.path) {
    validateClose(openBlock, close);
  }

  const decorator = /\*/.test(openBlock.open);

  program.blockParams = openBlock.blockParams;

  let inverse;
  let inverseStrip;

  if (inverseAndProgram) {
    if (decorator) {
      throw new Exception('Unexpected inverse block on decorator', inverseAndProgram);
    }

    if (inverseAndProgram.chain) {
      inverseAndProgram.program.body[0].closeStrip = close.strip;
    }

    inverseStrip = inverseAndProgram.strip;
    inverse = inverseAndProgram.program;
  }

  if (inverted) {
    inverted = inverse;
    inverse = program;
    program = inverted;
  }

  return {
    type: decorator ? 'DecoratorBlock' : 'BlockStatement',
    path: openBlock.path,
    params: openBlock.params,
    hash: openBlock.hash,
    program,
    inverse,
    openStrip: openBlock.strip,
    inverseStrip,
    closeStrip: close && close.strip,
    loc: this.locInfo(locInfo)
  };
}

/**
 * Creates a `Program` node and derives a location from its statements when possible.
 *
 * @param {object[]} statements
 * @param {object} loc
 * @returns {{ type: string, body: object[], strip: object, loc: object }}
 */
export function prepareProgram(statements, loc) {
  if (!loc && statements.length) {
    const firstLoc = statements[0].loc;
    const lastLoc = statements.at(-1).loc;

    if (firstLoc && lastLoc) {
      loc = {
        source: firstLoc.source,
        start: {
          line: firstLoc.start.line,
          column: firstLoc.start.column
        },
        end: {
          line: lastLoc.end.line,
          column: lastLoc.end.column
        }
      };
    }
  }

  return {
    type: 'Program',
    body: statements,
    strip: {},
    loc
  };
}

/**
 * Builds the AST node for a partial block statement.
 *
 * @this {{ locInfo(loc: unknown): unknown }}
 * @param {object} open
 * @param {object} program
 * @param {object} close
 * @param {unknown} locInfo
 * @returns {object}
 */
export function preparePartialBlock(open, program, close, locInfo) {
  validateClose(open, close);

  return {
    type: 'PartialBlockStatement',
    name: open.path,
    params: open.params,
    hash: open.hash,
    program,
    openStrip: open.strip,
    closeStrip: close && close.strip,
    loc: this.locInfo(locInfo)
  };
}
