import {
  parse,
  parseWithoutProcessing
} from '#handlebars/compiler/parser';
import { compile, precompile } from '#handlebars/compiler/compiler';
import handlebars from '#handlebars';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from '#test/testkit';
import upstreamHandlebars from 'handlebars';

const require = createRequire(import.meta.url);
const upstreamParser = require('handlebars/dist/cjs/handlebars/compiler/base.js');
const ROOT = process.cwd();
const SEARCH_DIRS = [
  path.join(ROOT, 'example'),
  path.join(ROOT, 'test')
];

const UPSTREAM_AST_SAMPLES = [
  '{{title}}',
  '{{{body}}}',
  '{{#if production}}yes{{else}}no{{/if}}',
  '{{> scripts}}',
  '{{helper "x" key=value}}',
  '{{!< layout/default}}',
  '{{__n "%d cat" "%d cats" .}}',
  '{{#contentFor "pageStyles"}}<style></style>{{/contentFor}}',
  '{{foo.[bar baz]}}',
  '{{../name}}',
  '{{..}}',
  '{{@../index}}',
  '{{./name}}',
  '{{this/name}}',
  '{{this.name}}',
  '{{this}}',
  '{{!-- visible --}}',
  '{{*decorator foo=bar}}',
  '{{& value}}',
  '{{foo (bar key=value)}}',
  '{{#each items as |item|}}{{item}}{{/each}}',
  '{{#if a}}A{{else if b}}B{{else}}C{{/if}}',
  '{{{{raw}}}}{{foo}}{{{{/raw}}}}',
  '{{#*inline "row"}}x{{/inline}}{{> row}}',
  '{{#> layout}}Body{{/layout}}',
  'a\n{{! c }}\nb',
  'x {{~! c ~}} y',
  '{{foo true false null undefined 12 -3 4.5}}'
];

test('parser handles valid repo templates', async () => {
  const files = await collectTemplates(SEARCH_DIRS);
  const checked = [];

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    let ast;
    try {
      ast = parse(source);
    } catch {
      continue;
    }
    assert.equal(ast.type, 'Program', path.relative(ROOT, file));
    assert.ok(Array.isArray(ast.body), path.relative(ROOT, file));
    checked.push(file);
  }

  assert.ok(checked.length > 0);
});

test('parser output compiles for valid repo templates', async () => {
  const files = await collectTemplates(SEARCH_DIRS);
  const checked = [];

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const relativePath = path.relative(ROOT, file);
    let rawAst;
    try {
      rawAst = parseWithoutProcessing(source, { srcName: relativePath });
    } catch {
      continue;
    }
    const compiled = compile(rawAst, { srcName: relativePath });
    const precompiled = precompile(rawAst, { srcName: relativePath });

    assert.equal(rawAst.type, 'Program', relativePath);
    assert.equal(typeof compiled, 'function', relativePath);
    assert.equal(typeof precompiled.code, 'string', relativePath);
    assert.ok(!precompiled.code.includes('loc:'), relativePath);
    checked.push(file);
  }

  assert.ok(checked.length > 0);
});

test('parser AST matches upstream Handlebars for representative shared syntax', () => {
  const parserPairs = [
    ['raw', parseWithoutProcessing, upstreamParser.parseWithoutProcessing],
    ['processed', parse, upstreamParser.parse]
  ];

  for (const source of UPSTREAM_AST_SAMPLES) {
    for (const [stage, forkParse, upstreamParse] of parserPairs) {
      assert.deepStrictEqual(
        normalizeAst(forkParse(source)),
        normalizeAst(upstreamParse(source)),
        `${stage}: ${source}`
      );
    }
  }
});

