import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore, HttpError } from '../server/session-store.mjs';
import { demoEvents } from '../server/demo.mjs';
import { initialMeeting, reduceMeeting, recordSeatEvent, seatLogLimit } from '../web/state.mjs';

const start = id => ({
  type: 'meeting_started', sessionId: id, tag: '原型评审', seats: [{ id: 'a', label: '方案分析' }],
});
const send = (store, id, type, data = {}) => store.append(id, { type, sessionId: id, ...data });
const rejects = (action, status) => assert.throws(action, error => error instanceof HttpError && error.status === status);

test('八种事件中的成功路径：完整回放、第二轮重置与最终状态保留', () => {
  const store = createSessionStore();
  let live = initialMeeting();
  for (const input of demoEvents('demo')) {
    const event = store.append('demo', input);
    const previous = live;
    live = reduceMeeting(live, event);
    if (event.type === 'round_started' && event.round === 2) {
      assert.equal(previous.seats.every(seat => seat.status === 'done'), true);
      assert.equal(live.seats.every(seat => seat.status === 'waiting'), true);
    }
  }
  assert.equal(live.status, 'finished');
  assert.equal(live.seats.every(seat => seat.status === 'done'), true);
  assert.equal(live.seats.every(seat => seat.stance.startsWith('A')), true);
  const all = store.events('demo');
  assert.deepEqual(all.events.map(event => event.seq), all.events.map((_, index) => index + 1));
  assert.deepEqual(all.events.reduce(reduceMeeting, initialMeeting()), live);
  assert.equal(store.events('demo', all.nextCursor).events.length, 0);
  assert.deepEqual(store.events('demo', 2).events, all.events.slice(2));
  rejects(() => send(store, 'demo', 'meeting_failed', { message: '不允许修改最终画面' }), 409);
  assert.equal(store.describe('demo').status, 'finished');
});

test('席位失败、会议失败与提前收尾不会留下持续工作动画', () => {
  const store = createSessionStore();
  store.append('failed', start('failed'));
  send(store, 'failed', 'round_started', { round: 1 });
  send(store, 'failed', 'seat_started', { seat: 'a', round: 1 });
  const working = store.events('failed').events.reduce(reduceMeeting, initialMeeting());
  const seatFailure = reduceMeeting(working, { type: 'seat_finished', seat: 'a', status: 'error', message: '模型超时' });
  assert.equal(seatFailure.seats[0].status, 'failed');
  send(store, 'failed', 'meeting_failed', { message: '模拟服务中断' });
  const failed = store.events('failed').events.reduce(reduceMeeting, initialMeeting());
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, '模拟服务中断');
  assert.equal(failed.seats[0].status, 'stopped');
  assert.equal(reduceMeeting(working, { type: 'meeting_finished', summary: '提前收尾' }).seats[0].status, 'stopped');
});

test('session 隔离、合法顺序与错误游标', () => {
  const store = createSessionStore();
  for (const id of ['one', 'two']) store.append(id, start(id));
  rejects(() => store.append('one', start('one')), 409);
  rejects(() => send(store, 'missing', 'round_started', { round: 1 }), 404);
  rejects(() => send(store, 'one', 'seat_started', { seat: 'a', round: 1 }), 409);
  send(store, 'one', 'round_started', { round: 1 });
  rejects(() => send(store, 'one', 'seat_finished', { seat: 'a', round: 1, status: 'ok' }), 409);
  rejects(() => send(store, 'one', 'seat_started', { seat: 'unknown', round: 1 }), 400);
  rejects(() => send(store, 'one', 'seat_started', { seat: 'a', round: 2 }), 409);
  send(store, 'one', 'seat_started', { seat: 'a', round: 1 });
  rejects(() => send(store, 'one', 'seat_started', { seat: 'a', round: 1 }), 409);
  rejects(() => send(store, 'one', 'round_started', { round: 2 }), 409);
  send(store, 'one', 'seat_finished', { seat: 'a', round: 1, status: 'error' });
  rejects(() => send(store, 'one', 'seat_progress', { seat: 'a', message: '迟到的消息' }), 409);
  rejects(() => send(store, 'one', 'round_started', { round: 1 }), 409);
  assert.equal(store.describe('two').eventCount, 1);
  assert.equal(store.list().length, 2);
  rejects(() => store.events('one', -1), 400);
  rejects(() => store.events('one', 0.5), 400);
  rejects(() => store.events('one', 100), 409);
});

