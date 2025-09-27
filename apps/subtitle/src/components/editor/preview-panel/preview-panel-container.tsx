"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import cloneDeep from "lodash/cloneDeep";

import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { usePlaybackStore } from "@/stores/playback-store";
import { useMediaStore } from "@/stores/media-store";
import type { TimelineElement } from "@/types/timeline";
import type { MediaFile } from "@/types/media";

import ratioPresets from "./deps/ratio-presets";
import { PreviewPanelView } from "./preview-panel-view";
import { createPreviewPanelStore } from "./preview-panel-store";
import type { PreviewPanelStore, PreviewPanelStoreData, PreviewSize } from "./preview-panel-store";
import { getRatioKey } from "./ratio-utils";

// 为排序与分层计算而构造的元素元数据
type ElementMeta = {
  element: TimelineElement;
  trackId: string;
  fallbackZ: number;
};

/**
 * 预览面板容器：
 * - 从 project/timeline/media/playback 等全局 store 汇集渲染所需数据；
 * - 组装并提供 PreviewPanelStore（Zustand）给视图层；
 * - 将视图层产生的交互回传到各业务 store（如更新元素属性、选择/删除/复制等）。
 */
export function PreviewPanelContainer() {
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
  const mediaFiles = useMediaStore((state) => state.mediaFiles);

  const activeProject = useProjectStore((state) => state.activeProject);
  const setPreviewThumbnail = useProjectStore(
    (state) => state.setPreviewThumbnail
  );

  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const currentTime = usePlaybackStore((state) => state.currentTime);
  const play = usePlaybackStore((state) => state.play);
  const pause = usePlaybackStore((state) => state.pause);

  // 计算与缓存：按 zIndex（或回退顺序）排序后的元素列表与辅助映射
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

  // 根据媒体 id 快速获取媒体文件对象
  const mediaById = useMemo(() => {
    const map = new Map<string, MediaFile>();
    mediaFiles.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [mediaFiles]);

  // 计算当前选中的元素 id（若全局选择已失效/被删除则置空）
  const selectedSegmentId = useMemo(() => {
    const currentId = selectedElements[0]?.elementId;
    if (!currentId) {
      return null;
    }
    return elementMap[currentId] ? currentId : null;
  }, [selectedElements, elementMap]);

  const projectId = activeProject?.id;

  // 预览尺寸：支持按预设比例或原始尺寸计算
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

  // 创建并持有 PreviewPanelStore 的单例引用
  const previewStoreRef = useRef<PreviewPanelStore>(null);
  if (!previewStoreRef.current) {
    previewStoreRef.current = createPreviewPanelStore();
  }
  const previewStore = previewStoreRef.current;
  const objectUrlCacheRef = useRef<Map<string, string>>(new Map());

  // 组件卸载时释放在浏览器内生成的 Object URL，避免内存泄漏
  useEffect(() => {
    return () => {
      objectUrlCacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      objectUrlCacheRef.current.clear();
    };
  }, []);

  // 当项目、尺寸或时间线发生变化时，准备具有 remoteSource 的片段副本并更新 store
  useEffect(() => {
    if (!activeProject || !previewSize) {
      return;
    }

    const currentCache = objectUrlCacheRef.current;
    const nextCache = new Map<string, string>();
    const segmentCache = new Map<string, TimelineElement>();

    // 解析媒体资源的远端地址：优先使用已有 url，其次使用浏览器生成的 Object URL
    const resolveRemoteSource = (mediaId: string): string | null => {
      const media = mediaById.get(mediaId);
      if (!media) {
        console.warn(`Media asset ${mediaId} not found for preview rendering`);
        return null;
      }

      if (media.url) {
        return media.url;
      }

      const cachedUrl = currentCache.get(mediaId);
      if (cachedUrl) {
        nextCache.set(mediaId, cachedUrl);
        return cachedUrl;
      }

      if (media.file) {
        const url = URL.createObjectURL(media.file);
        nextCache.set(mediaId, url);
        return url;
      }

      return null;
    };

    // 深拷贝单个元素并填充 remoteSource（如可用）
    const getSegmentClone = (segment: TimelineElement): TimelineElement => {
      const existing = segmentCache.get(segment.id);
      if (existing) {
        return existing;
      }

      const clone = cloneDeep(segment);
      if (segment.mediaId) {
        const remoteSource = resolveRemoteSource(segment.mediaId);
        if (remoteSource) {
          clone.remoteSource = remoteSource;
        }
      }
      segmentCache.set(segment.id, clone);
      return clone;
    };

    const segmentsWithSources: Record<string, TimelineElement> = {};
    Object.entries(elementMap).forEach(([id, segment]) => {
      segmentsWithSources[id] = getSegmentClone(segment);
    });

    const orderedWithSources = orderedElements.map((segment) => getSegmentClone(segment));

    currentCache.forEach((url, mediaId) => {
      if (!nextCache.has(mediaId)) {
        URL.revokeObjectURL(url);
      }
    });
    objectUrlCacheRef.current = nextCache;

    // 批量更新预览 store 的可渲染状态
    previewStore.getState().patch({
      backgroundColor: activeProject.backgroundColor ?? "#000000",
      size: previewSize,
      segments: segmentsWithSources,
      orderedSegments: orderedWithSources,
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
    mediaById,
    previewStore,
  ]);

  // 播放状态、时间戳、与选中元素的同步
  useEffect(() => {
    if (!previewSize) {
      return;
    }

    previewStore.getState().patch({
      playing: isPlaying,
      currentTimestamp: Math.max(0, currentTime),
      selectedSegment: selectedSegmentId,
    } as Partial<PreviewPanelStoreData>);
  }, [isPlaying, currentTime, selectedSegmentId, previewSize, previewStore]);

  // 代理播放/暂停到全局 playback store
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

  // 变更选中元素：根据 id 找到对应轨道并使用全局 timeline store 的选择逻辑
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

  // 将视图中的增量修改同步到时间线元素（updateElementProperties）
  const updateSegment = useCallback(
    async (payload: Partial<TimelineElement> & { id: string }) => {
      const trackId = elementTrackMap.get(payload.id);
      if (!trackId) return;
      const { id, ...rest } = payload;
      updateElementProperties(trackId, id, rest);
    },
    [elementTrackMap, updateElementProperties]
  );

  // 删除元素并自动 ripple（补齐时间线间隙）
  const deleteSegment = useCallback(
    async (id: string) => {
      const trackId = elementTrackMap.get(id);
      if (!trackId) return;
      removeElementFromTrackWithRipple(trackId, id, true);
    },
    [elementTrackMap, removeElementFromTrackWithRipple]
  );

  // 复制元素（保持同一轨道）
  const duplicateSegment = useCallback(
    async ({ id }: { id: string }) => {
      const trackId = elementTrackMap.get(id);
      if (!trackId) return;
      duplicateElement(trackId, id);
    },
    [duplicateElement, elementTrackMap]
  );

  // 预留：预览面板工具切换（当前容器无需处理）
  const handleActiveToolChange = useCallback((tool: string | null) => {
    void tool;
  }, []);

  if (!activeProject || !projectId || !previewSize) {
    return <div className="h-full w-full bg-panel" />;
  }

  return (
    <PreviewPanelView
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
