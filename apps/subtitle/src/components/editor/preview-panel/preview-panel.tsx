import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Konva from "konva";
import type { SceneContext } from "konva/lib/Context";
import type {
  ClipFuncOutput,
  Container as KonvaContainer,
} from "konva/lib/Container";
import cloneDeep from "lodash/cloneDeep";
import hotkeys from "hotkeys-js";
import { Stage } from "react-konva";

import { SpectrumAnalyzer } from "./lib/spectrum-analyzer";
import { SAMPLE_RATE } from "./lib/constants";
import ratioPresets from "./lib/ratio-presets";
import type { ProjectSize } from "./nodes/preview-konva-node";
import type {
  AudioElement,
  ImageElement,
  ProgressBarElement,
  ShapeElement,
  TextElement,
  TimelineElement,
  VideoElement,
  WaveElement,
} from "@/types/timeline";
import { SubtitlePreview } from "./previews/subtitle-preview";
import { TextPreview } from "./previews/text-preview";
import { ImagePreview } from "./previews/image-preview";
import { WavePreview } from "./previews/wave-preview";
import { AudioPreview } from "./previews/audio-preview";
import { VideoPreview } from "./previews/video-preview";
import { ProgressBarPreview } from "./previews/progress-bar-preview";
import { ShapePreview } from "./previews/shape-preview";
import { LoadingSpinner } from "./components/loading-spinner";
import { TextEditToolbar } from "./components/text-edit-toolbar";
import { SegmentContextMenu } from "./components/segment-context-menu";

interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface PreviewPanelProps {
  projectID: string;
  selectedSegment: string | null;
  orderedSegments: TimelineElement[];
  allSegments: Record<string, TimelineElement>;
  size: ProjectSize;
  backgroundColor: string;
  currentTimestamp: number;
  buffering: boolean;
  playing: boolean;
  minZIndex: number;
  maxZIndex: number;
  getSegmentById: (id: string) => TimelineElement | null;
  getKonvaZIndex: (id: string) => number;
  setPlaying: (playing: boolean) => void;
  setSelectedSegment: (id: string | null) => void;
  removeActiveTool: () => void;
  setActiveTool: (tool: string) => void;
  updateSegment: (
    payload: Partial<TimelineElement> & { id: string }
  ) => void | Promise<void>;
  setPreviewThumbnail: (path: string) => void | Promise<void>;
  deleteSegment: (id: string) => void | Promise<void>;
  duplicateSegment: (payload: { id: string }) => void | Promise<void>;
  addBuffering?: (id: string) => void;
  removeBuffering?: (id: string) => void;
}

