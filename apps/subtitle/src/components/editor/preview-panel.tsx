"use client";

import { useCallback, useMemo } from "react";
import ratioPresets from "./preview-panel/lib/ratio-presets";
import { PreviewPanel as PreviewPanelImpl } from "./preview-panel/preview-panel";
import { useTimelineStore } from "@/stores/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { usePlaybackStore } from "@/stores/playback-store";
import type { TimelineElement } from "@/types/timeline";
import type { ProjectSize } from "./preview-panel/nodes/preview-konva-node";

type ElementMeta = {
  element: TimelineElement;
  trackId: string;
  fallbackZ: number;
};

export function PreviewPanel() {
  const tracks = useTimelineStore((state) => state.tracks);
  const selectedElements = useTimelineStore((state) => state.selectedElements);
  const selectElement = useTimelineStore((state) => state.selectElement);
  const clearSelectedElements = useTimelineStore(
    (state) => state.clearSelectedElements
  );
  const updateElementProperties = useTimelineStore(
    (state) => state.updateElementProperties
  );
  const removeElementFromTrackWithRipple = useTimelineStore(
    (state) => state.removeElementFromTrackWithRipple
  );
  const duplicateElement = useTimelineStore((state) => state.duplicateElement);

  const activeProject = useProjectStore((state) => state.activeProject);
  const setPreviewThumbnail = useProjectStore(
    (state) => state.setPreviewThumbnail
  );

  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const currentTime = usePlaybackStore((state) => state.currentTime);
  const play = usePlaybackStore((state) => state.play);
  const pause = usePlaybackStore((state) => state.pause);

  const segmentsMeta = useMemo(() => {
    const entries: ElementMeta[] = [];
    const elementMap: Record<string, TimelineElement> = {};
    const elementTrackMap = new Map<string, string>();

    tracks.forEach((track, trackIndex) => {
      track.elements.forEach((element, elementIndex) => {
        const fallbackZ = trackIndex * 1000 + elementIndex;
        entries.push({ element, trackId: track.id, fallbackZ });
        elementMap[element.id] = element;
        elementTrackMap.set(element.id, track.id);
      });
    });

    const sortedEntries = entries
      .slice()
      .sort((a, b) => {
        const aValue = (a.element.zIndex ?? a.fallbackZ);
        const bValue = (b.element.zIndex ?? b.fallbackZ);
        if (aValue === bValue) {
          return a.element.startTime - b.element.startTime;
        }
        return aValue - bValue;
      });

    const zValues = entries.map((entry) => entry.element.zIndex ?? entry.fallbackZ);
    const minZIndex = zValues.length > 0 ? Math.min(...zValues) : 0;
    const maxZIndex = zValues.length > 0 ? Math.max(...zValues) : 0;

    const konvaZIndexMap = new Map<string, number>();
    sortedEntries.forEach((entry, index) => {
      konvaZIndexMap.set(entry.element.id, index);
    });

    return {
      orderedElements: sortedEntries.map((entry) => entry.element),
      elementMap,
      elementTrackMap,
      konvaZIndexMap,
      minZIndex,
      maxZIndex,
    };
  }, [tracks]);

  const {
    orderedElements,
    elementMap,
    elementTrackMap,
    konvaZIndexMap,
    minZIndex,
    maxZIndex,
  } = segmentsMeta;

  const selectedSegmentId = useMemo(() => {
    const currentId = selectedElements[0]?.elementId;
    if (!currentId) {
      return null;
    }
    return elementMap[currentId] ? currentId : null;
  }, [selectedElements, elementMap]);

  const projectId = activeProject?.id;

  const projectSize: ProjectSize | null = useMemo(() => {
    if (!activeProject) {
      return null;
    }

    const { canvasSize, canvasMode } = activeProject;
    const ratioKey = getRatioKey(canvasSize.width, canvasSize.height);
    const isPresetMode = canvasMode === "preset" && ratioPresets[ratioKey];

    return {
      ratio: isPresetMode ? ratioKey : "original",
      width: canvasSize.width,
      height: canvasSize.height,
      original: {
        width: canvasSize.width,
        height: canvasSize.height,
      },
    };
  }, [activeProject]);

  const setPlaying = useCallback(
    (shouldPlay: boolean) => {
      if (shouldPlay) {
        play();
      } else {
        pause();
      }
    },
    [pause, play]
  );

  const setSelectedSegment = useCallback(
    (id: string | null) => {
      if (!id) {
        clearSelectedElements();
        return;
      }
      const trackId = elementTrackMap.get(id);
      if (!trackId) {
        clearSelectedElements();
        return;
      }
      selectElement(trackId, id);
    },
    [clearSelectedElements, elementTrackMap, selectElement]
  );

  const updateSegment = useCallback(
    async (payload: Partial<TimelineElement> & { id: string }) => {
      const trackId = elementTrackMap.get(payload.id);
      if (!trackId) return;
      const { id, ...rest } = payload;
      updateElementProperties(trackId, id, rest);
    },
    [elementTrackMap, updateElementProperties]
  );

  const deleteSegment = useCallback(
    async (id: string) => {
      const trackId = elementTrackMap.get(id);
      if (!trackId) return;
      removeElementFromTrackWithRipple(trackId, id, true);
    },
    [elementTrackMap, removeElementFromTrackWithRipple]
  );

  const duplicateSegment = useCallback(
    async ({ id }: { id: string }) => {
      const trackId = elementTrackMap.get(id);
      if (!trackId) return;
      duplicateElement(trackId, id);
    },
    [duplicateElement, elementTrackMap]
  );

  const getSegmentById = useCallback(
    (id: string) => elementMap[id] ?? null,
    [elementMap]
  );

  const getKonvaZIndex = useCallback(
    (id: string) => konvaZIndexMap.get(id) ?? 0,
    [konvaZIndexMap]
  );

  const removeActiveTool = useCallback(() => {
    // no-op placeholder for future tool integration
  }, []);
  const setActiveTool = useCallback((tool: string) => {
    void tool;
  }, []);

  if (!activeProject || !projectId || !projectSize) {
    return <div className="h-full w-full bg-panel" />;
  }

  return (
    <PreviewPanelImpl
      projectID={projectId}
      selectedSegment={selectedSegmentId}
      orderedSegments={orderedElements}
      allSegments={elementMap}
      size={projectSize}
      backgroundColor={activeProject.backgroundColor ?? "#000000"}
      currentTimestamp={currentTime}
      buffering={false}
      playing={isPlaying}
      minZIndex={minZIndex}
      maxZIndex={maxZIndex}
      getSegmentById={getSegmentById}
      getKonvaZIndex={getKonvaZIndex}
      setPlaying={setPlaying}
      setSelectedSegment={setSelectedSegment}
      removeActiveTool={removeActiveTool}
      setActiveTool={setActiveTool}
      updateSegment={updateSegment}
      setPreviewThumbnail={setPreviewThumbnail}
      deleteSegment={deleteSegment}
      duplicateSegment={duplicateSegment}
    />
  );
}

function getRatioKey(width: number, height: number): string {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const divisor = gcd(safeWidth, safeHeight);
  return `${Math.round(safeWidth / divisor)}:${Math.round(safeHeight / divisor)}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
}
