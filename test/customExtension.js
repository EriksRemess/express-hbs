import hbs from '#hbs';
import { dirnameFromMeta } from '#test/fixtures/paths';
import { renderTemplate, stripWs } from '#test/helpers';
import { describe, it } from '#test/testkit';
import assert from 'node:assert';
import path from 'node:path';

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
    const html = await renderTemplate(render, dirname + '/template.server.view.html', options);
    assert.equal(
      '<html>' +
        '<subpartial>1</subpartial>' +
        '<partial>1</partial>' +
        '<subpartial>2</subpartial>' +
        '<partial>2</partial>' +
      '</html>',
      stripWs(html)
    );
  });

});
