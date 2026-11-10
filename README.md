# agy-memory

面向 Google Antigravity 的跨会话长期记忆插件。

> [English](README.en.md) · 中文

---

## 概述

Antigravity 的每个新会话都从空白上下文开始，此前对话中确立的约定、结论与经验不会保留。本插件在会话启动时将记忆注入上下文，使模型能够在开始推理前获得与当前项目相关的历史信息。

数据完全存储于本地，无外部网络请求，无需 API 密钥，无额外费用。

## 工作原理

```
                ┌──────────────────────────┐
   SessionStart │  全局 + 用户 + 项目关键   │ ──► 注入 system message
      hook      │        + 当日记录        │
                └──────────────────────────┘
                             ▲
                             │ memory_add
                             │
                ~/.antigravity-memory/
                  ├── MEMORY.md              全局事实
                  ├── USER.md                用户偏好
                  ├── projects/<slug>.md     项目日志
                  ├── projects/<slug>.key.md 项目关键记忆（每轮注入）
                  ├── daily/YYYY-MM-DD.md    每日记录
                  ├── archive/               已删除条目的归档
                  └── suggestions.jsonl      待确认的提案队列
```

会话启动时，`SessionStart` hook 汇总四个来源（全局事实、用户偏好、项目关键记忆、当日记录）并注入上下文。记忆内容发生变化后，`PreInvocation` hook 按内容哈希判断是否需要补充注入，避免重复占用 token。

## 设计约束

本插件围绕四条约束构建，每一条都对应明确的实现选择。

**一、不产生额外调用成本**
不引入独立 API 密钥，不调用额外的抽取或摘要模型。记忆由当前对话中的模型通过一次工具调用写入，不产生额外的模型请求。

**二、无网络通信**
记忆存储于本地 `~/.antigravity-memory/`，无任何出站请求，无需注册账号，无服务端参与。

**三、以 Markdown 为存储格式**
便于阅读、版本控制、手工编辑与纳入既有备份流程。插件停止使用或出现故障时，记忆数据本身不受影响，可直接以文本编辑器查阅，无需额外工具。

**四、无常驻进程**
无后台进程、无监听端口、无开机自启。仅在 hook 触发与工具调用两个时刻执行，其余时间不占用系统资源。

## 能力边界

记忆检索为**子串匹配**，不提供语义搜索。条目数量在数百级别时可满足需求；数量级达到上万条时检索效率会下降。这是上述四条约束（零依赖、零成本、纯本地、可读可改）的直接结果。

如需大规模语义检索或团队共享记忆库，应选择其他技术方案。

## 环境要求

| 项目 | 要求 |
|---|---|
| Node.js | 18 或更高版本 |
| Antigravity | 已安装并可正常运行 |

## 安装

```bash
git clone https://github.com/zzzy1221/agy-memory.git
cd agy-memory
node scripts/install.js
```

安装不依赖 git，也可通过压缩包或目录拷贝获取插件后，在插件目录内执行安装脚本。

安装脚本执行三项操作：

1. 将插件复制到 `~/.gemini/config/plugins/agy-memory/`
2. 依据本机路径生成 `hooks.json` 与 `mcp_config.json`
3. 校验生成的路径是否存在、命令是否被引号包裹

