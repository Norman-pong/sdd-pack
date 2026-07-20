# AGENTS.md — sdd-pack 仓库

> 详细设计以 `docs/` 为准，本文件只提供核心理念和溯源入口。

## 这是什么

sdd-pack 是 omp marketplace 插件：把 SDD 范式的需求/阶段/审查/提交门禁工作流打包成 omp 5 类资产（skills/rules/agents/extensions/hooks）分发。插件本体在 `plugins/sdd-pack/`。

## 架构理念

**omp 5 类资产不互相替代**——各有触发机制：

- Skills：主 agent 看 description 自主加载，提供流程知识
- Rules：TTSR 软门禁，注入提示让 agent 自觉遵守（**无程序级拦截**）
- Extensions：**唯一的硬门禁来源**——`pi.on("tool_call")` 返回 `{block:true}` + slash command 注册
- Agents：手动 spawn 的审查子线程，产物落 `.sdd/review/`
- Hooks：v1.6.0 起合并进 extension，不再独立装载

**关键区别**：`omp plugin link`（5 类资产全生效）vs `omp plugin install`（仅 skills）。

> 溯源：ADR-006（hook 替代 static rules）· ADR-009（extension 替代 CLI）· ADR-011（双范式）

**SDD 范式**：文档驱动（PRD/Phase 状态机）+ lore commit（禁止裸 git commit）+ 三层守门 agent。双范式与 OpenSpec 互斥。

## 溯源索引

| 主题 | 去哪看 |
| --- | --- |
| 插件全貌 + 安装/使用 | `plugins/sdd-pack/README.md` |
| 架构决策（ADR） | `docs/architecture/decisions.md` |
| 门禁流水线 | `docs/architecture/sdd-gate.md` |
| SDD 规范 | `plugins/sdd-pack/skills/sdd/SKILL.md` |
| 当前 PRD | `docs/prd/2026-07-16-sdd-pack.md` |
| 文档总索引 | `docs/index.md` |
