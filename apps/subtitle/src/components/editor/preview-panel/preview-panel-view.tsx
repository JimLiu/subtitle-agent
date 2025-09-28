"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cloneDeep from "lodash/cloneDeep";
import { useStore } from "zustand";

import { ElementContextMenu } from "./element-context-menu";
import { TimelineElement } from "@/types/timeline";

import { getElementEndTime } from "./deps/element-helpers";
import type { PreviewPanelKonvaActions } from "./preview-panel-konva";
import {
  PreviewPanelStore,
  PreviewPanelStoreState,
  createPreviewPanelStore,
} from "./preview-panel-store";
import { PreviewPlaybackControls } from "./preview-playback-controls";

// 动态加载 Konva 渲染器类，避免首次渲染的包体膨胀。
type PreviewPanelKonvaModule = typeof import("./preview-panel-konva");
type PreviewPanelKonvaClass = PreviewPanelKonvaModule["PreviewPanelKonva"];
type PreviewPanelKonvaInstance = InstanceType<PreviewPanelKonvaClass>;

/**
 * 预览视图层组件（无全局耦合）：
 * - 接收外部注入的 store 与各项回调；
 * - 创建并管理 PreviewPanelKonva 实例；
 * - 提供播放控件、右键菜单与快捷键；
 * - 对帧推进使用 requestAnimationFrame，在 playing 为 true 时更新 currentTimestamp。
 */
interface PreviewPanelViewProps {
  store?: PreviewPanelStore;
  className?: string;
  onPlayingChange?: (value: boolean) => void;
  onSelectedElementChange?: (elementId: string | null) => void;
  onActiveToolChange?: (tool: string | null) => void;
  onElementUpdate?: (payload: Partial<TimelineElement> & { id: string }) => void | Promise<void>;
  onPreviewThumbnailChange?: (path: string) => void | Promise<void>;
  onDeleteElement?: (elementId: string) => void | Promise<void>;
  onDuplicateElement?: (payload: { id: string }) => void | Promise<void>;
}

function getDurationFromElements(elements: PreviewPanelStoreState["elements"]): number {
  return Object.values(elements).reduce((acc, element) => {
    if (!element) {
      return acc;
    }
    return Math.max(acc, getElementEndTime(element));
  }, 0);
}

