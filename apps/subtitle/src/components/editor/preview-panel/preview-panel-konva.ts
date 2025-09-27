import Konva from 'konva';
import hotkeys from 'hotkeys-js';
import cloneDeep from 'lodash/cloneDeep';

import ratioPresets from './deps/ratio-presets';
import { SAMPLE_RATE } from './deps/constants';
import { SpectrumAnalyzer } from './deps/spectrum-analyzer';
import {
  AudioElement,
  ImageElement,
  ProgressBarElement,
  ShapeElement,
  TextElement,
  TimelineElement,
  VideoElement,
  WaveElement,
} from "@/types/timeline";
import { ExportOptions, ExportResult } from '@/types/export';
import { exportPreviewVideo } from './export/export-video';
import { PreviewPanelStore, PreviewPanelStoreData, PreviewPanelStoreState } from './preview-panel-store';
import { BaseRenderer, RendererFrameContext } from './renderers/base';
import { createAudioRenderer } from './renderers/audio';
import { createImageRenderer } from './renderers/image';
import { createProgressBarRenderer } from './renderers/progress-bar';
import { createShapeRenderer } from './renderers/shape';
import { createSubtitleRenderer } from './renderers/subtitles';
import { createTextRenderer } from './renderers/text';
import { VideoRenderer, createVideoRenderer } from './renderers/video';
import { WaveRenderer, createWaveRenderer } from './renderers/wave';

export interface PreviewPanelKonvaActions {
  setPlaying?(value: boolean): void;
  setSelectedSegment?(id: string | null): void;
  removeActiveTool?(): void;
  setActiveTool?(tool: string): void;
  updateSegment?(payload: Partial<TimelineElement> & { id: string }): void | Promise<void>;
  setPreviewThumbnail?(path: string): Promise<void> | void;
  deleteSegment?(id: string): void | Promise<void>;
  duplicateSegment?(payload: { id: string }): void | Promise<void>;
}

export interface PreviewPanelKonvaConfig {
  container: HTMLElement;
  store: PreviewPanelStore;
  actions?: PreviewPanelKonvaActions;
}

export class PreviewPanelKonva {
  private readonly container: HTMLElement;
  private readonly store: PreviewPanelStore;
  private readonly unsubscribeFns: Array<() => void> = [];
  private readonly renderers: Map<string, BaseRenderer<TimelineElement>> = new Map();

  private segmentSyncInFlight = false;
  private queuedSegmentSync: TimelineElement[] | null = null;

  private stageClipFunc: ((ctx: Konva.Context) => void) | null = null;
  private firstInteractionHandler: ((event: Event) => void) | null = null;
  private firstInteractionTarget: (HTMLElement | Document) | null = null;

  constructor(options: PreviewPanelKonvaConfig) {
    this.container = options.container;
    this.store = options.store;

    if (options.actions) {
      this.updateActions(options.actions);
    }
  }

