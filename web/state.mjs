export const initialMeeting = () => ({
  sessionId: null, tag: '等待会议', status: 'waiting', round: 0,
  seats: [], winner: '', summary: '', error: '',
});

// 聚焦面板要展示一个人的思考过程：按席位累积公开事件，只保留最近 40 条
export const seatLogLimit = 40;

function seatLogEntry(event) {
  switch (event.type) {
    case 'seat_started': return { round: event.round, text: '开始本轮工作' };
    case 'seat_progress': return { round: event.round, text: event.message };
    case 'stance_changed': return { round: event.round, text: `更新立场：${event.stance}`, stance: true };
    case 'seat_finished':
      return { round: event.round, text: event.status === 'ok' ? '本轮工作完成' : `本轮失败：${event.message || '未提供原因'}` };
    default: return null;
  }
}

export function recordSeatEvent(log, event) {
  const entry = seatLogEntry(event);
  if (!entry) return log;
  const list = log.get(event.seat) ?? [];
  list.push(entry);
  if (list.length > seatLogLimit) list.splice(0, list.length - seatLogLimit);
  log.set(event.seat, list);
  return log;
}

// 服务端与浏览器共用状态转换，刷新时按事件顺序重建同一画面
export function reduceMeeting(state, event) {
  switch (event.type) {
    case 'meeting_started':
      return {
        ...initialMeeting(), sessionId: event.sessionId, tag: event.tag, status: 'running',
        seats: event.seats.map(seat => ({ ...seat, status: 'waiting', message: '等待本轮开始', stance: '' })),
      };
    case 'round_started':
      return {
        ...state, round: event.round,
        seats: state.seats.map(seat => ({ ...seat, status: 'waiting', message: '等待开始工作' })),
      };
    case 'seat_started':
    case 'seat_progress':
    case 'seat_finished':
    case 'stance_changed':
      return {
        ...state,
        seats: state.seats.map(seat => {
          if (seat.id !== event.seat) return seat;
          if (event.type === 'seat_started') return { ...seat, status: 'working', message: '正在整理观点' };
          if (event.type === 'seat_progress') return { ...seat, message: event.message };
          if (event.type === 'stance_changed') return { ...seat, stance: event.stance };
          return {
            ...seat, status: event.status === 'ok' ? 'done' : 'failed',
            message: event.message || (event.status === 'ok' ? '本轮工作完成' : '本轮工作失败'),
          };
        }),
      };
    case 'meeting_finished':
    case 'meeting_failed':
      return {
        ...state, status: event.type === 'meeting_finished' ? 'finished' : 'failed',
        winner: event.winner || '', summary: event.summary || '', error: event.message || '',
        // 异常或提前收尾时不再显示仍在工作的角色，也不伪造席位成功
        seats: state.seats.map(seat => ['waiting', 'working'].includes(seat.status)
          ? { ...seat, status: 'stopped', message: '会议已结束，停止工作' } : seat),
      };
    default:
      return state;
  }
}
