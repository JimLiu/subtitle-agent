import Konva from "konva";

import ratioPresets from "../deps/ratio-presets";
import { drawGuides, getGuides, getLineGuideStops, getObjectSnappingEdges } from "./guides";
import type { RendererManager } from "./renderer-manager";
import type { PreviewPanelContext } from "./types";

/**
 * 舞台管理器：负责初始化 Konva 舞台/图层/分组/变换器、绑定事件与观察者、
 * 截图与暗色模式适配、以及预览裁剪与缩放的计算。
 */
export class StageManager {
  private readonly context: PreviewPanelContext;
  private readonly rendererManager: RendererManager;
  private stageClipFunc: ((ctx: Konva.Context) => void) | null = null;

  constructor(context: PreviewPanelContext, rendererManager: RendererManager) {
    this.context = context;
    this.rendererManager = rendererManager;
  }

  /** 初始化舞台、图层、背景、内容容器、变换器与悬浮辅助文本等 UI 元素。 */
  initialize(): void {
    const previewContainer = this.context.container.querySelector("#preview-container");
    if (!previewContainer) {
      return;
    }

    const containerRect = this.context.container.getBoundingClientRect();
    const width = 2 * containerRect.width;
    const height = 2 * containerRect.height;

    const stage = new Konva.Stage({
      container: "preview-container",
      width,
      height,
    });

    stage.on("mousedown", this.handleStageMouseDown);
    stage.on("touchstart", this.handleStageMouseDown);
    stage.on("mousemove", this.handleStageMouseMove);
    stage.on("tap", this.handleStageTap);

    this.context.patch({
      stage,
      stageWidth: previewContainer instanceof HTMLElement ? previewContainer.offsetWidth : width,
      stageHeight: previewContainer instanceof HTMLElement ? previewContainer.offsetHeight : height,
    });

    window.setTimeout(() => {
      const container = document.getElementById("preview-container");
      if (!container) {
        return;
      }
      this.context.patch({ stageWidth: container.offsetWidth, stageHeight: container.offsetHeight });
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
      fill: this.context.getState().isDarkMode ? "#111827" : "#F2F2F2",
    });
    backgroundGroup.add(stageBackground);
    layer.add(backgroundGroup);

    const backgroundRect = new Konva.Rect({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fill: this.context.getState().backgroundColor,
      cornerRadius: 15,
      shadowBlur: 7,
      shadowColor: "grey",
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
      anchorStroke: "white",
      anchorFill: "white",
      anchorCornerRadius: 10,
      borderStroke: "#72D1EC",
      rotateLineVisible: false,
      rotateAnchorOffset: 30,
      anchorSize: 10,
      enabledAnchors: ["middle-left", "middle-right", "top-left", "top-right", "bottom-left", "bottom-right"],
    });

    transformer.anchorStyleFunc((anchor) => {
      if (anchor.hasName("rotater")) {
        anchor.fill("white");
        anchor.stroke("white");
        anchor.cornerRadius(12);
        anchor.width(20);
        anchor.height(20);
        anchor.offsetX(10);
        anchor.offsetY(10);
        anchor.sceneFunc((ctx) => {
          ctx.beginPath();
          ctx.arc(anchor.width() / 2, anchor.height() / 2, anchor.width() / 2, 0, Math.PI * 2);
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.closePath();
          const path = new Path2D("M4.06189 13C4.02104 12.6724 4 12.3387 4 12C4 7.58172 7.58172 4 12 4C14.5006 4 16.7332 5.14727 18.2002 6.94416M19.9381 11C19.979 11.3276 20 11.6613 20 12C20 16.4183 16.4183 20 12 20C9.61061 20 7.46589 18.9525 6 17.2916M9 17H6V17.2916M18.2002 4V6.94416M18.2002 6.94416V6.99993L15.2002 7M6 20V17.2916");
          ctx.save();
          ctx.translate(anchor.width() / 2 - 8.5, anchor.height() / 2 - 8.5);
          ctx.scale(0.7, 0.7);
          ctx.strokeStyle = "#72D1EC";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
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
      if (anchor.hasName("middle-left") || anchor.hasName("middle-right")) {
        anchor.width(8);
        anchor.height(16);
        anchor.offsetX(4);
        anchor.offsetY(8);
      }
      if (anchor.hasName("top-center") || anchor.hasName("bottom-center")) {
        anchor.width(16);
        anchor.height(8);
        anchor.offsetX(8);
        anchor.offsetY(4);
      }
    });

    const hoverTransformer = new Konva.Transformer({
      enabledAnchors: [],
      rotateEnabled: false,
      borderStroke: "#00abdf",
    });

    layer.add(transformer);
    layer.add(hoverTransformer);

    const helperTextBackgroundRect = new Konva.Rect({
      width: 200,
      height: 40,
      fill: "#00abdf",
      cornerRadius: 6,
      shadowColor: "black",
      shadowBlur: 5,
      shadowOffset: { x: 0, y: 0 },
      shadowOpacity: 0.3,
    });

    const rotationText = new Konva.Text({
      text: "",
      fontSize: 12,
      fontFamily: "system-ui, sans-serif",
      fill: "white",
      padding: 5,
      fontStyle: "bold",
    });

    const helperTextGroup = new Konva.Group({
      visible: false,
    });
    helperTextGroup.add(helperTextBackgroundRect);
    helperTextGroup.add(rotationText);
    layer.add(helperTextGroup);

    layer.draw();
    this.context.patch({
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
    });

    this.bindVideoGroupEvents();

    const stageAnimation = new Konva.Animation(() => {
      const frameContext = this.context.getRendererFrameContext();
      this.rendererManager.forEach((renderer) => {
        renderer.frameUpdate(frameContext);
      });
    }, layer);
    stageAnimation.start();

    this.stageClipFunc = this.createStageClip();
    backgroundGroup.clipFunc(this.stageClipFunc);
    maskingGroup.clipFunc(this.stageClipFunc);

    this.context.patch({ stageAnimation, konvaInit: true });
  }

  /**
   * 初始化全局与元素观察：
   * - 监听 window 的 click/blur 以隐藏右键菜单；
   * - 监听 documentElement.class 变化以适配暗色模式；
   * - 监听预览容器的尺寸变化以重算裁剪；
   * - 定时刷新缩略图。
   */
  initializeObservers(): void {
    window.addEventListener("click", this.handleWindowClick);
    window.addEventListener("blur", this.handleWindowBlur);

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.target instanceof HTMLElement && mutation.target === document.documentElement) {
          this.updateDarkMode(document.documentElement.classList.contains("dark"));
        }
      });
    });

    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const previewContainer = document.getElementById("preview-container");
    if (previewContainer) {
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        this.context.patch({ stageWidth: entry.contentRect.width, stageHeight: entry.contentRect.height });
        const { backgroundGroup, maskingGroup } = this.context.getState();
        backgroundGroup?.clipFunc(this.stageClipFunc ?? this.createStageClip());
        maskingGroup?.clipFunc(this.stageClipFunc ?? this.createStageClip());
        this.context.getState().layer?.batchDraw();
      });
      resizeObserver.observe(previewContainer);
      this.context.patch({ resizeObserver });
    }

    this.context.patch({ mutationObserver });

    const screenshotInterval = window.setInterval(() => {
      void this.updateThumbnail();
    }, 60_000);
    this.context.patch({ screenshotInterval });

    document.addEventListener("updateThumbnail", this.handleThumbnailUpdate);

    this.updateDarkMode(document.documentElement.classList.contains("dark"));
  }

  /** 释放所有监听与 Konva 资源。 */
  destroy(): void {
    const state = this.context.getState();

    if (state.screenshotInterval) {
      clearInterval(state.screenshotInterval);
    }

    document.removeEventListener("updateThumbnail", this.handleThumbnailUpdate);
    window.removeEventListener("click", this.handleWindowClick);
    window.removeEventListener("blur", this.handleWindowBlur);

    state.mutationObserver?.disconnect();
    state.resizeObserver?.disconnect();
    state.stageAnimation?.stop();

    state.layer?.destroy();
    state.maskingGroup?.destroy();
    state.stage?.destroy();

    this.context.patch({
      stage: null,
      layer: null,
      backgroundGroup: null,
      backgroundRect: null,
      maskingGroup: null,
      videoGroup: null,
      transformer: null,
      hoverTransformer: null,
      helperTextBackgroundRect: null,
      rotationText: null,
      helperTextGroup: null,
      stageAnimation: null,
      mutationObserver: null,
      resizeObserver: null,
      screenshotInterval: null,
      konvaInit: false,
    });

    this.stageClipFunc = null;
  }

  /**
   * 更新变换器挂载目标与锚点：
   * - 根据选中与 hover 的图形更新对应的 Transformer；
   * - 文本元素仅允许水平缩放；其它元素允许九点缩放；
   * - 更新选中工具与浮动辅助文本（角度）。
   */
  updateTransformer(forceSelect = false): void {
    const state = this.context.getState();
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
      this.context.patch({ transformerActive: true });
      const element = state.selectedShapeName ? this.context.store.getState().getElementById(state.selectedShapeName) : null;
      if (element && element.type === "text") {
        transformer.enabledAnchors(["middle-left", "middle-right"]);
      } else {
        transformer.enabledAnchors([
          "middle-left",
          "middle-right",
          "top-left",
          "top-right",
          "bottom-left",
          "bottom-right",
          "top-center",
          "bottom-center",
        ]);
      }
      transformer.nodes([selectedNode]);
      if (state.selectedShapeName) {
        if (state.selectedElement !== state.selectedShapeName) {
          this.context.patch({ selectedElement: state.selectedShapeName });
        }
        this.context.actions.setSelectedElement(state.selectedShapeName);
      }
      if (window.innerWidth >= 768) {
        this.context.actions.setActiveTool("Details");
      }
      transformer.on("transform", (event) => {
        const target = event.target;
        const elementRotation = this.context.store.getState().getElementById(state.selectedShapeName ?? "")?.rotation ?? 0;
        if (target.attrs.rotation.toFixed(2) !== elementRotation.toFixed(2)) {
          const angle = target.rotation();
          requestAnimationFrame(() => {
            this.updateFloatingHelpText(angle);
          });
        }
      });
      transformer.on("transformend", (event) => {
        const angle = event.target.rotation();
        this.updateFloatingHelpText(angle);
        window.setTimeout(() => {
          this.context.getState().helperTextGroup?.visible(false);
        }, 1500);
      });
      transformer.on("dragmove", () => {
        this.positionFloatingHelpText();
      });
    } else if (!selectedNode) {
      if (state.selectedElement !== null) {
        this.context.patch({ selectedElement: null });
      }
      this.context.patch({ transformerActive: false });
      transformer.detach();
      state.helperTextGroup?.visible(false);
    } else if (forceSelect && state.selectedShapeName) {
      this.context.actions.setActiveTool("Details");
    }
  }

  /** 根据页面暗色/亮色模式切换舞台背景、锚点与辅助线的样式。 */
  updateDarkMode(isDark: boolean): void {
    this.context.patch({ isDarkMode: isDark });
    const state = this.context.getState();
    const background = state.layer?.findOne<Konva.Rect>("Rect");
    if (background) {
      background.fill(isDark ? "#111827" : "#F2F2F2");
    }
    if (state.transformer) {
      state.transformer.anchorStroke(isDark ? "#72D1EC" : "white");
      state.transformer.anchorFill(isDark ? "#72D1EC" : "white");
      state.transformer.borderStroke("#72D1EC");
    }
    state.videoGroup?.find(".guid-line").forEach((line) => {
      (line as Konva.Line).stroke(isDark ? "#374151" : "rgb(255, 255, 255)");
    });
    if (state.helperTextBackgroundRect) {
      state.helperTextBackgroundRect.shadowColor(isDark ? "#000" : "black");
      state.helperTextBackgroundRect.shadowOpacity(isDark ? 0.5 : 0.3);
    }
    state.layer?.batchDraw();
  }

  /**
   * 更新预览缩略图：
   * - 临时取消 clip 以获取完整内容后恢复；
   * - 隐藏 Transformer，避免遮挡。
   */
  async updateThumbnail(): Promise<void> {
    const state = this.context.getState();
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
  }

  /**
   * 绑定拖拽对齐线与右键菜单：
   * - dragmove 根据所有元素的边/中心计算吸附指南；
   * - contextmenu 打开自定义菜单，并基于舞台坐标定位。
   */
  private bindVideoGroupEvents(): void {
    const { videoGroup, stage } = this.context.getState();
    if (!videoGroup || !stage) {
      return;
    }

    videoGroup.on("dragmove", (event: Konva.KonvaEventObject<DragEvent>) => {
      this.context.getState().videoGroup?.find(".guid-line").forEach((line) => line.destroy());
      const currentState = this.context.getState();
      if (!currentState.videoGroup || !currentState.stage) {
        return;
      }

      const lineGuideStops = getLineGuideStops(
        event.target,
        currentState.stage,
        currentState.idealWidth,
        currentState.idealHeight,
        currentState.orderedElements,
        currentState.videoGroup,
      );
      const snappingEdges = getObjectSnappingEdges(event.target, currentState.videoGroup);
      const guides = getGuides(lineGuideStops, snappingEdges, 5 / (currentState.scaleFactor || 1));
      if (!guides.length) {
        return;
      }

      drawGuides(guides, currentState.videoGroup, 1 / (currentState.scaleFactor || 1));
      const position = event.target.position();
      guides.forEach((guide) => {
        if (guide.orientation === "V") {
          position.x = guide.lineGuide + guide.offset;
        }
        if (guide.orientation === "H") {
          position.y = guide.lineGuide + guide.offset;
        }
      });
      event.target.position(position);
    });

    videoGroup.on("dragend", () => {
      this.context.getState().videoGroup?.find(".guid-line").forEach((line) => line.destroy());
    });

    stage.on("contextmenu", (event: Konva.KonvaEventObject<PointerEvent>) => {
      event.evt.preventDefault();
      this.context.patch({ showContextMenu: false });
      if (event.target === stage) {
        return;
      }
      const shapeName = event.target.name();
      if (!shapeName) {
        return;
      }
      const element = this.context.getState().elements[shapeName];
      if (!element) {
        return;
      }
      this.context.actions.setSelectedElement(shapeName);
      this.context.patch({ selectedShapeName: shapeName });
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
      this.context.patch({
        showContextMenu: true,
        contextMenuPosition: { x: posX, y: posY },
      });
    });
  }

  /** 舞台鼠标按下：处理取消选中/选择图形的逻辑。 */
  private handleStageMouseDown = (event: Konva.KonvaEventObject<Event>): void => {
    if (event.evt && "touches" in event.evt) {
      return;
    }
    this.context.actions.setPlaying(false);
    if (event.target === event.target.getStage()) {
      this.context.patch({ selectedShapeName: null });
      this.updateTransformer();
      return;
    }
    if (event.target.getParent()?.className === "Transformer") {
      return;
    }
    const name = event.target.name();
    const element = name ? this.context.store.getState().getElementsClone()[name] : null;
    this.context.patch({ selectedShapeName: name && element ? name : null });
    this.updateTransformer();
  };

  /** 触屏点击：用于触控场景下的选中与取消选中。 */
  private handleStageTap = (event: Konva.KonvaEventObject<Event>): void => {
    if (event.target === event.target.getStage()) {
      this.context.patch({ selectedShapeName: null });
      this.updateTransformer();
      return;
    }
    if (event.target.getParent()?.className === "Transformer") {
      return;
    }
    const name = event.target.name();
    const element = name ? this.context.store.getState().getElementsClone()[name] : null;
    const current = this.context.getState().selectedShapeName;
    if (name && element) {
      if (current === name) {
        this.updateTransformer(true);
      } else {
        this.context.patch({ selectedShapeName: name });
        this.updateTransformer();
      }
    } else {
      this.context.patch({ selectedShapeName: null });
      this.updateTransformer();
    }
  };

  private handleStageMouseMove = (event: Konva.KonvaEventObject<Event>): void => {
    if (event.target === event.target.getStage()) {
      this.context.patch({ hoverShapeName: null });
      this.updateTransformer();
      return;
    }
    if (event.target.getParent()?.className === "Transformer") {
      return;
    }
    const name = event.target.name();
    const element = name ? this.context.store.getState().getElementsClone()[name] : null;
    this.context.patch({ hoverShapeName: name && element ? name : null });
    this.updateTransformer();
  };

  private positionFloatingHelpText(): void {
    const { transformer, helperTextGroup, rotationText, helperTextBackgroundRect } = this.context.getState();
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
    const { rotationText, helperTextGroup, helperTextBackgroundRect, transformer } = this.context.getState();
    if (!rotationText || !helperTextGroup || !helperTextBackgroundRect || !transformer) {
      return;
    }
    rotationText.text(`${Math.round(angle)}°`);
    this.positionFloatingHelpText();
    helperTextGroup.visible(true);
    const timeout = this.context.getState().rotationTextTimeout;
    if (timeout) {
      clearTimeout(timeout);
    }
    const rotationTextTimeout = window.setTimeout(() => {
      this.context.getState().helperTextGroup?.visible(false);
    }, 1500);
    this.context.patch({ rotationTextTimeout });
  }

  /**
   * 根据预设比例与容器尺寸计算可视区域裁剪：
   * - 计算 padding 以在容器内居中显示；
   * - 同步 videoGroup 的缩放与位移；
   * - 写回 idealWidth/idealHeight/scaleFactor 等派生状态；
   * - 使用圆角路径构建 clip。
   */
  private createStageClip(): (ctx: Konva.Context) => void {
    return (ctx: Konva.Context) => {
      const state = this.context.getState();
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

      if (state.size.ratio === "original") {
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
        this.context.patch({
          calculatedWidth: safeViewWidth,
          calculatedHeight: safeViewHeight,
          calculatedXStart: paddingX,
          calculatedYStart: paddingY,
          idealWidth: safeIdealWidth,
          idealHeight: safeIdealWidth * aspectRatio,
          scaleFactor: scale,
        });
      }

      const { backgroundRect } = this.context.getState();
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

  /** 外部触发刷新缩略图的 DOM 事件回调。 */
  private handleThumbnailUpdate = () => {
    void this.updateThumbnail();
  };

  /** 点击/失焦时隐藏自定义右键菜单。 */
  private handleWindowClick = () => {
    this.context.patch({ showContextMenu: false });
  };

  private handleWindowBlur = () => {
    this.context.patch({ showContextMenu: false });
  };
}
