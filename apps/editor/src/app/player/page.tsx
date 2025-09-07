"use client";

import { useState } from "react";
import { Upload, Play, FileVideo, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PreviewPanel } from "@/components/editor/preview-panel";
import { useProjectStore } from "@/stores/project-store";
import { useMediaStore } from "@/stores/media-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { processMediaFiles } from "@/lib/media-processing";
import { parseSrtFile, convertSubtitlesToTimelineElements } from "@/lib/srt-parser";
import { toast } from "sonner";

interface FileState {
  video: File | null;
  srt: File | null;
}

export default function PlayerPage() {
  const [files, setFiles] = useState<FileState>({ video: null, srt: null });
  const [isLoading, setIsLoading] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  
  const { createNewProject } = useProjectStore();
  const { addMediaFile } = useMediaStore();
  const { addElementAtTime, addTrack, addElementToTrack } = useTimelineStore();

  const handleFileSelect = (type: 'video' | 'srt', file: File) => {
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    
    droppedFiles.forEach(file => {
      const isVideo = file.type.startsWith('video/');
      const isSrt = file.name.endsWith('.srt') || file.type === 'application/x-subrip';
      
      if (isVideo && !files.video) {
        handleFileSelect('video', file);
      } else if (isSrt && !files.srt) {
        handleFileSelect('srt', file);
      }
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const loadPlayer = async () => {
    if (!files.video) {
      toast.error("Please select a video file");
      return;
    }

    setIsLoading(true);
    
    try {
      // Create new project
      const projectName = `Player - ${files.video.name}`;
      const projectId = await createNewProject(projectName);
      
      // Process and add video file
      const processedMedia = await processMediaFiles([files.video]);
      if (processedMedia.length > 0) {
        await addMediaFile(projectId, processedMedia[0]);
        // Get the added media item from the store
        const { mediaFiles } = useMediaStore.getState();
        const mediaItem = mediaFiles[mediaFiles.length - 1]; // Most recently added
        addElementAtTime(mediaItem, 0);
      }
      
      // Process SRT file if provided
      if (files.srt) {
        try {
          const parsedSubtitles = await parseSrtFile(files.srt);
          const timelineElements = convertSubtitlesToTimelineElements(parsedSubtitles);
          
          // Create text track and add elements
          const textTrackId = addTrack("text");
          timelineElements.forEach(element => {
            addElementToTrack(textTrackId, element);
          });
          
          toast.success(`Loaded ${timelineElements.length} subtitles`);
        } catch (error) {
          console.error("Failed to parse SRT:", error);
          toast.error("Failed to load subtitles");
        }
      }
      
      setPlayerReady(true);
      toast.success("Player loaded successfully");
      
    } catch (error) {
      console.error("Failed to load player:", error);
      toast.error("Failed to load player");
    } finally {
      setIsLoading(false);
    }
  };

  const resetPlayer = () => {
    setFiles({ video: null, srt: null });
    setPlayerReady(false);
  };

  if (playerReady) {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="text-xl font-semibold">Video Player</h1>
          <Button onClick={resetPlayer} variant="outline">
            Load New Video
          </Button>
        </div>
        <div className="flex-1">
          <PreviewPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Video Player with Subtitles</h1>
          <p className="text-muted-foreground">
            Upload a video file and optionally an SRT subtitle file to get started
          </p>
        </div>

        <div
          className="border-2 border-dashed border-border rounded-lg p-8 text-center transition-colors hover:border-primary/50"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg mb-2">Drag & drop your files here</p>
          <p className="text-sm text-muted-foreground">or click to select files individually</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileVideo className="h-5 w-5" />
              <h3 className="font-semibold">Video File</h3>
              <span className="text-sm font-normal text-red-500">*</span>
            </div>
            <div>
              {files.video ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{files.video.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(files.video.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFiles(prev => ({ ...prev, video: null }))}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect('video', file);
                    }}
                    className="hidden"
                    id="video-upload"
                  />
                  <label htmlFor="video-upload">
                    <Button variant="outline" asChild>
                      <span>Select Video File</span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5" />
              <h3 className="font-semibold">SRT File</h3>
              <span className="text-sm font-normal text-muted-foreground">(optional)</span>
            </div>
            <div>
              {files.srt ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{files.srt.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(files.srt.size / 1024).toFixed(2)} KB
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFiles(prev => ({ ...prev, srt: null }))}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    accept=".srt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect('srt', file);
                    }}
                    className="hidden"
                    id="srt-upload"
                  />
                  <label htmlFor="srt-upload">
                    <Button variant="outline" asChild>
                      <span>Select SRT File</span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="text-center">
          <Button
            onClick={loadPlayer}
            disabled={!files.video || isLoading}
            size="lg"
            className="px-8"
          >
            {isLoading ? (
              "Loading..."
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Load Player
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}