import { motion } from "framer-motion";
import { Play, Pause } from "lucide-react";
import type { RefObject } from "react";

interface VideoPreviewProps {
  videoARef: RefObject<HTMLVideoElement | null>;
  videoBRef: RefObject<HTMLVideoElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  displaySlot: number;
  localTime: number;
  totalDuration: number;
  isPlaying: boolean;
  videoError: string | null;
  onPlayPause: () => void;
  onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onEnded: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onSeeked: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onVideoError: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function log(tag: string, msg: string, data: Record<string, unknown> = {}) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`%c[${ts}] [VideoPreview] ${tag}`, "color: #45f5c5; font-weight: bold", msg, data);
}

export default function VideoPreview({
  videoARef,
  videoBRef,
  audioRef,
  displaySlot,
  localTime,
  totalDuration,
  isPlaying,
  videoError,
  onPlayPause,
  onTimeUpdate,
  onEnded,
  onLoadedMetadata,
  onSeeked,
  onVideoError,
}: VideoPreviewProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="flex-1 flex flex-col bg-background"
    >
      {/* Video area */}
      <div className="flex-1 flex items-center justify-center relative bg-card m-1 rounded-xl overflow-hidden group">
        {/* Dual video elements */}
        <video
          ref={videoARef}
          crossOrigin="anonymous"
          playsInline
          preload="auto"
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onLoadedMetadata={onLoadedMetadata}
          onSeeked={onSeeked}
          onError={onVideoError}
          onPlay={() => log("EVENT", "Video A: play", { currentTime: videoARef.current?.currentTime?.toFixed(2) })}
          onPause={() => log("EVENT", "Video A: pause")}
          onWaiting={() => log("EVENT", "Video A: waiting (buffering)")}
          onCanPlay={() => log("EVENT", "Video A: canplay", { readyState: videoARef.current?.readyState })}
          onStalled={() => log("EVENT", "Video A: stalled")}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ opacity: displaySlot === 0 ? 1 : 0, zIndex: displaySlot === 0 ? 1 : 0 }}
        />
        <video
          ref={videoBRef}
          crossOrigin="anonymous"
          playsInline
          preload="auto"
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onLoadedMetadata={onLoadedMetadata}
          onSeeked={onSeeked}
          onError={onVideoError}
          onPlay={() => log("EVENT", "Video B: play", { currentTime: videoBRef.current?.currentTime?.toFixed(2) })}
          onPause={() => log("EVENT", "Video B: pause")}
          onWaiting={() => log("EVENT", "Video B: waiting (buffering)")}
          onCanPlay={() => log("EVENT", "Video B: canplay", { readyState: videoBRef.current?.readyState })}
          onStalled={() => log("EVENT", "Video B: stalled")}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ opacity: displaySlot === 1 ? 1 : 0, zIndex: displaySlot === 1 ? 1 : 0 }}
        />

        {/* Hidden audio element for music tracks */}
        <audio ref={audioRef} crossOrigin="anonymous" className="hidden" />

        {/* Error banner */}
        {videoError && (
          <div className="absolute bottom-14 left-2 right-2 bg-destructive/90 text-destructive-foreground text-[11px] px-3 py-1.5 rounded-md z-20 font-mono">
            {videoError}
          </div>
        )}

        {/* Play/pause overlay */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={onPlayPause}
          className="w-14 h-14 rounded-full bg-primary/15 backdrop-blur-sm border border-primary/20 flex items-center justify-center z-10 group-hover:bg-primary/25 transition-all"
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 text-primary" />
          ) : (
            <Play className="w-6 h-6 text-primary ml-0.5" />
          )}
        </motion.button>
      </div>

      {/* Timecode bar */}
      <div className="flex items-center justify-center gap-2 py-1.5 border-t border-border">
        <span className="text-[11px] font-mono text-muted-foreground">
          {formatTime(localTime)}
        </span>
        <span className="text-[11px] text-muted-foreground">/</span>
        <span className="text-[11px] font-mono text-muted-foreground">
          {formatTime(totalDuration)}
        </span>
      </div>
    </motion.div>
  );
}
