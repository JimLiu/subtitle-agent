import { TimelineElement } from "@/types/timeline";

/** 计算段落的有效时长（扣除首尾裁剪）。 */
export function getElementDuration(element: TimelineElement): number {
  return Math.max(element.duration - element.trimStart - element.trimEnd, 0);
}

/** 计算段落的结束时间（startTime + 有效时长）。 */
export function getElementEndTime(element: TimelineElement): number {
  return element.startTime + getElementDuration(element);
}
