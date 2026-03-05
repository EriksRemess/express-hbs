import hbs from '#hbs';
import { create as createI18nApp } from '#test/apps/i18n/index';
import { request } from '#test/http';
import { beforeEach, describe, it } from '#test/testkit';
import assert from 'node:assert';

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
