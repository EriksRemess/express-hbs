import assert from 'node:assert';
import { beforeEach, describe, it } from './testkit.js';
import hbs from '../index.js';
import { create as createExampleApp } from '../example/app.js';
import { request } from './http.js';

describe('express-hbs', () => {

  describe('defaults', () => {
    let app;

    beforeEach(() => {
      app = createExampleApp(hbs.create());
    });


    it('should render using default layout', async () => {
      const res = await request(app, '/');
      assert.match(res.text, /DEFAULT LAYOUT/);
    });

    it('should render layout declared in markup', async () => {
      const res = await request(app, '/fruits');
      assert.match(res.text, /DECLARATIVE LAYOUT/);
    });

    it('should render nested declarative layouts correctly', async () => {
      const res = await request(app, '/fruits/apple');
      assert.match(res.text, /DECLARATIVE LAYOUT/);
      assert.match(res.text, /NESTED LAYOUT/);
    });

    it('should render layout specified as locals', async () => {
      const res = await request(app, '/veggies');
      assert.match(res.text, /PROGRAMMATIC LAYOUT/);
    });

    it('should render nested layouts correctly when first layout is specified as locals', async () => {
      const res = await request(app, '/veggies/carrot');
      assert.match(res.text, /PROGRAMMATIC LAYOUT/);
      assert.match(res.text, /NESTED LAYOUT/);
    });

    it('should render partial', async () => {
      const res = await request(app, '/veggies');
      assert.match(res.text, /jquery\.js/);
      assert.match(res.text, /Other partial/);
    });

    it('should render sub partial', async () => {
      const res = await request(app, '/veggies');
      assert.match(res.text, /just a comment/);
    });

    it('should render block', async () => {
      const res = await request(app, '/');
      assert.match(res.text, /color: blue/);
    });

    it('should render block default content', async () => {
      const res = await request(app, '/');
      assert.match(res.text, /Default block content/);
    });

    it('should render block content instead of default content when contentFor is declared', async () => {
      const res = await request(app, '/replace');
      assert.match(res.text, /Non-default block content/);
    });

    it('should replace {{body}}', async () => {
      const res = await request(app, '/');
      assert.match(res.text, /Vegetables/);
    });

    it('should continue when async helper readFile fails', async () => {
      const originalConsoleError = console.error;
      let reported = 0;

      console.error = () => {
        reported += 1;
      };

      try {
        const hb = hbs.create();
        createExampleApp(hb);

        const resolverCache = Object.create(null);
        hb.handlebars.helpers.readFile.call({ resolverCache }, '__definitely_missing__.txt');
        await hb._resolveAsyncValues(resolverCache);

        assert.equal(reported > 0, true);
      } finally {
        console.error = originalConsoleError;
      }
    });

  });

  describe('instances', () => {
    it('should create isolated instances', () => {
      const hbs2 = hbs.create();
      const hbs3 = hbs.create();

      assert(hbs !== hbs2 && hbs !== hbs3 && hbs2 !== hbs3);
    });
  });
});
