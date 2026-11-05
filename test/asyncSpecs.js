import hbs from '#hbs';
import { hasResolvers } from '#lib/resolver';
import { create as createAsyncApp } from '#test/apps/async/index';
import { request } from '#test/http';
import { describe, it } from '#test/testkit';
import assert from 'node:assert';

async function makeUserRequest(app, user) {
  const res = await request(app, '/', {
    headers: {
      Cookie: 'user=' + user
    }
  });
  if (res.text.search('Hello, ' + user) <= 0) {
    throw new Error('Wrong template send for user ' + user + ': ' + res.text);
  }
  return res.text;
}

async function requestAll(app, users) {
  const status = {};
  for (let i = 0; i < users.length; i++) {
    status[users[i]] = 'Pending';
  }

  await Promise.all(users.map(async (user) => {
    try {
      await makeUserRequest(app, user);
      status[user] = 'Completed';
    } catch (err) {
      status[user] = 'Error: ' + err.message;
    }
  }));

  return status;
}

describe('async', () => {
  it('preserves each layout body until deferred blocks finish', async () => {
    const hb = hbs.create();
    hb.express();
    hb.registerAsyncHelper('later', async function(options) {
      await Promise.resolve();
      return options.fn(this);
    });
    const page = hb.compile('{{title}}');
    const layouts = [
      hb.compile('{{#later}}OUTER[{{{body}}}]{{/later}}'),
      hb.compile('{{#later}}INNER[{{{body}}}]{{/later}}')
    ];
    const results = await Promise.all(['ALICE', 'BOB'].map(async title => {
      const locals = { title, body: 'original', resolverCache: new Map(), blockCache: Object.create(null) };
      const output = hb._renderWithLayouts(page, locals, layouts);
      assert.equal(locals.body, 'original');
      return hb._resolveAsyncHtml(locals.resolverCache, output);
    }));
    assert.deepEqual(results, ['OUTER[INNER[ALICE]]', 'OUTER[INNER[BOB]]']);
  });

  it('keeps template options hidden from deferred blocks in precompiled templates', async () => {
    for (const precompiled of [false, true]) {
      const hb = hbs.create();
      hb.express(precompiled ? {
        onCompile(engine, source) {
          return engine.handlebars.template(Function(`return (${engine.handlebars.precompile(source)})`)());
        }
      } : {});
      hb.registerAsyncHelper('later', async function(options) {
        await Promise.resolve();
        return options.fn(this);
      });
      const locals = { _templateOptions: { data: { hidden: 'runtime-data' } } };
      const source = '{{#later}}[{{_templateOptions.data.hidden}}|{{@root._templateOptions.data.hidden}}|{{@hidden}}]{{/later}}';
      assert.equal(await hb._renderFile('/tmp/async-private-options.hbs', source, locals), '[||runtime-data]');
      assert.deepEqual(locals, { _templateOptions: { data: { hidden: 'runtime-data' } } });
    }
  });

  it('resolves both string and HTML representations of custom async wrappers', async () => {
    const hb = hbs.create();
    hb.express();
    hb.registerAsyncHelper('inner', async () => '<i>value</i>');
    const inner = hb.handlebars.compile('{{inner}}|{{{inner}}}');
    hb.registerAsyncHelper('wrapped', async function(options) {
      await Promise.resolve();
      const body = options.fn ? options.fn(this) : inner(this, { data: options.data });
      return {
        toString: () => `<raw>${body}</raw>`,
        toHTML: () => `<html>${body}</html>`
      };
    });
    const body = '&lt;i&gt;value&lt;/i&gt;|<i>value</i>';
    assert.equal(await hb._renderFile('/tmp/async-html-wrapper.hbs', '{{wrapped}}|{{{wrapped}}}', {}),
      `<html>${body}</html>|<raw>${body}</raw>`);
    assert.equal(await hb._renderFile('/tmp/async-block-wrapper.hbs', '{{#wrapped}}{{inner}}|{{{inner}}}{{/wrapped}}', {}),
      `<raw>${body}</raw>`);
    hb.registerAsyncHelper('untrusted', async () => Object.create({
      toString: () => '<untrusted>',
      toHTML: () => '<trusted>'
    }));
    assert.equal(await hb._renderFile('/tmp/async-inherited-html.hbs', '{{untrusted}}|{{{untrusted}}}', {}),
      '&lt;untrusted&gt;|<untrusted>');

    hb.registerAsyncHelper('htmlOnly', async function(options) {
      const body = inner(this, { data: options.data });
      return Object.assign(Object.create(null), { toHTML: () => `<html>${body}</html>` });
    });
    assert.equal(await hb._renderFile('/tmp/async-html-only.hbs', '{{htmlOnly}}', {}), `<html>${body}</html>`);
    await assert.rejects(hb._renderFile('/tmp/async-html-only-raw.hbs', '{{{htmlOnly}}}', {}), TypeError);

    const id = '__aSyNcId__<_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa__';
    const escapedId = id.replace('<', '&lt;');
    assert.equal(await hb._resolveAsyncHtml({
      [id]: Promise.resolve({ toString: () => 'raw', toHTML: () => 'prefix' + id })
    }, id + '|' + escapedId), 'raw|prefixraw');
    assert.equal(await hb._resolveAsyncHtml({
      [id]: Promise.resolve({ toString: () => 'prefix' + escapedId, toHTML: () => 'html' })
    }, id + '|' + escapedId), 'prefixhtml|html');
    await assert.rejects(hb._resolveAsyncHtml({
      [id]: Promise.resolve({ toString: () => 'raw', toHTML: () => 'prefix' + escapedId })
    }, escapedId), /unresolved async placeholder/i);
    await assert.rejects(hb._resolveAsyncHtml({
      [id]: Promise.resolve({ toString: () => escapedId, toHTML: () => 'prefix' + id })
    }, escapedId), /unresolved async placeholder/i);
  });

  it('preserves iteration data and parent data across deferred helpers', async () => {
    const hb = hbs.create();
    hb.express();
    hb.registerAsyncHelper('later', async function(options) {
      await Promise.resolve();
      return options.fn(this);
    });
    hb.registerAsyncHelper('index', async function(options) {
      await Promise.resolve();
      return options.data.index;
    });
    const locals = { rows: [['a', 'b'], ['c', 'd']] };
    assert.equal(await hb._renderFile('/tmp/async-iteration.hbs',
      '{{#each rows}}{{#each this}}{{#later}}{{@../index}}/{{@index}}:{{this}}:{{index}}:{{@first}}/{{@last}};{{/later}}{{/each}}{{/each}}',
      locals), '0/0:a:0:true/false;0/1:b:1:false/true;1/0:c:0:true/false;1/1:d:1:false/true;');
    assert.equal(await hb._renderFile('/tmp/async-index.hbs',
      '{{#each rows}}{{index}};{{/each}}', locals), '0;1;');
  });

  it('honors explicitly supplied data and inverse branches in deferred blocks', async () => {
    const hb = hbs.create();
    hb.express();
    hb.registerAsyncHelper('later', async function(options) {
      await Promise.resolve();
      const data = hb.handlebars.createFrame(options.data);
      data.index = 99;
      return options.inverse(this, { data });
    });
    assert.equal(await hb._renderFile('/tmp/async-inverse.hbs',
      '{{#each rows}}{{#later}}unused{{else}}{{@index}}/{{@root.title}};{{/later}}{{/each}}',
      { rows: ['a', 'b'], title: 'root' }), '99/root;99/root;');
  });

  for (const data of [true, false]) {
    it(`isolates deferred blocks between cached renders with data=${data}`, async () => {
      const hb = hbs.create();
      hb.express({ onCompile: (engine, source) => engine.handlebars.compile(source, { data }) });
      const ready = Promise.withResolvers();
      const pending = [];
      hb.registerAsyncHelper('later', function(options, cb) {
        pending.push(() => cb(options.fn(this)));
        if (pending.length === 2) ready.resolve();
      });
      const source = '{{#later}}{{who}}/{{> person}}{{/later}}!';
      const render = (name) => hb._renderFile('/tmp/async-isolation.hbs', source, {
        cache: true,
        _templateOptions: {
          helpers: { who: () => name },
          partials: { person: name }
        }
      });
      const first = render('ALICE');
      const second = render('BOB');
      await ready.promise;
      pending.reverse().forEach(run => run());
      assert.deepEqual(await Promise.all([first, second]), ['ALICE/ALICE!', 'BOB/BOB!']);
    });
  }

  it('preserves inline partial scope in deferred blocks', async () => {
    const hb = hbs.create();
    hb.express();
    hb.registerAsyncHelper('later', async function(options) {
      await Promise.resolve();
      return options.fn(this);
    });
    assert.equal(await hb._renderFile('/tmp/async-inline.hbs',
      '{{#*inline "p"}}OUTER{{/inline}}{{#later}}{{> p}}/{{#*inline "q"}}INNER{{/inline}}{{#later}}{{> q}}/{{> p}}{{/later}}{{/later}}!',
      {}), 'OUTER/INNER/OUTER!');
  });

  it('preserves prototype policies in deferred blocks and retained lookup functions', () => {
    const hb = hbs.create().handlebars;
    const pending = [];
    hb.registerHelper('later', function(options) {
      pending.push(() => options.fn(this));
      return '';
    });
    hb.registerHelper('peek', function(options) {
      pending.push(() => options.lookupProperty(this.item, 'secret'));
      return '';
    });
    const render = hb.compile('{{#later}}{{item.secret}}{{/later}}{{peek}}');
    const context = { item: Object.create({ secret: 'secret' }) };
    render(context, { allowedProtoProperties: { secret: true } });
    render(context, { allowedProtoProperties: { secret: false } });
    assert.deepEqual(pending.map(run => run()), ['secret', 'secret', '', undefined]);
  });

  it('passes options to promise helpers while preserving legacy callbacks', async () => {
    const hb = hbs.create();
    hb.express();
    hb.registerAsyncHelper('native', async (value, options) => options.hash.prefix + value);
    hb.registerAsyncHelper('promise', (value, options) => Promise.resolve(options.hash.prefix + value));
    hb.registerAsyncHelper('legacy', (value, cb) => cb(value));
    hb.registerAsyncHelper('explicit', (value, options, cb) => cb(options.hash.prefix + value));
    hb.registerAsyncHelper('block', async options => options.fn({ value: 'body' }));
    assert.equal(await hb._renderFile('/tmp/async-options.hbs',
      '{{native "a" prefix="p"}}|{{promise "b" prefix="q"}}|{{legacy "c"}}|{{explicit "d" prefix="r"}}|{{#block}}{{value}}{{/block}}!',
      {}), 'pa|qb|c|rd|body!');
  });

  it('resolves nested SafeString results without losing escaping', async () => {
    const hb = hbs.create();
    hb.express();
    hb.registerAsyncHelper('outer', async function(options) {
      await Promise.resolve();
      return new hb.SafeString(`<b>${options.fn(this)}</b>`);
    });
    hb.registerAsyncHelper('inner', async () => '<i>value</i>');
    assert.equal(await hb._renderFile('/tmp/async-safe.hbs',
      '{{#outer}}{{inner}}|{{{inner}}}{{/outer}}!', {}),
    '<b>&lt;i&gt;value&lt;/i&gt;|<i>value</i></b>!');
  });

  it('observes helper rejections after a synchronous render failure', async () => {
    const hb = hbs.create();
    hb.express();
    const pending = Promise.withResolvers();
    hb.registerAsyncHelper('later', () => pending.promise);
    hb.registerHelper('fail', () => {
      throw new Error('render failure');
    });
    await assert.rejects(hb._renderFile('/tmp/failed-render.hbs', '{{later}}{{fail}}!', {}), /render failure/);
    pending.reject(new Error('late helper failure'));
    // Give Node's unhandled-rejection tracking a turn before the test finishes.
    await new Promise(resolve => setImmediate(resolve));
  });

  it('should render all async helpers', async () => {
    const app = createAsyncApp(hbs.create(), 'production');
    const results = await requestAll(app, ['jt', 'anna', 'joe', 'jeff', 'jane']);
    assert.equal(results.jt, 'Completed');
    assert.equal(results.anna, 'Completed');
    assert.equal(results.joe, 'Completed');
    assert.equal(results.jeff, 'Completed');
    assert.equal(results.jane, 'Completed');
  });

  it('should render nested async helpers', async () => {
    const app = createAsyncApp(hbs.create(), 'production');
    const results = await makeUserRequest(app, 'jt');
    assert.equal(false, hasResolvers(results));
    assert.equal(-1, results.search('This should not show!'));
  });
});
