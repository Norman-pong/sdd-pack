# sdd-pack (omp marketplace plugin)

sdd-pack 是 **omp 上的一体化开发管理插件**:用 SDD 范式(正本)或 OpenSpec 范式(可选)管理需求/阶段/审查/提交门禁的端到端工作流。
提供 omp 全部 5 类资产(skills / rules / agents / extensions / hooks),通过 marketplace 装机即用。

**版本**: v1.5.1

## 0. 插件定位

- **角色**: omp marketplace plugin(双范式),为使用 SDD 或 OpenSpec 流程的开发者提供"文档 + 提交 + 审查"端到端支持
- **5 类 omp 资产齐备**: 4 skills + 5 rules + 3 agents + 2 extensions(20 slash commands)+ 2 hooks(SDD/OpenSpec 二选一)
- **commit 门禁三段式**: TTSR 软门禁(rules) → commit gate 硬门禁(`/sdd-gate-*` slash) → 三层守门 agent(reviewer / arch-reviewer / sdd-reviewer)
- **关键决策**: [ADR-009 sdd Extension 替代独立 CLI](../architecture/decisions.md) · [ADR-010 hook 改默认实现](../architecture/decisions.md) · [ADR-011 双范式架构](../architecture/decisions.md)

## 0.1 omp 组件矩阵(权威清单)

| omp 资产 | sdd-pack 内的目录/文件 | 作用 | 触发机制 |
| --- | --- | --- | --- |
| Skills | `skills/sdd-core` `skills/sdd-input` `skills/sdd-prd` `skills/sdd-phase` | 主 agent 看到 description → 主动 read SKILL.md 加载流程知识 | description 触发,主 agent 自主加载 |
| Rules | `rules/lore-protocol.md` `rules/docs-update-guard.md` `rules/lore-commit-guard.md` `rules/sdd-doc-edit-guard.md` `rules/prd-change-management.md` | TTSR 软门禁:在 tool_call 时由 hook 往消息流注入 system 提示,由主 agent 自觉遵守 | condition + scope 前缀匹配,`omp` 规则管线触发 |
| Agents | `agents/reviewer.md` `agents/arch-reviewer.md` `agents/sdd-reviewer.md` | 独立子线程审查,产物落 `.sdd/review/<sha>.<agent>.json` | task() 手动 spawn,**不绑 commit gate** |
| Extension | `extensions/sdd-extension/index.ts` `extensions/openspec-extension/index.ts` | 注册 `/sdd-*` 与 `/openspec-*` slash command,主 agent 在 omp 内调用 | `omp --extension <path>` 装载 |
| Hook | `hooks/sdd/index.ts` `hooks/openspec/index.ts` | 拦截 tool_call,执行 commit gate / session_start reminder / path gate | `omp --hook <path>` 装载(SDD/OpenSpec 二选一) |

## 0.2 三层守门 agent 分工

| 层 | Agent | 触发 | blocking | 产物文件 | 触发场景 |
| --- | --- | --- | --- | --- | --- |
| Layer 1 commit gate | `reviewer` | `/sdd-gate-review` 流水线阶段 3 spawn | 是 | `.sdd/review/<sha>.reviewer.json` | 每次 commit |
| Layer 2 PR/plan gate | `arch-reviewer` | 手动 task() | 否 | `.sdd/review/<sha>.arch-reviewer.json`(若启用) | PR / 架构决策前 |
| Layer 3 merge/phase gate | `sdd-reviewer` | 手动 task() | 否 | `.sdd/review/<sha>.sdd-reviewer.json`(若启用) | phase 收尾 / merge 前 |

> 默认只启用 Layer 1;Layer 2/3 需在 `.sdd/gate.json` 的 `reviewers` 字段加 `"arch-reviewer"` 和/或 `"sdd-reviewer"` 后才会被 `/sdd-gate-review` 检查产物。

## 0.3 门禁模型:软门禁 vs 硬门禁

