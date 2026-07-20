# buf generate / genApi 代码生成调试

## 核心规则（硬约束）

### 1. 禁止手写 codegen 产物

protoc-gen-tsnas-http 已生成的方法（get/post/put/delete/patch 5 种），**不要手写 stub**：
- 发现 `BaseApi` 没有 `patchJson` 时，先跑 `yarn genApi` 看是否已生成 `*.patch()` 方法
- genApi 产物路径：`src/api/<scope>/<version>/*.http.ts`
- 如 genApi 真没生成（proto 未声明 PATCH 方法），**改 proto 协议**而非手写

### 2. 禁止覆盖根 buf.gen.yaml

根 `buf.gen.yaml` 是项目正式 codegen 配置，**禁止覆盖**。

需要临时 codegen 时，用独立模板 + `--template` 指定：

```sh
# 正确：临时模板
cat > /tmp/buf.gen.specific.yaml <<'EOF'
version: v1
plugins:
  - plugin: protoc-gen-tsnas-http
    out: src/api/specific/v1
    opt: paths=source_relative
EOF
buf generate --template /tmp/buf.gen.specific.yaml path/to/module

# 错误：覆盖根配置
cp /tmp/buf.gen.specific.yaml buf.gen.yaml  # 禁止
```

### 3. PATH 顺序

`protoc-gen-tsnas-http` 在 `~/.swTool/codeGen/`，PATH 必须包含此路径：

```sh
export PATH="$HOME/.swTool/codeGen:$PATH"
which protoc-gen-tsnas-http  # 验证
```

若 `which` 找不到，检查 `~/.swTool/codeGen/` 是否存在 + 文件可执行权限。

## 调试流程

### Step 1: 验证工具链可达

```sh
which buf                              # buf 本体
which protoc-gen-tsnas-http            # http 代码生成 plugin
ls ~/.swTool/codeGen/                  # 内部 codegen 工具目录
cat package.json | grep -A2 genApi     # 项目 genApi 脚本
```

任一缺失：停下来告知用户"codegen 工具链不可达"，不要手写 stub 绕过。

### Step 2: 跑项目 genApi

```sh
# sw-nvr 项目专用
yarn genApi
# 或 buf 原生
buf generate
```

查看产物：

```sh
ls -la src/api/<scope>/<version>/*.http.ts
wc -l src/api/<scope>/<version>/*.http.ts  # 行数 > 0 才算成功
```

### Step 3: 验证生成的方法清单

```sh
grep -E "export const \w+Api|\.get\(|\.post\(|\.put\(|\.delete\(|\.patch\(" src/api/<scope>/<version>/*.http.ts | head -20
```

确认 5 种 http 方法是否齐全。缺方法时检查 proto 是否声明对应 rpc。

### Step 4: buf v1/v2 模板差异

buf v1 模板：

```yaml
version: v1
plugins:
  - plugin: protoc-gen-tsnas-http
    out: src/api
    opt: paths=source_relative
```

buf v2 模板（不兼容 v1）：

```yaml
version: v2
plugins:
  - local:
      protoc_builtin: protoc-gen-tsnas-http
    out: src/api
```

项目用哪个版本：查 `buf.gen.yaml` 的 `version` 字段。

## 常见错误模式

### 错误 1: "protoc-gen-tsnas-http: not found"

PATH 未含 `~/.swTool/codeGen/`。修：

```sh
export PATH="$HOME/.swTool/codeGen:$PATH"
```

### 错误 2: "buf generate 产出 0 行"

可能原因：
- buf.yaml 未配置 module（跑 `buf mod init` 或检查 `buf.yaml` 存在）
- proto 文件不在 buf.workspace 的 includes 路径
- plugin 路径错（v1 用 `plugin:`，v2 用 `local:`）

### 错误 3: agent 手写 http stub

**禁止**。sw-nvr session 实测：agent 因 genApi 不可达决定手写 stub，违反 ADR-015"零新逻辑"，后续维护成本高。正确做法：停下来告知用户"codegen 不可达，请检查 PATH 或工具安装"，由用户决定。

### 错误 4: 覆盖根 buf.gen.yaml

**禁止**。根配置是项目正式 codegen 入口，覆盖会导致后续 `yarn genApi` 行为异常。用临时模板 + `--template` 指定。
