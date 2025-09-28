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

type ElementsMetaResult = {
  orderedElementsForPreview: TimelineElement[];
  elementsWithSources: Record<string, TimelineElement>;
  elementMap: Record<string, TimelineElement>;
  elementTrackMap: Map<string, string>;
  minZIndex: number;
  maxZIndex: number;
  objectUrlCache: Map<string, string>;
};

/**
 * 预览面板容器：
 * - 从 project/timeline/media/playback 等全局 store 汇集渲染所需数据；
 * - 组装并提供 PreviewPanelStore（Zustand）给视图层；
 * - 将视图层产生的交互回传到各业务 store（如更新元素属性、选择/删除/复制等）。
 */
export function PreviewPanelContainer() {
  // ---- Timeline Store：与时间线交互相关的状态与动作 ----
  // tracks: 轨道及其元素的结构化数据，是组成预览层级的基础
  const tracks = useTimelineStore((state) => state.tracks);
  // selectedElements: 当前被选中的时间线元素集合（通常只有一个，用于与视图联动）
  const selectedElements = useTimelineStore((state) => state.selectedElements);
  // selectElement / clearSelectedElements: 控制全局的选中态，确保与其他面板一致
  const selectElement = useTimelineStore((state) => state.selectElement);
  const clearSelectedElements = useTimelineStore(
    (state) => state.clearSelectedElements
  );
  // updateElementProperties: 依据轨道与元素 id 更新属性的原子操作
  const updateElementProperties = useTimelineStore(
    (state) => state.updateElementProperties
  );
  // removeElementFromTrackWithRipple: 删除元素时同时执行 ripple，维持时间线紧凑
  const removeElementFromTrackWithRipple = useTimelineStore(
    (state) => state.removeElementFromTrackWithRipple
  );
  // duplicateElement: 复制元素，保持在原轨道的正确插入位置
  const duplicateElement = useTimelineStore((state) => state.duplicateElement);

  // ---- Media Store：提供媒体文件元数据，用于匹配元素的媒体资源 ----
  const mediaFiles = useMediaStore((state) => state.mediaFiles);

  // ---- Project Store：项目级信息（画布尺寸、背景色、缩略图设置等） ----
  const activeProject = useProjectStore((state) => state.activeProject);
  const setPreviewThumbnail = useProjectStore(
    (state) => state.setPreviewThumbnail
  );

  // ---- Playback Store：播控状态，同步预览面板的播放/暂停与时间戳 ----
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const currentTime = usePlaybackStore((state) => state.currentTime);
  const play = usePlaybackStore((state) => state.play);
  const pause = usePlaybackStore((state) => state.pause);

  // 根据媒体 id 快速获取媒体文件对象
  // 说明：预览面板渲染时需要频繁查找媒体信息（文件、预生成 url 等），
  // 使用 Map 可以避免 O(n) 的线性扫描，提高渲染数据构建效率。
  const mediaById = useMemo(() => {
    const map = new Map<string, MediaFile>();
    mediaFiles.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [mediaFiles]);

  const objectUrlCacheRef = useRef<Map<string, string>>(new Map());

  // 计算与缓存：按 zIndex（或回退顺序）排序后的元素列表与辅助映射，并同步生成 remoteSource
  // 说明：
  // 1. orderedElementsForPreview 用于实际渲染顺序，优先 respect 自定义 zIndex。
  // 2. elementMap / elementTrackMap 便于根据 id 快速读取元素及反查所在轨道。
  // 3. fallbackZ 以 track 与 element 的索引组合，保证在缺少 zIndex 时也有稳定层级。
  // 4. elementsWithSources/orderedElementsForPreview 在构建阶段即填充 remoteSource，避免额外遍历。
  const elementsMeta: ElementsMetaResult = useMemo(() => {
    const currentCache = objectUrlCacheRef.current;
    const nextCache = new Map<string, string>();
    const entries: ElementMeta[] = [];
    const elementMap: Record<string, TimelineElement> = {};
    const elementTrackMap = new Map<string, string>();
    const elementsWithSources: Record<string, TimelineElement> = {};

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

    tracks.forEach((track, trackIndex) => {
      track.elements.forEach((element, elementIndex) => {
        const fallbackZ = trackIndex * 1000 + elementIndex;
        entries.push({ element, trackId: track.id, fallbackZ });
        elementMap[element.id] = element;
        elementTrackMap.set(element.id, track.id);

        const clone = cloneDeep(element);
        if (element.mediaId) {
          const remoteSource = resolveRemoteSource(element.mediaId);
          if (remoteSource) {
            clone.remoteSource = remoteSource;
          }
        }
        elementsWithSources[element.id] = clone;
      });
    });

    const orderedEntries = entries
      .slice()
      .sort((a, b) => {
        const aValue = a.element.zIndex ?? a.fallbackZ;
        const bValue = b.element.zIndex ?? b.fallbackZ;
        if (aValue === bValue) {
          return a.element.startTime - b.element.startTime;
        }
        return aValue - bValue;
      });

    const orderedElementsForPreview = orderedEntries.map(
      (entry) => elementsWithSources[entry.element.id]
    );

    const zValues = orderedEntries.map(
      (entry) => entry.element.zIndex ?? entry.fallbackZ
    );
    const minZIndex = zValues.length > 0 ? Math.min(...zValues) : 0;
    const maxZIndex = zValues.length > 0 ? Math.max(...zValues) : 0;

    return {
      orderedElementsForPreview,
      elementsWithSources,
      elementMap,
      elementTrackMap,
      minZIndex,
      maxZIndex,
      objectUrlCache: nextCache,
    };
  }, [tracks, mediaById]);

  const {
    orderedElementsForPreview,
    elementsWithSources,
    elementMap,
    elementTrackMap,
    minZIndex,
    maxZIndex,
    objectUrlCache: nextObjectUrlCache,
  } = elementsMeta;

  // 计算当前选中的元素 id（若全局选择已失效/被删除则置空）
  // 说明：时间线 store 只保证选中状态对应的 id，元素可能因删除或撤销已不存在，
  // 此处做一次匹配校验以避免预览面板出现“幽灵选中态”。
  const selectedElementId = useMemo(() => {
    const currentId = selectedElements[0]?.elementId;
    if (!currentId) {
      return null;
    }
    return elementMap[currentId] ? currentId : null;
  }, [selectedElements, elementMap]);

  const projectId = activeProject?.id;

  // 预览尺寸：支持按预设比例或原始尺寸计算
  // 说明：
  // - preset 模式下根据 ratioPresets 推导出常见比例（16:9/9:16 等）；
  // - original 模式保持与项目画布一致的像素尺寸；
  // 与 View 中的可视缩放结合，确保画面比例正确。
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
  // 说明：
  // - previewStoreRef 确保在整个组件生命周期内共享同一个 Zustand store；
  // - 避免每次渲染新建 store 导致订阅重建或状态丢失。
  const previewStoreRef = useRef<PreviewPanelStore>(null);
  if (!previewStoreRef.current) {
    previewStoreRef.current = createPreviewPanelStore();
  }
  const previewStore = previewStoreRef.current;

  // 组件卸载时释放在浏览器内生成的 Object URL，避免内存泄漏
  // 说明：该缓存与媒体 file 字段相关，若不清理会导致浏览器内存增长。
  useEffect(() => {
    return () => {
      objectUrlCacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      objectUrlCacheRef.current.clear();
    };
  }, []);

  // 当项目、尺寸或时间线发生变化时，准备具有 remoteSource 的片段副本并更新 store
  // 说明：
  // 1. elementsMeta 已预先深拷贝元素并填充 remoteSource，避免重复计算；
  // 2. 更新 Object URL 缓存时及时回收未复用的引用，防止浏览器内存泄漏。
  useEffect(() => {
    if (!activeProject || !previewSize) {
      return;
    }

    const currentCache = objectUrlCacheRef.current;
    const nextCache = nextObjectUrlCache;

    // 若上一轮缓存的 Object URL 未出现在新数据中，则释放对应引用
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
      elements: elementsWithSources,
      orderedElements: orderedElementsForPreview,
      minZIndex,
      maxZIndex,
      buffering: false,
    } as Partial<PreviewPanelStoreData>);
  }, [
    activeProject,
    previewSize,
    elementsWithSources,
    orderedElementsForPreview,
    minZIndex,
    maxZIndex,
    previewStore,
    nextObjectUrlCache,
  ]);

  // 播放状态、时间戳、与选中元素的同步
  // 说明：每次外部状态变化时，将关键字段写入 PreviewPanelStore，使得预览画面实时反映真实状态。
  useEffect(() => {
    if (!previewSize) {
      return;
    }

    previewStore.getState().patch({
      playing: isPlaying,
      currentTimestamp: Math.max(0, currentTime),
      selectedElement: selectedElementId,
    } as Partial<PreviewPanelStoreData>);
  }, [isPlaying, currentTime, selectedElementId, previewSize, previewStore]);

  // 代理播放/暂停到全局 playback store
  // 说明：预览面板内的播放控制是全局的，因此直接调用全局 store 的 play/pause。
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
  // 说明：预览面板产生的选中事件需要与时间线保持同步，
  // 若找不到对应轨道则视为选中失效，直接清空全局选中态。
  const setSelectedElement = useCallback(
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
  // 说明：payload 仅包含有变更的字段，利用全局 store 执行局部更新，保持响应式。
  const updateElement = useCallback(
    async (payload: Partial<TimelineElement> & { id: string }) => {
      const trackId = elementTrackMap.get(payload.id);
      if (!trackId) return;
      const { id, ...rest } = payload;
      updateElementProperties(trackId, id, rest);
    },
    [elementTrackMap, updateElementProperties]
  );

  // 删除元素并自动 ripple（补齐时间线间隙）
  // 说明：预览面板删除操作沿用时间线的 ripple 策略，避免留下空白区域。
  const handleDeleteElement = useCallback(
    async (id: string) => {
      const trackId = elementTrackMap.get(id);
      if (!trackId) return;
      removeElementFromTrackWithRipple(trackId, id, true);
    },
    [elementTrackMap, removeElementFromTrackWithRipple]
  );

  // 复制元素（保持同一轨道）
  // 说明：复制后新的元素会出现在原轨道中，遵循时间线 store 的默认排布策略。
  const handleDuplicateElement = useCallback(
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
      onSelectedElementChange={setSelectedElement}
      onActiveToolChange={handleActiveToolChange}
      onElementUpdate={updateElement}
      onPreviewThumbnailChange={setPreviewThumbnail}
      onDeleteElement={handleDeleteElement}
      onDuplicateElement={handleDuplicateElement}
    />
  );
}
