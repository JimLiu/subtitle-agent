import { useEffect, useRef } from "react";
import Konva from "konva";

import { ProgressBarPreviewNode } from "../nodes/progress-bar-preview-node";
import type { PreviewKonvaNodeConstructorOptions, PreviewKonvaNodeMountOptions, ProjectSize } from "../nodes/preview-konva-node";
import type { ProgressBarElement } from "@/types/timeline";

interface ProgressBarPreviewProps {
  id: string;
  parentLayer: Konva.Group | null;
  element: ProgressBarElement | null;
  konvaZIndex: number;
  currentTimestamp: number;
  playing: boolean;
  size: ProjectSize;
  updateSegment: PreviewKonvaNodeConstructorOptions<ProgressBarElement>["updateSegment"];
}

export function ProgressBarPreview(props: ProgressBarPreviewProps): null {
  const nodeRef = useRef<ProgressBarPreviewNode | null>(null);

  useEffect(() => {
    if (!props.parentLayer) {
      return undefined;
    }

    const node = new ProgressBarPreviewNode({
      id: props.id,
      parentLayer: props.parentLayer,
      updateSegment: props.updateSegment,
    });

    nodeRef.current = node;

    const mountOptions: PreviewKonvaNodeMountOptions<ProgressBarElement> = {
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
  }, [props.parentLayer, props.id, props.updateSegment]);

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
