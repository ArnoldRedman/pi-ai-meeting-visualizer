# 本地服务

HTTP 服务使用 Node.js 22+ 标准库。3D 浏览器视图使用 Three.js，资源准备命令使用 fflate。

```sh
npm install
npm run assets:fetch
npm start
```

入口 `server/dev-server.mjs` 始终绑定 `127.0.0.1`，默认端口 `34721`。`PORT` 仅允许 1–65535 的整数。端口被占用时退出并报告错误，不扫描或自动使用其他端口。

## 生命周期与文件分工

- `server.mjs`：HTTP 路由、请求安全边界、模拟事件定时发送
- `session-store.mjs`：输入校验、session 隔离、序号和内存存储
- `demo.mjs`：确定性的两轮模拟会议事件
- `../web/state.mjs`：服务与浏览器共用的状态转换
- `scene-files.mjs`：3D 模块/模型白名单，以及本地 import map 的 CSP 哈希
- `../assets/manifest.mjs`：固定的 Kenney 来源与所需文件列表
- 一个进程可以承载多个会议；会议结束后保留全部已接收事件
- 用户通过 Ctrl+C 停止服务，同时清理模拟定时器与 HTTP 连接
- 不写磁盘，不自动回收 session，不提供远程停止接口

## API

所有 JSON 响应禁用缓存。写入请求使用 `Content-Type: application/json`，请求体最大 16 KiB。session/seat ID 为 1–64 个 ASCII 字母、数字、`_` 或 `-`，首位必须是字母或数字。

### `GET /health`

```json
{"status":"ok","sessions":1}
```

### `POST /api/demo`

请求体为 `{}`，启动四席位两轮讨论，约 25 秒后自然收尾。每次请求生成新 session，服务无需重启。

```json
{"sessionId":"demo-<UUID>","url":"/meeting/demo-<UUID>"}
```

返回 `201`。建议从网页按钮启动，也可使用 PowerShell：

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:34721/api/demo -ContentType application/json -Body '{}'
```

### `POST /api/sessions/:id/events`

一次追加一个事件。不存在的 session 只能由 `meeting_started` 创建。

```json
{"type":"meeting_started","sessionId":"sample","tag":"方案评审","seats":[{"id":"analyst","label":"方案分析"}]}
```

返回 `201`，`event` 是已保存事件，附带服务分配的 `seq`（session 内从 1 递增）和 `at`（UTC ISO 接收时间）。

- 事件的 `sessionId` 必须与路径一致
- 输入按 [事件协议](../protocol/meeting-events.md) 校验
- 未知类型拒绝；未知字段忽略；客户端不能指定保存后的 `seq` 或 `at`
- 已完成/失败的 session 不接受新事件或重复开始
- 该接口不保证幂等，不要在结果未知时盲目重试写入

### `GET /api/sessions`

```json
{"sessions":[{"id":"sample","tag":"方案评审","status":"running","round":1,"eventCount":3}]}
```

### `GET /api/sessions/:id`

返回上述单个会议摘要对象，未知 session 返回 `404`。`status` 为 `running`、`finished` 或 `failed`。

### `GET /api/sessions/:id/events?after=0`

`after` 为已消费的最后一个事件序号，默认 `0` 表示全量读取。返回按序号排列的 JSON 数组，而非 JSONL 文件。

```json
{
  "sessionId":"sample",
  "status":"running",
  "events":[
    {"type":"meeting_started","sessionId":"sample","tag":"方案评审","seats":[{"id":"analyst","label":"方案分析"}],"seq":1,"at":"2026-10-14T00:00:00.000Z"}
  ],
  "nextCursor":1
}
```

客户端下次传 `after=nextCursor`，没有新事件时返回空数组且游标不变。未知 session 返回 `404`；无效游标返回 `400`，超过当前事件数返回 `409`，此时从 `0` 重建状态。

`GET /api/sessions/:id/stream` 尚未实现，返回 `404`；第一版使用增量轮询，不提供 SSE/WebSocket。

### 页面

- `GET /`：入口和会议列表
- `GET /meeting/:id`：指定会议；不存在时页面显示错误而非创建会议
- 静态资源使用显式白名单，不暴露仓库文件或任意磁盘路径
- `/vendor/three/*` 只提供场景实际依赖的五个模块，不开放整个 node_modules
- `/assets/kenney/*` 仅提供资源清单中的 GLB、贴图和许可文件，缺失时返回 `404`
- 页面 import map 仅解析本地模块；CSP 使用其精确 SHA-256，不开启 `unsafe-inline` 或 `unsafe-eval`
- 资源准备失败不影响 session API；浏览器降级显示原有文字和占位角色

## 安全和容量边界

- Host 必须与实际 `127.0.0.1:端口` 一致，不接受 `localhost` 或其他域名别名
- Origin 如存在，必须与服务同源；拒绝跨站子资源请求，不返回 CORS 许可
- 使用 JSON 请求体、CSP 和 `textContent`，避免跨站写入和事件摘要 HTML 注入
- 本机 CLI 可无 Origin 调用；这不是本机进程身份鉴权，不应部署为多用户服务
- 最多 64 个 session、每场 1,000 个事件、合计 10,000 个事件；达到上限返回 `409`，拒绝写入，不丢弃已存数据
- 请求过大返回 `413`，非 JSON 媒体类型返回 `415`，非法事件返回 `400`，状态冲突返回 `409`
- 错误响应统一为 `{"error":"中文错误说明"}`，内部堆栈仅写服务终端

容量上限用于防止原型无限增长，不是生产负载指标。重启释放内存会丢失所有会议；未来接入真实会议后再设计持久化、回收与事件投递幂等性。

## 验证

```sh
npm test
```

测试使用临时回环端口，覆盖：health/页面、增量读取与重放、多 session 隔离、两轮状态和失败收尾、字段与生命周期校验、容量限制、跨站/Host 拒绝及超大请求，以及资源校验/解压白名单、import map、1–16 席位布局与动画映射。测试无需 Pi、模型资源下载或外部网络；请先安装 npm 依赖。
