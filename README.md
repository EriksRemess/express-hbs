# express-hbs

Express handlebars template engine with multiple layouts, blocks and cached partials.

## Fork Notice

This project is an update of the original `express-hbs`, focused on latest Node.js LTS and Express 5 compatibility.

- Original project: https://github.com/TryGhost/express-hbs
- Fork (this project): https://github.com/EriksRemess/express-hbs
- npm package name: `@eriks/express-hbs`

All credit for the engine design and original implementation goes to the original `express-hbs` developers and contributors.

## v2.0.0

Version 2 was a rewrite and cleanup, with no known breaking changes. Lots of bugs were fixed which may have subtly changed behaviour.

Full details: https://github.com/TryGhost/express-hbs/releases/tag/2.0.0

## v1.0.0 Breaking Changes

If you're upgrading from v0.8.4 to v1.0.0 there are some potentially breaking changes to be aware of:

1. Handlebars @v4.0.5 - please see the [handlebars v4.0 compatibility notes](https://github.com/wycats/handlebars.js/blob/master/release-notes.md#v400---september-1st-2015)
2. The file extension for partial files must now match the extension configured in `extname` - please see [the PR](https://github.com/TryGhost/express-hbs/pull/88)

## Usage

To use with Express 5.
```js
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import hbs from '@eriks/express-hbs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use `.hbs` for extensions and find partials in `views/partials`.
app.engine('hbs', hbs.express({
  partialsDir: path.join(__dirname, 'views/partials')
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
```
Options for `#express`

```js
hbs.express({
  partialsDir: "{String/Array} [Required] Path to partials templates, one or several directories",

  // OPTIONAL settings
  restrictLayoutsTo: "{String} Absolute path to a directory to restrict layout directive reading from",
  blockHelperName: "{String} Override 'block' helper name.",
  contentHelperName: "{String} Override 'contentFor' helper name.",
  defaultLayout: "{String} Absolute path to default layout template",
  extname: "{String} Extension for templates & partials, defaults to `.hbs`",
  handlebars: "{Module} Use external handlebars instead of @eriks/express-hbs dependency",
  i18n: "{Object} i18n object",
  layoutsDir: "{String} Path to layout templates",
  templateOptions: "{Object} options to pass to template()",

  // override the default compile
  onCompile: function(exhbs, source, filename) {
    var options;
    if (filename && filename.indexOf('partials') > -1) {
      options = {preventIndent: true};
    }
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

    Layout file resolution:

        If path starts with '.'
            LAYOUT is relative to template
        Else If `layoutsDir` is set
            LAYOUT is relative to `layoutsDir`
        Else
            LAYOUT from path.resolve(dirname(template), LAYOUT)

2.  As an option to render

    ## ⚠️ This creates a potential security vulnerability if used without a `restrictLayoutsTo`:

    The `restrictLayoutsTo` option will restrict reading layouts to a particular directory, if you do not pass this option then do not use the `layout` option in conjunction with passing user submitted data to res.render e.g. `res.render('index', req.query)`. This allows users to read arbitrary files from your filesystem!

    ```js
    res.render('veggies', {
      title: 'My favorite veggies',
      veggies: veggies,
      layout: 'layout/veggie'
    });
    ```

    This option also allows for layout suppression (both the default layout and when specified declaratively in a page) by passing in a falsey Javascript value as the value of the `layout` property:

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
aware that too much nesting can impact performances, and stay away from
infinite loops!

## Helpers

### Synchronous helpers

```js
hbs.registerHelper('link', function(text, options) {
  var attrs = [];
  for(var prop in options.hash) {
    attrs.push(prop + '="' + options.hash[prop] + '"');
  }
  return new hbs.SafeString(
    "<a " + attrs.join(" ") + ">" + text + "</a>"
  );
});
```

in markup
```
{{{link 'barc.com' href='http://barc.com'}}}
```

### Asynchronous helpers

```js
hbs.registerAsyncHelper('readFile', function(filename, cb) {
  fs.readFile(path.join(viewsDir, filename), 'utf8', function(err, content) {
    cb(new hbs.SafeString(content));
  });
});
```

in markup
```
{{{readFile 'tos.txt'}}}
```


## i18n support

Express-hbs supports [i18n](https://github.com/mashpie/i18n-node)

```js
import cookieParser from 'cookie-parser';
import i18n from 'i18n';

// minimal config
i18n.configure({
    locales: ['en', 'fr'],
    cookie: 'locale',
    directory: path.join(__dirname, 'locales')
});

app.engine('hbs', hbs.express({
    // ... options from above
    i18n: i18n,  // registers __ and __n helpers
}));
app.set('view engine', 'hbs');
app.set('views', viewsDir);

// cookies are needed
app.use(cookieParser());

// init i18n module
app.use(i18n.init);
```

## Engine Instances

Create isolated engine instances with their own cache system and handlebars engine.

```js
import hbs from '@eriks/express-hbs';
var instance1 = hbs.create();
var instance2 = hbs.create();
```

## Template options

The main use case for template options is setting the handlebars "data" object - this creates global template variables accessible with an `@` prefix.

Template options can be set in 3 ways. When setting global template options they can be [passed as config on creation of an instance](https://github.com/barc/express-hbs#usage), and they can also be updated used the `updateTemplateOptions(templateOptions)` method of an instance. To set template options for an individual request they can be set on `res.locals` using the helper method `updateLocalTemplateOptions(locals, templateOptions)`.

Both of these methods have a companion method `getTemplateOptions()` and `getLocalTemplateOptions(locals)`, which should be used when extending or merging the current options.

## Example

in File `app.js`

```js
// http://expressjs.com/api.html#app.locals
app.locals({
    'PROD_MODE': 'production' === app.get('env')
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

    npm install
    node example/app.js

## TypeScript declarations

Generate declaration files (`.d.ts`) from JSDoc annotations:

  npm run types:build

Rebuild declarations from scratch:

  npm run types:rebuild


## Testing

Install dependencies and run:

    npm install
    npm test


## Credits

Inspiration and code from [donpark/hbs](https://github.com/donpark/hbs)

Big thanks to all [CONTRIBUTORS](https://github.com/TryGhost/express-hbs/contributors)


## License

The MIT License (MIT)

Copyright (c) 2012-2026 Barc, Inc., Ghost Foundation - Released under the [MIT license](LICENSE).
