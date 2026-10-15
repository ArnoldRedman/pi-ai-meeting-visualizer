const FINISHED = new Set(['done', 'failed', 'stopped']);
const SPEED = 1.35;

export function allSeatsFinished(state) {
  return state.seats.length > 0 && state.seats.every(seat => FINISHED.has(seat.status));
}

export function seatIntent(state, seat) {
  if (state.status === 'finished' || state.status === 'failed' || allSeatsFinished(state)) return 'seat';
  return seat.status === 'done' ? 'roam' : 'work';
}

export function createMotion(slot, index) {
  return {
    slot, index, x: slot.x, z: slot.z, rotation: slot.rotation,
    intent: 'work', path: [], pause: 0, roamStep: 0, corridorStep: 0, spot: null, seated: false,
  };
}

function targetFor(motion) {
  const { slot, intent } = motion;
  if (intent === 'seat') return { x: slot.x, z: slot.chairZ };
  if (intent === 'work') return { x: slot.x, z: slot.z };
  return { x: slot.roamLeftX, z: slot.roamZ };
}

// 回座、回工位走短路线：自己的走廊到目标那一行，再横向回到座位
// 摸鱼走绕过会议桌右端的路线：桌子加椅子后中间带很窄，不能从桌头穿过去，绕远一圈才不穿模
// 所有路线都压在这几条实测不撞家具的通道上：座位外侧的走廊（exitX）、
// 桌子右端与右侧家具之间那 0.95 米绕行车道（bypassX）、椅后过道（roamZ）
// 同侧直走；要跳到桌子另一侧就先走绕行车道，否则会贴着桌角穿过去
export function routeTo(motion, target) {
  const { exitX, roamZ, bypassX } = motion.slot;
  if (Math.abs(motion.z) >= 1.3 && Math.abs(target.z) >= 1.3 && motion.z * target.z > 0) {
    return [
      { x: exitX, z: motion.z },
      { x: exitX, z: target.z },
      { ...target },
    ];
  }
  // 已经在房间中段（沙发）或跨到对面时，直接从绕行车道起步，不在桌子边上横切
  const laneStart = Math.abs(motion.z) >= 1.3 && motion.z * roamZ > 0 ? exitX : bypassX;
  return [
    { x: laneStart, z: motion.z },
    { x: laneStart, z: roamZ },
    { x: bypassX, z: roamZ },
    { x: bypassX, z: target.z },
    { ...target },
  ];
}

// 同一个摸鱼点可能被多人同时占用，按席位分配的站位横向错开，避免人物模型重叠
function seatOffset(spot, lane) {
  return { x: spot.x + Math.cos(spot.rotation) * lane, z: spot.z - Math.sin(spot.rotation) * lane };
}

// 摸鱼一趟：依次取席位上的摸鱼点，散步点按两端交替；结果存在 motion.spot 供动画与气泡文案使用
function startRoamLeg(motion) {
  const slack = motion.slot.slack;
  const spot = slack[motion.roamStep % slack.length];
  motion.roamStep += 1;
  motion.spot = spot.id === 'corridor'
    ? { ...spot, x: motion.corridorStep++ % 2 === 0 ? motion.slot.roamLeftX : motion.slot.roamRightX, z: motion.slot.roamZ }
    : { ...spot, ...seatOffset(spot, motion.slot.spotLane) };
  motion.path = routeTo(motion, motion.spot);
}

export function setIntent(motion, intent, instant = false) {
  if (motion.intent !== intent) {
    motion.intent = intent;
    motion.seated = false;
    motion.pause = 0;
    motion.spot = null;
    // roam 的 roamStep 不重置：每一轮从摸鱼清单的下一件事开始，不会每轮都先去同一个地方
    if (intent === 'roam') startRoamLeg(motion);
    else motion.path = routeTo(motion, targetFor(motion));
  }
  if (instant) {
    Object.assign(motion, targetFor(motion));
    motion.path = [];
    motion.rotation = intent === 'seat'
      ? Math.atan2(-motion.x, motion.slot.screenZ - motion.z)
      : motion.slot.rotation;
    motion.seated = intent === 'seat';
  }
}

export function advanceMotion(motion, delta) {
  if (!motion.path.length && motion.intent === 'roam') {
    motion.pause -= delta;
    if (motion.pause <= 0) startRoamLeg(motion);
  }
  const target = motion.path[0];
  let angle;
  if (target) {
    const dx = target.x - motion.x;
    const dz = target.z - motion.z;
    const distance = Math.hypot(dx, dz);
    const step = Math.min(SPEED * delta, distance);
    if (distance > 0.001) {
      motion.x += dx / distance * step;
      motion.z += dz / distance * step;
      angle = Math.atan2(dx, dz);
    }
    if (distance <= step + 0.001) {
      motion.x = target.x;
      motion.z = target.z;
      motion.path.shift();
      if (!motion.path.length) motion.pause = (motion.spot?.dwell ?? 1) + motion.index * 0.2;
    }
  }
  if (!motion.path.length) {
    if (motion.intent === 'seat') angle = Math.atan2(-motion.x, motion.slot.screenZ - motion.z);
    else if (motion.intent === 'roam') angle = motion.spot?.rotation ?? motion.slot.rotation;
    else angle = motion.slot.rotation;
  }
  if (angle !== undefined) {
    const difference = Math.atan2(Math.sin(angle - motion.rotation), Math.cos(angle - motion.rotation));
    motion.rotation += Math.sign(difference) * Math.min(Math.abs(difference), delta * 5);
    motion.seated = motion.intent === 'seat' && !motion.path.length && Math.abs(difference) < 0.03;
  }
}

export function presentationStage(state, motions) {
  if (!motions.length) return 'waiting';
  if (!motions.every(motion => motion.intent === 'seat')) return 'working';
  if (!motions.every(motion => motion.seated)) return 'returning';
  if (state.status === 'finished') return 'summary';
  if (state.status === 'failed') return 'failed';
  return 'round-finished';
}

// 大屏幕文案：会议状态到墙上仪表盘的映射，进行中要实时写出本轮进度和最近一条进度
export function screenCopy({ stage, state, seats, latest, arrived }) {
  const title = ({ returning: '全员回座中', summary: '会议总结', failed: '会议异常结束', 'round-finished': '本轮完成' })[stage]
    || (state.round ? `第 ${state.round} 轮讨论` : '准备开始会议');
  const done = seats.filter(seat => ['done', 'failed', 'stopped'].includes(seat.status)).length;
  const text = stage === 'summary' ? `${state.winner || ''}\n${state.summary}`
    : stage === 'failed' ? state.error
      : stage === 'returning' ? `${arrived} / ${seats.length} 已入座\n等待大家一起看总结`
        : stage === 'round-finished' ? `${done} / ${seats.length} 已完成本轮\n等待下一轮或最终结论`
          : !state.round ? '等待会议开始\n模型入座后进入第一轮讨论'
            : `${done} / ${seats.length} 已完成本轮\n最新更新：${latest ? `${latest.model || latest.label} · ${(latest.message ?? '').slice(0, 40)}` : '等待模型输出'}`;
  return { title, text };
}