| 层次 | 机制 | 提供者 |
| --- | --- | --- |
| 软门禁 (TTSR) | 注入 system 提示,主 agent 自觉遵守 | 5 个 rules + `hooks/sdd/index.ts` 的 commit gate 提示 |
| 软门禁 (TTSR) | 路径写入时路由到 SDD skill | `rules/sdd-doc-edit-guard` + `rules/prd-change-management` |
| 硬门禁 (程序级) | `/sdd-gate-*` slash command 返回 `status: "block"` | `extensions/sdd-extension/index.ts` |
| 硬门禁 (程序级) | `gate-runner.ts` 的 5 阶段流水线(返回 `exitCode: 2`) | `src/cli/lib/gate-runner.ts` |

> **没有任何 rule 是程序级硬门禁**——所有 rule 都是 TTSR。硬门禁只有 slash command 和 `gate-runner` 两类。

## 1. 安装

```bash
# 1. 添加 marketplace
omp plugin marketplace add Norman-pong/sdd-pack

# 2. 安装 plugin
omp plugin install sdd-pack@sdd-pack

# 3. (二选一)装载 hook — 默认推荐 SDD 守卫
echo "alias omp='omp --hook $(pwd)/plugins/sdd-pack/hooks/sdd/index.ts'" >> ~/.zshrc
source ~/.zshrc

# 4. 或装载 OpenSpec 守卫
echo "alias omp='omp --hook $(pwd)/plugins/sdd-pack/hooks/openspec/index.ts'" >> ~/.zshrc
source ~/.zshrc
```

> **环境要求**: Node.js + bun(omp runtime 通过 bun 加载 hook .ts 文件)。
> **v1.5.0-alpha 起 hook 二选一**:不装载 hook 时仅 extension(slash command)工作,无守卫;装载 hook 后获得 commit gate / session_start reminder。

## 2. SDD 范式(正本)

### 2.1 资产清单

| 资产类型 | 内容                                                          |
| -------- | ------------------------------------------------------------- |
| skills   | `sdd-core` / `sdd-input` / `sdd-prd` / `sdd-phase` (4 个)     |
| rules    | `lore-protocol` / `docs-update-guard` / `lore-commit-guard` / `sdd-doc-edit-guard` / `prd-change-management` (5 个) |
| agents   | `reviewer` / `arch-reviewer` / `sdd-reviewer` (3 个守门 agent) |
| hook     | `hooks/sdd/index.ts`(commit gate + session_start reminder)    |
| extension| `extensions/sdd-extension/index.ts`(8 个 `/sdd-*` slash command) |

### 2.2 Slash Commands(8 个)

| 命令                                                            | 描述                                            |
| --------------------------------------------------------------- | ----------------------------------------------- |
| `/sdd-validate [--path] [--staged] [--severity warn\|error\|block]` | 校验 docs/(10 项检查) + 状态机合规              |
| `/sdd-propose --title <name> [--type full\|delta] [--supersedes]` | 创建新 PRD 或 delta 变更                        |
| `/sdd-archive <prd-path> [--reason completed\|replaced] [--merge-delta]` | 归档 PRD                                  |
| `/sdd-migrate <prd-path> [--dry-run]`                           | 状态行堆叠 → 规范格式 + CHANGELOG                |
| `/sdd-status`                                                   | 所有 PRD/Phase 状态总览                         |
| `/sdd-list [--status] [--keyword] [--type prd\|phase]`           | 带过滤的文档列表                                |
| `/sdd-why <file>:<line> [--json]`                               | 查询 lore 决策上下文                            |
| `/sdd-apply <prd-path> [--json]`                                | 打印 PRD 验收标准 checklist                     |

### 2.3 lore commit 协议

SDD hook 在 commit 时通过 `hooks/sdd/index.ts` 拦截,调用 `api.validateDocs({ staged: true })`:

- `pass` / `warn` → 放行
- `error` → 警告(默认 severity=error)
- `block` → 拒绝 commit

commit message 走 `lore commit`,包含以下 trailer:

- `Constraint:` 约束条件
- `Rejected:` 拒绝方案及理由
- `Tested:` 测试通过证据
- `Reversibility:` 可逆性评估
- `Scope-risk:` 影响范围
- `Confidence:` 信心等级

## 3. OpenSpec 范式(可选 hook 默认实现)

> **不装载 `hooks/openspec/index.ts` 时,仅 `/openspec-*` extension 工作(无守卫)**

### 3.1 资产清单

