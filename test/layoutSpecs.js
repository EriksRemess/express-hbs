import layoutsDirApp from '#example/app-layoutsDir';
import hbs from '#hbs';
import { dirnameFromMeta } from '#test/fixtures/paths';
import { createLocals, renderTemplate, renderTemplateResult, stripWs } from '#test/helpers';
import { request } from '#test/http';
import { beforeEach, describe, it } from '#test/testkit';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const __dirname = dirnameFromMeta(import.meta.url);

describe('layouts', () => {
  describe('layoutsDir', () => {
    let app;

    beforeEach(() => {
      app = layoutsDirApp;
    });

    it('should render layout declared in markup', async () => {
      const res = await request(app, '/fruits');
      assert.match(res.text, /DECLARATIVE LAYOUT/);
    });

    it('should render root route with helpers', async () => {
      const res = await request(app, '/');
      assert.match(res.text, /Terms of Service/);
      assert.match(res.text, /Vegetables/);
    });

    it('should allow specifying layout in locals without dir', async () => {
      const res = await request(app, '/veggies');
      assert.match(res.text, /PROGRAMMATIC LAYOUT/);
    });

    it('should still allow specifying layout in locals with dir', async () => {
      const res = await request(app, '/veggies/explicit-dir');
      assert.match(res.text, /PROGRAMMATIC LAYOUT/);
    });

    it('should render dynamic details routes', async () => {
      const fruitRes = await request(app, '/fruits/banana');
      assert.match(fruitRes.text, /banana/);

      const veggieRes = await request(app, '/veggies/celery');
      assert.match(veggieRes.text, /celery/);
      assert.match(veggieRes.text, /NESTED LAYOUT/);
    });

    it('should render declarative layouts when layoutsDir is an array', async () => {
      const exampleViews = path.join(__dirname, '../example/views');
      const emptyLayoutsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layouts-first-'));

      try {
        const render = hbs.create().express({
          partialsDir: [path.join(exampleViews, 'partials'), path.join(exampleViews, 'partials-other')],
          layoutsDir: [emptyLayoutsDir, path.join(exampleViews, 'layout')]
        });
        const locals = createLocals('express', exampleViews, {
          cache: true,
          title: 'My favorite fruits',
          fruits: [{ name: 'apple' }]
        });
        const html = await renderTemplate(render, path.join(exampleViews, 'fruits/index-layoutsDir.hbs'), locals);
        assert.match(html, /DECLARATIVE LAYOUT/);
        assert.match(html, /<!DOCTYPE html>/);
      } finally {
        await fs.rm(emptyLayoutsDir, { recursive: true, force: true });
      }
    });

    it('should resolve options.layout from the first matching layoutsDir', async () => {
      const exampleViews = path.join(__dirname, '../example/views');
      const emptyLayoutsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layouts-options-first-'));

      try {
        const render = hbs.create().express({
          partialsDir: [path.join(exampleViews, 'partials'), path.join(exampleViews, 'partials-other')],
          layoutsDir: [emptyLayoutsDir, path.join(exampleViews, 'layout')]
        });
        const locals = createLocals('express', exampleViews, {
          layout: 'veggie',
          veggies: [{ name: 'carrot' }]
        });
        const html = await renderTemplate(render, path.join(exampleViews, 'veggies.hbs'), locals);
        assert.match(html, /PROGRAMMATIC LAYOUT/);
      } finally {
        await fs.rm(emptyLayoutsDir, { recursive: true, force: true });
      }
    });
  });


  describe('options.layout', () => {
    const dirname = __dirname + '/views/disableLayoutDirective';

    it('should process template-specified layout without option', async () => {
      const render = hbs.create().express({
        restrictLayoutsTo: dirname
      });
      const locals = createLocals('express', dirname);
      const html = await renderTemplate(render, dirname + '/index.hbs', locals);
      assert.equal('<dld>dld</dld>', stripWs(html));
    });

    it('should allow options.layout to be specified', async () => {
      const render = hbs.create().express({
        restrictLayoutsTo: dirname
      });
      const locals = createLocals('express', dirname, { layout: 'layouts/default' });
      const html = await renderTemplate(render, dirname + '/aside.hbs', locals);
      assert.equal('<dld>aside</dld>', stripWs(html));
    });

    it('should allow options.layout inside the inferred safe root without restrictLayoutsTo', async () => {
      const render = hbs.create().express({});
      const locals = createLocals('express', dirname, { layout: 'layouts/default' });
      const html = await renderTemplate(render, dirname + '/aside.hbs', locals);
      assert.equal('<dld>aside</dld>', stripWs(html));
    });

    it('should error when using a layout outside of the restrictLayoutsTo', async () => {
      const render = hbs.create().express({
        restrictLayoutsTo: path.resolve(path.join(__dirname, '../'))
      });
      const locals = createLocals('express', dirname, { layout: '/Users/egg/Code/Ghost/ghost/core/package.json' });
      const result = await renderTemplateResult(render, dirname + '/aside.hbs', locals);
      if (!result.err) {
        throw new Error('We expect an error when reading');
      }
    });

    it('should reject options.layout outside the inferred safe root when restrictLayoutsTo is unset', async () => {
      const render = hbs.create().express({});
      const outsideLayout = path.join(__dirname, 'issues/53/default.hbs');
      const locals = createLocals('express', dirname, { layout: outsideLayout });
      const result = await renderTemplateResult(render, dirname + '/aside.hbs', locals);
      assert(result.err);
      assert.match(result.err.message, /does not reside in/);
    });

    it('should not process template-specified layout when options.layout is falsy', async () => {
      const render = hbs.create().express({
        restrictLayoutsTo: dirname
      });
      const locals = createLocals('express', dirname, { layout: false });
      const html = await renderTemplate(render, dirname + '/index.hbs', locals);
      assert.equal('dld', stripWs(html));
    });
  });

});
