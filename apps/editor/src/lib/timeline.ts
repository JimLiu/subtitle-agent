import { TimelineElement, TimelineTrack, TrackType } from "@/types/timeline";
import { generateId } from "./ids";

// Helper function to check for element overlaps and prevent invalid timeline states
export const checkElementOverlaps = (elements: TimelineElement[]): boolean => {
  // Sort elements by start time
  const sortedElements = [...elements].sort(
    (a, b) => a.startTime - b.startTime
  );

  for (let i = 0; i < sortedElements.length - 1; i++) {
    const current = sortedElements[i];
    const next = sortedElements[i + 1];

    const currentEnd =
      current.startTime +
      (current.duration - current.trimStart - current.trimEnd);

    // Check if current element overlaps with next element
    if (currentEnd > next.startTime) return true; // Overlap detected
  }

  return false; // No overlaps
};

// Helper function to resolve overlaps by adjusting element positions
export const resolveElementOverlaps = (
  elements: TimelineElement[]
): TimelineElement[] => {
  // Sort elements by start time
  const sortedElements = [...elements].sort(
    (a, b) => a.startTime - b.startTime
  );
  const resolvedElements: TimelineElement[] = [];

  for (let i = 0; i < sortedElements.length; i++) {
    const current = { ...sortedElements[i] };

    if (resolvedElements.length > 0) {
      const previous = resolvedElements[resolvedElements.length - 1];
      const previousEnd =
        previous.startTime +
        (previous.duration - previous.trimStart - previous.trimEnd);

      // If current element would overlap with previous, push it after previous ends
      if (current.startTime < previousEnd) {
        current.startTime = previousEnd;
      }
    }

    resolvedElements.push(current);
  }

  return resolvedElements;
};


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
      id: generateId(),
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