| 资产类型 | 内容                                                                       |
| -------- | -------------------------------------------------------------------------- |
| hook     | `hooks/openspec/index.ts`(OpenSpec 守卫:session_start reminder + path gate) |
| extension| `extensions/openspec-extension/index.ts`(7 个 `/openspec-*` slash command)  |

### 3.2 Slash Commands(7 个)

| 命令                                          | 描述                                                    |
| --------------------------------------------- | ------------------------------------------------------- |
| `/openspec-init-check`                        | 检查 openspec/ 目录初始化状态                           |
| `/openspec-status`                            | 查看所有 change 当前状态                                |
| `/openspec-validate`                          | 校验 change 规范 + 任务清单完整性                       |
| `/openspec-list [--status] [--keyword]`       | 带过滤的 change 列表                                    |
| `/openspec-show <change-id>`                  | 查看指定 change 详情                                    |
| `/openspec-instructions <change-id>`          | 打印 change 实施步骤                                    |
| `/openspec-archive <change-id>`               | 归档 change                                             |

### 3.3 工作流

```
# 1. 检查初始化
/openspec-init-check

# 2. 创建新 change(走 OpenSpec CLI 或 openspec 目录手写)
/openspec-list  # 看现有 change

# 3. 校验 + 实施
/openspec-validate <change-id>
/openspec-instructions <change-id>

# 4. 归档
/openspec-archive <change-id>
```

> **OpenSpec 与 SDD 互斥装载**:同一时间只能装载 `hooks/sdd/index.ts` 或 `hooks/openspec/index.ts`,二者守卫路径不同(SDD 守 `docs/prd/`,OpenSpec 守 `openspec/changes/`)。详见 ADR-011。

## 4. 双范式选择

**默认推荐 SDD**(本仓库正本)。需要 OpenSpec 时切换 hook 装载:

```bash
# 切到 OpenSpec(改 alias 后 source)
echo "alias omp='omp --hook $(pwd)/plugins/sdd-pack/hooks/openspec/index.ts'" > ~/.omp_sdd_alias
echo "alias omp-sdd='omp --hook $(pwd)/plugins/sdd-pack/hooks/sdd/index.ts'" >> ~/.omp_sdd_alias
source ~/.omp_sdd_alias

# 用 OpenSpec 守卫启动
omp

# 或临时切回 SDD
omp-sdd
```

| 维度       | SDD                                | OpenSpec                              |
| ---------- | ---------------------------------- | ------------------------------------- |
| 范式       | 文档驱动约束 + 本仓库实现          | 文档驱动约束 + 外部规范参考实现       |
| 数据目录   | `docs/prd/` / `docs/phase/`        | `openspec/changes/` / `openspec/specs/` |
| 守门 hook  | `hooks/sdd/index.ts`               | `hooks/openspec/index.ts`             |
| slash 数量 | 8 `/sdd-*`                         | 7 `/openspec-*`                       |
| API 入口   | `src/cli/api.ts`(8 export)         | `src/cli/openspec-api.ts`(7 export)   |
| 适用范围   | sdd-pack 自家仓库开发              | 接入 OpenSpec 生态 / 跨工具协同      |

## 5. CI 集成(双范式 CI runner)

两个范式都有 CI 逃生通道(在不启动 omp 的场景下执行校验):

```bash
# SDD 范式
bun run plugins/sdd-pack/src/cli/api-runner.ts validate --staged --json
bun run plugins/sdd-pack/src/cli/api-runner.ts status --json

# OpenSpec 范式
bun run plugins/sdd-pack/src/cli/openspec-api-runner.ts validate --json
bun run plugins/sdd-pack/src/cli/openspec-api-runner.ts status --json
```

退出码约定:`pass=0`, `warn=0`, `error=1`, `block=2`。

GitHub Actions 示例(`.github/workflows/docs-ci.yml`):

```yaml
name: docs-ci
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun run plugins/sdd-pack/src/cli/api-runner.ts validate --staged --json
      - run: bun run plugins/sdd-pack/src/cli/openspec-api-runner.ts validate --json
```

## 6. 开发模式

