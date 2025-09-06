"use client";

import { useCallback, useState } from "react";
import { Upload, Video, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/components/player/player-store";

export function MediaUpload() {
  const { videoFile, subtitleTrack, setVideoFile, setSRTFile, clearAll, isLoading, error } = usePlayerStore();
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      
      for (const file of files) {
        if (file.type.startsWith("video/")) {
          await setVideoFile(file);
        } else if (file.name.endsWith(".srt")) {
          await setSRTFile(file);
        }
      }
    },
    [setVideoFile, setSRTFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, type: "video" | "srt") => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (type === "video") {
        await setVideoFile(file);
      } else {
        await setSRTFile(file);
      }
    },
    [setVideoFile, setSRTFile]
  );

  if (videoFile) {
    return (
      <div className="w-full p-6 bg-card rounded-lg border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Loaded Files</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="text-destructive hover:text-destructive"
          >
            <X className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
            <Video className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{videoFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {videoFile.duration ? `${Math.floor(videoFile.duration)}s` : ""} • {videoFile.width}x{videoFile.height}
              </p>
            </div>
          </div>

          {subtitleTrack ? (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
              <FileText className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Subtitles Loaded</p>
                <p className="text-xs text-muted-foreground">
                  {subtitleTrack.elements.length} subtitles
                </p>
              </div>
            </div>
          ) : (
            <div className="relative">
              <input
                type="file"
                accept=".srt"
                onChange={(e) => handleFileSelect(e, "srt")}
                className="hidden"
                id="srt-upload"
                disabled={isLoading}
              />
              <label
                htmlFor="srt-upload"
                className="flex items-center gap-3 p-3 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Add SRT subtitles (optional)
                </span>
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full p-12 border-2 border-dashed rounded-lg transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
        isLoading && "opacity-50 pointer-events-none"
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="flex flex-col items-center justify-center gap-4">
        <Upload className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="text-lg font-medium">Drop video and SRT files here</p>
          <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
        </div>

        <div className="flex gap-3">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => handleFileSelect(e, "video")}
            className="hidden"
            id="video-upload"
            disabled={isLoading}
          />
          <label htmlFor="video-upload">
            <Button variant="secondary" size="sm" asChild disabled={isLoading}>
              <span>
                <Video className="h-4 w-4 mr-2" />
                Choose Video
              </span>
            </Button>
          </label>

          <input
            type="file"
            accept=".srt"
            onChange={(e) => handleFileSelect(e, "srt")}
            className="hidden"
            id="srt-upload-main"
            disabled={isLoading}
          />
          <label htmlFor="srt-upload-main">
            <Button variant="outline" size="sm" asChild disabled={isLoading}>
              <span>
                <FileText className="h-4 w-4 mr-2" />
                Choose SRT
              </span>
            </Button>
          </label>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md max-w-md">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}