test('parser handles representative inline syntax', () => {
  const samples = [
    {
      source: '{{title}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['title'],
            original: 'title'
          },
          params: [],
          escaped: true,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{{body}}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['body'],
            original: 'body'
          },
          params: [],
          escaped: false,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{#if production}}yes{{else}}no{{/if}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'BlockStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['if'],
            original: 'if'
          },
          params: [{
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['production'],
            original: 'production'
          }],
          program: {
            type: 'Program',
            body: [{
              type: 'ContentStatement',
              original: 'yes',
              value: 'yes'
            }],
            strip: {}
          },
          inverse: {
            type: 'Program',
            body: [{
              type: 'ContentStatement',
              original: 'no',
              value: 'no'
            }],
            strip: {}
          },
          openStrip: { open: false, close: false },
          inverseStrip: { open: false, close: false },
          closeStrip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{> scripts}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'PartialStatement',
          name: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['scripts'],
            original: 'scripts'
          },
          params: [],
          indent: '',
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{helper "x" key=value}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['helper'],
            original: 'helper'
          },
          params: [{
            type: 'StringLiteral',
            value: 'x',
            original: 'x'
          }],
          hash: {
            type: 'Hash',
            pairs: [{
              type: 'HashPair',
              key: 'key',
              value: {
                type: 'PathExpression',
                data: false,
                depth: 0,
                parts: ['value'],
                original: 'value'
              }
            }]
          },
          escaped: true,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{!< layout/default}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'CommentStatement',
          value: '< layout/default',
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{__n "%d cat" "%d cats" .}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['__n'],
            original: '__n'
          },
          params: [
            {
              type: 'StringLiteral',
              value: '%d cat',
              original: '%d cat'
            },
            {
              type: 'StringLiteral',
              value: '%d cats',
              original: '%d cats'
            },
            {
              type: 'PathExpression',
              data: false,
              depth: 0,
              parts: [],
              original: '.'
            }
          ],
          escaped: true,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{#contentFor "pageStyles"}}<style></style>{{/contentFor}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'BlockStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['contentFor'],
            original: 'contentFor'
          },
          params: [{
            type: 'StringLiteral',
            value: 'pageStyles',
            original: 'pageStyles'
          }],
          program: {
            type: 'Program',
            body: [{
              type: 'ContentStatement',
              original: '<style></style>',
              value: '<style></style>'
            }],
            strip: {}
          },
          openStrip: { open: false, close: false },
          closeStrip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{foo.[bar baz]}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['foo', 'bar baz'],
            original: 'foo.bar baz'
          },
          params: [],
          escaped: true,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{../name}}',
      expected: {
        type: 'Program',
        body: [{
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
        }],
        strip: {}
      }
    },
    {
      source: '{{..}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 1,
            parts: [],
            original: '..'
          },
          params: [],
          escaped: true,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{@../index}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: true,
            depth: 1,
            parts: ['index'],
            original: '@../index'
          },
          params: [],
          escaped: true,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{./name}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['name'],
            original: './name'
          },
          params: [],
          escaped: true,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{this/name}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['name'],
            original: 'this/name'
          },
          params: [],
          escaped: true,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{!-- visible --}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'CommentStatement',
          value: ' visible ',
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{*decorator foo=bar}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'Decorator',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['decorator'],
            original: 'decorator'
          },
          params: [],
          hash: {
            type: 'Hash',
            pairs: [{
              type: 'HashPair',
              key: 'foo',
              value: {
                type: 'PathExpression',
                data: false,
                depth: 0,
                parts: ['bar'],
                original: 'bar'
              }
            }]
          },
          escaped: true,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{& value}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['value'],
            original: 'value'
          },
          params: [],
          escaped: false,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    },
    {
      source: '{{foo (bar key=value)}}',
      expected: {
        type: 'Program',
        body: [{
          type: 'MustacheStatement',
          path: {
            type: 'PathExpression',
            data: false,
            depth: 0,
            parts: ['foo'],
            original: 'foo'
          },
          params: [{
            type: 'SubExpression',
            path: {
              type: 'PathExpression',
              data: false,
              depth: 0,
              parts: ['bar'],
              original: 'bar'
            },
            params: [],
            hash: {
              type: 'Hash',
              pairs: [{
                type: 'HashPair',
                key: 'key',
                value: {
                  type: 'PathExpression',
                  data: false,
                  depth: 0,
                  parts: ['value'],
                  original: 'value'
                }
              }]
            }
          }],
          escaped: true,
          strip: { open: false, close: false }
        }],
        strip: {}
      }
    }
  ];

  for (const { source, expected } of samples) {
    assert.deepStrictEqual(
      normalizeAst(parse(source)),
      expected,
      source
    );
  }
});

