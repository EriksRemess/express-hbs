import assert from 'node:assert';
import path from 'node:path';
import { describe, it } from './testkit.js';
import hbs from '../index.js';
import { dirnameFromMeta } from './fixtures/paths.js';
import * as H from './helpers.js';

const __dirname = dirnameFromMeta(import.meta.url);

describe('local template options', () => {
  const dirname = path.join(__dirname, 'localTemplateOptions');

  describe('express', () => {

    it('merges res.locals._templateOptions with the self._templateOptions', async () => {
      const instance = hbs.create();
      const render = instance.express({
        restrictLayoutsTo: dirname
      });
      instance.updateTemplateOptions({
          data: {
            greeting: 'Hello,',
            firstName: 'Freddy',
            lastName: 'Krueger'
          } 
      });

      const locals = H.createLocals('express', dirname, {
        _templateOptions: {
          data: {
            lastName: 'Mercury'
          } 
        } 
      });
      const html = await H.renderTemplate(render, path.join(dirname, 'template.hbs'), locals);
      assert.strictEqual(H.stripWs(html), H.stripWs('Hello, Freddy Mercury'));
    });

    it('removes _templateOptions from the locals data', async () => {
      const instance = hbs.create();
      const render = instance.express({
        restrictLayoutsTo: dirname
      });
      instance.updateTemplateOptions({
          data: {
            greeting: 'Hello,',
            firstName: 'Freddy',
            lastName: 'Krueger'
          } 
      });

      const locals = H.createLocals('express', dirname, {
        _templateOptions: {
          data: {
            lastName: 'Mercury'
          } 
        } 
      });
      const html = await H.renderTemplate(render, path.join(dirname, 'data-access-template.hbs'), locals);
      assert.strictEqual(H.stripWs(html), H.stripWs(''));
    });
  });
});
