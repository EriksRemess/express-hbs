import hbs from '#hbs';
import generateId from '#lib/generate-id';
import { done, hasResolvers, resolve } from '#lib/resolver';
import { fromHere } from '#test/fixtures/paths';
import { describe, it } from '#test/testkit';
import handlebars from 'handlebars';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const resolveCache = (cache) => new Promise((resolve, reject) => {
  done(cache, (err, values) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(values);
  });
});

describe('lib helpers', () => {
  const issuesDir = fromHere(import.meta.url, 'issues');

  describe('generate-id', () => {
    it('should create IDs with default length', () => {
      const id = generateId();
      assert.equal(id.length, 8);
      assert.match(id, /^[A-Za-z_]+$/);
    });

    it('should create IDs with requested length', () => {
      const id = generateId(32);
      assert.equal(id.length, 32);
      assert.match(id, /^[A-Za-z_]+$/);
    });
  });

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

    it('handles path helpers edge cases', () => {
      const hb = hbs.create();
      assert.equal(hb.layoutPath('/tmp/a.hbs', 'layout', []), undefined);
      assert.equal(hb._toErrorFilename(undefined, '/tmp'), undefined);
      hb._ensureInRestrictLayoutsTo('/tmp/a.hbs');
    });

    it('falls back to readdir when glob with file types is unavailable', async () => {
      const originalGlob = fs.glob;
      fs.glob = undefined;

      const hb = hbs.create();
      hb.express({
        partialsDir: path.join(issuesDir, '23/partials'),
        extname: '.hbs'
      });

      try {
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

    it('replaceValue returns input for non-string or empty replacement list', () => {
      const hb = hbs.create();
      assert.equal(hb._replaceValue(12, []), 12);
      assert.equal(hb._replaceValue('text', []), 'text');
    });
  });
});