test('plain "as" params do not trigger block-param parsing', () => {
  const ast = normalizeAst(parse('{{#helper last as thing}}x{{/helper}}'));
  const [block] = ast.body;

  assert.equal(block.type, 'BlockStatement');
  assert.deepStrictEqual(
    block.params.map(param => param.original),
    ['last', 'as', 'thing']
  );
  assert.equal(block.program.blockParams, undefined);
  assert.equal(block.program.body[0].value, 'x');
});

test('parser rejects representative invalid templates', () => {
  const samples = [
    '{{#if a}}',
    '{{#if a}}{{/each}}',
    '{{!-- unterminated',
    '{{foo (bar}}',
    '{{foo (=bar)}}',
    '{{((bar))}}',
    '{{foo ((bar))}}',
    '{{#(foo)}}x{{/(foo)}}',
    '{{#if x as |y}}{{/if}}',
    '{{#if x as |}}{{/if}}',
    '{{#if x as|y|}}{{/if}}',
    '{{#if x as |y| z}}{{/if}}',
    '{{/if}}',
    '{{else}}',
    '{{{{/raw}}}}',
    '{{{{(foo)}}}}x{{{{/(foo)}}}}',
    '{{{name}}',
    '{{#if a}}{{else if b}}',
    '{{#if a}}{{else if b}}{{/each}}',
    '{{{{raw}}}}x{{{{/other}}}}',
    '{{foo..bar}}',
    '{{foo//bar}}',
    '{{foo./bar}}',
    '{{foo/../bar}}',
    '{{foo.}}',
    '{{foo/}}'
  ];

  for (const source of samples) {
    const error = parseError(parseWithoutProcessing, source);
    assert.equal(error.name, 'Error', source);
    assert.ok(error.message.length > 0, source);
  }
});

test('parser supports advanced syntax used by the compiler/runtime', () => {
  const samples = [
    {
      name: 'raw block',
      source: '{{{{raw}}}}{{foo}}{{{{/raw}}}}',
      createInstance() {
        const instance = handlebars.create();
        instance.registerHelper('raw', options => options.fn(this));
        return instance;
      },
      context: { foo: 'x' },
      expected: '{{foo}}'
    },
    {
      name: 'inline partial decorator',
      source: '{{#*inline "row"}}x{{/inline}}{{> row}}',
      context: {},
      expected: 'x'
    },
    {
      name: 'block params',
      source: '{{#each items as |item|}}{{item}}{{/each}}',
      context: { items: ['a', 'b'] },
      expected: 'ab'
    },
    {
      name: 'block params after subexpression',
      source: '{{#with (lookup row "as") as |item|}}{{item}}{{/with}}',
      context: { row: { as: 'ok' } },
      expected: 'ok'
    },
    {
      name: 'parent depth path',
      source: '{{#with child}}{{../name}}|{{../this.name}}{{/with}}',
      context: { name: 'ROOT', child: { name: 'CHILD' } },
      expected: 'ROOT|ROOT'
    },
    {
      name: 'parent depth data path',
      source: '{{#each rows}}{{#each cols}}{{@../index}}:{{@index}};{{/each}}{{/each}}',
      context: { rows: [{ cols: [1, 2] }, { cols: [3] }] },
      expected: '0:0;0:1;1:0;'
    },
    {
      name: 'else-if chain',
      source: '{{#if a}}A{{else if b}}B{{else}}C{{/if}}',
      context: { a: false, b: true },
      expected: 'B'
    },
    {
      name: 'else-if chain with tab whitespace',
      source: '{{#if a}}A{{else\tif b}}B{{else}}C{{/if}}',
      context: { a: false, b: true },
      expected: 'B'
    },
    {
      name: 'else-if chain with newline whitespace',
      source: '{{#if a}}A{{else\nif b}}B{{else}}C{{/if}}',
      context: { a: false, b: true },
      expected: 'B'
    },
    {
      name: 'bracket path literal',
      source: '{{foo.[bar baz]}}',
      context: { foo: { 'bar baz': 'ok' } },
      expected: 'ok'
    }
  ];

  for (const sample of samples) {
    const instance = sample.createInstance?.() ?? handlebars;
    const template = instance.compile(sample.source);
    assert.equal(template(sample.context), sample.expected, sample.name);
  }
});

