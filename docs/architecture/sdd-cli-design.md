# sdd CLI 架构设计

> 状态：草稿（与 [PRD](../prd/2026-06-29-sdd-cli.md) 同源）
> 修改记录：执行 `lore log docs/architecture/sdd-cli-design.md`
> 对应 PRD：[sdd CLI PRD](../prd/2026-06-29-sdd-cli.md)
> 设计日期：2026-06-29
> 设计人：sdd-pack CLI 架构设计子代理

本文档是 [PRD](../prd/2026-06-29-sdd-cli.md) 的实施指导。PRD 定义「为什么做、做什么、验收标准」，本文档定义「怎么落地、API 形态、模块划分」。两者通过头部交叉引用保持一致。

---

## 0. 设计目标

为 sdd-pack 构建 **TypeScript + bun** 的完整工作流 CLI，解决现有四大痛点：

1. **PRD 状态行堆叠**：v1.2.0–v1.2.3 多个版本功能挤在一条状态行，`prd-change-management` rule 解决了「判断走哪条路」但没有解决「走完怎么落地、怎么合并」
2. **PRD 生命周期操作纯手工**：起草、评审、归档、supersedes 链维护全靠人记，容易漏步骤
3. **文档结构校验依赖脚本**：`docs-check.sh` 覆盖 4 项检查，但缺乏状态机合规性校验
4. **归档机制半自动化**：`archival-mechanism.md` 定义了归档流程，但执行靠 agent 手动操作

CLI 定位：**将 rule 中的判断逻辑程序化，将 sdd-core 中的操作流程自动化，成为 sdd-pack 文档生命周期的唯一权威入口。**

---

## 1. 命名与位置

### 1.1 CLI 名字：`sdd`

- **认知一致**：整个生态已用 `sdd` 指代这套体系（`sdd-core` / `sdd-prd` / `sdd-phase` / `sdd-input` / `sdd-pack` / `sdd-reviewer`）
- **简短**：3 字符，与 `git` / `lore` 同级
- **命名空间安全**：检查 npm / homebrew 无 `sdd` 冲突

### 1.2 物理位置

```
plugins/sdd-pack/
├── src/
│   └── cli/
│       ├── index.ts                  # CLI 入口
│       ├── commands/
│       │   ├── propose.ts            # sdd propose
│       │   ├── validate.ts           # sdd validate
│       │   ├── archive.ts            # sdd archive
│       │   ├── status.ts             # sdd status（完整集）
│       │   ├── list.ts               # sdd list（完整集）
│       │   ├── why.ts                # sdd why（完整集）
│       │   └── migrate.ts            # sdd migrate（完整集）
│       └── lib/
│           ├── prd-state-machine.ts  # 状态机（程序化 prd-change-management rule）
│           ├── doc-parser.ts         # PRD/Phase/Spec 解析
│           ├── validator.ts          # 校验引擎
│           ├── template-engine.ts    # PRD 模板填充
│           ├── index-sync.ts         # docs/index.md 同步
│           └── lore-wrapper.ts       # lore commit 封装
├── bin/
│   └── sdd                           # bash 薄壳 wrapper
```

**决策理由**：
- ❌ 仓库根 `bin/sdd` — CLI 是 plugin 资产，不是仓库根工具
- ✅ `plugins/sdd-pack/src/cli/` — 随 plugin 分发；与 `hooks/index.ts` 同形态

### 1.3 安装方式

```bash
# 用户安装 sdd-pack 后,在 ~/.zshrc 或 ~/.bashrc 中添加:
alias sdd='bun ~/.omp/plugins/node_modules/sdd-pack/bin/sdd'

# sdd-pack 开发者(norman):
alias sdd='bun ./plugins/sdd-pack/bin/sdd'
```

**`bin/sdd` wrapper**：

