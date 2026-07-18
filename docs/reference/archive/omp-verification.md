# OMP 验证方案

## Case 1: 非 Git 目录

- 启动 OMP
- 执行 `/openspec-init-check`
- 预期：提示未启用，不阻断

## Case 2: Git 仓库但未 init OpenSpec

- 创建 `.git/`
- 不创建 `openspec/`
- 尝试写入 `openspec/specs/auth/spec.md`
- 预期：提示先 init，不进入 block

## Case 3: Git + OpenSpec 已初始化

- 创建 `.git/`
- 创建 `openspec/specs/` 与 `openspec/changes/`
- 直接写 `openspec/specs/...`
- 预期：hook 拦截并提示走 `/openspec-*` 或 `openspec` CLI

## Case 4: 命令正路

- 执行 `/openspec-status`
- 执行 `/openspec-validate`
- 预期：返回结构化结果，且 UI 有摘要通知

## Case 5: 提交门禁

- 在已启用项目里执行 `git commit`
- 预期：hook 先跑 `validate` 与 `status` gate，失败时阻断
