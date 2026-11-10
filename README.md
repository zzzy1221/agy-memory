# agy-memory · 反重力长期记忆

> [English](README.en.md) · 中文（当前）

给 [Google Antigravity](https://antigravity.google)（俗称「反重力」）加一条**跨会话的记忆**。

Agent 换个对话就把前面的事忘光。这个插件给它一份活得下来的记忆，并且在它开始思考之前，先把该记得的部分注入上下文里。

**纯本地 · 零依赖 · 不联网 · 不要 API key · 不花钱。**

```
┌─ SessionStart hook ─────────────────────────────┐
│  全局  +  用户  +  项目关键  +  今天            │  ──►  注入上下文
└─────────────────────────────────────────────────┘
              ▲                        │
              │                        ▼
        memory_add ...          ~/.antigravity-memory/
                                  ├── MEMORY.md
                                  ├── USER.md
                                  ├── projects/<项目>.md
                                  ├── projects/<项目>.key.md
                                  ├── daily/2026-01-01.md
                                  ├── archive/
                                  └── suggestions.jsonl
```

## 它的设计取舍

这个插件是按四条硬约束设计的，每条都对应一个具体做法：

**1. 只花你已经在花的钱。** 不引入额外的 API key，不调用任何抽取或摘要模型。写记忆由正在跟你对话的那个模型顺手完成，一次工具调用，不多一轮请求。

**2. 不联网。** 记忆存在本机 `~/.antigravity-memory/`，没有任何出站请求。不需要注册账号，也没有服务端要知道你记了什么。

**3. 用 Markdown 存，不用数据库。** 好处是可读、可 diff、可手改、可放进你自己的备份。插件坏了或者你不想用了，记忆不会跟着废掉 —— 打开文件就能看，想知道它到底记住了什么不用装任何工具。

**4. 不常驻。** 没有后台进程、没有端口、没有开机自启。全程只有两种存在方式：Antigravity 调 hook 的那一下，和 Antigravity 调工具的那一下。剩下时间它不存在，不占内存也不耗电。

对应到能力边界：**它没有语义搜索。** `memory_search` 是子串匹配，几百条很够用，上万条会力不从心。这是换取上面四条（零依赖、零成本、纯本地、可读可改）的代价，写在明面上。

如果你要的是另一种取舍 —— 大规模语义检索、或者团队共享记忆库 —— 那是另一个方向的产品，这个插件不是冲着那个去的。

## 安装

前置只要一个：**Node.js 18+**。Antigravity 得先装好。

```bash
git clone https://github.com/<你的账号>/agy-memory.git
cd agy-memory
node scripts/install.js
```

拿到目录的方式无所谓（git、zip、从别的机器拷过来都行），只要在插件目录里跑安装器就够了 —— 它不需要 git。

安装器会把插件复制到 `~/.gemini/config/plugins/agy-memory/`，然后**按你这台机器的绝对路径生成 `hooks.json` 和 `mcp_config.json`**，最后自检一遍。

最后这一步不是偷懒，原因见[为什么非得有安装器](#为什么非得有安装器)。

常用选项：

```bash
node scripts/install.js --dry-run          # 只打印要写什么，不落盘
node scripts/install.js --no-hooks         # 只装 MCP 工具，不要自动注入
node scripts/install.js --uninstall        # 撤掉 hook 和 MCP 配置（记忆库保留）
AGY_PLUGIN_DIR=/自定义/路径 node scripts/install.js
```

Antigravity 热加载插件，通常不用重启。要是没反应，重开一次。

### 验证装好了没

PowerShell（Windows）：

```powershell
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_status","arguments":{}}}' | node "$env:USERPROFILE\.gemini\config\plugins\agy-memory\scripts\server.js"
```

bash / zsh（macOS、Linux）：

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_status","arguments":{}}}' \
  | node ~/.gemini/config/plugins/agy-memory/scripts/server.js
```

回一段带各轨条数的 JSON，就是活的：

```json
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\n  \"home\": \"...\",\n  \"memory\": 1,\n  \"user\": 1,\n  \"projectLog\": 0,\n  \"today\": 0, ..."}]}}
```

刚装完各轨条数都是 `0`，这是正常的 —— 库还是空的，等它记第一条。

要是没输出、或者报 `Cannot find module`，那大概率是 `mcp_config.json` 里的路径不对（比如把插件目录挪了位置）。重跑一次 `node scripts/install.js` 就好。

更省事的办法：在 Antigravity 里新开一个对话，直接说「跑一下 memory_status」，它调得出来就说明装好了。

## 装了之后怎么用

**不用专门「用」。** 正常聊天就行，它自己在这两个点动：

- **开新对话** → 把记忆注入进去（全局事实 + 你的偏好 + 本项目长期约定 + 今天的记录）
- **你让它记了东西之后** → hash 变了，下一轮补注入一次

想主动操作，对着 Antigravity 说人话就行：

| 你说 | 它做什么 |
|---|---|
| 「把这轮定下来的约定记下来」 | 写一条 `daily` |
| 「上次那个构建脚本的事你还记得吗」 | 调 `memory_search` 去查 |
| 「这个坑值得长期记着」 | 走 `memory_suggest_key` 进待确认队列 |
| 「确认」「记进去」 | `memory_promote_key` 才真正生效 |
| 「这个不用记」 | `memory_drop` 丢掉提案 |

**待确认这一步是故意的。** `key` 轨每轮都注入，花的是每次对话的 token，所以不能让模型自己拍板。

想直接看它记了什么：打开 `~/.antigravity-memory/`，全是 Markdown，记事本就能开。

## 它提供什么

**11 个 MCP 工具** —— `memory_add`、`memory_search`、`memory_list`、`memory_remove`、`memory_suggest_key`、`memory_promote_key`、`memory_pending`、`memory_drop`、`memory_context`、`memory_status`、`memory_sync`

**2 个 hook** —— `SessionStart` 负责注入；`PreInvocation` 只在记忆真的变了之后补一次（按 hash 判断，所以不会每轮都白烧 token）

**1 条规则** —— `rules/AGENTS.md`，插件启用期间常驻：写什么、写在哪、什么不许写

**1 个技能** —— `skills/agy-memory/SKILL.md`，按需加载的操作手册

## 五条轨道

| 轨道 | 文件 | 放什么 | 是否注入 |
|---|---|---|---|
| `memory` | `MEMORY.md` | 跨项目事实：机器、环境、路径、版本 | ✅ |
| `user` | `USER.md` | 用户偏好、称呼、雷区 | ✅ |
| `key` | `projects/<项目>.key.md` | 长期约定、架构决策 | ✅ |
| `daily` | `daily/YYYY-MM-DD.md` | 每日日志 | ✅（只注入今天） |
| `project` | `projects/<项目>.md` | 单项目进展 | ❌（可搜索） |

`key` 是唯一每轮都花 token 的轨道，所以不能直接写：`memory_suggest_key` 先排队，用户确认后 `memory_promote_key` 才落地。**待确认的提案永远不会被注入。**

删掉的条目会移到 `archive/`，不是真的抹掉。

## 配置

全部可选，走环境变量。

| 变量 | 默认值 | 作用 |
|---|---|---|
| `AGY_MEMORY_HOME` | `~/.antigravity-memory` | 记忆库放哪 |
| `AGY_MEMORY_PROJECT` | 进程 cwd | hook 没给工作区时的兜底 |
| `AGY_MEMORY_BUDGET` | `7000` | 注入块的字符预算 |
| `AGY_MEMORY_DEBUG` | — | 把 hook 的报错打到 stderr |

## 为什么非得有安装器

Antigravity 的两处行为，让静态的 `hooks.json` 没法直接发出去：

**1. Windows 上 hook 命令不能给路径加引号。** 写成 `"C:\...\hook.cmd" SessionStart`，Antigravity 会把引号里那一整串当成命令**名字**：

```
'\"C:\Users\...\hook.cmd\"' 不是内部或外部命令，也不是可运行的程序
```

嵌套引号的两种绕法也都不行（实测：一种静默失败，一种报语法错误）。**裸的绝对路径能跑** —— 所以**插件路径里不能有空格**。安装器会检查这一点，带空格直接拒装并给出去路，而不是装一个每轮静默失败的东西。

**2. MCP 的 `command` 必须能直接 spawn**，不能是靠 shell 解析的命令名。写 `node` 平时没事，但哪天 PATH 变了就废；写解析出来的 `node.exe` 绝对路径一直能用。

所以这两个路径都得在你的机器上解析。**把插件挪了位置，重跑一次安装器。**

> `hooks.template.json` 和 `mcp_config.template.json` 是随包发的占位模板，会被安装器覆盖。只有你想改「安装器生成什么」的时候才去动它们。

## 另外几个坑，早知道早省事

- **`suggestedPrompts` 最多 3 条。** 多给的会静默截断，只在日志里留一句警告。
- **`plugin.json` 里不认识的字段会被静默丢弃。** 拼错了不报错，就是不生效 —— 别以为写上了。
- **hook 是同步执行的，会阻塞执行循环。** 两个都限了 10~15 秒；就算 hook 抛异常，它也会吐一份合法的空 JSON，不会把你的 agent 卡死。

## 界面语言

插件随包发的是**英文**（`rules/AGENTS.md`、`skills/agy-memory/SKILL.md`），因为要发社区。中文规则在 `docs/rules.zh-CN.md`，想用中文覆盖过去：

```powershell
Copy-Item docs\rules.zh-CN.md rules\AGENTS.md -Force
```

```bash
# macOS / Linux
cp docs/rules.zh-CN.md rules/AGENTS.md
```

**别两份都留。** `rules/` 目录下的文件会被全部合并加载，两份就是每轮付双倍 token。

## 卸载

```bash
node scripts/install.js --uninstall   # 只撤 hook 和 MCP 配置，记忆库留着
```

彻底删干净，再把插件目录删掉即可：

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.gemini\config\plugins\agy-memory"
```

记忆库在 `~/.antigravity-memory/`，想留就留着，不想要了再删。

## 许可

MIT，见 [LICENSE](LICENSE)。