function generateElementId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `element-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export const PreviewPanelView: React.FC<PreviewPanelViewProps> = (props) => {
  const {
    store: providedStore,
    className,
    onPlayingChange,
    onSelectedElementChange,
    onActiveToolChange,
    onElementUpdate,
    onPreviewThumbnailChange,
    onDeleteElement,
    onDuplicateElement,
  } = props;

  // 渲染容器引用：用于挂载 Konva 舞台
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerElement(node);
  }, []);
  const [previewPanelKonvaCtor, setPreviewPanelKonvaCtor] =
    useState<PreviewPanelKonvaClass | null>(null);
  const konvaRef = useRef<PreviewPanelKonvaInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimestampRef = useRef<number | null>(null);
  const storeRef = useRef<PreviewPanelStore>(providedStore ?? createPreviewPanelStore());

  // 若外部传入 store 发生变化，替换内部引用
  useEffect(() => {
    if (providedStore && providedStore !== storeRef.current) {
      storeRef.current = providedStore;
    }
  }, [providedStore]);

  const storeApi = storeRef.current;
  const playing = useStore(storeApi, (state) => state.playing);
  const konvaInit = useStore(storeApi, (state) => state.konvaInit);
  const currentTimestamp = useStore(storeApi, (state) => state.currentTimestamp);
  const elements = useStore(storeApi, (state) => state.elements);
  const buffering = useStore(storeApi, (state) => state.buffering);
  const selectedElement = useStore(storeApi, (state) => state.selectedElement);
  const showContextMenu = useStore(storeApi, (state) => state.showContextMenu);
  const contextMenuPosition = useStore(storeApi, (state) => state.contextMenuPosition);
  const shouldShowContextMenu = showContextMenu && Boolean(selectedElement);

  const duration = useMemo(() => getDurationFromElements(elements), [elements]);

  // 便捷 patch：写回到 store
  const patch = useCallback(
    (partial: Partial<PreviewPanelStoreState>) => {
      storeApi.getState().patch(partial);
    },
    [storeApi],
  );

  // 设置播放：必要时恢复 AudioContext；暂停时重置帧时间起点
  const handleSetPlaying = useCallback(
    (value: boolean) => {
      if (value) {
        const audioContext = storeApi.getState().audioContext;
        if (audioContext && audioContext.state === "suspended") {
          void audioContext.resume().catch((error) => {
            console.warn("Failed to resume audio context for preview playback", error);
          });
        }
      }
      patch({ playing: value });
      if (!value) {
        lastFrameTimestampRef.current = null;
      }
      onPlayingChange?.(value);
    },
    [onPlayingChange, patch, storeApi],
  );

  const handleSetSelectedElement = useCallback(
    (elementId: string | null) => {
      patch({ selectedElement: elementId });
      onSelectedElementChange?.(elementId);
    },
    [onSelectedElementChange, patch],
  );

  const handleRemoveActiveTool = useCallback(() => {
    onActiveToolChange?.(null);
  }, [onActiveToolChange]);

  const handleSetActiveTool = useCallback(
    (tool: string) => {
      onActiveToolChange?.(tool);
    },
    [onActiveToolChange],
  );

  // 合并更新指定段落（先本地更新，再通知外部）
  const handleUpdateElement = useCallback(
    async (payload: Partial<TimelineElement> & { id: string }) => {
      const state = storeApi.getState();
      const existing = state.elements[payload.id];
      if (!existing) {
        return;
      }
      const updated: TimelineElement = { ...existing, ...cloneDeep(payload) } as TimelineElement;
      patch({
        elements: {
          ...state.elements,
          [payload.id]: updated,
        },
      });
      await onElementUpdate?.(payload);
    },
    [onElementUpdate, patch, storeApi],
  );

  const handleSetPreviewThumbnail = useCallback(
    async (path: string) => {
      await onPreviewThumbnailChange?.(path);
    },
    [onPreviewThumbnailChange],
  );

  // 删除指定段落（先本地、再外部）
  const handleDeleteElement = useCallback(
    async (elementId: string) => {
      const state = storeApi.getState();
      if (!state.elements[elementId]) {
        return;
      }
      const nextElements = { ...state.elements };
      delete nextElements[elementId];
      patch({ elements: nextElements });
      await onDeleteElement?.(elementId);
    },
    [onDeleteElement, patch, storeApi],
  );

  // 复制段落：生成新 id，提升 zIndex
  const handleDuplicateElement = useCallback(
    async (payload: { id: string }) => {
      const state = storeApi.getState();
      const element = state.elements[payload.id];
      if (!element) {
        return;
      }
      const cloned = cloneDeep(element);
      const newId = generateElementId();
      cloned.id = newId;
      cloned.zIndex = (state.maxZIndex ?? 0) + 1;
      const nextElements = {
        ...state.elements,
        [newId]: cloned,
      };
      patch({ elements: nextElements });
      await onDuplicateElement?.(payload);
    },
    [onDuplicateElement, patch, storeApi],
  );

  const handleContextMenuClose = useCallback(() => {
    patch({ showContextMenu: false });
  }, [patch]);

  const handleContextDuplicate = useCallback(() => {
    konvaRef.current?.duplicate();
  }, []);

  const handleContextBringToFront = useCallback(() => {
    konvaRef.current?.bringToFront();
  }, []);

  const handleContextSendToBack = useCallback(() => {
    konvaRef.current?.sendToBack();
  }, []);

  const handleContextRemove = useCallback(() => {
    konvaRef.current?.remove();
  }, []);

  const actionCallbacks = useMemo<PreviewPanelKonvaActions>(
    () => ({
      setPlaying: handleSetPlaying,
      setSelectedElement: handleSetSelectedElement,
      removeActiveTool: handleRemoveActiveTool,
      setActiveTool: handleSetActiveTool,
      updateElement: handleUpdateElement,
      setPreviewThumbnail: handleSetPreviewThumbnail,
      deleteElement: handleDeleteElement,
      duplicateElement: handleDuplicateElement,
    }),
    [
      handleDeleteElement,
      handleDuplicateElement,
      handleRemoveActiveTool,
      handleSetActiveTool,
      handleSetPlaying,
      handleSetPreviewThumbnail,
      handleSetSelectedElement,
      handleUpdateElement,
    ],
  );

  const latestActionsRef = useRef<PreviewPanelKonvaActions>(actionCallbacks);

  // 同步最新的 action 回调到 Konva 实例
  useEffect(() => {
    latestActionsRef.current = actionCallbacks;
    konvaRef.current?.updateActions(actionCallbacks);
  }, [actionCallbacks]);

  // 懒加载 Konva 渲染类
  useEffect(() => {
    let isCancelled = false;

    void import("./preview-panel-konva")
      .then((module) => {
        if (isCancelled) {
          return;
        }
        setPreviewPanelKonvaCtor(() => module.PreviewPanelKonva);
      })
      .catch((error) => {
        console.error("Failed to load preview panel renderer", error);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  // 创建/销毁 Konva 实例：容器或构造器变化时重建
  useEffect(() => {
    if (!containerElement || !previewPanelKonvaCtor) {
      return;
    }

    const existing = konvaRef.current;
    const needsNewInstance =
      !existing ||
      existing.getStore() !== storeApi ||
      existing.getContainer() !== containerElement;

    if (needsNewInstance) {
      existing?.destroy();
      const instance = new previewPanelKonvaCtor({
        container: containerElement,
        store: storeApi,
      });
      instance.updateActions(latestActionsRef.current);
      instance.initialize();
      konvaRef.current = instance;
    }

    return () => {
      if (konvaRef.current && konvaRef.current.getContainer() === containerElement) {
        konvaRef.current.destroy();
        konvaRef.current = null;
      }
    };
  }, [containerElement, previewPanelKonvaCtor, storeApi]);

  // 播放帧推进循环（requestAnimationFrame）
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return undefined;
    }

    if (duration <= 0) {
      handleSetPlaying(false);
      patch({ currentTimestamp: 0 });
      return undefined;
    }

    const step = (timestamp: number) => {
      const state = storeApi.getState();
      if (!state.playing) {
        return;
      }
      const lastTimestamp = lastFrameTimestampRef.current ?? timestamp;
      const deltaMs = timestamp - lastTimestamp;
      const deltaSeconds = deltaMs / 1000;
      lastFrameTimestampRef.current = timestamp;
      const nextTimestamp = Math.min(state.currentTimestamp + deltaSeconds, duration);
      if (nextTimestamp !== state.currentTimestamp) {
        patch({ currentTimestamp: nextTimestamp });
      }
      if (nextTimestamp >= duration) {
        handleSetPlaying(false);
        patch({ currentTimestamp: duration });
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastFrameTimestampRef.current = null;
    };
  }, [duration, handleSetPlaying, patch, playing, storeApi]);

  // 当停止播放或时长为 0 时，修正 currentTimestamp 到合法范围
  useEffect(() => {
    const state = storeApi.getState();
    if (!state.playing && state.currentTimestamp > duration) {
      patch({ currentTimestamp: duration });
    }
    if (duration === 0 && state.currentTimestamp !== 0) {
      patch({ currentTimestamp: 0 });
    }
  }, [duration, patch, storeApi]);

  const containerClassName = useMemo(() => {
    const base = "pane relative flex h-full min-h-0 w-full flex-grow flex-col";
    return className ? `${base} ${className}` : base;
  }, [className]);

  // 播放/暂停切换：若已在尾帧，重置到 0
  const handleTogglePlayback = useCallback(() => {
    const state = storeApi.getState();
    const nextValue = !state.playing;
    if (!state.playing && state.currentTimestamp >= duration) {
      patch({ currentTimestamp: 0 });
    }
    handleSetPlaying(nextValue);
  }, [duration, handleSetPlaying, patch, storeApi]);

  // 时间轴复位到 0
  const handleReset = useCallback(() => {
    patch({ currentTimestamp: 0 });
  }, [patch]);

  return (
    <>
      <div ref={setContainerRef} id="stage" className={containerClassName}>
        {!konvaInit ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        ) : null}

        <div
          id="preview-container"
          className="preview-container relative dark:bg-gray-900 flex-1 min-h-128 w-full"
        />

        <PreviewPlaybackControls
          playing={playing}
          buffering={buffering}
          currentTimestamp={currentTimestamp}
          duration={duration}
          onTogglePlayback={handleTogglePlayback}
          onReset={handleReset}
        />
      </div>

      {shouldShowContextMenu ? (
        <ElementContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          onClose={handleContextMenuClose}
          onDuplicate={handleContextDuplicate}
          onBringToFront={handleContextBringToFront}
          onSendToBack={handleContextSendToBack}
          onRemove={handleContextRemove}
        />
      ) : null}
    </>
  );
}

export default PreviewPanelView;
