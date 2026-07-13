# OpenSpec Harness 参考

## 判定条件

- 当前目录是 Git 仓库
- 存在 `openspec/specs/`
- 存在 `openspec/changes/`

## 正规入口

- `/openspec-init-check`
- `/openspec-status`
- `/openspec-validate`
- `/openspec-list`
- `/openspec-show`
- `/openspec-instructions`
- `/openspec-archive`

## CI 入口

- `bun run plugins/sdd-pack/src/cli/api-runner.ts init-check`
- `bun run plugins/sdd-pack/src/cli/api-runner.ts validate`
- `bun run plugins/sdd-pack/src/cli/api-runner.ts status`

## 阻断行为

- 在已启用状态下直接写入 `openspec/specs/**`
- 在已启用状态下直接写入 `openspec/changes/**`
- 在已启用状态下绕过 OpenSpec 生命周期直接修改 `AGENTS.md`
- 在 `validate` / `status` 失败时执行提交
