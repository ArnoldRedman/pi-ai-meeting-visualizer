# 场景资源与授权

## 当前选用

| 来源 | 用途 | 官方授权 |
| --- | --- | --- |
| [Kenney Mini Characters](https://kenney.nl/assets/mini-characters) | 四种骨骼人物、待机/交互/步行/坐下/表态动画、共用颜色贴图 | CC0 |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | 会议桌、办公椅、笔记本、屏幕、书柜、书本、沙发、咖啡机、边桌、落地灯、窗墙、地板、绿植 | CC0 |

2026-10-14 核对官网及两份 ZIP 中的 `License.txt`：均允许个人、教育及商业使用，署名不是强制要求。本项目仍在页面底部保留 Kenney 与资源来源链接。

Mini Characters 授权文件标记版本 1.0，Furniture Kit 授权文件标记 2.0（官网展示的版本号不同）；实际使用的下载版本由 `manifest.mjs` 中的 ZIP URL 和 SHA-256 精确固定。

CC0 说明：https://creativecommons.org/publicdomain/zero/1.0/

## 准备与缓存

```sh
npm install
npm run assets:fetch
```

`manifest.mjs` 是当前场景的文件白名单及下载版本来源。`scripts/fetch-assets.mjs`：

1. 优先读取已缓存 ZIP，不存在时下载官方固定 URL（不跟随重定向）
2. 限制压缩包最多 64 MiB，校验 SHA-256
3. 只解压白名单条目，每个条目上限 8 MiB
4. 保留角色 GLB 引用的 `Textures/colormap.png` 相对路径
5. 保留两份原始 `License.txt`

```text
assets/
  manifest.mjs             # 可提交的来源清单，不含模型内容
  README.md
  cache/                  # .gitignore 忽略，也不在 package.json 的发布白名单中
    kenney/
      mini-characters.zip
      furniture-kit.zip
      characters/
        character-female-a.glb
        character-female-b.glb
        character-male-a.glb
        character-male-b.glb
        Textures/colormap.png
        License.txt
      furniture/
        ...当前使用的 13 个 GLB
        License.txt
```

压缩包约 7.2 MB。只向浏览器提供选中的 GLB、贴图和许可文件，不暴露 ZIP、任意磁盘路径或整个 node_modules。模型来自缓存，不通过 CDN；不下载或使用任何第三方模型思维/会话数据。

已有 ZIP 时重复执行准备命令无需联网，会重新生成选定文件。若下载地址变化、校验失败或文件缺失，命令明确报错，不自动接受另一版本。要更新资源，先核对官网许可及文件结构，再更新来源与校验值，不直接手改 GLB。

## 席位与角色的对应

`web/scene-cast.mjs` 按席位模型名里的厂家关键词挑角色：`gpt` / `openai` / `o3` 等用 `character-gpt`，
`opus` / `sonnet` / `haiku` / `fable` 这类没有厂家前缀的档位名归 Claude，`gemini`、`grok`、`deepseek`、`kimi`、`glm`、`qwen` 同理。
模型名写在 `model`、`label` 或席位 id 里都能认；**认不出或没有自制角色的厂家（Mistral 等）按席位顺序轮换四个 Kenney 默认角色**，同一场会议不会重样。
新增自制角色时，把它加进 `manifest.mjs` 的 `customCharacterModels`，再在 `vendorCharacters` 里补上关键词。
浏览器只能按 `server/scene-files.mjs` 的白名单读 `/assets/models/characters/character-<名字>.glb`，
两个入口都以 `manifest.mjs` 为准，不会把 `models/` 目录整个暴露出去。
带内嵌贴图的角色（`gpt`、`deepseek`）需要页面 CSP 的 `connect-src` 允许 `blob:`：
GLTFLoader 把 GLB 里的贴图转成 blob URL 再 fetch，拦掉就只剩白模，放行写在 `server/server.mjs`。

## 本地自制模型

| 模型 | 用途 | 说明 |
| --- | --- | --- |
| `models/characters/character-gemini.glb` | Gemini 席位的角色形象 | 自制，无第三方授权要求 |
| `models/characters/character-gpt.glb` | GPT 席位的角色形象（白龙娘） | 自制；身上的 OpenAI 标志是裙子正面的贴花，贴图已内嵌进 GLB（源图在角色仓库的 `characters/textures/openai.png`） |
| `models/characters/character-grok.glb` | Grok 席位的角色形象（金发吸血鬼贵族） | 自制；右手握全尺寸 X 战斧，武器刚性绑在 arm-right 上 —— 坐姿动画把手臂前摆约 60°，斧头会跟着倒成横向，这是已知代价 |
| `models/characters/character-deepseek.glb` | DeepSeek 席位的角色形象（蓝鲸女仆） | 自制；围裙上的鲸鱼标志用官网图标贴花，贴图已内嵌进 GLB（源图在角色仓库的 `characters/textures/deepseek.png`） |
| `models/characters/character-claude.glb` | Claude 席位的角色形象（橙发大小姐） | 自制，无贴图：花、蝴蝶结、流苏都是几何体 |
| `models/characters/character-kimi.glb` | Kimi 席位的角色形象（银发月光音乐少女） | 自制，无贴图：新月用几段小方块排成弧形 |
| `models/characters/character-glm.glb` | GLM 席位的角色形象（黑发女仆档案管理员） | 自制，无贴图："Z" 徽章、裙面几何花纹和右手的 "GLM Model" 手册都是几何体；手册刚性绑在 arm-right 上，跟着手臂转是已知代价 |
| `models/characters/character-qwen.glb` | Qwen 席位的角色形象（蓝发汉服少女） | 自制，无贴图：标志菱形、蝴蝶结、流苏都是几何体；左手提袋刚性绑在 arm-left 上，跟着手臂转是已知代价 |

这些模型**不复用** Kenney 的网格，但完整复用它的 7 根骨骼和 32 个动作：每个部位刚性绑定到对应骨头，
因此 `sit`／`walk` 等动作、坐姿偏移和教室家具对齐都沿用原校准（实测入座高度需求 0.431，与原值 0.43 相差 1 毫米，无需调整）。

## 建模流程

角色的建模源文件、四视角预览图和参考图都在单独的角色仓库 **`pi-meeting-chibis`**（`characters/` 放 GLB、`<名字>-work.blend`、贴图源图，`参考图/` 放参考图）。
本仓库只提交运行时要读的 `character-*.glb`，**预览图、参考图和 `.blend` 中间文件都不放这里**；插件自己的运行效果截图在 [`screenshots/`](screenshots/)，由根 README 引用。

```sh
# 改外形：编辑 tools/characters/<名字>.py（几何库 chibi.py），然后重建 → assets/models/characters/character-<名字>.glb
blender -b --factory-startup -P tools/characters/build_character.py -- gpt

# 出四视角预览图（脚本尾部用 ffmpeg 拼 4v.png，需要 PATH 里有 ffmpeg）
blender -b --factory-startup -P tools/characters/preview.py -- \
  assets/models/characters/character-gpt.glb <角色仓库>/characters/preview/gpt BLENDER_EEVEE 720

# 想边改边看：在 Blender GUI 里打开 <角色仓库>/characters/<名字>-work.blend，
# 用 MCP 跑 tools/characters/live_rebuild.py 重建，再用 export_live.py 导出
```

`tools/characters/` 下的脚本都按 `-- <名字>` 识别角色，可以直接复制一份 `<名字>.py` 做新角色；
重建命令除 GLB 外还会在本仓库生成 `<名字>-work.blend`，那个是开 GUI 调形的中间文件，改完必须靠重建命令覆盖（否则会和 `<名字>.py` 不一致），生成后归到角色仓库、不要提交。
重建 `gpt`／`deepseek` 前，先把角色仓库的 `characters/textures/*.png` 拷到 `assets/models/characters/textures/`（这两个标志源图也不提交到本仓库，运行时用的是内嵌在 GLB 里的那份）。

`openai.png` 是带透明通道的官方标志线稿，作为贴图贴在裙子正面（`chibi.plane` 生成面片，
调色板里写图片路径就是贴图材质），不是在几何体上用方块拼形状；
`deepseek.png` 是同一机制的官网鲸鱼标志（裁到外框、留成正方、透明像素填成品牌蓝，避免缩放时边缘渗暗），贴在围裙正面。

自制角色的总高（含饰物）都落在 0.78～0.82 之间（gemini 0.7995 / gpt 0.8176 / deepseek 0.808 / claude 0.7848 / kimi 0.8026 / glm 0.7810）：
场景按高度等比缩放到 1.35 米，做新角色时把总高留在这个区间，同场角色的体型才一致。

## 拼装约束

- Three.js 中用包装节点居中、缩放家具和人物，不重写原始资源
- 骨骼人物使用 SkeletonUtils 独立克隆，多个席位不会共用同一套活动骨骼
- 工作时人物在电脑前；提前完成后沿固定椅后过道散步，全员完成后回椅子并使用官方 sit 动画朝向屏幕
- 基于原始坐姿骨骼高度校准座位偏移，不修改原始模型；尚未实现通用 IK、碰撞寻路和走入/离场
- 电脑方向与对应人物工作方向相反，键盘和屏幕朝向使用者
- 原始骨骼动画用于公开状态表现，并不表示模型真实思维过程
- 工作中为交互动作与暖色光环，提前完成为步行/待机与绿色光环，失败为摇头与红色光环；全员到位后切换坐姿和总结屏幕
- 原始模型材质尽量保留，房间尺寸、地毯、背墙和灯光为程序化场景布置
- 当前是视觉原型，不是 Kenney 官方产品或合作项目
