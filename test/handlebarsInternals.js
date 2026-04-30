import { HandlebarsEnvironment } from '#handlebars/base';
import handlebars from '#handlebars';
import Exception from '#handlebars/exception';
import { moveHelperToHooks } from '#handlebars/helpers';
import {
  createProtoAccessControl,
  resetLoggedProperties,
  resultIsAllowed
} from '#handlebars/internal/proto-access';
import { wrapHelper } from '#handlebars/internal/wrapHelper';
import logger from '#handlebars/logger';
import { template } from '#handlebars/runtime';
import { createFrame } from '#handlebars/utils';
import { afterEach, describe, it } from '#test/testkit';
import assert from 'node:assert';

describe('handlebars unit internals', () => {
  const originalLoggerLevel = logger.level;
  const originalLoggerLog = logger.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleLog = console.log;

  afterEach(() => {
    logger.level = originalLoggerLevel;
    logger.log = originalLoggerLog;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
    resetLoggedProperties();
  });

  it('covers logger level parsing and console fallback', () => {
    const calls = [];

    logger.level = 'info';
    console.warn = (...args) => calls.push(['warn', ...args]);
    console.log = (...args) => calls.push(['log', ...args]);

    assert.equal(logger.lookupLevel('warn'), 2);
    assert.equal(logger.lookupLevel('3'), 3);

    logger.log('warn', 'warning');
    logger.log(99, 'fallback');

    assert.deepEqual(calls, [
      ['warn', 'warning'],
      ['log', 'fallback']
    ]);
  });

  it('covers proto access allowlists, defaults, and warning reset', () => {
    const messages = [];
    logger.log = (level, message) => {
      messages.push([level, message]);
    };

    const defaults = createProtoAccessControl({});
    assert.equal(resultIsAllowed('value', defaults, 'ghost'), false);
    assert.equal(resultIsAllowed('value', defaults, 'ghost'), false);
    assert.equal(messages.length, 1);

    resetLoggedProperties();
    assert.equal(resultIsAllowed(() => {}, defaults, 'missingMethod'), false);
    assert.equal(messages.length, 2);

    const custom = createProtoAccessControl({
      allowedProtoProperties: { allowedProp: true },
      allowProtoMethodsByDefault: true
    });

    assert.equal(resultIsAllowed('value', custom, 'allowedProp'), true);
    assert.equal(resultIsAllowed(() => {}, custom, 'anyMethod'), true);
    assert.equal(resultIsAllowed(() => {}, custom, '__lookupSetter__'), false);

    const env = new HandlebarsEnvironment();
    env.resetLoggedPropertyAccesses();
    assert.equal(resultIsAllowed('value', defaults, 'ghost'), false);
    assert.equal(messages.length, 3);
  });

  it('covers registry registration, unregistering, and validation', () => {
    const helper = () => 'helper';
    const decorator = fn => fn;
    const env = new HandlebarsEnvironment(
      { seed: helper },
      { base: 'partial' },
      { deco: decorator }
    );

    const helperRevision = env.helperRevision;
    const partialRevision = env.partialRevision;
    const decoratorRevision = env.decoratorRevision;

    env.registerHelper('extra', helper);
    env.unregisterHelper('extra');
    env.registerPartial({ one: '1', two: '2' });
    env.unregisterPartial('two');
    env.registerDecorator('extra', decorator);
    env.unregisterDecorator('extra');

    assert.equal(env.helperRevision, helperRevision + 2);
    assert.equal(env.partialRevision, partialRevision + 2);
    assert.equal(env.decoratorRevision, decoratorRevision + 2);

    assert.throws(
      () => env.registerHelper({ bad: helper }, helper),
      /Arg not supported with multiple helpers/
    );
    assert.throws(
      () => env.registerPartial('', 'x'),
      /partial name must be a non-empty string/
    );
    assert.throws(
      () => env.registerPartial('missing'),
      /as undefined/
    );
    assert.throws(
      () => env.registerDecorator({ bad: decorator }, decorator),
      /Arg not supported with multiple decorators/
    );
  });

  it('covers exception formatting with and without location metadata', () => {
    const plain = new Exception('plain');
    assert.equal(plain.message, 'plain');
    assert.equal(plain.lineNumber, undefined);
    assert.equal(plain.column, undefined);

    const located = new Exception('located', {
      loc: {
        start: { line: 2, column: 3 },
        end: { line: 4, column: 5 }
      }
    });

    assert.equal(located.message, 'located - 2:3');
    assert.equal(located.lineNumber, 2);
    assert.equal(located.endLineNumber, 4);
    assert.equal(located.column, 3);
    assert.equal(located.endColumn, 5);
  });

  it('covers helperMissing, if/unless, lookup, and log helpers', () => {
    const hb = handlebars.create();
    const logCalls = [];

    hb.log = (level, ...args) => {
      logCalls.push([level, args]);
    };

    assert.equal(hb.helpers.helperMissing.call({}, { name: 'field' }), undefined);
    assert.throws(
      () => hb.helpers.helperMissing.call({}, 'value', { name: 'missingHelper' }),
      /Missing helper: "missingHelper"/
    );

    assert.throws(() => hb.helpers.if.call({}, true), /#if requires exactly one argument/);
    assert.equal(
      hb.helpers.if.call({}, () => 0, {
        hash: { includeZero: true },
        fn: () => 'truthy',
        inverse: () => 'falsey'
      }),
      'truthy'
    );
    assert.equal(
      hb.helpers.unless.call({}, false, {
        hash: {},
        fn: () => 'unless',
        inverse: () => 'if'
      }),
      'unless'
    );
    assert.throws(() => hb.helpers.unless.call({}, true), /#unless requires exactly one argument/);

    assert.equal(
      hb.helpers.lookup.call({}, null, 'x', {
        lookupProperty() {
          throw new Error('should not be called');
        }
      }),
      null
    );
    assert.equal(
      hb.helpers.lookup.call({}, { value: 'ok' }, 'value', {
        lookupProperty(obj, field) {
          return obj[field];
        }
      }),
      'ok'
    );

    hb.helpers.log.call({}, 'hash-level', { hash: { level: 'warn' } });
    hb.helpers.log.call({}, 'data-level', { hash: {}, data: { level: 3 } });
    assert.equal(hb.helpers.log.call({}), undefined);

    assert.deepEqual(logCalls, [
      ['warn', ['hash-level']],
      [3, ['data-level']]
    ]);
  });

  it('covers helper hook mirroring and frame creation edge cases', () => {
    const instance = {
      helpers: {
        keep: () => 'keep',
        drop: () => 'drop'
      },
      hooks: {}
    };

    moveHelperToHooks(instance, 'keep', true);
    moveHelperToHooks(instance, 'drop', false);

    assert.equal(typeof instance.hooks.keep, 'function');
    assert.equal(typeof instance.hooks.drop, 'function');
    assert.equal(typeof instance.helpers.keep, 'function');
    assert.equal(instance.helpers.drop, undefined);

    const source = Object.create({ inherited: true });
    source.own = 'value';
    const frame = createFrame(source);
    const emptyFrame = createFrame(null);

    assert.equal(frame.own, 'value');
    assert.equal(frame.inherited, undefined);
    assert.equal(frame._parent, source);
    assert.equal(emptyFrame._parent, null);
  });

  it('wraps helpers without changing non-functions or call semantics', () => {
    const passthrough = { helper: true };
    assert.equal(wrapHelper(passthrough, () => undefined), passthrough);

    const lookupProperty = (parent, key) => parent[key];
    let lookedUp;
    const wrapped = wrapHelper(function(value, options) {
      lookedUp = options.lookupProperty(value, 'name');
      return `${this.label}:${value.name}`;
    }, lookupProperty);

    const options = { hash: {} };
    const result = wrapped.call({ label: 'ctx' }, { name: 'Ada' }, options);
    assert.equal(result, 'ctx:Ada');
    assert.equal(lookedUp, 'Ada');
    assert.equal(options.lookupProperty, lookupProperty);
  });

  it('covers with, each, and blockHelperMissing helper branches', () => {
    const hb = handlebars.create();

    assert.throws(() => hb.helpers.with.call({}, 'value'), /#with requires exactly one argument/);
    assert.equal(
      hb.helpers.with.call({}, '', {
        fn: () => 'bad',
        inverse: () => 'inverse'
      }),
      'inverse'
    );

    const withResult = hb.helpers.with.call({}, () => ({ name: 'Ada' }), {
      data: { contextPath: 'root' },
      ids: ['person'],
      fn(context, options) {
        assert.equal(context.name, 'Ada');
        assert.equal(options.data.contextPath, 'root.person');
        assert.equal(options.blockParams[0].name, 'Ada');
        assert.equal(options.blockParams.path[0], 'root.person');
        return 'with';
      },
      inverse: () => 'bad'
    });
    assert.equal(withResult, 'with');

    assert.throws(() => hb.helpers.each.call({}, [1, 2]), /Must pass iterator to #each/);
    assert.equal(
      hb.helpers.each.call({ marker: 'ctx' }, () => [], {
        fn() {
          return 'bad';
        },
        inverse(context) {
          assert.equal(context.marker, 'ctx');
          return 'empty';
        }
      }),
      'empty'
    );

    const sparseResult = hb.helpers.each.call({}, [,'x'], {
      data: { contextPath: 'root' },
      ids: ['items'],
      fn(value, options) {
        return `[${options.data.index}:${options.data.contextPath}:${value}]`;
      },
      inverse: () => 'empty'
    });
    assert.equal(sparseResult, '[1:root.items.1:x]');

    const iterableResult = hb.helpers.each.call({}, new Set(['a', 'b']), {
      fn(value, options) {
        return `${options.data.index}:${value}:${options.data.last};`;
      },
      inverse: () => 'empty',
      data: {}
    });
    assert.equal(iterableResult, '0:a:false;1:b:true;');

    const objectContext = Object.create({ skipped: 'nope' });
    objectContext.first = 'A';
    objectContext.second = 'B';
    const objectResult = hb.helpers.each.call({}, objectContext, {
      data: {},
      fn(value, options) {
        return `${options.data.key}:${options.data.first}:${options.data.last}:${value};`;
      },
      inverse: () => 'empty'
    });
    assert.equal(objectResult, 'first:true:false:A;second:false:true:B;');

    assert.equal(
      hb.helpers.blockHelperMissing.call('ctx', true, {
        fn(value) {
          return value;
        },
        inverse: () => 'bad'
      }),
      'ctx'
    );
    assert.equal(
      hb.helpers.blockHelperMissing.call('ctx', null, {
        fn: () => 'bad',
        inverse(value) {
          return value;
        }
      }),
      'ctx'
    );
    assert.equal(
      hb.helpers.blockHelperMissing.call({}, [], {
        fn: () => 'bad',
        inverse: () => 'empty'
      }),
      'empty'
    );

    const arrayResult = hb.helpers.blockHelperMissing.call({}, [{ name: 'Ada' }], {
      name: 'people',
      ids: ['ignored'],
      data: { contextPath: 'root' },
      fn(value, options) {
        return `${options.data.contextPath}:${value.name}`;
      },
      inverse: () => 'empty'
    });
    assert.equal(arrayResult, 'root.people.0:Ada');

    const objectResultFromBlock = hb.helpers.blockHelperMissing.call({}, { name: 'Lin' }, {
      name: 'person',
      ids: ['person'],
      data: { contextPath: 'root' },
      fn(value, options) {
        assert.equal(options.data.contextPath, 'root.person');
        return value.name;
      },
      inverse: () => 'bad'
    });
    assert.equal(objectResultFromBlock, 'Lin');
  });

  it('covers runtime template validation and runtime partial compilation', () => {
    assert.throws(
      () => template({
        main() {
          return '';
        }
      }),
      /No environment passed to template/
    );
    assert.throws(
      () => template({}, new HandlebarsEnvironment()),
      /Unknown template object/
    );

    const hb = handlebars.create();
    hb.registerPartial('greeting', 'Hello\n{{name}}');
    hb.registerPartial('dynamic', 'Dynamic');
    hb.registerPartial('multiline', 'A\nB\n');
    hb.registerHelper('peek', function(target, options) {
      return options.lookupProperty(target, 'inherited') ?? 'blocked';
    });
    logger.log = () => {};

    const compiled = hb.compile('{{> greeting}}');
    assert.equal(compiled({ name: 'Ada' }), 'Hello\nAda');
    assert.equal(hb.compile('{{> (lookup . "partialName")}}')({ partialName: 'dynamic' }), 'Dynamic');
    assert.equal(hb.compile('{{#> missing foo="BAR"}}{{foo}}:{{name}}{{/missing}}')({ name: 'Ada' }), 'BAR:Ada');
    assert.equal(hb.compile('  {{> multiline}}')({}), '  A\nB\n');
    assert.equal(hb.compile('{{peek target}}')({
      target: Object.create({ inherited: 'secret' })
    }), 'blocked');
    assert.equal(hb.compile('{{peek target}}')({
      target: Object.create({ inherited: 'secret' })
    }, {
      allowedProtoProperties: { inherited: true }
    }), 'secret');

    const inheritedPartials = Object.create({
      ghost() {
        return 'bad';
      }
    });
    const inheritedPartialTemplate = template({
      main(container, context, helpers, partials, data) {
        return container.invokePartial(undefined, context, {
          name: 'ghost',
          data,
          partials: inheritedPartials
        });
      },
      usePartial: true,
      useData: true
    }, hb);
    assert.throws(
      () => inheritedPartialTemplate({}),
      /The partial ghost could not be found/
    );

    const inheritedPartialBlockData = Object.create({
      'partial-block'() {
        return 'bad';
      }
    });
    const inheritedPartialBlockTemplate = template({
      main(container, context, helpers, partials) {
        return container.invokePartial(undefined, context, {
          name: '@partial-block',
          data: inheritedPartialBlockData,
          partials
        });
      },
      usePartial: true
    }, hb);
    assert.throws(
      () => inheritedPartialBlockTemplate({}),
      /The partial @partial-block could not be found/
    );

    const ast = hb.parse('{{value}}');
    assert.equal(ast.type, 'Program');
    assert.match(hb.precompile('{{value}}'), /main/);

    const helperState = hb.compile('plain')._getIsolatedPartialState({});
    assert.equal(helperState.helpers.helperMissing, undefined);
    assert.equal(typeof helperState.hooks.helperMissing, 'function');
    const permissiveHelperState = hb.compile('plain')._getIsolatedPartialState({
      allowCallsToHelperMissing: true
    });
    assert.equal(typeof permissiveHelperState.helpers.helperMissing, 'function');
    assert.equal(typeof permissiveHelperState.helpers.blockHelperMissing, 'function');

    const runtimeOnly = handlebars.create();
    runtimeOnly.compile = undefined;
    runtimeOnly.registerPartial('raw', 'Hello {{name}}');
    const runtimeOnlyTemplate = template({
      main(container, context, helpers, partials, data) {
        return container.invokePartial(partials.raw, context, {
          name: 'raw',
          data,
          partials
        });
      },
      usePartial: true,
      useData: true
    }, runtimeOnly);
    assert.throws(
      () => runtimeOnlyTemplate({ name: 'Ada' }),
      /could not be compiled when running in runtime-only mode/
    );

    const childTemplate = template({
      main() {
        return '';
      },
      1() {
        return '';
      },
      useBlockParams: true,
      useDepths: true
    }, new HandlebarsEnvironment());

    assert.throws(() => childTemplate._child(1, {}, undefined, []), /must pass block params/);
    assert.throws(() => childTemplate._child(1, {}, [], undefined), /must pass parent depths/);
  });

  it('covers runtime container helper, program, data, and partial branches', () => {
    const env = new HandlebarsEnvironment();

    const helperBundleTemplate = template({
      main(container) {
        return container.helpers.literal;
      }
    }, env);
    assert.equal(helperBundleTemplate({}, { helpers: { literal: 'ok' } }), 'ok');

    const containerTemplate = template({
      main(container, depth0, helpers, partials, data) {
        return [
          container.strict(depth0, 'name'),
          container.lookup([{ name: null }, { name: 0 }, { name: 'Ada' }], 'name'),
          container.program(1) === container.program(1),
          container.data(data, 2)?.value,
          container.mergeIfNeeded(null, { x: 1 }).x
        ].join('|');
      },
      1() {
        return 'child';
      },
      useData: true
    }, env);
    assert.equal(
      containerTemplate(
        { name: 'OK' },
        {
          data: {
            value: 'leaf',
            _parent: {
              value: 'mid',
              _parent: { value: 'top' }
            }
          }
        }
      ),
      'OK|0|true|mid|1'
    );

    const hb = handlebars.create();
    hb.registerPartial(
      'p',
      (_ctx, options) => `${options.data.contextPath ?? 'none'}|${options.data.partialName ?? 'none'}|${typeof options.data['partial-block']}`
    );

    const partialTemplate = hb.compile(
      '{{#with person}}{{#> p .}}{{name}}{{/p}}{{/with}}',
      { trackIds: true }
    );
    assert.equal(
      partialTemplate({ person: { name: 'Ada' } }),
      'person|p|function'
    );

    const fallbackContextPathTemplate = template({
      main(container, depth0, helpers, partials, data) {
        return container.invokePartial(partials.p, depth0, {
          name: 'p',
          data,
          partials,
          ids: ['']
        });
      },
      useData: true,
      usePartial: true
    }, env);
    env.registerPartial('p', (_ctx, options) => options.data.contextPath ?? 'root');
    assert.equal(
      fallbackContextPathTemplate({}, { data: { contextPath: 'root' } }),
      'root'
    );
  });
});
