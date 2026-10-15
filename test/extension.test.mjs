import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { childNotice, readStance, seatIdFor, workflowKeyFor } from '../lib/meeting-follow.mjs';

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
