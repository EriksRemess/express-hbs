import hbs from '#hbs';
import { HandlebarsEnvironment } from '#handlebars/base';
import { createNewLookupObject } from '#handlebars/internal/create-new-lookup-object';
import { done, hasResolvers, resolve, resolverPendingEntriesKey } from '#lib/resolver';
import { fromHere } from '#test/fixtures/paths';
import { describe, it } from '#test/testkit';
import handlebars from '#handlebars';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const resolveCache = (cache) => new Promise((resolve, reject) => done(cache, (err, values) => {
  if (err) {
    reject(err);
    return;
  }
  resolve(values);
}));
const addThrowingUnsafeGetters = (target) => {
  for (const unsafeKey of ['__proto__', 'constructor', 'prototype']) {
    Object.defineProperty(target, unsafeKey, {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error('unsafe getter evaluated');
      }
    });
  }
};

describe('lib helpers', () => {
  const issuesDir = fromHere(import.meta.url, 'issues');

  describe('resolver', () => {
    it('should detect resolver token at string start', () => {
      assert.equal(hasResolvers('__aSyNcId__<_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__'), true);
      assert.equal(hasResolvers('__aSyNcId__&lt;_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__'), true);
    });

    it('should ignore literal async prefix text that is not a full token', () => {
      assert.equal(hasResolvers('__aSyNcId__x'), false);
      assert.equal(hasResolvers('literal __aSyNcId__ text'), false);
    });

    it('should support map-based resolver cache', async () => {
      const cache = new Map();
      const id = resolve(cache, (_, cb) => {
        cb('resolved');
      });

      assert.equal(cache.has(id), true);
      assert.match(id, /^__aSyNcId__<_[a-f0-9]{32}__$/);
      const values = await resolveCache(cache);
      assert.equal(values[id], 'resolved');
    });

    it('should reuse a per-cache random prefix for resolver ids', async () => {
      const cache = new Map();
      const firstId = resolve(cache, (_, cb) => cb('first'));
      const secondId = resolve(cache, (_, cb) => cb('second'));
      const firstHex = firstId.match(/^__aSyNcId__<_([a-f0-9]{32})__$/)[1];
      const secondHex = secondId.match(/^__aSyNcId__<_([a-f0-9]{32})__$/)[1];

      assert.equal(firstHex.slice(0, 16), secondHex.slice(0, 16));
      assert.equal(firstHex.slice(16), '0000000000000000');
      assert.equal(secondHex.slice(16), '0000000000000001');

      const values = await done(cache);
      assert.equal(values[firstId], 'first');
      assert.equal(values[secondId], 'second');
    });

    it('should reject when resolver callback throws', async () => {
      const cache = Object.create(null);
      resolve(cache, () => {
        throw new Error('boom');
      });
      await assert.rejects(done(cache), /boom/);
    });

    it('should resolve and reject promise-returning resolver callbacks', async () => {
      const resolvedCache = new Map();
      const resolvedId = resolve(resolvedCache, async () => 'promise-value');
      const values = await done(resolvedCache);
      assert.equal(values[resolvedId], 'promise-value');

      const rejectedCache = new Map();
      resolve(rejectedCache, async () => {
        throw new Error('promise-boom');
      });
      await assert.rejects(done(rejectedCache), /promise-boom/);
    });

    it('should reject invalid resolver inputs', () => {
      assert.throws(() => resolve(null, () => {}, undefined), /Resolver cache must be a Map or an object/);
      assert.throws(() => resolve({}, null, undefined), /Resolver callback must be a function/);
      assert.throws(() => done({}, 'bad-callback'), /Resolver completion callback must be a function/);
    });

    it('should resolve map-based async placeholders with queued and direct entries', async () => {
      const hb = hbs.create();
      const queuedId = '__aSyNcId__<_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__';
      const directId = '__aSyNcId__<_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb__';
      const queuedCache = new Map();
      queuedCache[resolverPendingEntriesKey] = [];

      const queuedPromise = Promise.resolve().then(() => {
        const directPromise = Promise.resolve('done');
        queuedCache.set(directId, directPromise);
        queuedCache[resolverPendingEntriesKey].push([queuedId, Promise.resolve('ignored')]);
        queuedCache[resolverPendingEntriesKey].push(directId, directPromise);
        return directId;
      });

      queuedCache.set(queuedId, queuedPromise);
      queuedCache[resolverPendingEntriesKey].push(queuedId, queuedPromise);

      assert.equal(await hb._resolveAsyncHtml(queuedCache, queuedId), 'done');

      const directCache = new Map([[directId, Promise.resolve('direct-only')]]);
      assert.equal(await hb._resolveAsyncHtml(directCache, `<p>${directId}</p>`), '<p>direct-only</p>');
    });
  });

  describe('handlebars internals', () => {
    it('creates lookup objects with null prototype and skips unsafe keys', () => {
      const source = { safe: 'ok' };
      Object.defineProperty(source, '__proto__', {
        value: { ghost: 'bad' },
        enumerable: true
      });

      const lookup = createNewLookupObject(source);
      assert.equal(lookup.safe, 'ok');
      assert.equal(lookup.ghost, undefined);
      assert.equal(Object.hasOwn(lookup, '__proto__'), false);
      assert.equal(Object.getPrototypeOf(lookup), null);
    });

    it('uses prototype-safe registries and rejects reserved registry names', () => {
      const env = new HandlebarsEnvironment();
      const helper = () => 'ok';
      const decorator = fn => fn;

      const helperBatch = { safe: helper };
      Object.defineProperty(helperBatch, '__proto__', {
        value: { polluted: true },
        enumerable: true
      });

      env.registerHelper(helperBatch);
      env.registerPartial('safe-partial', 'partial');
      env.registerDecorator('safe-decorator', decorator);

      assert.equal(Object.getPrototypeOf(env.helpers), null);
      assert.equal(Object.getPrototypeOf(env.partials), null);
      assert.equal(Object.getPrototypeOf(env.decorators), null);
      assert.equal(env.helpers.safe, helper);
      assert.equal(Object.hasOwn(env.helpers, '__proto__'), false);
      assert.equal({}.polluted, undefined);

      assert.throws(() => env.registerHelper('__proto__', helper), /reserved name/);
      assert.throws(() => env.registerPartial('constructor', 'x'), /reserved name/);
      assert.throws(() => env.registerDecorator('prototype', decorator), /reserved name/);
    });

    it('does not trust polluted toStringTag when detecting helper maps', () => {
      Object.defineProperty(Object.prototype, Symbol.toStringTag, {
        configurable: true,
        value: 'Object'
      });

      try {
        const env = new HandlebarsEnvironment();
        assert.throws(
          () => env.registerHelper(function pollutedHelperMap() {}),
          /helper name must be a non-empty string/
        );
      } finally {
        delete Object.prototype[Symbol.toStringTag];
      }
    });

    it('does not resolve prototype-inherited partials from render options', () => {
      const template = handlebars.compile('{{> ghost}}');
      const partials = {};
      Object.defineProperty(partials, '__proto__', {
        value: { ghost: 'polluted' },
        enumerable: true
      });

      assert.throws(() => template({}, { partials }), /could not be found/);
    });
  });

  describe('hbs internals', () => {
    it('exposes template options helpers', () => {
      const hb = hbs.create();
      hb.updateTemplateOptions({ a: 1 });
      assert.deepEqual(hb.getTemplateOptions(), { a: 1 });
      assert.deepEqual(hb.getLocalTemplateOptions({}), {});
      assert.deepEqual(hb.getLocalTemplateOptions(), {});
    });

    it('updates local template options', () => {
      const hb = hbs.create();
      const locals = {};
      hb.updateLocalTemplateOptions(locals, { x: 1 });
      assert.deepEqual(locals._templateOptions, { x: 1 });
      assert.deepEqual(hb.getLocalTemplateOptions(locals), { x: 1 });
    });

    it('ignores prototype-inherited local template options', () => {
      const hb = hbs.create();
      const locals = Object.create({ _templateOptions: { noEscape: true } });

      assert.deepEqual(hb.getLocalTemplateOptions(locals), {});
    });

    it('rejects invalid locals for local template options', () => {
      const hb = hbs.create();
      assert.throws(() => hb.updateLocalTemplateOptions(null, { x: 1 }), /locals must be an object/);
    });

    it('defines local template options as own data properties despite polluted prototypes', () => {
      const hb = hbs.create();
      const locals = {};
      let setterCalls = 0;

      Object.defineProperty(Object.prototype, '_templateOptions', {
        configurable: true,
        set() {
          setterCalls += 1;
        }
      });

      try {
        const templateOptions = hb.updateLocalTemplateOptions(locals, { data: { ok: true } });

        assert.equal(setterCalls, 0);
        assert.equal(Object.hasOwn(locals, '_templateOptions'), true);
        assert.equal(locals._templateOptions, templateOptions);
      } finally {
        delete Object.prototype._templateOptions;
      }
    });

    it('covers merge branches for arrays, nested objects and unsafe keys', () => {
      const hb = hbs.create();
      hb.updateTemplateOptions({
        arr: [1],
        nested: { a: 1 }
      });

      const localTemplateOptions = {
        arr: [2],
        nested: { b: 2 }
      };
      Object.defineProperty(localTemplateOptions, '__proto__', {
        value: { pollute: true },
        enumerable: true
      });

      const template = (localsArg, templateOptions) => ({ localsArg, templateOptions });
      template.__filename = 'x.hbs';

      const result = hb._renderTemplate(template, {
        _templateOptions: localTemplateOptions,
        name: 'ok'
      });

      assert.deepEqual(result.templateOptions.arr, [2]);
      assert.deepEqual(result.templateOptions.nested, { a: 1, b: 2 });
      assert.equal(result.localsArg._templateOptions, undefined);
      assert.equal({}.pollute, undefined);
    });

    it('does not read unsafe option-key accessors while cloning options', async () => {
      const hb = hbs.create();
      const engineOptions = { templateOptions: { data: { ok: true } } };
      const renderOptions = {};
      const localTemplateOptions = { data: {} };

      addThrowingUnsafeGetters(engineOptions);
      addThrowingUnsafeGetters(renderOptions);
      addThrowingUnsafeGetters(localTemplateOptions.data);

      hb.express(engineOptions);

      assert.equal(
        await hb._renderFile('/tmp/inline.hbs', '{{@ok}}!', renderOptions),
        'true!'
      );
      assert.deepEqual(hb.updateLocalTemplateOptions({}, localTemplateOptions), {
        data: {}
      });
    });

    it('strips security-sensitive keys from local template options', () => {
      const hb = hbs.create();
      const template = (_localsArg, templateOptions) => templateOptions;
      template.__filename = 'x.hbs';

      const templateOptions = hb._renderTemplate(template, {
        _templateOptions: {
          data: { ok: true },
          allowedProtoProperties: { secret: true },
          allowProtoPropertiesByDefault: true,
          allowedProtoMethods: { trim: true },
          allowProtoMethodsByDefault: true,
          allowCallsToHelperMissing: true,
          protoAccessControl: { properties: {} }
        }
      });

      assert.deepEqual(templateOptions, {
        data: { ok: true }
      });
    });

    it('handles non-object template options sources', () => {
      const hb = hbs.create();
      const template = (_localsArg, templateOptions) => templateOptions;
      template.__filename = 'x.hbs';

      hb.updateTemplateOptions('bad');
      const templateOptions = hb._renderTemplate(template, {});
      assert.deepEqual(templateOptions, {});
    });

    it('uses the direct render fast path when no template options are configured', () => {
      const hb = hbs.create();
      const template = function(localsArg) {
        return {
          localsArg,
          argCount: arguments.length
        };
      };
      template.__filename = 'x.hbs';

      const result = hb._renderTemplate(template, { name: 'ok' });
      assert.equal(result.localsArg.name, 'ok');
      assert.equal(result.argCount, 1);
    });

    it('skips unsafe keys when cloning render locals', () => {
      const hb = hbs.create();
      const locals = {
        _templateOptions: {},
        name: 'ok'
      };
      Object.defineProperty(locals, '__proto__', {
        value: { polluted: true },
        enumerable: true
      });

      const template = (localsArg) => ({
        name: localsArg.name,
        polluted: localsArg.polluted,
        hasProtoKey: Object.hasOwn(localsArg, '__proto__')
      });
      template.__filename = 'x.hbs';

      const result = hb._renderTemplate(template, locals);
      assert.equal(result.name, 'ok');
      assert.equal(result.polluted, undefined);
      assert.equal(result.hasProtoKey, false);
      assert.equal({}.polluted, undefined);
    });

    it('restores top-level template options when rendering throws a string error', () => {
      const hb = hbs.create();
      const locals = {
        _templateOptions: { x: 1 },
        name: 'ok'
      };

      const template = () => {
        throw 'boom';
      };
      template.isTop = true;
      template.__filename = 'x.hbs';

      assert.throws(() => hb._renderTemplate(template, locals), /\[x\.hbs\] boom/);
      assert.deepEqual(locals._templateOptions, { x: 1 });
    });

    it('restores hidden template options without invoking polluted prototype setters', () => {
      const hb = hbs.create();
      const locals = {
        _templateOptions: { data: { ok: true } }
      };
      const template = () => 'ok';
      let setterCalls = 0;

      template.isTop = true;
      template.__filename = 'x.hbs';

      Object.defineProperty(Object.prototype, '_templateOptions', {
        configurable: true,
        set() {
          setterCalls += 1;
        }
      });

      try {
        assert.equal(hb._renderTemplate(template, locals), 'ok');
        assert.equal(setterCalls, 0);
        assert.equal(Object.hasOwn(locals, '_templateOptions'), true);
        assert.deepEqual(locals._templateOptions, { data: { ok: true } });
      } finally {
        delete Object.prototype._templateOptions;
      }
    });

    it('sanitizes template options written through updateLocalTemplateOptions', () => {
      const hb = hbs.create();
      const locals = {};

      const templateOptions = hb.updateLocalTemplateOptions(locals, {
        data: { ok: true },
        allowProtoPropertiesByDefault: true,
        allowCallsToHelperMissing: true
      });

      assert.deepEqual(templateOptions, {
        data: { ok: true }
      });
      assert.deepEqual(locals._templateOptions, templateOptions);
    });

    it('preserves non-plain values nested in local template options', () => {
      const hb = hbs.create();
      const when = new Date('2020-01-02T03:04:05.000Z');
      const locals = {};

      const templateOptions = hb.updateLocalTemplateOptions(locals, {
        data: { when }
      });

      assert.equal(templateOptions.data.when, when);
      assert.equal(templateOptions.data.when instanceof Date, true);
    });

    it('does not trust polluted toStringTag when cloning template options', () => {
      Object.defineProperty(Object.prototype, Symbol.toStringTag, {
        configurable: true,
        value: 'Object'
      });

      try {
        const hb = hbs.create();
        const hook = () => 'ok';
        const template = (_localsArg, templateOptions) => templateOptions;
        template.__filename = 'x.hbs';

        hb.updateTemplateOptions({ hook });
        assert.equal(hb._renderTemplate(template, {}).hook, hook);
      } finally {
        delete Object.prototype[Symbol.toStringTag];
      }
    });

    it('sanitizes array and primitive local template option payloads', () => {
      const hb = hbs.create();
      const arrayLocals = {};
      const arrayOptions = [{
        ok: true,
        nested: { value: 1 }
      }];
      Object.defineProperty(arrayOptions[0].nested, 'constructor', {
        value: 'bad',
        enumerable: true
      });

      const updatedArray = hb.updateLocalTemplateOptions(arrayLocals, arrayOptions);
      assert.deepEqual(updatedArray, [{
        ok: true,
        nested: { value: 1 }
      }]);
      assert.equal(Object.hasOwn(updatedArray[0].nested, 'constructor'), false);

      const primitiveLocals = {};
      assert.equal(hb.updateLocalTemplateOptions(primitiveLocals, 5), 5);
      assert.equal(primitiveLocals._templateOptions, 5);
    });

    it('handles path helpers edge cases', () => {
      const hb = hbs.create();
      assert.equal(hb.layoutPath('/tmp/a.hbs', 'layout', []), undefined);
      assert.throws(() => hb.layoutPath('/tmp/a.hbs', {}, '/tmp'), /layout must be a non-empty string/);
      assert.equal(hb._toErrorFilename(undefined, '/tmp'), undefined);
      hb._ensureInRestrictLayoutsTo('/tmp/a.hbs');
    });

    it('memoizes layoutPath results for repeated inputs', () => {
      const hb = hbs.create();
      hb.layoutsDir = '/tmp/layouts';

      assert.equal(hb.layoutPath('/tmp/a.hbs', 'layout', '/tmp/views'), '/tmp/layouts/layout');
      assert.equal(hb.layoutPath('/tmp/a.hbs', 'layout', '/tmp/views'), '/tmp/layouts/layout');
      assert.equal(hb.layoutPathCache.size, 1);
    });

    it('memoizes filename dirnames for relative layout resolution', () => {
      const hb = hbs.create();

      assert.equal(hb.layoutPath('/tmp/views/sub/template.hbs', './layout', '/tmp/views'), '/tmp/views/sub/layout');
      assert.equal(hb.declaredLayoutFile('{{!< ./layout}}', '/tmp/views/sub/template.hbs'), '/tmp/views/sub/layout');
      assert.equal(hb.filenameDirCache.get('/tmp/views/sub/template.hbs'), '/tmp/views/sub');
      assert.equal(hb.filenameDirCache.size, 1);
    });

    it('covers implicit layout restriction roots for relative, layout, and views fallbacks', () => {
      const hb = hbs.create();
      const filename = '/tmp/views/sub/template.hbs';

      hb.layoutsDir = '/tmp/layouts';
      assert.equal(hb._getImplicitDeclaredLayoutRestrictionRoot(filename, '/tmp/views', 'layout'), '/tmp/layouts');

      hb.layoutsDir = ['/tmp/layouts-array'];
      assert.equal(hb._getImplicitDeclaredLayoutRestrictionRoot(filename, '/tmp/views', 'layout'), '/tmp/layouts-array');
      assert.equal(hb._getImplicitLayoutRestrictionRoot(filename, '/tmp/views', './layout'), '/tmp/views/sub');
      assert.equal(hb._getImplicitLayoutRestrictionRoot(filename, '/tmp/views', 'layout'), '/tmp/layouts-array');

      hb.layoutsDir = null;
      assert.equal(hb._getImplicitLayoutRestrictionRoot(filename, ['/tmp/views-a', '/tmp/views-b'], 'layout'), '/tmp/views-a');
    });

    it('uses null-prototype block caches for helper-controlled names', () => {
      const hb = hbs.create();
      const blockCache = Object.create(null);

      hb.content('__proto__', {
        data: { root: { blockCache } },
        fn: () => 'safe'
      }, null);

      assert.equal(Array.isArray(blockCache.__proto__), true);
      assert.equal(Object.getPrototypeOf(blockCache), null);
      assert.equal({}.safe, undefined);
    });

    it('rejects malformed engine path options', () => {
      const hb = hbs.create();
      assert.throws(() => hb.express({ extname: '../x' }), /extname must be a non-empty file extension string/);
      assert.throws(() => hb.express({ partialsDir: ['', issuesDir] }), /partialsDir entries must be non-empty strings/);
      assert.throws(() => hb.express('bad'), /options must be an object/);
    });

    it('accepts disabled default layouts and validates helper name options', () => {
      const hb = hbs.create();
      hb.express({ defaultLayout: false });
      assert.equal(hb._options.defaultLayout, false);

      assert.throws(() => hb.express({ contentHelperName: {} }), /contentHelperName must be a non-empty string/);
      assert.throws(() => hb.express({ blockHelperName: {} }), /blockHelperName must be a non-empty string/);
    });

    it('renders custom block and content helper names and removes them on reconfigure', async () => {
      const hb = hbs.create();
      const customTemplate = '{{#slotFor "sidebar"}}custom{{/slotFor}}{{{slot "sidebar"}}}';

      hb.express({
        blockHelperName: 'slot',
        contentHelperName: 'slotFor'
      });

      assert.equal(
        await hb._renderFile('/tmp/inline.hbs', customTemplate, {}),
        'custom'
      );

      hb.express({});

      await assert.rejects(
        hb._renderFile('/tmp/inline.hbs', customTemplate, {}),
        /Missing helper|slotFor|slot/
      );
      assert.equal(
        await hb._renderFile('/tmp/inline.hbs', '{{#contentFor "sidebar"}}default{{/contentFor}}{{{block "sidebar"}}}', {}),
        'default'
      );
    });

    it('skips unsafe keys when cloning engine and template options', () => {
      const hb = hbs.create();
      hb.express({
        extname: '.hbs',
        constructor: 'bad'
      });

      assert.equal(hb._options.extname, '.hbs');
      assert.equal(Object.hasOwn(hb._options, 'constructor'), false);

      hb.updateTemplateOptions({
        safe: 1,
        constructor: 'bad'
      });

      const template = (_localsArg, templateOptions) => templateOptions;
      template.__filename = 'x.hbs';

      const result = hb._renderTemplate(template, {
        _templateOptions: {
          extra: 2,
          constructor: 'bad'
        }
      });

      assert.deepEqual(result, { safe: 1, extra: 2 });
      assert.equal(Object.hasOwn(result, 'constructor'), false);
    });

    it('lists partials recursively with fs.glob', async () => {
      const hb = hbs.create();
      hb.express({
        partialsDir: path.join(issuesDir, '23/partials'),
        extname: '.hbs'
      });

      await hb.cachePartials();
      assert.equal(hb.partialsManifest.length > 0, true);
    });

    it('lists partials without following symlinks', async () => {
      const hb = hbs.create();
      const originalGlob = fs.glob;
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-glob-options-'));
      const partialsDir = path.join(tempRoot, 'partials');
      let globOptions;

      await fs.mkdir(partialsDir, { recursive: true });

      fs.glob = async function* (_pattern, options) {
        globOptions = options;
      };

      try {
        hb.express({
          partialsDir,
          extname: '.hbs'
        });

        await hb.cachePartials();
        assert.equal(globOptions.cwd, partialsDir);
        assert.equal(globOptions.followSymlinks, false);
        assert.equal(globOptions.withFileTypes, true);
      } finally {
        fs.glob = originalGlob;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cacheLayout returns promise without callback', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-'));
      const layoutFile = path.join(tempRoot, 'layout.hbs');
      await fs.writeFile(layoutFile, 'layout', 'utf8');

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });
        const layouts = await hb.cacheLayout(path.join(tempRoot, 'layout'), true);
        assert.equal(layouts.length, 1);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cacheLayout keeps serving cached layouts even if the source file disappears', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-cache-'));
      const layoutFile = path.join(tempRoot, 'layout.hbs');

      await fs.writeFile(layoutFile, 'layout', 'utf8');

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });

        const firstLayouts = await hb.cacheLayout(path.join(tempRoot, 'layout'), true);
        assert.equal(firstLayouts[0]({}), 'layout');

        await fs.rm(layoutFile);

        const secondLayouts = await hb.cacheLayout(path.join(tempRoot, 'layout'), true);
        assert.equal(secondLayouts[0]({}), 'layout');
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cacheLayout only validates the filesystem before the first cached read', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-realpath-'));
      const layoutFile = path.join(tempRoot, 'layout.hbs');
      const originalRealpath = fs.realpath;
      let realpathCalls = 0;

      await fs.writeFile(layoutFile, 'layout', 'utf8');

      fs.realpath = async (...args) => {
        realpathCalls += 1;
        return originalRealpath(...args);
      };

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });

        await hb.cacheLayout(path.join(tempRoot, 'layout'), true);
        await hb.cacheLayout(path.join(tempRoot, 'layout'), true);

        assert.equal(realpathCalls, 2);
      } finally {
        fs.realpath = originalRealpath;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cacheLayout revalidates uncached symlinked layouts after the symlink target changes', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-symlink-'));
      const allowedRoot = path.join(tempRoot, 'allowed');
      const outsideRoot = path.join(tempRoot, 'outside');
      const safeFile = path.join(allowedRoot, 'safe.hbs');
      const outsideFile = path.join(outsideRoot, 'outside.hbs');
      const symlinkFile = path.join(allowedRoot, 'link.hbs');

      await fs.mkdir(allowedRoot, { recursive: true });
      await fs.mkdir(outsideRoot, { recursive: true });
      await fs.writeFile(safeFile, 'safe', 'utf8');
      await fs.writeFile(outsideFile, 'outside', 'utf8');
      await fs.symlink(safeFile, symlinkFile);

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: allowedRoot
        });

        const firstLayouts = await hb.cacheLayout(path.join(allowedRoot, 'link'), false);
        assert.equal(firstLayouts[0]({}), 'safe');

        await fs.rm(symlinkFile);
        await fs.symlink(outsideFile, symlinkFile);

        await assert.rejects(
          hb.cacheLayout(path.join(allowedRoot, 'link'), false),
          /does not reside in/
        );
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cacheLayout reads the layout path that passed symlink validation', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-symlink-race-'));
      const allowedRoot = path.join(tempRoot, 'allowed');
      const outsideRoot = path.join(tempRoot, 'outside');
      const safeFile = path.join(allowedRoot, 'safe.hbs');
      const outsideFile = path.join(outsideRoot, 'outside.hbs');
      const symlinkFile = path.join(allowedRoot, 'link.hbs');
      const originalRealpath = fs.realpath;
      let swapped = false;

      await fs.mkdir(allowedRoot, { recursive: true });
      await fs.mkdir(outsideRoot, { recursive: true });
      await fs.writeFile(safeFile, '<safe>{{{body}}}</safe>', 'utf8');
      await fs.writeFile(outsideFile, '<outside>{{{body}}}</outside>', 'utf8');
      await fs.symlink(safeFile, symlinkFile);

      fs.realpath = async (...args) => {
        const resolved = await originalRealpath(...args);
        if (!swapped && path.resolve(args[0]) === symlinkFile) {
          swapped = true;
          await fs.rm(symlinkFile);
          await fs.symlink(outsideFile, symlinkFile);
        }
        return resolved;
      };

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: allowedRoot
        });

        const layouts = await hb.cacheLayout(path.join(allowedRoot, 'link'), false);
        assert.equal(layouts[0]({ body: 'body' }), '<safe>body</safe>');
      } finally {
        fs.realpath = originalRealpath;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cacheLayout does not reuse cached layouts across different allowed roots', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-root-scope-'));
      const viewsA = path.join(tempRoot, 'viewsA');
      const viewsB = path.join(tempRoot, 'viewsB');
      const layoutFile = path.join(viewsA, 'layout.hbs');

      await fs.mkdir(viewsA, { recursive: true });
      await fs.mkdir(viewsB, { recursive: true });
      await fs.writeFile(layoutFile, '<layout>{{{body}}}</layout>', 'utf8');

      try {
        hb.express({ extname: '.hbs' });

        const firstLayouts = await hb._resolveLayoutTemplates(
          path.join(viewsA, 'page.hbs'),
          { declaredLayoutFile: undefined },
          { cache: true, layout: layoutFile },
          viewsA
        );
        assert.equal(firstLayouts.length, 1);

        await assert.rejects(
          hb._resolveLayoutTemplates(
            path.join(viewsB, 'page.hbs'),
            { declaredLayoutFile: undefined },
            { cache: true, layout: layoutFile },
            viewsB
          ),
          /does not reside in/
        );
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cacheLayout avoids newline-delimited cache key collisions', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-key-collision-'));
      const firstRoot = tempRoot;
      const secondRootPrefix = path.join(tempRoot, 'rootB.hbs');
      const firstLayoutFile = `${path.join(tempRoot, 'layout.hbs')}\n${secondRootPrefix}`;
      const secondLayoutFile = path.join(tempRoot, 'layout.hbs');
      const secondRoot = `${secondRootPrefix}\n${firstRoot}`;

      await fs.mkdir(path.dirname(firstLayoutFile), { recursive: true });
      await fs.mkdir(secondRoot, { recursive: true });
      await fs.writeFile(firstLayoutFile, 'first', 'utf8');
      await fs.writeFile(secondLayoutFile, 'second', 'utf8');

      try {
        hb.express({ extname: '.hbs' });

        const firstLayouts = await hb._cacheLayout(firstLayoutFile, true, firstRoot, firstRoot);
        assert.equal(firstLayouts[0]({}), 'first');

        await assert.rejects(
          hb._cacheLayout(secondLayoutFile, true, secondRoot, secondRoot),
          /does not reside in/
        );
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cacheLayout reuses the resolved restrictLayoutsTo root across layout files', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-root-realpath-'));
      const firstLayoutFile = path.join(tempRoot, 'first.hbs');
      const secondLayoutFile = path.join(tempRoot, 'second.hbs');
      const originalRealpath = fs.realpath;
      const rootPath = path.resolve(tempRoot);
      let rootRealpathCalls = 0;

      await fs.writeFile(firstLayoutFile, 'first', 'utf8');
      await fs.writeFile(secondLayoutFile, 'second', 'utf8');

      fs.realpath = async (...args) => {
        if (path.resolve(args[0]) === rootPath) {
          rootRealpathCalls += 1;
        }
        return originalRealpath(...args);
      };

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });

        await hb.cacheLayout(path.join(tempRoot, 'first'), false);
        await hb.cacheLayout(path.join(tempRoot, 'second'), false);

        assert.equal(rootRealpathCalls, 1);
      } finally {
        fs.realpath = originalRealpath;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('reuses cached restrictLayoutsTo realpaths through ensureInRestrictLayoutsTo', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-ensure-root-'));
      const layoutFile = path.join(tempRoot, 'layout.hbs');
      const originalRealpath = fs.realpath;
      const rootPath = path.resolve(tempRoot);
      let rootRealpathCalls = 0;

      await fs.writeFile(layoutFile, 'layout', 'utf8');

      fs.realpath = async (...args) => {
        if (path.resolve(args[0]) === rootPath) {
          rootRealpathCalls += 1;
        }
        return originalRealpath(...args);
      };

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });

        await hb._ensureInRestrictLayoutsTo(layoutFile);
        hb.layoutRestrictionRootRealpaths = new Map();
        await hb._ensureLayoutWithinRoot(layoutFile, tempRoot);

        assert.equal(rootRealpathCalls, 1);
      } finally {
        fs.realpath = originalRealpath;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cacheLayout callback returns success and errors', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-cb-'));
      const layoutFile = path.join(tempRoot, 'layout.hbs');
      await fs.writeFile(layoutFile, 'layout', 'utf8');

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });

        await new Promise((resolve, reject) => {
          hb.cacheLayout(path.join(tempRoot, 'layout'), true, (err, layouts) => {
            if (err) {
              reject(err);
              return;
            }
            assert.equal(Array.isArray(layouts), true);
            assert.equal(layouts.length, 1);
            resolve();
          });
        });

        await new Promise((resolve) => {
          hb.cacheLayout(path.join(os.tmpdir(), 'outside-layout'), true, (err, layouts) => {
            assert(err);
            assert.equal(layouts, null);
            resolve();
          });
        });
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('reuses cached declared layout parsing for cached templates', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-declared-layout-'));
      const templateFile = path.join(tempRoot, 'index.hbs');
      const layoutFile = path.join(tempRoot, 'layout.hbs');
      const originalDeclaredLayoutFile = hb.declaredLayoutFile;
      let declaredLayoutCalls = 0;

      await fs.writeFile(templateFile, '{{!< ./layout}}\nbody', 'utf8');
      await fs.writeFile(layoutFile, '<layout>{{{body}}}</layout>', 'utf8');

      hb.declaredLayoutFile = function(...args) {
        if (args[1] === templateFile) {
          declaredLayoutCalls += 1;
        }
        return originalDeclaredLayoutFile.apply(this, args);
      };

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });

        assert.equal(
          await hb._renderFile(templateFile, null, { cache: true, settings: { views: tempRoot } }),
          '<layout>body</layout>'
        );
        assert.equal(
          await hb._renderFile(templateFile, null, { cache: true, settings: { views: tempRoot } }),
          '<layout>body</layout>'
        );

        assert.equal(declaredLayoutCalls, 1);
      } finally {
        hb.declaredLayoutFile = originalDeclaredLayoutFile;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('rereads only changed layouts for uncached renders', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-refresh-'));
      const templateFile = path.join(tempRoot, 'index.hbs');
      const layoutFile = path.join(tempRoot, 'layout.hbs');
      const originalReadFile = fs.readFile;
      const readCounts = new Map();

      await fs.writeFile(templateFile, '{{!< ./layout}}\nbody', 'utf8');
      await fs.writeFile(layoutFile, '<layout>v1 {{{body}}}</layout>', 'utf8');

      fs.readFile = async function(filename, ...args) {
        const resolved = path.resolve(filename);
        readCounts.set(resolved, (readCounts.get(resolved) ?? 0) + 1);
        return originalReadFile.call(this, filename, ...args);
      };

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });

        assert.equal(
          await hb._renderFile(templateFile, null, { cache: false, settings: { views: tempRoot } }),
          '<layout>v1 body</layout>'
        );
        assert.equal(
          await hb._renderFile(templateFile, null, { cache: false, settings: { views: tempRoot } }),
          '<layout>v1 body</layout>'
        );

        await new Promise((resolve) => setTimeout(resolve, 20));
        await fs.writeFile(layoutFile, '<layout>v2 {{{body}}}</layout>', 'utf8');

        assert.equal(
          await hb._renderFile(templateFile, null, { cache: false, settings: { views: tempRoot } }),
          '<layout>v2 body</layout>'
        );

        assert.equal(readCounts.get(path.resolve(layoutFile)), 2);
      } finally {
        fs.readFile = originalReadFile;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('rereads only changed templates for uncached renders', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-template-refresh-'));
      const templateFile = path.join(tempRoot, 'index.hbs');
      const originalReadFile = fs.readFile;
      const readCounts = new Map();

      await fs.writeFile(templateFile, 'v1', 'utf8');

      fs.readFile = async function(filename, ...args) {
        const resolved = path.resolve(filename);
        readCounts.set(resolved, (readCounts.get(resolved) ?? 0) + 1);
        return originalReadFile.call(this, filename, ...args);
      };

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });

        assert.equal(
          await hb._renderFile(templateFile, null, { cache: false, settings: { views: tempRoot } }),
          'v1'
        );
        assert.equal(
          await hb._renderFile(templateFile, null, { cache: false, settings: { views: tempRoot } }),
          'v1'
        );

        await new Promise((resolve) => setTimeout(resolve, 20));
        await fs.writeFile(templateFile, 'v2', 'utf8');

        assert.equal(
          await hb._renderFile(templateFile, null, { cache: false, settings: { views: tempRoot } }),
          'v2'
        );

        assert.equal(readCounts.get(path.resolve(templateFile)), 2);
      } finally {
        fs.readFile = originalReadFile;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('detects uncached template changes when size and mtime are preserved', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-template-metadata-'));
      const templateFile = path.join(tempRoot, 'index.hbs');

      await fs.writeFile(templateFile, 'v1', 'utf8');

      try {
        hb.express({ viewsDir: tempRoot });
        const renderOptions = { cache: false, settings: { views: tempRoot } };

        assert.equal(await hb._renderFile(templateFile, null, renderOptions), 'v1');

        const originalStat = await fs.stat(templateFile);
        await new Promise((resolve) => setTimeout(resolve, 20));
        await fs.writeFile(templateFile, 'v2', 'utf8');
        await fs.utimes(templateFile, originalStat.atimeMs / 1000, originalStat.mtimeMs / 1000);

        const changedStat = await fs.stat(templateFile);
        assert.equal(changedStat.size, originalStat.size);
        assert.equal(changedStat.mtimeMs, originalStat.mtimeMs);
        assert.notEqual(changedStat.ctimeMs, originalStat.ctimeMs);
        assert.equal(await hb._renderFile(templateFile, null, renderOptions), 'v2');
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cachePartials callback returns error for missing directory', async () => {
      const hb = hbs.create();
      hb.express({
        partialsDir: path.join(issuesDir, '__missing_partials__')
      });

      await new Promise((resolve) => {
        hb.cachePartials((err) => {
          assert(err);
          resolve();
        });
      });
    });

    it('cachePartials handles empty partialsDir config', async () => {
      const hb = hbs.create();
      hb.express({});
      const result = await hb._cachePartials('/tmp');
      assert.equal(result, true);
    });

    it('skips non-template files in partial directories', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-partials-'));
      const partialsDir = path.join(tempRoot, 'partials');
      await fs.mkdir(partialsDir, { recursive: true });
      await fs.writeFile(path.join(partialsDir, 'ok.hbs'), 'ok', 'utf8');
      await fs.writeFile(path.join(partialsDir, 'skip.txt'), 'skip', 'utf8');

      try {
        hb.express({
          partialsDir,
          extname: '.hbs'
        });
        await hb.cachePartials();
        assert.equal(hb.partialsManifest.some((entry) => entry.fullPath.endsWith('.txt')), false);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('invalidates partial manifest caches', () => {
      const hb = hbs.create();
      hb.isPartialCachingComplete = true;
      hb.partialsManifest = [];
      hb.partialsManifestKey = 'x';
      hb.partialsSourceCache = new Map();
      hb.partialsMetadataCache = new Map();
      hb.invalidatePartialsManifest();
      assert.equal(hb.isPartialCachingComplete, false);
      assert.equal(hb.partialsManifest, null);
      assert.equal(hb.partialsManifestKey, null);
      assert.equal(hb.partialsSourceCache, null);
      assert.equal(hb.partialsMetadataCache, null);
    });

    it('does not unregister user-overridden managed partials', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-partial-override-'));
      const partialsDir = path.join(tempRoot, 'partials');

      await fs.mkdir(partialsDir, { recursive: true });
      await fs.writeFile(path.join(partialsDir, 'kept.hbs'), 'managed', 'utf8');

      try {
        hb.express({
          partialsDir,
          extname: '.hbs'
        });

        await hb.cachePartials();
        hb.handlebars.registerPartial('kept', 'manual');
        hb.invalidatePartialsManifest();

        assert.equal(hb.handlebars.compile('{{> kept}}')({}), 'manual');
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('refreshPartialsManifest rescans partial files during cached renders', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-partial-refresh-manifest-'));
      const partialsDir = path.join(tempRoot, 'partials');
      const viewsDir = path.join(tempRoot, 'views');
      const renderOptions = { cache: true, settings: { views: viewsDir } };
      const addedPartial = path.join(partialsDir, 'added.hbs');

      await fs.mkdir(partialsDir, { recursive: true });
      await fs.mkdir(viewsDir, { recursive: true });
      await fs.writeFile(path.join(partialsDir, 'existing.hbs'), 'existing-v1', 'utf8');

      try {
        hb.express({
          extname: '.hbs',
          partialsDir,
          viewsDir,
          refreshPartialsManifest: true
        });

        assert.equal(
          await hb._renderFile(path.join(viewsDir, 'existing.hbs'), '{{> existing}}', renderOptions),
          'existing-v1'
        );

        await fs.writeFile(addedPartial, 'added-v1', 'utf8');

        assert.equal(
          await hb._renderFile(path.join(viewsDir, 'added.hbs'), '{{> added}}', renderOptions),
          'added-v1'
        );

        await fs.rm(addedPartial);

        await assert.rejects(
          hb._renderFile(path.join(viewsDir, 'added.hbs'), '{{> added}}', renderOptions),
          /partial added could not be found/i
        );
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('preserves later partial directory precedence when an earlier duplicate changes', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-partial-precedence-'));
      const firstPartialsDir = path.join(tempRoot, 'first');
      const secondPartialsDir = path.join(tempRoot, 'second');
      const viewsDir = path.join(tempRoot, 'views');
      const firstPartial = path.join(firstPartialsDir, 'shared.hbs');

      await fs.mkdir(firstPartialsDir, { recursive: true });
      await fs.mkdir(secondPartialsDir, { recursive: true });
      await fs.mkdir(viewsDir, { recursive: true });
      await fs.writeFile(firstPartial, 'first', 'utf8');
      await fs.writeFile(path.join(secondPartialsDir, 'shared.hbs'), 'second', 'utf8');

      try {
        hb.express({
          partialsDir: [firstPartialsDir, secondPartialsDir],
          viewsDir
        });

        const renderOptions = { cache: false, settings: { views: viewsDir } };
        const templateFile = path.join(viewsDir, 'inline.hbs');

        assert.equal(await hb._renderFile(templateFile, '{{> shared}}', renderOptions), 'second');

        await new Promise((resolve) => setTimeout(resolve, 20));
        await fs.writeFile(firstPartial, 'first-updated', 'utf8');

        assert.equal(await hb._renderFile(templateFile, '{{> shared}}', renderOptions), 'second');
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('defers partial compilation until a partial is actually rendered', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-lazy-partials-'));
      const partialsDir = path.join(tempRoot, 'partials');
      const viewsDir = path.join(tempRoot, 'views');
      let partialCompileCount = 0;

      await fs.mkdir(partialsDir, { recursive: true });
      await fs.mkdir(viewsDir, { recursive: true });
      await fs.writeFile(path.join(partialsDir, 'used.hbs'), 'used', 'utf8');
      await fs.writeFile(path.join(partialsDir, 'unused.hbs'), 'unused', 'utf8');

      try {
        hb.express({
          extname: '.hbs',
          partialsDir,
          viewsDir,
          onCompile(instance, source, filename) {
            if (filename?.startsWith(partialsDir)) {
              partialCompileCount += 1;
            }

            return instance.handlebars.compile(source);
          }
        });

        await hb.cachePartials();
        assert.equal(partialCompileCount, 0);

        assert.equal(
          await hb._renderFile(path.join(viewsDir, 'inline.hbs'), '{{> used}}', { cache: true, settings: { views: viewsDir } }),
          'used'
        );
        assert.equal(partialCompileCount, 1);

        assert.equal(
          await hb._renderFile(path.join(viewsDir, 'inline.hbs'), '{{> used}}', { cache: true, settings: { views: viewsDir } }),
          'used'
        );
        assert.equal(partialCompileCount, 1);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('rereads only changed partial sources for uncached renders', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-partial-refresh-'));
      const partialsDir = path.join(tempRoot, 'partials');
      const viewsDir = path.join(tempRoot, 'views');
      const usedPartialFile = path.join(partialsDir, 'used.hbs');
      const unusedPartialFile = path.join(partialsDir, 'unused.hbs');
      const originalReadFile = fs.readFile;
      const readCounts = new Map();

      await fs.mkdir(partialsDir, { recursive: true });
      await fs.mkdir(viewsDir, { recursive: true });
      await fs.writeFile(usedPartialFile, 'used-v1', 'utf8');
      await fs.writeFile(unusedPartialFile, 'unused-v1', 'utf8');

      fs.readFile = async function(filename, ...args) {
        const resolved = path.resolve(filename);
        readCounts.set(resolved, (readCounts.get(resolved) ?? 0) + 1);
        return originalReadFile.call(this, filename, ...args);
      };

      try {
        hb.express({
          extname: '.hbs',
          partialsDir,
          viewsDir
        });

        assert.equal(
          await hb._renderFile(path.join(viewsDir, 'inline.hbs'), '{{> used}}', { cache: false, settings: { views: viewsDir } }),
          'used-v1'
        );

        assert.equal(
          await hb._renderFile(path.join(viewsDir, 'inline.hbs'), '{{> used}}', { cache: false, settings: { views: viewsDir } }),
          'used-v1'
        );

        await new Promise((resolve) => setTimeout(resolve, 20));
        await fs.writeFile(usedPartialFile, 'used-v2', 'utf8');

        assert.equal(
          await hb._renderFile(path.join(viewsDir, 'inline.hbs'), '{{> used}}', { cache: false, settings: { views: viewsDir } }),
          'used-v2'
        );

        assert.equal(readCounts.get(path.resolve(usedPartialFile)), 2);
        assert.equal(readCounts.get(path.resolve(unusedPartialFile)), 1);
      } finally {
        fs.readFile = originalReadFile;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('removes stale managed partials when the manifest is invalidated', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-partial-delete-'));
      const partialsDir = path.join(tempRoot, 'partials');
      const viewsDir = path.join(tempRoot, 'views');
      const partialFile = path.join(partialsDir, 'gone.hbs');

      await fs.mkdir(partialsDir, { recursive: true });
      await fs.mkdir(viewsDir, { recursive: true });
      await fs.writeFile(partialFile, 'gone-v1', 'utf8');

      try {
        hb.express({
          extname: '.hbs',
          partialsDir,
          viewsDir
        });

        assert.equal(
          await hb._renderFile(path.join(viewsDir, 'inline.hbs'), '{{> gone}}', { cache: false, settings: { views: viewsDir } }),
          'gone-v1'
        );

        await fs.rm(partialFile);
        hb.invalidatePartialsManifest();

        await assert.rejects(
          hb._renderFile(path.join(viewsDir, 'inline.hbs'), '{{> gone}}', { cache: false, settings: { views: viewsDir } }),
          /partial gone could not be found/i
        );
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('removes managed partials when reconfiguring the same instance', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-partial-reconfigure-'));
      const oldPartialsDir = path.join(tempRoot, 'old');
      const newPartialsDir = path.join(tempRoot, 'new');
      const viewsDir = path.join(tempRoot, 'views');

      await fs.mkdir(oldPartialsDir, { recursive: true });
      await fs.mkdir(newPartialsDir, { recursive: true });
      await fs.mkdir(viewsDir, { recursive: true });
      await fs.writeFile(path.join(oldPartialsDir, 'old.hbs'), 'old-partial', 'utf8');

      try {
        hb.express({
          extname: '.hbs',
          partialsDir: oldPartialsDir,
          viewsDir
        });

        assert.equal(
          await hb._renderFile(path.join(viewsDir, 'inline.hbs'), '{{> old}}', { cache: false, settings: { views: viewsDir } }),
          'old-partial'
        );

        hb.express({
          extname: '.hbs',
          partialsDir: newPartialsDir,
          viewsDir
        });

        await assert.rejects(
          hb._renderFile(path.join(viewsDir, 'inline.hbs'), '{{> old}}', { cache: false, settings: { views: viewsDir } }),
          /partial old could not be found/i
        );
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('accepts external handlebars in express options', () => {
      const hb = hbs.create();
      const external = handlebars.create();
      hb.express({ handlebars: external });
      assert.equal(hb.handlebars, external);
    });

    it('syncs SafeString and Utils aliases when changing handlebars instances', () => {
      const hb = hbs.create();
      const originalSafeString = hb.SafeString;
      const originalUtils = hb.Utils;
      const external = handlebars.create();
      class ExternalSafeString {}
      external.SafeString = ExternalSafeString;
      external.Utils = {
        escapeExpression(value) {
          return `external:${value}`;
        }
      };

      hb.express({ handlebars: external });
      assert.equal(hb.SafeString, ExternalSafeString);
      assert.equal(hb.Utils, external.Utils);

      hb.express({});
      assert.equal(hb.SafeString, originalSafeString);
      assert.equal(hb.Utils, originalUtils);
    });

    it('supports express4 alias as drop-in replacement', () => {
      const hb = hbs.create();
      const render = hb.express4({});
      assert.equal(typeof render, 'function');
    });

    it('loadDefaultLayout callback works', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-default-layout-'));
      const layoutFile = path.join(tempRoot, 'default.hbs');
      await fs.writeFile(layoutFile, '{{{body}}}', 'utf8');

      try {
        hb.express({
          extname: '.hbs',
          defaultLayout: path.join(tempRoot, 'default'),
          restrictLayoutsTo: tempRoot
        });

        await new Promise((resolve, reject) => {
          hb.loadDefaultLayout(true, (err, templates) => {
            if (err) {
              reject(err);
              return;
            }
            assert.equal(Array.isArray(templates), true);
            assert.equal(templates.length, 1);
            resolve();
          });
        });
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('loadDefaultLayout supports promise mode and callback errors', async () => {
      const hb = hbs.create();
      hb.express({
        extname: '.hbs'
      });

      const result = await hb.loadDefaultLayout(true);
      assert.equal(result, null);

      hb.express({
        extname: '.hbs',
        defaultLayout: path.join(issuesDir, '__missing_layout__')
      });

      await new Promise((resolve) => {
        hb.loadDefaultLayout(true, (err) => {
          assert(err);
          resolve();
        });
      });
    });

    it('reuses cached default layout templates in promise mode', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-default-layout-cache-'));
      const layoutFile = path.join(tempRoot, 'default.hbs');
      const originalCacheLayout = hb._cacheLayout;
      let cacheLayoutCalls = 0;

      await fs.writeFile(layoutFile, '{{{body}}}', 'utf8');

      hb._cacheLayout = async function(...args) {
        cacheLayoutCalls += 1;
        return originalCacheLayout.apply(this, args);
      };

      try {
        hb.express({
          extname: '.hbs',
          defaultLayout: path.join(tempRoot, 'default'),
          restrictLayoutsTo: tempRoot
        });

        const first = await hb._loadDefaultLayout(true, tempRoot);
        const second = await hb._loadDefaultLayout(true, tempRoot);

        assert.equal(first.length, 1);
        assert.equal(second, hb.defaultLayoutTemplates);
        assert.equal(cacheLayoutCalls, 1);
      } finally {
        hb._cacheLayout = originalCacheLayout;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('does not seed the production default layout cache from an uncached render', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-default-layout-mode-'));
      const layoutFile = path.join(tempRoot, 'default.hbs');

      await fs.writeFile(layoutFile, 'v1 {{{body}}}', 'utf8');

      try {
        hb.express({
          extname: '.hbs',
          defaultLayout: path.join(tempRoot, 'default'),
          restrictLayoutsTo: tempRoot
        });

        assert.equal(
          await hb._renderFile(path.join(tempRoot, 'inline.hbs'), 'page', {
            cache: false,
            settings: { views: tempRoot }
          }),
          'v1 page'
        );

        await fs.writeFile(layoutFile, 'v2 {{{body}}}', 'utf8');

        assert.equal(
          await hb._renderFile(path.join(tempRoot, 'inline.hbs'), 'page', {
            cache: true,
            settings: { views: tempRoot }
          }),
          'v2 page'
        );
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('does not load the default layout when render options disable layouts', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-default-layout-skip-'));
      const defaultLayoutFile = path.join(tempRoot, 'default.hbs');
      const originalLoadDefaultLayout = hb._loadDefaultLayout;
      let loadDefaultLayoutCalls = 0;

      await fs.writeFile(defaultLayoutFile, '<layout>{{{body}}}</layout>', 'utf8');

      hb._loadDefaultLayout = async function(...args) {
        loadDefaultLayoutCalls += 1;
        return originalLoadDefaultLayout.apply(this, args);
      };

      try {
        hb.express({
          extname: '.hbs',
          defaultLayout: path.join(tempRoot, 'default'),
          restrictLayoutsTo: tempRoot
        });

        assert.equal(
          await hb._renderFile(path.join(tempRoot, 'inline.hbs'), 'body', {
            cache: true,
            layout: null,
            settings: { views: tempRoot }
          }),
          'body'
        );
        assert.equal(loadDefaultLayoutCalls, 0);
      } finally {
        hb._loadDefaultLayout = originalLoadDefaultLayout;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('does not resolve declarative layouts when render options disable layouts', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-declared-layout-skip-'));
      const originalCacheLayout = hb._cacheLayout;
      let cacheLayoutCalls = 0;

      hb._cacheLayout = async function(...args) {
        cacheLayoutCalls += 1;
        return originalCacheLayout.apply(this, args);
      };

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });

        assert.equal(
          await hb._renderFile(path.join(tempRoot, 'inline.hbs'), '{{!< ./layout}}\nbody', {
            cache: true,
            layout: false,
            settings: { views: tempRoot }
          }),
          'body'
        );
        assert.equal(cacheLayoutCalls, 0);
      } finally {
        hb._cacheLayout = originalCacheLayout;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('cachePartials callback returns success result', async () => {
      const hb = hbs.create();
      hb.express({
        partialsDir: path.join(issuesDir, '23/partials'),
        extname: '.hbs'
      });

      await new Promise((resolve, reject) => {
        hb.cachePartials((err, result) => {
          if (err) {
            reject(err);
            return;
          }
          assert.equal(result, true);
          resolve();
        });
      });
    });

    it('compile throws when source is not a string', () => {
      const hb = hbs.create();
      assert.throws(() => hb.compile(12), /registerPartial must be a string/);
    });

    it('resets onCompile when reconfiguring the same instance', async () => {
      const hb = hbs.create();
      hb.express({
        onCompile(_instance, source) {
          return () => `compiled:${source}`;
        }
      });

      assert.equal(await hb._renderFile('/tmp/inline.hbs', 'first', {}), 'compiled:first');

      hb.express({});
      assert.equal(await hb._renderFile('/tmp/inline.hbs', 'second', {}), 'second');
    });

    it('stops using external handlebars when a later express call omits them', async () => {
      const hb = hbs.create();
      const external = handlebars.create();
      external.registerHelper('externalOnly', () => 'external');

      hb.express({ handlebars: external });
      assert.equal(
        await hb._renderFile('/tmp/inline.hbs', '{{externalOnly "x"}}', {}),
        'external '
      );

      hb.express({});
      await assert.rejects(
        hb._renderFile('/tmp/inline.hbs', '{{externalOnly "x"}}', {}),
        /Missing helper|externalOnly/
      );
    });

    it('removes i18n helpers when reconfiguring without i18n', async () => {
      const hb = hbs.create();
      hb.express({
        i18n: {
          __() {
            return 'translated';
          },
          __n() {
            return 'translated-many';
          }
        }
      });

      assert.equal(await hb._renderFile('/tmp/inline.hbs', '{{__ "x"}}', {}), 'translated ');

      hb.express({});
      await assert.rejects(
        hb._renderFile('/tmp/inline.hbs', '{{__ "x"}}', {}),
        /Missing helper|Could not find property|__/
      );
    });

    it('registerAsyncHelper throws when resolver cache is missing', () => {
      const hb = hbs.create();
      hb.registerAsyncHelper('x', (value, cb) => cb(value));
      assert.throws(() => hb.handlebars.helpers.x.call({}, 'hello'), /Could not find resolver cache/);
    });

    it('supports promise-returning async helpers', async () => {
      const hb = hbs.create();
      hb.express({});
      hb.registerAsyncHelper('later', async (value) => `async:${value}`);

      assert.equal(
        await hb._renderFile('/tmp/inline.hbs', '{{later "x"}}!', {}),
        'async:x!'
      );
    });

    it('keeps async helpers on the internal resolver cache when context shadows it', async () => {
      const hb = hbs.create();
      hb.express({});
      hb.registerAsyncHelper('later', async (value) => `<${value}>`);

      assert.equal(
        await hb._renderFile('/tmp/inline.hbs', '{{#with item}}{{later "x"}}{{/with}}', {
          item: {
            resolverCache: Object.create(null)
          }
        }),
        '&lt;x&gt;'
      );
    });

    it('rejects async helper failures even when placeholders are removed from the output', async () => {
      const hb = hbs.create();
      hb.express({});
      hb.registerAsyncHelper('boom', async () => {
        throw new Error('hidden-boom');
      });

      await assert.rejects(
        hb._renderFile('/tmp/inline.hbs', '{{#contentFor "unused"}}{{boom}}{{/contentFor}}ok', {}),
        /hidden-boom/
      );
    });

    it('renders nullish async helper values like synchronous helpers', async () => {
      const hb = hbs.create();
      hb.express({});
      hb.registerAsyncHelper('undef', async () => undefined);
      hb.registerAsyncHelper('nil', async () => null);

      assert.equal(
        await hb._renderFile('/tmp/inline.hbs', 'a{{undef}}b|a{{{undef}}}b|a{{nil}}b|a{{{nil}}}b', {}),
        'ab|ab|ab|ab'
      );
    });

    it('passes three and variadic async helper arguments with options', async () => {
      const hb = hbs.create();
      hb.express({});
      hb.registerAsyncHelper('three', (a, b, c, cb) => {
        cb(`${a}:${b}:${c}`);
      });
      hb.registerAsyncHelper('threeOptions', (a, b, c, options, cb) => {
        cb(`${options.hash.prefix}:${a}:${b}:${c}`);
      });
      hb.registerAsyncHelper('many', (a, b, c, d, cb) => {
        cb(`${a}:${b}:${c}:${d}`);
      });
      const manyOptions = (...args) => {
        const [a, b, c, d, options, cb] = args;
        cb(`${options.hash.prefix}:${a}:${b}:${c}:${d}`);
      };
      Object.defineProperty(manyOptions, 'length', { value: 6 });
      hb.registerAsyncHelper('manyOptions', manyOptions);

      assert.equal(
        await hb._renderFile(
          '/tmp/inline.hbs',
          '{{three "a" "b" "c"}}|{{threeOptions "a" "b" "c" prefix="p"}}|{{many "a" "b" "c" "d"}}|{{manyOptions "a" "b" "c" "d" prefix="q"}}.',
          {}
        ),
        'a:b:c|p:a:b:c|a:b:c:d|q:a:b:c:d.'
      );
    });

    it('drains successful async helper values removed from output', async () => {
      const hb = hbs.create();
      let completed = false;

      hb.express({});
      hb.registerAsyncHelper('later', () => new Promise((resolve) => {
        setTimeout(() => {
          completed = true;
          resolve('hidden');
        }, 1);
      }));

      assert.equal(
        await hb._renderFile('/tmp/inline.hbs', '{{#contentFor "unused"}}{{later}}{{/contentFor}}ok', {}),
        'ok'
      );
      assert.equal(completed, true);
    });

    it('rejects invalid render options and callbacks', async () => {
      const hb = hbs.create();
      hb.express({
        restrictLayoutsTo: issuesDir
      });

      await assert.rejects(
        hb._renderFile(path.join(issuesDir, '23/index.hbs'), null, 'bad'),
        /render options must be an object/
      );

      await assert.rejects(
        hb._renderFile(path.join(issuesDir, '23/index.hbs'), null, { settings: { views: [''] } }),
        /views entries must be non-empty strings/
      );

      await assert.rejects(
        hb._renderFile(path.join(issuesDir, '23/index.hbs'), null, { signal: {} }),
        /render options signal must be an AbortSignal/
      );

      assert.equal(
        await hb._renderFile('/tmp/inline.hbs', 'ok', {
          settings: Object.create({ views: [''] })
        }),
        'ok'
      );

      assert.throws(
        () => hb.___express(path.join(issuesDir, '23/index.hbs'), {}, {}),
        /Render callback must be a function/
      );
    });

    it('honors aborted render signals before rendering', async () => {
      const hb = hbs.create();
      const controller = new AbortController();
      hb.express({});

      controller.abort(new Error('render stopped'));

      await assert.rejects(
        hb._renderFile('/tmp/inline.hbs', 'ok', { signal: controller.signal }),
        /render stopped/
      );
    });

    it('passes render signals through template reads', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-render-signal-'));
      const templateFile = path.join(tempRoot, 'index.hbs');
      const controller = new AbortController();
      const originalReadFile = fs.readFile;
      let seenSignal;

      await fs.writeFile(templateFile, 'ok', 'utf8');

      fs.readFile = async function(filename, options) {
        seenSignal = options.signal;
        return originalReadFile.call(this, filename, options);
      };

      try {
        hb.express({});
        assert.equal(
          await hb._renderFile(templateFile, null, { signal: controller.signal }),
          'ok'
        );
        assert.equal(seenSignal, controller.signal);
      } finally {
        fs.readFile = originalReadFile;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('passes render signals through layout and partial reads', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-render-signal-assets-'));
      const partialsDir = path.join(tempRoot, 'partials');
      const viewsDir = path.join(tempRoot, 'views');
      const layoutFile = path.join(tempRoot, 'layout.hbs');
      const partialFile = path.join(partialsDir, 'piece.hbs');
      const controller = new AbortController();
      const originalReadFile = fs.readFile;
      let layoutSignal;
      let partialSignal;

      await fs.mkdir(partialsDir, { recursive: true });
      await fs.mkdir(viewsDir, { recursive: true });
      await fs.writeFile(layoutFile, '<layout>{{{body}}}</layout>', 'utf8');
      await fs.writeFile(partialFile, 'piece', 'utf8');

      fs.readFile = async function(filename, options) {
        const resolved = path.resolve(filename);
        if (resolved === path.resolve(layoutFile)) {
          layoutSignal = options.signal;
        }
        if (resolved === path.resolve(partialFile)) {
          partialSignal = options.signal;
        }
        return originalReadFile.call(this, filename, options);
      };

      try {
        hb.express({
          extname: '.hbs',
          defaultLayout: layoutFile,
          partialsDir,
          viewsDir,
          restrictLayoutsTo: tempRoot
        });

        assert.equal(
          await hb._renderFile(path.join(viewsDir, 'inline.hbs'), '{{> piece}}', {
            signal: controller.signal,
            settings: { views: viewsDir }
          }),
          '<layout>piece</layout>'
        );
        assert.equal(layoutSignal, controller.signal);
        assert.equal(partialSignal, controller.signal);
      } finally {
        fs.readFile = originalReadFile;
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('reports a clear safe-root error for options.layout without viewsDir', async () => {
      const hb = hbs.create();
      hb.express({});

      await assert.rejects(
        hb._renderFile('/tmp/inline.hbs', 'body', { layout: 'default' }),
        /Cannot resolve a safe root for options\.layout/
      );
    });

    it('rejects circular layout chains', async () => {
      const hb = hbs.create();
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-cycle-'));
      const layoutFile = path.join(tempRoot, 'layout.hbs');

      await fs.writeFile(layoutFile, '{{!< ./layout}}\n{{{body}}}', 'utf8');

      try {
        hb.express({
          extname: '.hbs',
          restrictLayoutsTo: tempRoot
        });

        await assert.rejects(
          hb.cacheLayout(path.join(tempRoot, 'layout'), false),
          /circular layout dependency/i
        );
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('ignores untracked async placeholder lookalikes during resolution', async () => {
      const hb = hbs.create();
      assert.equal(
        await hb._resolveAsyncHtml(Object.create(null), '__aSyNcId__<_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__'),
        '__aSyNcId__<_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__'
      );
    });

    it('resolves nested async placeholder chains', async () => {
      const hb = hbs.create();
      const firstId = '__aSyNcId__<_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__';
      const secondId = '__aSyNcId__<_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb__';

      const resolverCache = {
        [firstId]: Promise.resolve(secondId),
        [secondId]: Promise.resolve('done')
      };

      assert.equal(
        await hb._resolveAsyncHtml(resolverCache, `<p>${firstId}</p>`),
        '<p>done</p>'
      );
    });

    it('rejects cyclic async placeholder chains', async () => {
      const hb = hbs.create();
      const firstId = '__aSyNcId__<_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__';
      const secondId = '__aSyNcId__<_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb__';

      const resolverCache = {
        [firstId]: Promise.resolve(secondId),
        [secondId]: Promise.resolve(firstId)
      };

      await assert.rejects(
        hb._resolveAsyncHtml(resolverCache, firstId),
        /unresolved async placeholder/i
      );
    });

    it('replaceValue returns input for non-string or empty replacement list', () => {
      const hb = hbs.create();
      assert.equal(hb._replaceValue(12, []), 12);
      assert.equal(hb._replaceValue('text', []), 'text');
    });

    it('restores pre-existing body locals after rendering layouts and layout errors', () => {
      const hb = hbs.create();
      const locals = { body: 'original' };
      const template = () => 'inner';
      template.__filename = 'template.hbs';

      const layout = (layoutLocals) => `<layout>${layoutLocals.body}</layout>`;
      layout.__filename = 'layout.hbs';
      assert.equal(
        hb._renderWithLayouts(template, locals, [layout]),
        '<layout>inner</layout>'
      );
      assert.equal(locals.body, 'original');

      const failingLayout = () => {
        throw new Error('layout failed');
      };
      failingLayout.__filename = 'layout.hbs';

      assert.throws(
        () => hb._renderWithLayouts(template, locals, [failingLayout]),
        /layout failed/
      );
      assert.equal(locals.body, 'original');
    });

    it('renders layout body without invoking polluted prototype setters', () => {
      const hb = hbs.create();
      const locals = {};
      const template = () => 'inner';
      let layoutSawOwnBody = false;
      let setterCalls = 0;

      template.__filename = 'template.hbs';

      const layout = (layoutLocals) => {
        layoutSawOwnBody = Object.hasOwn(layoutLocals, 'body');
        return `<layout>${layoutLocals.body}</layout>`;
      };
      layout.__filename = 'layout.hbs';

      Object.defineProperty(Object.prototype, 'body', {
        configurable: true,
        set() {
          setterCalls += 1;
        }
      });

      try {
        assert.equal(
          hb._renderWithLayouts(template, locals, [layout]),
          '<layout>inner</layout>'
        );
        assert.equal(layoutSawOwnBody, true);
        assert.equal(setterCalls, 0);
        assert.equal(Object.hasOwn(locals, 'body'), false);
      } finally {
        delete Object.prototype.body;
      }
    });

    it('does not treat literal async id prefixes as unresolved helpers', async () => {
      const hb = hbs.create();
      hb.registerAsyncHelper('x', (value, cb) => cb(value));
      assert.equal(
        await hb._renderFile('/tmp/inline.hbs', 'literal __aSyNcId__ text', {}),
        'literal __aSyNcId__ text'
      );
    });

    it('does not replace user-supplied async placeholder lookalikes', async () => {
      const hb = hbs.create();
      hb.registerAsyncHelper('secret', cb => cb('<b>X</b>'));

      assert.equal(
        await hb._renderFile(
          '/tmp/inline.hbs',
          '{{secret}}|{{text}}|{{{text}}}',
          { text: '__aSyNcId__<_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__' }
        ),
        '&lt;b&gt;X&lt;/b&gt;|__aSyNcId__&lt;_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__|__aSyNcId__<_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__'
      );
    });

    it('picks up helper changes after a template has already rendered', () => {
      const instance = handlebars.create();
      const template = instance.compile('{{format value}}');

      instance.registerHelper('format', value => `a:${value}`);
      assert.equal(template({ value: 'x' }), 'a:x');

      instance.registerHelper('format', value => `b:${value}`);
      assert.equal(template({ value: 'x' }), 'b:x');
    });
  });
});