```bash
#!/usr/bin/env bash
# sdd — SDD 文档生命周期 CLI
# 薄壳 wrapper,实际逻辑在 src/cli/index.ts
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_ENTRY="$SCRIPT_DIR/../src/cli/index.ts"
exec bun run "$CLI_ENTRY" "$@"
```

---

## 2. 子命令清单

### 2.1 MVP 三件套

#### `sdd propose`

**职责**：创建新 PRD 文件或为已发布 PRD 创建 delta 变更。

| 参数 | 必须 | 说明 |
|------|------|------|
| `--spec <path>` | 否 | 从 spec 文件提纯 |
| `--supersedes <prd-path>` | 否 | 标记替代旧 PRD（已发布 PRD 的变更场景） |
| `--title <name>` | 否* | PRD 名称（未提供则交互式询问） |
| `--type <full\|delta>` | 否 | full（完整 11 节）或 delta（仅 Δ 段）；默认 full，`--supersedes` 时默认 delta |
| `--dry-run` | 否 | 仅打印不写入 |

**退出码**：0（成功）/ 1（前置不满足）/ 2（文件冲突）

**典型用例**：

```bash
sdd propose --spec docs/spec/2026-06-29-new-feature.md
sdd propose --supersedes docs/prd/2026-06-24-sdd-pack.md --title "sdd-pack-v1.3-cli"
sdd propose --spec docs/spec/2026-06-29-new-feature.md --dry-run
```

#### `sdd validate`

**职责**：校验文档结构 + 状态机合规 + 交叉引用一致性。是 `docs-check.sh` 的超集 + 状态机校验。

| 参数 | 必须 | 说明 |
|------|------|------|
| `[path]` | 否 | 校验范围（文件/目录，省略则全量 `docs/`） |
| `--staged` | 否 | 仅校验 git staged 变更涉及的 docs 文件 |
| `--severity <warn\|error\|block>` | 否 | 校验严格度；默认 `error` |
| `--json` | 否 | JSON 输出（hook / CI 解析用） |
| `--rules-only` | 否 | 仅状态机校验 |
| `--structure-only` | 否 | 仅文档结构校验 |

**10 项校验**：

| # | 检查项 | 来源 | severity |
|---|--------|------|----------|
| 1 | PRD ↔ Phase 双向引用 | docs-check.sh §1 | `error` |
| 2 | 回指格式规范 | docs-check.sh §2 | `error` |
| 3 | index.md 覆盖度 | docs-check.sh §3 | `error` |
| 4 | 相对路径链接有效性 | docs-check.sh §4 | `warn` |
| 5 | 状态机合规性 | prd-change-management rule | `block` |
| 6 | supersedes 链完整性 | prd-change-management rule §4 | `error` |
| 7 | 命名规范 | conventions.md §2 | `warn` |
| 8 | 状态行格式 | 新增 | `error` |
| 9 | 归档文件位置 | archival-mechanism.md | `warn` |
| 10 | 必需章节完整性 | conventions.md §3-5 | `error` |

**severity 行为**：

| severity | 退出码 | commit 行为 |
|----------|--------|-------------|
| `warn` | 0 | 允许（打印警告） |
| `error` | 1 | 阻塞（打印错误列表） |
| `block` | 2 | 硬阻塞（拒绝继续） |

#### `sdd archive`

**职责**：归档 PRD。delta 型 PRD 可选合并 delta 到完整 PRD。同步 index.md / supersedes 链 / Phase 引用。

| 参数 | 必须 | 说明 |
|------|------|------|
| `<prd-path>` | 是 | 目标 PRD 文件路径 |
| `--reason <completed\|replaced\|abandoned>` | 否 | 归档原因 |
| `--merge-delta` | 否 | delta 段合并到完整 PRD |
| `--dry-run` | 否 | 仅打印操作清单 |
| `--no-commit` | 否 | 跳过 lore commit |
| `--new-prd <path>` | 否 | （`--reason replaced` 时）替代本 PRD 的新 PRD 路径 |

