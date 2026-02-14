let runtimeTest;

if (typeof Bun !== 'undefined') {
  runtimeTest = await import('bun:test');
} else {
  runtimeTest = await import('node:test');
}

const test = runtimeTest.test ?? runtimeTest.it;
const describe = runtimeTest.describe;
const it = runtimeTest.it ?? runtimeTest.test;
const before = runtimeTest.before ?? runtimeTest.beforeAll;
const beforeEach = runtimeTest.beforeEach;
const after = runtimeTest.after ?? runtimeTest.afterAll;
const afterEach = runtimeTest.afterEach;

export {
  test,
  describe,
  it,
  before,
  beforeEach,
  after,
  afterEach
};
