# 会议事件协议 v0

视觉插件只消费公开的会议生命周期和席位状态，不消费未经整理的模型思维过程。

核心事件流计划按 JSONL 传输，每行一个 JSON 对象。第一阶段尚未接入核心事件流：视觉服务使用 HTTP JSON 适配，一次 POST 一个事件，GET 返回带游标的 JSON 数组，不直接接收 JSONL 文件。字段暂时保持小而稳定，后续扩展字段时保持向后兼容。

## 事件类型

- `meeting_started`：创建会议场景和席位
- `round_started`：开始第一轮或第二轮
- `seat_started`：某个席位开始工作
- `seat_progress`：显示一条公开进度摘要
- `seat_finished`：某个席位完成或失败
- `stance_changed`：席位修改了公开立场
- `meeting_finished`：会议完成，包含最终票型或结论摘要
- `meeting_failed`：会议异常结束

## 示例

```json
{"type":"meeting_started","sessionId":"abc123","tag":"方案评审","seats":[{"id":"opus","label":"方案审阅","model":"Claude Opus"},{"id":"grok","label":"风险分析","model":"Grok"}]}
{"type":"round_started","sessionId":"abc123","round":1}
{"type":"seat_started","sessionId":"abc123","seat":"opus","round":1}
{"type":"seat_progress","sessionId":"abc123","seat":"opus","message":"正在比较方案风险"}
{"type":"seat_finished","sessionId":"abc123","seat":"opus","round":1,"status":"ok"}
{"type":"meeting_finished","sessionId":"abc123","winner":"A","summary":"多数席位选择保留现有机制"}
```

## 第一阶段 HTTP 字段约定

所有事件必填 `type` 和 `sessionId`。sessionId 必须与 URL 中的 ID 一致；sessionId 和席位 ID 均为 1–64 个 ASCII 字母、数字、`_` 或 `-`，首位必须为字母或数字。

`seat_progress.message` 是这个席位对外可见的进度摘要，`seat_finished.message` 是它本轮自己的结论正文；两者都会被可视化**全文**展示（席位档案、会议总结），所以不要把内部思维链或无关日志拼进来 —— 写它自己愿意公开的那段话。

| 类型 | 其他必填字段 | 可选字段 |
| --- | --- | --- |
| `meeting_started` | `tag`（1–200 字符）、`seats`（1–16 个 `{id,label}`，id 不重复，label 1–80 字符） | `seats[].model`（1–80 字符，模型显示名；缺省时显示 label） |
| `round_started` | `round`（正整数） | 无 |
| `seat_started` | `seat`、`round` | 无 |
| `seat_progress` | `seat`、`message`（1–2000 字符） | `round` |
| `seat_finished` | `seat`、`round`、`status`（`ok` 或 `error`） | `message`（1–2000 字符） |
| `stance_changed` | `seat`、`stance`（1–200 字符，公开立场摘要） | `round` |
| `meeting_finished` | `summary`（1–2000 字符） | `winner`（1–200 字符） |
| `meeting_failed` | `message`（1–2000 字符） | 无 |

文本不能是纯空白。未知字段忽略，未知事件类型拒绝。服务附加 `seq`（从 1 起的 session 内接收顺序）和 `at`（UTC ISO 接收时间），客户端不指定这两个字段。

### 顺序与收尾

1. `meeting_started` 唯一创建 session，后续重复开始返回 `409`
2. 席位事件必须在 `round_started` 后发送；引用的席位必须已注册
3. 新轮次大于当前轮次，且上一轮没有工作中的席位；新轮次重置工作状态但保留公开立场
4. `seat_started` 将等待中的席位变为工作中；`seat_progress`/`seat_finished` 仅接受工作中的席位
5. 席位事件若提供 `round`，必须与当前轮次一致；`stance_changed` 也允许在席位已完成后更新公开立场
6. `meeting_finished` 和 `meeting_failed` 均为终态，允许提前收尾；未完成的席位显示“已停止”，不伪造成功
7. 终态拒绝任何追加，页面停止该会议的事件轮询，保留结论和最终画面；服务继续运行

当前没有事件去重、乱序缓冲或真实核心桥接。发送方负责按 session 顺序投递；HTTP 超时后应先查询已收事件，不能无条件重试 POST。核心项目尚不受本原型字段约束影响，接入时需再核对其实际公开事件形状。

HTTP 接口与错误码见 [本地服务说明](../server/README.md)。

## 视觉行为（不改变模型执行顺序）

- 人物名牌优先显示 `model`，`label` 继续表示席位职责，兼容旧事件
- 人物旁的进度框使用 `seat_progress.message` 或 `seat_finished.message`，不伪造百分比和内部思维过程
- 本轮提前 `ok` 完成的席位在椅后过道活动；失败席位不散步
- 全员完成、会议结束或失败时统一回座，下一轮开始则取消散步并回电脑前
- 大屏幕须等全部人物到位并转向后才展示总结；提前到达的 `meeting_finished` 会先保留，返回动画不会阻塞 API、模型工作或下方的完整文字结论
- 减少动态效果开启时直接安置人物，不要求等待走路动画（也不做镜头惯性）
- 点击人物或席位卡片可以聚焦到一个席位：镜头跟看他移动，面板按轮次展示他公开的进度与结论，不展示模型内部思维过程；视角本身可自由旋转缩放，可由按钮重置
- 鼠标悬停人物会高亮气泡并显示手型光标；最近推送事件的席位在场景里圆环呼吸更快，墙上大屏幕同步显示轮次、本轮完成人数和最近一条进度
- 演示中的模型名称仅是模拟标签，不代表正在调用这些模型

