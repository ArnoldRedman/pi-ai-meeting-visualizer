export function demoEvents(sessionId) {
  const seats = [
    // 仅作演示名称，不代表正在调用这些模型
    { id: 'analyst', label: '方案分析', model: 'Claude Sonnet' }, { id: 'reviewer', label: '风险审阅', model: 'GPT' },
    { id: 'builder', label: '实现评估', model: 'Gemini' }, { id: 'observer', label: '用户视角', model: 'Grok' },
  ];
  const event = (type, data = {}) => ({ type, sessionId, ...data });
  const events = [event('meeting_started', { tag: '先验证事件闭环，还是先搭建 3D 场景？', seats })];
  // 演示内容写成接近真实的一段发言：seat_progress 是公开的进度摘要，seat_finished.message 是
  // 这个席位自己的结论正文，可视化会把它们全文展示在席位档案和会议总结里
  const rounds = [
    {
      analyst: {
        progress: [
          '两条路径的验证成本不对称：事件闭环只要一个本地服务加一次增量轮询，3D 场景要先定资源、再谈表现',
          '把事件当成唯一接口：只要事件是对的，上面换占位角色还是换 3D 都不影响正确性',
        ],
        stance: 'A · 先验证事件闭环',
        message: '先做事件闭环。事件的正确性是插件的唯一硬约束，3D 只是它的表现层：闭环跑通之后场景怎么重做都不白费，反过来先做场景有可能整段返工。',
      },
      reviewer: {
        progress: [
          '风险都堆在接入方式上：本地服务要绑 127.0.0.1、单次事件要有体积上限、断线后要能按游标补齐',
          '这三条不先跑起来，接真模型的时候大概率要改协议',
        ],
        stance: 'A · 先验证事件闭环',
        message: '同意先做闭环，但要补三条边界：服务只监听本机地址、单次请求体限 16 KiB、重连按游标增量补齐。边界落地之后再接真模型，协议不用动。',
      },
      builder: {
        progress: [
          '估工：本地服务加事件轮询大约半天；3D 场景要挑资源、拼房间、调走路动画，两天起步',
          '而且人物行为还得按会议阶段再设计一轮',
        ],
        stance: 'A · 先验证事件闭环',
        message: '按工作量排也是先做闭环：半天就能拿到可验证的事件流，场景那两天放在闭环稳定之后并行做，返工面更小。',
      },
      observer: {
        progress: ['用户第一次打开看到的是界面，不是协议文档；画面空着，事件再正确也留不住人'],
        stance: 'B · 优先场景体验',
        message: '我倾向先给一个能看的场景：可视化插件的卖点就是看得见，协议对不对用户看不出来，但首页空着会直接劝退。',
      },
    },
    {
      analyst: {
        progress: ['复核第一轮的判断：协议要是第二周才改，场景里的人物行为也得跟着改，返工成本正好落在最贵的那部分'],
        stance: 'A · 先验证事件闭环',
        message: '维持 A。补一句：先把事件协议冻结成 v0 再动手做场景，改动面才可控。',
      },
      reviewer: {
        progress: ['按用户视角的顾虑复核了一遍：首页不一定要靠 3D 撑住，静态房间加文字状态就能先让人看明白'],
        stance: 'A · 先验证事件闭环',
        message: '维持 A。用户视角的诉求可以用最小的静态场景满足，不必提前做 3D。',
      },
      builder: {
        progress: ['重新拆了一遍：闭环之外加一个静态房间大约半天，能和协议验证并行'],
        stance: 'A · 先验证事件闭环',
        message: '维持 A，并把「首页不空」拆成半天的最小静态场景，和协议验证并行推进。',
      },
      observer: {
        progress: [
          '被说服了一半：如果协议要改，场景里的人物行为也得跟着改，先做场景等于把风险押在最贵的地方',
          '但首页还是不能空着，至少给一个静态房间',
        ],
        stance: 'A · 先验证事件闭环',
        message: '接受先做闭环，条件是同时给一个最小的静态场景：首页不空，协议改动也不用重做人物行为。',
      },
    },
  ];
  // 最后一个席位故意干得慢：其他人提前收工后才有时间离开工位去摸鱼
  const overtime = [
    '再核对一次回放顺序：断线重连之后不能出现重复事件',
    '复核三条边界条件的表述，别和协议文档冲突',
    '检查超长消息在气泡里的截断位置，别把结论截掉',
    '确认失败席位不会残留工作动画',
    '比对两轮的立场变化，第二次的理由要和第一次呼应',
    '确认大屏幕只在全员回座之后才出总结',
    '检查事件只保留最近 80 条时，结论会不会被一起截掉',
    '整理最终结论里的用词',
  ];
  for (const [index, script] of rounds.entries()) {
    const round = index + 1;
    events.push(event('round_started', { round }));
    for (const seat of seats) events.push(event('seat_started', { seat: seat.id, round }));
    for (const seat of seats) {
      for (const message of script[seat.id].progress) events.push(event('seat_progress', { seat: seat.id, round, message }));
      events.push(event('stance_changed', { seat: seat.id, round, stance: script[seat.id].stance }));
      if (seat.id === seats.at(-1).id) {
        for (const message of overtime) events.push(event('seat_progress', { seat: seat.id, round, message }));
      }
      events.push(event('seat_finished', { seat: seat.id, round, status: 'ok', message: script[seat.id].message }));
    }
  }
  events.push(event('meeting_finished', {
    winner: 'A · 先验证事件闭环',
    summary: '四个席位达成一致：先跑通本地服务与增量轮询，把事件的正确性锁死，再并行搭 3D 场景。用户视角保住了「首页不能空着」的条件，落成半天的最小静态场景。',
  }));
  return events;
}
