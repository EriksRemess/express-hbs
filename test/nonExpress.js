import assert from 'node:assert';
import { describe, it } from './testkit.js';
import hbs from '../index.js';
import { dirnameFromMeta } from './fixtures/paths.js';
import * as H from './helpers.js';

const __dirname = dirnameFromMeta(import.meta.url);

describe('non-express', () => {

  describe('viewsDir', () => {
    const dirname = __dirname + '/views/viewsDir';

    it('should use viewsDir options', async () => {
      const render = hbs.create().express({
        viewsDir: dirname,
        restrictLayoutsTo: dirname
      });
      const locals = H.createLocals('express', dirname);
      const html = await H.renderTemplate(render, dirname + '/sub/directive.hbs', locals);
      assert.equal('<vd>directive</vd>', H.stripWs(html));
    });

    it('should work with layoutsDir', async () => {
      const render = hbs.create().express({
        viewsDir: dirname,
        layoutsDir: dirname + '/layouts',
        restrictLayoutsTo: dirname
      });
      const locals = H.createLocals('express', dirname, { layout: 'default.hbs' });
      const html = await H.renderTemplate(render, dirname + '/sub/lay.hbs', locals);
      assert.equal('<vd>lay</vd>', H.stripWs(html));
    });
  });
});
