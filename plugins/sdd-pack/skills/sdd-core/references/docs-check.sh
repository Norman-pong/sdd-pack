#!/usr/bin/env bash
# docs-check.sh — SDD 文档体系结构校验
#
# 实现 sdd-core 质量检查的 4 项（conventions.md §9 / sdd-core SKILL.md「质量检查」）：
#   1. PRD ↔ Phase 双向引用
#   2. 回指格式规范（> 对应阶段: / > 对应 PRD:）
#   3. index.md 覆盖度（所有非模板 PRD/Spec 已入索引）
#   4. 相对路径 markdown 链接有效性
#
# 用法：./docs-check.sh [docs-dir]    （默认 docs/）
# 退出码：0=通过（可有警告），1=有错误，2=docs 目录不存在

set -uo pipefail

DOCS_DIR="${1:-docs}"
errors=0
warns=0
set -o pipefail
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

fail() { red   "FAIL: $*"; errors=$((errors+1)); }
pass() { green "PASS: $*"; }
warn() { yellow "WARN: $*"; warns=$((warns+1)); }

[ -d "$DOCS_DIR" ] || { red "docs 目录不存在: $DOCS_DIR"; exit 2; }

# 模板/索引/总览文件不参与文档级校验
is_template() {
  case "$(basename "$1")" in
    _template*.md|README.md|index.md|CONTRIBUTING.md|overview.md) return 0 ;;
    *) return 1 ;;
  esac
}

# 从 $1 文件中提取首个匹配 $2 正则的行里 (link) 的 link 部分
extract_link() {
  grep -E "$2" "$1" 2>/dev/null | sed -E 's/.*\(([^)]+)\).*/\1/' | head -1
}

# 将 $2(相对 $1 的路径) 解析为绝对路径
resolve() {
  (cd "$1" 2>/dev/null && cd "$(dirname "$2")" 2>/dev/null && printf '%s/%s' "$(pwd)" "$(basename "$2")")
}

shopt -s nullglob

# 收集活跃（非归档）非模板文档
prds=();   for f in "$DOCS_DIR"/prd/*.md;   do is_template "$f" || prds+=("$f");   done
phases=(); for f in "$DOCS_DIR"/phase/*.md; do is_template "$f" || phases+=("$f"); done
specs=();  for f in "$DOCS_DIR"/spec/*.md;  do is_template "$f" || specs+=("$f");  done

# --- 检查 1 + 2: PRD ↔ Phase 双向引用与回指格式 ---------------------------

phase_back_re='^> *对应 PRD: *\['
prd_back_re='^> *对应阶段: *\['

for p in ${prds[@]+"${prds[@]}"}; do
  bn=$(basename "$p")
  if ! grep -qE "$prd_back_re" "$p"; then
    fail "PRD 缺少 '> 对应阶段:' 回指行: $bn"
    continue
  fi
  target=$(extract_link "$p" "$prd_back_re")
  if [ -z "$target" ]; then
    fail "PRD 回指链接无法解析: $bn"
    continue
  fi
  resolved=$(resolve "$DOCS_DIR/prd" "$target")
  if [ ! -f "$resolved" ]; then
    fail "PRD 回指目标不存在: $bn -> $target"
  fi
done

for ph in ${phases[@]+"${phases[@]}"}; do
  bn=$(basename "$ph")
  if ! grep -qE "$phase_back_re" "$ph"; then
    fail "Phase 缺少 '> 对应 PRD:' 回指行: $bn"
    continue
  fi
  target=$(extract_link "$ph" "$phase_back_re")
  if [ -z "$target" ]; then
    fail "Phase 回指链接无法解析: $bn"
    continue
  fi
  resolved=$(resolve "$DOCS_DIR/phase" "$target")
  if [ ! -f "$resolved" ]; then
    fail "Phase 回指目标不存在: $bn -> $target"
  fi
done

if [ ${#prds[@]} -eq 0 ] || [ ${#phases[@]} -eq 0 ]; then
  warn "无活跃 PRD 或 Phase，双向引用检查跳过"
elif [ $errors -eq 0 ]; then
  pass "PRD ↔ Phase 双向引用与回指格式"
fi

# --- 检查 3: index.md 覆盖度 ---------------------------------------------

index="$DOCS_DIR/index.md"
if [ -f "$index" ]; then
  idx_content=$(cat "$index")
  miss=0
  for p in ${prds[@]+"${prds[@]}"} ${specs[@]+"${specs[@]}"}; do
    bn=$(basename "$p")
    case "$idx_content" in
      *"$bn"*) : ;;
      *) fail "index.md 未覆盖: $bn"; miss=$((miss+1)) ;;
    esac
  done
  if [ $miss -eq 0 ] && { [ ${#prds[@]} -gt 0 ] || [ ${#specs[@]} -gt 0 ]; }; then
    pass "index.md 覆盖度（PRD + Spec）"
  fi
else
  warn "index.md 不存在，覆盖度检查跳过"
fi

# --- 检查 4: 相对路径 markdown 链接有效性 ---------------------------------

broken=0
while IFS= read -r mdfile; do
  case "$mdfile" in */.working/*) continue ;; esac
  dir=$(dirname "$mdfile")
  # 提取 ](...) 中的链接目标，逐行过滤
  while IFS= read -r link; do
    [ -z "$link" ] && continue
    case "$link" in
      http* | \#* | mailto* | /*) continue ;;
    esac
    path=${link%%#*}
    [ -z "$path" ] && continue
    if [ ! -e "$dir/$path" ]; then
      fail "断链: $mdfile -> $link"
      broken=$((broken+1))
    fi
  done < <(grep -oE '\]\([^)]+\)' "$mdfile" 2>/dev/null | sed -E 's/^\]\(//; s/\)$//')
done < <(find "$DOCS_DIR" -name '*.md' -type f)

[ $broken -eq 0 ] && pass "相对路径链接有效性"

# --- 汇总 -----------------------------------------------------------------

echo ""
if [ $errors -gt 0 ]; then
  red "docs-check: $errors 个错误, $warns 个警告"
  exit 1
fi
if [ $warns -gt 0 ]; then
  yellow "docs-check: 通过, $warns 个警告"
else
  green "docs-check: 全部通过"
fi
exit 0
