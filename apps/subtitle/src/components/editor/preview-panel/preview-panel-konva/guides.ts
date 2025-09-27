import Konva from "konva";

import type { TimelineElement } from "@/types/timeline";

export function getLineGuideStops(
  node: Konva.Node,
  stage: Konva.Stage,
  idealWidth: number,
  idealHeight: number,
  segments: TimelineElement[],
  container: Konva.Group,
) {
  const vertical: number[] = [0, idealWidth / 2, idealWidth];
  const horizontal: number[] = [0, idealHeight / 2, idealHeight];
  let wrapper = node;
  while (wrapper.name() !== "konvaWrapper" && wrapper.getParent()) {
    wrapper = wrapper.getParent();
  }

  segments.forEach((segment) => {
    stage.find(`#${segment.id}`).forEach((shape) => {
      if (wrapper.id && wrapper.id() === segment.id) {
        return;
      }
      const rect = shape.getClientRect({ relativeTo: container });
      const width = rect.width;
      const height = rect.height;
      const positionX = segment.x ?? 0;
      const positionY = segment.y ?? 0;
      vertical.push(positionX);
      vertical.push(positionX + width);
      vertical.push(positionX + width / 2);
      horizontal.push(positionY);
      horizontal.push(positionY + height);
      horizontal.push(positionY + height / 2);
    });
  });

  return {
    vertical,
    horizontal,
  };
}

export function getObjectSnappingEdges(node: Konva.Node, container: Konva.Group) {
  const rect = node.getClientRect({ relativeTo: container });
  const position = node.position();
  return {
    vertical: [
      { guide: Math.round(rect.x), offset: Math.round(position.x - rect.x), snap: "start" },
      { guide: Math.round(rect.x + rect.width / 2), offset: Math.round(position.x - rect.x - rect.width / 2), snap: "center" },
      { guide: Math.round(rect.x + rect.width), offset: Math.round(position.x - rect.x - rect.width), snap: "end" },
    ],
    horizontal: [
      { guide: Math.round(rect.y), offset: Math.round(position.y - rect.y), snap: "start" },
      { guide: Math.round(rect.y + rect.height / 2), offset: Math.round(position.y - rect.y - rect.height / 2), snap: "center" },
      { guide: Math.round(rect.y + rect.height), offset: Math.round(position.y - rect.y - rect.height), snap: "end" },
    ],
  };
}

export function getGuides(
  stops: { vertical: number[]; horizontal: number[] },
  edges: ReturnType<typeof getObjectSnappingEdges>,
  offset: number,
) {
  const result: Array<{ lineGuide: number; diff: number; orientation: "V" | "H"; snap: string; offset: number }> = [];
  const verticalMatches: Array<{ lineGuide: number; diff: number; snap: string; offset: number }> = [];
  const horizontalMatches: Array<{ lineGuide: number; diff: number; snap: string; offset: number }> = [];

  stops.vertical.forEach((lineGuide) => {
    edges.vertical.forEach((edge) => {
      const diff = Math.abs(lineGuide - edge.guide);
      if (diff < offset) {
        verticalMatches.push({ lineGuide, diff, snap: edge.snap, offset: edge.offset });
      }
    });
  });

  stops.horizontal.forEach((lineGuide) => {
    edges.horizontal.forEach((edge) => {
      const diff = Math.abs(lineGuide - edge.guide);
      if (diff < offset) {
        horizontalMatches.push({ lineGuide, diff, snap: edge.snap, offset: edge.offset });
      }
    });
  });

  const bestVertical = verticalMatches.sort((a, b) => a.diff - b.diff)[0];
  const bestHorizontal = horizontalMatches.sort((a, b) => a.diff - b.diff)[0];

  if (bestVertical) {
    result.push({
      lineGuide: bestVertical.lineGuide,
      diff: bestVertical.diff,
      orientation: "V",
      snap: bestVertical.snap,
      offset: bestVertical.offset,
    });
  }
  if (bestHorizontal) {
    result.push({
      lineGuide: bestHorizontal.lineGuide,
      diff: bestHorizontal.diff,
      orientation: "H",
      snap: bestHorizontal.snap,
      offset: bestHorizontal.offset,
    });
  }

  return result;
}

export function drawGuides(
  guides: Array<{ lineGuide: number; orientation: "V" | "H"; snap: string; offset: number }>,
  container: Konva.Group,
  scale: number,
) {
  guides.forEach((guide) => {
    if (guide.orientation === "H") {
      const line = new Konva.Line({
        points: [-6000, 0, 6000, 0],
        stroke: "rgb(255, 255, 255)",
        strokeWidth: 2 * scale,
        name: "guid-line",
        dash: [4 * scale, 6 * scale],
      });
      container.add(line);
      line.position({ x: 0, y: guide.lineGuide });
    } else if (guide.orientation === "V") {
      const line = new Konva.Line({
        points: [0, -6000, 0, 6000],
        stroke: "rgb(255, 255, 255)",
        strokeWidth: 2 * scale,
        name: "guid-line",
        dash: [4 * scale, 6 * scale],
      });
      container.add(line);
      line.position({ x: guide.lineGuide, y: 0 });
    }
  });
}
