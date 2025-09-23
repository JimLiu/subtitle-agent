import { useEffect, useRef } from "react";
import Konva from "konva";

import { WavePreviewNode } from "../nodes/wave-preview-node";
import type { PreviewKonvaNodeConstructorOptions, PreviewKonvaNodeMountOptions, ProjectSize } from "../nodes/preview-konva-node";
import type { SpectrumAnalyzer } from "../lib/spectrum-analyzer";
import type { WaveElement } from "@/types/timeline";

interface WavePreviewProps {
  id: string;
  parentLayer: Konva.Layer | null;
  element: WaveElement | null;
  konvaZIndex: number;
  currentTimestamp: number;
  playing: boolean;
  size: ProjectSize;
  updateSegment: PreviewKonvaNodeConstructorOptions<WaveElement>["updateSegment"];
  audioContext?: AudioContext | null;
  analyzer?: SpectrumAnalyzer | null;
}

export function WavePreview(props: WavePreviewProps): null {
  const nodeRef = useRef<WavePreviewNode | null>(null);

  useEffect(() => {
    if (!props.parentLayer) {
      return undefined;
    }

    const node = new WavePreviewNode({
      id: props.id,
      parentLayer: props.parentLayer,
      updateSegment: props.updateSegment,
      audioContext: props.audioContext ?? null,
      analyzer: props.analyzer ?? null,
    });

    nodeRef.current = node;

    const mountOptions: PreviewKonvaNodeMountOptions<WaveElement> = {
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
