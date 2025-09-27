import cloneDeep from "lodash/cloneDeep";

import type { TimelineElement } from "@/types/timeline";

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

export function computeMaxZIndex(segments: Record<string, TimelineElement>): number {
  const values = Object.values(segments).map((segment) => segment?.zIndex ?? 0);
  return values.length ? Math.max(...values) : 0;
}

export function computeMinZIndex(segments: Record<string, TimelineElement>): number {
  const values = Object.values(segments).map((segment) => segment?.zIndex ?? 0);
  return values.length ? Math.min(...values) : 0;
}
