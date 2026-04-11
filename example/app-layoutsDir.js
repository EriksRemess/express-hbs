// npm install express express-hbs

import hbs from '#hbs';
import express from 'express';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const relative = (filePath) => path.join(__dirname, filePath);
const isSafeAttrName = (name) => /^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(name);

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

function startServer(serverApp, port = 3000) {
  const server = serverApp.listen(port, () => {
    console.log(`Express server listening on port ${port}`);
  });

  server.on('error', (err) => {
    console.error(err);
    process.exitCode = 1;
  });

  return server;
}

const app = express();
const viewsDir = relative('views');

app.use(express.static(relative('public')));

// Hook in express-hbs and tell it where known directories reside
app.engine('hbs', hbs.express({
  partialsDir: [relative('views/partials'), relative('views/partials-other')],
  layoutsDir: relative('views/layout'),
  defaultLayout: relative('views/layout/default.hbs'),
  restrictLayoutsTo: relative('views/layout')
}));
app.set('view engine', 'hbs');
app.set('views', viewsDir);

// Register sync helper
hbs.registerHelper('link', (text, options) => {
  const attrs = Object.entries(options.hash)
    .filter(([name]) => isSafeAttrName(name))
    .map(([name, value]) => `${name}="${hbs.Utils.escapeExpression(value)}"`)
    .join(' ');
  const escapedText = hbs.Utils.escapeExpression(text);
  const attrText = attrs ? ` ${attrs}` : '';
  return new hbs.SafeString(`<a${attrText}>${escapedText}</a>`);
});

// Register async helpers
hbs.registerAsyncHelper('readFile', async (filename, cb) => {
  let content = '';
  try {
    const resolvedPath = path.resolve(viewsDir, filename);
    const [realViewsDir, realResolvedPath] = await Promise.all([
      realpath(viewsDir),
      realpath(resolvedPath)
    ]);
    const relativePath = path.relative(realViewsDir, realResolvedPath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Refusing to read file outside of viewsDir: ${filename}`);
    }

    content = await readFile(realResolvedPath, 'utf8');
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

app.get('/fruits', (req, res) => {
  res.render('fruits/index-layoutsDir', {
    title: 'My favorite fruits',
    fruits
  });
});

app.get('/fruits/:name', (req, res) => {
  res.render('fruits/details-layoutsDir', {
    fruit: req.params.name
  });
});

app.get('/veggies', (req, res) => {
  res.render('veggies', {
    title: 'My favorite veggies',
    veggies,
    layout: 'veggie'
  });
});

app.get('/veggies/explicit-dir', (req, res) => {
  res.render('veggies', {
    title: 'My favorite veggies',
    veggies,
    layout: relative('views/layout/veggie')
  });
});

app.get('/veggies/:name', (req, res) => {
  res.render('veggies/details', {
    veggie: req.params.name,
    layout: 'veggie-details'
  });
});

if (isMainModule()) {
  startServer(app);
}

export default app;
