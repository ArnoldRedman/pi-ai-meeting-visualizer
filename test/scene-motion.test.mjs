import test from 'node:test';
import assert from 'node:assert/strict';
import { meetingLayout } from '../web/scene-layout.mjs';
import { allSeatsFinished, createMotion, seatIntent, setIntent, advanceMotion, presentationStage, screenCopy } from '../web/scene-motion.mjs';
import { placeLabels } from '../web/scene-labels.mjs';

const state = statuses => ({ status: 'running', seats: statuses.map((status, index) => ({ id: String(index), status })) });
const tick = (motion, count = 200) => { for (let i = 0; i < count; i++) advanceMotion(motion, 0.05); };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);

test('提前完成可散步，失败者不散步，全员完成或会议终止后统一回座', () => {
  const working = state(['done', 'working', 'failed', 'waiting']);
  assert.equal(allSeatsFinished(working), false);
  assert.equal(seatIntent(working, working.seats[0]), 'roam');
  assert.equal(seatIntent(working, working.seats[2]), 'work');
  for (const ended of [state(['done', 'failed']), { ...working, status: 'finished' }, { ...working, status: 'failed' }]) {
    assert.ok(ended.seats.every(seat => seatIntent(ended, seat) === 'seat'));
  }
  assert.equal(allSeatsFinished(state([])), false);
});

test('1–16 人沿椅后过道散步和回座，路径不会穿过会议桌或超出房间', () => {
  for (let count = 1; count <= 16; count++) {
    const layout = meetingLayout(count);
    assert.ok(layout.slots[0].roamRightX - layout.slots[0].roamLeftX > 6, '散步过道过短');
    assert.ok(layout.width / 2 - layout.slots[0].roamRightX >= 2, '散步过道太贴墙，会穿过靠墙家具');
    layout.slots.forEach((slot, index) => {
      const motion = createMotion(slot, index);
      setIntent(motion, 'roam');
      for (const intent of ['roam', 'seat']) {
        // 回座会绕开桌子端头，路比散步长，给足时间让每个人都能走回座位
        const frames = intent === 'roam' ? 220 : 900;
        setIntent(motion, intent);
        for (let frame = 0; frame < frames; frame++) {
          advanceMotion(motion, 0.05);
          assert.ok(Math.abs(motion.x) > layout.tableWidth / 2 || Math.abs(motion.z) > 0.9, '进入桌子区域');
          assert.ok(Math.abs(motion.x) < layout.width / 2 - 0.3);
          assert.ok(Math.abs(motion.z) < layout.depth / 2 - 0.3);
        }
      }
      close(motion.x, slot.x);
      close(motion.z, slot.chairZ);
      assert.equal(motion.seated, true);
      const screenFacing = Math.atan2(-slot.x, slot.screenZ - slot.chairZ);
      close(Math.cos(motion.rotation), Math.cos(screenFacing));
      close(Math.sin(motion.rotation), Math.sin(screenFacing));
    });
  }
});

test('进度更新不重置散步，下一轮可从途中安全返回电脑前', () => {
  const slot = meetingLayout(4).slots[0];
  const motion = createMotion(slot, 0);
  setIntent(motion, 'roam');
  tick(motion, 20);
  const path = motion.path;
  setIntent(motion, 'roam');
  assert.equal(motion.path, path);
  setIntent(motion, 'work');
  tick(motion);
  close(motion.x, slot.x);
  close(motion.z, slot.z);
  assert.equal(motion.seated, false);
  assert.equal(motion.path.length, 0);
});

test('摸鱼点都贴着对应家具，既在房间里也不落在会议桌上', () => {
  for (let count = 1; count <= 16; count++) {
    const layout = meetingLayout(count);
    const { spots, props, width, depth, tableWidth, windowZs } = layout;
    for (const spot of spots) {
      assert.ok(Math.abs(spot.x) < width / 2 - 0.3 && Math.abs(spot.z) < depth / 2 - 0.3, `${spot.id} 站到墙里或墙外`);
      assert.ok(Math.abs(spot.x) > tableWidth / 2 + 0.3 || Math.abs(spot.z) > 0.9, `${spot.id} 落在会议桌上`);
    }
    for (const [name, prop] of Object.entries(props)) {
      const spot = spots.find(candidate => candidate.prop === name);
      assert.ok(Math.hypot(spot.x - prop.x, spot.z - prop.z) < 1.6, `${name} 的摸鱼点离家具太远`);
    }
    assert.ok(windowZs.includes(spots.find(spot => spot.windowIndex !== undefined).z), '看风景的点不在窗口上');
    assert.ok(layout.bypassX > tableWidth / 2, '绕行车道压在会议桌上');
    assert.ok(layout.bypassX < props.sofa.x - 0.375 - 0.3, '绕行车道挤进沙发');
    // 同一个摸鱼点、同一排的席位必须错开站位，否则两个人会站在同一个点位上
    for (const spot of spots) {
      const lanes = new Map();
      for (const slot of layout.slots) {
        if (!slot.slack.some(item => item.id === spot.id)) continue;
        const row = Math.sign(slot.z);
        const taken = lanes.get(row) ?? new Set();
        assert.ok(!taken.has(slot.spotLane), `${spot.id} 同排两人站位重叠`);
        taken.add(slot.spotLane);
        lanes.set(row, taken);
      }
    }
  }
});