第 2 步的必要性见[安装脚本的作用](#安装脚本的作用)。

### 命令行选项

| 选项 | 说明 |
|---|---|
| `--dry-run` | 仅输出将要写入的内容，不修改文件系统 |
| `--no-hooks` | 仅安装 MCP 工具，不启用自动注入 |
| `--uninstall` | 移除 hook 与 MCP 配置，保留记忆库 |
| `AGY_PLUGIN_DIR=<path>` | 指定安装目录 |

Antigravity 支持插件热加载，通常无需重启。若插件未生效，重启一次。

### 验证安装

Windows（PowerShell）：

```powershell
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_status","arguments":{}}}' | node "$env:USERPROFILE\.gemini\config\plugins\agy-memory\scripts\server.js"
```

macOS / Linux：

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_status","arguments":{}}}' \
  | node ~/.gemini/config/plugins/agy-memory/scripts/server.js
```

预期输出为包含各轨道条目数的 JSON：

```json
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\n  \"home\": \"...\",\n  \"memory\": 0,\n  \"user\": 0,\n  \"projectLog\": 0,\n  \"today\": 0, ..."}]}}
```

首次安装后各轨道计数为 `0` 属正常现象，表示记忆库为空。

若无输出，或出现 `Cannot find module` 错误，通常为 `mcp_config.json` 中的路径与实际位置不一致（例如插件目录被移动）。重新执行 `node scripts/install.js` 即可修复。

也可在 Antigravity 中新建会话并请求执行 `memory_status`，工具可正常调用即表示安装成功。

## 使用方法

插件在后台自动运行，无需手动触发。两个执行时机：

- **新建会话**：注入全局事实、用户偏好、项目关键记忆与当日记录
- **记忆内容变更后**：按内容哈希判断，需要时补充注入

主动操作通过自然语言指令完成：

| 指令 | 对应行为 |
|---|---|
| 「把这轮定下来的约定记下来」 | 写入一条 `daily` 记录 |
| 「上次那个构建脚本的事你还记得吗」 | 调用 `memory_search` 检索 |
| 「这个坑值得长期记着」 | 调用 `memory_suggest_key`，进入待确认队列 |
| 「确认」／「记进去」 | 调用 `memory_promote_key`，提案正式生效 |
| 「这个不用记」 | 调用 `memory_drop`，丢弃提案 |

`key` 轨道为唯一每轮注入的轨道，会持续占用 token，因此不接受直接写入，须经提案与确认两个步骤。待确认的提案永远不会被注入。

记忆内容可直接查阅：`~/.antigravity-memory/` 下的全部文件均为 Markdown 格式。

## 组件构成

| 类型 | 数量 | 说明 |
|---|---|---|
| MCP 工具 | 11 | `memory_add`、`memory_search`、`memory_list`、`memory_remove`、`memory_suggest_key`、`memory_promote_key`、`memory_pending`、`memory_drop`、`memory_context`、`memory_status`、`memory_sync` |
| Hook | 2 | `SessionStart` 负责注入；`PreInvocation` 在内容变更后补充注入 |
| 规则 | 1 | `rules/AGENTS.md`，插件启用期间常驻，定义写入范围与禁止项 |
| 技能 | 1 | `skills/agy-memory/SKILL.md`，按需加载的操作手册 |

## 记忆轨道

| 轨道 | 文件 | 内容 | 是否注入 |
|---|---|---|---|
| `memory` | `MEMORY.md` | 跨项目事实：机器、环境、路径、版本 | 是 |
| `user` | `USER.md` | 用户偏好、称呼、约束 | 是 |
| `key` | `projects/<slug>.key.md` | 长期约定、架构决策 | 是 |
| `daily` | `daily/YYYY-MM-DD.md` | 每日记录 | 是（仅当日） |
| `project` | `projects/<slug>.md` | 单项目进展 | 否（可检索） |

条目格式为 `- [YYYY-MM-DD] 内容`，由工具维护，不建议手工修改。

删除的条目移入 `archive/`，不做物理擦除，可恢复。

## 配置项

全部可选，通过环境变量设置。

| 变量 | 默认值 | 作用 |
|---|---|---|
| `AGY_MEMORY_HOME` | `~/.antigravity-memory` | 记忆库存储位置 |
| `AGY_MEMORY_PROJECT` | 进程工作目录 | hook 未提供工作区时的回退值 |
| `AGY_MEMORY_BUDGET` | `7000` | 注入内容的字符预算 |
| `AGY_MEMORY_DEBUG` | 未设置 | 将 hook 错误输出至 stderr |

## 安装脚本的作用

Antigravity 的两项行为使静态配置文件无法直接分发，因此必须由安装脚本在目标机器上生成配置。

**一、Windows 环境下 hook 命令不能为路径添加引号**

以下写法会将引号内的完整字符串解析为命令名称：

```json
"command": "\"C:\\Users\\...\\hook.cmd\" SessionStart"
```

错误输出：

```
'\"C:\Users\...\hook.cmd\"' 不是内部或外部命令，也不是可运行的程序
```

嵌套引号的两种替代写法同样无效（一种静默失败，一种报告语法错误）。未加引号的绝对路径可以正常执行，因此**插件安装路径不得包含空格**。安装脚本会检测路径中的空格，如存在则拒绝安装并给出替代方案，而非生成一个每次运行都会静默失败的配置。

**二、MCP 的 `command` 必须为可执行文件路径**

不能使用依赖 shell 解析的命令名。`node` 在多数环境下可用，但 PATH 变更后会失效；使用解析后的 `node.exe` 绝对路径则不受影响。

两项路径均需在目标机器上解析，因此插件目录移动后须重新执行安装脚本。

> `hooks.template.json` 与 `mcp_config.template.json` 为随包分发的占位模板，会被安装脚本覆盖。仅在需要修改生成逻辑时才应编辑模板。

## 已知限制

- **`suggestedPrompts` 最多 3 条**，超出部分被静默截断，仅在日志中留下警告。
- **`plugin.json` 中的未知字段被静默丢弃**，拼写错误不会报错，但也不会生效。
- **hook 为同步执行，会阻塞执行循环**，单次超时限制为 10–15 秒。hook 抛出异常时仍会输出合法的空 JSON，不会导致 agent 中断。

## 界面语言

随包分发的规则与技能为英文（`rules/AGENTS.md`、`skills/agy-memory/SKILL.md`）。中文规则位于 `docs/rules.zh-CN.md`，如需启用：

Windows（PowerShell）：

```powershell
Copy-Item docs\rules.zh-CN.md rules\AGENTS.md -Force
```

macOS / Linux：

```bash
cp docs/rules.zh-CN.md rules/AGENTS.md
```

`rules/` 目录下的文件会被全部合并加载，不应同时保留两份，否则每轮对话将承担双倍 token 开销。

## 卸载

移除 hook 与 MCP 配置，保留记忆库：

```bash
node scripts/install.js --uninstall
```

完整移除，另需删除插件目录：

Windows（PowerShell）：

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.gemini\config\plugins\agy-memory"
```

macOS / Linux：

```bash
rm -rf ~/.gemini/config/plugins/agy-memory
```

记忆库位于 `~/.antigravity-memory/`，独立于插件目录，可按需保留或删除。

## 许可

MIT，详见 [LICENSE](LICENSE)。
