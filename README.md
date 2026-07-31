# express-hbs

Express handlebars template engine with multiple layouts, blocks and cached partials.

## Fork Notice

This project is an update of the original `express-hbs`, focused on Node.js 26+ and Express 5 compatibility.

- Original project: https://github.com/TryGhost/express-hbs
- Fork (this project): https://github.com/EriksRemess/express-hbs
- GitHub Packages name: `@eriksremess/express-hbs`

All credit for the engine design and original implementation goes to the original `express-hbs` developers and contributors.

## Requirements

- Node.js 26.0.0 or newer.
- Express 5.

Node.js 26 is a Current release before its planned LTS transition in October 2026.

## v2.0.0

Version 2 was a rewrite and cleanup, with no known breaking changes. Lots of bugs were fixed which may have subtly changed behaviour.

Full details: https://github.com/TryGhost/express-hbs/releases/tag/2.0.0

## v1.0.0 Breaking Changes

If you're upgrading from v0.8.4 to v1.0.0 there are some potentially breaking changes to be aware of:

1. Version 1 originally moved this project to Handlebars 4.0.5. The current fork now vendors a newer modernized Handlebars-derived runtime/compiler under `lib/handlebars/`.
2. The file extension for partial files must now match the extension configured in `extname` - please see [the PR](https://github.com/TryGhost/express-hbs/pull/88)

## Usage

To use with Express 5:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import hbs from '@eriksremess/express-hbs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, 'views');

// Use `.hbs` for extensions and find partials in `views/partials`.
app.engine('hbs', hbs.express({
  partialsDir: path.join(viewsDir, 'partials')
}));
app.set('view engine', 'hbs');
app.set('views', viewsDir);
```

Common options for `hbs.express()`:

```js
hbs.express({
  // Template and partial file extension. Defaults to `.hbs`.
  extname: '.hbs',

  // One or more partial directories.
  partialsDir: path.join(viewsDir, 'partials'),

  // One or more layout directories.
  layoutsDir: path.join(viewsDir, 'layout'),

  // View directory fallback for non-Express rendering.
  viewsDir,

  // Default layout path. Set to false to disable the default layout.
  defaultLayout: path.join(viewsDir, 'layout/default.hbs'),

  // Re-scan partial directories on each cache pass.
  refreshPartialsManifest: false,

  // Restrict declarative and programmatic layout reads to a safe root.
  restrictLayoutsTo: viewsDir,

  // Override helper names.
  blockHelperName: 'block',
  contentHelperName: 'contentFor',

  // Use an external Handlebars instance.
  // handlebars: externalHandlebars,

  // Register `__` and `__n` helpers from an i18n object.
  // i18n,

  // Options passed to compiled templates.
  templateOptions: {
    data: {
      appName: 'example'
    }
  },

  // Override the default compiler.
  onCompile(exhbs, source, filename) {
    const options = filename?.includes('partials')
      ? { preventIndent: true }
      : undefined;
    return exhbs.handlebars.compile(source, options);
  }
});
```

## Syntax

To mark where layout should insert page

    {{{body}}}

To declare a block placeholder in layout

    {{{block "pageScripts"}}}

To define block content in a page

    {{#contentFor "pageScripts"}}
      CONTENT HERE
    {{/contentFor}}

## Layouts

There are three ways to use a layout, listed in precedence order

1.  Declarative within a page. Use handlebars comment

        {{!< LAYOUT}}

    Declarative layouts are restricted to a safe root by default:
    if the path starts with `.`, it is confined to the template's directory;
    otherwise it is confined to `layoutsDir` when configured, or to the template's directory when not.

    Set `restrictLayoutsTo` to override or tighten that root explicitly.

    Layout file resolution:

        If path starts with '.'
            LAYOUT is relative to template
        Else If `layoutsDir` is set
            LAYOUT is relative to `layoutsDir`
        Else
            LAYOUT from path.resolve(dirname(template), LAYOUT)

2.  As an option to render

    `layout` is restricted to a safe root by default:
    if it starts with `.`, it is confined to the template's directory;
    otherwise it is confined to `layoutsDir` when configured, or `views` when not.

    Set `restrictLayoutsTo` to override or tighten that root explicitly, including when you want to allow absolute layout paths inside a particular directory.

    ```js
    res.render('veggies', {
      title: 'My favorite veggies',
      veggies: veggies,
      layout: 'layout/veggie'
    });
    ```

    This option also allows for layout suppression (both the default layout and when specified declaratively in a page) by passing in a falsy JavaScript value as the value of the `layout` property:

    ```js
    res.render('veggies', {
      title: 'My favorite veggies',
      veggies: veggies,
      layout: null // render without using a layout template
    });
    ```

    Layout file resolution:

        If path starts with '.'
            layout is relative to template
        Else If `layoutsDir` is set
            layout is relative to `layoutsDir`
        Else
            layout from path.resolve(viewsDir, layout)

3.  Lastly, use `defaultLayout` if specified in hbs configuration options.

Layouts can be nested: just include a declarative layout tag within any layout
template to have its content included in the declared "parent" layout.  Be
aware that too much nesting can impact performance, and stay away from
infinite loops!

## Render cancellation

Render options may include an `AbortSignal`. Template, layout, and partial filesystem reads and stats will observe the signal.

```js
app.get('/page', (req, res, next) => {
  res.render('page', {
    title: 'Page',
    signal: req.signal
  }, (err, html) => {
    if (err) {
      next(err);
      return;
    }

    res.send(html);
  });
});
```

## Helpers

### Synchronous helpers

```js
hbs.registerHelper('link', (text, options) => {
  const isSafeAttrName = (name) => /^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(name);
  const attrs = Object.entries(options.hash)
    .filter(([name]) => isSafeAttrName(name))
    .map(([name, value]) => `${name}="${hbs.Utils.escapeExpression(value)}"`)
    .join(' ');

  const escapedText = hbs.Utils.escapeExpression(text);
  const attrText = attrs ? ` ${attrs}` : '';
  return new hbs.SafeString(`<a${attrText}>${escapedText}</a>`);
});
```

In markup:

```
{{{link 'barc.com' href='http://barc.com'}}}
```

### Asynchronous helpers

```js
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

async function readViewFile(filename) {
  try {
    const resolvedPath = path.resolve(viewsDir, filename);
    const [realViewsDir, realResolvedPath] = await Promise.all([
      realpath(viewsDir),
      realpath(resolvedPath)
    ]);

    const relativePath = path.relative(realViewsDir, realResolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return '';
    }

    return readFile(realResolvedPath, 'utf8');
  } catch {
    return '';
  }
}

hbs.registerAsyncHelper('readFile', async (filename) =>
  new hbs.SafeString(await readViewFile(filename))
);
```

In markup:

```
{{{readFile 'tos.txt'}}}
```

Callback-style async helpers are still supported for compatibility with the same `readViewFile` helper:

```js
hbs.registerAsyncHelper('readFile', (filename, cb) => {
  readViewFile(filename)
    .then((content) => cb(new hbs.SafeString(content)))
    .catch(() => cb(new hbs.SafeString('')));
});
```

## i18n support

Express-hbs supports [i18n](https://github.com/mashpie/i18n-node)

```js
import cookieParser from 'cookie-parser';
import i18n from 'i18n';

// Minimal config
i18n.configure({
  locales: ['en', 'fr'],
  cookie: 'locale',
  directory: path.join(__dirname, 'locales')
});

app.engine('hbs', hbs.express({
  // ... options from above
  i18n // registers __ and __n helpers
}));
app.set('view engine', 'hbs');
app.set('views', viewsDir);

// Cookies are needed.
app.use(cookieParser());

// Initialize the i18n middleware.
app.use(i18n.init);
```

## Engine Instances

Create isolated engine instances with their own cache system and Handlebars engine.

```js
import hbs from '@eriksremess/express-hbs';

const instance1 = hbs.create();
const instance2 = hbs.create();
```

## Template options

The main use case for template options is setting the handlebars `data` object. This creates global template variables accessible with an `@` prefix.

Template options can be set in three ways. Global template options can be [passed as config on creation of an instance](#usage), and they can also be updated using the `updateTemplateOptions(templateOptions)` method of an instance. Per-request template options can be set on `res.locals` using `updateLocalTemplateOptions(locals, templateOptions)`.

Per-request local template options are sanitized before render and cannot override Handlebars runtime security controls such as prototype-access settings or `allowCallsToHelperMissing`.

Both of these methods have a companion method `getTemplateOptions()` and `getLocalTemplateOptions(locals)`, which should be used when extending or merging the current options.

## Example

In file `app.js`

```js
// http://expressjs.com/api.html#app.locals
app.locals({
  PROD_MODE: app.get('env') === 'production'
});
```

File `views/layout/default.hbs`

```html
<html>
  <head>
    <title>{{title}}</title>
    <link type="text/css" rel="stylesheet" href="/css/style.css"/>
    {{{block "pageStyles"}}}
  </head>
  <body>
    {{{body}}}

    {{> scripts}}

    {{#if PROD_MODE}}
    {{{block 'googleAnalyticsScripts'}}}
    {{/if}}

  </body>
</html>
```


File `views/index.hbs`

```html
{{!< default}}

{{#contentFor 'pageStyles'}}
<style>
  .clicker {
    color: blue;
  };
</style>
{{/contentFor}}

<h1>{{title}}</h1>
<p class="clicker">Click me!</p>
```

To run example project

```sh
npm install
node example/app.js
```

## TypeScript declarations

Generate declaration files (`.d.ts`) from JSDoc annotations:

```sh
npm run types:build
```

Rebuild declarations from scratch:

```sh
npm run types:rebuild
```

## Testing

Install dependencies and run:

```sh
npm install
npm run ci
```

For the quick test-and-lint path:

```sh
npm test
```

## Credits

Inspiration and code from [donpark/hbs](https://github.com/donpark/hbs)

Big thanks to all [CONTRIBUTORS](https://github.com/TryGhost/express-hbs/contributors)


## License

The MIT License (MIT)

Copyright (c) 2012-2026 Barc, Inc., Ghost Foundation - Released under the [MIT license](LICENSE).
