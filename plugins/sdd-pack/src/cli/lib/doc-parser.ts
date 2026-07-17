/**
 * doc-parser.ts — PRD/Phase/Spec 文档解析
 *
 * 解析 frontmatter 状态行、交叉引用（> 对应 PRD: / > 对应阶段: / > 替代: / > 已被:）、supersedes 链
 */

import { readFileSync, existsSync } from "fs";
import { PrdStatus } from "./prd-state-machine";
import type { PhaseMeta, PrdMeta } from "./meta-store";

/** 解析后的状态行信息（规范单行格式） */
export interface StatusLine {
  status: string;
  /** 发布日期，YYYY-MM-DD 格式或 undefined */
  publishDate?: string;
  /** 版本号 */
  version?: string;
  /** 变更历史链接 */
  changelog?: string;
}

/** 解析后的堆叠状态行条目（多版本堆叠格式） */
export interface StackedStatusEntry {
  version: string;
  status: string;
  date?: string;
  description?: string;
}

/** 交叉引用 */
export interface CrossReferences {
  /** > 对应 PRD: 链接 */
  prdRef?: string;
  /** > 对应阶段: 链接 */
  phaseRef?: string;
  /** > 替代: 链接 */
  supersedes?: string;
  /** > 已被: 链接 */
  supersededBy?: string;
  /** 回指链接(用于 StatusItem.references 非空字段列表) */
  backRefs: string[];
}

/** 文档元数据 */
export interface DocMetadata {
  filePath: string;
  title: string;
  statusLine: string;
  /** 规范状态行解析 */
  parsedStatus?: StatusLine;
  /** 堆叠状态行条目（当状态行含多版本时） */
  stackedEntries?: StackedStatusEntry[];
  /** 是否有堆叠状态行 */
  hasStackedStatus: boolean;
  /** 交叉引用 */
  references: CrossReferences;
}

/**
 * 读取文件内容，跳过 BOM
 */
function readFileContent(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

/**
 * 从文件内容中提取标题（第一个 # 行）
 */
export function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : "";
}

/**
 * 解析规范单行状态行
 * 格式：> 状态：<状态> [| 发布日期：<date>] [| 版本：<ver>]
 */
export function parseStatusLine(line: string): StatusLine | null {
  // 先移除行首 `> ` 前缀
  const trimmed = line.replace(/^>\s*/, "").trim();

  // 匹配规范格式: 状态：XXX | 发布日期：XXXX | 版本：XXX
  const statusMatch = trimmed.match(/状态[：:]\s*([^|]+)/);
  if (!statusMatch) return null;

  const status = statusMatch[1].trim();
  const publishDateMatch = trimmed.match(/发布日期[：:]\s*(\d{4}-\d{2}-\d{2})/);
  const versionMatch = trimmed.match(/版本[：:]\s*([^|]+)/);
  const changelogMatch = trimmed.match(/变更历史[：:]\s*见\s*\[([^\]]+)\]\(([^)]+)\)/);

  return {
    status,
    publishDate: publishDateMatch?.[1],
    version: versionMatch?.[1]?.trim(),
    changelog: changelogMatch?.[2],
  };
}

/**
 * 解析堆叠状态行（多版本混排）
 * 格式示例：状态:1.2.3 已发布(2026-06-25);v1.2.0 新增...;v1.2.1 修正...
 */
export function parseStackedStatusLine(line: string): StackedStatusEntry[] | null {
  const trimmed = line.replace(/^>\s*/, "").trim();

  // 检测是否为堆叠格式（含分号分隔的多个版本）
  const stackedMatch = trimmed.match(/^状态[：:]\s*(.+)/);
  if (!stackedMatch) return null;

  const parts = stackedMatch[1]
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return null; // 单版本不算堆叠

  const entries: StackedStatusEntry[] = [];
  for (const part of parts) {
    // 匹配: 1.2.3 已发布(2026-06-25) 或 v1.2.0 新增...
    const structured = part.match(
      /^v?(\d[\d.]*(?:-rc[\d.]*)?)\s+(.+?)(?:\s*\((\d{4}-\d{2}-\d{2})\))?$/,
    );
    if (structured) {
      entries.push({
        version: structured[1],
        status: structured[2],
        date: structured[3],
      });
    } else {
      // 无法解析的条目，作为描述
      entries.push({
        version: "?",
        status: part,
        description: part,
      });
    }
  }

  return entries.length > 1 ? entries : null;
}

/**
 * 检测状态行是否为多版本/堆叠格式
 */
export function hasStackedStatusLine(content: string): boolean {
  const statusLine = extractStatusLine(content);
  if (!statusLine) return false;
  return parseStackedStatusLine(statusLine) !== null;
}

/**
 * 从文件内容中提取状态行
 * 匹配 > 状态：或 > 状态:
 */
export function extractStatusLine(content: string): string | null {
  const match = content.match(/^>?\s*状态[：:].*/m);
  return match?.[0]?.trim() ?? null;
}

/**
 * 解析交叉引用
 */
