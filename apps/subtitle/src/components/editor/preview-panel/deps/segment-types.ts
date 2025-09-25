export interface SegmentPosition {
  x: number;
  y: number;
}

export interface SegmentScale {
  x: number;
  y: number;
}

export interface SegmentAnimation {
  type: string;
  duration?: number;
}

export interface SegmentFont {
  family?: string;
  files?: Record<string, string>;
  variants?: string[];
}

export interface SegmentOptions {
  stokeColor?: string;
  shadowColor?: string;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface SegmentBase {
  id: string;
  type: string;
  startTime: number;
  endTime: number;
  rotation: number;
  opacity: number;
  position: SegmentPosition;
  scale?: SegmentScale;
  zIndex?: number;
  animations?: SegmentAnimation[];
}

export interface TextSegment extends SegmentBase {
  type: 'text' | 'subtitles';
  text?: string;
  width?: number;
  height?: number | 'auto';
  fontSize?: number;
  letterSpacing?: number;
  align?: string;
  lineHeight?: number;
  font?: SegmentFont;
  strokeWidth?: number;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  verticalAlign?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  options?: SegmentOptions;
  subtitles?: {
    segments: SubtitleCue[];
  };
}

export interface WaveSegment extends SegmentBase {
  type: 'wave';
  width?: number;
  height?: number;
  bars?: number;
  corners?: number;
  wave?: string;
  barType?: string;
  options?: Record<string, unknown>;
}

export interface ShapeSegment extends SegmentBase {
  type: 'shape';
  width: number;
  height: number;
  shapeType: string;
  options?: {
    radius?: number;
    borderColor?: string;
    borderWidth?: number;
    cornerRadius?: number;
  };
}

export interface ProgressBarSegment extends SegmentBase {
  type: 'progress_bar';
  width: number;
  height: number;
  barType: string;
  options?: {
    outerColor?: string;
    innerColor?: string;
    radius?: number;
    lineWidth?: number;
  };
}

export interface MediaSegment extends SegmentBase {
  fileId?: string;
  remoteSource?: string;
  volume?: number;
  cut?: number;
  cornerRadius?: number;
}

export interface AudioSegment extends MediaSegment {
  type: 'audio';
}

export interface VideoSegment extends MediaSegment {
  type: 'video';
}

export interface ImageSegment extends SegmentBase {
  type: 'image';
  fileId?: string;
  remoteSource?: string;
  cornerRadius?: number;
}

export type PreviewSegment =
  | TextSegment
  | WaveSegment
  | ShapeSegment
  | ProgressBarSegment
  | AudioSegment
  | VideoSegment
  | ImageSegment;
