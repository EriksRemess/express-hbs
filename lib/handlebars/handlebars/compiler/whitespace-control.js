import Visitor from '#handlebars/compiler/visitor';

function isPrevWhitespace(body, i, isRoot) {
  if (i === undefined) {
    i = body.length;
  }

  const prev = body[i - 1];
  const sibling = body[i - 2];
  if (!prev) {
    return isRoot;
  }

  if (prev.type === 'ContentStatement') {
    return (sibling || !isRoot ? /\r?\n\s*?$/ : /(^|\r?\n)\s*?$/).test(
      prev.original
    );
  }
}

function isNextWhitespace(body, i, isRoot) {
  if (i === undefined) {
    i = -1;
  }

  const next = body[i + 1];
  const sibling = body[i + 2];
  if (!next) {
    return isRoot;
  }

  if (next.type === 'ContentStatement') {
    return (sibling || !isRoot ? /^\s*?\r?\n/ : /^\s*?(\r?\n|$)/).test(
      next.original
    );
  }
}

function omitRight(body, i, multiple) {
  const current = body[i == null ? 0 : i + 1];
  if (
    !current ||
    current.type !== 'ContentStatement' ||
    !multiple && current.rightStripped
  ) {
    return;
  }

  const original = current.value;
  current.value = current.value.replace(
    multiple ? /^\s+/ : /^[ \t]*\r?\n?/,
    ''
  );
  current.rightStripped = current.value !== original;
}

function omitLeft(body, i, multiple) {
  const current = body[i == null ? body.length - 1 : i - 1];
  if (
    !current ||
    current.type !== 'ContentStatement' ||
    !multiple && current.leftStripped
  ) {
    return;
  }

  const original = current.value;
  current.value = current.value.replace(multiple ? /\s+$/ : /[ \t]+$/, '');
  current.leftStripped = current.value !== original;
  return current.leftStripped;
}

export default class WhitespaceControl extends Visitor {
  constructor(options = {}) {
    super();
    this.options = options;
  }

  Program(program) {
    const doStandalone = !this.options.ignoreStandalone;
    const isRoot = !this.isRootSeen;
    this.isRootSeen = true;

    const body = program.body;
    for (let i = 0; i < body.length; i++) {
      const current = body[i];
      const strip = this.accept(current);

      if (!strip) {
        continue;
      }

      const isPrev = isPrevWhitespace(body, i, isRoot);
      const isNext = isNextWhitespace(body, i, isRoot);
      const openStandalone = strip.openStandalone && isPrev;
      const closeStandalone = strip.closeStandalone && isNext;
      const inlineStandalone = strip.inlineStandalone && isPrev && isNext;

      if (strip.close) {
        omitRight(body, i, true);
      }
      if (strip.open) {
        omitLeft(body, i, true);
      }

      if (doStandalone && inlineStandalone) {
        omitRight(body, i);

        if (omitLeft(body, i) && current.type === 'PartialStatement') {
          current.indent = /([ \t]+$)/.exec(body[i - 1].original)[1];
        }
      }
      if (doStandalone && openStandalone) {
        omitRight((current.program || current.inverse).body);
        omitLeft(body, i);
      }
      if (doStandalone && closeStandalone) {
        omitRight(body, i);
        omitLeft((current.inverse || current.program).body);
      }
    }

    return program;
  }

  BlockStatement(block) {
    return this.visitBlockLike(block);
  }

  DecoratorBlock(block) {
    return this.visitBlockLike(block);
  }

  PartialBlockStatement(block) {
    return this.visitBlockLike(block);
  }

  visitBlockLike(block) {
    this.accept(block.program);
    this.accept(block.inverse);

    const program = block.program || block.inverse;
    const inverse = block.program && block.inverse;
    let firstInverse = inverse;
    let lastInverse = inverse;

    if (inverse?.chained) {
      firstInverse = inverse.body[0].program;
      while (lastInverse.chained) {
        lastInverse = lastInverse.body[lastInverse.body.length - 1].program;
      }
    }

    const strip = {
      open: block.openStrip.open,
      close: block.closeStrip.close,
      openStandalone: isNextWhitespace(program.body),
      closeStandalone: isPrevWhitespace((firstInverse || program).body)
    };

    if (block.openStrip.close) {
      omitRight(program.body, null, true);
    }

    if (inverse) {
      const inverseStrip = block.inverseStrip;

      if (inverseStrip.open) {
        omitLeft(program.body, null, true);
      }
      if (inverseStrip.close) {
        omitRight(firstInverse.body, null, true);
      }
      if (block.closeStrip.open) {
        omitLeft(lastInverse.body, null, true);
      }

      if (
        !this.options.ignoreStandalone &&
        isPrevWhitespace(program.body) &&
        isNextWhitespace(firstInverse.body)
      ) {
        omitLeft(program.body);
        omitRight(firstInverse.body);
      }
    } else if (block.closeStrip.open) {
      omitLeft(program.body, null, true);
    }

    return strip;
  }

  Decorator(mustache) {
    return mustache.strip;
  }

  MustacheStatement(mustache) {
    return mustache.strip;
  }

  PartialStatement(node) {
    return this.visitStandaloneNode(node);
  }

  CommentStatement(node) {
    return this.visitStandaloneNode(node);
  }

  visitStandaloneNode(node) {
    const strip = node.strip ?? {};
    return {
      inlineStandalone: true,
      open: strip.open,
      close: strip.close
    };
  }
}
