import assert from 'node:assert';
import path from 'node:path';
import { describe, it } from './testkit.js';
import { readFileSync } from 'node:fs';
import hbs from '../index.js';
import { dirnameFromMeta } from './fixtures/paths.js';
import * as H from './helpers.js';

const __dirname = dirnameFromMeta(import.meta.url);


describe('options', () => {
  const dirname =  path.join(__dirname, 'views/beautify');

  it('should pretty print HTML', async () => {
    const hb = hbs.create();
    const render = hb.express({ beautify: true, restrictLayoutsTo: dirname });
    const locals = H.createLocals('express', dirname, {});
    const html = await H.renderTemplate(render, dirname + '/index.hbs', locals);
    const expected = readFileSync(dirname + '/expected.hbs', 'utf8');
    assert.equal(html.trim(), expected.trim());
  });
});