**归档操作**：

| reason | 操作 | 文件位置 | supersedes |
|--------|------|---------|------------|
| `completed` | 状态改 `已归档` | 移动到 `docs/prd/archive/` | — |
| `replaced` | 状态改 `已替换` | 原地不动 | 双向引用 |
| `abandoned` | 状态改 `已废弃` | 原地不动 | — |

**自动步骤**：
1. 校验前置条件
2. 自动 `sdd validate`（不通过则拒绝归档）
3. 修改状态行
4. 移动文件（仅 `completed`）
5. 更新交叉引用
6. 更新 `docs/index.md`
7. 封装 `lore commit`（除非 `--no-commit`）

### 2.2 完整集（后续实施）

- `sdd apply` — 打印实施 checklist（不操作文件，对应"apply 留给手写代码"决策）
- `sdd status` — 所有 PRD/Phase 状态总览
- `sdd list` — 带过滤的文档列表
- `sdd why` — 查询 lore 决策上下文（包装 `lore why`）
- `sdd migrate` — 状态行堆叠 → 规范格式 + CHANGELOG

---

## 3. 数据模型

### 3.1 核心映射

借鉴 OpenSpec 的 spec/change/delta 概念，但**不引入新目录**：

| 借鉴概念 | sdd-pack 对应 | 说明 |
|---------|---------------|------|
| spec（源真理） | `docs/prd/<name>.md`（已发布） | 已发布的 PRD 是源真理 |
| change（提议） | 新 PRD 文件（状态：草稿/评审中） | 变更提案 = 新 PRD |
| delta（桥） | PRD 模板「Δ 变更摘要」段 | delta 段内置于新 PRD 文件 |

**核心决策：不新建 `changes/` 或 `openspec/` 目录**

理由：
1. **避免双轨制**：若同时存在 `docs/prd/`（旧）和 `changes/`（新），用户需在两个位置维护文档
2. **supersedes 链已扮演 `changes/` 角色**：当 PRD A 被 PRD B 替代，B 就是 A 的「change」
3. **最小破坏原则**：现有 `docs/` 6 个分区已实战验证，加第 7 个分区增加认知负担
4. **delta 段解决"全量 PRD 太重"**：当前问题不是缺 `changes/` 目录，而是每个小变更都要写完整 11 节 PRD 太累。delta 段在现有模板内提供轻量变更能力

### 3.2 文件系统视角数据流

```
上游输入
└── docs/spec/<name>.md（结构化需求）
        │
        ↓ sdd propose --spec
活跃 PRD
├── docs/prd/<name>.md（状态：草稿/评审中）
├── docs/prd/<name>.md（状态：已发布）= 源真理
└── docs/prd/<name>-v2.md（状态：草稿 + Δ 段，> 替代: 旧 PRD）
        │
        ↓ sdd archive
终态
├── docs/prd/archive/<name>.md（状态：已归档）
├── docs/prd/<name>.md（状态：已替换，原地）
└── docs/prd/<name>.md（状态：已废弃，原地）
```

---

## 4. PRD 模板变更

### 4.1 新增「Δ 变更摘要」段

在 PRD 模板 header block 与 `## 0. 目标声明` 之间，新增可选段：

```markdown
## Δ 变更摘要（仅 supersedes 型 PRD 填写）

> 本 PRD 替代 [旧 PRD 名称](../prd/YYYY-MM-DD-<old>.md)。
> 以下仅列出相对于旧 PRD 的变更点。**未提及的章节/内容沿用旧 PRD 对应内容,无需在本文件重复。**
> `sdd archive --merge-delta` 执行后,本段将被消费并从文件中移除,变更内容合并到上方对应章节。

### ADDED

| # | 目标章节 | 新增内容摘要 | 原因 |
|---|---------|-------------|------|
| A1 | §3.1 | 功能 X:支持 xxx | 用户反馈 #42 |

### MODIFIED

| # | 目标章节 | 原内容 | 新内容 | 原因 |
|---|---------|--------|--------|------|
| M1 | §3.2 | API 返回 XML | API 返回 JSON | 性能优化 |

### REMOVED

| # | 目标章节 | 移除内容 | 原因 |
|---|---------|---------|------|
| R1 | §3.3 | 功能 Y(管理后台) | 不再需要 |

### 不变内容(显式确认)

| # | 章节 | 确认 |
|---|------|------|
| U1 | §1 背景与目标 | 沿用旧 PRD |
| U2 | §2 用户与场景 | 沿用旧 PRD |
```

