import { useEffect, useRef } from "react";
import Konva from "konva";

import { ImagePreviewNode } from "../nodes/image-preview-node";
import type { PreviewKonvaNodeConstructorOptions, PreviewKonvaNodeMountOptions, ProjectSize } from "../nodes/preview-konva-node";
import type { ImageElement } from "@/types/timeline";

interface ImagePreviewProps {
  id: string;
  parentLayer: Konva.Layer | null;
  element: ImageElement | null;
  konvaZIndex: number;
  currentTimestamp: number;
  playing: boolean;
  size: ProjectSize;
  updateSegment: PreviewKonvaNodeConstructorOptions<ImageElement>["updateSegment"];
}

export function ImagePreview(props: ImagePreviewProps): null {
  const nodeRef = useRef<ImagePreviewNode | null>(null);

  useEffect(() => {
    if (!props.parentLayer) {
      return undefined;
    }

    const node = new ImagePreviewNode({
      id: props.id,
      parentLayer: props.parentLayer,
      updateSegment: props.updateSegment,
    });

    nodeRef.current = node;

    const mountOptions: PreviewKonvaNodeMountOptions<ImageElement> = {
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
