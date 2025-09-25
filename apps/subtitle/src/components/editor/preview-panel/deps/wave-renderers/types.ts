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

export interface WaveRenderer {
  id: string;
  name: string;
  width: number;
  height: number;
  render(context: CanvasRenderingContext2D, data: WaveRendererData): void;
}