### 4.2 状态行规范化

**强制单行单状态**：

```markdown
> 状态：已发布 | 发布日期：2026-06-25 | 版本：1.2.3
> 变更历史：见 [CHANGELOG](./CHANGELOG-2026-06-24-sdd-pack.md)
```

**禁止模式**（`sdd validate` 报 `block`）：

```markdown
> 状态:1.2.3 已发布(2026-06-25);v1.2.0 新增...;v1.2.1 修正...  ← 堆叠,block
> 状态:草稿→评审中  ← 多状态,block
> 状态:已发布,v2 规划中  ← 多版本,block
```

历史版本信息表达方式：
- `> 替代:` supersedes 字段（跨 PRD 版本关系）
- `docs/prd/CHANGELOG-<name>.md`（同 PRD 的连续变更记录，由 `sdd migrate` 生成）
- lore commit log（每次提交的决策上下文）

---

## 5. 硬门禁机制

### 5.1 设计原则

- **CLI 不替代 `lore commit`**：用户仍用 `lore commit`。CLI 是提交前的质量门
- **CLI 不替代 hook**：现有 `hooks/index.ts` 保留（ADR-006 结论）。CLI 是 hook 调用的校验后端
- **CLI 可独立运行**：`sdd validate` 可脱离 hook 单独使用（CI / 手动检查 / dry-run）

### 5.2 接入架构

```
用户 commit
    ↓
hooks/index.ts (lore-commit-guard)
    ↓ spawnSync
sdd validate --staged --json
    ↓
    ├── block (exit 2) → 硬拦截 commit
    ├── error (exit 1) → 阻塞 commit,提示修复
    ├── warn (exit 0) → 警告,继续 commit
    └── pass (exit 0) → 通过,继续 commit
```

### 5.3 具体实现（推荐：子进程调用）

```typescript
// hooks/index.ts 内新增
import { spawnSync } from "bun";

function runSddValidate(): { status: string; errors: string[] } {
  const result = spawnSync([
    "bun", "run", sddCliPath,
    "validate", "--staged", "--json"
  ]);
  return JSON.parse(result.stdout.toString());
}

// 在 lore-commit-guard 逻辑中加入:
const validation = runSddValidate();
if (validation.status === "block") {
  return {
    block: true,
    reason: `sdd validate 硬拦截:\n${validation.errors.join("\n")}`
  };
}
if (validation.status === "error") {
  pi.sendMessage({
    role: "system",
    content: `❌ sdd validate 错误:\n${validation.errors.join("\n")}`
  });
  return { block: true, reason: "文档结构校验失败,请修复后重试" };
}
```

### 5.4 与现有 rule 的关系

| rule | 变化 |
|------|------|
| `lore-commit-guard` | 不变。质量门增加 `sdd validate` 步骤 |
| `docs-update-guard` | 简化：`sdd validate --staged` 自动覆盖「是否要改文档」判断 |
| `sdd-doc-edit-guard` | 不变。`sdd propose` 取代手动写 PRD 场景 |
| `prd-change-management` | 程序化：CLI 实现其判断逻辑 |
| `lore-protocol` | 不变 |

---

## 6. 职责矩阵

### 6.1 CLI 与现有组件

