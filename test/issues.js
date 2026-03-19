import hbs from '#hbs';
import { fromHere } from '#test/fixtures/paths';
import {
  createLocals as createExpressLocals,
  renderTemplate,
  renderTemplateResult,
  stripWs
} from '#test/helpers';
import { describe, it } from '#test/testkit';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const createLocals = (dirname, locals) => createExpressLocals('express', dirname, locals);

describe('issue-22 template', () => {
  const dirname = fromHere(import.meta.url, 'issues/22');

  it('should use multiple layouts with caching', async () => {
    const render = hbs.create().express({
      restrictLayoutsTo: dirname
    });
    const locals1 = createLocals(dirname, { layout: 'layout1', cache: true });
    const locals2 = createLocals(dirname, { layout: 'layout2', cache: true });

    const html1 = await renderTemplate(render, dirname + '/template.hbs', locals1);
    const html2 = await renderTemplate(render, dirname + '/template.hbs', locals2);

    assert.equal('<layout1>template</layout1>', stripWs(html1));
    assert.equal('<layout2>template</layout2>', stripWs(html2));
  });
});

describe('issue-23', () => {
  const dirname = fromHere(import.meta.url, 'issues/23');
  const renderOptions = { cache: true, settings: { views: dirname + '/views' } };

  it('should not pass an empty or missing partial to handlebars', async () => {
    const render = hbs.create().express({
      partialsDir: [dirname + '/partials'],
      restrictLayoutsTo: dirname
    });
    const html = await renderTemplate(render, dirname + '/index.hbs', renderOptions);
    assert.equal('<html>Hello</html>', stripWs(html));
  });

  it('should handle empty string', async () => {
    const render = hbs.create().express({
      partialsDir: [dirname + '/partials'],
      restrictLayoutsTo: dirname
    });
    const html = await renderTemplate(render, dirname + '/empty.hbs', renderOptions);
    assert.equal('', stripWs(html));
  });

  it('should register empty partial', async () => {
    const hb = hbs.create();
    const render = hb.express({
      partialsDir: [dirname + '/partials'],
      restrictLayoutsTo: dirname
    });
    hb.handlebars.registerPartial('emptyPartial', '');

    for (let i = 0; i < 3; i += 1) {
      const html = await renderTemplate(render, dirname + '/emptyPartial.hbs', renderOptions);
      assert.equal('foo', stripWs(html));
    }
  });

  it('should register partial that results in empty string (comment)', async () => {
    const hb = hbs.create();
    const render = hb.express({
      partialsDir: [dirname + '/partials'],
      restrictLayoutsTo: dirname
    });
    hb.registerPartial('emptyComment', '{{! just a comment}}');

    for (let i = 0; i < 3; i += 1) {
      const html = await renderTemplate(render, dirname + '/emptyComment.hbs', renderOptions);
      assert.equal('foo', stripWs(html));
    }
  });
});

describe('issue-21', () => {
  const dirname = fromHere(import.meta.url, 'issues/21');
  const render = hbs.create().express({
    layoutsDir: dirname + '/views/layouts',
    restrictLayoutsTo: dirname
  });

  it('should allow specifying layouts without the parent dir', async () => {
    const options = { cache: true, layout: 'default', settings: { views: dirname + '/views' } };
    const html = await renderTemplate(render, dirname + '/views/index.hbs', options);
    assert.equal('<html>index</html>', stripWs(html));
  });

  it('should allow specifying layouts without the parent dir in a sub view', async () => {
    const options = { cache: true, layout: 'default', settings: { views: dirname + '/views' } };
    const html = await renderTemplate(render, dirname + '/views/sub/sub.hbs', options);
    assert.equal('<html>sub</html>', stripWs(html));
  });

  it('should treat layouts that start with "." relative to template', async () => {
    const options = { cache: true, layout: './relativeLayout', settings: { views: dirname + '/views' } };
    const html = await renderTemplate(render, dirname + '/views/sub/sub.hbs', options);
    assert.equal('<relative>sub</relative>', stripWs(html));
  });

  it('should allow layouts in subfolders', async () => {
    const options = { cache: true, layout: 'sub/child', settings: { views: dirname + '/views' } };
    const html = await renderTemplate(render, dirname + '/views/useLayoutInDir.hbs', options);
    assert.equal('<sub>useLayoutInDir</sub>', stripWs(html));
  });

  it('should treat layouts relative to views directory if layoutsDir is not passed', async () => {
    const localRender = hbs.create().express({
      restrictLayoutsTo: dirname
    });
    const options = { cache: true, layout: 'layouts/sub/child', settings: { views: dirname + '/views' } };
    const html = await renderTemplate(localRender, dirname + '/views/sub/sub.hbs', options);
    assert.equal('<sub>sub</sub>', stripWs(html));
  });
});

