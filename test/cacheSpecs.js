import { create as createExampleApp } from '#example/app';
import hbs from '#hbs';
import { dirnameFromMeta } from '#test/fixtures/paths';
import { request } from '#test/http';
import { describe, it } from '#test/testkit';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const __dirname = dirnameFromMeta(import.meta.url);

function incrementCount(readCounts, filename) {
  const key = path.resolve(filename);
  if (typeof readCounts[key] === 'undefined') {
    readCounts[key] = 1;
  } else {
    readCounts[key] += 1;
  }
}

function createPatchedFs(readCounts, originalPromisesReadFile) {
  return {
    promisesReadFile: function(filename, encoding) {
      incrementCount(readCounts, filename);
      return originalPromisesReadFile(filename, encoding);
    }
  };
}

async function withPatchedFs(readCounts, run) {
  const originalPromisesReadFile = fs.readFile;
  const patchedFs = createPatchedFs(readCounts, originalPromisesReadFile);

  fs.readFile = patchedFs.promisesReadFile;

  try {
    await run();
  } finally {
    fs.readFile = originalPromisesReadFile;
  }
}

const createApp = (env) => createExampleApp( hbs.create(), env );

describe('express-hbs', () => {
  describe('cache', () => {
    for (const [reconfigure, reload] of [[false, false], [false, true], [true, true]]) {
      it(`discards partial reads superseded by ${reconfigure ? 'reconfiguration' : 'invalidation'}${reload ? ' and reload' : ''}`, async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hbs-invalidated-partials-'));
        const originalReadFile = fs.readFile;
        const entered = Promise.withResolvers();
        const release = Promise.withResolvers();
        let pending;

        try {
          const oldFile = path.join(dir, 'old.hbs');
          await fs.writeFile(oldFile, 'obsolete');
          const hb = hbs.create();
          hb.express({ partialsDir: dir });
          fs.readFile = async (...args) => {
            const source = await originalReadFile(...args);
            if (args[0] === oldFile) {
              entered.resolve();
              await release.promise;
            }
            return source;
          };

          pending = hb.cachePartials();
          await Promise.race([entered.promise, pending.then(() => {
            throw new Error('Partial load completed without reading its source');
          })]);
          if (reconfigure) {
            hb.express({ partialsDir: dir });
          } else {
            hb.invalidatePartialsManifest();
          }
          await fs.unlink(oldFile);
          await fs.writeFile(path.join(dir, 'new.hbs'), 'replacement');
          if (reload) {
            await hb.cachePartials();
          }
          const currentManifest = hb.partialsManifest;
          const currentSourceCache = hb.partialsSourceCache;
          const currentMetadataCache = hb.partialsMetadataCache;
          const currentPartial = hb.handlebars.partials.new;

          release.resolve();
          await pending;
          if (reload) {
            assert.equal(hb.partialsManifest, currentManifest);
            assert.equal(hb.partialsSourceCache, currentSourceCache);
            assert.equal(hb.partialsMetadataCache, currentMetadataCache);
            assert.equal(hb.handlebars.partials.new, currentPartial);
          }
          assert.equal(hb.isPartialCachingComplete, true);
          assert.deepEqual(hb.partialsManifest.map(entry => entry.name), ['new']);
          assert.equal(hb.handlebars.partials.old, undefined);
          for (const cache of [false, true]) {
            assert.equal(await hb._renderFile(path.join(dir, 'view.hbs'), '{{> new}}!', { cache }), 'replacement!');
          }
        } finally {
          release.resolve();
          await pending?.catch(() => {});
          fs.readFile = originalReadFile;
          await fs.rm(dir, { recursive: true, force: true });
        }
      });
    }

    it('renders concurrent requests during initial and refreshed partial discovery', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hbs-concurrent-partials-'));
      try {
        await fs.writeFile(path.join(dir, 'p.hbs'), 'partial');
        const hb = hbs.create();
        hb.express({ partialsDir: dir });
        for (const refresh of [false, true]) {
          hb._options.refreshPartialsManifest = refresh;
          const results = await Promise.all(Array.from({ length: 8 }, () =>
            hb._renderFile(path.join(dir, 'view.hbs'), '{{> p}}!', { cache: true })
          ));
          assert.deepEqual(results, Array(8).fill('partial!'));
        }
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it('retries failed discovery without retaining an incomplete manifest', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hbs-retry-partials-'));
      try {
        const missing = path.join(dir, 'missing');
        const hb = hbs.create();
        hb.express({ partialsDir: missing });
        await assert.rejects(hb.cachePartials(), { code: 'ENOENT' });
        await fs.mkdir(missing);
        await fs.writeFile(path.join(missing, 'p.hbs'), 'recovered');
        assert.equal(await hb._renderFile(path.join(dir, 'view.hbs'), '{{> p}}!', { cache: true }), 'recovered!');
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it('preserves working partials when a manifest refresh fails', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hbs-refresh-partials-'));
      try {
        await fs.writeFile(path.join(dir, 'p.hbs'), 'original');
        const hb = hbs.create();
        hb.express({ partialsDir: dir, refreshPartialsManifest: true });
        await hb.cachePartials();
        const missing = path.join(dir, 'missing');
        hb.partialsDir = [dir, missing];
        await assert.rejects(hb.cachePartials(), { code: 'ENOENT' });
        assert.equal(hb.handlebars.compile('{{> p}}!')({}), 'original!');
        await fs.mkdir(missing);
        await fs.writeFile(path.join(missing, 'p.hbs'), 'replacement');
        await hb.cachePartials();
        assert.equal(hb.handlebars.compile('{{> p}}!')({}), 'replacement!');
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it('should avoid rereading unchanged layouts in `development`', async () => {
      const readCounts = {};
      const app = createApp('development');

      await withPatchedFs(readCounts, async () => {
        await request(app, '/');
        const res = await request(app, '/');
        assert.match(res.text, /DEFAULT LAYOUT/);
      });

      const filename = path.resolve(__dirname, '../example/views/layout/default.hbs');
      assert.equal(readCounts[filename], 1);
    });

    it('should cache layout in `production` reading file once', async () => {
      const readCounts = {};
      const app = createApp('production');

      await withPatchedFs(readCounts, async () => {
        await request(app, '/');
        const res = await request(app, '/');
        assert.match(res.text, /DEFAULT LAYOUT/);
      });

      const filename = path.resolve(__dirname, '../example/views/layout/default.hbs');
      assert.equal(readCounts[filename], 1);
    });

    it('should avoid rereading unchanged partials in `development`', async () => {
      const readCounts = {};
      const app = createApp('development');

      await withPatchedFs(readCounts, async () => {
        const res1 = await request(app, '/veggies');
        assert.match(res1.text, /just a comment/);
        const res2 = await request(app, '/veggies');
        assert.match(res2.text, /just a comment/);
      });

      const filename = path.resolve(__dirname, '../example/views/partials/sub/comment.hbs');
      assert.equal(readCounts[filename], 1);
    });

    it('should cache partials in `production`', async () => {
      const readCounts = {};
      const app = createApp('production');

      await withPatchedFs(readCounts, async () => {
        const res1 = await request(app, '/veggies');
        assert.match(res1.text, /just a comment/);
        const res2 = await request(app, '/veggies');
        assert.match(res2.text, /just a comment/);
      });

      const filename = path.resolve(__dirname, '../example/views/partials/sub/comment.hbs');
      assert.equal(readCounts[filename], 1);
    });
  });
});
