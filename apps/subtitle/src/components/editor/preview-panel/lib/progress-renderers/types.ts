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

export interface ProgressRenderer {
  id: string;
  name: string;
  render(context: CanvasRenderingContext2D, data: ProgressRendererData): void;
}
