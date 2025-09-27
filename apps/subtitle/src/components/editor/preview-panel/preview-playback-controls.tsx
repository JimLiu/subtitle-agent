import type { FC } from "react";

interface PreviewPlaybackControlsProps {
  playing: boolean;
  buffering: boolean;
  currentTimestamp: number;
  duration: number;
  onTogglePlayback(): void;
  onReset(): void;
}

const formatTimestamp = (seconds: number): string => {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  const centiseconds = Math.min(99, Math.max(0, Math.floor((seconds - wholeSeconds) * 100)));
  const paddedSeconds = remainingSeconds.toString().padStart(2, "0");
  const paddedCentiseconds = centiseconds.toString().padStart(2, "0");
  return `${minutes}:${paddedSeconds}.${paddedCentiseconds}`;
};

export const PreviewPlaybackControls: FC<PreviewPlaybackControlsProps> = ({
  playing,
  buffering,
  currentTimestamp,
  duration,
  onTogglePlayback,
  onReset,
}) => {
  return (
    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-md px-3 py-2 text-sm backdrop-blur">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePlayback}
          className="rounded bg-white/20 px-3 py-1 text-xs font-medium uppercase tracking-wide hover:bg-white/30"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
        >
          Reset
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="tabular-nums">{formatTimestamp(currentTimestamp)}</span>
          <span className="text-white/50">/</span>
          <span className="tabular-nums">{formatTimestamp(duration)}</span>
          {buffering ? <span className="text-xs text-white/70">Buffering…</span> : null}
        </div>
      </div>
    </div>
  );
};