export function PreviewPanel(props: PreviewPanelProps) {
  const {
    projectID,
    selectedSegment,
    orderedSegments,
    allSegments,
    size,
    backgroundColor,
    currentTimestamp,
    buffering,
    playing,
    minZIndex,
    maxZIndex,
    getSegmentById,
    getKonvaZIndex,
    setPlaying,
    setSelectedSegment,
    removeActiveTool,
    setActiveTool,
    updateSegment,
    setPreviewThumbnail,
    deleteSegment,
    duplicateSegment,
    addBuffering,
    removeBuffering,
  } = props;
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const backgroundGroupRef = useRef<Konva.Group | null>(null);
  const backgroundRectRef = useRef<Konva.Rect | null>(null);
  const maskingGroupRef = useRef<Konva.Group | null>(null);
  const videoGroupRef = useRef<Konva.Group | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const hoverTransformerRef = useRef<Konva.Transformer | null>(null);
  const rotationTextRef = useRef<Konva.Text | null>(null);
  const helperTextGroupRef = useRef<Konva.Group | null>(null);
  const helperTextBackgroundRectRef = useRef<Konva.Rect | null>(null);
  const stageAnimationRef = useRef<Konva.Animation | null>(null);

  const [konvaInit, setKonvaInit] = useState(false);
  const [stageReady, setStageReady] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [transformerActive, setTransformerActive] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] =
    useState<ContextMenuPosition>({ x: 0, y: 0 });
  const [toolbarStyle, setToolbarStyle] = useState<CSSProperties>({});

  const scaleFactorRef = useRef(0);
  const calculatedWidthRef = useRef(0);
  const calculatedHeightRef = useRef(0);
  const calculatedXStartRef = useRef(0);
  const calculatedYStartRef = useRef(0);
  const idealWidthRef = useRef(0);
  const idealHeightRef = useRef(0);

  const [selectedShapeName, setSelectedShapeName] = useState<string | null>(
    null
  );
  const hoverShapeNameRef = useRef<string | null>(null);
  const rotationTextTimeoutRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<SpectrumAnalyzer | null>(null);
  const screenshotIntervalRef = useRef<number | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const isDarkModeRef = useRef<boolean>(
    document.documentElement.classList.contains("dark")
  );
  const segmentsCloneRef = useRef<Record<string, TimelineElement>>({});

  const stageClip = useCallback<
    (ctx: SceneContext, shape?: KonvaContainer) => ClipFuncOutput
  >(
    (ctx) => {
      const videoGroup = videoGroupRef.current;
      if (!videoGroup) {
        return;
      }

      const stageWidthCurrent = stageSize.width;
      const stageHeightCurrent = stageSize.height;

      let paddingX = 12;
      let paddingY = 16;
      const availableWidth = stageWidthCurrent - 24;
      const availableHeight = stageHeightCurrent - 32;
      let ratioWidth: number;
      let ratioHeight: number;
      let idealWidth: number;

      if (size.ratio === "original") {
        ratioWidth = size.original.width;
        ratioHeight = size.original.height;
        idealWidth = size.original.width;
      } else {
        const preset = ratioPresets[size.ratio];
        ratioWidth = preset.idealRatioWidth;
        ratioHeight = preset.idealRatioHeight;
        idealWidth = preset.resolutions.hd;
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

      const scale = viewWidth / idealWidth;
      scaleFactorRef.current = scale;
      videoGroup.scale({ x: scale, y: scale });
      videoGroup.position({ x: paddingX, y: paddingY });

      let cornerRadius = 15;
      if (viewWidth < 2 * cornerRadius) {
        cornerRadius = viewWidth / 2;
      }
      if (viewHeight < 2 * cornerRadius) {
        cornerRadius = viewHeight / 2;
      }

      calculatedWidthRef.current = viewWidth;
      calculatedHeightRef.current = viewHeight;
      calculatedXStartRef.current = paddingX;
      calculatedYStartRef.current = paddingY;
      idealWidthRef.current = idealWidth;
      idealHeightRef.current = idealWidth * (viewHeight / viewWidth);

      if (backgroundRectRef.current) {
        backgroundRectRef.current.position({
          x: paddingX + 0.5,
          y: paddingY + 0.5,
        });
        backgroundRectRef.current.size({
          width: viewWidth - 1,
          height: viewHeight - 2,
        });
        backgroundRectRef.current.cornerRadius(cornerRadius);
      }

      ctx.beginPath();
      ctx.moveTo(paddingX + cornerRadius, paddingY);
      ctx.arcTo(
        paddingX + viewWidth,
        paddingY,
        paddingX + viewWidth,
        paddingY + viewHeight,
        cornerRadius
      );
      ctx.arcTo(
        paddingX + viewWidth,
        paddingY + viewHeight,
        paddingX,
        paddingY + viewHeight,
        cornerRadius
      );
      ctx.arcTo(
        paddingX,
        paddingY + viewHeight,
        paddingX,
        paddingY,
        cornerRadius
      );
      ctx.arcTo(
        paddingX,
        paddingY,
        paddingX + viewWidth,
        paddingY,
        cornerRadius
      );
      ctx.closePath();
    },
    [size, stageSize.width, stageSize.height]
  );

  const stageClipSetter = useMemo(
    () =>
      stageClip as unknown as (
        ctx: CanvasRenderingContext2D,
        shape: KonvaContainer
      ) => ClipFuncOutput,
    [stageClip]
  );

  useEffect(() => {
    segmentsCloneRef.current = cloneDeep(allSegments);
  }, [allSegments]);

  const initializeAudio = useCallback(() => {
    const handleClick = () => {
      if (!audioContextRef.current) {
        const context = new AudioContext({ sampleRate: SAMPLE_RATE });
        const analyzer = new SpectrumAnalyzer(context);
        analyzer.analyzer.connect(context.destination);
        audioContextRef.current = context;
        analyzerRef.current = analyzer;
      }
    };

    document.body.addEventListener("click", handleClick, { once: true });
    return () => {
      document.body.removeEventListener("click", handleClick);
    };
  }, []);

  useEffect(() => {
    if (!stageReady) {
      return;
    }
    const container = previewContainerRef.current;
    const stage = stageRef.current;
    if (!container || !stage) {
      return;
    }
    const width = container.offsetWidth;
    const height = container.offsetHeight;
    stage.width(width * 2);
    stage.height(height * 2);
    setStageSize({ width, height });
  }, [stageReady]);

  const updateDarkMode = useCallback((isDark: boolean) => {
    isDarkModeRef.current = isDark;
    const background = layerRef.current?.findOne<Konva.Rect>("Rect");
    if (background) {
      background.fill(isDark ? "#111827" : "#F2F2F2");
    }
    if (transformerRef.current) {
      transformerRef.current.anchorStroke(isDark ? "#72D1EC" : "white");
      transformerRef.current.anchorFill(isDark ? "#72D1EC" : "white");
      transformerRef.current.borderStroke("#72D1EC");
    }
    videoGroupRef.current?.find(".guid-line").forEach((line) => {
      (line as Konva.Line).stroke(isDark ? "#374151" : "rgb(255, 255, 255)");
    });
    if (helperTextBackgroundRectRef.current) {
      helperTextBackgroundRectRef.current.shadowColor(
        isDark ? "#000" : "black"
      );
      helperTextBackgroundRectRef.current.shadowOpacity(isDark ? 0.5 : 0.3);
    }
    layerRef.current?.batchDraw();
  }, []);

  useEffect(() => {
    const cleanupAudio = initializeAudio();
    return () => {
      cleanupAudio();
    };
  }, [initializeAudio]);

  const updateThumbnail = useCallback(async () => {
    const stage = stageRef.current;
    const backgroundGroup = backgroundGroupRef.current;
    const maskingGroup = maskingGroupRef.current;
    if (!stage || !backgroundGroup || !maskingGroup || document.hidden) {
      return;
    }

    const originalBackgroundClip = backgroundGroup.clipFunc();
    const originalMaskClip = maskingGroup.clipFunc();

    backgroundGroup.clipFunc(undefined);
    maskingGroup.clipFunc(undefined);
    transformerRef.current?.hide();

    void stage.toDataURL({
      x: calculatedXStartRef.current,
      y: calculatedYStartRef.current,
      width: calculatedWidthRef.current,
      height: calculatedHeightRef.current,
      pixelRatio: 2,
    });

    if (originalBackgroundClip) {
      backgroundGroup.clipFunc(originalBackgroundClip);
    } else {
      backgroundGroup.clipFunc(undefined);
    }
    maskingGroup.clipFunc(originalMaskClip ?? stageClipSetter);
    transformerRef.current?.show();

    await setPreviewThumbnail(`previews/${projectID}.png`);
  }, [projectID, setPreviewThumbnail, stageClipSetter]);

  const initializeStage = useCallback(() => {
    const previewContainer = previewContainerRef.current;
    if (!previewContainer) {
      return;
    }

    const stage = stageRef.current;
    if (!stage) {
      return;
    }

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
      fill: isDarkModeRef.current ? "#111827" : "#F2F2F2",
    });
    backgroundGroup.add(stageBackground);
    layer.add(backgroundGroup);

    const backgroundGroupInner = new Konva.Group();
    layer.add(backgroundGroupInner);

    const backgroundRect = new Konva.Rect({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fill: backgroundColor,
      cornerRadius: 15,
      shadowBlur: 7,
      shadowColor: "grey",
      shadowOpacity: 0.5,
    });
    backgroundGroupInner.add(backgroundRect);

    const maskingGroup = new Konva.Group({
      clipFunc: stageClip,
    });
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
      enabledAnchors: [
        "middle-left",
        "middle-right",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ],
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
          ctx.arc(
            anchor.width() / 2,
            anchor.height() / 2,
            anchor.width() / 2,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.closePath();
          const path = new Path2D(
            "M4.06189 13C4.02104 12.6724 4 12.3387 4 12C4 7.58172 7.58172 4 12 4C14.5006 4 16.7332 5.14727 18.2002 6.94416M19.9381 11C19.979 11.3276 20 11.6613 20 12C20 16.4183 16.4183 20 12 20C9.61061 20 7.46589 18.9525 6 17.2916M9 17H6V17.2916M18.2002 4V6.94416M18.2002 6.94416V6.99993L15.2002 7M6 20V17.2916"
          );
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
          ctx.arc(
            anchor.width() / 2,
            anchor.height() / 2,
            anchor.width() / 2,
            0,
            Math.PI * 2
          );
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

    layer.add(transformer);
    layer.add(hoverTransformer);
    layer.add(helperTextGroup);

    const animation = new Konva.Animation(() => undefined, layer);
    animation.start();

    layerRef.current = layer;
    backgroundGroupRef.current = backgroundGroupInner;
    backgroundRectRef.current = backgroundRect;
    maskingGroupRef.current = maskingGroup;
    videoGroupRef.current = videoGroup;
    transformerRef.current = transformer;
    hoverTransformerRef.current = hoverTransformer;
    helperTextGroupRef.current = helperTextGroup;
    helperTextBackgroundRectRef.current = helperTextBackgroundRect;
    rotationTextRef.current = rotationText;
    stageAnimationRef.current = animation;

    setKonvaInit(true);

    const interval = window.setInterval(() => {
      void updateThumbnail();
    }, 60_000);

    screenshotIntervalRef.current = interval;

    const handleUpdateThumbnail = () => {
      void updateThumbnail();
    };

    document.addEventListener(
      "updateThumbnail",
      handleUpdateThumbnail as EventListener
    );

    const initialDarkMode = document.documentElement.classList.contains("dark");
    updateDarkMode(initialDarkMode);

    return () => {
      document.removeEventListener(
        "updateThumbnail",
        handleUpdateThumbnail as EventListener
      );
      if (screenshotIntervalRef.current) {
        clearInterval(screenshotIntervalRef.current);
        screenshotIntervalRef.current = null;
      }
      animation.stop();
      layer.destroy();
      maskingGroup.destroy();
    };
  }, [backgroundColor, stageClip, updateDarkMode, updateThumbnail]);

  const positionFloatingHelpText = useCallback(() => {
    const transformer = transformerRef.current;
    const helperTextGroup = helperTextGroupRef.current;
    const rotationText = rotationTextRef.current;
    const helperTextBackgroundRect = helperTextBackgroundRectRef.current;
    if (
      !transformer ||
      !helperTextGroup ||
      !rotationText ||
      !helperTextBackgroundRect
    ) {
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
    const stage = stageRef.current;
    if (stage) {
      const boundingRect = stage.container().getBoundingClientRect();
      setToolbarStyle({
        left: `${boundingRect.left + rect.x + rect.width / 2}px`,
        top: `${boundingRect.top + rect.y + rect.height + 15}px`,
        transform: "translateX(-50%)",
        zIndex: 1000,
      });
    }
  }, []);

  const updateFloatingHelpText = useCallback(
    (angle: number) => {
      const rotationText = rotationTextRef.current;
      const helperTextGroup = helperTextGroupRef.current;
      if (!rotationText || !helperTextGroup) {
        return;
      }
      rotationText.text(`${Math.round(angle)}°`);
      positionFloatingHelpText();
      helperTextGroup.visible(true);
      if (rotationTextTimeoutRef.current) {
        clearTimeout(rotationTextTimeoutRef.current);
      }
      rotationTextTimeoutRef.current = window.setTimeout(() => {
        helperTextGroupRef.current?.visible(false);
      }, 1500);
    },
    [positionFloatingHelpText]
  );

  const updateTransformer = useCallback(
    (forceSelect = false) => {
      const stage = stageRef.current;
      const transformer = transformerRef.current;
      const hoverTransformer = hoverTransformerRef.current;
      if (!stage || !transformer || !hoverTransformer) {
        return;
      }

      const selectedNode = selectedShapeName
        ? stage.findOne(`.${selectedShapeName}`)
        : null;
      const hoverNode = hoverShapeNameRef.current
        ? stage.findOne(`.${hoverShapeNameRef.current}`)
        : null;

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
        setTransformerActive(true);
        const segment = selectedShapeName
          ? getSegmentById(selectedShapeName)
          : null;
        if (segment && segment.type === "text") {
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
        if (selectedShapeName) {
          setSelectedSegment(selectedShapeName);
        }
        if (window.innerWidth >= 768) {
          setActiveTool("Details");
        }
        positionFloatingHelpText();
        transformer.on("transform", (event) => {
          const target = event.target;
          if (
            Number(target.attrs.rotation.toFixed(2)) !==
            Number(
              (getSegmentById(selectedShapeName ?? "")?.rotation ?? 0).toFixed(
                2
              )
            )
          ) {
            const angle = target.rotation();
            requestAnimationFrame(() => {
              updateFloatingHelpText(angle);
            });
          }
        });
        transformer.on("transformend", (event) => {
          const angle = event.target.rotation();
          updateFloatingHelpText(angle);
          window.setTimeout(() => {
            helperTextGroupRef.current?.visible(false);
          }, 1500);
        });
        transformer.on("dragmove", () => {
          positionFloatingHelpText();
        });
      } else if (!selectedNode) {
        setTransformerActive(false);
        transformer.detach();
        helperTextGroupRef.current?.visible(false);
        setToolbarStyle({});
      } else if (forceSelect && selectedShapeName) {
        setActiveTool("Details");
      }
      layerRef.current?.batchDraw();
    }, [
      getSegmentById,
      positionFloatingHelpText,
      selectedShapeName,
      setActiveTool,
      setSelectedSegment,
      updateFloatingHelpText,
    ]);

  const bindStageEvents = useCallback(() => {
    const stage = stageRef.current;
    const videoGroup = videoGroupRef.current;
    if (!stage || !videoGroup) {
      return;
    }

    const handleMouseDown = (event: Konva.KonvaEventObject<Event>) => {
      if (event.evt && "touches" in event.evt) {
        return;
      }
      setPlaying(false);
      if (event.target === event.target.getStage()) {
        setSelectedShapeName(null);
        updateTransformer();
        return;
      }
      if (event.target.getParent()?.className === "Transformer") {
        return;
      }
      const name = event.target.name();
      const segment = name ? segmentsCloneRef.current[name] : null;
      setSelectedShapeName(name && segment ? name : null);
      updateTransformer();
    };

    const handleMouseMove = (event: Konva.KonvaEventObject<Event>) => {
      if (event.target === event.target.getStage()) {
        hoverShapeNameRef.current = null;
        updateTransformer();
        return;
      }
      if (event.target.getParent()?.className === "Transformer") {
        return;
      }
      const name = event.target.name();
      const segment = name ? segmentsCloneRef.current[name] : null;
      hoverShapeNameRef.current = name && segment ? name : null;
      updateTransformer();
    };

    const handleTap = (event: Konva.KonvaEventObject<Event>) => {
      if (event.target === event.target.getStage()) {
        setSelectedShapeName(null);
        updateTransformer();
        return;
      }
      if (event.target.getParent()?.className === "Transformer") {
        return;
      }
      const name = event.target.name();
      const segment = name ? segmentsCloneRef.current[name] : null;
      if (name && segment) {
        if (selectedShapeName === name) {
          updateTransformer(true);
        } else {
          setSelectedShapeName(name);
          updateTransformer();
        }
      } else {
        setSelectedShapeName(null);
        updateTransformer();
      }
    };

    stage.on("mousedown", handleMouseDown);
    stage.on("touchstart", handleMouseDown);
    stage.on("mousemove", handleMouseMove);
    stage.on("tap", handleTap);

    const handleContextMenu = (event: Konva.KonvaEventObject<PointerEvent>) => {
      event.evt.preventDefault();
      setShowContextMenu(false);
      if (event.target === stage) {
        return;
      }
      const shapeName = event.target.name();
      if (!shapeName) {
        return;
      }
      const segment = segmentsCloneRef.current[shapeName];
      if (!segment) {
        return;
      }
      setSelectedSegment(shapeName);
      setSelectedShapeName(shapeName);
      updateTransformer();
      setShowContextMenu(true);
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
      setContextMenuPosition({ x: posX, y: posY });
    };

    stage.on("contextmenu", handleContextMenu);

    const handleDragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
      videoGroup.find(".guid-line").forEach((line) => line.destroy());
      if (!videoGroup || !stage) {
        return;
      }
      const lineGuideStops = getLineGuideStops(
        event.target,
        stage,
        idealWidthRef.current,
        idealHeightRef.current,
        orderedSegments,
        videoGroup
      );
      const snappingEdges = getObjectSnappingEdges(event.target, videoGroup);
      const guides = getGuides(
        lineGuideStops,
        snappingEdges,
        5 / (scaleFactorRef.current || 1)
      );
      if (!guides.length) {
        return;
      }
      drawGuides(guides, videoGroup, 1 / (scaleFactorRef.current || 1));
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
    };

    const handleDragEnd = () => {
      videoGroup.find(".guid-line").forEach((line) => line.destroy());
    };

    videoGroup.on("dragmove", handleDragMove);
    videoGroup.on("dragend", handleDragEnd);

    return () => {
      stage.off("mousedown", handleMouseDown);
      stage.off("touchstart", handleMouseDown);
      stage.off("mousemove", handleMouseMove);
      stage.off("tap", handleTap);
      stage.off("contextmenu", handleContextMenu);
      videoGroup.off("dragmove", handleDragMove);
      videoGroup.off("dragend", handleDragEnd);
    };
  }, [
    orderedSegments,
    setPlaying,
    setSelectedSegment,
    selectedShapeName,
    updateTransformer,
  ]);

  const handleWindowClick = useCallback(() => {
    setShowContextMenu(false);
  }, []);

  const handleWindowBlur = useCallback(() => {
    setShowContextMenu(false);
  }, []);

  const bindShortcuts = useCallback(() => {
    hotkeys("cmd+s, ctrl+s", (event) => {
      void updateThumbnail();
      event.preventDefault();
    });
    return () => {
      hotkeys.unbind("cmd+s, ctrl+s");
    };
  }, []);


  const initializeObservers = useCallback(() => {
    window.addEventListener("click", handleWindowClick as EventListener);
    window.addEventListener("blur", handleWindowBlur as EventListener);

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.target instanceof HTMLElement &&
          mutation.target === document.documentElement
        ) {
          updateDarkMode(document.documentElement.classList.contains("dark"));
        }
      });
    });
    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    mutationObserverRef.current = mutationObserver;

    const previewContainer = previewContainerRef.current;
    if (previewContainer) {
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        setStageSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
        backgroundGroupRef.current?.clipFunc(stageClipSetter);
        maskingGroupRef.current?.clipFunc(stageClipSetter);
        layerRef.current?.batchDraw();
      });
      resizeObserver.observe(previewContainer);
      resizeObserverRef.current = resizeObserver;
    }

    return () => {
      window.removeEventListener("click", handleWindowClick as EventListener);
      window.removeEventListener("blur", handleWindowBlur as EventListener);
      mutationObserver.disconnect();
      resizeObserverRef.current?.disconnect();
    };
  }, [handleWindowBlur, handleWindowClick, stageClipSetter, updateDarkMode]);

  useEffect(() => {
    if (!stageReady) {
      return undefined;
    }
    const cleanupStage = initializeStage();
    const cleanupEvents = bindStageEvents();
    const cleanupShortcuts = bindShortcuts();
    const cleanupObservers = initializeObservers();

    return () => {
      cleanupStage?.();
      cleanupEvents?.();
      cleanupShortcuts?.();
      cleanupObservers?.();
      stageAnimationRef.current?.stop();
      layerRef.current?.destroy();
      maskingGroupRef.current?.destroy();
      stageRef.current?.destroy();
    };
  }, [
    bindStageEvents,
    bindShortcuts,
    initializeObservers,
    initializeStage,
    stageReady,
  ]);

  useEffect(() => {
    if (!konvaInit) {
      return;
    }
    backgroundGroupRef.current?.clipFunc(stageClipSetter);
    maskingGroupRef.current?.clipFunc(stageClipSetter);
    layerRef.current?.batchDraw();
  }, [konvaInit, stageClipSetter, stageSize]);

  useEffect(() => {
    if (backgroundRectRef.current) {
      backgroundRectRef.current.fill(backgroundColor);
      layerRef.current?.batchDraw();
    }
  }, [backgroundColor]);

  useEffect(() => {
    if (selectedSegment !== selectedShapeName) {
      setSelectedShapeName(selectedSegment);
      updateTransformer();
    }
  }, [selectedSegment, selectedShapeName, updateTransformer]);

  useEffect(() => {
    if (!selectedSegment) {
      setToolbarStyle({});
    }
  }, [selectedSegment]);

  useEffect(() => {
    updateTransformer();
  }, [orderedSegments, updateTransformer]);

  useEffect(() => {
    transformerRef.current?.getLayer()?.batchDraw();
  }, [selectedShapeName]);

  useEffect(() => {
    hoverTransformerRef.current?.getLayer()?.batchDraw();
  }, [hoverShapeNameRef.current]);

  useEffect(() => {
    if (!konvaInit) {
      return;
    }
    const stage = stageRef.current;
    if (stage) {
      stage.width(stageSize.width * 2);
      stage.height(stageSize.height * 2);
    }
  }, [konvaInit, stageSize]);

  const bringToFront = useCallback(() => {
    if (!selectedSegment) {
      return;
    }
    const maxZIndexValue = maxZIndex;
    updateSegment({
      id: selectedSegment,
      zIndex: maxZIndexValue + 1,
    });
  }, [selectedSegment, maxZIndex, updateSegment]);

  const sendToBack = useCallback(() => {
    if (!selectedSegment) {
      return;
    }
    const minZIndexValue = minZIndex;
    updateSegment({
      id: selectedSegment,
      zIndex: minZIndexValue - 1,
    });
  }, [selectedSegment, minZIndex, updateSegment]);

  const duplicate = useCallback(() => {
    if (!selectedSegment) {
      return;
    }
    void duplicateSegment({ id: selectedSegment });
  }, [duplicateSegment, selectedSegment]);

  const remove = useCallback(() => {
    if (!selectedSegment) {
      return;
    }
    const removedId = selectedSegment;
    setSelectedShapeName(null);
    hoverShapeNameRef.current = null;
    removeActiveTool();
    setSelectedSegment(null);
    void deleteSegment(removedId);
    updateTransformer();
  }, [
    deleteSegment,
    removeActiveTool,
    selectedSegment,
    setSelectedSegment,
    updateTransformer,
  ]);

  const handleTextSegmentUpdate = useCallback(
    (payload: Partial<TextElement> & { id: string }) => {
      void updateSegment(payload);
    },
    [updateSegment]
  );

  useEffect(() => {
    return () => {
      if (rotationTextTimeoutRef.current) {
        clearTimeout(rotationTextTimeoutRef.current);
        rotationTextTimeoutRef.current = null;
      }
      document.removeEventListener(
        "updateThumbnail",
        updateThumbnail as unknown as EventListener
      );
      window.removeEventListener("click", handleWindowClick as EventListener);
      window.removeEventListener("blur", handleWindowBlur as EventListener);
      mutationObserverRef.current?.disconnect();
      resizeObserverRef.current?.disconnect();
      stageAnimationRef.current?.stop();
      layerRef.current?.destroy();
      maskingGroupRef.current?.destroy();
      stageRef.current?.destroy();
    };
  }, [handleWindowBlur, handleWindowClick, updateThumbnail]);

  const isMobile = useMemo(() => window.innerWidth < 768, []);

  return (
    <div
      ref={stageContainerRef}
      id="stage"
      className="pane h-full relative flex-grow"
    >
      {!konvaInit && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <LoadingSpinner />
        </div>
      )}
      <div
        id="preview-container"
        className="preview-container dark:bg-gray-900"
        ref={previewContainerRef}
      >
        <Stage
          ref={(node) => {
            stageRef.current = node;
            if (node) {
              setStageReady(true);
            }
          }}
          width={stageSize.width * 2}
          height={stageSize.height * 2}
        />
      </div>

      {videoGroupRef.current && (
        <>
          {orderedSegments
            .filter((segment) => segment.type === "subtitles")
            .map((segment) => (
              <SubtitlePreview
                key={`${segment.id}-subtitles`}
                id={segment.id}
                parentLayer={videoGroupRef.current}
                element={segment as TextElement}
                konvaZIndex={getKonvaZIndex(segment.id)}
                currentTimestamp={currentTimestamp}
                playing={playing}
                size={size}
                updateSegment={handleTextSegmentUpdate}
              />
            ))}

          {orderedSegments.map((segment) => {
            const baseProps = {
              key: segment.id,
              id: segment.id,
              parentLayer: videoGroupRef.current,
              konvaZIndex: getKonvaZIndex(segment.id),
              currentTimestamp,
              playing,
              size,
              updateSegment,
            };

            if (segment.type === "image") {
              return (
                <ImagePreview
                  {...baseProps}
                  key={segment.id}
                  element={segment as ImageElement}
                />
              );
            }
            if (segment.type === "text") {
              return (
                <TextPreview {...baseProps}
                  key={segment.id} element={segment as TextElement} />
              );
            }
            if (
              segment.type === "wave" &&
              currentTimestamp >= segment.startTime
            ) {
              return (
                <WavePreview
                  {...baseProps}
                  key={segment.id}
                  element={segment as WaveElement}
                  audioContext={audioContextRef.current}
                  analyzer={analyzerRef.current}
                />
              );
            }
            if (segment.type === "progress_bar") {
              return (
                <ProgressBarPreview
                  {...baseProps}
                  key={segment.id}
                  element={segment as ProgressBarElement}
                />
              );
            }
            if (segment.type === "audio" && audioContextRef.current) {
              return (
                <AudioPreview
                  {...baseProps}
                  key={segment.id}
                  element={segment as AudioElement}
                  audioContext={audioContextRef.current}
                  analyzer={analyzerRef.current}
                  addBuffering={addBuffering}
                  removeBuffering={removeBuffering}
                />
              );
            }
            if (segment.type === "video" && audioContextRef.current) {
              return (
                <VideoPreview
                  {...baseProps}
                  key={segment.id}
                  element={segment as VideoElement}
                  audioContext={audioContextRef.current}
                  analyzer={analyzerRef.current}
                />
              );
            }
            if (segment.type === "shape") {
              return (
                <ShapePreview
                  {...baseProps}
                  key={segment.id}
                  element={segment as ShapeElement}
                />
              );
            }
            return null;
          })}
        </>
      )}

      {selectedSegment && !isMobile && (
        <TextEditToolbar
          segmentId={selectedSegment}
          hasTransformer={transformerActive}
          playing={playing}
          getSegmentById={getSegmentById}
          updateSegment={handleTextSegmentUpdate}
          style={toolbarStyle}
        />
      )}
      {showContextMenu && (
        <SegmentContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          onClose={() => setShowContextMenu(false)}
          onDuplicate={duplicate}
          onBringToFront={bringToFront}
          onSendToBack={sendToBack}
          onRemove={remove}
        />
      )}
    </div>
  );
}

