import { TimelineElement } from "@/types/timeline";

/** 计算段落的有效时长（扣除首尾裁剪）。 */
export function getSegmentDuration(segment: TimelineElement): number {
  return Math.max(segment.duration - segment.trimStart - segment.trimEnd, 0);
}

/** 计算段落的结束时间（startTime + 有效时长）。 */
export function getSegmentEndTime(segment: TimelineElement): number {
  return segment.startTime + getSegmentDuration(segment);
}
