"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { usePlaybackStore } from "@/stores/playback-store";
import { formatTimeCode } from "@/lib/time";
import { EditableTimecode } from "@/components/editable-timecode";
import { DEFAULT_FPS } from "@/stores/project-store";
import { renderTimelineFrame } from "@/lib/timeline-renderer";
import { TimelineTrack } from "@/types/timeline";

export function PlayerPreview() {
  const { videoFile, subtitleTrack } = usePlayerStore();
  const { 
    isPlaying, 
    currentTime, 
    volume,
    muted,
    toggle, 
    seek, 
    setDuration,
    setVolume,
    toggleMute
  } = usePlaybackStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewDimensions, setPreviewDimensions] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const duration = videoFile?.duration || 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    if (videoFile?.duration) {
      setDuration(videoFile.duration);
    }
  }, [videoFile?.duration, setDuration]);

  useEffect(() => {
    const updatePreviewSize = () => {
      if (!containerRef.current || !videoFile) return;

      const container = containerRef.current.getBoundingClientRect();
      const padding = 32;
      const controlsHeight = 100;
      
      const availableWidth = container.width - padding * 2;
      const availableHeight = container.height - controlsHeight - padding * 2;
      
      const videoAspectRatio = (videoFile.width || 16) / (videoFile.height || 9);
      const containerAspectRatio = availableWidth / availableHeight;
      
      let width, height;
      
      if (containerAspectRatio > videoAspectRatio) {
        height = availableHeight;
        width = height * videoAspectRatio;
      } else {
        width = availableWidth;
        height = width / videoAspectRatio;
      }
      
      setPreviewDimensions({ width, height });
    };

    updatePreviewSize();
    window.addEventListener("resize", updatePreviewSize);
    return () => window.removeEventListener("resize", updatePreviewSize);
  }, [videoFile]);

  useEffect(() => {
    if (!videoRef.current || !videoFile) return;

    const video = videoRef.current;
    video.volume = muted ? 0 : volume;

    const handlePlaybackUpdate = (e: CustomEvent) => {
      if (!video.paused && Math.abs(video.currentTime - e.detail.time) > 0.1) {
        video.currentTime = e.detail.time;
      }
    };

    const handlePlaybackSeek = (e: CustomEvent) => {
      video.currentTime = e.detail.time;
    };

    window.addEventListener("playback-update", handlePlaybackUpdate as EventListener);
    window.addEventListener("playback-seek", handlePlaybackSeek as EventListener);

    if (isPlaying && video.paused) {
      video.play().catch(console.error);
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }

    return () => {
      window.removeEventListener("playback-update", handlePlaybackUpdate as EventListener);
      window.removeEventListener("playback-seek", handlePlaybackSeek as EventListener);
    };
  }, [videoFile, isPlaying, currentTime, volume, muted]);

  useEffect(() => {
    const draw = async () => {
      const canvas = canvasRef.current;
      if (!canvas || !subtitleTrack) return;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (canvas.width !== previewDimensions.width || canvas.height !== previewDimensions.height) {
        canvas.width = previewDimensions.width;
        canvas.height = previewDimensions.height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const tracks: TimelineTrack[] = [subtitleTrack];
      
      await renderTimelineFrame({
        ctx,
        time: currentTime,
        canvasWidth: previewDimensions.width,
        canvasHeight: previewDimensions.height,
        tracks,
        mediaFiles: [],
        backgroundColor: "transparent",
        projectCanvasSize: {
          width: videoFile?.width || 1920,
          height: videoFile?.height || 1080,
        },
      });
    };

    void draw();
  }, [currentTime, subtitleTrack, previewDimensions, videoFile]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    seek(newTime);
  }, [duration, seek]);

  const handleTimelineDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dragX = moveEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, dragX / rect.width));
      const newTime = percentage * duration;
      seek(newTime);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    handleMouseMove(e.nativeEvent);
  }, [duration, seek]);

  const skipBackward = useCallback(() => {
    seek(Math.max(0, currentTime - 5));
  }, [currentTime, seek]);

  const skipForward = useCallback(() => {
    seek(Math.min(duration, currentTime + 5));
  }, [currentTime, duration, seek]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  }, [setVolume]);

  if (!videoFile) return null;

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-black rounded-lg">
      <div className="flex-1 flex items-center justify-center relative">
        <div
          className="relative"
          style={{
            width: previewDimensions.width,
            height: previewDimensions.height,
          }}
        >
          <video
            ref={videoRef}
            src={videoFile.url}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: "contain" }}
          />
          
          {subtitleTrack && (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ zIndex: 10 }}
            />
          )}
        </div>
      </div>

      <div className="p-4 bg-background/95 backdrop-blur border-t">
        <div className="flex items-center gap-3 mb-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={skipBackward}
            className="h-8 w-8"
            title="Skip backward 5s"
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-10 w-10"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={skipForward}
            className="h-8 w-8"
            title="Skip forward 5s"
          >
            <SkipForward className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="h-8 w-8"
            >
              {muted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-muted rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, hsl(var(--primary)) ${(muted ? 0 : volume) * 100}%, hsl(var(--muted)) ${(muted ? 0 : volume) * 100}%)`,
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
            <EditableTimecode
              time={currentTime}
              duration={duration}
              format="HH:MM:SS"
              fps={DEFAULT_FPS}
              onTimeChange={seek}
              disabled={!duration}
              className="text-foreground hover:bg-muted"
            />
            <span className="opacity-50">/</span>
            <span>{formatTimeCode(duration, "HH:MM:SS", DEFAULT_FPS)}</span>
          </div>

          <div
            className={cn(
              "relative h-1.5 rounded-full cursor-pointer flex-1 bg-muted",
              !duration && "opacity-50 cursor-not-allowed"
            )}
            onClick={duration ? handleTimelineClick : undefined}
            onMouseDown={duration ? handleTimelineDrag : undefined}
          >
            <div
              className={cn(
                "absolute top-0 left-0 h-full rounded-full bg-primary",
                !isDragging && "transition-all duration-100"
              )}
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 w-3 h-3 rounded-full -translate-y-1/2 -translate-x-1/2 bg-primary shadow-sm"
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}