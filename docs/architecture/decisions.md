# Architecture Decision Records (ADR)

> 仓库 `zhimingcool/sdd-pack` 的架构决策记录
> 命名: ADR-NNN(顺序编号)
> 状态: Proposed / Accepted / Superseded

---

## ADR-006: hook extension 替代 static rules(CLI flag 装载)

**状态**: Accepted(2026-06-24,v1.1.0)
**决策人**: norman
**触发**: B1.2 实测 omp v16.1.16 plugin 装载器不识别 `omp.hooks` manifest 字段(`docs/phase/.working/2026-06-24-sdd-pack/v1.1-decision.md`)
**影响**: 替代 PRD §3.2.4 中"hook extension fallback"方案;改变 0.9.0-rc 中 4 个 rule 仅作为静态资产不自动加载的状态

### 背景

sdd-pack 0.9.0-rc 的 4 个 rule(`lore-protocol` / `docs-update-guard` / `lore-commit-guard` / `sdd-doc-edit-guard`)作为静态 markdown 文件打包,但 omp v16.1.16 在 marketplace install 与 local link 两种 plugin 装载模式下都不自动发现这些 rule(详见 `docs/prd/2026-06-24-sdd-pack.md` §11.3 验证报告)。

PRD §3.2.4 提出的 fallback 方案是:把 rule 改写为 hook extension,通过 `pi.on("tool_call", ...)` 拦截工具调用实现等价功能。

### 决策

**采用 hook extension 方案,但装载方式改为 CLI flag 而非 plugin manifest**。原因:omp v16.1.16 的 plugin 装载器未实现 `omp.hooks` 字段(issue #677 历史反馈,#1496 修复后未确认),但 `--hook <file>` CLI flag 能直接加载 hook 文件,hook runtime 本身工作。

### 方案

#### Hook 装载

```bash
# 启动 omp 时显式加载 hook
omp --hook <plugin-root>/hooks/index.ts [其他命令...]

# alias 持久化(写入 ~/.zshrc 或 ~/.bashrc)
alias omp='omp --hook /path/to/sdd-pack/plugins/sdd-pack/hooks/index.ts'
```

#### 4 个 rule → hook 映射

| 原 rule | alwaysApply | condition | scope | hook 实现 | 行为 |
|---|---|---|---|---|---|
| `lore-protocol.md` | `true` | — | — | `pi.on("session_start")` 注入 lore reminder | 启动 omp 时系统提示含 lore commit 协议摘要 |
| `docs-update-guard.md` | — | `(git\|lore)\s+commit` | `tool:bash` | `pi.on("tool_call")` 匹配 `git\|lore commit`,`pi.sendMessage` 提示走 sdd-core | 不拦截,仅提示 |
| `lore-commit-guard.md` | — | `(git\|lore)\s+commit` | `tool:bash` | `pi.on("tool_call")` 匹配,`return { block: true, reason }` 硬拦截 | 强制用 lore commit |
| `sdd-doc-edit-guard.md` | — | — | `tool:write/edit(docs/**)` | `pi.on("tool_call")` 匹配 `docs/`,`return { block: true, reason }` | docs/ 写入走 sdd-core skill |

#### 副作用与权衡

- **正面**: 4 个 rule 真正激活,功能等价 native rules
- **代价**:
  - 用户启动 omp 必须加 `--hook` flag(或配 alias),增加一步
  - hook 是 TS 文件,需 Node.js + bun(omp runtime 通过 bun 加载)
  - `lore-protocol` 始终应用通过 `session_start` 注入消息,时机与原生 `alwaysApply` 不同(原生是 system prompt 字段,本方案是运行时 sendMessage)
- **风险**:
  - 0.9.0-rc 期间 `~/.omp/agent/rules/` 下的 native rules 保留;v1.1 验证通过后才移除(B1.7)
  - 移除 native rules 前必须先 B1.6 hook 验证通过,否则直接破坏 lore 提交工作流(与 `fallback-decision.md` §3 一致的风险)

### 替代方案(已拒绝)

1. **patch 路径**(发 0.9.1 占位 release,v1.1 推迟): hook runtime 实际工作,推迟浪费
2. **等 omp 上游修复 plugin manifest**: 不可控,等不及
3. **保留 native rules + 不实施 hook**: 0.9.0-rc 当前状态,功能受限
4. **重写为 npm package + omp.extension**: 引入 `npm install` 依赖,违反 PRD §4.1「不依赖 npm 包」原始约束;且 omp 16.1.16 extension 装载同样未实测

### 后续

- v1.2(若启动): 评估 omp 上游 `omp.hooks` 字段支持进度;若已实现,plugin manifest 路径替换 CLI flag 路径
- 跟踪 issue: https://github.com/Norman-pong/sdd-pack/issues/1(v1.1 完成后关闭)
