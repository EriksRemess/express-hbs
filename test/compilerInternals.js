import { compile, precompile } from '#handlebars/compiler/compiler';
import { parse, parseWithoutProcessing } from '#handlebars/compiler/parser';
import Visitor from '#handlebars/compiler/visitor';
import WhitespaceControl from '#handlebars/compiler/whitespace-control';
import handlebars from '#handlebars';
import { describe, it } from '#test/testkit';
import upstreamHandlebars from 'handlebars';
import assert from 'node:assert';

const pathExpression = (original) => ({
  type: 'PathExpression',
  data: false,
  depth: 0,
  parts: [original],
  original
});

const stringLiteral = (original) => ({
  type: 'StringLiteral',
  value: original,
  original
});

const content = (value) => ({
  type: 'ContentStatement',
  original: value,
  value
});

const program = (...body) => ({
  type: 'Program',
  body,
  strip: {}
});

function createComparisonRuntime(base) {
  const hb = base.create();

  hb.registerHelper('formatCell', (value, alternate, options) => {
    const hash = options.hash || {};
    return `${hash.label}:${value}:${alternate}:${hash.order}`;
  });
  hb.registerHelper('pick', (value, fallback) => value || fallback);
  hb.registerHelper('inspect', (...args) => args.slice(0, -1).map(String).join('|'));
  hb.registerPartial('card', '<strong>{{name}}</strong>');
  hb.registerPartial('layout', '<main>{{> @partial-block}}</main>');

  return hb;
}

