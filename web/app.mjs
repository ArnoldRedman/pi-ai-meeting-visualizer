import { initialMeeting, reduceMeeting, recordSeatEvent } from './state.mjs';
import { previewSeats } from './scene-layout.mjs';

const $ = id => document.getElementById(id);
const sessionId = /^\/meeting\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})$/.exec(location.pathname)?.[1];
const phases = { waiting: '等待会议', running: '进行中', finished: '已结束', failed: '异常结束' };
const seatPhases = { waiting: '等待', working: '工作中', done: '已完成', failed: '失败', stopped: '已停止' };
let state = initialMeeting();
let cursor = 0;
let sessionListKey = '';
let meetingScene = null;
let sceneRequest = 0;
let focusedSeat = null;
// 每个席位的公开事件时间线：聚焦面板的“思考过程”只从这里读
const seatLog = new Map();

function showSceneError(message) {
  meetingScene?.dispose();
  meetingScene = null;
  $('scene-container').dataset.state = 'failed';
  $('scene-message').textContent = message;
  $('scene-message').hidden = false;
  $('scene-view').hidden = true;
  $('scene-reset').hidden = true;
  $('focus-card').hidden = true;
  document.body.dataset.scene = 'failed';
}

async function loadScene() {
  const request = ++sceneRequest;
  try {
    const { createMeetingScene } = await import('./scene.mjs');
    const loaded = await createMeetingScene(
      $('scene-canvas'),
      { view: $('scene-view'), reset: $('scene-reset') },
      showSceneError,
      seatId => { focusedSeat = seatId; renderFocus(); },
    );
    if (request !== sceneRequest) { loaded.dispose(); return; }
    meetingScene = loaded;
    // 模型可能比事件加载得慢，使用此刻最新状态而不是初始化时的快照
    meetingScene.update(state);
    $('scene-container').dataset.state = 'ready';
    $('scene-message').hidden = true;
    $('scene-view').hidden = false;
    $('scene-reset').hidden = false;
    document.body.dataset.scene = 'ready';
  } catch (error) {
    if (request !== sceneRequest) return;
    console.error('3D 场景加载失败：', error);
    showSceneError(error.message.includes('3D') ? error.message : '3D 模块加载失败，请确认已运行 npm install；下方文字状态仍可使用');
  }
}

window.addEventListener('pagehide', () => {
  sceneRequest += 1;
  meetingScene?.dispose();
  meetingScene = null;
});
window.addEventListener('pageshow', event => {
  if (event.persisted) loadScene();
});

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(5000) });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function connection(message, error = false) {
  $('connection').textContent = message;
  $('connection').dataset.error = String(error);
}

function renderMeeting() {
  if (meetingScene) {
    try { meetingScene.update(state); }
    catch { showSceneError('3D 状态更新失败，请刷新恢复；下方文字状态仍可使用'); }
  }
  document.title = `${state.tag} · AI 会议室`;
  $('meeting-title').textContent = state.tag;
  $('meeting-caption').textContent = `SESSION / ${sessionId}`;
  $('phase').textContent = phases[state.status];
  $('phase').dataset.status = state.status;
  $('room').dataset.status = state.status;
  $('seat-count').textContent = `${state.seats.length} 个席位`;
  $('table-round').textContent = state.status === 'running'
    ? (state.round ? `第 ${state.round} 轮` : '席位已入座') : phases[state.status];
  const done = state.seats.filter(seat => ['done', 'failed', 'stopped'].includes(seat.status)).length;
  $('table-detail').textContent = state.status === 'running'
    ? `${done} / ${state.seats.length} 个席位完成本轮工作` : '讨论已收尾 · 最终状态保留';
  $('seats-top').replaceChildren();
  $('seats-bottom').replaceChildren();
  state.seats.forEach((seat, index) => {
    const card = $('seat-template').content.firstElementChild.cloneNode(true);
    card.dataset.seat = seat.id;
    card.dataset.status = seat.status;
    card.querySelector('h3').textContent = seat.model || seat.label;
    card.querySelector('.seat-status').textContent = seatPhases[seat.status];
    card.querySelector('.seat-message').textContent = seat.message;
    card.querySelector('.seat-stance').textContent = seat.stance || '尚未表态';
    $(index < Math.ceil(state.seats.length / 2) ? 'seats-top' : 'seats-bottom').append(card);
  });
  const ended = ['finished', 'failed'].includes(state.status);
  $('conclusion').hidden = !ended;
  $('conclusion').dataset.status = state.status;
  if (ended) {
    $('conclusion-heading').textContent = state.status === 'failed' ? '会议异常结束' : state.winner || '会议完成';
    $('conclusion-text').textContent = state.status === 'failed' ? state.error : state.summary;
  }
  renderFocus();
}