test('compiled partials keep their original runtime helpers', () => {
  const partialRuntime = handlebars.create();
  const renderRuntime = handlebars.create();

  partialRuntime.registerHelper('shout', value => String(value).toUpperCase());
  renderRuntime.registerHelper('shout', value => String(value).toLowerCase());

  renderRuntime.registerPartial(
    'person',
    partialRuntime.compile('{{shout name}}')
  );

  const template = renderRuntime.compile('Hello {{> person}}');
  assert.equal(template({ name: 'MiXeD' }), 'Hello MIXED');
});

test('#each block params preserve the item and explicit parent contexts', () => {
  const template = handlebars.compile(
    '{{someVal}}|{{#each profiles as |profile|}}{{profile.username}}:{{someVal}}:{{../someVal}}|{{/each}}'
  );

  assert.equal(
    template({
      someVal: 'ROOT',
      profiles: [
        { username: 'u1', someVal: 'INNER1' },
        { username: 'u2' }
      ]
    }),
    'ROOT|u1:INNER1:ROOT|u2::ROOT|'
  );
});

test('#each aliases preserve item context for arrays, objects and iterables', () => {
  const source = '{{#each items as |item key|}}{{name}}/{{item.name}}/{{../name}}/{{key}};{{/each}}';
  const item = { name: 'child' };
  for (const items of [[item], { first: item }, new Set([item])]) {
    const context = { name: 'parent', items };
    assert.equal(handlebars.compile(source)(context), upstreamHandlebars.compile(source)(context));
  }
});

test('escaped mustaches and quoted arguments match upstream rendering', () => {
  const sources = [
    String.raw`\{{name}}`,
    String.raw`\{{{name}}} {{name}}`,
    String.raw`\{{unfinished`,
    String.raw`a\{{name}} b\{{name}} {{name}}`,
    String.raw`{{echo "C:\temp\file"}}`,
    String.raw`{{echo "a\\b"}}`,
    String.raw`{{echo "a\'b"}}`,
    String.raw`{{echo 'a\"b'}}`,
    String.raw`{{echo "a\"b"}}`,
    String.raw`{{echo 'a\'b'}}`
  ];
  for (let count = 2; count <= 5; count += 1) {
    sources.push('\\'.repeat(count) + '{{name}}');
  }
  const local = handlebars.create();
  const upstream = upstreamHandlebars.create();
  local.registerHelper('echo', value => value);
  upstream.registerHelper('echo', value => value);
  for (const source of sources) {
    const context = { name: 'value' };
    assert.equal(local.compile(source)(context), upstream.compile(source)(context), source);
  }
});

test('trailing backslashes in quoted arguments match upstream', () => {
  const local = handlebars.create();
  const upstream = upstreamHandlebars.create();
  const echo = (...args) => {
    const options = args.pop();
    return args.length ? args[0] : options.hash.value;
  };
  local.registerHelper('echo', echo);
  upstream.registerHelper('echo', echo);

  for (const quote of ['"', '\'']) {
    for (let count = 1; count <= 4; count += 1) {
      const value = 'C:' + '\\'.repeat(count);
      const literal = quote + value + quote;
      const sources = [
        `{{echo ${literal}}}`,
        `{{echo ${literal}~}}`,
        `{{{echo ${literal}}}}`,
        `{{echo value=${literal}}}`,
        `{{echo (echo ${literal})}}`,
        `{{#with ${literal} as |value|}}{{value}}{{/with}}`
      ];
      for (const source of sources) {
        assert.equal(local.compile(source)({}), value, source);
        assert.equal(local.compile(source)({}), upstream.compile(source)({}), source);
        assert.deepEqual(normalizeAst(parse(source)), normalizeAst(upstreamParser.parse(source)), source);
      }
    }
  }
});

