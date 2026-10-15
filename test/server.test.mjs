import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { createMeetingServer } from '../server/server.mjs';
import { sceneFiles } from '../server/scene-files.mjs';
import { demoEvents } from '../server/demo.mjs';

let server;
let base;
before(async () => {
  server = createMeetingServer({ demoInterval: 2 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  const closed = once(server, 'close');
  server.close();
  server.closeAllConnections();
  await closed;
});
const post = (path, body, headers = {}) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

// 使用原始 HTTP 覆盖 Host、分块请求和没有浏览器保护的本地客户端
function rawRequest(path, headers, chunks = [], method = 'POST') {
  return new Promise((resolve, reject) => {
    const request = http.request(`${base}${path}`, { method, headers }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

test('只绑定 IPv4 回环地址，health 和静态页面正常', async () => {
  assert.equal(server.address().address, '127.0.0.1');
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  for (const path of ['/', '/meeting/sample', '/styles.css', '/app.mjs', '/state.mjs']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok((await response.text()).length > 0);
  }
  for (const path of ['/package.json', '/server/server.mjs', '/api/sessions/missing/events', '/api/sessions/a/stream']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(`${base}/api/demo`)).status, 405);
  assert.equal((await post('/health', {})).status, 405);
});

test('首页与会议页共用同一份 HTML，只有会议页标记为双生视图', async () => {
  assert.match(await (await fetch(`${base}/`)).text(), /data-page="index"/);
  assert.match(await (await fetch(`${base}/meeting/sample`)).text(), /data-page="meeting"/);
});

test('3D import map 与模块可本地加载，不泄露压缩包和依赖目录', async () => {
  const page = await fetch(`${base}/`);
  const html = await page.text();
  const map = /<script type="importmap">([^<]+)<\/script>/.exec(html)?.[1];
  assert.ok(map);
  const hash = createHash('sha256').update(map).digest('base64');
  assert.ok(page.headers.get('content-security-policy').includes(`'sha256-${hash}'`));
  assert.equal(page.headers.get('content-security-policy').includes('unsafe-inline'), false);
  for (const [path, [, type]] of sceneFiles) {
    if (!type.startsWith('text/javascript')) continue;
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /javascript/);
  }
  for (const path of ['/assets/cache/kenney/mini-characters.zip', '/node_modules/three/package.json', '/assets/kenney/unknown.glb']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});

test('HTTP 写入、增量读取、未知事件拒绝与 session 隔离', async () => {
  const events = demoEvents('http');
  for (const event of events) {
    const response = await post('/api/sessions/http/events', event);
    assert.equal(response.status, 201);
    const { event: stored } = await response.json();
    assert.equal(stored.type, event.type);
    assert.ok(stored.at);
  }
  const result = await (await fetch(`${base}/api/sessions/http/events?after=2`)).json();
  assert.equal(result.events.length, events.length - 2);
  assert.equal(result.nextCursor, events.length);
  assert.equal(result.status, 'finished');
  const metadata = await (await fetch(`${base}/api/sessions/http`)).json();
  assert.equal(metadata.round, 2);
  assert.equal((await post('/api/sessions/http/events', events.at(-1))).status, 409);
  assert.equal((await post('/api/sessions/wrong/events', events[0])).status, 400);
  assert.equal((await post('/api/sessions/bad/events', { type: 'nope', sessionId: 'bad' })).status, 400);
  for (const after of ['-1', 'nope', '1.2', '9007199254740992']) {
    assert.equal((await fetch(`${base}/api/sessions/http/events?after=${after}`)).status, 400);
  }
  assert.equal((await fetch(`${base}/api/sessions/http/events?after=999`)).status, 409);
  assert.equal((await fetch(`${base}/api/sessions/bad`)).status, 404);
  const listed = await (await fetch(`${base}/api/sessions`)).json();
  assert.equal(listed.sessions.find(session => session.id === 'http').eventCount, events.length);
});

test('两个模拟会议并行收尾，完成后事件仍可读取', async () => {
  const first = await (await post('/api/demo', {})).json();
  const second = await (await post('/api/demo', {})).json();
  assert.notEqual(first.sessionId, second.sessionId);
  assert.equal(first.url, `/meeting/${first.sessionId}`);
  for (const demo of [first, second]) {
    let result;
    for (let attempt = 0; attempt < 100; attempt++) {
      result = await (await fetch(`${base}/api/sessions/${demo.sessionId}/events`)).json();
      if (result.status === 'finished') break;
      await setTimeout(10);
    }
    assert.equal(result.status, 'finished');
    assert.equal(result.events[0].type, 'meeting_started');
    assert.equal(result.events.at(-1).type, 'meeting_finished');
    assert.equal(result.events.every(event => event.sessionId === demo.sessionId), true);
    assert.deepEqual(await (await fetch(`${base}/api/sessions/${demo.sessionId}/events`)).json(), result);
  }
});

test('拒绝跨站请求、DNS rebinding、非 JSON、超大和畸形请求', async () => {
  assert.equal((await post('/api/demo', {}, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await post('/api/demo', {}, { Origin: 'null' })).status, 403);
  assert.equal((await post('/api/demo', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await rawRequest('/health', { Host: 'untrusted.example' }, [], 'GET')).status, 403);
  assert.equal((await post('/api/demo', {}, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await rawRequest('/api/demo', { 'Content-Type': 'application/json' }, ['{'])).status, 400);
  assert.equal((await rawRequest('/api/demo', { 'Content-Type': 'application/json' }, [])).status, 400);
  for (const input of [null, [], { arbitrary: true }]) assert.equal((await post('/api/demo', input)).status, 400);
  assert.equal((await post('/api/demo', { huge: 'x'.repeat(17 * 1024) })).status, 413);
  assert.equal((await rawRequest('/api/demo', { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    ['"', 'x'.repeat(17 * 1024), '"'])).status, 413);
  assert.equal((await fetch(`${base}/health`)).status, 200);
});
