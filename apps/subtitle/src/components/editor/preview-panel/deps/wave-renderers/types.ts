export interface WaveRendererData {
  bars: number;
  fftData: number[];
  fill: string;
  width: number;
  height: number;
  corners?: number;
  playing?: boolean;
  waveType?: string;
  placeholderFftData?: number[];
}

/** 波形渲染器接口：定义绘制所需的输入数据与尺寸。 */
export interface WaveRenderer {
  id: string;
  name: string;
  width: number;
  height: number;
  render(context: CanvasRenderingContext2D, data: WaveRendererData): void;
}
