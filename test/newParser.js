import {
  parse,
  parseWithoutProcessing
} from '#handlebars/compiler/parser';
import { compile, precompile } from '#handlebars/compiler/compiler';
import handlebars from '#handlebars';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const SEARCH_DIRS = [
  path.join(ROOT, 'example'),
  path.join(ROOT, 'test')
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
            original: 'foo.[bar baz]'
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

test('#each block params preserve the outer context', () => {
  const template = handlebars.compile(
    '{{someVal}}|{{#each profiles as |profile|}}{{profile.username}}:{{someVal}}|{{/each}}'
  );

  assert.equal(
    template({
      someVal: 'ROOT',
      profiles: [
        { username: 'u1', someVal: 'INNER1' },
        { username: 'u2' }
      ]
    }),
    'ROOT|u1:ROOT|u2:ROOT|'
  );
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