test('quoted-string termination distinguishes escaped and closing quotes', () => {
  const local = handlebars.create();
  const upstream = upstreamHandlebars.create();
  local.registerHelper('echo', value => value);
  upstream.registerHelper('echo', value => value);
  const sources = [
    String.raw`{{echo "a\"b\"}}`,
    String.raw`{{echo 'a\'b\'}}`,
    String.raw`{{echo "a\"}}b"}}`,
    String.raw`{{echo "C:\\" suffix=name}}`,
    String.raw`{{#with "a\" as |fake| b" as |value|}}{{value}}{{/with}}`
  ];
  for (const source of sources) {
    assert.equal(local.compile(source)({}), upstream.compile(source)({}), source);
    assert.deepEqual(normalizeAst(parse(source)), normalizeAst(upstreamParser.parse(source)), source);
  }
  for (const source of [
    '{{echo "unfinished}}',
    "{{echo 'unfinished}}",
    String.raw`{{echo "C:\\" "next"}}`
  ]) {
    assert.throws(() => parse(source), undefined, source);
    assert.throws(() => upstreamParser.parse(source), undefined, source);
  }
});

test('inverted blocks and mixed inverse chains match upstream', () => {
  const sources = [
    '{{^items}}empty{{/items}}',
    '{{^items}}empty{{else}}full{{/items}}',
    '{{#items}}full{{^}}empty{{/items}}',
    '{{#if a}}A{{else unless b}}B{{else}}C{{/if}}',
    '{{#if a}}A{{else unless b}}B{{else with item}}{{name}}{{else}}C{{/if}}',
    'start\n{{^items}}\nempty\n{{else}}\nfull\n{{/items}}\nend',
    ' x {{~^items~}} empty {{~else~}} full {{~/items~}} y '
  ];
  for (const source of sources) {
    for (const context of [
      { items: [], a: false, b: false },
      { items: ['item'], a: true, b: true },
      { items: [], a: false, b: true, item: { name: 'child' } },
      { items: [], a: false, b: true }
    ]) {
      assert.equal(handlebars.compile(source)(context), upstreamHandlebars.compile(source)(context), source);
    }
    assert.deepEqual(normalizeAst(parse(source)), normalizeAst(upstreamParser.parse(source)), source);
  }
  assert.throws(() => parse('{{#if a}}A{{else unless b}}B{{/unless}}'), /doesn't match/);
});

test('helpers can access the current partial name', () => {
  const instance = handlebars.create();

  instance.registerHelper('whereAmI', options => options.partialName ?? 'root');
  instance.registerPartial('card', '[{{whereAmI}}]');

  const template = instance.compile('{{whereAmI}} {{> card}}');
  assert.equal(template({}), 'root [card]');
});

test('escaped output replaces forbidden code points', () => {
  const template = handlebars.compile('{{name}}');
  assert.equal(template({ name: 'A\u0002B' }), 'A\uFFFDB');
  assert.equal(template({ name: 'A<&\u0002B' }), 'A&lt;&amp;\uFFFDB');
  assert.equal(template({ name: 'A\uD800B' }), 'A\uFFFDB');
  assert.equal(template({ name: 'A\uFFFFB' }), 'A\uFFFDB');
  assert.equal(template({ name: 'A\u{1F600}B' }), 'A\u{1F600}B');
});

test('templates containing NULL characters still compile and render', () => {
  const template = handlebars.compile('Hello \x00 {{name}}');
  assert.equal(template({ name: 'foo' }), 'Hello \x00 foo');
});

async function collectTemplates(directories) {
  const results = [];

  for (const directory of directories) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        results.push(...await collectTemplates([fullPath]));
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.hbs')) {
        results.push(fullPath);
      }
    }
  }

  return results.sort();
}

function normalizeAst(node) {
  if (Array.isArray(node)) {
    return node.map(normalizeAst);
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  const normalized = {};
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'source') {
      continue;
    }
    const value = normalizeAst(node[key]);
    if (value !== undefined) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function parseError(parseFn, source) {
  try {
    parseFn(source);
  } catch (error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  throw new Error(`Expected parser to fail for: ${source}`);
}