  updateActions(actions: PreviewPanelKonvaActions = {}): void {
    if (actions.setPlaying !== undefined) {
      this.setPlaying = actions.setPlaying;
    }
    if (actions.setSelectedSegment !== undefined) {
      this.setSelectedSegment = actions.setSelectedSegment;
    }
    if (actions.removeActiveTool !== undefined) {
      this.removeActiveTool = actions.removeActiveTool;
    }
    if (actions.setActiveTool !== undefined) {
      this.setActiveTool = actions.setActiveTool;
    }
    if (actions.updateSegment !== undefined) {
      this.updateSegment = actions.updateSegment;
    }
    if (actions.setPreviewThumbnail !== undefined) {
      this.setPreviewThumbnail = actions.setPreviewThumbnail;
    }
    if (actions.deleteSegment !== undefined) {
      this.deleteSegment = actions.deleteSegment;
    }
    if (actions.duplicateSegment !== undefined) {
      this.duplicateSegment = actions.duplicateSegment;
    }
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  getStore(): PreviewPanelStore {
    return this.store;
  }

  initialize(): void {
    this.initializeAudio();
    this.initializeStage();
    this.initializeObservers();
    this.bindShortcuts();
    this.setupStoreSubscriptions();
  }

  destroy(): void {
    const state = this.getState();
    if (this.firstInteractionHandler && this.firstInteractionTarget) {
      this.firstInteractionTarget.removeEventListener('click', this.firstInteractionHandler);
      this.firstInteractionTarget.removeEventListener('pointerdown', this.firstInteractionHandler);
      this.firstInteractionTarget.removeEventListener('touchend', this.firstInteractionHandler);
      this.firstInteractionHandler = null;
      this.firstInteractionTarget = null;
    }
    if (state.screenshotInterval) {
      clearInterval(state.screenshotInterval);
      this.patch({ screenshotInterval: null });
    }
    hotkeys.unbind('cmd+s, ctrl+s');
    document.removeEventListener('updateThumbnail', this.handleThumbnailUpdate);
    window.removeEventListener('click', this.handleWindowClick);
    window.removeEventListener('blur', this.handleWindowBlur);

    state.mutationObserver?.disconnect();
    state.resizeObserver?.disconnect();
    state.stageAnimation?.stop();

    state.layer?.destroy();
    state.maskingGroup?.destroy();
    state.stage?.destroy();
    this.patch({  });

    this.renderers.forEach((renderer) => renderer.destroy());
    this.renderers.clear();

    this.unsubscribeFns.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeFns.length = 0;
  }

  // -- Public API to update store-backed data --------------------------------

  patch(partial: Partial<PreviewPanelStoreData>): void {
    this.store.getState().patch(partial);
  }

  private getState(): PreviewPanelStoreState {
    return this.store.getState();
  }

  private setupStoreSubscriptions(): void {
    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.selectedSegment,
        (selected, previous) => {
          if (selected === previous) {
            return;
          }
          this.patch({ selectedShapeName: selected });
          this.updateTransformer();
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.backgroundColor,
        (color, previous) => {
          if (color === previous) {
            return;
          }
          const { backgroundRect, layer } = this.getState();
          if (backgroundRect) {
            backgroundRect.fill(color);
            layer?.batchDraw();
          }
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.segments,
        (segments) => {
          const ordered = this.computeOrderedSegments(segments);
          const minZ = this.computeMinZIndex(segments);
          const maxZ = this.computeMaxZIndex(segments);
          this.patch({ orderedSegments: ordered, minZIndex: minZ, maxZIndex: maxZ });
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.orderedSegments,
        (ordered) => {
          void this.syncSegmentRenderers(ordered);
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.currentTimestamp,
        (timestamp) => {
          this.renderers.forEach((renderer) => {
            renderer.syncVisibility(timestamp);
          });
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.playing,
        (playing) => {
          this.renderers.forEach((renderer) => {
            renderer.handlePlayingChange(playing);
          });
        },
      ),
    );

    this.unsubscribeFns.push(
      this.store.subscribe(
        (state) => state.audioContext,
        (audioContext, previous) => {
          if (!previous && audioContext) {
            void this.syncSegmentRenderers(this.getState().orderedSegments);
          }
        },
      ),
    );

    const initialSegments = this.getState().segments;
    if (Object.keys(initialSegments).length) {
      const ordered = this.computeOrderedSegments(initialSegments);
      this.patch({
        orderedSegments: ordered,
        minZIndex: this.computeMinZIndex(initialSegments),
        maxZIndex: this.computeMaxZIndex(initialSegments),
      });
    }
  }

  private initializeAudio(): void {
    const state = this.getState();
    if (state.audioContext) {
      return;
    }
    const onFirstInteraction = () => {
      const { audioContext: existing } = this.getState();
      if (existing) {
        if (existing.state === 'suspended') {
          void existing.resume().catch((error) => {
            console.warn('Failed to resume existing audio context', error);
          });
        }
        this.firstInteractionHandler = null;
        this.firstInteractionTarget = null;
        return;
      }
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      void audioContext.resume().catch((error) => {
        console.warn('Failed to resume preview audio context', error);
      });
      const analyzer = new SpectrumAnalyzer(audioContext);
      analyzer.analyzer.connect(audioContext.destination);
      this.patch({ audioContext, analyzer });
      this.firstInteractionHandler = null;
      this.firstInteractionTarget = null;
    };
    const target = document.body ?? document;
    target.addEventListener('click', onFirstInteraction, { once: true });
    target.addEventListener('pointerdown', onFirstInteraction, { once: true });
    target.addEventListener('touchend', onFirstInteraction, { once: true });
    this.firstInteractionHandler = onFirstInteraction;
    this.firstInteractionTarget = target;
  }

  private initializeStage(): void {
    const previewContainer = this.container.querySelector('#preview-container');
    if (!previewContainer) {
      return;
    }

    const width = 2 * this.container.getBoundingClientRect().width;
    const height = 2 * this.container.getBoundingClientRect().height;

    const stage = new Konva.Stage({
      container: 'preview-container',
      width,
      height,
    });

    stage.on('mousedown', (event) => this.handleStageMouseDown(event));
    stage.on('touchstart', (event) => this.handleStageMouseDown(event));
    stage.on('mousemove', (event) => this.handleStageMouseMove(event));
    stage.on('tap', (event) => this.handleStageTap(event));

    this.patch({
      stage,
      stageWidth: previewContainer instanceof HTMLElement ? previewContainer.offsetWidth : width,
      stageHeight: previewContainer instanceof HTMLElement ? previewContainer.offsetHeight : height,
    });

    window.setTimeout(() => {
      const container = document.getElementById('preview-container');
      if (!container) {
        return;
      }
      this.patch({ stageWidth: container.offsetWidth, stageHeight: container.offsetHeight });
    }, 250);

    const layer = new Konva.Layer();
    stage.add(layer);

    const stageWidth = stage.width();
    const stageHeight = stage.height();
    const backgroundGroup = new Konva.Group();
    const stageBackground = new Konva.Rect({
      x: 0,
      y: 0,
      width: stageWidth,
      height: stageHeight,
      fill: this.getState().isDarkMode ? '#111827' : '#F2F2F2',
    });
    backgroundGroup.add(stageBackground);
    layer.add(backgroundGroup);

    const backgroundRect = new Konva.Rect({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fill: this.getState().backgroundColor,
      cornerRadius: 15,
      shadowBlur: 7,
      shadowColor: 'grey',
      shadowOpacity: 0.5,
    });
    backgroundGroup.add(backgroundRect);

    const maskingGroup = new Konva.Group();
    layer.add(maskingGroup);

    const videoGroup = new Konva.Group({
      scale: { x: 1, y: 1 },
    });
    maskingGroup.add(videoGroup);

    const transformer = new Konva.Transformer({
      rotationSnaps: [0, 90, 180, 270],
      centeredScaling: false,
      anchorStroke: 'white',
      anchorFill: 'white',
      anchorCornerRadius: 10,
      borderStroke: '#72D1EC',
      rotateLineVisible: false,
      rotateAnchorOffset: 30,
      anchorSize: 10,
      enabledAnchors: ['middle-left', 'middle-right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
    });

    transformer.anchorStyleFunc((anchor) => {
      if (anchor.hasName('rotater')) {
        anchor.fill('white');
        anchor.stroke('white');
        anchor.cornerRadius(12);
        anchor.width(20);
        anchor.height(20);
        anchor.offsetX(10);
        anchor.offsetY(10);
        anchor.sceneFunc((ctx) => {
          ctx.beginPath();
          ctx.arc(anchor.width() / 2, anchor.height() / 2, anchor.width() / 2, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
          ctx.closePath();
          const path = new Path2D('M4.06189 13C4.02104 12.6724 4 12.3387 4 12C4 7.58172 7.58172 4 12 4C14.5006 4 16.7332 5.14727 18.2002 6.94416M19.9381 11C19.979 11.3276 20 11.6613 20 12C20 16.4183 16.4183 20 12 20C9.61061 20 7.46589 18.9525 6 17.2916M9 17H6V17.2916M18.2002 4V6.94416M18.2002 6.94416V6.99993L15.2002 7M6 20V17.2916');
          ctx.save();
          ctx.translate(anchor.width() / 2 - 8.5, anchor.height() / 2 - 8.5);
          ctx.scale(0.7, 0.7);
          ctx.strokeStyle = '#72D1EC';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke(path);
          ctx.restore();
        });
        anchor.hitFunc((ctx) => {
          ctx.beginPath();
          ctx.arc(anchor.width() / 2, anchor.height() / 2, anchor.width() / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.fillStrokeShape(anchor);
        });
      }
      if (anchor.hasName('middle-left') || anchor.hasName('middle-right')) {
        anchor.width(8);
        anchor.height(16);
        anchor.offsetX(4);
        anchor.offsetY(8);
      }
      if (anchor.hasName('top-center') || anchor.hasName('bottom-center')) {
        anchor.width(16);
        anchor.height(8);
        anchor.offsetX(8);
        anchor.offsetY(4);
      }
    });

    const hoverTransformer = new Konva.Transformer({
      enabledAnchors: [],
      rotateEnabled: false,
      borderStroke: '#00abdf',
    });

    layer.add(transformer);
    layer.add(hoverTransformer);

    const helperTextBackgroundRect = new Konva.Rect({
      width: 200,
      height: 40,
      fill: '#00abdf',
      cornerRadius: 6,
      shadowColor: 'black',
      shadowBlur: 5,
      shadowOffset: { x: 0, y: 0 },
      shadowOpacity: 0.3,
    });

    const rotationText = new Konva.Text({
      text: '',
      fontSize: 12,
      fontFamily: 'system-ui, sans-serif',
      fill: 'white',
      padding: 5,
      fontStyle: 'bold',
    });

    const helperTextGroup = new Konva.Group({
      visible: false,
    });
    helperTextGroup.add(helperTextBackgroundRect);
    helperTextGroup.add(rotationText);
    layer.add(helperTextGroup);

    const statePatch: Partial<PreviewPanelStoreData> = {
      layer,
      backgroundGroup,
      backgroundRect,
      maskingGroup,
      videoGroup,
      transformer,
      hoverTransformer,
      helperTextBackgroundRect,
      rotationText,
      helperTextGroup,
    };

    layer.draw();
    this.patch(statePatch);
    this.bindVideoGroupEvents();

    const stageAnimation = new Konva.Animation(() => {
      const context = this.getRendererFrameContext();
      this.renderers.forEach((renderer) => {
        renderer.frameUpdate(context);
      });
    }, layer);
    stageAnimation.start();

    this.stageClipFunc = this.createStageClip();
    backgroundGroup.clipFunc(this.stageClipFunc);
    maskingGroup.clipFunc(this.stageClipFunc);

    this.patch({ stageAnimation, konvaInit: true });
    void this.syncSegmentRenderers(this.getState().orderedSegments);

    const screenshotInterval = window.setInterval(() => {
      this.updateThumbnail();
    }, 60_000);
    this.patch({ screenshotInterval });

    document.addEventListener('updateThumbnail', this.handleThumbnailUpdate);

    this.updateDarkMode(document.documentElement.classList.contains('dark'));
  }

  private initializeObservers(): void {
    window.addEventListener('click', this.handleWindowClick);
    window.addEventListener('blur', this.handleWindowBlur);

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.target instanceof HTMLElement && mutation.target === document.documentElement) {
          this.updateDarkMode(document.documentElement.classList.contains('dark'));
        }
      });
    });

    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const previewContainer = document.getElementById('preview-container');
    if (previewContainer) {
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        this.patch({ stageWidth: entry.contentRect.width, stageHeight: entry.contentRect.height });
        const { backgroundGroup, maskingGroup } = this.getState();
        backgroundGroup?.clipFunc(this.stageClipFunc ?? this.createStageClip());
        maskingGroup?.clipFunc(this.stageClipFunc ?? this.createStageClip());
        this.getState().layer?.batchDraw();
      });
      resizeObserver.observe(previewContainer);
      this.patch({ resizeObserver });
    }

    this.patch({ mutationObserver });
  }