| 组件 | 职责 | CLI 是否替代 | 关系 |
|------|------|-------------|------|
| `sdd propose` | 创建 PRD / delta | ✅ 替代手动 `write` + sdd-prd 前几步 | 程序化 sdd-prd 模板填充 |
| `sdd validate` | 文档结构 + 状态机校验 | ✅ 超集替代 docs-check.sh | 内部调用 docs-check.sh 4 项 + 增加 6 项新检查 |
| `sdd archive` | 归档 + supersedes 链维护 + index 同步 | ✅ 替代 archival-mechanism.md 手动步骤 | 程序化归档流程 |
| `reviewer` | commit 代码评审 | ❌ 不替代 | 独立守门层 |
| `arch-reviewer` | PR/plan 架构评审 | ❌ 不替代 | 独立守门层 |
| `sdd-reviewer` | phase/merge 文档一致性评审 | ❌ 不替代 | 独立守门层（语义检查） |
| `lore-protocol` (rule) | alwaysApply 全局 lore 提示 | ❌ 不替代 | CLI 内部调用 lore commit |
| `docs-update-guard` | commit 时 doc sync 检查 | ⚠️ 简化 | sdd validate 覆盖 |
| `lore-commit-guard` | commit 质量门 | ⚠️ 增强 | 质量门增加 sdd validate |
| `sdd-doc-edit-guard` | write-time 路由 SDD 技能 | ⚠️ 部分替代 | sdd propose 取代手动写 PRD |
| `prd-change-management` | 状态机 + 变更类型判据 | ⚠️ 程序化 | CLI 实现此 rule 判断逻辑 |
| `sdd-core/sdd-prd` (skill) | 文档创建/修改全流程指导 | ⚠️ 自动化 | CLI 将其操作流程自动化 |

### 6.2 守门分层

```
        ┌──────────────────────────────────────────┐
        │            sdd CLI（文档守门）             │
        │  propose ──→ validate ──→ archive         │
        │  结构化检查（可程序化，无需 LLM）           │
        └────────────────┬─────────────────────────┘
                         │
        ┌────────────────▼─────────────────────────┐
        │          reviewer（commit 守门）           │
        │  bug + patch-local design + lore probe    │
        │  LLM 推理，patch 锚定                      │
        └────────────────┬─────────────────────────┘
                         │
        ┌────────────────▼─────────────────────────┐
        │       arch-reviewer（PR/plan 守门）       │
        │  SOLID/cohesion/coupling/ADR              │
        │  LLM 推理，全局归纳                         │
        └────────────────┬─────────────────────────┘
                         │
        ┌────────────────▼─────────────────────────┐
        │       sdd-reviewer（phase/merge 守门）     │
        │  PRD acceptance / Phase 覆盖 / docs sync  │
        │  LLM 推理，文档交叉引用比对                 │
        └──────────────────────────────────────────┘
```

CLI 在最底层：做**不需要 LLM 推理的结构化检查**。三层守门 agent 在上层：做**需要 LLM 推理的语义检查**。互补不重叠。

---

## 7. 迁移路径

### 7.1 现状

`docs/prd/2026-06-24-sdd-pack.md` 状态行（line 2）：

```markdown
> 状态:1.2.3 已发布(2026-06-25);v1.2.0 新增三层守门 agent;v1.2.1 修正 sdd-reviewer 无 PRD 误报;v1.2.2 PRD 补齐 agent 能力;v1.2.3 版本号同步;0.9.0-rc 静态 rules 阶段已通过 hook extension 替代
```

**问题**：5 个版本功能挤在一条状态行，状态机状态、版本号、功能描述混排。

### 7.2 迁移策略

**`sdd migrate <prd-path> [--dry-run] [--no-backup]`**

