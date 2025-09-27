import cloneDeep from "lodash/cloneDeep";

import type { TimelineElement } from "@/types/timeline";

/**
 * 将段落按 zIndex 从小到大排序；若相同则按 id 中的数字部分或字符串顺序保证稳定性。
 * 返回深拷贝后的新数组，避免外部修改影响 store。
 */
export function computeOrderedSegments(segments: Record<string, TimelineElement>): TimelineElement[] {
  return Object.values(segments)
    .filter((segment): segment is TimelineElement => Boolean(segment))
    .map((segment) => cloneDeep(segment))
    .sort((a, b) => {
      const aZ = a.zIndex ?? 0;
      const bZ = b.zIndex ?? 0;
      if (aZ !== bZ) {
        return aZ - bZ;
      }
      const aNumeric = Number.parseInt(String(a.id).replace(/\D/g, ""), 10);
      const bNumeric = Number.parseInt(String(b.id).replace(/\D/g, ""), 10);
      if (!Number.isNaN(aNumeric) && !Number.isNaN(bNumeric)) {
        return aNumeric - bNumeric;
      }
      return String(a.id).localeCompare(String(b.id));
    });
}

/** 计算所有段落中的最大 zIndex（无值视为 0）。 */
export function computeMaxZIndex(segments: Record<string, TimelineElement>): number {
  const values = Object.values(segments).map((segment) => segment?.zIndex ?? 0);
  return values.length ? Math.max(...values) : 0;
}

/** 计算所有段落中的最小 zIndex（无值视为 0）。 */
export function computeMinZIndex(segments: Record<string, TimelineElement>): number {
  const values = Object.values(segments).map((segment) => segment?.zIndex ?? 0);
  return values.length ? Math.min(...values) : 0;
}
