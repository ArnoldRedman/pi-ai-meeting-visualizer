function overlap(a, b) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

// 优先贴近人物，发生遮挡时让开其他气泡和大屏幕；不改变人物本身的位置
export function placeLabels(anchors, width, height, obstacles = []) {
  const placed = [];
  for (const anchor of anchors) {
    const candidates = [];
    for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
      for (const x of [anchor.x + 18, anchor.x - anchor.width - 18, anchor.x - anchor.width / 2]) {
        const box = {
          x: Math.max(6, Math.min(width - anchor.width - 6, x)),
          y: Math.max(6, Math.min(height - anchor.height - 6, anchor.y - anchor.height - 12 + offset * (anchor.height + 8))),
          width: anchor.width, height: anchor.height,
        };
        const intersections = [...placed, ...obstacles].reduce((area, other) => area + overlap(box, other), 0);
        const distance = Math.hypot(box.x + box.width / 2 - anchor.x, box.y + box.height - anchor.y);
        candidates.push({ ...box, score: intersections * 1000 + distance });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    placed.push(candidates[0]);
  }
  return placed;
}

// 气泡只留一句话：优先用公开立场（它本来就是一句话），否则把正文压成预告，全文留给弹窗
function bubbleLine(seat) {
  const text = String(seat.stance || seat.message || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return '等待模拟会议开始';
  return text.length > 44 ? `${text.slice(0, 44)}…` : text;
}

export function createLabels(container, seats) {
  container.replaceChildren();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  container.append(svg);
  const items = seats.map(seat => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    svg.append(line);
    const element = document.createElement('article');
    element.className = 'character-bubble';
    element.dataset.seat = seat.id;
    const name = document.createElement('strong');
    name.textContent = seat.model || seat.label;
    name.title = name.textContent;
    const status = document.createElement('span');
    status.className = 'bubble-status';
    const progress = document.createElement('p');
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'bubble-more';
    more.dataset.expand = seat.id;
    more.textContent = '展开全文';
    element.append(name, status, progress, more);
    container.append(element);
    return { element, line, progress, status };
  });
  return {
    update(seats, motions, activeId = null) {
      for (const [index, seat] of seats.entries()) {
        const { element, progress, status } = items[index];
        const motion = motions[index];
        element.dataset.status = seat.status;
        element.dataset.active = String(seat.id === activeId);
        element.dataset.intent = motion.intent;
        element.dataset.moving = String(motion.path.length > 0);
        element.dataset.seated = String(motion.seated);
        const detail = motion.intent === 'seat' ? (motion.seated ? '已入座 · 看大屏幕' : '正在回座')
          : motion.intent === 'roam' ? (motion.path.length ? '已完成 · 溜达中' : `已完成 · ${motion.spot?.label ?? '自由活动'}`)
            : ({ waiting: '等待开始', working: '正在工作', failed: '本轮失败', stopped: '已停止' }[seat.status] || '已完成');
        if (status.textContent !== detail) status.textContent = detail;
        const message = bubbleLine(seat);
        if (progress.textContent !== message) {
          progress.textContent = message;
          element.title = `${seat.model || seat.label} · ${seat.label}\n${seat.message || ''}`;
        }
      }
    },
    position(points, width, height, obstacles) {
      const anchors = points.map((point, index) => ({
        ...point, index, width: items[index].element.offsetWidth, height: items[index].element.offsetHeight,
      }));
      // 聚焦单个人物时其他人会被推出画面：他们不参与排布，气泡也直接隐藏，否则会全挤在画面边缘
      const shown = anchors.filter(({ x, y }) => x > -60 && x < width + 60 && y > -60 && y < height + 60);
      const placed = new Map(placeLabels(shown, width, height, obstacles).map((box, slot) => [shown[slot].index, box]));
      anchors.forEach(({ x, y, index }) => {
        const { element, line } = items[index];
        const box = placed.get(index);
        if (!box) {
          element.style.display = 'none';
          line.style.display = 'none';
          return;
        }
        element.style.display = '';
        line.style.display = '';
        element.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
        line.setAttribute('x1', x);
        line.setAttribute('y1', y);
        line.setAttribute('x2', Math.max(box.x, Math.min(box.x + box.width, x)));
        line.setAttribute('y2', Math.max(box.y, Math.min(box.y + box.height, y)));
      });
    },
    dispose: () => container.replaceChildren(),
  };
}