function getLineGuideStops(
  node: Konva.Node,
  stage: Konva.Stage,
  idealWidth: number,
  idealHeight: number,
  segments: TimelineElement[],
  container: Konva.Group
): { vertical: number[]; horizontal: number[] } {
  const vertical: number[] = [0, idealWidth / 2, idealWidth];
  const horizontal: number[] = [0, idealHeight / 2, idealHeight];
  let wrapper: Konva.Node | null = node;

  while (wrapper && wrapper.name() !== "konvaWrapper" && wrapper.getParent()) {
    wrapper = wrapper.getParent();
  }

  segments.forEach((segment) => {
    stage.find(`#${segment.id}`).forEach((shape) => {
      if (wrapper?.id && wrapper.id() === segment.id) {
        return;
      }
      const rect = shape.getClientRect({ relativeTo: container });
      const width = rect.width;
      const height = rect.height;
      const positionX = segment.x ?? 0;
      const positionY = segment.y ?? 0;
      vertical.push(positionX, positionX + width, positionX + width / 2);
      horizontal.push(positionY, positionY + height, positionY + height / 2);
    });
  });

  return { vertical, horizontal };
}

function getObjectSnappingEdges(
  node: Konva.Node,
  container: Konva.Group
): {
  vertical: Array<{ guide: number; offset: number; snap: string }>;
  horizontal: Array<{ guide: number; offset: number; snap: string }>;
} {
  const rect = node.getClientRect({ relativeTo: container });
  const position = node.position();

  return {
    vertical: [
      {
        guide: Math.round(rect.x),
        offset: Math.round(position.x - rect.x),
        snap: "start",
      },
      {
        guide: Math.round(rect.x + rect.width / 2),
        offset: Math.round(position.x - rect.x - rect.width / 2),
        snap: "center",
      },
      {
        guide: Math.round(rect.x + rect.width),
        offset: Math.round(position.x - rect.x - rect.width),
        snap: "end",
      },
    ],
    horizontal: [
      {
        guide: Math.round(rect.y),
        offset: Math.round(position.y - rect.y),
        snap: "start",
      },
      {
        guide: Math.round(rect.y + rect.height / 2),
        offset: Math.round(position.y - rect.y - rect.height / 2),
        snap: "center",
      },
      {
        guide: Math.round(rect.y + rect.height),
        offset: Math.round(position.y - rect.y - rect.height),
        snap: "end",
      },
    ],
  };
}