describe('compiler internals', () => {
  it('validates inputs and exposes lazy compile wrapper methods', () => {
    assert.throws(() => precompile(null), /You must pass a string or Handlebars AST to Handlebars.precompile/);
    assert.throws(() => compile(undefined), /You must pass a string or Handlebars AST to Handlebars.compile/);

    const hb = handlebars.create();
    const setupTemplate = compile('{{#if ok}}yes{{/if}}', {}, hb);
    assert.equal(
      setupTemplate._setup({
        helpers: hb.helpers,
        partials: hb.partials,
        decorators: hb.decorators,
        data: {}
      }),
      undefined
    );

    const childTemplate = compile('{{#if ok}}yes{{/if}}', {}, hb);
    const child = childTemplate._child(0, {});
    assert.equal(typeof child, 'function');
    assert.equal(child({}, { data: {} }), 'yes');

    const isolatedTemplate = compile('{{#if ok}}yes{{/if}}', {}, hb);
    const isolated = isolatedTemplate._getIsolatedPartialState({});
    assert.equal(typeof isolated.helpers.if, 'function');
    assert.equal(typeof isolated.hooks.helperMissing, 'function');

    const template = compile('{{#if ok}}yes{{/if}}', {}, hb);
    assert.equal(
      template({ ok: true }),
      'yes'
    );
  });

  it('ignores prototype-polluted compile option defaults', () => {
    Object.defineProperty(Object.prototype, 'noEscape', {
      configurable: true,
      value: true
    });

    try {
      const hb = handlebars.create();
      assert.equal(hb.compile('{{value}}')({ value: '<b>' }), '&lt;b&gt;');
      assert.match(precompile('{{value}}'), /escapeExpression/);
    } finally {
      delete Object.prototype.noEscape;
    }
  });

  it('preserves aliasable source nodes in generated code', () => {
    const spec = precompile('{{name}}{{kind}}{{name}}{{kind}}');

    assert.match(spec, /alias\d+=depth0 != null \? depth0 : \(container\.nullContext \|\| {}\)/);
    assert.match(spec, /alias\d+=container\.hooks\.helperMissing/);
    assert.match(spec, /alias\d+="function"/);
    assert.match(spec, /alias\d+=container\.escapeExpression/);
  });

  it('covers helper resolution, partial compilation options, and decorator paths', () => {
    const hb = handlebars.create();
    hb.registerHelper('echo', value => value);
    hb.registerPartial('show', '{{#if this}}{{this}}{{else}}EMPTY{{/if}}');
    hb.registerPartial('greeting', 'Hello');
    hb.registerPartial('layout', '<div>{{> @partial-block}}</div>');

    assert.equal(
      hb.compile('{{echo value}}', {
        knownHelpersOnly: true,
        knownHelpers: { echo: true }
      })({ value: 'ok' }),
      'ok'
    );

    assert.throws(
      () => hb.compile('{{missing value}}', { knownHelpersOnly: true })({ value: 'x' }),
      /unknown helper missing/
    );

    assert.equal(hb.compile('{{value}}', { noEscape: true })({ value: '<b>' }), '<b>');
    assert.equal(hb.compile('{{> show}}')('Ada'), 'Ada');
    assert.equal(hb.compile('{{> show}}', { explicitPartialContext: true })('Ada'), 'EMPTY');
    assert.throws(() => hb.compile('{{> show a b}}')({ a: 1, b: 2 }), /Unsupported number of partial arguments: 2/);

    assert.equal(hb.compile('{{#*inline "p"}}In{{/inline}}{{> p}}')({}), 'In');
    assert.equal(hb.compile('{{#> layout}}Body{{/layout}}')({}), '<div>Body</div>');
    assert.throws(
      () => hb.compile('{{*missing}}')({}),
      /Missing decorator: "missing"/
    );
    assert.equal(hb.compile('{{> (lookup . "which")}}')({ which: 'greeting' }), 'Hello');
  });

  it('covers compiler mode semantics that commonly regress', () => {
    const hb = handlebars.create();

    assert.equal(
      hb.compile('{{callable}}')({
        name: 'Ada',
        callable() {
          return this.name;
        }
      }),
      'Ada'
    );

    assert.equal(
      hb.compile('{{#with child}}{{rootValue}}{{/with}}')({
        rootValue: 'ROOT',
        child: {}
      }),
      ''
    );
    assert.equal(
      hb.compile('{{#with child}}{{rootValue}}{{/with}}', { compat: true })({
        rootValue: 'ROOT',
        child: {}
      }),
      'ROOT'
    );

    assert.equal(
      hb.compile('{{user.name}}')({}),
      ''
    );
    assert.equal(
      hb.compile('{{user.name}}', { assumeObjects: true })({
        user: { name: 'Ada' }
      }),
      'Ada'
    );
    assert.throws(
      () => hb.compile('{{#if user.name}}yes{{/if}}', { assumeObjects: true })({}),
      /Cannot read properties of undefined/
    );

    let getterCalls = 0;
    const root = { child: {} };
    Object.defineProperty(root, 'changing', {
      get() {
        getterCalls += 1;
        return getterCalls === 1 ? 'first' : 'second';
      }
    });
    assert.equal(
      hb.compile('{{#with child}}{{changing}}{{/with}}', { compat: true })(root),
      'first'
    );

    let reads = 0;
    const contextWithGetter = { child: {} };
    Object.defineProperty(contextWithGetter, 'secret', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? 'safe' : 'unsafe';
      }
    });
    assert.equal(
      hb.compile('{{#with child}}{{secret}}{{/with}}', { compat: true })(contextWithGetter),
      'safe'
    );
    assert.equal(reads, 1);

    assert.throws(
      () => hb.compile('{{user.name}}', { strict: true })({}),
      /"name" not defined in undefined/
    );
  });

  it('renders representative templates like upstream Handlebars', () => {
    const cases = [
      {
        name: 'escaped and triple mustaches',
        source: 'Hello {{name}} {{{html}}}',
        context: { name: '<Ada>', html: '<b>ok</b>' }
      },
      {
        name: 'if else',
        source: '{{#if ok}}yes{{else}}no{{/if}}',
        context: { ok: false }
      },
      {
        name: 'else-if chain',
        source: '{{#if a}}A{{else if b}}B{{else}}C{{/if}}',
        context: { a: false, b: true }
      },
      {
        name: 'each with block params',
        source: '{{#each items as |item|}}{{@index}}:{{item.name}};{{/each}}',
        context: { items: [{ name: 'a' }, { name: 'b' }] }
      },
      {
        name: 'with parent depth',
        source: '{{#with child}}{{../name}}/{{name}}{{/with}}',
        context: { name: 'root', child: { name: 'child' } }
      },
      {
        name: 'parent depth data',
        source: '{{#each rows}}{{#each cols}}{{@../index}}:{{@index}};{{/each}}{{/each}}',
        context: { rows: [{ cols: [1, 2] }, { cols: [3] }] }
      },
      {
        name: 'helper params hashes and subexpressions',
        source: '{{formatCell (pick primary fallback) alt label="cell" order=2}}',
        context: { primary: '', fallback: 'fallback', alt: 'ALT' }
      },
      {
        name: 'partial',
        source: 'Hello {{> card}}',
        context: { name: 'Ada' }
      },
      {
        name: 'dynamic partial',
        source: '{{> (lookup . "which")}}',
        context: { which: 'card', name: 'Grace' }
      },
      {
        name: 'inline partial',
        source: '{{#*inline "row"}}{{name}}{{/inline}}{{> row}}',
        context: { name: 'Lin' }
      },
      {
        name: 'partial block',
        source: '{{#> layout}}Body {{name}}{{/layout}}',
        context: { name: 'Mae' }
      },
      {
        name: 'bracket path literal',
        source: '{{foo.[bar baz]}}',
        context: { foo: { 'bar baz': 'ok' } }
      },
      {
        name: 'literals',
        source: '{{inspect true false null undefined 12 -3 4.5}}',
        context: {}
      },
      {
        name: 'whitespace control',
        source: 'a {{~name~}} b',
        context: { name: 'X' }
      }
    ];

    for (const sample of cases) {
      const fork = createComparisonRuntime(handlebars);
      const upstream = createComparisonRuntime(upstreamHandlebars);

      assert.equal(
        fork.compile(sample.source)(sample.context),
        upstream.compile(sample.source)(sample.context),
        sample.name
      );
    }
  });

  it('supports stringParams and trackIds together for params and hashes', () => {
    const hb = handlebars.create();
    let captured;
    hb.registerHelper('inspect', function(...args) {
      const options = args.pop();
      captured = {
        args,
        types: options.types,
        ids: options.ids,
        contexts: options.contexts,
        hash: options.hash,
        hashTypes: options.hashTypes,
        hashIds: options.hashIds,
        hashContexts: options.hashContexts
      };
      return 'ok';
    });
    hb.registerHelper('id', value => value);

    const context = {
      foo: 'FOO',
      nested: { value: 'NV' },
      bar: 'BAR',
      baz: 'BAZ'
    };

    const first = hb.compile(
      '{{inspect foo "x" 1 true undefined null nested.value key=bar lit=false}}',
      { stringParams: true, trackIds: true }
    );
    assert.equal(first(context), 'ok');
    assert.deepEqual(captured.args, ['foo', 'x', 1, true, '', '', 'nested.value']);
    assert.deepEqual(captured.types, [
      'PathExpression',
      'StringLiteral',
      'NumberLiteral',
      'BooleanLiteral',
      'UndefinedLiteral',
      'NullLiteral',
      'PathExpression'
    ]);
    assert.deepEqual(captured.ids, ['foo', null, null, null, null, null, 'nested.value']);
    assert.equal(captured.hash.key, 'bar');
    assert.equal(captured.hash.lit, false);
    assert.equal(captured.hashTypes.key, 'PathExpression');
    assert.equal(captured.hashTypes.lit, 'BooleanLiteral');
    assert.equal(captured.hashIds.key, 'bar');
    assert.equal(captured.hashIds.lit, null);
    assert.equal(captured.hashContexts.key, context);

    const second = hb.compile('{{inspect foo dyn=(id baz)}}', {
      stringParams: true,
      trackIds: true
    });
    assert.equal(second(context), 'ok');
    assert.equal(captured.hash.dyn, 'baz');
    assert.equal(captured.hashTypes.dyn, 'SubExpression');
    assert.equal(captured.hashIds.dyn, true);
  });

  it('covers AST-only compiler branches and non-string literal params', () => {
    const hb = handlebars.create();
    hb.registerPartial('p', 'A\nB');

    const indentedPartialAst = program({
      type: 'PartialStatement',
      name: pathExpression('p'),
      params: [],
      hash: null,
      indent: '  ',
      strip: { open: false, close: false }
    });
    assert.equal(compile(indentedPartialAst, {}, hb)({}), '  A\n  B');
    assert.equal(compile(indentedPartialAst, { preventIndent: true }, hb)({}), '  A\nB');

    const literalPathAst = program({
      type: 'MustacheStatement',
      path: { type: 'NumberLiteral', value: 0, original: 0 },
      params: [],
      escaped: true,
      strip: { open: false, close: false }
    });
    assert.equal(compile(literalPathAst, {}, hb)({ 0: 'zero' }), 'zero');

    let captured;
    hb.registerHelper('inspect', function(...args) {
      const options = args.pop();
      captured = {
        args,
        ids: options.ids,
        hash: options.hash,
        hashIds: options.hashIds
      };
      return 'ok';
    });
    assert.equal(
      hb.compile('{{inspect 1 true undefined null key=foo}}', { trackIds: true })({ foo: 'FOO' }),
      'ok'
    );
    assert.deepEqual(captured.args, [1, true, null, null]);
    assert.deepEqual(captured.ids, [null, null, null, null]);
    assert.equal(captured.hash.key, 'FOO');
    assert.equal(captured.hashIds.key, 'foo');

    const compatAst = program({
      type: 'MustacheStatement',
      path: {
        type: 'PathExpression',
        data: false,
        depth: 1,
        parts: ['name'],
        original: '../name'
      },
      params: [],
      escaped: true,
      strip: { open: false, close: false }
    });
    const compatSpec = precompile(compatAst, { compat: true });
    assert.match(compatSpec, /"useDepths":true/);
    assert.match(compatSpec, /depths\[1\]/);

    const badAst = program({
      type: 'MustacheStatement',
      path: { type: 'Nope' },
      params: [],
      escaped: true,
      strip: { open: false, close: false }
    });
    assert.throws(
      () => compile(badAst, {}, hb)({}),
      /Unknown type: Nope/
    );
  });

  it('rejects type-confused input AST values before code generation', () => {
    const hb = handlebars.create();
    globalThis.__expressHbsAstInjectionProbe = false;

    try {
      const maliciousNumberAst = program({
        type: 'MustacheStatement',
        path: pathExpression('inspect'),
        params: [
          {
            type: 'NumberLiteral',
            value: '0); globalThis.__expressHbsAstInjectionProbe = true; //',
            original: 0
          }
        ],
        hash: null,
        escaped: true,
        strip: { open: false, close: false }
      });
      assert.throws(
        () => precompile(maliciousNumberAst),
        /Invalid AST: NumberLiteral\.value must be a number/
      );
      assert.equal(globalThis.__expressHbsAstInjectionProbe, false);

      const badDepthAst = program({
        type: 'MustacheStatement',
        path: {
          type: 'PathExpression',
          data: false,
          depth: '0)); throw new Error("AST injection"); //',
          parts: ['name'],
          original: 'name'
        },
        params: [],
        hash: null,
        escaped: true,
        strip: { open: false, close: false }
      });
      assert.throws(
        () => compile(badDepthAst, {}, hb)({}),
        /Invalid AST: PathExpression\.depth must be an integer/
      );

      const badPartsAst = program({
        type: 'MustacheStatement',
        path: {
          type: 'PathExpression',
          data: false,
          depth: 0,
          parts: ['safe', 1],
          original: 'safe'
        },
        params: [],
        hash: null,
        escaped: true,
        strip: { open: false, close: false }
      });
      assert.throws(
        () => compile(badPartsAst, {}, hb)({}),
        /Invalid AST: PathExpression\.parts must only contain strings/
      );

      Object.defineProperty(Object.prototype, 'type', {
        configurable: true,
        value: 'Program'
      });
      try {
        assert.throws(
          () => compile({ body: [], strip: {} }, {}, hb),
          /You must pass a string or Handlebars AST/
        );
        assert.equal(hb.compile('plain')({}), 'plain');
      } finally {
        delete Object.prototype.type;
      }

      const inheritedContentAst = program(
        Object.create({
          type: 'ContentStatement',
          value: '<img src=x onerror=alert(1)>',
          original: 'x'
        })
      );
      assert.throws(
        () => compile(inheritedContentAst, {}, hb)({}),
        /Unknown type: undefined/
      );

      const inheritedValueAst = program({
        type: 'ContentStatement',
        original: 'x'
      });
      Object.setPrototypeOf(inheritedValueAst.body[0], {
        value: '<img src=x onerror=alert(1)>'
      });
      assert.throws(
        () => compile(inheritedValueAst, {}, hb)({}),
        /Invalid AST: ContentStatement\.value must be an own property/
      );

      const inheritedPathAst = program({
        type: 'MustacheStatement',
        params: [],
        hash: null,
        escaped: true,
        strip: { open: false, close: false }
      });
      Object.setPrototypeOf(inheritedPathAst.body[0], {
        path: {
          type: 'PathExpression',
          data: false,
          depth: '0)); globalThis.__expressHbsAstInjectionProbe = true; //',
          parts: ['name'],
          original: 'name'
        }
      });
      assert.throws(
        () => compile(inheritedPathAst, { compat: true }, hb)({ name: 'safe' }),
        /Invalid AST: MustacheStatement\.path must be an own property/
      );
      assert.equal(globalThis.__expressHbsAstInjectionProbe, false);
    } finally {
      delete globalThis.__expressHbsAstInjectionProbe;
      delete Object.prototype.type;
    }
  });

  it('uses contiguous child program indices in compiled specs', () => {
    const spec = precompile('{{#if a}}A{{else if b}}B{{else}}C{{/if}}');

    assert.match(spec, /"0":function/);
    assert.match(spec, /container\.program\(0,/);
  });

  it('reuses equivalent child programs after many distinct children', () => {
    const uniqueBlocks = Array.from(
      { length: 10 },
      (_, index) => `{{#if item${index}}}U${index}{{/if}}`
    ).join('');
    const source = uniqueBlocks + '{{#if a}}same{{/if}}{{#if b}}same{{/if}}';
    const spec = precompile(source);
    const childProgramCount = spec.match(/"\d+":function/g)?.length ?? 0;

    assert.equal(childProgramCount, 11);

    const hb = handlebars.create();
    assert.equal(
      hb.compile(source)({ item0: true, item9: true, a: true, b: true }),
      'U0U9samesame'
    );
  });

  it('applies whitespace control for standalone and inline strip cases', () => {
    const standalone = parse('a\n{{! c }}\nb');
    assert.equal(standalone.body[2].value, 'b');
    assert.equal(standalone.body[2].rightStripped, true);

    const ignoredStandalone = new WhitespaceControl({ ignoreStandalone: true })
      .accept(parseWithoutProcessing('a\n{{! c }}\nb'));
    assert.equal(ignoredStandalone.body[2].value, '\nb');

    const inlineStrip = new WhitespaceControl()
      .accept(parseWithoutProcessing('x {{~! c ~}} y'));
    assert.equal(inlineStrip.body[0].value, 'x');
    assert.equal(inlineStrip.body[0].leftStripped, true);
    assert.equal(inlineStrip.body[2].value, 'y');
    assert.equal(inlineStrip.body[2].rightStripped, true);

    const chained = new WhitespaceControl().accept(parseWithoutProcessing(
      '{{#if a}}\nA\n{{else if b}}\nB\n{{else}}\nC\n{{/if}}'
    ));
    assert.equal(chained.body[0].inverse.chained, true);
  });

  it('covers visitor mutation, traversal, and validation branches', () => {
    const baseVisitor = new Visitor();
    const partialBlockAst = program({
      type: 'PartialBlockStatement',
      name: pathExpression('layout'),
      params: [stringLiteral('x')],
      hash: {
        type: 'Hash',
        pairs: [
          {
            type: 'HashPair',
            key: 'greeting',
            value: stringLiteral('hello')
          }
        ]
      },
      program: program(content('body'))
    });
    assert.equal(baseVisitor.accept(partialBlockAst), undefined);

    class RemovingVisitor extends Visitor {
      mutating = true;

      StringLiteral(node) {
        if (node.original === 'drop') {
          return false;
        }
      }
    }

    const removingVisitor = new RemovingVisitor();
    const mustache = {
      type: 'MustacheStatement',
      path: pathExpression('echo'),
      params: [stringLiteral('drop'), stringLiteral('keep')],
      hash: {
        type: 'Hash',
        pairs: []
      }
    };
    removingVisitor.accept(mustache);
    assert.deepEqual(mustache.params.map(param => param.original), ['keep']);

    const retainedPath = pathExpression('retain');
    assert.equal(removingVisitor.accept(retainedPath), retainedPath);
    assert.equal(removingVisitor.accept(stringLiteral('drop')), undefined);

    class InvalidTypeVisitor extends Visitor {
      mutating = true;

      PathExpression() {
        return { type: 'Nope' };
      }
    }

    assert.throws(
      () => new InvalidTypeVisitor().accept({
        type: 'MustacheStatement',
        path: pathExpression('bad'),
        params: [],
        hash: null
      }),
      /Unexpected node type "Nope"/
    );

    assert.throws(() => baseVisitor.accept({ type: 'Nope' }), /Unknown type: Nope/);
    assert.throws(() => baseVisitor.accept({ type: 'HashPair' }), /HashPair requires value/);
  });

  it('covers whitespace-control standalone and block-like helper branches', () => {
    class ProgramWhitespaceControl extends WhitespaceControl {
      PartialStatement = () => ({ inlineStandalone: true });
      BlockStatement = () => ({
        openStandalone: true,
        closeStandalone: true,
        open: true,
        close: true
      });
    }

    const standaloneControl = new ProgramWhitespaceControl();
    const standalonePartial = program(
      content('  '),
      { type: 'PartialStatement', indent: '', strip: {} },
      content('\n')
    );
    standaloneControl.accept(standalonePartial);
    assert.equal(standalonePartial.body[0].value, '');
    assert.equal(standalonePartial.body[0].leftStripped, true);
    assert.equal(standalonePartial.body[1].indent, '  ');
    assert.equal(standalonePartial.body[2].value, '');
    assert.equal(standalonePartial.body[2].rightStripped, true);

    const standaloneBlock = program({
      type: 'BlockStatement',
      program: program(content('\n  yes')),
      inverse: program(content('  no\n'))
    });
    new ProgramWhitespaceControl().accept(standaloneBlock);
    assert.equal(standaloneBlock.body[0].program.body[0].value, '  yes');
    assert.equal(standaloneBlock.body[0].program.body[0].rightStripped, true);
    assert.equal(standaloneBlock.body[0].inverse.body[0].leftStripped, false);

    const whitespaceControl = new WhitespaceControl();
    delete whitespaceControl.BlockStatement;
    delete whitespaceControl.DecoratorBlock;
    delete whitespaceControl.PartialBlockStatement;
    delete whitespaceControl.Decorator;
    delete whitespaceControl.MustacheStatement;
    delete whitespaceControl.PartialStatement;
    const visitBlockStatement = whitespaceControl.BlockStatement.bind(whitespaceControl);
    const visitDecoratorBlock = whitespaceControl.DecoratorBlock.bind(whitespaceControl);
    const visitPartialBlockStatement = whitespaceControl.PartialBlockStatement.bind(whitespaceControl);
    const visitDecorator = whitespaceControl.Decorator.bind(whitespaceControl);
    const visitMustacheStatement = whitespaceControl.MustacheStatement.bind(whitespaceControl);
    const visitPartialStatement = whitespaceControl.PartialStatement.bind(whitespaceControl);
    const visitCommentStatement = whitespaceControl.CommentStatement.bind(whitespaceControl);
    const leafBlock = {
      type: 'BlockStatement',
      path: pathExpression('if'),
      params: [pathExpression('c')],
      hash: null,
      program: program(content('  leaf  ')),
      inverse: program(content('  final  ')),
      openStrip: { open: false, close: false },
      inverseStrip: { open: false, close: false },
      closeStrip: { open: false, close: false }
    };
    const middleBlock = {
      type: 'BlockStatement',
      path: pathExpression('if'),
      params: [pathExpression('b')],
      hash: null,
      program: program(content('  inner  ')),
      inverse: {
        type: 'Program',
        chained: true,
        body: [leafBlock],
        strip: {}
      },
      openStrip: { open: true, close: true },
      inverseStrip: { open: true, close: true },
      closeStrip: { open: true, close: false }
    };
    const topBlock = {
      type: 'BlockStatement',
      path: pathExpression('if'),
      params: [pathExpression('a')],
      hash: null,
      program: program(content('  main  ')),
      inverse: {
        type: 'Program',
        chained: true,
        body: [middleBlock],
        strip: {}
      },
      openStrip: { open: false, close: true },
      inverseStrip: { open: true, close: true },
      closeStrip: { open: true, close: false }
    };

    const strip = visitBlockStatement(topBlock);
    assert.deepEqual(strip, {
      open: false,
      close: false,
      openStandalone: false,
      closeStandalone: false
    });
    assert.equal(topBlock.program.body[0].value, 'main');
    assert.equal(middleBlock.program.body[0].value, 'inner');

    const decoratorBlock = {
      ...topBlock,
      type: 'DecoratorBlock',
      program: program(content('\nbody')),
      inverse: null
    };
    const partialBlock = {
      type: 'PartialBlockStatement',
      name: pathExpression('layout'),
      params: [],
      hash: null,
      program: program(content('\nbody')),
      openStrip: { open: false, close: false },
      closeStrip: { open: true, close: false }
    };
    assert.equal(typeof visitDecoratorBlock(decoratorBlock), 'object');
    assert.equal(typeof visitPartialBlockStatement(partialBlock), 'object');
    assert.deepEqual(
      visitDecorator({ strip: { open: true, close: false } }),
      { open: true, close: false }
    );
    assert.deepEqual(
      visitMustacheStatement({ strip: { open: false, close: true } }),
      { open: false, close: true }
    );
    assert.deepEqual(
      visitPartialStatement({ strip: { open: true, close: false } }),
      { inlineStandalone: true, open: true, close: false }
    );
    assert.deepEqual(
      visitCommentStatement({ strip: { open: false, close: true } }),
      { inlineStandalone: true, open: false, close: true }
    );
  });
});
