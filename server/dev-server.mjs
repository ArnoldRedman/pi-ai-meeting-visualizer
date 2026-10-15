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
}
