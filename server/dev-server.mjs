import { createMeetingServer } from './server.mjs';

const port = Number(process.env.PORT ?? 34721);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('启动失败：PORT 必须为 1–65535 的整数');
  process.exitCode = 1;
} else {
  const server = createMeetingServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `启动失败：127.0.0.1:${port} 已被占用，请停止已有服务或设置其他 PORT`
      : `启动本地服务失败：${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`AI 会议室：http://127.0.0.1:${port}/`);
    console.log('在浏览器点击“开始模拟会议”。会议结束后页面保留，按 Ctrl+C 停止服务。');
  });
  const stop = () => {
    console.log('\n正在停止本地会议服务，内存会议将被清空');
    server.close();
    server.closeAllConnections();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  // 由 Pi 扩展拉起时会把父进程 pid 传进来：父进程被强杀（Ctrl+C、关窗口、崩溃）时没有人来得及收这个子进程，
  // 所以自己看着父进程，它没了就退出，不留下占着端口的孤儿。手动 `npm start` 没有这个环境变量，也就不会自退。
  // shortcut: 只看父进程 pid，pid 被系统回收复用时会漏一次（概率极低），漏了也只是留个孤儿服务
  const parentPid = Number(process.env.PARENT_PID);
  if (Number.isInteger(parentPid) && parentPid > 0) {
    const alive = pid => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return error.code !== 'ESRCH';
      }
    };
    const watchdog = setInterval(() => {
      if (alive(parentPid)) return;
      stop();
      process.exit(0);
    }, 5000);
    watchdog.unref();
  }
}
