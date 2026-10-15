# 我给多模型会议做了间 3D 会议室：8 个厂家模型都做成了娘化 chibi

> 发帖目标：烧饼社区（linux.sb）→ **技术交流** 板块（不是「我要推广」，那里不上首页）
> 配图：正文用仓库 raw 外链；论坛不让外链就把 `assets/screenshots/` 里的同名文件上传后替换
> 说明：这篇文章的主角是**这个可视化插件 + 8 个娘化 chibi 角色**，开会插件只是背景

---

## 我给多模型会议做了间 3D 会议室：8 个厂家模型都做成了娘化 chibi

先说清楚我做了什么，免得你看到一半才发现：**两个都是我写的开源项目**。

一个是我平时用来开会的 [pi-ai-meeting](https://github.com/ArnoldRedman/pi-ai-meeting)：让几个模型（Claude、GPT、Gemini…）同时回答同一个问题，第二轮匿名互相质询，最后投票定案。它很好用，但**整个开会过程在屏幕上只有文字**：谁在写、谁改了口、谁还在拖——全靠读。

另一个就是这篇的主角 `pi-ai-meeting-visualizer`：**给开会这件事做的可视化**。它把会议放进一间本地 3D 会议室——每个席位是桌边一个小人，谁在干活、谁先交卷、谁溜达去了，一眼看得见。做它的理由很单纯：**开会本来挺严肃的事，我想让它好玩一点**。

### 8 个厂家，8 个 chibi 娘化角色

短视频平台上各家模型早就有一堆娘化形象了。我照那种气质，把它们统一重做成了 chibi 风格的小方块人——一共 8 个厂家，每个都带自家的元素：

| 角色 | 设计 |
| --- | --- |
| GPT | 白龙娘，裙子正面是 OpenAI 标志贴花 |
| Claude | 橙发大小姐，花、蝴蝶结、流苏都是几何体 |
| Gemini | 紫双马尾，星星发饰、紫裙白围裙 |
| Grok | 金发吸血鬼贵族，右手提一把全尺寸 X 战斧 |
| DeepSeek | 蓝鲸女仆，围裙上是官网鲸鱼标志 |
| Kimi | 银发月光音乐少女，头饰是新月 + K |
| GLM | 黑发女仆档案管理员，徽章「Z」+ 右手一本 "GLM Model" 手册 |
| Qwen | 蓝发汉服少女，标志菱形、蝴蝶结、流苏，左手提袋 |

![8 个厂家角色：上排 GPT / Claude / Gemini / Grok，下排 DeepSeek / Kimi / GLM / Qwen](https://raw.githubusercontent.com/ArnoldRedman/pi-ai-meeting-visualizer/main/assets/screenshots/character-lineup.png)

插件按席位模型名里的厂家关键词自动挑角色：`gpt-5.6`、`claude-opus-4-1`、`kimi-k2` 各自对应。碰到还没做角色的厂家（比如 Mistral）就用默认小人顶替——会议照开，不会因为缺角色中断。

![认不出的厂家（Mistral Large）用默认角色顶替](https://raw.githubusercontent.com/ArnoldRedman/pi-ai-meeting-visualizer/main/assets/screenshots/character-fallback.png)

嘴上一句"8 个 chibi"，背后是这些东西：**全部由 Blender Python 脚本程序化生成**，几何、配色、贴花、徽章没有一个是手工摆的；骨架和 32 个动作复用 [Kenney Mini Characters](https://kenney.nl/assets/mini-characters)（CC0）的 7 根骨头，所以坐下、走路、摸鱼、表态这些动作是白拿的；单个模型 0.5–1 MB，贴图内嵌，丢进 Three.js 就能动。每个角色都有 9 张四视角预览图。

### 房间里会发生什么

这是我觉得最值的部分——它真的像一群人在上班：

- 会议开始，各自走到座位坐下开工；
- 干活的留在电脑前，气泡写它公开出来的进度；
- **提前交卷的会离开桌子去溜达**：看窗外、翻书柜、浇绿植、窝在沙发上等人；
- 全员完成后回到座位，一起转向墙上的大屏幕，那上面写这一轮到哪了、最终结论是什么；
- 点某个人，镜头拉近，看它的公开档案：职责、立场变化、按轮次记录的结论。

![一个人还在干活，另外三个已经交卷离桌去溜达了](https://raw.githubusercontent.com/ArnoldRedman/pi-ai-meeting-visualizer/main/assets/screenshots/mixed-state.png)

![点开一个席位：公开档案、立场变化和本轮结论](https://raw.githubusercontent.com/ArnoldRedman/pi-ai-meeting-visualizer/main/assets/screenshots/seat-focus.png)

### 怎么用上

需要 Node 22+ 和一个 Pi（跑在终端里的 coding agent）。开会插件和可视化插件是两个独立仓库，装可视化插件不会动到开会那边：

```sh
pi install git:github.com/ArnoldRedman/pi-ai-meeting-visualizer
# 装完重开一个 Pi 会话（或 /reload）让扩展生效，然后：
# /meeting open
```

`/meeting open` 起本地服务并打开页面，点页面上的「开始模拟会议」就能看一场内置演示——不调用模型，半分钟看完一轮，先确认画面正常。真正开会时装上 pi-ai-meeting，房间会在开会那一秒自己出现，Pi 里给你一条门牌链接。

### 两句实话

- **它看不到模型的思考过程**，这是设计不是缺陷：插件只接收会议脚本愿意公开的事件（进度、立场）。所以你会看到「它改口了」，看不到「它为什么改口」。
- 全程本地：服务只绑 `127.0.0.1`，数据只在内存，Pi 一退服务就停。

小毛病也有：Grok 的斧子、Qwen 的提袋是刚性绑在单根手臂骨上的，手臂前摆时会跟着转（斧子会歪成横向）；没有表情骨骼，情绪只能靠动作。这些我没打算藏。

### 许可

CC BY-NC-SA 4.0：个人使用、修改、分享都可以，**商业使用不行**，需要署名并以同样许可分享。**8 个角色模型单独放在 [pi-meeting-chibis](https://github.com/ArnoldRedman/pi-meeting-chibis)**，同一个许可——你要拿它们去做别的 Three.js / Blender 场景也行，不必连会议一起用。

### 最后

不装 Pi 的话，这篇文章对你就是几张图，这是我得承认的门槛。但它想解决的事很简单：让一组模型开会这件事，从"等八分钟、拿到四段结论"变成一段你能看着发生的过程——顺便，让那几个每天帮你干活的模型，有几个小人样子。

---

## 备选标题

1. **我给多模型会议做了间 3D 会议室：8 个厂家模型都做成了娘化 chibi**（正稿：角色和趣味都进标题）
2. GPT、Claude、Gemini、Kimi 坐一桌开会：我照着娘化形象做了 8 个 chibi 角色（角色在前，覆盖不到"会议室"这个载体）
3. 开会太无聊，我给它做了 8 个娘化 chibi 和一间 3D 会议室（最口语，适合「我要推广」那种语感）

## 发布前检查清单

- [ ] 全文重心是**可视化插件 + 8 个娘化 chibi**；pi-ai-meeting 只出现在开头一段的背景交代里，别展开讲它怎么开会
- [ ] 角色那一节要够具体（每个角色一句设计），这是本文最容易被转发的地方
- [ ] 图：`character-lineup.png`（首图区）、`mixed-state.png`（趣味点）、`seat-focus.png`、`character-fallback.png`；**不要用 `auto-follow.png`**（席位名截断、气泡里有未渲染的 `**`）
- [ ] 全文 1 个代码块、0 个命令表 / config 表 / API 表
- [ ] 不写「求 star」，链接不超过 4 个（两个仓库 + Kenney）
- [ ] 发「技术交流」，不发「我要推广」（后者不上首页）
