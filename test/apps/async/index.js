import express from '@eriksremess/express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pages = [
  {
    id: 1,
    title: 'Title 1'
  },
  {
    id: 2,
    title: 'Title 2'
  },
  {
    id: 3,
    title: 'Title 3'
  }
]

const comments = [
  {
    id: 1,
    page: 1,
    subject: 'Title 1 Comment 1',
    auther: 'JT'
  },
  {
    id: 2,
    page: 1,
    subject: 'Title 1 Comment 2',
    auther: 'Anna'
  },
  {
    id: 3,
    page: 1,
    subject: 'Title 1 Comment 3',
    auther: 'Jane'
  },
  {
    id: 4,
    page: 1,
    subject: 'Title 1 Comment 4',
    auther: 'Bob'
  },
  {
    id: 5,
    page: 4,
    subject: 'This should not show!',
    auther: 'Jill'
  }
]

const getRandomNumber = (min, max) => Math.random() * (max - min) + min;

function create(hbs, env) {
  if (env) process.env.NODE_ENV = env;
  const app = express();
  const viewsDir = path.join(__dirname, 'views');

  // Hook in express-hbs and tell it where known directories reside
  app.engine('hbs', hbs.express({
    defaultLayout: path.join(viewsDir, 'layout.hbs'),
    restrictLayoutsTo: viewsDir
  }));
  app.set('view engine', 'hbs');
  app.set('views', viewsDir);

  app.use(cookieParser());

  app.get('/', (req, res) => {
    res.render('index', {
      message: 'Hello,',
      username: req.cookies.user
    });
  });

  app.get('/fail', (req, res) => {
    res.render('failer');
  });

  hbs.registerAsyncHelper('user', (username, resultcb) => {
    setTimeout(() => {
      resultcb(username);
    }, getRandomNumber(100, 900))
  });

  hbs.registerAsyncHelper('pages', function(options, resultcb) {
    const self = this;
    setTimeout(() => {
      const result = [];
      for (let i = 0; i < pages.length; i++) {
        options.data.page = pages[i];
        result.push(options.fn.call(self, pages[i], options));
      }
      resultcb(result.join(''));
    }, getRandomNumber(100, 900))
  });

  hbs.registerAsyncHelper('comments', (options, resultcb) => {
    setTimeout(() => {
      const result = [];
      for (let i = 0; i < comments.length; i++) {
        if (options.hash.page === comments[i].page) {
          result.push(options.fn(comments[i]));
        }
      }
      resultcb(result.join(''));
    }, getRandomNumber(100, 300))
  });

  hbs.registerAsyncHelper('failer', (_, resultcb) => {
    setTimeout(() => {
      resultcb(options.fn());
    }, 100);
  })

  return app;
}

export { create };
