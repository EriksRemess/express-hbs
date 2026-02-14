import assert from 'node:assert';
import path from 'node:path';
import { describe, it } from './testkit.js';
import fs from 'node:fs/promises';
import hbs from '../index.js';
import { create as createExampleApp } from '../example/app.js';
import { dirnameFromMeta } from './fixtures/paths.js';
import { request } from './http.js';

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
    it('should not cache layout in `development`', async () => {
      const readCounts = {};
      const app = createApp('development');

      await withPatchedFs(readCounts, async () => {
        await request(app, '/');
        const res = await request(app, '/');
        assert.match(res.text, /DEFAULT LAYOUT/);
      });

      const filename = path.resolve(__dirname, '../example/views/layout/default.hbs');
      assert.equal(readCounts[filename], 2);
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

    it('should not cache partials in `development`', async () => {
      const readCounts = {};
      const app = createApp('development');

      await withPatchedFs(readCounts, async () => {
        const res1 = await request(app, '/veggies');
        assert.match(res1.text, /just a comment/);
        const res2 = await request(app, '/veggies');
        assert.match(res2.text, /just a comment/);
      });

      const filename = path.resolve(__dirname, '../example/views/partials/sub/comment.hbs');
      assert.equal(readCounts[filename], 2);
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
