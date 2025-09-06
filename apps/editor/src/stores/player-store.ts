import { create } from "zustand";
import { MediaFile } from "@/types/media";
import { TimelineTrack, TextElement } from "@/types/timeline";
import { generateId } from "@/lib/ids";
import { srtToTextElements, readSRTFile } from "@/lib/srt-parser";
import { getMediaDuration, generateVideoThumbnail } from "./media-store";

interface PlayerStore {
  videoFile: MediaFile | null;
  subtitleTrack: TimelineTrack | null;
  isLoading: boolean;
  error: string | null;

  setVideoFile: (file: File) => Promise<void>;
  setSRTFile: (file: File) => Promise<void>;
  clearAll: () => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  videoFile: null,
  subtitleTrack: null,
  isLoading: false,
  error: null,

  setVideoFile: async (file: File) => {
    set({ isLoading: true, error: null });

    try {
      const url = URL.createObjectURL(file);
      const duration = await getMediaDuration(file);
      const { thumbnailUrl, width, height } = await generateVideoThumbnail(file);

      const videoFile: MediaFile = {
        id: generateId(),
        name: file.name,
        type: "video",
        file,
        url,
        thumbnailUrl,
        duration,
        width,
        height,
      };

      set({ videoFile, isLoading: false });
    } catch (error) {
      set({
        error: `Failed to load video: ${error instanceof Error ? error.message : "Unknown error"}`,
        isLoading: false,
      });
    }
  },

  setSRTFile: async (file: File) => {
    set({ isLoading: true, error: null });

    try {
      const srtEntries = await readSRTFile(file);
      const textElements = srtToTextElements(srtEntries);

      const subtitleTrack: TimelineTrack = {
        id: generateId(),
        name: "Subtitles",
        type: "text",
        elements: textElements,
      };

      set({ subtitleTrack, isLoading: false });
    } catch (error) {
      set({
        error: `Failed to load subtitles: ${error instanceof Error ? error.message : "Unknown error"}`,
        isLoading: false,
      });
    }
  },

  clearAll: () => {
    const state = get();
    
    if (state.videoFile?.url) {
      URL.revokeObjectURL(state.videoFile.url);
    }
    if (state.videoFile?.thumbnailUrl) {
      URL.revokeObjectURL(state.videoFile.thumbnailUrl);
    }

    set({
      videoFile: null,
      subtitleTrack: null,
      isLoading: false,
      error: null,
    });
  },
}));