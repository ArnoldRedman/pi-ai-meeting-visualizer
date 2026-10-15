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

// meeting.js 第二轮给子会话的 key 是 <第一轮 key>-r2；resume 被拒的席位补一轮 fresh，变成 -r2-fresh
const ROUND2_KEY = /-r2(-fresh)?$/;

// 子会话 key → 它属于哪一轮（1 或 2）
export function roundOfKey(key) {
  return ROUND2_KEY.test(key) ? 2 : 1;
}

// 去掉轮次后缀，拿回第一轮那个 key（keys 表按第一轮 key 建的）
export function baseKeyFor(key) {
  return key.replace(ROUND2_KEY, '');
}

// 会议脚本把答案末尾最后一行【结论】当立场，这里照抄同一条规则
export function stanceFromText(text) {
  const found = String(text ?? '').match(/【结论】[^\n]*/g);
  return found ? found[found.length - 1].replace('【结论】', '').trim() : '';
}

export function readStance(outputPath) {
  try {
    return stanceFromText(readFileSync(outputPath, 'utf8'));
  } catch {
    // 产物还没落盘或路径变了：先出中性结论，整轮结束时再用 stance_changed 补真立场
    return '';
  }
}

// 席位本轮结论正文（协议上限 2000 字符）：结论压在答案末尾，超长时留尾部，别把【结论】切掉
export function conclusionFor(text, max = 2000) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  return value.length <= max ? value : `…${value.slice(1 - max)}`;
}

// workflow-children.jsonl 是 pi-subagents 逐步写的子会话台账：start 一行、交卷一行
// （settle 里带这次子会话的完整输出，所以逐席结论文本不用再去猜产物路径）
export function childLedger(jsonl) {
  const rows = [];
  for (const line of String(jsonl ?? '').split('\n')) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue; // 文件正在被追加写：最后一行可能是半行，跳过
    }
    if (typeof row?.key !== 'string') continue;
    if (row.type === 'start') rows.push({ type: 'start', key: row.key });
    else if (row.type === 'settle') {
      const result = row.result ?? {};
      rows.push({ type: 'settle', key: row.key, failed: result.ok === false || Boolean(result.error), output: String(result.output ?? '') });
    }
  }
  return rows;
}

// 子会话完成通知：一行 key、"Workflow run: <runId>"、产物路径
export function childNotice(text) {
  const child = text.match(/Workflow child (completed|failed): \*\*(.+?)\*\*/);
  const run = text.match(/Workflow run: ([0-9a-f-]{8,})/i);
  if (!child || !run) return null;
  return { key: child[2], failed: child[1] === 'failed', output: text.match(/Output: (.+)/)?.[1]?.trim() ?? '', runId: run[1] };
}
