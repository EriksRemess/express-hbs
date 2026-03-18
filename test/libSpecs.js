import hbs from '#hbs';
import { HandlebarsEnvironment } from '#handlebars/base';
import { createNewLookupObject } from '#handlebars/internal/create-new-lookup-object';
import { done, hasResolvers, resolve } from '#lib/resolver';
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

describe('lib helpers', () => {
  const issuesDir = fromHere(import.meta.url, 'issues');

  describe('resolver', () => {
    it('should detect resolver token at string start', () => {
      assert.equal(hasResolvers('__aSyNcId__x'), true);
    });

    it('should support map-based resolver cache', async () => {
      const cache = new Map();
      const id = resolve(cache, (_, cb) => {
        cb('resolved');
      });

      assert.equal(cache.has(id), true);
      assert.match(id, /^__aSyNcId__<_[A-Za-z_]{8}__$/);
      const values = await resolveCache(cache);
      assert.equal(values[id], 'resolved');
    });

    it('should reject when resolver callback throws', async () => {
      const cache = Object.create(null);
      resolve(cache, () => {
        throw new Error('boom');
      });
      await assert.rejects(done(cache), /boom/);
    });

    it('should reject invalid resolver inputs', () => {
      assert.throws(() => resolve(null, () => {}, undefined), /Resolver cache must be a Map or an object/);
      assert.throws(() => resolve({}, null, undefined), /Resolver callback must be a function/);
      assert.throws(() => done({}, 'bad-callback'), /Resolver completion callback must be a function/);
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

    it('rejects invalid locals for local template options', () => {
      const hb = hbs.create();
      assert.throws(() => hb.updateLocalTemplateOptions(null, { x: 1 }), /locals must be an object/);
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

    it('handles non-object template options sources', () => {
      const hb = hbs.create();
      const template = (_localsArg, templateOptions) => templateOptions;
      template.__filename = 'x.hbs';

      hb.updateTemplateOptions('bad');
      const templateOptions = hb._renderTemplate(template, {});
      assert.deepEqual(templateOptions, {});
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

    it('handles path helpers edge cases', () => {
      const hb = hbs.create();
      assert.equal(hb.layoutPath('/tmp/a.hbs', 'layout', []), undefined);
      assert.throws(() => hb.layoutPath('/tmp/a.hbs', {}, '/tmp'), /layout must be a non-empty string/);
      assert.equal(hb._toErrorFilename(undefined, '/tmp'), undefined);
      hb._ensureInRestrictLayoutsTo('/tmp/a.hbs');
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

    it('lists partials recursively with fs.glob', async () => {
      const hb = hbs.create();
      hb.express({
        partialsDir: path.join(issuesDir, '23/partials'),
        extname: '.hbs'
      });

      await hb.cachePartials();
      assert.equal(hb.partialsManifest.length > 0, true);
    });

    it('falls back when fs.glob does not support withFileTypes', async () => {
      const hb = hbs.create();
      const originalGlob = fs.glob;

      fs.glob = async function* () {
        throw new TypeError('fs.glob does not support options.withFileTypes yet. Please open an issue on GitHub.');
      };

      try {
        hb.express({
          partialsDir: path.join(issuesDir, '23/partials'),
          extname: '.hbs'
        });

        await hb.cachePartials();
        assert.equal(hb.partialsManifest.length > 0, true);
      } finally {
        fs.glob = originalGlob;
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
      hb.partialsManifest = [];
      hb.partialsManifestKey = 'x';
      hb.partialsSourceCache = new Map();
      hb.invalidatePartialsManifest();
      assert.equal(hb.partialsManifest, null);
      assert.equal(hb.partialsManifestKey, null);
      assert.equal(hb.partialsSourceCache, null);
    });

    it('accepts external handlebars in express options', () => {
      const hb = hbs.create();
      const external = handlebars.create();
      hb.express({ handlebars: external });
      assert.equal(hb.handlebars, external);
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

    it('compile throws when source is not a string', () => {
      const hb = hbs.create();
      assert.throws(() => hb.compile(12), /registerPartial must be a string/);
    });

    it('registerAsyncHelper throws when resolver cache is missing', () => {
      const hb = hbs.create();
      hb.registerAsyncHelper('x', (value, cb) => cb(value));
      assert.throws(() => hb.handlebars.helpers.x.call({}, 'hello'), /Could not find resolver cache/);
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

      assert.throws(
        () => hb.___express(path.join(issuesDir, '23/index.hbs'), {}, {}),
        /Render callback must be a function/
      );
    });

    it('rejects unresolved async placeholder loops', async () => {
      const hb = hbs.create();
      await assert.rejects(
        hb._resolveAsyncHtml(Object.create(null), '__aSyNcId__not-real'),
        /unresolved async placeholder/i
      );
    });

    it('resolves nested async placeholder chains', async () => {
      const hb = hbs.create();
      const firstId = '__aSyNcId__<_aaaaaaab__';
      const secondId = '__aSyNcId__<_aaaaaaac__';

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
      const firstId = '__aSyNcId__<_aaaaaaab__';
      const secondId = '__aSyNcId__<_aaaaaaac__';

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
