import Exception from '#handlebars/exception';

function validateClose(open, close) {
  close = close.path ? close.path.original : close;

  if (open.path.original !== close) {
    throw new Exception(`${open.path.original} doesn't match ${close}`, {
      loc: open.path.loc
    });
  }
}

export class SourceLocation {
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

export function id(token) {
  if (/^\[.*\]$/.test(token)) {
    return token.substring(1, token.length - 1);
  }

  return token;
}

export function stripFlags(open, close) {
  return {
    open: open[2] === '~',
    close: close.at(-3) === '~'
  };
}

export function stripComment(comment) {
  return comment.replace(/^\{\{~?!-?-?/, '').replace(/-?-?~?\}\}$/, '');
}

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
