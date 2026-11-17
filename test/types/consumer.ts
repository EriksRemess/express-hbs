import hbs, { type EngineOptions } from '@eriksremess/express-hbs';
import upstreamHandlebars from 'handlebars';

const renderWithoutOptions = hbs.express();
renderWithoutOptions('/tmp/example.hbs', {}, (_err, _html) => {});

const isolated = hbs.create();
const handlebars = isolated.handlebars.create();
handlebars.create().compile('{{value}}')({ value: 'example' });
handlebars.unregisterHelper('example');
handlebars.unregisterPartial('example');
handlebars.registerHelper({ one: () => 'one', two: () => 'two' });
handlebars.registerPartial({ one: 'one', two: () => 'two' });
handlebars.registerDecorator({ identity: (fn: Function) => fn });
handlebars.unregisterDecorator('identity');
hbs.registerHelper({ one: () => 'one', two: () => 'two' });
const ast = handlebars.parse('{{value}}');
handlebars.compile(ast)({ value: 'example' });
const precompiled: string = handlebars.precompile(ast);
const precompiledWithSource: string = handlebars.precompile(ast, { srcName: 'example.hbs' }).code;
handlebars.template({ main: () => precompiled + precompiledWithSource })({});
hbs.create().express({ handlebars: upstreamHandlebars.create() });
const renderWithDisabledDefaultLayout = isolated.express({
  defaultLayout: false,
  viewsDir: ['views-a', 'views-b'],
  partialsDir: 'views/partials',
  templateOptions: {
    data: {
      appName: 'example'
    }
  }
});

renderWithDisabledDefaultLayout('/tmp/example.hbs', '<p>{{@appName}}</p>', {}, (_err, _html) => {});

const options: EngineOptions = {
  defaultLayout: false,
  contentHelperName: 'content',
  blockHelperName: 'block'
};

hbs.express4(options);
hbs.updateLocalTemplateOptions({}, {
  data: {
    section: 'main'
  }
});

const partialsReady: Promise<boolean> = isolated.cachePartials();
const compiledLayouts: Promise<Function[]> = isolated.cacheLayout('layout.hbs', true);
const defaultLayouts: Promise<Function[] | null> = isolated.loadDefaultLayout(true);
const callbackReturn: void = isolated.cachePartials((_err, _ready) => {});

// @ts-expect-error Both render forms require a completion callback.
renderWithoutOptions('page.hbs', {}, {});
// @ts-expect-error Inline source also requires an options argument.
renderWithoutOptions('page.hbs', '{{title}}', (_err: Error | null, _html: string | null) => {});
isolated.___express('page.hbs', '{{title}}', { title: 'hello' }, (_err, _html) => {});
