import assert from 'node:assert';
import path from 'node:path';
import { describe, it } from './testkit.js';
import hbs from '../index.js';
import { dirnameFromMeta } from './fixtures/paths.js';
import * as H from './helpers.js';

const __dirname = dirnameFromMeta(import.meta.url);


// MEANJS is using custom extension .server.view.html instead of .hbs 
// https://github.com/meanjs/mean
describe('custom extension for partials view', () => {
  const dirname = path.join(__dirname, 'views/customExtension');
  const render = hbs.create().express({
      extname: '.server.view.html',
      partialsDir: dirname + '/partialsDir',
      restrictLayoutsTo: dirname
  });

  it('should allow rendering multiple partials with custom extension', async () => {
    const options = { cache: true, settings: { views: dirname } };
    const html = await H.renderTemplate(render, dirname + '/template.server.view.html', options);
    assert.equal(
      '<html>' +
        '<subpartial>1</subpartial>' +
        '<partial>1</partial>' +
        '<subpartial>2</subpartial>' +
        '<partial>2</partial>' +
      '</html>',
      H.stripWs(html)
    );
  });

});
