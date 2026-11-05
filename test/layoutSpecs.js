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
  it('allows child layout names beginning with two dots without permitting traversal', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-dots-'));
    try {
      const layoutsDir = path.join(root, 'layouts');
      await fs.mkdir(layoutsDir);
      await fs.writeFile(path.join(layoutsDir, '..layout.hbs'), 'LAYOUT[{{{body}}}]');
      await fs.writeFile(path.join(root, 'outside.hbs'), 'OUTSIDE');
      for (const restrictLayoutsTo of [undefined, layoutsDir]) {
        const hb = hbs.create();
        hb.express({ layoutsDir: [layoutsDir], restrictLayoutsTo });
        assert.equal(await hb._renderFile(path.join(layoutsDir, 'page.hbs'), 'PAGE', {
          layout: './..layout.hbs'
        }), 'LAYOUT[PAGE]');
        assert.equal((await hb.cacheLayout(path.join(layoutsDir, '..layout.hbs'), false))[0]({ body: 'PAGE' }), 'LAYOUT[PAGE]');
        await assert.rejects(hb._renderFile(path.join(layoutsDir, 'page.hbs'), 'PAGE', {
          layout: '../outside.hbs'
        }), /does not reside in/);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('keeps cached parent resolution separate for overlapping layout directories', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ehbs-layout-cache-'));
    try {
      const sub = path.join(root, 'sub');
      await fs.mkdir(sub);
      await fs.writeFile(path.join(root, 'parent.hbs'), 'OUTER[{{{body}}}]');
      await fs.writeFile(path.join(sub, 'parent.hbs'), 'INNER[{{{body}}}]');
      await fs.writeFile(path.join(sub, 'child.hbs'), '{{!< parent}}CHILD[{{{body}}}]');
      for (const cache of [false, true]) {
        const hb = hbs.create();
        hb.express({ layoutsDir: [root, sub], restrictLayoutsTo: root });
        for (const [layout, expected] of [
          ['sub/child', 'OUTER[CHILD[PAGE]]'],
          ['child', 'INNER[CHILD[PAGE]]'],
          ['sub/child', 'OUTER[CHILD[PAGE]]']
        ]) {
          assert.equal(await hb._renderFile(path.join(root, 'page.hbs'), 'PAGE', { layout, cache }), expected);
        }
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('resolves absolute layouts with only an explicit restriction root and rejects escapes', async () => {
    const root = path.join(__dirname, 'views/disableLayoutDirective');
    const hb = hbs.create();
    hb.express({ restrictLayoutsTo: root });
    assert.equal(stripWs(await hb._renderFile(path.join(root, 'aside.hbs'), 'PAGE', {
      layout: path.join(root, 'layouts/default.hbs')
    })), '<dld>PAGE</dld>');
    await assert.rejects(hb._renderFile(path.join(root, 'aside.hbs'), 'PAGE', {
      layout: path.join(__dirname, 'issues/53/default.hbs')
    }), /does not reside in/);
  });

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
