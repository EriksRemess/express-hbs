import http from 'node:http';
import { PassThrough } from 'node:stream';

function normalizeHeaders(headers) {
  const normalized = {};

  for (const [key, value] of Object.entries(headers ?? {})) {
    normalized[key.toLowerCase()] = value;
  }

  return normalized;
}

function requestInProcess(app, path, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = new PassThrough();
    const req = new http.IncomingMessage(socket);
    req.method = options.method || 'GET';
    req.url = path;
    req.headers = normalizeHeaders(options.headers);

    const res = new http.ServerResponse(req);
    const chunks = [];

    const finish = (err, result) => {
      if (settled) {
        return;
      }
      settled = true;
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    };

    const pushChunk = (chunk, encoding) => {
      if (!chunk) {
        return;
      }

      chunks.push(Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
    };

    res.write = function(chunk, encoding, callback) {
      pushChunk(chunk, encoding);
      if (typeof encoding === 'function') {
        encoding();
      } else if (typeof callback === 'function') {
        callback();
      }
      return true;
    };

    res.end = function(chunk, encoding, callback) {
      pushChunk(chunk, encoding);
      if (typeof encoding === 'function') {
        encoding();
      } else if (typeof callback === 'function') {
        callback();
      }

      finish(null, {
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        text: Buffer.concat(chunks).toString('utf8')
      });
      return res;
    };

    if (options.body) {
      req.push(options.body);
    }
    req.push(null);

    app.handle(req, res, (err) => {
      finish(err || new Error('Request ended without a response'));
    });
  });
}

function listen(server) {
  const listenOnce = (port, host) => new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    if (typeof host === 'string') {
      server.listen(port, host);
      return;
    }
    server.listen(port);
  });

  return (async () => {
    try {
      await listenOnce(0, '127.0.0.1');
    } catch (err) {
      if (err && (err.code === 'EADDRINUSE' || err.code === 'EPERM' || err.code === 'EACCES')) {
        await listenOnce(0);
        return;
      }
      throw err;
    }
  })();
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function requestWithFetch(app, path, options = {}) {
  const server = http.createServer(app);
  await listen(server);

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body
    });
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text: await response.text()
    };
  } finally {
    await close(server);
  }
}

async function request(app, path, options) {
  try {
    return await requestWithFetch(app, path, options);
  } catch (err) {
    // Some runtimes/environments disallow localhost sockets for tests.
    if (err && (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EADDRINUSE')) {
      return requestInProcess(app, path, options);
    }
    throw err;
  }
}

export { request };