test('提前完成的人轮流去各自的摸鱼点，不再是原地来回踱步', () => {
  const layout = meetingLayout(4);
  const sequences = new Set();
  for (const [index, slot] of layout.slots.entries()) {
    assert.ok(slot.slack.filter(spot => spot.id !== 'corridor').length >= 2, '摸鱼点太少');
    sequences.add(slot.slack.map(spot => spot.id).join('|'));
    const motion = createMotion(slot, index);
    setIntent(motion, 'roam');
    const visited = new Set();
    let travelled = 0;
    let previousX = motion.x;
    let previousZ = motion.z;
    for (let frame = 0; frame < 3600; frame++) {
      advanceMotion(motion, 0.05);
      travelled += Math.hypot(motion.x - previousX, motion.z - previousZ);
      previousX = motion.x;
      previousZ = motion.z;
      if (motion.spot && !motion.path.length) {
        visited.add(motion.spot.id);
        const distance = Math.hypot(motion.x - motion.spot.x, motion.z - motion.spot.z);
        assert.ok(distance < 0.05, `停在 ${motion.spot.id} 之外 ${distance}`);
      }
      assert.ok(Math.abs(motion.x) > layout.tableWidth / 2 || Math.abs(motion.z) > 0.9, '走进会议桌');
      assert.ok(Math.abs(motion.x) < layout.width / 2 && Math.abs(motion.z) < layout.depth / 2, '走出房间');
    }
    assert.ok(visited.size >= 3, `三分钟只去了 ${[...visited].join('、')}`);
    assert.ok(travelled > 40, `三分钟只走了 ${travelled.toFixed(1)} 米`);
  }
  assert.ok(sequences.size > 1, '每个人的摸鱼顺序都一样');
});

test('大屏幕必须等待最后一人回座并转向，提前收到结论也不能提前总结', () => {
  const motions = meetingLayout(4).slots.map(createMotion);
  const finished = { ...state(['done', 'done', 'done', 'done']), status: 'finished' };
  motions.forEach(motion => setIntent(motion, 'seat'));
  assert.equal(presentationStage(finished, motions), 'returning');
  motions.slice(0, 3).forEach(motion => tick(motion));
  assert.equal(presentationStage(finished, motions), 'returning');
  tick(motions[3]);
  assert.equal(presentationStage(finished, motions), 'summary');
  assert.equal(presentationStage({ ...finished, status: 'running' }, motions), 'round-finished');
  assert.equal(presentationStage({ ...finished, status: 'failed' }, motions), 'failed');
});

test('减少动态效果时直接安置人物，电脑朝向与人物工作方向相反', () => {
  for (const [index, slot] of meetingLayout(4).slots.entries()) {
    const motion = createMotion(slot, index);
    setIntent(motion, 'seat', true);
    assert.equal(motion.seated, true);
    assert.equal(motion.path.length, 0);
    close(motion.z, slot.chairZ);
    close(Math.cos(slot.laptopRotation - slot.rotation), -1);
    setIntent(motion, 'work', true);
    close(motion.z, slot.z);
    assert.equal(motion.seated, false);
  }
});

test('人物气泡贴近锚点且不超出桌面或手机画布，避开大屏幕', () => {
  for (const [width, height, bubbleWidth] of [[880, 480, 150], [358, 420, 124]]) {
    const obstacle = { x: width * 0.42, y: 55, width: width * 0.2, height: 60 };
    const points = [[0.4, 0.46], [0.57, 0.46], [0.36, 0.68], [0.55, 0.72]].map(([x, y]) => ({
      x: width * x, y: height * y, width: bubbleWidth, height: 78,
    }));
    const boxes = placeLabels(points, width, height, [obstacle]);
    for (const [index, box] of boxes.entries()) {
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.ok(box.y >= 0 && box.y + box.height <= height);
      for (const other of [...boxes.slice(0, index), obstacle]) {
        const intersects = box.x < other.x + other.width && box.x + box.width > other.x
          && box.y < other.y + other.height && box.y + box.height > other.y;
        assert.equal(intersects, false, '气泡遮挡其他气泡或大屏幕');
      }
    }
  }
});

test('大屏幕文案跟着会议阶段走', () => {
  const seats = [
    { id: 'a', label: '方案分析', model: 'Claude', status: 'done' },
    { id: 'b', label: '风险审阅', model: 'GPT', status: 'working' },
  ];
  const state = { round: 2, winner: 'A · 先验证事件闭环', summary: '四个席位达成一致', error: '' };
  const working = screenCopy({ stage: 'working', state, seats, latest: { model: 'GPT', message: '正在检查本地服务与事件输入边界' }, arrived: 1 });
  assert.equal(working.title, '第 2 轮讨论');
  assert.equal(working.text, '1 / 2 已完成本轮\n最新更新：GPT · 正在检查本地服务与事件输入边界');
  // 长进度只截前 40 字，否则墙上那行会溢出
  const long = screenCopy({ stage: 'working', state, seats, latest: { model: 'GPT', message: 'x'.repeat(80) }, arrived: 1 });
  assert.equal(long.text.split('\n')[1], `最新更新：GPT · ${'x'.repeat(40)}`);
  // 还没有轮次和还没有人更新时不写「已完成本轮」
  assert.equal(screenCopy({ stage: 'working', state: { round: 0 }, seats, arrived: 0 }).text, '等待会议开始\n模型入座后进入第一轮讨论');
  assert.equal(screenCopy({ stage: 'working', state, seats, latest: null, arrived: 0 }).text, '1 / 2 已完成本轮\n最新更新：等待模型输出');
  assert.equal(screenCopy({ stage: 'returning', state, seats, arrived: 2 }).text, '2 / 2 已入座\n等待大家一起看总结');
  assert.equal(screenCopy({ stage: 'round-finished', state, seats }).text, '1 / 2 已完成本轮\n等待下一轮或最终结论');
  assert.equal(screenCopy({ stage: 'summary', state, seats }).text, 'A · 先验证事件闭环\n四个席位达成一致');
  assert.equal(screenCopy({ stage: 'failed', state: { ...state, error: '模型超时' }, seats }).text, '模型超时');
});
