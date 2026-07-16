# sdd-pack (omp marketplace plugin)

sdd-pack 是 **omp 上的一体化开发管理插件**:用 SDD 范式管理需求/阶段/审查/提交门禁的端到端工作流。
提供 omp 4 类资产(skills / rules / agents / extensions),通过 marketplace 装机即用。

**版本**: v1.6.0

## 0. 插件定位

- **角色**: omp marketplace plugin,为使用 SDD 流程的开发者提供"文档 + 提交 + 审查"端到端支持
- **4 类 omp 资产齐备**: 4 skills + 5 rules + 3 agents + 1 extension(15 slash commands)
- **commit 门禁三段式**: TTSR 软门禁(rules) → commit gate 硬门禁(`/sdd-gate-*` slash) → 三层守门 agent(reviewer / arch-reviewer / sdd-reviewer)
- **关键决策**: [ADR-009 sdd Extension 替代独立 CLI](../architecture/decisions.md) · [ADR-018 强状态流转 + meta.json 事实源](../architecture/decisions.md)

## 0.1 omp 组件矩阵(权威清单)

| omp 资产 | sdd-pack 内的目录/文件 | 作用 | 触发机制 |
| --- | --- | --- | --- |
| Skills | `skills/sdd-core` `skills/sdd-input` `skills/sdd-prd` `skills/sdd-phase` | 主 agent 看到 description → 主动 read SKILL.md 加载流程知识 | description 触发,主 agent 自主加载 |
| Rules | `rules/lore-protocol.md` `rules/docs-update-guard.md` `rules/lore-commit-guard.md` `rules/sdd-doc-edit-guard.md` `rules/prd-change-management.md` | TTSR 软门禁:在 tool_call 时由 hook 往消息流注入 system 提示,由主 agent 自觉遵守 | condition + scope 前缀匹配,`omp` 规则管线触发 |
| Agents | `agents/reviewer.md` `agents/arch-reviewer.md` `agents/sdd-reviewer.md` | 独立子线程审查,产物落 `.sdd/review/<sha>.<agent>.json` | task() 手动 spawn,**不绑 commit gate** |
| Extension | `extensions/sdd-extension/index.ts` | 注册 `/sdd-*` slash command + 拦截 tool_call(commit gate / session_start reminder / path gate) | `omp --extension <path>` 装载 |

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
| 软门禁 (TTSR) | 注入 system 提示,主 agent 自觉遵守 | 5 个 rules（omp plugin link 后自动发现） |
| 硬门禁 (程序级) | `pi.on("tool_call")` 返回 `{block: true, reason}` | `extensions/sdd-extension/index.ts` |
| 硬门禁 (程序级) | `/sdd-gate-*` slash command 返回 `status: "block"` | `extensions/sdd-extension/index.ts`（15 个 command） |
| 硬门禁 (程序级) | `gate-runner.ts` 的 5 阶段流水线(返回 `exitCode: 2`) | `src/cli/lib/gate-runner.ts` |

> **没有任何 rule 是程序级硬门禁**——所有 rule 都是 TTSR。硬门禁只有 slash command 和 `gate-runner` 两类。

## 1. 安装

### 推荐方式: omp plugin link（全部资产生效）

```bash
# 1. 添加 marketplace
omp plugin marketplace add Norman-pong/sdd-pack

# 2. link 安装（4 类资产全部生效: skills + rules + extensions + agents 装载）
omp plugin link ~/workspace/zhimingcool/sdd-pack/plugins/sdd-pack

# 3. 重启 omp session
```

> link 后自动生效: `/sdd-gate-*` slash command + 5 个 TTSR rule + tool_call 硬拦截 + skills。
> agents 需额外执行 `omp agents unpack` 复制到 `~/.omp/agent/agents/`。

### 兼容方式: omp plugin install（仅 skills 生效）

```bash
omp plugin install sdd-pack@sdd-pack
```

> ⚠ marketplace install 路径下 omp 不装载 extension module,5 个 rule 0 条装载,hook 不拦截。
> 仅 skills 自动发现。如需全部资产生效,改用 `omp plugin link`。

> **环境要求**: Node.js + bun(omp runtime 通过 bun 加载 extension .ts 文件)。
> **v1.6.0 起 hook 逻辑合并进 extension**:不再需要 `--hook` flag,tool_call 拦截由 extension 自带。

## 2. SDD 范式(正本)

### 2.1 资产清单

