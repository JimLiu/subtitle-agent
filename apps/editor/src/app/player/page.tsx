"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { PreviewPanel } from "@/components/editor/preview-panel";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/project-store";
import { useMediaStore } from "@/stores/media-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { usePlaybackStore } from "@/stores/playback-store";
import { processMediaFiles } from "@/lib/media-processing";
import { readSRTFile, srtToTextElements } from "@/lib/srt-parser";
import { generateId } from "@/lib/ids";
import { toast } from "sonner";
import { Upload, FileVideo, FileText, X } from "lucide-react";

export default function PlayerPage() {
  const router = useRouter();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [projectCreated, setProjectCreated] = useState(false);
  
  const { createNewProject, activeProject } = useProjectStore();
  const { addMediaFile } = useMediaStore();
  const { addElementAtTime, clearTimeline } = useTimelineStore();
  const { setCurrentTime, pause } = usePlaybackStore();

  const onDropVideo = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && file.type.startsWith("video/")) {
      setVideoFile(file);
    } else {
      toast.error("Please upload a valid video file");
    }
  }, []);

  const onDropSRT = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && (file.name.endsWith(".srt") || file.type === "text/plain")) {
      setSrtFile(file);
    } else {
      toast.error("Please upload a valid SRT file");
    }
  }, []);

  const {
    getRootProps: getVideoRootProps,
    getInputProps: getVideoInputProps,
    isDragActive: isVideoDragActive,
  } = useDropzone({
    onDrop: onDropVideo,
    accept: {
      "video/*": [".mp4", ".webm", ".mov", ".avi"],
    },
    maxFiles: 1,
  });

  const {
    getRootProps: getSRTRootProps,
    getInputProps: getSRTInputProps,
    isDragActive: isSRTDragActive,
  } = useDropzone({
    onDrop: onDropSRT,
    accept: {
      "text/plain": [".srt"],
      "application/x-subrip": [".srt"],
    },
    maxFiles: 1,
  });

  const handleCreatePlayer = async () => {
    if (!videoFile || !srtFile) {
      toast.error("Please upload both video and SRT files");
      return;
    }

    setIsLoading(true);
    try {
      clearTimeline();
      
      const projectId = await createNewProject("Player Project");
      
      const processedMedia = await processMediaFiles([videoFile]);
      if (processedMedia.length === 0) {
        throw new Error("Failed to process video file");
      }

      const mediaItem = {
        ...processedMedia[0],
        id: generateId(),
      };
      await addMediaFile(projectId, mediaItem);

      // Add video to timeline using addElementAtTime
      addElementAtTime(mediaItem, 0);

      // Parse SRT and add subtitles to timeline
      const srtEntries = await readSRTFile(srtFile);
      const textElements = srtToTextElements(srtEntries);
      
      // Add each subtitle element at its start time
      textElements.forEach((element) => {
        addElementAtTime(element, element.startTime);
      });

      setCurrentTime(0);
      pause();
      setProjectCreated(true);
      
      toast.success("Player ready! You can now play your video with subtitles.");
    } catch (error) {
      console.error("Failed to create player:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create player");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setVideoFile(null);
    setSrtFile(null);
    setProjectCreated(false);
    clearTimeline();
    pause();
    setCurrentTime(0);
  };

  useEffect(() => {
    return () => {
      pause();
    };
  }, [pause]);

  if (projectCreated && activeProject) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Video Player</h1>
            <Button onClick={handleReset} variant="outline">
              Upload New Files
            </Button>
          </div>
          <div className="w-full h-[80vh]">
            <PreviewPanel />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Video Player with Subtitles</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <h2 className="text-lg font-semibold mb-3">Upload Video</h2>
              <div
                {...getVideoRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${isVideoDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}
                  ${videoFile ? "bg-muted" : ""}`}
              >
                <input {...getVideoInputProps()} />
                {videoFile ? (
                  <div className="space-y-2">
                    <FileVideo className="w-12 h-12 mx-auto text-primary" />
                    <p className="text-sm font-medium">{videoFile.name}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVideoFile(null);
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {isVideoDragActive
                        ? "Drop the video here"
                        : "Drag & drop a video file here, or click to select"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supports MP4, WebM, MOV, AVI
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-3">Upload Subtitles (SRT)</h2>
              <div
                {...getSRTRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${isSRTDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}
                  ${srtFile ? "bg-muted" : ""}`}
              >
                <input {...getSRTInputProps()} />
                {srtFile ? (
                  <div className="space-y-2">
                    <FileText className="w-12 h-12 mx-auto text-primary" />
                    <p className="text-sm font-medium">{srtFile.name}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSrtFile(null);
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {isSRTDragActive
                        ? "Drop the SRT file here"
                        : "Drag & drop an SRT file here, or click to select"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      SRT subtitle format
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={handleCreatePlayer}
              disabled={!videoFile || !srtFile || isLoading}
            >
              {isLoading ? "Creating Player..." : "Create Player"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}