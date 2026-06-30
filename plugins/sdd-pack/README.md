# sdd-pack (omp marketplace plugin)

> **状态: 1.4.0-alpha** — v1.2.0 引入三层守门 agent(reviewer/arch-reviewer/sdd-reviewer);v1.3.0-rc.1 实现 sdd CLI;v1.4.0-alpha 改为 omp extension(ADR-009)。
> 5 个 rule(lore-protocol / docs-update-guard / lore-commit-guard / sdd-doc-edit-guard / prd-change-management);其中前 4 个以 TS hook 实现(过渡方案,等 omp 上游修复 rules 自动发现后退役,见 ADR-006),需用 `omp --hook` 装载;prd-change-management 为纯静态参考(靠 `rule://` 显式调用);3 个 agent 随 plugin agents/ 目录自动发现;v1.4.0-alpha 新增 sdd-extension(8 个 `/sdd-*` slash command)+ sdd-api(程序化入口)。
> 详见 [`docs/architecture/decisions.md`](https://github.com/Norman-pong/sdd-pack/blob/main/docs/architecture/decisions.md)(ADR-006 hook + ADR-007 三层 agent + ADR-009 sdd Extension 替代 CLI)。

## 1. 安装

> **v1.1.0 起需要 `--hook` 装载**: omp v16.1.16 plugin 装载器不识别 `omp.hooks` 字段;`plugins/sdd-pack/hooks/index.ts` 必须通过 CLI flag 显式加载(详见 ADR-006)。
> **环境要求**: Node.js + bun(omp runtime 通过 bun 加载 hook .ts 文件)。

```bash
# 1. 添加 marketplace
omp plugin marketplace add Norman-pong/sdd-pack

# 2. 安装 plugin
omp plugin install sdd-pack@sdd-pack

# 3. (推荐) 配 alias 持久化 hook 装载
echo "alias omp='omp --hook $(pwd)/plugins/sdd-pack/hooks/index.ts'" >> ~/.zshrc
source ~/.zshrc

# 4. (或者) 每次手动加 --hook
omp --hook ./plugins/sdd-pack/hooks/index.ts
```

安装后 4 个 SDD 技能(`sdd-core` / `sdd-input` / `sdd-prd` / `sdd-phase`)应出现在 omp 启动时的系统提示中。

## 2. 验证

安装完成后,启动 omp 一次,执行以下任意一种验证:

```bash
# (a) 通过 read 工具读取技能内容
omp --hook ./plugins/sdd-pack/hooks/index.ts \
  -p "Use the read tool to read skill://sdd-core/SKILL.md. Show me the first 30 lines."
```

期望输出: 看到 sdd-core 技能的 frontmatter(name + description)与正文开头。

```bash
# (b) 通过 read 工具读取 docs-check.sh
omp --hook ./plugins/sdd-pack/hooks/index.ts \
  -p "Use the read tool to read skill://sdd-core/references/docs-check.sh. Show me the first 20 lines."
```

期望输出: 看到 `# docs-check.sh — SDD 文档体系结构校验` 头。

**v1.1.0 验证**: 启动 omp 时(`omp --hook plugins/sdd-pack/hooks/index.ts`),系统提示中应含「📜 lore 提交协议(... plugin hook 注入)」摘要。如未出现,检查: (1) `--hook` flag 路径正确;(2) `~/.omp/agent/rules/lore-protocol.md` 未被 native provider 覆盖(本版本 hook 与 native 共存,native 优先级更高)。

## 3. 目录结构

```
sdd-pack/                                  # GitHub repo root
├── .omp-plugin/
│   └── marketplace.json                   # omp catalog
├── plugins/
│   └── sdd-pack/                          # plugin 根
│       ├── package.json                   # { "name": "sdd-pack", "version": "1.1.0" }
│       ├── README.md                      # 本文件
│       ├── skills/
│       │   ├── sdd-core/                  # SDD 文档体系管理
│       │   │   ├── SKILL.md
│       │   │   ├── references/            # conventions.md, templates.md, docs-check.sh
│       │   │   └── evals/
│       │   ├── sdd-input/                 # 结构化需求输入
│       │   │   ├── SKILL.md
│       │   │   ├── references/
│       │   │   └── templates/
│       │   ├── sdd-prd/                   # PRD 编写
│       │   │   ├── SKILL.md
│       │   │   ├── references/
│       │   │   ├── templates/
│       │   │   └── evals/
│       │   └── sdd-phase/                 # 阶段任务
│       │       ├── SKILL.md
│       │       ├── references/
│       │       ├── templates/
│       │       └── evals/
│       ├── rules/                         # 静态资产;前 4 个功能由 hooks/ 过渡接管(ADR-006)
│       │   ├── lore-protocol.md
│       │   ├── docs-update-guard.md
│       │   ├── lore-commit-guard.md
│       │   ├── sdd-doc-edit-guard.md
│       │   └── prd-change-management.md    # PRD 需求变更处理流程(纯静态,rule:// 调用)
│       └── hooks/                         # v1.1.0 新增 — hook 聚合
│           └── index.ts                   # 4 工厂聚合(session_start + tool_call)
└── docs/                                  # 配套的 SDD 文档(prd/phase/architecture/...)
```

## 4. sdd Extension 工作流(v1.4.0-alpha)

> **v1.4.0-alpha 起** — `sdd-extension`(omp slash command 集合)+ `sdd-api`(程序化入口)取代 v1.3 独立 CLI(ADR-009)。零额外配置:`omp plugin install` 后,重启 omp 即可在会话中输入 `/sdd-*` 命令。

### 4.1 Slash Commands

| 命令                                                                                                                             | 描述                               |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `/sdd-validate [--path <path>] [--staged] [--severity <warn\|error\|block>] [--rules-only\|--structure-only]`                    | 校验 docs/(10 项检查) + 状态机合规 |
| `/sdd-propose --title <name> [--type full\|delta] [--supersedes <prd>] [--spec <path>] [--dry-run]`                              | 创建新 PRD 或 delta 变更           |
| `/sdd-archive <prd-path> [--reason completed\|replaced\|abandoned] [--merge-delta] [--new-prd <path>] [--dry-run] [--no-commit]` | 归档 PRD                           |
| `/sdd-migrate <prd-path> [--dry-run] [--no-backup]`                                                                              | 状态行堆叠 → 规范格式 + CHANGELOG  |
| `/sdd-status`                                                                                                                    | 所有 PRD/Phase 状态总览            |
| `/sdd-list [--status <s>] [--date <YYYY-MM-DD>] [--keyword <kw>] [--type prd\|phase]`                                            | 带过滤的文档列表                   |
| `/sdd-why <file>:<line> [--json]`                                                                                                | 查询 lore 决策上下文               |
| `/sdd-apply <prd-path> [--json]`                                                                                                 | 打印 PRD 验收标准 checklist        |

### 4.2 Programmatic API(CI / hook 复用)

`src/cli/api.ts` 导出 8 个纯函数,slash command / hook / CI 三方共用:

```typescript
import {
  validateDocs,
  proposePrd,
  archivePrd,
  migratePrd,
  getStatus,
  listPrds,
  getWhy,
  getApplyChecklist,
} from "sdd-pack/api";

const result = await validateDocs({ staged: true, severity: "error" });
if (result.status === "block") throw new Error(result.errors.join("\n"));
```

### 4.3 CI 逃生通道

不在 omp 会话内时,用 `api-runner.ts` 薄壳调用:

```bash
bun run plugins/sdd-pack/src/cli/api-runner.ts validate --staged --json
bun run plugins/sdd-pack/src/cli/api-runner.ts status --json
bun run plugins/sdd-pack/src/cli/api-runner.ts migrate docs/prd/2026-06-24-sdd-pack.md --dry-run
```

退出码约定: `pass=0`, `warn=0`, `error=1`, `block=2`(与 hook 拦截一致)。

### 4.4 典型工作流

```bash
# 1. 会话内创建 PRD
/sdd-propose --title "v1.5-feature" --type full

# 2. 校验(自动检查 10 项)
/sdd-validate

# 3. 评审完成后归档
/sdd-archive docs/prd/2026-07-01-v1-5-feature.md --reason completed

# 4. 替代旧 PRD(创建新 + 归档旧)
/sdd-propose --title "v2-feature" --supersedes docs/prd/2026-06-24-sdd-pack.md
/sdd-archive docs/prd/2026-06-24-sdd-pack.md --reason replaced --new-prd docs/prd/2026-07-01-v2-feature.md --merge-delta

# 5. CI 端到端校验
bun run api-runner.ts validate --staged --json
```

### 4.5 手动 vs Extension 对照表

| 操作     | 手动步骤                                               | Extension / API                                          |
| -------- | ------------------------------------------------------ | -------------------------------------------------------- |
| 创建 PRD | 复制 \_template.md → 改 frontmatter → 写章节           | `/sdd-propose --title "X"` 或 `proposePrd({title: "X"})` |
| 校验文档 | 跑 docs-check.sh(4 项)+ 目视状态机检查                 | `/sdd-validate`(10 项)或 `validateDocs()`                |
| 归档 PRD | 改状态行 → 移动文件 → 更新 index.md → lore commit 4 步 | `/sdd-archive <path> --reason completed`                 |
| CI 校验  | 写 shell 调 docs-check.sh                              | `bun run api-runner.ts validate --staged --json`         |

### 4.6 Hook 集成(已升级为 in-process)

`hooks/index.ts` 的 `runSddValidate` 不再 spawn subprocess,改为 in-process 调用 `api.validateDocs()`:

- `block` 违规 → 硬拦截,commit 被拒绝
- `error` 违规 → 灰度阶段仅警告(`SDD_VALIDATE_SEVERITY=error` 升级为阻塞)
- 配置: `export SDD_VALIDATE_SEVERITY=warn|error|block`

### 4.7 迁移指引 v1.3 → v1.4

v1.3 独立 CLI 在 v1.4.0-alpha 改为 omp extension(ADR-009)。原 `bin/sdd` + `sdd <cmd>` 全部移除,改用 slash command + program API。

| v1.3(独立 CLI)                          | v1.4(extension + API)                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `alias sdd='bun .../bin/sdd'`           | 删除(不再需要)                                                               |
| `sdd validate`                          | `/sdd-validate`(会话内)或 `bun run api-runner.ts validate`(CI)               |
| `sdd validate --json`                   | `bun run api-runner.ts validate --json`                                      |
| `sdd validate --staged`                 | `/sdd-validate --staged` 或 `bun run api-runner.ts validate --staged --json` |
| `sdd propose --title X`                 | `/sdd-propose --title X`                                                     |
| `sdd propose --supersedes <old>`        | `/sdd-propose --supersedes <old> --title X`                                  |
| `sdd archive <path> --reason completed` | `/sdd-archive <path> --reason completed`                                     |
| `sdd archive --merge-delta`             | `/sdd-archive --merge-delta`(语义一致)                                       |
| `sdd migrate <path> --dry-run`          | `/sdd-migrate <path> --dry-run`                                              |
| `sdd status`                            | `/sdd-status`                                                                |
| `sdd list --status X`                   | `/sdd-list --status X`                                                       |
| `sdd why <file>:<line>`                 | `/sdd-why <file>:<line>`                                                     |
| `sdd apply <path>`                      | `/sdd-apply <path>`                                                          |
| `package.json#bin`                      | 删去(改用 `omp.extensions` manifest)                                         |
| hook spawn subprocess                   | in-process `api.validateDocs()`                                              |

**零额外配置**:`omp plugin install sdd-pack` 后,重启 omp 即可在会话中用 `/sdd-*` 命令,无须手工 alias。

## 5. 开发模式

本地开发 skill 内容并即时生效:

```bash
# 在 sdd-pack 仓库根
omp plugin link ./plugins/sdd-pack

# 修改 plugins/sdd-pack/skills/<skill>/ 或 hooks/index.ts
# 重启 omp 即生效(omp 不热加载,需重启)
# 注意 hook 改动必须用 --hook 装载路径
omp --hook ./plugins/sdd-pack/hooks/index.ts

# 开发完成后
omp plugin uninstall sdd-pack@sdd-pack
```

**v1.1.0 重要变化**: link 模式下 hook 不会自动装载(omp 装载器不识别 omp.hooks 字段),必须手动加 `--hook` flag 启动 omp。

## 6. 与 native rules 的共存

v1.1.0 起 plugin hook 与 native rules **功能等价**;两者同时加载时 native 优先级更高(model 视角看到的是 native 内容)。

如需**纯 hook 路径**(排除 native 干扰,验证 hook 工作):

```bash
mkdir -p ~/.omp/agent/rules/disabled
mv ~/.omp/agent/rules/{lore-protocol,docs-update-guard,lore-commit-guard,sdd-doc-edit-guard}.md ~/.omp/agent/rules/disabled/
# 重启 omp,验证 hook 独立接管
# 回滚: mv ~/.omp/agent/rules/disabled/*.md ~/.omp/agent/rules/
```

**保留 native rules 的好处**: 双保险(hook 失效时 native 兜底),逐步迁移观察期。**何时彻底卸载**: 至少 1 个月生产环境稳定后(本仓库 ADR-006 §副作用 与 v1.7-regression 记录)。

## 故障排查

### Q1. `omp plugin install` 报 "Plugin source resolves outside marketplace root"

**原因**: `.omp-plugin/marketplace.json` 缺少 `metadata.pluginRoot` 字段,omp 把 `source: "./sdd-pack"` 解析为相对 marketplace.json 同级目录,触发 OOB 安全拒绝。

**解决**: 确认 `.omp-plugin/marketplace.json` 含 `metadata.pluginRoot: "plugins"`(sdd-pack 仓库根的 catalog 已带此字段)。

### Q2. 启动 omp 后 system prompt 没有「plugin hook 注入」标记

**原因**: 没加 `--hook` flag,或路径错误,或 hook 加载失败(bun 缺类型)。

**解决**:

1. 确认命令含 `--hook $(pwd)/plugins/sdd-pack/hooks/index.ts`
2. 路径用 `$(pwd)` 绝对化,避免 cwd 漂移
3. `bun build ./plugins/sdd-pack/hooks/index.ts --target=bun --outdir=/tmp/test` 确认 TS 编译通过
4. 设置 `alias omp='omp --hook ...'` 持久化

### Q3. system prompt 中 sdd-\* skill 的 description 显示为英文(而非源文件中的中文)

**原因**: omp 在 marketplace 模式下会对 frontmatter description 做翻译(可能为多语言提示优化)。`skill://` URI 读取仍返回原始中文 frontmatter。

**解决**: 这是 omp 的预期行为,不影响功能。如需原汁原味中文提示,可用 `omp plugin link` 本地开发模式。

### Q4. `omp -p` 启动时显示双 plugin 条目(同时含 npm 与 marketplace)

**原因**: 用户既执行了 `omp plugin link`(开发态,npm 模式)又执行了 `omp plugin install`(发布态,marketplace 模式)。

**解决**: 二选一:

- 仅 link(开发): `omp plugin uninstall sdd-pack@sdd-pack`
- 仅 marketplace(发布): `omp plugin uninstall sdd-pack`(卸 npm),并清理 `~/.omp/plugins/node_modules/sdd-pack` 符号链接

### Q5. docs-check.sh 在 marketplace install 后无法执行

**原因**: omp 在 cache 中保留了文件(`~/.omp/plugins/cache/plugins/sdd-pack___sdd-pack___1.1.0/skills/sdd-core/references/docs-check.sh`),但若用户从 cache 拷贝到项目,可能丢失可执行权限。

**解决**: 拷贝后执行 `chmod +x docs-check.sh`;脚本 bash 3.2 兼容(已在 macOS 默认 bash 验证)。

## 卸载

```bash
# 1. 卸载 plugin
omp plugin uninstall sdd-pack@sdd-pack

# 2. 移除 marketplace
omp plugin marketplace remove sdd-pack

# 3. 清理 cache(可选)
rm -rf ~/.omp/plugins/cache/plugins/sdd-pack___sdd-pack___1.1.0
```

plugin 本身不修改 `~/.omp/agent/rules/`;native rules 是否卸载由用户决定(详见 §5)。

## 升级

```bash
# 1. 拉取最新 marketplace catalog
# (omp 在 install/upgrade 时自动 fetch)
# 2. 升级 plugin
omp plugin upgrade sdd-pack@sdd-pack
# 3. 重启 omp 加载新版本(注意加 --hook)
omp --hook ./plugins/sdd-pack/hooks/index.ts
```

**版本对应**: git tag 与 plugin version 保持一致。

- v0.9.0-rc → v1.1.0(0.9.0 → v1.0.0 跳过,本版本合并 hook 路径实施)
- 每次技能内容变更对应 plugin version 递增

**升级前建议**: 备份 `plugins/sdd-pack/skills/sdd-*/SKILL.md` 的本地修改(若有);`hooks/index.ts` 大改时(>10 行)应单独发一个 minor 版本。