test('席位模型名称可选且能回放，旧事件兼容，超长或空白模型名拒绝', () => {
  const store = createSessionStore();
  store.append('legacy', start('legacy'));
  assert.equal(store.events('legacy').events[0].seats[0].model, undefined);
  const input = start('named');
  input.seats[0].model = 'Claude Sonnet <演示>';
  store.append('named', input);
  const replayed = store.events('named').events.reduce(reduceMeeting, initialMeeting());
  assert.equal(replayed.seats[0].model, 'Claude Sonnet <演示>');
  assert.equal(replayed.seats[0].label, '方案分析');
  for (const model of [' ', 'x'.repeat(81), null, 7]) {
    const invalid = start('invalid');
    invalid.seats[0].model = model;
    rejects(() => store.append('invalid', invalid), 400);
  }
});

test('校验字段并限制内存；无效请求不创建 session', () => {
  const store = createSessionStore();
  for (const input of [null, [], {}, { ...start('x'), sessionId: 'wrong' },
    { ...start('x'), type: 'unknown' }, { ...start('x'), tag: ' ' },
    { ...start('x'), seats: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] },
    { ...start('x'), seats: [{ id: '../bad', label: 'A' }] },
    { ...start('x'), seats: [{ id: 'a', label: 'x'.repeat(81) }] }]) {
    rejects(() => store.append('x', input), 400);
  }
  assert.equal(store.list().length, 0);
  for (let index = 0; index < 64; index++) store.append(`s${index}`, start(`s${index}`));
  rejects(() => store.append('overflow', start('overflow')), 409);
  send(store, 's0', 'round_started', { round: 1 });
  send(store, 's0', 'seat_started', { seat: 'a', round: 1 });
  rejects(() => send(store, 's0', 'seat_progress', { seat: 'a', message: 'x'.repeat(2001) }), 400);
  rejects(() => send(store, 's0', 'seat_finished', { seat: 'a', round: 1, status: 'bad' }), 400);
  for (let index = 3; index < 1000; index++) send(store, 's0', 'seat_progress', { seat: 'a', message: '公开进度' });
  rejects(() => send(store, 's0', 'seat_progress', { seat: 'a', message: '超过上限' }), 409);
  assert.equal(store.describe('s0').eventCount, 1000);
});

test('聚焦面板的思考过程按席位累积公开事件，只保留最近若干条', () => {
  const log = new Map();
  for (let round = 1; round <= 6; round++) {
    recordSeatEvent(log, { type: 'seat_started', seat: 'a', round });
    for (let step = 0; step < 8; step++) {
      recordSeatEvent(log, { type: 'seat_progress', seat: 'a', round, message: `第 ${round} 轮第 ${step} 条` });
    }
  }
  // 非席位事件不属于任何一个人的思考过程
  recordSeatEvent(log, { type: 'round_started', round: 7 });
  recordSeatEvent(log, { type: 'meeting_finished', summary: '收尾' });
  const entries = log.get('a');
  assert.equal(entries.length, seatLogLimit);
  assert.equal(entries[0].text, '第 2 轮第 4 条');
  assert.equal(entries.at(-1).text, '第 6 轮第 7 条');
  assert.equal(log.has('b'), false);
  assert.deepEqual(recordSeatEvent(new Map(), { type: 'stance_changed', seat: 'b', round: 1, stance: 'A' }).get('b'),
    [{ round: 1, text: '更新立场：A', stance: true }]);
  assert.deepEqual(recordSeatEvent(new Map(), { type: 'seat_finished', seat: 'b', round: 2, status: 'error' }).get('b'),
    [{ round: 2, text: '本轮失败：未提供原因' }]);
});