  private bindVideoGroupEvents(): void {
    const { videoGroup, stage } = this.getState();
    if (!videoGroup || !stage) {
      return;
    }

    videoGroup.on('dragmove', (event: Konva.KonvaEventObject<DragEvent>) => {
      this.getState().videoGroup?.find('.guid-line').forEach((line) => line.destroy());
      const currentState = this.getState();
      if (!currentState.videoGroup || !currentState.stage) {
        return;
      }

      const lineGuideStops = this.getLineGuideStops(
        event.target,
        currentState.stage,
        currentState.idealWidth,
        currentState.idealHeight,
        currentState.orderedSegments,
        currentState.videoGroup,
      );
      const snappingEdges = this.getObjectSnappingEdges(event.target, currentState.videoGroup);
      const guides = this.getGuides(lineGuideStops, snappingEdges, 5 / (currentState.scaleFactor || 1));
      if (!guides.length) {
        return;
      }

      this.drawGuides(guides, currentState.videoGroup, 1 / (currentState.scaleFactor || 1));
      const position = event.target.position();
      guides.forEach((guide) => {
        if (guide.orientation === 'V') {
          position.x = guide.lineGuide + guide.offset;
        }
        if (guide.orientation === 'H') {
          position.y = guide.lineGuide + guide.offset;
        }
      });
      event.target.position(position);
    });

    videoGroup.on('dragend', () => {
      this.getState().videoGroup?.find('.guid-line').forEach((line) => line.destroy());
    });

    stage.on('contextmenu', (event: Konva.KonvaEventObject<PointerEvent>) => {
      event.evt.preventDefault();
      this.patch({ showContextMenu: false });
      if (event.target === stage) {
        return;
      }
      const shapeName = event.target.name();
      if (!shapeName) {
        return;
      }
      const segment = this.getState().segments[shapeName];
      if (!segment) {
        return;
      }
      this.setSelectedSegment(shapeName);
      this.patch({ selectedShapeName: shapeName });
      this.updateTransformer();
      const containerRect = stage.container().getBoundingClientRect();
      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return;
      }
      let posX = containerRect.left + pointer.x;
      const posY = containerRect.top + pointer.y;
      const menuWidth = 224;
      if (posX + menuWidth + 4 > containerRect.left + containerRect.width) {
        posX = containerRect.left + pointer.x - menuWidth;
      }
      this.patch({
        showContextMenu: true,
        contextMenuPosition: { x: posX, y: posY },
      });
    });
  }

  private bindShortcuts(): void {
    hotkeys('cmd+s, ctrl+s', (event) => {
      this.updateThumbnail();
      event.preventDefault();
    });
  }

  private handleStageMouseDown(event: Konva.KonvaEventObject<Event>): void {
    if (event.evt && 'touches' in event.evt) {
      return;
    }
    this.setPlaying(false);
    if (event.target === event.target.getStage()) {
      this.patch({ selectedShapeName: null });
      this.updateTransformer();
      return;
    }
    if (event.target.getParent()?.className === 'Transformer') {
      return;
    }
    const name = event.target.name();
    const segment = name ? this.store.getState().getSegmentsClone()[name] : null;
    this.patch({ selectedShapeName: name && segment ? name : null });
    this.updateTransformer();
  }

  private handleStageTap(event: Konva.KonvaEventObject<Event>): void {
    if (event.target === event.target.getStage()) {
      this.patch({ selectedShapeName: null });
      this.updateTransformer();
      return;
    }
    if (event.target.getParent()?.className === 'Transformer') {
      return;
    }
    const name = event.target.name();
    const segment = name ? this.store.getState().getSegmentsClone()[name] : null;
    const current = this.getState().selectedShapeName;
    if (name && segment) {
      if (current === name) {
        this.updateTransformer(true);
      } else {
        this.patch({ selectedShapeName: name });
        this.updateTransformer();
      }
    } else {
      this.patch({ selectedShapeName: null });
      this.updateTransformer();
    }
  }

  private handleStageMouseMove(event: Konva.KonvaEventObject<Event>): void {
    if (event.target === event.target.getStage()) {
      this.patch({ hoverShapeName: null });
      this.updateTransformer();
      return;
    }
    if (event.target.getParent()?.className === 'Transformer') {
      return;
    }
    const name = event.target.name();
    const segment = name ? this.store.getState().getSegmentsClone()[name] : null;
    this.patch({ hoverShapeName: name && segment ? name : null });
    this.updateTransformer();
  }

  private updateTransformer(forceSelect = false): void {
    const state = this.getState();
    const { stage, transformer, hoverTransformer } = state;
    if (!stage || !transformer || !hoverTransformer) {
      return;
    }

    const selectedNode = state.selectedShapeName ? stage.findOne(`.${state.selectedShapeName}`) : null;
    const hoverNode = state.hoverShapeName ? stage.findOne(`.${state.hoverShapeName}`) : null;

    if (selectedNode === hoverNode) {
      hoverTransformer.detach();
    } else if (hoverNode && hoverNode !== hoverTransformer.nodes()[0]) {
      hoverTransformer.nodes([hoverNode]);
    } else if (!hoverNode) {
      hoverTransformer.detach();
    }

    if (transformer.isTransforming()) {
      hoverTransformer.detach();
    }

    if (selectedNode && selectedNode !== transformer.nodes()[0]) {
      this.patch({ transformerActive: true });
      const segment = state.selectedShapeName ? this.store.getState().getSegmentById(state.selectedShapeName) : null;
      if (segment && segment.type === 'text') {
        transformer.enabledAnchors(['middle-left', 'middle-right']);
      } else {
        transformer.enabledAnchors([
          'middle-left',
          'middle-right',
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right',
          'top-center',
          'bottom-center',
        ]);
      }
      transformer.nodes([selectedNode]);
      if (state.selectedShapeName) {
        if (state.selectedSegment !== state.selectedShapeName) {
          this.patch({ selectedSegment: state.selectedShapeName });
        }
        this.setSelectedSegment(state.selectedShapeName);
      }
      if (window.innerWidth >= 768) {
        this.setActiveTool('Details');
      }
      transformer.on('transform', (event) => {
        const target = event.target;
        const segmentRotation = this.store.getState().getSegmentById(state.selectedShapeName ?? '')?.rotation ?? 0;
        if (target.attrs.rotation.toFixed(2) !== segmentRotation.toFixed(2)) {
          const angle = target.rotation();
          requestAnimationFrame(() => {
            this.updateFloatingHelpText(angle);
          });
        }
      });
      transformer.on('transformend', (event) => {
        const angle = event.target.rotation();
        this.updateFloatingHelpText(angle);
        window.setTimeout(() => {
          this.getState().helperTextGroup?.visible(false);
        }, 1500);
      });
      transformer.on('dragmove', () => {
        this.positionFloatingHelpText();
      });
    } else if (!selectedNode) {
      if (state.selectedSegment !== null) {
        this.patch({ selectedSegment: null });
      }
      this.patch({ transformerActive: false });
      transformer.detach();
      state.helperTextGroup?.visible(false);
    } else if (forceSelect && state.selectedShapeName) {
      this.setActiveTool('Details');
    }
  }

  private positionFloatingHelpText(): void {
    const { transformer, helperTextGroup, rotationText, helperTextBackgroundRect } = this.getState();
    if (!transformer || !helperTextGroup || !rotationText || !helperTextBackgroundRect) {
      return;
    }
    const rect = transformer.getClientRect();
    const width = rotationText.width();
    const height = rotationText.height();
    helperTextGroup.position({
      x: rect.x + rect.width / 2 - width / 2,
      y: rect.y - height - 10,
    });
    helperTextBackgroundRect.width(width);
    helperTextBackgroundRect.height(height);
  }

  private updateFloatingHelpText(angle: number): void {
    const { rotationText, helperTextGroup, helperTextBackgroundRect, transformer } = this.getState();
    if (!rotationText || !helperTextGroup || !helperTextBackgroundRect || !transformer) {
      return;
    }
    rotationText.text(`${Math.round(angle)}°`);
    this.positionFloatingHelpText();
    helperTextGroup.visible(true);
    const timeout = this.getState().rotationTextTimeout;
    if (timeout) {
      clearTimeout(timeout);
    }
    const rotationTextTimeout = window.setTimeout(() => {
      this.getState().helperTextGroup?.visible(false);
    }, 1500);
    this.patch({ rotationTextTimeout });
  }

  remove(): void {
    const { selectedSegment } = this.getState();
    if (!selectedSegment) {
      return;
    }
    const removedId = selectedSegment;
    this.patch({ selectedShapeName: null, hoverShapeName: null });
    this.removeActiveTool();
    this.setSelectedSegment(null);
    this.deleteSegment(removedId);
    this.updateTransformer();
  }

  bringToFront(): void {
    const { selectedSegment, maxZIndex } = this.getState();
    if (!selectedSegment) {
      return;
    }
    this.updateSegment({ id: selectedSegment, zIndex: maxZIndex + 1 });
  }

  sendToBack(): void {
    const { selectedSegment, minZIndex } = this.getState();
    if (!selectedSegment) {
      return;
    }
    this.updateSegment({ id: selectedSegment, zIndex: minZIndex - 1 });
  }

  duplicate(): void {
    const { selectedSegment } = this.getState();
    if (!selectedSegment) {
      return;
    }
    this.duplicateSegment({ id: selectedSegment });
  }

  private createStageClip(): (ctx: Konva.Context) => void {
    return (ctx: Konva.Context) => {
      const state = this.getState();
      const { videoGroup } = state;
      if (!videoGroup) {
        return;
      }

      let paddingX = 12;
      let paddingY = 16;
      const availableWidth = Math.max(state.stageWidth - 24, 0);
      const availableHeight = Math.max(state.stageHeight - 32, 0);
      let ratioWidth: number;
      let ratioHeight: number;
      let idealWidth: number;

      if (state.size.ratio === 'original') {
        ratioWidth = state.size.original.width;
        ratioHeight = state.size.original.height;
        idealWidth = state.size.original.width;
      } else {
        const preset = ratioPresets[state.size.ratio];
        ratioWidth = preset.idealRatioWidth;
        ratioHeight = preset.idealRatioHeight;
        idealWidth = preset.resolutions.hd;
      }

      if (ratioWidth <= 0) {
        ratioWidth = 1;
      }
      if (ratioHeight <= 0) {
        ratioHeight = 1;
      }

      let viewHeight = availableHeight;
      let viewWidth = (viewHeight / ratioHeight) * ratioWidth;

      if (viewWidth > availableWidth) {
        viewWidth = availableWidth;
        viewHeight = (viewWidth / ratioWidth) * ratioHeight;
        paddingY += (availableHeight - viewHeight) / 2;
      } else {
        paddingX += (availableWidth - viewWidth) / 2;
      }

      const safeViewWidth = Math.max(viewWidth, 0);
      const safeViewHeight = Math.max(viewHeight, 0);
      const safeIdealWidth = idealWidth > 0 ? idealWidth : safeViewWidth || 1;
      const aspectRatio = safeViewWidth > 0 ? safeViewHeight / safeViewWidth : ratioHeight / ratioWidth;
      const scale = safeIdealWidth > 0 ? safeViewWidth / safeIdealWidth : 1;

      videoGroup.scale({ x: scale, y: scale });
      videoGroup.position({ x: paddingX, y: paddingY });

      let cornerRadius = 15;
      if (safeViewWidth < 2 * cornerRadius) {
        cornerRadius = safeViewWidth / 2;
      }
      if (safeViewHeight < 2 * cornerRadius) {
        cornerRadius = safeViewHeight / 2;
      }
      cornerRadius = Math.max(0, cornerRadius);

      const { calculatedWidth, calculatedHeight, calculatedXStart, calculatedYStart, idealWidth: currentIdealWidth } = state;
      if (
        calculatedWidth !== safeViewWidth ||
        calculatedHeight !== safeViewHeight ||
        calculatedXStart !== paddingX ||
        calculatedYStart !== paddingY ||
        currentIdealWidth !== safeIdealWidth ||
        state.scaleFactor !== scale
      ) {
        this.patch({
          calculatedWidth: safeViewWidth,
          calculatedHeight: safeViewHeight,
          calculatedXStart: paddingX,
          calculatedYStart: paddingY,
          idealWidth: safeIdealWidth,
          idealHeight: safeIdealWidth * aspectRatio,
          scaleFactor: scale,
        });
      }

      const { backgroundRect } = this.getState();
      if (backgroundRect) {
        backgroundRect.position({ x: paddingX + 0.5, y: paddingY + 0.5 });
        backgroundRect.size({ width: Math.max(safeViewWidth - 1, 0), height: Math.max(safeViewHeight - 2, 0) });
        backgroundRect.cornerRadius(cornerRadius);
      }

      const clipRight = paddingX + safeViewWidth;
      const clipBottom = paddingY + safeViewHeight;

      ctx.beginPath();
      ctx.moveTo(paddingX + cornerRadius, paddingY);
      ctx.arcTo(clipRight, paddingY, clipRight, clipBottom, cornerRadius);
      ctx.arcTo(clipRight, clipBottom, paddingX, clipBottom, cornerRadius);
      ctx.arcTo(paddingX, clipBottom, paddingX, paddingY, cornerRadius);
      ctx.arcTo(paddingX, paddingY, clipRight, paddingY, cornerRadius);
      ctx.closePath();
    };
  }

  private async updateThumbnail(): Promise<void> {
    const state = this.getState();
    const { stage, backgroundGroup, maskingGroup } = state;
    if (!stage || !backgroundGroup || !maskingGroup || document.hidden) {
      return;
    }

    const originalClip = this.stageClipFunc ?? this.createStageClip();

    backgroundGroup.clipFunc(undefined);
    maskingGroup.clipFunc(undefined);
    state.transformer?.hide();

    backgroundGroup.clipFunc(originalClip);
    maskingGroup.clipFunc(originalClip);
    state.transformer?.show();

    this.patch({  });
  }

  private handleThumbnailUpdate = () => {
    this.updateThumbnail();
  };

  private handleWindowClick = () => {
    this.patch({ showContextMenu: false });
  };

  private handleWindowBlur = () => {
    this.patch({ showContextMenu: false });
  };

  private setPlaying: (value: boolean) => void = () => undefined;
  private setSelectedSegment: (id: string | null) => void = () => undefined;
  private removeActiveTool: () => void = () => undefined;
  private setActiveTool: (tool: string) => void = () => undefined;
  private updateSegment: (payload: Partial<TimelineElement> & { id: string }) => void | Promise<void> = () => undefined;
  private setPreviewThumbnail: (path: string) => Promise<void> | void = () => undefined;
  private deleteSegment: (id: string) => void | Promise<void> = () => undefined;
  private duplicateSegment: (payload: { id: string }) => void | Promise<void> = () => undefined;

  private updateDarkMode(isDark: boolean): void {
    this.patch({ isDarkMode: isDark });
    const state = this.getState();
    const background = state.layer?.findOne<Konva.Rect>('Rect');
    if (background) {
      background.fill(isDark ? '#111827' : '#F2F2F2');
    }
    if (state.transformer) {
      state.transformer.anchorStroke(isDark ? '#72D1EC' : 'white');
      state.transformer.anchorFill(isDark ? '#72D1EC' : 'white');
      state.transformer.borderStroke('#72D1EC');
    }
    state.videoGroup?.find('.guid-line').forEach((line) => {
      (line as Konva.Line).stroke(isDark ? '#374151' : 'rgb(255, 255, 255)');
    });
    if (state.helperTextBackgroundRect) {
      state.helperTextBackgroundRect.shadowColor(isDark ? '#000' : 'black');
      state.helperTextBackgroundRect.shadowOpacity(isDark ? 0.5 : 0.3);
    }
    state.layer?.batchDraw();
  }

  async exportVideo(options: ExportOptions): Promise<ExportResult> {
    try {
      this.setPlaying(false);
    } catch (error) {
      console.warn('Failed to pause preview before export', error);
    }

    const state = this.getState();
    const ordered = state.orderedSegments.length
      ? state.orderedSegments.map((segment) => cloneDeep(segment))
      : this.computeOrderedSegments(state.segments);

    if (!ordered.length) {
      return { success: false, error: '没有可导出的内容' };
    }

    const width = state.idealWidth || state.size.original.width || state.stageWidth || 1920;
    const height = state.idealHeight || state.size.original.height || state.stageHeight || 1080;
    const backgroundColor = state.backgroundColor ?? '#000000';

    return exportPreviewVideo({
      segments: ordered,
      settings: {
        width,
        height,
        backgroundColor,
      },
      options,
    });
  }

  private computeOrderedSegments(segments: Record<string, TimelineElement>): TimelineElement[] {
    return Object.values(segments)
      .filter((segment): segment is TimelineElement => Boolean(segment))
      .map((segment) => cloneDeep(segment))
      .sort((a, b) => {
        const aZ = a.zIndex ?? 0;
        const bZ = b.zIndex ?? 0;
        if (aZ !== bZ) {
          return aZ - bZ;
        }
        const aNumeric = Number.parseInt(String(a.id).replace(/\D/g, ''), 10);
        const bNumeric = Number.parseInt(String(b.id).replace(/\D/g, ''), 10);
        if (!Number.isNaN(aNumeric) && !Number.isNaN(bNumeric)) {
          return aNumeric - bNumeric;
        }
        return String(a.id).localeCompare(String(b.id));
      });
  }

  private computeMaxZIndex(segments: Record<string, TimelineElement>): number {
    const values = Object.values(segments).map((segment) => segment?.zIndex ?? 0);
    return values.length ? Math.max(...values) : 0;
  }

  private computeMinZIndex(segments: Record<string, TimelineElement>): number {
    const values = Object.values(segments).map((segment) => segment?.zIndex ?? 0);
    return values.length ? Math.min(...values) : 0;
  }

  private getRendererFrameContext(): RendererFrameContext {
    const state = this.getState();
    const idealWidth = state.idealWidth || state.size.original.width || state.stageWidth || 0;
    const idealHeight = state.idealHeight || state.size.original.height || state.stageHeight || 0;
    return {
      timestamp: state.currentTimestamp,
      playing: state.playing,
      stageSize: { width: idealWidth, height: idealHeight },
      scale: state.scaleFactor || 1,
    };
  }

  private async syncSegmentRenderers(ordered: TimelineElement[]): Promise<void> {
    this.queuedSegmentSync = ordered;
    if (this.segmentSyncInFlight) {
      return;
    }

    this.segmentSyncInFlight = true;
    try {
      while (this.queuedSegmentSync) {
        const nextOrdered = this.queuedSegmentSync;
        this.queuedSegmentSync = null;
        if (!nextOrdered) {
          continue;
        }
        await this.performSegmentSync(nextOrdered);
      }
    } finally {
      this.segmentSyncInFlight = false;
    }
  }

  private async performSegmentSync(ordered: TimelineElement[]): Promise<void> {
    const state = this.getState();
    const { stage, videoGroup, konvaInit } = state;
    if (!stage || !videoGroup || !konvaInit) {
      return;
    }

    const frameContext = this.getRendererFrameContext();
    const seen = new Set<string>();
    for (let index = 0; index < ordered.length; index += 1) {
      const segment = ordered[index];
      const id = segment.id;
      seen.add(id);

      if (!this.shouldRenderSegment(segment)) {
        const existing = this.renderers.get(id);
        if (existing) {
          existing.destroy();
          this.renderers.delete(id);
        }
        continue;
      }

      let renderer = this.renderers.get(id);
      if (!renderer) {
        renderer = await this.createRenderer(segment);
        if (!renderer) {
          continue;
        }
        this.renderers.set(id, renderer);
        renderer.frameUpdate(frameContext);
      } else {
        renderer.update(segment);
        renderer.frameUpdate(frameContext);
      }
      if (segment.type === 'video' && state.audioContext && state.analyzer) {
        (renderer as VideoRenderer).ensureAudioContext?.(state.audioContext, state.analyzer);
      }
      if (segment.type === 'wave' && state.audioContext && state.analyzer) {
        (renderer as WaveRenderer).ensureAudioContext?.(state.audioContext, state.analyzer);
      }
      renderer.setZIndex(segment.zIndex ?? index);
      renderer.syncVisibility(state.currentTimestamp);
      renderer.handlePlayingChange(state.playing);
    }

    for (const [id, renderer] of this.renderers.entries()) {
      if (!seen.has(id)) {
        renderer.destroy();
        this.renderers.delete(id);
      }
    }

    state.layer?.batchDraw();
  }

  private async createRenderer(segment: TimelineElement): Promise<BaseRenderer<TimelineElement> | null> {
    const state = this.getState();
    const { stage, videoGroup } = state;
    if (!stage || !videoGroup) {
      return null;
    }

    switch (segment.type) {
      case 'text': {
        const renderer = createTextRenderer({
          segment: segment as TextElement,
          stage,
          container: videoGroup,
          updateSegment: (payload) => this.updateSegment(payload),
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error('Failed to initialise text renderer', error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case 'subtitles': {
        const renderer = createSubtitleRenderer({
          segment: segment as TextElement,
          stage,
          container: videoGroup,
          updateSegment: (payload) => this.updateSegment(payload),
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error('Failed to initialise subtitle renderer', error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case 'image': {
        const renderer = createImageRenderer({
          segment: segment as ImageElement,
          stage,
          container: videoGroup,
          updateSegment: (payload) => this.updateSegment(payload),
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error('Failed to initialise image renderer', error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case 'shape': {
        const renderer = createShapeRenderer({
          segment: segment as ShapeElement,
          stage,
          container: videoGroup,
          updateSegment: (payload) => this.updateSegment(payload),
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error('Failed to initialise shape renderer', error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case 'progress_bar': {
        const renderer = createProgressBarRenderer({
          segment: segment as ProgressBarElement,
          stage,
          container: videoGroup,
          updateSegment: (payload) => this.updateSegment(payload),
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error('Failed to initialise progress bar renderer', error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case 'wave': {
        const renderer = createWaveRenderer({
          segment: segment as WaveElement,
          stage,
          container: videoGroup,
          updateSegment: (payload) => this.updateSegment(payload),
          audioContext: state.audioContext ?? undefined,
          analyzer: state.analyzer ?? undefined,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error('Failed to initialise wave renderer', error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case 'video': {
        const { audioContext, analyzer } = state;
        const renderer = createVideoRenderer({
          segment: segment as VideoElement,
          stage,
          container: videoGroup,
          updateSegment: (payload) => this.updateSegment(payload),
          audioContext,
          analyzer,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error('Failed to initialise video renderer', error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      case 'audio': {
        const { audioContext, analyzer } = state;
        if (!audioContext || !analyzer) {
          return null;
        }
        const renderer = createAudioRenderer({
          segment: segment as AudioElement,
          stage,
          container: videoGroup,
          updateSegment: (payload) => this.updateSegment(payload),
          audioContext,
          analyzer,
        });
        try {
          await renderer.initialize();
        } catch (error) {
          console.error('Failed to initialise audio renderer', error);
          renderer.destroy();
          return null;
        }
        return renderer;
      }
      default:
        return null;
    }
  }

  private shouldRenderSegment(segment: TimelineElement): boolean {
    switch (segment.type) {
      case 'text':
      case 'subtitles':
      case 'image':
      case 'shape':
      case 'progress_bar':
      case 'wave':
        return true;
      case 'video':
      case 'audio': {
        const state = this.getState();
        return Boolean(state.audioContext && state.analyzer && segment.remoteSource);
      }
      default:
        return false;
    }
  }

  handlePreviewError(segmentId: string): void {
    console.error(`Error rendering segment ${segmentId}. Attempting recovery.`);
    try {
      const segment = this.store.getState().getSegmentById(segmentId);
      const { stage, transformer, layer } = this.getState();
      if (!segment || !stage) {
        return;
      }
      const node = stage.findOne(`#${segmentId}`);
      node?.destroy();
      layer?.batchDraw();
      if (this.getState().selectedShapeName === segmentId && transformer) {
        transformer.detach();
        transformer.forceUpdate();
      }
    } catch (error) {
      console.error('Failed to recover from rendering error:', error);
    }
  }

  private getLineGuideStops(
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
    while (wrapper.name() !== 'konvaWrapper' && wrapper.getParent()) {
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

  private getObjectSnappingEdges(node: Konva.Node, container: Konva.Group) {
    const rect = node.getClientRect({ relativeTo: container });
    const position = node.position();
    return {
      vertical: [
        { guide: Math.round(rect.x), offset: Math.round(position.x - rect.x), snap: 'start' },
        { guide: Math.round(rect.x + rect.width / 2), offset: Math.round(position.x - rect.x - rect.width / 2), snap: 'center' },
        { guide: Math.round(rect.x + rect.width), offset: Math.round(position.x - rect.x - rect.width), snap: 'end' },
      ],
      horizontal: [
        { guide: Math.round(rect.y), offset: Math.round(position.y - rect.y), snap: 'start' },
        { guide: Math.round(rect.y + rect.height / 2), offset: Math.round(position.y - rect.y - rect.height / 2), snap: 'center' },
        { guide: Math.round(rect.y + rect.height), offset: Math.round(position.y - rect.y - rect.height), snap: 'end' },
      ],
    };
  }

  private getGuides(
    stops: { vertical: number[]; horizontal: number[] },
    edges: ReturnType<PreviewPanelKonva['getObjectSnappingEdges']>,
    offset: number,
  ) {
    const result: Array<{ lineGuide: number; diff: number; orientation: 'V' | 'H'; snap: string; offset: number }> = [];
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
        orientation: 'V',
        snap: bestVertical.snap,
        offset: bestVertical.offset,
      });
    }
    if (bestHorizontal) {
      result.push({
        lineGuide: bestHorizontal.lineGuide,
        diff: bestHorizontal.diff,
        orientation: 'H',
        snap: bestHorizontal.snap,
        offset: bestHorizontal.offset,
      });
    }

    return result;
  }

  private drawGuides(
    guides: Array<{ lineGuide: number; orientation: 'V' | 'H'; snap: string; offset: number }>,
    container: Konva.Group,
    scale: number,
  ) {
    guides.forEach((guide) => {
      if (guide.orientation === 'H') {
        const line = new Konva.Line({
          points: [-6000, 0, 6000, 0],
          stroke: 'rgb(255, 255, 255)',
          strokeWidth: 2 * scale,
          name: 'guid-line',
          dash: [4 * scale, 6 * scale],
        });
        container.add(line);
        line.position({ x: 0, y: guide.lineGuide });
      } else if (guide.orientation === 'V') {
        const line = new Konva.Line({
          points: [0, -6000, 0, 6000],
          stroke: 'rgb(255, 255, 255)',
          strokeWidth: 2 * scale,
          name: 'guid-line',
          dash: [4 * scale, 6 * scale],
        });
        container.add(line);
        line.position({ x: guide.lineGuide, y: 0 });
      }
    });
  }
}
