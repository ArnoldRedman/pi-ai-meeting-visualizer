import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { baseKeyFor, childLedger, childNotice, conclusionFor, readStance, roundOfKey, seatIdFor, stanceFromText, workflowKeyFor } from '../lib/meeting-follow.mjs';

test('席位 id 只留协议允许的 ASCII 字符，中文名退成 seatN', () => {
  const used = new Set();
  assert.equal(seatIdFor('sol', 0, used), 'sol');
  assert.equal(seatIdFor('方案审阅', 1, used), 'seat2');
  // 不能出现协议不允许的字符（. 与中文都换掉），重名要能共存
  assert.equal(seatIdFor('gpt.5', 2, used), 'gpt-5');
  assert.equal(seatIdFor('gpt.5', 3, used), 'gpt-5-2');
  for (const id of used) assert.match(id, /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
});

test('子会话 key 与 meeting.js 同规则：合法名字直接用，否则 seatN', () => {
  const used = new Set();
  assert.equal(workflowKeyFor('sol', 0, used), 'sol');
  assert.equal(workflowKeyFor('方案-A', 1, used), 'seat2');
  assert.equal(workflowKeyFor('sol', 2, used), 'sol-2');
});

test('认子会话完成通知，拿得到 key、runId 与产物路径', () => {
  const notice = [
    'Workflow child completed: **ds**',
    'Workflow run: a4503c50-1104-43b8-9e29-10d1d5ba90e1',
    'Child run: 06871ead-7d04-48d1-ae02-4ae4136526f9',
    'Output: C:\\tmp\\sessions\\06871ead_oracle_output.md',
    'Status: workflow still running',
  ].join('\n');
  assert.deepEqual(childNotice(notice), {
    key: 'ds',
    failed: false,
    output: 'C:\\tmp\\sessions\\06871ead_oracle_output.md',
    runId: 'a4503c50-1104-43b8-9e29-10d1d5ba90e1',
  });
  assert.equal(childNotice(notice.replace('completed', 'failed')).failed, true);
  // 整轮返回值通知不是子会话通知
  assert.equal(childNotice('Background task completed: **workflow**\nReturn: {}'), null);
});

test('从子会话产物里取最后一行【结论】，读不到就返回空串', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'meeting-stance-'));
  const file = path.join(dir, 'out.md');
  writeFileSync(file, '铺垫\n【结论】先改 README\n补充说明\n【结论】先改 README，再补一张混状态图\n');
  assert.equal(readStance(file), '先改 README，再补一张混状态图');
  assert.equal(readStance(path.join(dir, '没有这个文件.md')), '');
  writeFileSync(file, '只有正文，没有结论行\n');
  assert.equal(readStance(file), '');
});

test('第二轮子会话 key 带 -r2 / -r2-fresh 后缀，回到第一轮 key 才能对上席位', () => {
  assert.equal(roundOfKey('sol'), 1);
  assert.equal(roundOfKey('sol-r2'), 2);
  assert.equal(roundOfKey('sol-r2-fresh'), 2);
  assert.equal(baseKeyFor('sol'), 'sol');
  assert.equal(baseKeyFor('sol-r2'), 'sol');
  assert.equal(baseKeyFor('sol-r2-fresh'), 'sol');
});

test('席位结论取台账原文，超过协议上限就留尾部（结论压在最后一行）', () => {
  assert.equal(conclusionFor('短结论'), '短结论');
  assert.equal(conclusionFor('   '), '');
  const long = `${'x'.repeat(3000)}\n【结论】用 A 方案`;
  const text = conclusionFor(long);
  assert.equal(text.length, 2000);
  assert.ok(text.endsWith('【结论】用 A 方案'));
});

test('子会话台账：只认 start / settle，读出 key、成败与完整正文', () => {
  const jsonl = [
    '{"type":"start","key":"sol","runId":"a1"}',
    '{"type":"settle","key":"sol","result":{"ok":true,"output":"答案正文\\n【结论】先验证事件闭环"}}',
    '{"type":"start","key":"sol-r2"}',
    '{"type":"settle","key":"sol-r2","result":{"ok":false,"error":"resume 被拒"}}',
    '',
    '{"type":"settle","key":"grok-r2","resul',  // 正在追加写：半行不能带崩整轮
    '{"type":"unknown","key":"x"}',
  ].join('\n');
  assert.deepEqual(childLedger(jsonl), [
    { type: 'start', key: 'sol' },
    { type: 'settle', key: 'sol', failed: false, output: '答案正文\n【结论】先验证事件闭环' },
    { type: 'start', key: 'sol-r2' },
    { type: 'settle', key: 'sol-r2', failed: true, output: '' },
  ]);
  assert.equal(stanceFromText('正文\n【结论】A\n结尾\n【结论】B'), 'B');
});