describe('issue-49', () => {
  const dirname = fromHere(import.meta.url, 'issues/49');

  it('should report filename with error', async () => {
    const hb = hbs.create();
    const render = hb.express({
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname, {});
    const result = await renderTemplateResult(render, dirname + '/error.hbs', locals);
    assert(result.err.stack.includes('[error.hbs]'));
  });

  it('should report relative filename with error', async () => {
    const hb = hbs.create();
    const render = hb.express({
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname, {});
    const result = await renderTemplateResult(render, dirname + '/front/error.hbs', locals);
    assert(result.err.stack.includes('[front/error.hbs]'));
  });

  it('should report filename with partial error', async () => {
    const hb = hbs.create();
    const render = hb.express({
      partialsDir: dirname + '/partials',
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname, {});
    const result = await renderTemplateResult(render, dirname + '/partial.hbs', locals);
    assert(result.err.stack.includes('[partial.hbs]'));
  });

  it('should report filename with layout error', async () => {
    const hb = hbs.create();
    const render = hb.express({
      partialsDir: dirname + '/partials',
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname, {});
    const result = await renderTemplateResult(render, dirname + '/index.hbs', locals);
    assert(result.err.stack.includes('[layouts/default.hbs]'));
  });
});

describe('issue-53', () => {
  const dirname = fromHere(import.meta.url, 'issues/53');

  it('should use block with async helpers', async () => {
    const hb = hbs.create();
    let res = 0;
    hb.registerAsyncHelper('weird', (_, resultcb) => {
      setTimeout(() => {
        resultcb(++res);
      }, 1);
    });
    const render = hb.express({
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname, {});
    const html = await renderTemplate(render, dirname + '/index.hbs', locals);
    assert.ok(!html.includes('__aSyNcId_'));
  });
});

describe('issue-59', () => {
  const dirname = fromHere(import.meta.url, 'issues/59');

  it('should escape or not', async () => {
    const hb = hbs.create();
    hb.registerAsyncHelper('async', (s, cb) => {
      cb('<strong>' + s + '</strong>');
    });

    const render = hb.express({
      viewsDir: dirname,
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname);
    const html = await renderTemplate(render, dirname + '/index.hbs', locals);
    assert.equal(stripWs(html), '&lt;strong&gt;foo&lt;/strong&gt;<strong>foo</strong>');
  });

  it('should not escape SafeString', async () => {
    const hb = hbs.create();
    hb.registerAsyncHelper('async', (s, cb) => {
      cb(new hb.SafeString('<em>' + s + '</em>'));
    });

    const render = hb.express({
      viewsDir: dirname,
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname);
    const html = await renderTemplate(render, dirname + '/index.hbs', locals);
    assert.equal(stripWs(html), '<em>foo</em><em>foo</em>');
  });
});

describe('issue-73', () => {
  const dirname = fromHere(import.meta.url, 'issues/73');

  it('should allow compile options', async () => {
    const hb = hbs.create();
    const render = hb.express({
      viewsDir: dirname,
      partialsDir: dirname + '/partials',
      restrictLayoutsTo: dirname,
      onCompile: function(eh, source, filename) {
        let options;
        if (filename && filename.indexOf('partials')) {
          options = { preventIndent: true };
        }
        return eh.handlebars.compile(source, options);
      }
    });

    const locals = createLocals(dirname);
    const html = await renderTemplate(render, dirname + '/index.hbs', locals);
    assert.ok(html.match(/^Hello/m));
    assert.ok(html.match(/^second line/m));
  });
});

describe('issue-62', () => {
  const dirname = fromHere(import.meta.url, 'issues/62');

  it('should provide options for async helpers', async () => {
    const hb = hbs.create();
    hb.registerAsyncHelper('async', (c, o, cb) => {
      if (o.hash.type === 'em') {
        cb('<em>' + c + '</em>');
      } else {
        cb('<strong>' + c + '</strong>');
      }
    });

    const render = hb.express({
      viewsDir: dirname,
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname);
    const html = await renderTemplate(render, dirname + '/basic.hbs', locals);

    assert.equal(
      stripWs(html),
      '&lt;strong&gt;foo&lt;/strong&gt;&lt;em&gt;foo&lt;/em&gt;'
    );
  });

  it('should allow for block async helpers', async () => {
    const hb = hbs.create();
    hb.registerAsyncHelper('async', function(c, o, cb) {
      const self = this;
      self.output = c;

      if (o.hash.inverse === 'true') {
        cb(o.inverse(self));
      } else {
        cb(o.fn(self));
      }
    });

    const render = hb.express({
      viewsDir: dirname,
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname);
    const html = await renderTemplate(render, dirname + '/block.hbs', locals);

    assert.equal(
      stripWs(html),
      '<p>GoodbyeWorld</p><p>HelloHandlebars</p>'
    );
  });
});

describe('issue-76', () => {
  const dirname = fromHere(import.meta.url, 'issues/76');

  it('should allow cachePartials to be called independently of render', async () => {
    const hb = hbs.create();
    hb.express({
      partialsDir: dirname,
      restrictLayoutsTo: dirname
    });

    await new Promise((resolve, reject) => {
      hb.cachePartials((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    assert.ok(true);
  });
});

describe('issue-84', () => {
  const dirname = fromHere(import.meta.url, 'issues/84');

  it('should render deeply nested partials', async () => {
    const render = hbs.create().express({
      partialsDir: [dirname + '/partials'],
      restrictLayoutsTo: dirname
    });

    const html = await renderTemplate(render, dirname + '/index.hbs', {
      cache: true,
      settings: { views: dirname + '/views' }
    });

    assert.equal('<div>Testing3levelsdown</div>', stripWs(html));
  });
});

describe('issue-144', () => {
  const dirname = fromHere(import.meta.url, 'issues/144');

  it('should repalce with async helpers even special string like $\'', async () => {
    const hb = hbs.create();
    hb.registerAsyncHelper('special_string', (_, resultcb) => {
      setTimeout(() => {
        resultcb(new hbs.SafeString('<p><code>\'$example$\'</code> abcd</p>'));
      }, 1);
    });

    const render = hb.express({
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname, {});
    const html = await renderTemplate(render, dirname + '/index.hbs', locals);
    assert.equal('<div><p><code>\'$example$\'</code> abcd</p></div>\n', html);
  });
});

describe('issue-153', () => {
  const dirname = fromHere(import.meta.url, 'issues/153');

  it('should concat contentFor blocks with newline', async () => {
    const hb = hbs.create();
    const render = hb.express({
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname, {});
    const html = await renderTemplate(render, dirname + '/index.hbs', locals);
    assert.equal('1\n2', html.trim());
  });
});

describe('issue-270', () => {
  const dirname = fromHere(import.meta.url, 'issues/270');
  const viewsDir = dirname + '/views';
  const indexFile = viewsDir + '/index.hbs';

  it('should allow absolute layout paths inside restrictLayoutsTo', async () => {
    const hb = hbs.create();
    const render = hb.express({
      restrictLayoutsTo: viewsDir
    });
    const locals = createLocals(viewsDir, {
      cache: true,
      layout: viewsDir + '/layouts/default.hbs'
    });

    const html = await renderTemplate(render, indexFile, locals);
    assert.equal(stripWs(html), '<layout>Hello</layout>');
  });

  it('should reject absolute layout paths outside restrictLayoutsTo', async () => {
    const hb = hbs.create();
    const render = hb.express({
      restrictLayoutsTo: viewsDir
    });
    const locals = createLocals(viewsDir, {
      cache: true,
      layout: dirname + '/outside/default.hbs'
    });

    const result = await renderTemplateResult(render, indexFile, locals);
    assert(result.err);
    assert(result.err.message.includes('does not reside in'));
  });

  it('should reject layouts that escape restrictLayoutsTo through symlinks', async () => {
    const hb = hbs.create();
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'express-hbs-issue-270-'));
    const symlinkTarget = path.join(tempRoot, 'outside', 'default.hbs');

    try {
      const tempViewsDir = path.join(tempRoot, 'views');
      const tempLayoutsDir = path.join(tempViewsDir, 'layouts');
      const indexPath = path.join(tempViewsDir, 'index.hbs');
      const symlinkPath = path.join(tempLayoutsDir, 'linked.hbs');

      await fs.mkdir(tempLayoutsDir, { recursive: true });
      await fs.mkdir(path.dirname(symlinkTarget), { recursive: true });
      await fs.writeFile(indexPath, 'Hello');
      await fs.writeFile(symlinkTarget, '<outside>{{{body}}}</outside>');
      await fs.symlink(symlinkTarget, symlinkPath);

      const render = hb.express({
        restrictLayoutsTo: tempViewsDir
      });
      const locals = createLocals(tempViewsDir, {
        cache: true,
        layout: symlinkPath
      });

      const result = await renderTemplateResult(render, indexPath, locals);
      assert(result.err);
      assert(result.err.message.includes('does not reside in'));
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('issue-160', () => {
  const dirname = fromHere(import.meta.url, 'issues/160');

  it('should pass handlebars options to async helpers with multiple arguments', async () => {
    const hb = hbs.create();
    hb.registerAsyncHelper('someAsyncHelper', (arg1, arg2, options, done) => {
      const key = options.hash.key || 'none';
      done(`${arg1}:${arg2}:${key}`);
    });
    hb.registerAsyncHelper('someAsyncBlock', function(arg1, arg2, options, done) {
      done(new hb.SafeString(`<b>${arg1}:${arg2}:${options.hash.key}:${options.fn(this)}</b>`));
    });

    const render = hb.express({
      viewsDir: dirname,
      restrictLayoutsTo: dirname
    });
    const locals = createLocals(dirname, {});
    const html = await renderTemplate(render, dirname + '/index.hbs', locals);

    assert.equal(
      stripWs(html),
      'first:second:valone:two:none<b>left:right:z:block</b>'
    );
  });
});

describe('issue-161', () => {
  const dirname = fromHere(import.meta.url, 'issues/161');
  const templateFile = dirname + '/default.hbs';
  const indexFile = dirname + '/index.hbs';

  const createRender = () => hbs.create().express({
    viewsDir: dirname,
    restrictLayoutsTo: dirname
  });

  it('should render same file as template then as layout with cache enabled', async () => {
    const render = createRender();
    const locals = createLocals(dirname, { cache: true });

    const html1 = await renderTemplate(render, templateFile, locals);
    const html2 = await renderTemplate(render, indexFile, locals);

    assert.equal(stripWs(html1), '<default></default>');
    assert.equal(stripWs(html2), '<default><index>ok</index></default>');
  });

  it('should render same file as layout then as template with cache enabled', async () => {
    const render = createRender();
    const locals = createLocals(dirname, { cache: true });

    const html1 = await renderTemplate(render, indexFile, locals);
    const html2 = await renderTemplate(render, templateFile, locals);

    assert.equal(stripWs(html1), '<default><index>ok</index></default>');
    assert.equal(stripWs(html2), '<default></default>');
  });
});
