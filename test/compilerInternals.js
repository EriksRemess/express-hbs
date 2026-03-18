import { compile, precompile } from '#handlebars/compiler/compiler';
import { parse, parseWithoutProcessing } from '#handlebars/compiler/parser';
import WhitespaceControl from '#handlebars/compiler/whitespace-control';
import handlebars from '#handlebars';
import { describe, it } from '#test/testkit';
import assert from 'node:assert';

describe('compiler internals', () => {
  it('validates inputs and exposes lazy compile wrapper methods', () => {
    assert.throws(() => precompile(null), /You must pass a string or Handlebars AST to Handlebars.precompile/);
    assert.throws(() => compile(undefined), /You must pass a string or Handlebars AST to Handlebars.compile/);

    const hb = handlebars.create();
    const template = compile('{{#if ok}}yes{{/if}}', {}, hb);

    assert.equal(template({ ok: true }), 'yes');
    assert.equal(
      template._setup({
        helpers: hb.helpers,
        partials: hb.partials,
        decorators: hb.decorators,
        data: {}
      }),
      undefined
    );

    const child = template._child(1, {}, undefined, undefined);
    assert.equal(typeof child, 'function');
    assert.equal(child({}, { data: {} }), 'yes');

    const isolated = template._getIsolatedPartialState({});
    assert.equal(typeof isolated.helpers.if, 'function');
    assert.equal(typeof isolated.hooks.helperMissing, 'function');
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
    assert.equal(hb.compile('{{> (lookup . "which")}}')({ which: 'greeting' }), 'Hello');
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
});
