export interface ProgressRendererData {
  width: number;
  height: number;
  progress: number;
  options?: {
    outerColor?: string;
    innerColor?: string;
    radius?: number;
    lineWidth?: number;
  };
}

/** 进度渲染器接口：入参描述画布尺寸、进度数值与样式选项。 */
export interface ProgressRenderer {
  id: string;
  name: string;
  render(context: CanvasRenderingContext2D, data: ProgressRendererData): void;
}
