# 来源与致谢

## 设计参照

本插件的记忆分层模型参考了 **dsh-memory-evolve**（DeepSeek Harness 插件的长期记忆实现）。

| 项目 | 信息 |
|---|---|
| 项目 | dsh-memory-evolve |
| 作者 | csyangwen |
| 仓库 | https://github.com/csyangwen/dsh-memory-evolve |
| 许可 | MIT |
| 版权声明 | Copyright (c) 2026 dsh-external |

### 具体参照的内容

以下**设计思路**来自该项目，本插件针对 Antigravity 的插件模型重新实现：

- **分层记忆轨道**：将记忆拆分为全局、用户、项目、长期关键、每日五个层级，而非单一文件
- **每轮注入策略**：会话启动时注入分层摘要，而非全量加载
- **关键记忆的确认机制**：长期生效的条目需经提案与确认两步，避免模型自主写入占用每轮 token
- **归档而非删除**：删除操作保留原文至 `archive/`，支持恢复
- **收尾写入单条**：一轮对话结束时写入一条具体记录，而非批量倾倒

### 本插件独立实现的部分

- **代码全部重写**：本插件为 Node.js 标准库实现，未复制该项目的任何源代码。该项目基于 Cordis 插件框架，与本插件无代码共用。
- **Antigravity 适配层**：hook 契约（`SessionStart` / `PreInvocation` 的 stdin/stdout JSON 协议）、MCP stdio 服务、`plugin.json` 与 `hooks.json` 的生成逻辑，均为针对 Antigravity 自行实现。
- **安装脚本**：解决 Antigravity 在 Windows 下的路径引号限制，为本插件独有。
- **工具集精简**：该插件包含技能管理、待办、CLI 调度等模块，本插件仅保留记忆相关能力，共 11 个工具。

### 未沿用的部分

- GIT 分支级记忆轨道
- 自我进化与技能自动创建
- 待办管理
- 外部 CLI 代理调度
- WebUI 管理界面

## 第三方依赖

无。本插件仅使用 Node.js 标准库（`fs`、`path`、`os`、`crypto`），不依赖任何 npm 包。

## 许可

本插件以 MIT 许可发布，见 [LICENSE](../LICENSE)。

MIT 许可要求保留原版权声明。本项目对其参照的上游项目（MIT 许可）的作者与版权方予以致谢，声明如上。
