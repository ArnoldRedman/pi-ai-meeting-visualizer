export const previewSeats = [
  { id: 'analyst', label: '方案分析', model: 'Claude Sonnet', status: 'waiting' },
  { id: 'reviewer', label: '风险审阅', model: 'GPT', status: 'waiting' },
  { id: 'builder', label: '实现评估', model: 'Gemini', status: 'waiting' },
  { id: 'observer', label: '用户视角', model: 'Grok', status: 'waiting' },
];

// 散步：两端往返，坐标在 scene-motion 里按左右交替算出
const corridorSpot = { id: 'corridor', label: '沿过道散步', dwell: 2.5 };

// 摸鱼点模板：坐标在 resolveSpot 里按房间尺寸展开，动作只用 Kenney 自带的片段
const activities = [
  { id: 'window-near', label: '看窗外的风景', windowIndex: 1, rotation: -Math.PI / 2, animation: 'idle', dwell: 12 },
  { id: 'window-far', label: '看窗外的风景', windowIndex: -2, rotation: -Math.PI / 2, animation: 'idle', dwell: 11 },
  { id: 'screen', label: '盯着大屏幕', atScreen: true, rotation: Math.PI, animation: 'idle', dwell: 12 },
  { id: 'sofa', label: '窝在沙发上玩手机', prop: 'sofa', offsetX: -0.05, rotation: -Math.PI / 2, animation: 'sit', sitY: 0.35, dwell: 18 },
  { id: 'coffee', label: '在咖啡角拿着杯子', prop: 'sideTable', offsetX: -1.05, rotation: Math.PI / 2, animation: 'holding-right', dwell: 12 },
  { id: 'shelf', label: '站在书柜前翻资料', prop: 'bookcase', offsetZ: 0.775, rotation: Math.PI, animation: 'holding-both', dwell: 12 },
  { id: 'plant', label: '凑近看看绿植', prop: 'cornerPlant', offsetX: 0.8, offsetZ: -0.6, rotation: -Math.PI / 2.4, animation: 'crouch', dwell: 10 },
];

// 摸鱼点的坐标按房间尺寸展开，动作只用 Kenney 自带的片段
function resolveSpot(activity, room) {
  const { width, depth, windowZs, props } = room;
  const point = activity.atScreen ? { x: 0, z: -depth / 2 + 1.3 }
    : activity.windowIndex !== undefined
      ? { x: -width / 2 + 0.85, z: windowZs[activity.windowIndex < 0 ? windowZs.length + activity.windowIndex : activity.windowIndex] }
      : { x: props[activity.prop].x + (activity.offsetX ?? 0), z: props[activity.prop].z + (activity.offsetZ ?? 0) };
  return { ...activity, ...point };
}

export function meetingLayout(count) {
  const columns = Math.ceil(count / 2);
  const width = Math.max(11.5, columns * 2.2 + 5);
  const depth = 11.2;
  const tableWidth = Math.max(5.6, columns * 2.2 + 1);
  const screenZ = -depth / 2 + 0.3;
  // 靠墙家具最多向房间里伸出 1.7 米（书柜），散步过道和回座走廊都停在这条家具带外侧
  const aisleX = width / 2 - 2.3;
  // 侧墙窗口模块沿墙均分，砌墙与看风景的摸鱼点共用这一份分格
  const panelCount = Math.max(2, Math.round(depth / 2.2));
  const panelWidth = depth / panelCount;
  const windowZs = Array.from({ length: panelCount }, (_, index) => -depth / 2 + (index + 0.5) * panelWidth);
  // 固定家具位置：砌墙与摸鱼点都从这里取，避免两处各写一套坐标
  const props = {
    bookcase: { x: -width / 2 + 1.15, z: -depth / 2 + 0.65 },
    cornerPlant: { x: -width / 2 + 0.65, z: depth / 2 - 0.7 },
    sofa: { x: width / 2 - 0.68, z: -0.3 },
    sideTable: { x: width / 2 - 0.65, z: 1.3 },
  };
  const spots = activities.map(activity => resolveSpot(activity, { width, depth, windowZs, props }));
  // 第一个摸鱼点从自己这半区近处挑（几秒就到），第二个挑对面半区或中段的（沙发），保证不只是原地晃
  const nearSpots = { back: spots.filter(spot => spot.z < -1.3), front: spots.filter(spot => spot.z >= 1.3) };
  const farSpots = { back: spots.filter(spot => spot.z >= -1.3), front: spots.filter(spot => spot.z < 1.3) };
  // 绕过会议桌右端的绕行车道的横坐标：桌子边缘与右侧家具之间那 0.95 米空当，实测所有人数都够用
  const bypassX = tableWidth / 2 + 0.45;
  return {
    width, depth, tableWidth, screenZ, windowZs, props, aisleX, bypassX, spots,
    slots: Array.from({ length: count }, (_, index) => {
      const back = index < columns;
      const rowCount = back ? columns : count - columns;
      const column = back ? index : index - columns;
      const ownHalf = back ? nearSpots.back : nearSpots.front;
      const otherHalf = back ? farSpots.back : farSpots.front;
      // 同一个摸鱼点最多四个人用：按取点轮数分四条站位，同排不会有人重叠
      // shortcut: 同排超过 12 个席位时轮数会绕回同一条站位，那时需要再加宽站位带
      const spotLane = ((Math.floor(index / ownHalf.length) % 4) - 1.5) * 0.35;
      return {
        x: (column - (rowCount - 1) / 2) * 2.2,
        z: back ? -1.75 : 1.75,
        rotation: back ? 0 : Math.PI,
        laptopRotation: back ? Math.PI : 0,
        chairZ: back ? -3.25 : 3.25,
        roamZ: back ? -4.75 : 4.75,
        roamLeftX: -aisleX,
        roamRightX: aisleX,
        exitX: column < rowCount / 2 ? -aisleX : aisleX,
        bypassX,
        spotLane,
        screenZ,
        // 提前完成后的摸鱼循环：先做自己这半区的一件事、再去散步、再换成对面半区另一件
        slack: [ownHalf[index % ownHalf.length], corridorSpot, otherHalf[(index + 1) % otherHalf.length], corridorSpot],
      };
    }),
  };
}

export function seatAppearance(status) {
  switch (status) {
    case 'working': return { color: 0xc8903e, animation: 'interact-right', loop: true };
    case 'done': return { color: 0x4e8962, animation: 'emote-yes', loop: false };
    case 'failed': return { color: 0xb76964, animation: 'emote-no', loop: false };
    case 'stopped': return { color: 0x89908d, animation: 'idle', loop: true };
    default: return { color: 0x9faea5, animation: 'idle', loop: true };
  }
}
