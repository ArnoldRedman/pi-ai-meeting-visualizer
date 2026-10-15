// 会议跟随里与 Pi API 无关的纯逻辑：单独放一份，好让 node --test 直接测，不必拉起扩展运行时
import { readFileSync } from 'node:fs';

// 席位 id 必须是 1–64 位 ASCII 字母数字/_/-（协议约束），中文席位名换成 seat1、seat2
export function seatIdFor(name, index, used) {
  const base = name.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 60) || `seat${index + 1}`;
  let id = base;
  for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

// 会议脚本给子会话起的 key 规则（和 meeting.js 一致）：名字合法就用名字，否则 seatN
const WORKFLOW_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function workflowKeyFor(name, index, used) {
  const base = WORKFLOW_KEY.test(name) ? name : `seat${index + 1}`;
  let key = base;
  for (let suffix = 2; used.has(key); suffix += 1) key = `${base}-${suffix}`;
  used.add(key);
  return key;
}

// 会议脚本把答案末尾最后一行【结论】当立场，这里照抄同一条规则
export function readStance(outputPath) {
  try {
    const found = readFileSync(outputPath, 'utf8').match(/【结论】[^\n]*/g);
    return found ? found[found.length - 1].replace('【结论】', '').trim() : '';
  } catch {
    // 产物还没落盘或路径变了：先出中性结论，整轮结束时再用 stance_changed 补真立场
    return '';
  }
}

// 子会话完成通知：一行 key、"Workflow run: <runId>"、产物路径
export function childNotice(text) {
  const child = text.match(/Workflow child (completed|failed): \*\*(.+?)\*\*/);
  const run = text.match(/Workflow run: ([0-9a-f-]{8,})/i);
  if (!child || !run) return null;
  return { key: child[2], failed: child[1] === 'failed', output: text.match(/Output: (.+)/)?.[1]?.trim() ?? '', runId: run[1] };
}
