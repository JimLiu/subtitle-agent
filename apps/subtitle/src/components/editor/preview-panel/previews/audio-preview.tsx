import { useEffect, useRef } from "react";
import Konva from "konva";

import { AudioPreviewNode } from "../nodes/audio-preview-node";
import type { PreviewKonvaNodeConstructorOptions, ProjectSize } from "../nodes/preview-konva-node";
import type { SpectrumAnalyzer } from "../lib/spectrum-analyzer";
import type { AudioElement } from "@/types/timeline";

interface AudioPreviewProps {
  id: string;
  parentLayer: Konva.Group | null;
  element: AudioElement | null;
  konvaZIndex: number;
  currentTimestamp: number;
  playing: boolean;
  size: ProjectSize;
  updateSegment: PreviewKonvaNodeConstructorOptions<AudioElement>["updateSegment"];
  audioContext?: AudioContext | null;
  analyzer?: SpectrumAnalyzer | null;
  addBuffering?: (id: string) => void;
  removeBuffering?: (id: string) => void;
}

export function AudioPreview(props: AudioPreviewProps): null {
  const nodeRef = useRef<AudioPreviewNode | null>(null);

  useEffect(() => {
    if (!props.parentLayer) {
      return undefined;
    }

    const node = new AudioPreviewNode({
      id: props.id,
      parentLayer: props.parentLayer,
      updateSegment: props.updateSegment,
      audioContext: props.audioContext ?? null,
      analyzer: props.analyzer ?? null,
      addBuffering: props.addBuffering,
      removeBuffering: props.removeBuffering,
    });

    nodeRef.current = node;

    void node.mount({
      element: props.element,
      konvaZIndex: props.konvaZIndex,
      currentTimestamp: props.currentTimestamp,
      playing: props.playing,
      size: props.size,
    });

    return () => {
      node.destroy();
      nodeRef.current = null;
    };
  }, [
    props.parentLayer,
    props.id,
    props.updateSegment,
    props.audioContext,
    props.analyzer,
    props.addBuffering,
    props.removeBuffering,
  ]);

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
