/**
 * doc-links.ts — 文档移动后重写相对 Markdown 链接
 *
 * 归档时 PRD/Phase 下移一层进入 archive/,文档内 ../ 相对链接会断。
 * 本模块把文档内的相对链接按 旧目录→新目录 重写,使链接继续解析到原目标。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

/**
 * 计算把文档从 oldDir 移动到 newDir 后,其内部相对链接的重写结果(纯函数)。
 *
 * 原理: 旧链接 rel 相对 oldDir 解析到绝对目标 target = resolve(oldDir, rel)。
 * 若 target 本身也被移动(pathMap 提供 old→new 绝对路径映射),则用新目标位置。
 * 否则用原 target。最后取 relative(newDir, finalTarget) 作为新链接。
 * 只重写相对链接;跳过绝对路径、scheme:// 协议链接与纯锚点(#x)。
 *
 * @param pathMap 可选: 链接目标也被移动时的 oldAbs → newAbs 映射
 */
export function rewriteLinksForMove(
  content: string,
  oldDir: string,
  newDir: string,
  pathMap?: ReadonlyMap<string, string>,
): string {
  if (oldDir === newDir && !pathMap) return content;
  // 匹配 [text](url) 与 ![alt](url) 中的 url
  return content.replace(
    /(!?\[[^\]]*\]\()([^)\s]+)(\))/g,
    (whole, pre: string, url: string, post: string) => {
      if (isAbsolute(url) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith("#")) {
        return whole;
      }
      // 拆出锚点(#section)
      const hashIdx = url.indexOf("#");
      const pathPart = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
      const anchor = hashIdx >= 0 ? url.slice(hashIdx) : "";
      if (!pathPart) return whole;
      const oldTarget = resolve(oldDir, pathPart);
      // 目标也被移动 → 用新目标位置
      const finalTarget = pathMap?.get(oldTarget) ?? oldTarget;
      const newUrl = relative(newDir, finalTarget).split("\\").join("/");
      return `${pre}${newUrl}${anchor}${post}`;
    },
  );
}

/**
 * 重写已移动文档文件的链接(读写文件)。
 * fileAbsPath 为文档移动后的绝对路径;oldDir/newDir 为移动前/后的所在目录。
 */
export function rewriteMovedDocLinks(
  fileAbsPath: string,
  oldDir: string,
  newDir: string,
  pathMap?: ReadonlyMap<string, string>,
): void {
  const content = readFileSync(fileAbsPath, "utf-8");
  const updated = rewriteLinksForMove(content, oldDir, newDir, pathMap);
  if (updated !== content) writeFileSync(fileAbsPath, updated, "utf-8");
}
