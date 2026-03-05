import hbsDefault from '#hbs';
import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const relative = (filePath) => path.join( __dirname, filePath );

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

function startServer(app, port = 3000) {
  const server = app.listen(port, () => {
    console.log(`Express server listening on port ${port}`);
  });

  server.on('error', (err) => {
    console.error(err);
    process.exitCode = 1;
  });

  return server;
}

export function create(hbs, env) {
  if (env) process.env.NODE_ENV = env;

  const app = express();
  const viewsDir = relative('views');

  app.use(express.static(relative('public')));

  // Hook in express-hbs and tell it where known directories reside
  app.engine('hbs', hbs.express({
    partialsDir: [relative('views/partials'), relative('views/partials-other')],
    defaultLayout: relative('views/layout/default.hbs'),
    restrictLayoutsTo: viewsDir
  }));
  app.set('view engine', 'hbs');
  app.set('views', viewsDir);

  // Register sync helper
  hbs.registerHelper('link', (text, options) => {
    const attrs = [];
    for (const prop in options.hash) {
      attrs.push(prop + '="' + options.hash[prop] + '"');
    }
    return new hbs.SafeString(
      '<a ' + attrs.join(' ') + '>' + text + '</a>'
    );
  });

  // Register async helpers
  hbs.registerAsyncHelper('readFile', async (filename, cb) => {
    let content;
    try {
      content = await readFile(path.join(viewsDir, filename), 'utf8');
    } catch (err) {
      console.error(err);
    }
    cb(new hbs.SafeString(content));
  });

  const fruits = [
    { name: 'apple' },
    { name: 'orange' },
    { name: 'pear' }
  ];

  const veggies = [
    { name: 'asparagus' },
    { name: 'carrot' },
    { name: 'spinach' }
  ];

  app.get('/', (req, res) => {
    res.render('index', {
      title: 'express-hbs example'
    });
  });

  app.get('/replace', (req, res) => {
    res.render('replace', {
      title: 'express-hbs example'
    });
  });

  app.get('/fruits', (req, res) => {
    res.render('fruits/index', {
      title: 'My favorite fruits',
      fruits
    });
  });

  app.get('/fruits/:name', (req, res) => {
    res.render('fruits/details', {
      fruit: req.params.name
    });
  });

  app.get('/veggies', (req, res) => {
    res.render('veggies', {
      title: 'My favorite veggies',
      veggies,
      layout: 'layout/veggie'
    });
  });

  app.get('/veggies/:name', (req, res) => {
    res.render('veggies/details', {
      veggie: req.params.name,
      layout: 'layout/veggie-details'
    });
  });

  return app;
}

if (isMainModule()) {
  startServer(create(hbsDefault));
}

export default create;
