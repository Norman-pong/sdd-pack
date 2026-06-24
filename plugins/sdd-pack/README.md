# sdd-pack (omp marketplace plugin)

> **状态: 0.9.0-rc** — 本版本只发布 **skills + docs-check.sh** 静态资产。
> rules 自动加载(4 个 rule: lore-protocol / docs-update-guard / lore-commit-guard / sdd-doc-edit-guard)
> 在当前 omp v16.1.16 上**未被 `omp-plugins provider` 发现**(marketplace install + local link 两种模式都不行)。
> v1.0.0 推迟到 v1.1,届时通过 omp 上游修复或 hook extension 实现。
> 详见 [`docs/prd/2026-06-24-sdd-pack.md` §11.3](https://github.com/Norman-pong/sdd-pack/blob/main/docs/prd/2026-06-24-sdd-pack.md) 验证报告。

## 1. 安装

```bash
# 1. 添加 marketplace
omp plugin marketplace add Norman-pong/sdd-pack

# 2. 安装 plugin
omp plugin install sdd-pack@sdd-pack
```

安装后 4 个 SDD 技能(`sdd-core` / `sdd-input` / `sdd-prd` / `sdd-phase`)应出现在 omp 启动时的系统提示中。

## 2. 验证

安装完成后,启动 omp 一次,执行以下任意一种验证:

```bash
# (a) 通过 read 工具读取技能内容
omp -p "Use the read tool to read skill://sdd-core/SKILL.md. Show me the first 30 lines."
```

期望输出: 看到 sdd-core 技能的 frontmatter(name + description)与正文开头。

```bash
# (b) 通过 read 工具读取 docs-check.sh
omp -p "Use the read tool to read skill://sdd-core/references/docs-check.sh. Show me the first 20 lines."
```

期望输出: 看到 `# docs-check.sh — SDD 文档体系结构校验` 头。

**已知限制(0.9.0-rc)**: `rule://lore-protocol` 等 rule 暂不可用 — 详见状态说明。native rules 仍在 `~/.omp/agent/rules/` 加载,工作流不受影响。

## 3. 目录结构

```
sdd-pack/                                  # GitHub repo root
├── .omp-plugin/
│   └── marketplace.json                   # omp catalog(0.9.0-rc)
├── plugins/
│   └── sdd-pack/                          # plugin 根
│       ├── package.json                   # { "name": "sdd-pack", "version": "0.9.0-rc" }
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
│       └── rules/                         # 0.9.0-rc: 静态资产,暂不自动加载
│           ├── lore-protocol.md           # alwaysApply: true
│           ├── docs-update-guard.md
│           ├── lore-commit-guard.md
│           └── sdd-doc-edit-guard.md
└── docs/                                  # 配套的 SDD 文档(prd/phase/...)
```

## 4. 开发模式

本地开发 skill 内容并即时生效:

```bash
# 在 sdd-pack 仓库根
omp plugin link ./plugins/sdd-pack

# 修改 plugins/sdd-pack/skills/<skill>/ 下的文件
# 重启 omp 即生效(omp 不热加载 skill,需重启)

# 开发完成后
omp plugin uninstall sdd-pack@sdd-pack
```

**注意**: 0.9.0-rc 期间 link 模式同样不加载 rules(M1 验证已确认),仅 skills 生效。

## 5. 与 native rules 的共存

0.9.0-rc 期间,本 plugin 的 `rules/` 目录**不接管** `~/.omp/agent/rules/` 下的同名 rules。
即使用户**未**安装 sdd-pack,native rules(原本就存在的 `lore-protocol` 等)也已加载;
安装本 plugin **不会**替换或删除 native rules。

**建议**: 0.9.0-rc 期间**不要**移除 `~/.omp/agent/rules/{lore-protocol,docs-update-guard,lore-commit-guard,sdd-doc-edit-guard}.md`,
否则将失去 lore 提交协议与文档同步门控(在 omp 上游修复 rules 发现前,plugin 无法接管)。

待 v1.1 触发条件达成后,再按 PRD §7.2 「共存」建议卸载 native rules。

## 故障排查


### Q1. `omp plugin install` 报 "Plugin source resolves outside marketplace root"

**原因**: `.omp-plugin/marketplace.json` 缺少 `metadata.pluginRoot` 字段,omp 把 `source: "./sdd-pack"` 解析为相对 marketplace.json 同级目录,触发 OOB 安全拒绝。

**解决**: 确认 `.omp-plugin/marketplace.json` 含 `metadata.pluginRoot: "plugins"`(sdd-pack 仓库根的 catalog 已带此字段)。

### Q2. 启动 omp 后 `rule://lore-protocol` 报 "Unknown rule"

**原因**: 0.9.0-rc 已知限制 — omp v16.1.16 的 `omp-plugins provider` 未发现 plugin 中的 `rules/` 目录(详见 `docs/prd/2026-06-24-sdd-pack.md` §11.3 验证报告)。

**解决**: 0.9.0-rc 期间继续使用 `~/.omp/agent/rules/` 下的 native rules;v1.1 触发条件达成后此问题自然解决。

### Q3. 系统提示中 sdd-* skill 的 description 显示为英文(而非源文件中的中文)

**原因**: omp 在 marketplace 模式下会对 frontmatter description 做翻译(可能为多语言提示优化)。`skill://` URI 读取仍返回原始中文 frontmatter。

**解决**: 这是 omp 的预期行为,不影响功能。如需原汁原味中文提示,可用 `omp plugin link` 本地开发模式。

### Q4. `omp -p` 启动时显示双 plugin 条目(同时含 npm 与 marketplace)

**原因**: 用户既执行了 `omp plugin link`(开发态,npm 模式)又执行了 `omp plugin install`(发布态,marketplace 模式)。

**解决**: 二选一:
- 仅 link(开发): `omp plugin uninstall sdd-pack@sdd-pack`
- 仅 marketplace(发布): `omp plugin uninstall sdd-pack`(卸 npm),并清理 `~/.omp/plugins/node_modules/sdd-pack` 符号链接

### Q5. docs-check.sh 在 marketplace install 后无法执行

**原因**: omp 在 cache 中保留了文件(`~/.omp/plugins/cache/plugins/sdd-pack___sdd-pack___0.9.0-rc/skills/sdd-core/references/docs-check.sh`),但若用户从 cache 拷贝到项目,可能丢失可执行权限。

**解决**: 拷贝后执行 `chmod +x docs-check.sh`;脚本 bash 3.2 兼容(已在 macOS 默认 bash 验证)。

## 卸载

```bash
# 1. 卸载 plugin
omp plugin uninstall sdd-pack@sdd-pack

# 2. 移除 marketplace
omp plugin marketplace remove sdd-pack

# 3. 清理 cache(可选)
rm -rf ~/.omp/plugins/cache/plugins/sdd-pack___sdd-pack___0.9.0-rc
```

**0.9.0-rc 期间不要移除 native rules** — 详见 §5。plugin 本身不修改 `~/.omp/agent/rules/`。

## 升级

```bash
# 1. 拉取最新 marketplace catalog
# (omp 在 install/upgrade 时自动 fetch)

# 2. 升级 plugin
omp plugin upgrade sdd-pack@sdd-pack

# 3. 重启 omp 加载新版本
```

**版本对应**: git tag 与 plugin version 保持一致。
- v0.9.0-rc → v0.9.0 → v1.0.0(v1.0.0 待 rules 发现修复,推迟到 v1.1)
- 每次技能内容变更对应 plugin version 递增

**升级前建议**: 备份 `plugins/sdd-pack/skills/sdd-*/SKILL.md` 的本地修改(若有);link 模式下重 link 即生效。
