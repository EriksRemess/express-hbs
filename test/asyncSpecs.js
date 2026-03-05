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