```bash
# 在 sdd-pack 仓库根
omp plugin link ./plugins/sdd-pack

# 修改插件内容,重启 omp 即生效
# - skills/: 改 SKILL.md / references / templates
# - rules/: 改 *.md(纯静态参考)
# - agents/: 改 *.md agent prompt
# - hooks/sdd/ 或 hooks/openspec/: 改 .ts 守卫逻辑
# - extensions/: 改 slash command 注册逻辑
# - src/cli/: 改 api.ts / openspec-api.ts / lib/

# 开发完成后
omp plugin uninstall sdd-pack@sdd-pack
```

**v1.5.0-alpha 调试提示**:

- hook 改动必须重启 omp 并加 `--hook` flag
- extension 改动需重启 omp(`pi.registerCommand` 仅在装载时执行一次)
- api 改动需同时跑测试:

  ```bash
  bun test plugins/sdd-pack/  # 跨范式全测试,应 0 fail
  ```

## 7. 迁移(v1.4.0-alpha → v1.5.0-alpha)

### 7.1 关键变化

| 维度       | v1.4.0-alpha                              | v1.5.0-alpha                                          |
| ---------- | ----------------------------------------- | ----------------------------------------------------- |
| hooks 装载 | `hooks/index.ts`(单文件 4+1 hook 聚合)    | `hooks/sdd/index.ts` + `hooks/openspec/index.ts`(二选一) |
| extension  | 单 `sdd-extension`(8 `/sdd-*`)            | `sdd-extension` + `openspec-extension`(共 15 个 slash) |
| assets     | skills/rules/agents 退役(只剩 hook)        | skills/rules/agents 恢复正本,OpenSpec 仅 hook+extension |
| API        | `src/cli/api.ts`(SDD 8 export)             | `api.ts`(SDD 8 export)+ `openspec-api.ts`(OpenSpec 7 export) |
| PRD 状态    | v1.4 sdd-extension PRD `已评审`            | v1.4 PRD `已替换` → 双范式总览 PRD `已发布`           |

### 7.2 升级步骤

```bash
# 1. 拉取最新 marketplace catalog
omp plugin upgrade sdd-pack@sdd-pack

# 2. 改 hook 装载路径(从单文件变成二选一)
# 旧:
alias omp='omp --hook $(pwd)/plugins/sdd-pack/hooks/index.ts'
# 新(SDD 默认推荐):
alias omp='omp --hook $(pwd)/plugins/sdd-pack/hooks/sdd/index.ts'
# 或(OpenSpec):
alias omp='omp --hook $(pwd)/plugins/sdd-pack/hooks/openspec/index.ts'
source ~/.zshrc

# 3. 重启 omp 装载新 manifest
omp --version  # 确认 1.5.0-alpha

# 4. 跑测试确认兼容
bun test plugins/sdd-pack/  # 应 0 fail
```

### 7.3 兼容性声明

- **extension 接口**:`/sdd-*` 8 个命令完全兼容,无需迁移
- **programmatic API**:`api.ts` 8 个 export 签名不变,无需迁移
- **hook 路径**:`hooks/index.ts` → `hooks/sdd/index.ts`,需要更新 alias
- **OpenSpec 用户**:v1.4 之前没有 OpenSpec 资产,本版本为首次引入;无需迁移,直接安装即可

### 7.4 回滚

如需回滚到 v1.4.0-alpha:

```bash
omp plugin install sdd-pack@sdd-pack@1.4.0-alpha
# 改 alias 指向旧 hook 路径
alias omp='omp --hook $(pwd)/plugins/sdd-pack/hooks/index.ts'
```

## 故障排查

详见 [`docs/troubleshooting.md`](../docs/troubleshooting.md)(如不存在,看 git history 中的 v1.4 README §故障排查)。

## 卸载

```bash
omp plugin uninstall sdd-pack@sdd-pack
omp plugin marketplace remove sdd-pack
rm -rf ~/.omp/plugins/cache/plugins/sdd-pack___sdd-pack___1.5.0-alpha
```

## 版本对应

- v1.4.0-alpha → v1.5.0-alpha: hook 拆分 + OpenSpec 镜像 + 双范式 PRD
- git tag 与 plugin version 保持一致
- 升级前建议备份 `plugins/sdd-pack/skills/sdd-*/SKILL.md` 本地修改(若有)