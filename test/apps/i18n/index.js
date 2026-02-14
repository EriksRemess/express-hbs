/**
 * This example is intended to show a cookie usage in express setup
 * with handlebars (hbs) template engine and also to be run
 * as integration test for concurrency issues.
 *
 * Please remove setTimeout(), if you intend to use it as a blueprint!
 *
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import i18n from 'i18n';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function create(hbs, env) {
  if (env) process.env.NODE_ENV = env;

  const app = express();
  const viewsDir = __dirname + '/views';

  // minimal config
  i18n.configure({
    locales: ['en', 'fr'],
    cookie: 'locale',
    directory: __dirname + '/locales'
  });

  // Hook in express-hbs and tell it where known directories reside
  app.engine('hbs', hbs.express({
    i18n: i18n,
    restrictLayoutsTo: viewsDir
  }));
  app.set('view engine', 'hbs');
  app.set('views', viewsDir);

  // you'll need cookies
  app.use(cookieParser());

  // init i18n module for this loop
  app.use(i18n.init);

  app.get('/', (req, res) => {
    res.render('index', {
      array: [1, 2]
    });
  });

  return app;
}

export { create };
