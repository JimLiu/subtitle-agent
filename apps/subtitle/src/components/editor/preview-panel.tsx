"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { usePlaybackStore } from "@/stores/playback-store";
import type { TimelineElement } from "@/types/timeline";

import ratioPresets from "./preview-panel/deps/ratio-presets";
import {
  PreviewPanel as PreviewPanelImpl,
} from "./preview-panel/preview-panel";
import { createPreviewPanelStore } from "./preview-panel/preview-panel-store";
import type {
  PreviewPanelStore,
  PreviewPanelStoreData,
  PreviewSize,
} from "./preview-panel/preview-panel-store";

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

    const orderedElements = entries
      .slice()
      .sort((a, b) => {
        const aValue = a.element.zIndex ?? a.fallbackZ;
        const bValue = b.element.zIndex ?? b.fallbackZ;
        if (aValue === bValue) {
          return a.element.startTime - b.element.startTime;
        }
        return aValue - bValue;
      })
      .map((entry) => entry.element);

    const zValues = entries.map((entry) => entry.element.zIndex ?? entry.fallbackZ);
    const minZIndex = zValues.length > 0 ? Math.min(...zValues) : 0;
    const maxZIndex = zValues.length > 0 ? Math.max(...zValues) : 0;

    return {
      orderedElements,
      elementMap,
      elementTrackMap,
      minZIndex,
      maxZIndex,
    };
  }, [tracks]);

  const { orderedElements, elementMap, elementTrackMap, minZIndex, maxZIndex } = segmentsMeta;

  const selectedSegmentId = useMemo(() => {
    const currentId = selectedElements[0]?.elementId;
    if (!currentId) {
      return null;
    }
    return elementMap[currentId] ? currentId : null;
  }, [selectedElements, elementMap]);

  const projectId = activeProject?.id;

  const previewSize: PreviewSize | null = useMemo(() => {
    if (!activeProject) {
      return null;
    }

    const { canvasSize, canvasMode } = activeProject;
    const ratioKey = getRatioKey(canvasSize.width, canvasSize.height);
    const isPresetMode = canvasMode === "preset" && ratioPresets[ratioKey];

    return {
      ratio: isPresetMode ? ratioKey : "original",
      original: {
        width: canvasSize.width,
        height: canvasSize.height,
      },
    };
  }, [activeProject]);

  const previewStoreRef = useRef<PreviewPanelStore>();
  if (!previewStoreRef.current) {
    previewStoreRef.current = createPreviewPanelStore();
  }
  const previewStore = previewStoreRef.current;

  useEffect(() => {
    if (!activeProject || !previewSize) {
      return;
    }

    previewStore.getState().patch({
      backgroundColor: activeProject.backgroundColor ?? "#000000",
      size: previewSize,
      segments: { ...elementMap },
      orderedSegments: orderedElements.slice(),
      minZIndex,
      maxZIndex,
      buffering: false,
    } as Partial<PreviewPanelStoreData>);
  }, [
    activeProject,
    previewSize,
    elementMap,
    orderedElements,
    minZIndex,
    maxZIndex,
    previewStore,
  ]);

  useEffect(() => {
    if (!previewSize) {
      return;
    }

    previewStore.getState().patch({
      playing: isPlaying,
      currentTimestamp: Math.max(0, currentTime) * 1000,
      selectedSegment: selectedSegmentId,
    } as Partial<PreviewPanelStoreData>);
  }, [isPlaying, currentTime, selectedSegmentId, previewSize, previewStore]);

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

  const handleActiveToolChange = useCallback((tool: string | null) => {
    void tool;
  }, []);

  if (!activeProject || !projectId || !previewSize) {
    return <div className="h-full w-full bg-panel" />;
  }

  return (
    <PreviewPanelImpl
      store={previewStore}
      onPlayingChange={setPlaying}
      onSelectedSegmentChange={setSelectedSegment}
      onActiveToolChange={handleActiveToolChange}
      onSegmentUpdate={updateSegment}
      onPreviewThumbnailChange={setPreviewThumbnail}
      onDeleteSegment={deleteSegment}
      onDuplicateSegment={duplicateSegment}
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
