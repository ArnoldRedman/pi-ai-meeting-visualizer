/**
 * AI 会议室可视化：Pi 扩展入口
 *
 * 提供 `/meeting` 命令和 `meeting_visualizer` 工具，四个动作：
 * start 拉起包内自带的本地服务（server/dev-server.mjs）、stop 停掉、status 看会话、open 开浏览器。
 * 会议事件由调用方 POST 到本地服务，这里只负责把可视化跑起来。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

// 扩展固定位于 <包>/extensions/ 下，包根目录就是它的上一级
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.MEETING_PORT || process.env.PORT || 34721);
const BASE_URL = `http://127.0.0.1:${PORT}`;
// 会议室首页需要 Kenney 家具和默认人物，缺了就自动补一次下载（约 7.2 MB，有缓存不再下）
const KENNEY_MARKER = path.join(ROOT, 'assets/cache/kenney/characters/character-female-a.glb');

const ACTIONS = ['start', 'stop', 'status', 'open'] as const;
type Action = (typeof ACTIONS)[number];

let server: ChildProcess | null = null;
// 上次异常退出的原因，status 时回报给用户
let crash = '';

async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

// 等子进程就绪；子进程提前退出就立刻返回，别空等到超时
async function waitReady(timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthy()) return true;
    if (!server) return false;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return false;
}

function stopServer(): boolean {
  if (!server) return false;
  const running = server;
  server = null;
  running.kill();
  return true;
}

async function ensureAssets(): Promise<string> {
  if (existsSync(KENNEY_MARKER)) return '';
  // 直接跑下载脚本，不经过 npm：Windows 上裸 spawn npm.cmd 会 EINVAL，也少一层 PATH 依赖
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/fetch-assets.mjs')], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let tail = '';
    child.stderr?.on('data', data => { tail = (tail + String(data)).slice(-400); });
    child.once('error', error => reject(new Error(`Kenney 资源下载失败：${error.message}`)));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Kenney 资源下载失败（code ${code}）：${tail}`)));
  });
  return '（顺带下载了 Kenney 资源）';
}

function openPage(url: string): void {
  // Windows 的 start 是 cmd 内建命令，macOS / Linux 各有一个打开默认浏览器的可执行文件
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(command, args, { stdio: 'ignore', detached: true }).unref();
}

async function start(): Promise<string> {
  if (await healthy()) return `会议室服务已经在跑：${BASE_URL}`;
  if (server) return `会议室服务正在启动：${BASE_URL}`;
  const note = await ensureAssets();
  crash = '';
  const child = spawn(process.execPath, [path.join(ROOT, 'server/dev-server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server = child;
  // 管道必须及时消费，否则子进程写满缓冲区会卡住；stderr 留一段当作退出原因
  child.stdout?.resume();
  child.stderr?.on('data', data => { crash = String(data).trim().slice(-400); });
  child.once('exit', code => {
    if (server === child) server = null;
    crash = `服务退出（code ${code}）：${crash}`;
  });
  child.once('error', error => {
    if (server === child) server = null;
    crash = `服务启动失败：${error.message}`;
  });
  if (await waitReady()) return `会议室已启动：${BASE_URL}${note}`;
  stopServer();
  throw new Error(`会议室启动失败：${crash || '端口被占用或服务没有响应'}`);
}

async function status(): Promise<string> {
  if (!(await healthy())) return `会议室未启动${crash ? `（上次：${crash}）` : ''}\n启动：/meeting start`;
  const response = await fetch(`${BASE_URL}/api/sessions`, { signal: AbortSignal.timeout(1500) });
  const data = await response.json() as { sessions?: Array<{ id: string; tag?: string; status: string; round: number; eventCount: number }> };
  const sessions = data.sessions ?? [];
  if (sessions.length === 0) return `会议室服务在跑：${BASE_URL}（还没有会议）`;
  const lines = sessions.map(item => `- ${item.id} · ${item.status} · 第 ${item.round} 轮 · ${item.eventCount} 条事件${item.tag ? ` · ${item.tag}` : ''}`);
  return `会议室服务在跑：${BASE_URL}\n${lines.join('\n')}`;
}

async function run(action: Action): Promise<string> {
  if (action === 'status') return status();
  if (action === 'stop') return stopServer() ? '会议室服务已停止' : '会议室服务本来就没在跑';
  if (action === 'open') {
    const note = await start();
    openPage(BASE_URL);
    return `${note}\n已用默认浏览器打开会议列表；等会议开始后页面会自动跳到现场`;
  }
  return `${await start()}\n用 /meeting open 打开页面；会议事件由发起方 POST 进来`;
}

export default function meetingVisualizer(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'meeting_visualizer',
    label: '会议室可视化',
    description: '启动、停止或查看本地 AI 会议室 3D 可视化服务（127.0.0.1），也可以打开浏览器页面',
    parameters: Type.Object({
      action: Type.Union(ACTIONS.map(item => Type.Literal(item)), {
        description: 'start 启动服务；stop 停止；status 查看在跑的会议；open 启动并打开浏览器页面',
      }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: 'text', text: await run(params.action as Action) }],
        details: { action: params.action },
      };
    },
  });

  pi.registerCommand('meeting', {
    description: '会议室可视化：start | stop | status | open（默认 start）',
    getArgumentCompletions: prefix =>
      ACTIONS.filter(item => item.startsWith(prefix.trim())).map(item => ({ value: item, label: item })),
    handler: async (args, ctx) => {
      const action = (ACTIONS as readonly string[]).includes(args.trim()) ? args.trim() as Action : 'start';
      ctx.ui.notify(await run(action), 'info');
    },
  });

  // 会话结束时收工；退出路径可能重合，这里保持幂等
  pi.on('session_shutdown', async () => {
    stopServer();
  });
}
