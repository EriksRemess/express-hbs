import hbs from '#hbs';
import { dirnameFromMeta } from '#test/fixtures/paths';
import { createLocals, renderTemplate, stripWs } from '#test/helpers';
import { describe, it } from '#test/testkit';
import assert from 'node:assert';

const __dirname = dirnameFromMeta(import.meta.url);

describe('helpers', () => {

  describe('sync', () => {
    const dirname = __dirname + '/views/helpers';

    function sync(s) {
      return new hbs.SafeString('-sync-' + s);
    }

    it('should register functions', async () => {
      const hb = hbs.create();
      hb.registerHelper('sync', sync);
      const render = hb.express({
        viewsDir: dirname,
        restrictLayoutsTo: dirname
      });
      const locals = createLocals('express', dirname);
      const html = await renderTemplate(render, dirname + '/home/index.hbs', locals);
      assert.equal('<default>index-sync-index</default>', stripWs(html));
    });
  });

  describe('async', () => {
    const dirname = __dirname + '/views/helpers';
    it('should register functions', async () => {
      const hb = hbs.create();
      function async(s, cb) {
        setTimeout(() => {
          cb(new hb.SafeString('-async-' + s));
        }, Math.floor(Math.random()*10+1));
      }
      hb.registerAsyncHelper('async', async);

      const render = hb.express({
        viewsDir: dirname,
        restrictLayoutsTo: dirname
      });
      const locals = createLocals('express', dirname);
      const html = await renderTemplate(render, dirname + '/home/async.hbs', locals);
      assert.equal('<default>asynctemplate-async-foo-async-bar-async-bah-async-baz</default>', stripWs(html));
    });


  });

});