function getGuides(
  stops: { vertical: number[]; horizontal: number[] },
  edges: ReturnType<typeof getObjectSnappingEdges>,
  offset: number
): Array<{
  lineGuide: number;
  diff: number;
  orientation: "V" | "H";
  snap: string;
  offset: number;
}> {
  const result: Array<{
    lineGuide: number;
    diff: number;
    orientation: "V" | "H";
    snap: string;
    offset: number;
  }> = [];
  const verticalMatches: Array<{
    lineGuide: number;
    diff: number;
    snap: string;
    offset: number;
  }> = [];
  const horizontalMatches: Array<{
    lineGuide: number;
    diff: number;
    snap: string;
    offset: number;
  }> = [];

  stops.vertical.forEach((lineGuide) => {
    edges.vertical.forEach((edge) => {
      const diff = Math.abs(lineGuide - edge.guide);
      if (diff < offset) {
        verticalMatches.push({
          lineGuide,
          diff,
          snap: edge.snap,
          offset: edge.offset,
        });
      }
    });
  });

  stops.horizontal.forEach((lineGuide) => {
    edges.horizontal.forEach((edge) => {
      const diff = Math.abs(lineGuide - edge.guide);
      if (diff < offset) {
        horizontalMatches.push({
          lineGuide,
          diff,
          snap: edge.snap,
          offset: edge.offset,
        });
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

function drawGuides(
  guides: Array<{
    lineGuide: number;
    orientation: "V" | "H";
    snap: string;
    offset: number;
  }>,
  container: Konva.Group,
  scale: number
): void {
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
