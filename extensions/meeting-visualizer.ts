/**
 * AI 会议室可视化：Pi 扩展入口
 *
 * 两道口子：
 * 1. `/meeting` 命令与 `meeting_visualizer` 工具（start / stop / status / open），手动把本地服务拉起来；
 * 2. 自动跟随 ai-meeting：认出 `subagent` 在跑它的 meeting.js 就自动建会、逐席发事件，不用手动调。
 * 事件协议见 protocol/meeting-events.md，这里只做适配，不读模型内部调用细节。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

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
// 本次会话是否补过资源下载，只影响提示文案
let fetchedAssets = false;

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
  if (existsSync(KENNEY_MARKER)) return '';  // 直接跑下载脚本，不经过 npm：Windows 上裸 spawn npm.cmd 会 EINVAL，也少一层 PATH 依赖
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
  fetchedAssets = true;
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

// ---- 自动跟随 ai-meeting：把会议进度推给可视化页面 ----

// ai-meeting.json 里的席位形状；name 是用户手写的中文职责名
type SeatArg = { name?: string; provider?: string; model?: string; thinking?: string };
// 一场已经推了 meeting_started 的会议，key 是 subagent 的 toolCallId
// 留着它才能在工具结束时把返回的席位名对回到席位 id（协议要求 id 是 ASCII）
type Meeting = { toolCallId: string; sessionId: string; ids: Map<string, string>; asyncDir?: string };

type SeatEventRow = { seat?: string; ok?: boolean; stance?: string | null; text?: string; stanceRound?: number };
type MeetingReturn = { tag?: string; rounds?: number; perSeat?: SeatEventRow[]; round1?: SeatEventRow[]; round2?: SeatEventRow[] };

const meetings = new Map<string, Meeting>();

const cut = (value: unknown, max: number): string => {
  const text = String(value ?? '').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
};

// 席位 id 必须是 1–64 位 ASCII 字母数字/_/-（协议约束），中文席位名换成 seat1、seat2
function seatIdFor(name: string, index: number, used: Set<string>): string {
  const base = name.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 60) || `seat${index + 1}`;
  let id = base;
  for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

function sessionIdFor(tag: string): string {
  const slug = tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${slug || 'ai-meeting'}-${Math.random().toString(16).slice(2, 8)}`;
}

// 只认 ai-meeting 的会议脚本：workflow 指向 meeting.js 并带了席位表
function meetingCall(toolName: string, args: any): { tag: string; seats: SeatArg[] } | null {
  if (toolName !== 'subagent' || typeof args?.workflow !== 'string' || !/meeting\.js$/.test(args.workflow)) return null;
  const seats = args?.args?.seats;
  if (!Array.isArray(seats) || seats.length === 0) return null;
  return { tag: typeof args.args.tag === 'string' ? args.args.tag.trim() : '', seats: seats as SeatArg[] };
}

async function postEvent(sessionId: string, event: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`${response.status} ${cut(await response.text(), 200)}`);
}

// 通知、工具返回值里都是 “Return: { ... }” 这种文本，尾部的 Mission/截断标记不在 JSON 里
function returnValue(text: string): MeetingReturn | null {
  const marker = text.indexOf('Return:');
  if (marker < 0) return null;
  const start = text.indexOf('{', marker);
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as MeetingReturn;
  } catch {
    return null;
  }
}

// subagent 的返回值里既有结构化快照（details.workflow.value），也有文本形式的 Return: 段，两个都试
function meetingReturn(result: any): MeetingReturn | null {
  const value = result?.details?.workflow?.value;
  if (value && typeof value === 'object') return value as MeetingReturn;
  const text = Array.isArray(result?.content) ? result.content.map((part: any) => part?.text ?? '').join('') : '';
  return returnValue(text);
}

function messageText(message: any): string {
  if (typeof message?.content === 'string') return message.content;
  return Array.isArray(message?.content) ? message.content.map((part: any) => part?.text ?? '').join('') : '';
}

// 从会议表里取走一场会议；两个触发口（完成通知、定时查看）都可能撞上，先删再干活就能幂等
function takeMeeting(toolCallId: string): Meeting | null {
  const meeting = meetings.get(toolCallId) ?? null;
  if (meeting) meetings.delete(toolCallId);
  return meeting;
}

async function openMeeting(toolCallId: string, call: { tag: string; seats: SeatArg[] }, ctx: ExtensionContext): Promise<void> {
  await start();
  const sessionId = sessionIdFor(call.tag);
  const used = new Set<string>();
  const ids = new Map<string, string>();
  const seats = call.seats.slice(0, 16).map((seat, index) => {
    const name = cut(seat.name || `席位 ${index + 1}`, 80) || `席位 ${index + 1}`;
    const id = seatIdFor(name, index, used);
    ids.set(name, id);
    return { id, label: name, model: cut(`${seat.provider ?? ''}/${seat.model ?? ''}:${seat.thinking ?? ''}`, 80) };
  });
  await postEvent(sessionId, { type: 'meeting_started', sessionId, tag: cut(call.tag || '多模型会议', 200), seats });
  await postEvent(sessionId, { type: 'round_started', sessionId, round: 1 });
  // runs.all 会让所有席位同时开跑，所以一次全部置为工作中
  for (const seat of seats) await postEvent(sessionId, { type: 'seat_started', sessionId, seat: seat.id, round: 1 });
  meetings.set(toolCallId, { toolCallId, sessionId, ids });
  ctx.ui.notify(`会议室已就绪：${BASE_URL}/meeting/${sessionId}（${seats.length} 席）${fetchedAssets ? '，首次已自动下载资源' : ''}`, 'info');
}

// 一轮结束时把逐席结论补上；交叉质询的改判用 stance_changed 表示（那一轮的数据是跟本轮一起到的，
// 重建一个第二轮只会让画面在最后一秒闪两下，也误导真实节奏）
async function closeMeeting(meeting: Meeting, data: MeetingReturn | null, isError: boolean, errorText: string): Promise<void> {
  const { sessionId, ids } = meeting;
  if (isError || !data?.perSeat) {
    await postEvent(sessionId, { type: 'meeting_failed', sessionId, message: cut(errorText || '会议脚本异常结束', 2000) });
    return;
  }
  const rows = data.perSeat;
  const revised = new Set<number>();
  let failed = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const id = ids.get(String(row.seat ?? '')) ?? [...ids.values()][index];
    if (!id) continue;
    const first = data.round1?.[index];
    // 第一轮的正文配 round 1；改判过的立场用后面的 stance_changed 单独发
    const message = cut(first?.stance || first?.text || row.stance || (row.ok === false ? '本轮没有给出结论' : '本轮完成'), 2000);
    if (row.ok === false) failed += 1;
    await postEvent(sessionId, { type: 'seat_finished', sessionId, seat: id, round: 1, status: row.ok === false ? 'error' : 'ok', message });
    if (row.stanceRound === 2) revised.add(index);
  }
  for (const index of revised) {
    const id = [...ids.values()][index];
    const stance = cut(data.round2?.[index]?.stance, 200);
    if (id && stance) await postEvent(sessionId, { type: 'stance_changed', sessionId, seat: id, stance });
  }
  const parts = [`${rows.length} 席参与第一轮`];
  if (failed > 0) parts.push(`${failed} 席失败`);
  if (revised.size > 0) parts.push(`${revised.size} 席交叉质询后改判`);
  parts.push('各席位结论见席位档案');
  await postEvent(sessionId, { type: 'meeting_finished', sessionId, summary: cut(`${data.tag || '会议'}：${parts.join('，')}`, 2000) });
}

// 自动跟随失败的唯一后果是看不到画面，绝不能影响会议本身
async function guard(what: string, run: () => Promise<void>, ctx: ExtensionContext): Promise<void> {
  try {
    await run();
  } catch (error) {
    ctx.ui.notify(`会议室${what}失败：${error instanceof Error ? error.message : String(error)}`, 'warning');
  }
}

// 异步会议先只给执据，返回值要等跑完才落盘。两个触发口：
// 1. 完成通知（role: custom，带 asyncDir 和返回值，内容长时会被截断）—— 来得快，是主路
// 2. 每 30 秒看一眼 asyncDir/status.json —— 通知漏了就靠它兜底
const RUNNING_STATES = new Set(['queued', 'running', 'paused', 'stopping']);

function readStatus(asyncDir: string): any {
  try {
    return JSON.parse(readFileSync(path.join(asyncDir, 'status.json'), 'utf8'));
  } catch {
    // 刚启动时 status.json 可能还没落盘；被清理掉了则会一直读不到
    return null;
  }
}

// 通知里带的那份返回值可能被截断，所以优先读 status.json：那里存着完整的 workflow.value
async function finishAsync(meeting: Meeting, notice: string, ctx: ExtensionContext): Promise<void> {
  const status = meeting.asyncDir ? readStatus(meeting.asyncDir) : null;
  const inline = returnValue(notice);
  if (status && RUNNING_STATES.has(String(status.state))) return;
  // 两边都没东西（文件还没写、通知也没带返回值）就什么都不做，留给兜底轮询
  if (!status && !inline?.perSeat) return;
  const data = status?.workflow?.value ?? inline;
  const reason = String(status?.failureKind || status?.error || status?.stopCause || '');
  const ok = status ? status.state === 'complete' : Boolean(data?.perSeat);
  if (!(await healthy())) return;
  await guard('收尾', () => closeMeeting(meeting, data, !ok, reason), ctx);
}

async function watchAsyncRun(meeting: Meeting, asyncDir: string, ctx: ExtensionContext): Promise<void> {
  const deadline = Date.now() + 2 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 30_000));
    // 已经被完成通知收过尾就不管了
    if (!meetings.has(meeting.toolCallId)) return;
    const status = readStatus(asyncDir);
    if (!status || RUNNING_STATES.has(String(status.state))) continue;
    const taken = takeMeeting(meeting.toolCallId);
    if (!taken) return;
    await finishAsync(taken, '', ctx);
    return;
  }
  const taken = takeMeeting(meeting.toolCallId);
  if (taken) await guard('收尾', () => closeMeeting(taken, null, true, '等了两小时还没等到会议结果'), ctx);
}

export default function meetingVisualizer(pi: ExtensionAPI) {
  pi.on('tool_execution_start', async (event, ctx) => {
    const call = meetingCall(event.toolName, event.args);
    if (!call || meetings.has(event.toolCallId)) return;
    await guard('启动', () => openMeeting(event.toolCallId, call, ctx), ctx);
  });

  pi.on('tool_execution_end', async (event, ctx) => {
    const meeting = meetings.get(event.toolCallId);
    if (!meeting) return;
    const text = Array.isArray(event.result?.content)
      ? event.result.content.map((part: any) => part?.text ?? '').join('\n')
      : '';
    const data = meetingReturn(event.result);
    // ai-meeting 默认 async：这里先拿到的只是执据，返回值要等异步跑完
    const asyncDir = event.result?.details?.asyncDir;
    if (!data?.perSeat && !event.isError && typeof asyncDir === 'string' && asyncDir !== '') {
      meeting.asyncDir = asyncDir;
      void watchAsyncRun(meeting, asyncDir, ctx);
      return;
    }
    meetings.delete(event.toolCallId);
    await guard('收尾', () => closeMeeting(meeting, data, event.isError, text), ctx);
  });

  // 异步会议跑完会把结果作为一条 custom 消息送回来，这里是最快的收尾时机
  pi.on('message_start', async (event, ctx) => {
    const text = messageText(event.message);
    if (!text.includes('Background task completed') || !text.includes('Return:')) return;
    for (const meeting of [...meetings.values()]) {
      if (!meeting.asyncDir || !text.includes(meeting.asyncDir)) continue;
      const taken = takeMeeting(meeting.toolCallId);
      if (taken) await guard('收尾', () => finishAsync(taken, text, ctx), ctx);
    }
  });

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
