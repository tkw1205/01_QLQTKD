'use strict';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-that-is-at-least-32-chars-long';

const http = require('http');
const { app, sessionTimeoutService } = require('../src/app');
const { getPool, query } = require('../src/config/database');
const { signToken } = require('../src/config/jwt');

let testServer = null;
let serverUrl = null;

async function startServer() {
  if (testServer) {
    return { server: testServer, url: serverUrl };
  }

  await new Promise((resolve) => {
    testServer = app.listen(0, '127.0.0.1', () => {
      const port = testServer.address().port;
      serverUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  if (typeof testServer.unref === 'function') {
    testServer.unref();
  }

  return { server: testServer, url: serverUrl };
}

async function stopServer() {
  if (sessionTimeoutService && typeof sessionTimeoutService.stop === 'function') {
    sessionTimeoutService.stop();
  }
  if (testServer) {
    if (typeof testServer.closeAllConnections === 'function') {
      testServer.closeAllConnections();
    }
    await new Promise((resolve) => testServer.close(resolve));
    testServer = null;
    serverUrl = null;
  }
}

async function closeDb() {
  const pool = getPool();
  if (pool) {
    await pool.end().catch(() => {});
  }
}

process.on('beforeExit', () => {
  if (sessionTimeoutService && typeof sessionTimeoutService.stop === 'function') {
    sessionTimeoutService.stop();
  }
  if (testServer) {
    try {
      if (typeof testServer.closeAllConnections === 'function') {
        testServer.closeAllConnections();
      }
      testServer.close();
    } catch (_) {}
    testServer = null;
    serverUrl = null;
  }
});

async function apiRequest(endpoint, { method = 'GET', headers = {}, body = null, cookie = null } = {}) {
  const { url } = await startServer();
  const reqHeaders = { Connection: 'close', ...headers };

  if (cookie) {
    reqHeaders['Cookie'] = cookie;
  }

  let reqBody = null;
  if (body !== null && body !== undefined) {
    if (typeof body === 'object') {
      reqHeaders['Content-Type'] = 'application/json';
      reqBody = JSON.stringify(body);
    } else {
      reqBody = body;
    }
  }

  const res = await fetch(`${url}${endpoint}`, {
    method,
    headers: reqHeaders,
    body: reqBody,
  });

  const resHeaders = {};
  for (const [key, value] of res.headers.entries()) {
    resHeaders[key.toLowerCase()] = value;
  }

  const rawText = await res.text();
  let json = null;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    json = null;
  }

  return {
    status: res.status,
    headers: resHeaders,
    rawText,
    body: json,
  };
}

module.exports = {
  startServer,
  stopServer,
  closeDb,
  apiRequest,
  query,
  signToken,
};
