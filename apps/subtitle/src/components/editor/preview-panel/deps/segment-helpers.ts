import { TimelineElement } from "@/types/timeline";

export function getSegmentDuration(segment: TimelineElement): number {
  return Math.max(segment.duration - segment.trimStart - segment.trimEnd, 0);
}

export function getSegmentEndTime(segment: TimelineElement): number {
  return segment.startTime + getSegmentDuration(segment);
}
