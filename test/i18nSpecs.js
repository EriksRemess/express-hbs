import assert from 'node:assert';
import { beforeEach, describe, it } from './testkit.js';
import hbs from '../index.js';
import { create as createI18nApp } from './apps/i18n/index.js';
import { request } from './http.js';

describe('i18n', () => {
  let app;

  beforeEach(() => {
    app = createI18nApp(hbs.create());
  });

  it('should render en', async () => {
    const res = await request(app, '/', {
      headers: {
        Cookie: 'locale=en'
      }
    });
    const expected = '<span id="text">text to test</span>\n<br>\n<span class="each">1 cat</span><span class="each">2 cats</span>';
    assert.equal(res.text, expected);
  });

  it('should render fr', async () => {
    const res = await request(app, '/', {
      headers: {
        Cookie: 'locale=fr'
      }
    });
    const expected = '<span id="text">Texte à tester</span>\n<br>\n<span class="chaque">1 chat</span><span class="chaque">2 chats</span>';
    assert.equal(res.text, expected);
  });
});