// 聚焦面板：模型名、职责、公开立场、逐条思考过程和本轮结论
function renderFocus() {
  const seats = state.seats.length ? state.seats : previewSeats;
  const seat = focusedSeat ? seats.find(item => item.id === focusedSeat) : null;
  $('focus-card').hidden = !seat;
  if (!seat) {
    for (const bubble of document.querySelectorAll('.character-bubble.focused')) bubble.classList.remove('focused');
    return;
  }
  $('focus-name').textContent = seat.model || seat.label;
  const meta = $('focus-meta');
  meta.textContent = `${seat.label} · ${seatPhases[seat.status ?? 'waiting']}`;
  meta.dataset.status = seat.status ?? 'waiting';
  $('focus-stance').textContent = `公开立场：${seat.stance || '尚未表态'}`;
  const steps = $('focus-steps');
  const following = steps.scrollHeight - steps.scrollTop - steps.clientHeight < 30;
  steps.replaceChildren();
  let round;
  for (const entry of seatLog.get(seat.id) ?? []) {
    const item = document.createElement('li');
    if (entry.round !== round) {
      round = entry.round;
      const label = document.createElement('span');
      label.className = 'focus-round';
      label.textContent = entry.round ? `第 ${entry.round} 轮` : '会议';
      item.append(label);
    }
    if (entry.stance) item.dataset.kind = 'stance';
    const text = document.createElement('p');
    // 事件文本只进 textContent，公开摘要不能作为 HTML 执行
    text.textContent = entry.text;
    item.append(text);
    steps.append(item);
  }
  if (!steps.children.length) {
    const empty = document.createElement('li');
    empty.textContent = '这个席位还没有公开进度事件';
    steps.append(empty);
  }
  if (following) steps.scrollTop = steps.scrollHeight;
  // 席位自己的输出放在时间轴上方：本轮结束是他的结论，进行中是最近一条进度
  const output = seat.status === 'done' ? `本轮结论：${seat.message}`
    : seat.status === 'failed' ? `本轮失败：${seat.message}`
      : seat.status === 'stopped' ? '会议已结束，该席位停止工作'
        : seat.message ? `最新输出：${seat.message}` : '';
  const block = $('focus-output');
  block.textContent = output;
  block.dataset.status = seat.status ?? 'waiting';
  block.hidden = !output;
  for (const bubble of document.querySelectorAll('.character-bubble')) {
    bubble.classList.toggle('focused', bubble.dataset.seat === seat.id);
  }
}

function describeEvent(event) {
  const seat = state.seats.find(seat => seat.id === event.seat);
  const name = seat?.model || seat?.label || event.seat;
  switch (event.type) {
    case 'meeting_started': return `会议开始 · ${event.seats.length} 个席位入座`;
    case 'round_started': return `第 ${event.round} 轮开始`;
    case 'seat_started': return `${name} 开始工作`;
    case 'seat_progress': return `${name}：${event.message}`;
    case 'seat_finished': return `${name} ${event.status === 'ok' ? '完成本轮工作' : '本轮工作失败'}`;
    case 'stance_changed': return `${name} 更新立场：${event.stance}`;
    case 'meeting_finished': return `会议结束 · ${event.winner || '结论已生成'}`;
    case 'meeting_failed': return `会议异常结束：${event.message}`;
    default: return event.type;
  }
}

function appendLog(events) {
  const log = $('event-log');
  const following = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  for (const event of events) {
    const item = document.createElement('li');
    item.dataset.seq = event.seq;
    const time = document.createElement('time');
    time.dateTime = event.at;
    time.textContent = `${String(event.seq).padStart(2, '0')} / ${new Date(event.at).toLocaleTimeString('zh-CN', { hour12: false })}`;
    const message = document.createElement('p');
    // 事件文本只进入 textContent，外部公开摘要不能作为 HTML 执行
    message.textContent = describeEvent(event);
    item.append(time, message);
    log.append(item);
    if (log.children.length > 80) log.firstElementChild.remove();
  }
  $('event-count').textContent = String(cursor).padStart(2, '0');
  $('empty-events').hidden = cursor > 0;
  if (following) log.scrollTop = log.scrollHeight;
}

