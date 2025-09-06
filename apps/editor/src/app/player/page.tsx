"use client";

import { useEffect } from "react";
import { MediaUpload } from "@/components/player/media-upload";
import { PlayerPreview } from "@/components/player/player-preview";
import { usePlayerStore } from "@/stores/player-store";
import { usePlaybackStore } from "@/stores/playback-store";

export default function PlayerPage() {
  const { videoFile, clearAll } = usePlayerStore();
  const { pause, seek } = usePlaybackStore();

  useEffect(() => {
    return () => {
      pause();
      seek(0);
      clearAll();
    };
  }, [pause, seek, clearAll]);

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Video Player</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a video and SRT file to play with subtitles
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 p-6">
        {videoFile ? (
          <div className="h-full flex flex-col gap-6">
            <PlayerPreview />
            <div className="max-w-2xl mx-auto w-full">
              <MediaUpload />
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="max-w-2xl w-full">
              <MediaUpload />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}