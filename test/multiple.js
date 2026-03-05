import hbs from '#hbs';
import { request } from '#test/http';
import { beforeEach, describe, it } from '#test/testkit';
import express from 'express';
import assert from 'node:assert';

describe('multiple directories', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.engine('hbs', hbs.express({
      restrictLayoutsTo: './test/views/multiple'
    }));
    app.set('view engine', 'hbs');
    app.get('/test1', (req, res) => {
      res.render('test1');
    });
    app.get('/test2', (req, res) => {
      res.render('test2');
    });
    app.get('/collide', (req, res) => {
      res.render('collide');
    });
    app.get('/error', (req, res) => {
      res.render('error');
    });
  });

  it('should handle single folder', async () => {
    app.set('views', './test/views/multiple/views1');
    const res = await request(app, '/test1');
    const expected = '<h1>test1</h1>\n';
    assert.equal(res.text, expected);
  });

  it('should handle multiple folders', async () => {
    app.set('views', ['./test/views/multiple/views1', './test/views/multiple/views2']);
    const res = await request(app, '/test2');
    const expected = '<h1>test2</h1>\n';
    assert.equal(res.text, expected);
  });

  describe('should handle multiple folders in specific order', () => {

    it('views1, views2', async () => {
      app.set('views', ['./test/views/multiple/views1', './test/views/multiple/views2']);
      const res = await request(app, '/collide');
      const expected = '<h1>collide1</h1>\n';
      assert.equal(res.text, expected);
    });

    it('views2, views1', async () => {
      app.set('views', ['./test/views/multiple/views2', './test/views/multiple/views1']);
      const res = await request(app, '/collide');
      const expected = '<h1>collide2</h1>\n';
      assert.equal(res.text, expected);
    });

  });

  /* eslint-disable no-unused-vars */
  describe('should report the filename in error', () => {

    it('should report from first folder', async () => {
      app.set('views', ['./test/views/multiple/views1', './test/views/multiple/views2']);
      app.use((err, req, res, next) => {
        res.status(500).send(err.stack);
      });

      const res = await request(app, '/error');
      assert.equal(res.statusCode, 500);
      assert(res.text.indexOf('views1/error.hbs]') > 0);
    });


    it('should report from second folder', async () => {
      app.set('views', ['./test/views/multiple/views2', './test/views/multiple/views1']);
      app.use((err, req, res, next) => {
        res.status(500).send(err.stack);
      });

      const res = await request(app, '/error');
      assert.equal(res.statusCode, 500);
      assert(res.text.indexOf('views2/error.hbs]') > 0);
    });
  });
  /* eslint-enable no-unused-vars */

});
