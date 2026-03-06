import hbs from '#hbs';
import { dirnameFromMeta } from '#test/fixtures/paths';
import { createLocals, renderTemplate, stripWs } from '#test/helpers';
import { describe, it } from '#test/testkit';
import assert from 'node:assert';
import path from 'node:path';

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

      const locals = createLocals('express', dirname, {
        _templateOptions: {
          data: {
            lastName: 'Mercury'
          } 
        } 
      });
      const html = await renderTemplate(render, path.join(dirname, 'template.hbs'), locals);
      assert.strictEqual(stripWs(html), stripWs('Hello, Freddy Mercury'));
      assert.deepEqual(locals._templateOptions, {
        data: {
          lastName: 'Mercury'
        }
      });
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

      const locals = createLocals('express', dirname, {
        _templateOptions: {
          data: {
            lastName: 'Mercury'
          } 
        } 
      });
      const html = await renderTemplate(render, path.join(dirname, 'data-access-template.hbs'), locals);
      assert.strictEqual(stripWs(html), stripWs(''));
      assert.deepEqual(locals._templateOptions, {
        data: {
          lastName: 'Mercury'
        }
      });
    });
  });
});
