import { useEffect, useRef } from "react";
import Konva from "konva";

import { VideoPreviewNode } from "../nodes/video-preview-node";
import type { PreviewKonvaNodeConstructorOptions, PreviewKonvaNodeMountOptions, ProjectSize } from "../nodes/preview-konva-node";
import type { SpectrumAnalyzer } from "../lib/spectrum-analyzer";
import type { VideoElement } from "@/types/timeline";

interface VideoPreviewProps {
  id: string;
  parentLayer: Konva.Group | null;
  element: VideoElement | null;
  konvaZIndex: number;
  currentTimestamp: number;
  playing: boolean;
  size: ProjectSize;
  updateSegment: PreviewKonvaNodeConstructorOptions<VideoElement>["updateSegment"];
  audioContext?: AudioContext | null;
  analyzer?: SpectrumAnalyzer | null;
}

export function VideoPreview(props: VideoPreviewProps): null {
  const nodeRef = useRef<VideoPreviewNode | null>(null);

  useEffect(() => {
    if (!props.parentLayer) {
      return undefined;
    }

    const node = new VideoPreviewNode({
      id: props.id,
      parentLayer: props.parentLayer,
      updateSegment: props.updateSegment,
      audioContext: props.audioContext ?? null,
      analyzer: props.analyzer ?? null,
    });

    nodeRef.current = node;

    const mountOptions: PreviewKonvaNodeMountOptions<VideoElement> = {
      element: props.element,
      konvaZIndex: props.konvaZIndex,
      currentTimestamp: props.currentTimestamp,
      playing: props.playing,
      size: props.size,
    };

    void node.mount(mountOptions);

    return () => {
      node.destroy();
      nodeRef.current = null;
    };
  }, [props.parentLayer, props.id, props.updateSegment, props.audioContext, props.analyzer]);

  useEffect(() => {
    nodeRef.current?.setElement(props.element);
  }, [props.element]);

  useEffect(() => {
    nodeRef.current?.setKonvaZIndex(props.konvaZIndex);
  }, [props.konvaZIndex]);

  useEffect(() => {
    nodeRef.current?.setCurrentTimestamp(props.currentTimestamp);
  }, [props.currentTimestamp]);

  useEffect(() => {
    nodeRef.current?.setPlaying(props.playing);
  }, [props.playing]);

  useEffect(() => {
    nodeRef.current?.setSize(props.size);
  }, [props.size]);

  useEffect(() => {
    if (props.parentLayer && nodeRef.current) {
      nodeRef.current.setParentLayer(props.parentLayer);
    }
  }, [props.parentLayer]);

  return null;
}
