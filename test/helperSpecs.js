import assert from 'node:assert';
import { describe, it } from './testkit.js';
import hbs from '../index.js';
import { dirnameFromMeta } from './fixtures/paths.js';
import * as H from './helpers.js';

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
      const locals = H.createLocals('express', dirname);
      const html = await H.renderTemplate(render, dirname + '/home/index.hbs', locals);
      assert.equal('<default>index-sync-index</default>', H.stripWs(html));
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
      const locals = H.createLocals('express', dirname);
      const html = await H.renderTemplate(render, dirname + '/home/async.hbs', locals);
      assert.equal('<default>asynctemplate-async-foo-async-bar-async-bah-async-baz</default>', H.stripWs(html));
    });


  });

});