async function pollEvents() {
  let delay = 700;
  try {
    const data = await api(`/api/sessions/${sessionId}/events?after=${cursor}`);
    for (const event of data.events) {
      state = reduceMeeting(state, event);
      recordSeatEvent(seatLog, event);
    }
    cursor = data.nextCursor;
    if (data.events.length) {
      renderMeeting();
      appendLog(data.events);
    }
    connection(`已连接 · ${cursor} 条事件${state.status === 'running' ? ' · 每 0.7 秒同步' : ' · 会议事件已收齐'}`);
    if (['finished', 'failed'].includes(state.status)) return;
  } catch (error) {
    connection(`${error.status ? error.message : '连接中断，请确认本地服务仍在运行'}；正在重试，当前画面保留`, true);
    if (error.status === 409) {
      cursor = 0;
      state = initialMeeting();
      $('event-log').replaceChildren();
    }
    delay = 1500;
  }
  // shortcut: 第一版使用增量轮询，接入高频真实事件时再换 SSE
  setTimeout(pollEvents, delay);
}

async function loadSessions() {
  try {
    const { sessions } = await api('/api/sessions');
    const key = JSON.stringify(sessions.map(({ id, tag, status }) => ({ id, tag, status })));
    // 列表没变时不替换 DOM，避免轮询每三秒打断键盘焦点
    if (key !== sessionListKey) {
      renderSessions(sessions);
      sessionListKey = key;
    }
    $('session-message').hidden = sessions.length > 0;
    $('session-message').textContent = '还没有会议。开始一场模拟，观察席位如何工作、表态和完成。';
    if (!sessionId) connection('本地服务已连接 · 模拟会议不调用任何模型');
  } catch {
    $('session-message').hidden = false;
    $('session-message').textContent = '无法读取会议列表，请确认本地服务仍在运行';
    if (!sessionId) connection('本地服务连接中断，正在重试', true);
  }
  setTimeout(loadSessions, 3000);
}

function renderSessions(sessions) {
  const items = sessions.slice().reverse().map(session => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `/meeting/${session.id}`;
    if (session.id === sessionId) link.setAttribute('aria-current', 'page');
    const name = document.createElement('span');
    name.textContent = session.tag;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.status = session.status;
    badge.textContent = phases[session.status];
    link.append(name, badge);
    item.append(link);
    return item;
  });
  $('session-list').replaceChildren(...items);
}

$('start-demo').addEventListener('click', async () => {
  $('start-demo').disabled = true;
  $('action-error').hidden = true;
  try {
    const result = await api('/api/demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    location.assign(result.url);
  } catch (error) {
    $('action-error').textContent = error.status ? error.message
      : '创建结果未确认，请先检查下方会议列表，避免重复创建';
    $('action-error').hidden = false;
    $('start-demo').disabled = false;
  }
});

// 会议页把标题、结论、席位和事件收进右侧抽屉，让 3D 场景独占视口；首页保持原布局
function setupMeetingDrawer() {
  if (!sessionId) return;
  document.querySelector('.scene-toolbar').prepend($('phase'));
  $('event-heading').textContent = '会议详情';
  const drawer = $('event-panel');
  const anchor = drawer.querySelector('.event-note');
  for (const node of [$('meeting-title'), $('meeting-caption'), $('conclusion'), $('room'), $('room-footer')]) {
    drawer.insertBefore(node, anchor);
  }
  $('drawer-toggle').addEventListener('click', () => {
    const open = drawer.dataset.open !== 'true';
    drawer.dataset.open = String(open);
    $('drawer-toggle').setAttribute('aria-expanded', String(open));
  });
}

function setupSeatFocus() {
  $('focus-close').addEventListener('click', () => meetingScene?.focus(null));
  // 面板是场景里的浮层：拖动和滚轮都不应该带动镜头，否则滚思维过程列表会顺手缩放房间
  $('focus-card').addEventListener('pointerdown', event => event.stopPropagation());
  $('focus-card').addEventListener('wheel', event => event.stopPropagation());
  // 席位列表比人物好点得多，两处入口都聚焦同一个人
  $('room').addEventListener('click', event => {
    const card = event.target.closest('.seat');
    if (card) meetingScene?.focus(card.dataset.seat);
  });
  document.addEventListener('keydown', event => {
    if (event.target.closest('input, textarea, [contenteditable]')) return;
    if (event.key === 'Escape') meetingScene?.focus(null);
    else if (event.key === 'r' || event.key === 'R') $('scene-reset').click();
  });
}

setupMeetingDrawer();
setupSeatFocus();
loadSessions();
loadScene();
if (sessionId) pollEvents();
