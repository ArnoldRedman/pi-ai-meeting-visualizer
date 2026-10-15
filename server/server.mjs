import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createSessionStore, HttpError } from './session-store.mjs';
import { demoEvents } from './demo.mjs';
import { sceneFiles, importMap, importMapPolicy } from './scene-files.mjs';

const WEB_ROOT = new URL('../web/', import.meta.url);
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/state.mjs', ['state.mjs', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ...sceneFiles,
]);
const SESSION_ROUTE = /^\/api\/sessions\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})(\/events)?$/;
const PAGE_ROUTE = /^\/meeting\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, '请使用 application/json 请求体');
  }
  const chunks = [];
  let size = 0;
  // 超限时拒绝请求，不将任意大小的本地输入全部缓冲进内存
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 16 * 1024) throw new HttpError(413, '请求体不能超过 16 KiB');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '请求体不是有效 JSON');
  }
}

export function createMeetingServer({ demoInterval = 700 } = {}) {
  const store = createSessionStore();
  const timers = new Set();
  const server = http.createServer({ requestTimeout: 10000, headersTimeout: 10000 }, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    // connect-src 放行 blob: 是给自制角色用的：GLB 内嵌贴图由 GLTFLoader 转成 blob URL 再 fetch，拦掉就只剩白模
    response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' ${importMapPolicy}; style-src 'self'; connect-src 'self' blob:; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
    try {
      const authority = `127.0.0.1:${server.address().port}`;
      const origin = `http://${authority}`;
      // 回环监听不等于跨站安全：同时阻止 DNS rebinding 和浏览器跨源请求
      if (request.headers.host !== authority ||
          (request.headers.origin && request.headers.origin !== origin) ||
          (request.headers['sec-fetch-site'] === 'cross-site' && request.headers['sec-fetch-mode'] !== 'navigate')) {
        throw new HttpError(403, '仅允许通过当前 127.0.0.1 地址同源访问');
      }
      const url = new URL(request.url, origin);
      if (url.origin !== origin) throw new HttpError(403, '不允许跨源请求');
      const { pathname } = url;
      const match = SESSION_ROUTE.exec(pathname);
      const known = pathname === '/api/demo' || match || STATIC_FILES.has(pathname) || pathname === '/health' || pathname === '/api/sessions' || PAGE_ROUTE.test(pathname);
      if (known) {
        const methods = pathname === '/api/demo' ? ['POST'] : match?.[2] ? ['GET', 'POST'] : ['GET'];
        if (!methods.includes(request.method)) {
          response.setHeader('Allow', methods.join(', '));
          throw new HttpError(405, '该接口不支持此 HTTP 方法');
        }
      }
      if (request.method === 'GET') {
        if (pathname === '/health') return json(response, 200, { status: 'ok', sessions: store.list().length });
        if (pathname === '/api/sessions') return json(response, 200, { sessions: store.list() });
        if (match) {
          if (!match[2]) return json(response, 200, store.describe(match[1]));
          const cursor = url.searchParams.get('after') ?? '0';
          if (!/^\d+$/.test(cursor)) throw new HttpError(400, 'after 必须为非负整数');
          return json(response, 200, store.events(match[1], Number(cursor)));
        }
        const file = PAGE_ROUTE.test(pathname) ? STATIC_FILES.get('/') : STATIC_FILES.get(pathname);
        if (file) {
          let content;
          try {
            content = await readFile(new URL(file[0], WEB_ROOT));
          } catch (error) {
            if (error.code === 'ENOENT' && sceneFiles.has(pathname)) {
              throw new HttpError(404, '3D 文件尚未安装，请先运行 npm install 和 npm run assets:fetch');
            }
            throw error;
          }
          if (file[0] === 'index.html') {
            // 首页与会议页共用同一份 HTML，只有会议页把文字信息收进抽屉
            const page = PAGE_ROUTE.test(pathname) ? 'meeting' : 'index';
            content = content.toString('utf8')
              .replace('<!-- SCENE_IMPORT_MAP -->', `<script type="importmap">${importMap}</script>`)
              .replace('data-page="index"', `data-page="${page}"`);
          }
          response.writeHead(200, { 'Content-Type': file[1] });
          return response.end(content);
        }
      } else if (request.method === 'POST' && (pathname === '/api/demo' || match?.[2])) {
        const body = await readJson(request);
        if (pathname === '/api/demo') {
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
            throw new HttpError(400, '模拟会议请求体必须为 {}');
          }
          const sessionId = `demo-${randomUUID()}`;
          const events = demoEvents(sessionId);
          store.append(sessionId, events[0]);
          let index = 1;
          const timer = setInterval(() => {
            try {
              store.append(sessionId, events[index++]);
            } catch (error) {
              console.error(`模拟会议 ${sessionId} 已停止：${error.message}`);
              clearInterval(timer);
              timers.delete(timer);
              return;
            }
            if (index === events.length) {
              clearInterval(timer);
              timers.delete(timer);
            }
          }, demoInterval);
          timers.add(timer);
          return json(response, 201, { sessionId, url: `/meeting/${sessionId}` });
        }
        return json(response, 201, { event: store.append(match[1], body) });
      }
      throw new HttpError(404, '接口或页面不存在');
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('本地服务处理请求失败：', error);
      if (!request.complete) {
        response.setHeader('Connection', 'close');
        request.resume();
      }
      if (!response.destroyed) json(response, error instanceof HttpError ? error.status : 500, {
        error: error instanceof HttpError ? error.message : '本地服务内部错误，请查看终端日志',
      });
    }
  });
  server.once('close', () => {
    for (const timer of timers) clearInterval(timer);
    timers.clear();
  });
  return server;
}