1. **解析状态行**：提取当前状态、版本号、发布日期、历史版本条目
2. **备份**：复制到 `docs/prd/.migration-backup/YYYY-MM-DD-<name>.md.bak`（除非 `--no-backup`）
3. **生成 CHANGELOG**：创建 `docs/prd/CHANGELOG-<name>.md`

   ```markdown
   # SDD Pack 变更历史
   > 来源：从 PRD 状态行自动迁移（sdd migrate）
   > 迁移日期：2026-06-29

   | 版本 | 日期 | 变更内容 |
   |------|------|---------|
   | 1.2.3 | 2026-06-25 | 版本号同步 |
   | 1.2.2 | 2026-06-25 | PRD 补齐 agent 能力 |
   | ...
   | 0.9.0-rc | 2026-06-24 | 静态 rules 阶段已通过 hook extension 替代 |
   ```

4. **规范化状态行**：

   ```markdown
   > 状态：已发布 | 发布日期：2026-06-25 | 版本：1.2.3
   > 变更历史：见 [CHANGELOG](./CHANGELOG-2026-06-24-sdd-pack.md)
   ```

5. **更新交叉引用**：检查所有引用此 PRD 的链接
6. **验证**：自动 `sdd validate <prd-path>`
7. **提交**：输出建议 `lore commit` 命令

**风险**：

| 风险 | 等级 | 缓解 |
|------|------|------|
| 版本条目解析错误 | 低 | dry-run + 备份 + 手动确认 |
| CHANGELOG 日期推断错误 | 低 | 不可识别日期标注 `日期待确认` |
| 交叉引用断裂 | 中 | 迁移后 validate，失败回滚 |
| 用户自定义格式 | 中 | 仅处理可识别格式，不可识别跳过 |

---

## 8. MVP 实施路径

### 8.1 阶段划分

```
Phase A: CLI 骨架              Phase B: 门禁集成             Phase C: 闭环完善
┌─────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────┐
│ sdd validate        │   │ Hook 接入                 │   │ sdd archive         │
│ 移植 docs-check.sh  │ → │ sdd validate --staged   │ → │ sdd migrate         │
│ 状态机校验            │   │ lore commit 自动触发     │   │ sdd status / list   │
│ JSON 输出            │   │ CI 集成                 │   │ 完整测试套件         │
│ sdd propose         │   │                          │   │                     │
└─────────────────────┘   └─────────────────────────┘   └─────────────────────┘
   ~3-5 天                     ~2-3 天                       ~2-3 天
   可独立交付                   依赖 Phase A                   依赖 Phase A+B
```

### 8.2 Phase A：CLI 骨架（propose + validate）

**交付物**：
1. `plugins/sdd-pack/src/cli/` 目录结构
2. `plugins/sdd-pack/bin/sdd` wrapper
3. `sdd validate` — 完整 10 项检查
4. `sdd propose` — PRD 创建
5. `plugins/sdd-pack/src/cli/lib/prd-state-machine.ts` — 状态机实现
6. 单元测试：状态机迁移、文件解析、校验规则

**验收**：
- `sdd validate` 对现有仓库 `docs/` 运行通过
- `sdd propose --dry-run` 输出正确模板内容
- 状态机拒绝 `已评审 → 草稿` 非法迁移

### 8.3 Phase B：与 lore 集成

**交付物**：
1. `hooks/index.ts` 修改：commit 拦截中增加 `sdd validate --staged` 子进程调用
2. `sdd validate --staged` 仅检查 git staged 变更涉及的 docs 文件
3. 硬拦截测试

### 8.4 Phase C：archive 闭环 + 完整集

**交付物**：
1. `sdd archive` — 完整归档流程
2. `sdd archive --merge-delta` — delta 合并逻辑
3. `sdd migrate` — 状态行堆叠迁移
4. `sdd status` / `sdd list` — 查询命令
5. 集成测试：完整 propose → validate → archive 生命周期

---

## 9. ADR 草案

### ADR-008：sdd CLI 工作流

**状态**：Proposed（待评审）

**决策人**：norman

