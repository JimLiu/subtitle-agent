import { useEffect, useRef } from "react";
import Konva from "konva";

import { ShapePreviewNode } from "../nodes/shape-preview-node";
import type { PreviewKonvaNodeConstructorOptions, PreviewKonvaNodeMountOptions, ProjectSize } from "../nodes/preview-konva-node";
import type { ShapeElement } from "@/types/timeline";

interface ShapePreviewProps {
  id: string;
  parentLayer: Konva.Group | null;
  element: ShapeElement | null;
  konvaZIndex: number;
  currentTimestamp: number;
  playing: boolean;
  size: ProjectSize;
  updateSegment: PreviewKonvaNodeConstructorOptions<ShapeElement>["updateSegment"];
}

export function ShapePreview(props: ShapePreviewProps): null {
  const nodeRef = useRef<ShapePreviewNode | null>(null);

  useEffect(() => {
    if (!props.parentLayer) {
      return undefined;
    }

    const node = new ShapePreviewNode({
      id: props.id,
      parentLayer: props.parentLayer,
      updateSegment: props.updateSegment,
    });

    nodeRef.current = node;

    const mountOptions: PreviewKonvaNodeMountOptions<ShapeElement> = {
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