| 资产类型 | 内容                                                          |
| -------- | ------------------------------------------------------------- |
| skills   | `sdd-core` / `sdd-input` / `sdd-prd` / `sdd-phase` (4 个)     |
| rules    | `lore-protocol` / `docs-update-guard` / `lore-commit-guard` / `sdd-doc-edit-guard` / `prd-change-management` (5 个) |
| agents   | `reviewer` / `arch-reviewer` / `sdd-reviewer` (3 个守门 agent) |
| hook     | 合并进 `extensions/sdd-extension/index.ts`(commit gate + session_start reminder) |
| extension| `extensions/sdd-extension/index.ts`(15 个 `/sdd-*` slash command) |

### 2.2 Slash Commands(15 个)

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
| `/sdd <init|review|approve|back>`                               | PRD 强状态流转(ADR-018)                         |
| `/sdd-archive-phase <phase-path>`                               | 归档 Phase(ADR-017)                             |
| `/sdd-gate-lint`                                                | 门禁阶段1: lint(失败阻断后续)                   |
| `/sdd-gate-test`                                                | 门禁阶段2: 功能验证测试(缺则 skip)              |
| `/sdd-gate-review`                                              | 门禁阶段3: 检查 reviewer 产物存在且通过         |
| `/sdd-gate-precommit`                                           | 门禁阶段4: 再跑 lint + lore 约束检查            |
| `/sdd-gate-commit`                                              | 门禁阶段5: lore commit(--message 传 JSON)       |

### 2.3 lore commit 协议

SDD 在 commit 时通过 `extensions/sdd-extension/index.ts` 拦截,调用 `api.validateDocs({ staged: true })`:

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


## 5. CI 集成

SDD 范式 CI 逃生通道(在不启动 omp 的场景下执行校验):

```bash
bun run plugins/sdd-pack/src/cli/api-runner.ts validate --staged --json
bun run plugins/sdd-pack/src/cli/api-runner.ts status --json
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
```

## 6. 开发模式

```bash
# 在 sdd-pack 仓库根
omp plugin link ./plugins/sdd-pack

# 修改插件内容,重启 omp 即生效
# - skills/: 改 SKILL.md / references / templates
# - rules/: 改 *.md(纯静态参考)
# - agents/: 改 *.md agent prompt
# - extensions/: 改 slash command 注册逻辑 + tool_call 拦截
# - src/cli/: 改 api.ts / lib/

# 开发完成后
omp plugin uninstall sdd-pack@sdd-pack
```

**调试提示**:

- extension 改动需重启 omp(`pi.registerCommand` 仅在装载时执行一次)
- api 改动需同时跑测试:

  ```bash
  bun test plugins/sdd-pack/  # 应 0 fail
  ```

## 7. 迁移

### v1.6.0 → v1.8.0(规划中)

- OpenSpec 双范式移除,SDD 单范式
- `extensions/openspec-extension/` 删除,`src/cli/openspec-api.ts` 删除
- ADR-010/011 标记 Superseded
- hook 逻辑合并进 extension(ADR-015)

### v1.4.0-alpha → v1.5.0-alpha

| 维度       | v1.4.0-alpha                              | v1.5.0-alpha                                          |
| ---------- | ----------------------------------------- | ----------------------------------------------------- |
| hooks 装载 | `hooks/index.ts`(单文件 4+1 hook 聚合)    | 合并进 `extensions/sdd-extension/index.ts` |
| extension  | 单 `sdd-extension`(8 `/sdd-*`)            | `sdd-extension` |
| assets     | skills/rules/agents 退役(只剩 hook)        | skills/rules/agents 恢复正本 |
| API        | `src/cli/api.ts`(SDD 8 export)             | `api.ts`(SDD 8 export) |

### 升级步骤

```bash
# 1. 拉取最新 marketplace catalog
omp plugin upgrade sdd-pack@sdd-pack

# 2. 重启 omp 装载新 manifest
omp --version

# 3. 跑测试确认兼容
bun test plugins/sdd-pack/  # 应 0 fail
```

### 兼容性声明

- **extension 接口**:`/sdd-*` 命令完全兼容,无需迁移
- **programmatic API**:`api.ts` export 签名不变,无需迁移

### 回滚

```bash
omp plugin install sdd-pack@sdd-pack@1.6.0
```

## 故障排查

详见 [`docs/troubleshooting.md`](../docs/troubleshooting.md)(如不存在,看 git history 中的 v1.4 README §故障排查)。

## 卸载

```bash
omp plugin uninstall sdd-pack@sdd-pack
omp plugin marketplace remove sdd-pack
rm -rf ~/.omp/plugins/cache/plugins/sdd-pack___sdd-pack___1.6.0
```

## 版本对应

- v1.6.0 → v1.8.0(规划中): OpenSpec 移除 + 强状态流转 + meta.json 事实源 + hook 合并进 extension
- git tag 与 plugin version 保持一致
- 升级前建议备份 `plugins/sdd-pack/skills/sdd-*/SKILL.md` 本地修改(若有)