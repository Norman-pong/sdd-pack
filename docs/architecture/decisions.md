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

### 状态更新(2026-06-29,v1.2.4 实测 + 官方文档核验)

**触发事实**:

- omp v16.2.4 官方文档(`docs/rulebook-matching-pipeline.md` §2 + `docs/skills.md` "Built-in skill providers and precedence")明确:`omp-plugins` provider(priority 90)**设计上即扫描** plugin 的 `rules/*.{md,mdc}` 与 `skills/<name>/SKILL.md`,与 `native` provider 共存去重
- PR #1498 "fix(discovery): wire extension package sub-dirs"(2026-05-29,已合入)修复了 `omp plugin install`/`omp plugin link` 注册的包的子目录发现(Fixes #1496)
- 跟踪 issue:https://github.com/Norman-pong/sdd-pack/issues/1 v16.1.16 阶段开启,v16.2.x 起对应修复已合入上游

**本机实测**(2026-06-29,omp v16.2.4):

- 配置:`~/.omp/plugins/node_modules/sdd-pack` symlink 指向工作树;`omp-plugins.lock.json` 显示 `sdd-pack` 已 `enabled: true`;`omp plugin discover` 列出 `sdd-pack@1.2.3`
- 全新 omp 进程(`omp -p ... --no-session`)读 `rule://docs-update-guard` / `rule://prd-change-management` 均报 `Unknown rule`;available 列表仅含 19 个 native rules(`rs-*`/`ts-*`/`frontend-use-vp`),**0 个 plugin rule**
- 同样方式读 `skill://sdd-core` 报 `Unknown skill`,available 列表仅含本机 managed-skills,**0 个 plugin skill**

**结论**:**官方文档说支持,本机实测不工作**——根因待查(provider 加载时序 / 缓存 / 配置开关均可能),不在本 ADR 范围内

**对本 ADR 决策的影响**:

- ADR-006 决策**保持 Accepted,不变**(历史决策如实记录;前提"omp 不发现 plugin rules"在 v16.1.16 成立)
- 但**当前 hook 仍需保留**——hook 提供 `lore-commit-guard` 的 `block: true` 硬拦截能力(强制 `git commit` 改走 `lore commit`),这是 omp rule 体系**做不到**的能力(`rule.interruptMode` 仅控制 steering 队列,不拦截工具调用,详见 `docs/hooks.md` 与 `docs/rulebook-matching-pipeline.md`)
- 因此 hook 当前的定位**不是"过渡方案的待退役代码",而是"提供 rule 不可替代拦截能力的运行时层"**

**迁移路线**(待触发条件满足):

1. 触发条件:omp-plugins provider 在本机实测能发现 plugin rules/skills(全新 omp 进程 `read rule://docs-update-guard` 返回规则内容而非 `Unknown`)
2. 阶段 a:把 `lore-protocol` 改用 `alwaysApply: true`(去掉 session_start sendMessage)
3. 阶段 b:把 `docs-update-guard` / `sdd-doc-edit-guard` 改用 `scope` + `condition`(去掉 tool_call 提示分支)
4. 阶段 c:`lore-commit-guard` 硬拦截能力需等 omp 提供 rule-level tool blocking(目前无此能力)——届时**该 rule 的功能可能需要保留为 hook 或重新设计**
5. 阶段 d:hooks/ 目录移除;README §5 "与 native rules 的共存" 章节删除;CHANGELOG 标注 hook 退役

---

## ADR-007: 代码评审拆为三层守门 agent(非单体 reviewer)

**状态**: Accepted(2026-06-25,v1.2.0)
**决策人**: norman
**触发**: sdd-pack v1.2.0 引入代码评审能力;单体 reviewer vs 三层分离的设计选择
**影响**: 新增 `plugins/sdd-pack/agents/` 目录(reviewer/arch-reviewer/sdd-reviewer);reviewer 覆盖 bundled 同名;arch/sdd-reviewer 为手动 task() 触发

### 背景

omp 内置一个 bundled `reviewer` agent(commit gate)。sdd-pack 需要补充架构评审(arch)和文档一致性(sdd)两个维度。可选方案:扩展现有 reviewer 为多模式 agent,或拆为三个单一 persona 的 agent。

### 决策

**采用三层分离,而非单体多模式**。三个 agent 各有独立的 persona、触发时机、severity 体系、output schema:

| 层 | Agent | 触发 | blocking | 认知模式 | verdict |
|---|---|---|---|---|---|
| Layer 1 | reviewer | commit gate 自动 | true | 局部、演绎、patch 锚定 | overall_correctness |
| Layer 2 | arch-reviewer | PR/milestone/plan 手动 | false | 全局、归纳、趋势感知 | overall_quality |
| Layer 3 | sdd-reviewer | phase/merge 手动 | false | 文档交叉引用、契约比对 | overall_conformance |

### 方案

#### 发现与触发

- 三个 agent 放 `plugins/sdd-pack/agents/*.md`,由 omp task-agent discovery 从 plugin `agents/` 子目录发现(优先级 3)
- `reviewer` 覆盖 bundled 同名(first-wins:plugin 源优先于 bundled)
- `arch-reviewer`/`sdd-reviewer` 为新增名,无冲突
- commit gate 仍由 `commit-review.ts` 扩展自动调用 `reviewer`(通过 `[omp-review:ok]` token,不解析 verdict JSON)
- arch/sdd-reviewer 由用户手动 `task(agent="arch-reviewer")` / `task(agent="sdd-reviewer")` 触发

#### 职责边界(防重叠)

- **reviewer** 不做全仓架构扫描或完整 docs/ 树读取(那是 Layer 2/3 的活)
- **arch-reviewer** 不报 runtime bug(那是 reviewer 的活);支持 code mode + plan mode 双模式
- **sdd-reviewer** 不评审代码质量(那是 reviewer/arch-reviewer 的活),不写文档(那是 sdd-core/prd/phase 的活)

#### 副作用与权衡

- **正面**: 每个 agent 单一 persona,LLM 表现力集中;commit gate 保持快速(只跑 reviewer);PR/phase gate 可慢但彻底
- **代价**: 三个 agent 文件需分别维护;用户需记住何时调哪个 agent(有 skill://omp-three-layer-reviewer 指导)

### 替代方案(已拒绝)

1. **单体多模式 reviewer**: 一个 agent 同时处理 commit/PR/phase 三种评审 — LLM 在多模式间稀释表现力;commit gate 被慢审查拖累;小补丁被过度评审。三层认知模式差异大(局部演绎 vs 全局归纳 vs 文档比对),不适合塞进一个 prompt
2. **仅扩展 bundled reviewer,不新增 arch/sdd**: 缺少架构和文档一致性维度,评审覆盖不全
3. **用 rule 实现代码评审**: rule 是文本拦截,无 LLM 推理能力,无法做 patch 锚定的 bug 分析或架构趋势判断

### 后续

- v1.2.1: sdd-reviewer 增加三态判定(体系不存在/已初始化未启用/部分启用/完整启用),避免无 PRD 时的越界误报
- 评估:是否需要 Layer 4(security-reviewer 安全评审)或 Layer 0(lint 快速门)
- agent 数量增长后的管理:考虑 agent 发现性能与 prompt 维护成本
