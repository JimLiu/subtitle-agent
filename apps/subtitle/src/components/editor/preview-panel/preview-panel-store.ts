
import Konva from 'konva';
import cloneDeep from 'lodash/cloneDeep';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import type { Mutate, StoreApi } from 'zustand/vanilla';

import { TimelineElement } from "@/types/timeline";

import { SpectrumAnalyzer } from './deps/spectrum-analyzer';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface PreviewSize {
  ratio: string;
  original: {
    width: number;
    height: number;
  };
}

export interface PreviewPanelState {
  konvaInit: boolean;
  stage: Konva.Stage | null;
  layer: Konva.Layer | null;
  backgroundGroup: Konva.Group | null;
  backgroundRect: Konva.Rect | null;
  maskingGroup: Konva.Group | null;
  videoGroup: Konva.Group | null;
  transformer: Konva.Transformer | null;
  hoverTransformer: Konva.Transformer | null;
  rotationText: Konva.Text | null;
  rotationTextTimeout: number | null;
  helperTextGroup: Konva.Group | null;
  helperTextBackgroundRect: Konva.Rect | null;
  stageWidth: number;
  stageHeight: number;
  calculatedWidth: number;
  calculatedHeight: number;
  calculatedXStart: number;
  calculatedYStart: number;
  idealWidth: number;
  idealHeight: number;
  selectedShapeName: string | null;
  hoverShapeName: string | null;
  scaleFactor: number;
  audioContext: AudioContext | null;
  analyzer: SpectrumAnalyzer | null;
  transformerActive: boolean;
  showContextMenu: boolean;
  contextMenuPosition: ContextMenuPosition;
  screenshotInterval: number | null;
  isDarkMode: boolean;
  mutationObserver: MutationObserver | null;
  resizeObserver: ResizeObserver | null;
  stageAnimation: Konva.Animation | null;
}

export interface PreviewPanelStoreData extends PreviewPanelState {
  selectedSegment: string | null;
  segments: Record<string, TimelineElement>;
  orderedSegments: TimelineElement[];
  backgroundColor: string;
  size: PreviewSize;
  currentTimestamp: number;
  buffering: boolean;
  playing: boolean;
  minZIndex: number;
  maxZIndex: number;
}

export interface PreviewPanelStoreActions {
  patch(partial: Partial<PreviewPanelStoreData>): void;
  getSegmentsClone(): Record<string, TimelineElement>;
  getSegmentById(id: string): TimelineElement | null;
}

export type PreviewPanelStoreState = PreviewPanelStoreData & PreviewPanelStoreActions;

export type PreviewPanelStore = Mutate<StoreApi<PreviewPanelStoreState>, [['zustand/subscribeWithSelector', never]]>;

function getWindowDimensions(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }
  const element = document.getElementById('stage');
  return {
    width: element ? element.offsetWidth : window.innerWidth,
    height: element ? element.offsetHeight : window.innerHeight,
  };
}

function createDefaultState(): PreviewPanelStoreData {
  const { width, height } = getWindowDimensions();
  return {
    konvaInit: false,
    stage: null,
    layer: null,
    backgroundGroup: null,
    backgroundRect: null,
    maskingGroup: null,
    videoGroup: null,
    transformer: null,
    hoverTransformer: null,
    rotationText: null,
    rotationTextTimeout: null,
    helperTextGroup: null,
    helperTextBackgroundRect: null,
    stageWidth: width,
    stageHeight: height,
    calculatedWidth: 0,
    calculatedHeight: 0,
    calculatedXStart: 0,
    calculatedYStart: 0,
    idealWidth: 0,
    idealHeight: 0,
    selectedShapeName: null,
    hoverShapeName: null,
    scaleFactor: 0,
    audioContext: null,
    analyzer: null,
    transformerActive: false,
    showContextMenu: false,
    contextMenuPosition: { x: 0, y: 0 },
    screenshotInterval: null,
    isDarkMode: typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
    mutationObserver: null,
    resizeObserver: null,
    stageAnimation: null,
    selectedSegment: null,
    segments: {},
    orderedSegments: [],
    backgroundColor: '#000000',
    size: {
      ratio: 'original',
      original: { width: 1920, height: 1080 },
    },
    currentTimestamp: 0,
    buffering: false,
    playing: false,
    minZIndex: 0,
    maxZIndex: 0,
  };
}

export function createPreviewPanelStore(initialState: Partial<PreviewPanelStoreData> = {}): PreviewPanelStore {
  return createStore(
    subscribeWithSelector<PreviewPanelStoreState>((set, get) => ({
      ...createDefaultState(),
      ...initialState,
      patch(partial) {
        set(partial as Partial<PreviewPanelStoreState>);
      },
      getSegmentsClone() {
        return cloneDeep(get().segments);
      },
      getSegmentById(id) {
        const segment = get().segments[id];
        return segment ?? null;
      },
    })),
  );
}
