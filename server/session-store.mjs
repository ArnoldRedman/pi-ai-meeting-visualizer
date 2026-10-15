import { initialMeeting, reduceMeeting } from '../web/state.mjs';

export const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const TYPES = new Set([
  'meeting_started', 'round_started', 'seat_started', 'seat_progress',
  'seat_finished', 'stance_changed', 'meeting_finished', 'meeting_failed',
]);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireValue(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}

function text(value, name, max = 2000) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    `${name} 必须为 1–${max} 字符的非空字符串`);
  return value;
}

// 只保存协议字段，避免任意请求字段进入长期保留的内存事件
function validateEvent(input, sessionId) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input), '事件必须是 JSON 对象');
  requireValue(ID_PATTERN.test(sessionId) && input.sessionId === sessionId, 'sessionId 不合法或与路径不一致');
  requireValue(TYPES.has(input.type), '未知会议事件类型');
  const event = { type: input.type, sessionId };
  if (input.round !== undefined || ['round_started', 'seat_started', 'seat_finished'].includes(input.type)) {
    requireValue(Number.isSafeInteger(input.round) && input.round > 0, 'round 必须为正整数');
    event.round = input.round;
  }
  if (input.type.startsWith('seat_') || input.type === 'stance_changed') {
    requireValue(typeof input.seat === 'string' && ID_PATTERN.test(input.seat), 'seat 标识不合法');
    event.seat = input.seat;
  }
  switch (input.type) {
    case 'meeting_started': {
      event.tag = text(input.tag, 'tag', 200);
      requireValue(Array.isArray(input.seats) && input.seats.length > 0 && input.seats.length <= 16,
        'seats 必须包含 1–16 个席位');
      const ids = new Set();
      event.seats = input.seats.map(seat => {
        requireValue(seat && typeof seat.id === 'string' && ID_PATTERN.test(seat.id) && !ids.has(seat.id),
          '席位 id 不合法或重复');
        ids.add(seat.id);
        const result = { id: seat.id, label: text(seat.label, '席位 label', 80) };
        if (seat.model !== undefined) result.model = text(seat.model, '席位 model', 80);
        return result;
      });
      break;
    }
    case 'seat_progress':
    case 'meeting_failed':
      event.message = text(input.message, 'message');
      break;
    case 'seat_finished':
      requireValue(['ok', 'error'].includes(input.status), '席位 status 必须为 ok 或 error');
      event.status = input.status;
      if (input.message !== undefined) event.message = text(input.message, 'message');
      break;
    case 'stance_changed':
      event.stance = text(input.stance, 'stance', 200);
      break;
    case 'meeting_finished':
      event.summary = text(input.summary, 'summary');
      if (input.winner !== undefined) event.winner = text(input.winner, 'winner', 200);
      break;
  }
  return event;
}

export function createSessionStore() {
  const sessions = new Map();
  let totalEvents = 0;
  const get = id => {
    const session = sessions.get(id);
    if (!session) throw new HttpError(404, '会议不存在；服务重启会清空内存会议');
    return session;
  };
  const describe = session => ({
    id: session.state.sessionId, tag: session.state.tag, status: session.state.status,
    round: session.state.round, eventCount: session.events.length,
  });

  return {
    list: () => [...sessions.values()].map(describe),
    describe: id => describe(get(id)),
    events(id, after = 0) {
      const session = get(id);
      requireValue(Number.isSafeInteger(after) && after >= 0, 'after 必须为非负整数');
      requireValue(after <= session.events.length, '事件游标已失效，请从 after=0 重新读取', 409);
      return {
        sessionId: id, status: session.state.status,
        events: session.events.slice(after), nextCursor: session.events.length,
      };
    },
    append(id, input) {
      const event = validateEvent(input, id);
      let session = sessions.get(id);
      if (event.type === 'meeting_started') {
        requireValue(!session, '会议已存在，不可重复开始', 409);
        requireValue(sessions.size < 64, '会议数量已达 64 个上限，请手动重启服务释放内存', 409);
        session = { state: initialMeeting(), events: [] };
      } else {
        session = get(id);
        requireValue(session.state.status === 'running', '会议已结束，不可追加事件', 409);
        if (event.type === 'round_started') {
          requireValue(event.round > session.state.round, '新轮次必须大于当前轮次', 409);
          requireValue(!session.state.seats.some(seat => seat.status === 'working'), '仍有席位工作，不能开始新轮次', 409);
        } else if (event.seat) {
          const seat = session.state.seats.find(item => item.id === event.seat);
          requireValue(seat, '事件引用了不存在的席位');
          requireValue(session.state.round > 0, '请先发送 round_started', 409);
          requireValue(event.round === undefined || event.round === session.state.round, '事件轮次不是当前轮次', 409);
          if (event.type === 'seat_started') requireValue(seat.status === 'waiting', '席位本轮已经开始或完成', 409);
          if (['seat_progress', 'seat_finished'].includes(event.type)) {
            requireValue(seat.status === 'working', '席位尚未开始或已经完成', 409);
          }
        }
      }
      // shortcut: 原型只保留内存事件，达到上限后拒绝写入，接入真实长会议时再设计持久化与回收
      requireValue(session.events.length < 1000 && totalEvents < 10000, '事件存储已达上限，请手动重启服务释放内存', 409);
      const stored = { ...event, seq: session.events.length + 1, at: new Date().toISOString() };
      session.state = reduceMeeting(session.state, stored);
      session.events.push(stored);
      totalEvents += 1;
      sessions.set(id, session);
      return stored;
    },
  };
}
