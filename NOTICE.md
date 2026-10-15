# 声明 / NOTICE

本仓库（可视化插件源码、文档与随附的角色模型）由 **ArnoldRedman** 创作，采用
[CC BY-NC-SA 4.0](LICENSE)（署名 — 非商业性使用 — 相同方式共享）：

- 允许自由使用、复制、修改和再分发，包括用于开源项目和个人项目
- **禁止任何商业性使用**；商业使用必须事先取得作者单独授权
  （邮件 2876246519@qq.com，或在 GitHub 上联系 [@ArnoldRedman](https://github.com/ArnoldRedman)）
- 分发（含修改后分发）时必须保留署名 ArnoldRedman、本声明与 [LICENSE](LICENSE)
- 修改后的作品必须以同一许可证（CC BY-NC-SA 4.0）发布

`LICENSE` 是 Creative Commons 官方许可证法律文本，未作任何修改
（来源：https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.txt）。

角色模型的建模源文件、四视角预览图和参考图在单独仓库
[pi-meeting-chibis](https://github.com/ArnoldRedman/pi-meeting-chibis)，用同一个许可证；
本仓库只随包发布运行时要读的 `assets/models/characters/character-*.glb`。

## 不在本许可证覆盖范围内的内容

- 品牌标志（OpenAI / DeepSeek / X / Gemini / Claude / Kimi / Qwen / GLM 等）归各自所有者；
  GPT 与 DeepSeek 角色身上的标志贴花只是粉丝向引用，本项目是非官方作品，
  与上述公司无隶属关系，也不代表其立场
- 骨架与 32 个动作来自 [Kenney Mini Characters](https://kenney.nl/assets/mini-characters)（CC0），
  家具来自 [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)（CC0）；
  两者按 [assets/README.md](assets/README.md) 记录的方式从官网下载并校验，不随仓库提交
- 运行依赖 Three.js（MIT）与 fflate（MIT），以及本地 Node 标准库；
  Pi 的扩展 API 来自 `@earendil-works/pi-coding-agent`
- 会议事件来自 [pi-ai-meeting](https://github.com/ArnoldRedman/pi-ai-meeting)，
  本插件只消费它公开的事件，不读取模型内部调用细节