**触发**：sdd-pack v1.2.3 PRD 状态行堆叠问题暴露文档生命周期操作缺乏自动化工具；`prd-change-management` rule 解决了判断逻辑但未解决执行落地。借鉴 OpenSpec CLI 的文档驱动约束思想。

**决策**：构建 `sdd` CLI（TypeScript + bun），定位为 sdd-pack 文档生命周期的权威入口，提供 `propose` / `validate` / `archive` 三个核心子命令 + 4 个辅助子命令。

**核心论据**：

1. **rule 不能替代 CLI**：`prd-change-management` rule 注入判断逻辑，但 rule 无法执行文件操作（移动、重命名、批量链接更新、lore commit 封装）
2. **skill 不能替代 CLI**：`sdd-core` / `sdd-prd` 指导 agent 操作，但依赖 agent 正确执行；agent 可能遗漏步骤
3. **docs-check.sh 不能替代 CLI**：bash 脚本覆盖 4 项结构检查，但无法做状态机合规性校验，也无法执行归档操作
4. **与现有守门体系正交**：CLI 做结构化检查（可程序化），三层守门 agent 做语义检查（需 LLM）。互补不重叠

**替代方案（已拒绝）**：

1. 等 omp 原生支持 — 不可控
2. 沿用纯 rule + skill 模式 — 已在 v1.2.3 验证不足
3. 引入 OpenSpec 产品 — 用户决策明确拒绝；产品 `changes/` 目录与 sdd-pack 现有 `prd/` 结构冲突
4. 用 Python/Rust/Go 写 CLI — 违反「TypeScript + bun」决策

**影响**：
- `plugins/sdd-pack/src/cli/` 新增 ~800–1200 行 TS（含测试）
- `plugins/sdd-pack/bin/sdd` 新增 ~10 行 wrapper
- `hooks/index.ts` 修改 ~30 行
- `docs/prd/_template.md` 新增 Δ 段（~30 行）
- 现有 `docs-check.sh` 不删除（CLI 内部可调用其逻辑）

**后续**：
- v1.3 CLI MVP 发布（Phase A 完成后）
- v1.4 门禁集成 + 完整集（Phase B+C）
- 跟踪：CLI 工作流是否降低文档操作错误率

---

## 10. 风险与回退

### 10.1 风险矩阵

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 范围爆炸 | 高 | 中 | MVP 严格限定 propose/validate/archive；完整集标记后续独立任务 |
| 与 hook 冲突 | 高 | 低 | CLI 是 hook 下游（hook 调用 CLI），不一致以 CLI 为准 |
| 用户认知负担 | 中 | 中 | CLI 是 opt-in（不配 alias 完全不受影响）；README 提供手动对照表 |
| bun 兼容性 | 中 | 低 | bun 是 omp 运行时依赖；`bin/sdd` 检查 bun 可用性 |
| `sdd migrate` 解析失败 | 中 | 中 | 自动备份 + dry-run + 不可识别格式跳过 |
| 性能（大仓库） | 低 | 低 | 当前仓库 ~30 文件，校验 < 100ms |
| 与 omp plugin 加载冲突 | 低 | 低 | `hooks/index.ts` 已是 TS，CLI 遵循相同模式 |

### 10.2 回退方案

**CLI 是 opt-in**：
- 不创建 `alias sdd=...` 的用户完全不受影响
- Phase A 未改 hook 前，CLI 与现有工作流零交集
- Phase B 改 hook 是增量式（仅增加 `sdd validate` 调用），出问题回退 hook 文件即可
- Phase C 仅操作 `docs/`，出错 `git checkout` 即可

### 10.3 渐进式推出

```
v1.3.0-rc.1: Phase A 完成 → 内部 dogfooding（norman 自己用）
v1.3.0-rc.2: Phase B 完成 → 小范围测试
v1.3.0:      Phase C 完成 → 正式发布,README 标注 CLI 为推荐工作流
v1.4.0+:     收集反馈,迭代
```
