import hbs, { type EngineOptions } from '@eriksremess/express-hbs';

const renderWithoutOptions = hbs.express();
renderWithoutOptions('/tmp/example.hbs', {}, (_err, _html) => {});

const isolated = hbs.create();
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
