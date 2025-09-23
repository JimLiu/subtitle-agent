import { MediaType } from "@/types/media";
import { generateUUID } from "@/lib/utils";

export type TrackType = "media" | "text" | "audio";

export interface Scale {
  x: number;
  y: number;
}

export interface TimelineElementAnimation {
  type: string;
  duration?: number;
}

// Base element properties
interface BaseTimelineElement {
  id: string;
  name: string;
  duration: number;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  hidden?: boolean;
  scale?: Scale;
  x: number; // Position relative to canvas center
  y: number; // Position relative to canvas center
  rotation: number; // in degrees
  opacity: number; // 0-1
  
  zIndex?: number;
  animations?: TimelineElementAnimation[];
}

// Media element that references MediaStore
export interface MediaElement extends BaseTimelineElement {
  mediaId: string;
  remoteSource?: string;
  muted?: boolean;
  volume?: number;
  cornerRadius?: number;
}

export interface AudioElement extends MediaElement {
  type: 'audio';
}

export interface VideoElement extends MediaElement {
  type: 'video';
}

export interface ImageElement extends BaseTimelineElement {
  type: 'image';
  mediaId?: string;
  remoteSource?: string;
  cornerRadius?: number;
}


export interface ElementFont {
  family?: string;
  files?: Record<string, string>;
  variants?: string[];
}

export interface ElementOptions {
  stokeColor?: string;
  shadowColor?: string;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

// Text element with embedded text data
export interface TextElement extends BaseTimelineElement {
  type: "text" | "subtitles";
  content: string;
  width?: number;
  height?: number | 'auto';
  fontSize: number;
  letterSpacing?: number;
  lineHeight?: number;
  font?: ElementFont;
  color: string;
  backgroundColor: string;
  textAlign: "left" | "center" | "right";
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline" | "line-through" | "underline-line-through";
  strokeWidth?: number;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  verticalAlign?: string;
  options?: ElementOptions;
  subtitles?: {
    segments: SubtitleCue[];
  };
}

export interface WaveElement extends BaseTimelineElement {
  type: 'wave';
  width?: number;
  height?: number;
  color?: string;
  bars?: number;
  corners?: number;
  wave?: string;
  barType?: string;
  options?: Record<string, unknown>;
}

export interface ShapeElement extends BaseTimelineElement {
  type: 'shape';
  width: number;
  height: number;
  shapeType: string;
  color?: string;
  options?: {
    radius?: number;
    borderColor?: string;
    borderWidth?: number;
    cornerRadius?: number;
  };
}


export interface ProgressBarElement extends BaseTimelineElement {
  type: 'progress_bar';
  width: number;
  height: number;
  barType: string;
  color?: string;
  options?: {
    outerColor?: string;
    innerColor?: string;
    radius?: number;
    lineWidth?: number;
  };
}


// Typed timeline elements
export type TimelineElement = AudioElement | TextElement | WaveElement | ImageElement | ShapeElement | VideoElement | ProgressBarElement;

// Creation types (without id, for addElementToTrack)
export type CreateMediaElement = Omit<MediaElement, "id">;
export type CreateTextElement = Omit<TextElement, "id">;
export type CreateTimelineElement = CreateMediaElement | CreateTextElement;

export interface TimelineElementProps {
  element: TimelineElement;
  track: TimelineTrack;
  zoomLevel: number;
  isSelected: boolean;
  onElementMouseDown: (e: React.MouseEvent, element: TimelineElement) => void;
  onElementClick: (e: React.MouseEvent, element: TimelineElement) => void;
}

export interface ResizeState {
  elementId: string;
  side: "left" | "right";
  startX: number;
  initialTrimStart: number;
  initialTrimEnd: number;
}

// Drag data types for type-safe drag and drop
export interface MediaItemDragData {
  id: string;
  type: MediaType;
  name: string;
}

export interface TextItemDragData {
  id: string;
  type: "text";
  name: string;
  content: string;
}

export type DragData = MediaItemDragData | TextItemDragData;

export interface TimelineTrack {
  id: string;
  name: string;
  type: TrackType;
  elements: TimelineElement[];
  muted?: boolean;
  isMain?: boolean;
}

export function sortTracksByOrder(tracks: TimelineTrack[]): TimelineTrack[] {
  return [...tracks].sort((a, b) => {
    // Text tracks always go to the top
    if (a.type === "text" && b.type !== "text") return -1;
    if (b.type === "text" && a.type !== "text") return 1;

    // Audio tracks always go to bottom
    if (a.type === "audio" && b.type !== "audio") return 1;
    if (b.type === "audio" && a.type !== "audio") return -1;

    // Main track goes above audio but below text tracks
    if (a.isMain && !b.isMain && b.type !== "audio" && b.type !== "text")
      return 1;
    if (b.isMain && !a.isMain && a.type !== "audio" && a.type !== "text")
      return -1;

    // Within same category, maintain creation order
    return 0;
  });
}

export function getMainTrack(tracks: TimelineTrack[]): TimelineTrack | null {
  return tracks.find((track) => track.isMain) || null;
}

export function ensureMainTrack(tracks: TimelineTrack[]): TimelineTrack[] {
  const hasMainTrack = tracks.some((track) => track.isMain);

  if (!hasMainTrack) {
    // Create main track if it doesn't exist
    const mainTrack: TimelineTrack = {
      id: generateUUID(),
      name: "Main Track",
      type: "media",
      elements: [],
      muted: false,
      isMain: true,
    };
    return [mainTrack, ...tracks];
  }

  return tracks;
}

// Timeline validation utilities
export function canElementGoOnTrack(
  elementType: "text" | "media",
  trackType: TrackType
): boolean {
  if (elementType === "text") {
    return trackType === "text";
  }
  if (elementType === "media") {
    return trackType === "media" || trackType === "audio";
  }
  return false;
}

export function validateElementTrackCompatibility(
  element: { type: "text" | "media" },
  track: { type: TrackType }
): { isValid: boolean; errorMessage?: string } {
  const isValid = canElementGoOnTrack(element.type, track.type);

  if (!isValid) {
    const errorMessage =
      element.type === "text"
        ? "Text elements can only be placed on text tracks"
        : "Media elements can only be placed on media or audio tracks";

    return { isValid: false, errorMessage };
  }

  return { isValid: true };
}
