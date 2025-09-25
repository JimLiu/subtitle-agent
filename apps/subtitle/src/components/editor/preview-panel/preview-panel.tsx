'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cloneDeep from 'lodash/cloneDeep';
import { useStore } from 'zustand';

import { SegmentContextMenu } from '@/components/video-editor/segment-context-menu';

import { PreviewSegment } from './deps/segment-types';
import type { PreviewPanelKonvaActions } from './preview-panel-konva';
import {
  PreviewPanelStore,
  PreviewPanelStoreState,
  createPreviewPanelStore,
} from './preview-panel-store';

type PreviewPanelKonvaModule = typeof import('./preview-panel-konva');
type PreviewPanelKonvaClass = PreviewPanelKonvaModule['PreviewPanelKonva'];
type PreviewPanelKonvaInstance = InstanceType<PreviewPanelKonvaClass>;

interface PreviewPanelProps {
  store?: PreviewPanelStore;
  className?: string;
  onPlayingChange?: (value: boolean) => void;
  onSelectedSegmentChange?: (segmentId: string | null) => void;
  onActiveToolChange?: (tool: string | null) => void;
  onSegmentUpdate?: (payload: Partial<PreviewSegment> & { id: string }) => void | Promise<void>;
  onPreviewThumbnailChange?: (path: string) => void | Promise<void>;
  onDeleteSegment?: (segmentId: string) => void | Promise<void>;
  onDuplicateSegment?: (payload: { id: string }) => void | Promise<void>;
}

function getDurationFromSegments(segments: PreviewPanelStoreState['segments']): number {
  return Object.values(segments).reduce((acc, segment) => {
    if (!segment) {
      return acc;
    }
    return Math.max(acc, segment.endTime ?? segment.startTime ?? 0);
  }, 0);
}

function generateSegmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `segment-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((milliseconds % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = (props) => {
  const {
    store: providedStore,
    className,
    onPlayingChange,
    onSelectedSegmentChange,
    onActiveToolChange,
    onSegmentUpdate,
    onPreviewThumbnailChange,
    onDeleteSegment,
    onDuplicateSegment,
  } = props;

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

  useEffect(() => {
    if (providedStore && providedStore !== storeRef.current) {
      storeRef.current = providedStore;
    }
  }, [providedStore]);

  const storeApi = storeRef.current;
  const playing = useStore(storeApi, (state) => state.playing);
  const konvaInit = useStore(storeApi, (state) => state.konvaInit);
  const currentTimestamp = useStore(storeApi, (state) => state.currentTimestamp);
  const segments = useStore(storeApi, (state) => state.segments);
  const buffering = useStore(storeApi, (state) => state.buffering);
  const selectedSegment = useStore(storeApi, (state) => state.selectedSegment);
  const showContextMenu = useStore(storeApi, (state) => state.showContextMenu);
  const contextMenuPosition = useStore(storeApi, (state) => state.contextMenuPosition);
  const shouldShowContextMenu = showContextMenu && Boolean(selectedSegment);

  const duration = useMemo(() => getDurationFromSegments(segments), [segments]);

  const patch = useCallback(
    (partial: Partial<PreviewPanelStoreState>) => {
      storeApi.getState().patch(partial);
    },
    [storeApi],
  );

  const handleSetPlaying = useCallback(
    (value: boolean) => {
      if (value) {
        const audioContext = storeApi.getState().audioContext;
        if (audioContext && audioContext.state === 'suspended') {
          void audioContext.resume().catch((error) => {
            console.warn('Failed to resume audio context for preview playback', error);
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

  const handleSetSelectedSegment = useCallback(
    (segmentId: string | null) => {
      patch({ selectedSegment: segmentId });
      onSelectedSegmentChange?.(segmentId);
    },
    [onSelectedSegmentChange, patch],
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

  const handleUpdateSegment = useCallback(
    async (payload: Partial<PreviewSegment> & { id: string }) => {
      const state = storeApi.getState();
      const existing = state.segments[payload.id];
      if (!existing) {
        return;
      }
      const updated: PreviewSegment = { ...existing, ...cloneDeep(payload) } as PreviewSegment;
      patch({
        segments: {
          ...state.segments,
          [payload.id]: updated,
        },
      });
      await onSegmentUpdate?.(payload);
    },
    [onSegmentUpdate, patch, storeApi],
  );

  const handleSetPreviewThumbnail = useCallback(
    async (path: string) => {
      await onPreviewThumbnailChange?.(path);
    },
    [onPreviewThumbnailChange],
  );

  const handleDeleteSegment = useCallback(
    async (segmentId: string) => {
      const state = storeApi.getState();
      if (!state.segments[segmentId]) {
        return;
      }
      const nextSegments = { ...state.segments };
      delete nextSegments[segmentId];
      patch({ segments: nextSegments });
      await onDeleteSegment?.(segmentId);
    },
    [onDeleteSegment, patch, storeApi],
  );

  const handleDuplicateSegment = useCallback(
    async (payload: { id: string }) => {
      const state = storeApi.getState();
      const segment = state.segments[payload.id];
      if (!segment) {
        return;
      }
      const cloned = cloneDeep(segment);
      const newId = generateSegmentId();
      cloned.id = newId;
      cloned.zIndex = (state.maxZIndex ?? 0) + 1;
      const nextSegments = {
        ...state.segments,
        [newId]: cloned,
      };
      patch({ segments: nextSegments });
      await onDuplicateSegment?.(payload);
    },
    [onDuplicateSegment, patch, storeApi],
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
      setSelectedSegment: handleSetSelectedSegment,
      removeActiveTool: handleRemoveActiveTool,
      setActiveTool: handleSetActiveTool,
      updateSegment: handleUpdateSegment,
      setPreviewThumbnail: handleSetPreviewThumbnail,
      deleteSegment: handleDeleteSegment,
      duplicateSegment: handleDuplicateSegment,
    }),
    [
      handleDeleteSegment,
      handleDuplicateSegment,
      handleRemoveActiveTool,
      handleSetActiveTool,
      handleSetPlaying,
      handleSetPreviewThumbnail,
      handleSetSelectedSegment,
      handleUpdateSegment,
    ],
  );

  const latestActionsRef = useRef<PreviewPanelKonvaActions>(actionCallbacks);

  useEffect(() => {
    latestActionsRef.current = actionCallbacks;
    konvaRef.current?.updateActions(actionCallbacks);
  }, [actionCallbacks]);

  useEffect(() => {
    let isCancelled = false;

    void import('./preview-panel-konva')
      .then((module) => {
        if (isCancelled) {
          return;
        }
        setPreviewPanelKonvaCtor(() => module.PreviewPanelKonva);
      })
      .catch((error) => {
        console.error('Failed to load preview panel renderer', error);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

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
      const delta = timestamp - lastTimestamp;
      lastFrameTimestampRef.current = timestamp;
      const nextTimestamp = Math.min(state.currentTimestamp + delta, duration);
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
    const base = 'pane relative flex h-full min-h-0 w-full flex-grow flex-col';
    return className ? `${base} ${className}` : base;
  }, [className]);

  const handleTogglePlayback = useCallback(() => {
    const state = storeApi.getState();
    const nextValue = !state.playing;
    if (!state.playing && state.currentTimestamp >= duration) {
      patch({ currentTimestamp: 0 });
    }
    handleSetPlaying(nextValue);
  }, [duration, handleSetPlaying, patch, storeApi]);

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

        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-md px-3 py-2 text-sm backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePlayback}
              className="rounded bg-white/20 px-3 py-1 text-xs font-medium uppercase tracking-wide hover:bg-white/30"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
            >
              Reset
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <span className="tabular-nums">{formatTimestamp(currentTimestamp)}</span>
              <span className="text-white/50">/</span>
              <span className="tabular-nums">{formatTimestamp(duration)}</span>
              {buffering ? <span className="text-xs text-white/70">Buffering…</span> : null}
            </div>
          </div>
        </div>
      </div>

      {shouldShowContextMenu ? (
        <SegmentContextMenu
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

export default PreviewPanel;
