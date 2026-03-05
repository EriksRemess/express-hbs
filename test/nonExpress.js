import hbs from '#hbs';
import { dirnameFromMeta } from '#test/fixtures/paths';
import { createLocals, renderTemplate, stripWs } from '#test/helpers';
import { describe, it } from '#test/testkit';
import assert from 'node:assert';

const __dirname = dirnameFromMeta(import.meta.url);

describe('non-express', () => {

  describe('viewsDir', () => {
    const dirname = __dirname + '/views/viewsDir';

    it('should use viewsDir options', async () => {
      const render = hbs.create().express({
        viewsDir: dirname,
        restrictLayoutsTo: dirname
      });
      const locals = createLocals('express', dirname);
      const html = await renderTemplate(render, dirname + '/sub/directive.hbs', locals);
      assert.equal('<vd>directive</vd>', stripWs(html));
    });

    it('should work with layoutsDir', async () => {
      const render = hbs.create().express({
        viewsDir: dirname,
        layoutsDir: dirname + '/layouts',
        restrictLayoutsTo: dirname
      });
      const locals = createLocals('express', dirname, { layout: 'default.hbs' });
      const html = await renderTemplate(render, dirname + '/sub/lay.hbs', locals);
      assert.equal('<vd>lay</vd>', stripWs(html));
    });
  });
});