export function parseReferences(content: string): CrossReferences {
  const refs: CrossReferences = { backRefs: [] };

  const prdRefMatch = content.match(/^>?\s*对应 PRD[：:]\s*\[([^\]]*)\]\(([^)]+)\)/m);
  if (prdRefMatch) { refs.prdRef = prdRefMatch[2]; refs.backRefs.push(prdRefMatch[2]); }

  const phaseRefMatch = content.match(/^>?\s*对应阶段[：:]\s*\[([^\]]*)\]\(([^)]+)\)/m);
  if (phaseRefMatch) { refs.phaseRef = phaseRefMatch[2]; refs.backRefs.push(phaseRefMatch[2]); }

  const supersedesMatch = content.match(/^>?\s*替代[：:]\s*\[([^\]]*)\]\(([^)]+)\)/m);
  if (supersedesMatch) { refs.supersedes = supersedesMatch[2]; refs.backRefs.push(supersedesMatch[2]); }

  const supersededByMatch = content.match(/^>?\s*已被[：:]\s*\[([^\]]*)\]\(([^)]+)\)/m);
  if (supersededByMatch) { refs.supersededBy = supersededByMatch[2]; refs.backRefs.push(supersededByMatch[2]); }

  return refs;
}


/**
 * 解析完整文档元数据
 */
export function parseDocument(filePath: string): DocMetadata | null {
  if (!existsSync(filePath)) return null;

  const content = readFileContent(filePath);
  const statusLine = extractStatusLine(content);
  if (!statusLine) return null;

  const parsedStatus = parseStatusLine(statusLine);
  const stackedEntries = parseStackedStatusLine(statusLine);

  return {
    filePath,
    title: extractTitle(content),
    statusLine,
    parsedStatus: parsedStatus ?? undefined,
    stackedEntries: stackedEntries ?? undefined,
    hasStackedStatus: stackedEntries !== null,
    references: parseReferences(content),
  };
}

/**
 * 检测是否为模板文件
 */
export function isTemplateFile(filename: string): boolean {
  return (
    filename.startsWith("_template") ||
    ["README.md", "index.md", "CONTRIBUTING.md", "overview.md"].includes(filename)
  );
}

/**
 * 检查文件名是否符合命名规范：YYYY-MM-DD-<kebab-case>.md
 */
export function isValidFileName(filename: string): boolean {
  return /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(filename);
}


/**
 * 从文件内容提取 H1 标题
 */
export function extractH1(content: string): string | null {
  const match = content.match(/^#\s+(.+)/m);
  return match?.[1]?.trim() ?? null;
}

/**
 * 从文件内容提取必需章节列表
 * 返回缺少的章节名
 */
export function extractRequiredSections(content: string): string[] {
  const required = [
    { name: "## 0. 目标声明", pattern: /^##\s+0\.\s+目标声明/m },
    { name: "## 1.", pattern: /^##\s+1\./m },
    { name: "## 3. 功能需求", pattern: /^##\s+3\.\s+功能需求/m },
    { name: "## 8. 验收标准", pattern: /^##\s+8\.\s+验收标准/m },
  ];

  const missing: string[] = [];
  for (const section of required) {
    if (!section.pattern.test(content)) {
      missing.push(section.name);
    }
  }
  return missing;
}


// ===== ADR-018: meta.json → markdown 状态行生成器 =====

/**
 * 从 PrdMeta 生成规范单行状态行。
 *
 * 输出格式（与 parseStatusLine 可逆兼容）：
 *   > 状态：<状态> [| 发布日期：<date>] [| 版本：<ver>]
 *
 * - status 为 Archived 且 archiveReason 存在时，追加归档原因到状态文本。
 * - publishDate 取最后一次 transition 的日期（YYYY-MM-DD），无 transitions 时取 createdAt。
 * - version 直接取 meta.version。
 */
export function generatePrdStatusLine(meta: PrdMeta): string {
  const parts: string[] = [`状态：${meta.status}`];

  const lastTransition = meta.transitions[meta.transitions.length - 1];
  const dateSource = lastTransition?.at ?? meta.createdAt;
  const publishDate = dateSource.slice(0, 10);
  if (publishDate) {
    parts.push(`发布日期：${publishDate}`);
  }

  if (meta.version) {
    parts.push(`版本：${meta.version}`);
  }

  if (meta.status === PrdStatus.Archived && meta.archiveReason) {
    parts.push(`归档原因：${meta.archiveReason}`);
  }

  return `> ${parts.join(" | ")}`;
}

/**
 * 从 PhaseMeta 生成规范单行状态行。
 *
 * 输出格式（与 parseStatusLine 可逆兼容）：
 *   > 状态：<状态> [| 发布日期：<date>]
 *
 * Phase 无 version 字段，故不生成版本段。
 */
export function generatePhaseStatusLine(meta: PhaseMeta): string {
  const parts: string[] = [`状态：${meta.status}`];

  const lastTransition = meta.transitions[meta.transitions.length - 1];
  const dateSource = lastTransition?.at ?? meta.createdAt;
  const publishDate = dateSource.slice(0, 10);
  if (publishDate) {
    parts.push(`发布日期：${publishDate}`);
  }

  return `> ${parts.join(" | ")}`;
}
