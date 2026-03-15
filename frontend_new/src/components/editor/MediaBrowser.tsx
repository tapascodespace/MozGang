import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { FolderOpen, Film, Upload, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import type { Clip, StagedFile } from "@/types";

interface MediaBrowserProps {
  clips: Clip[];
  stagedFiles: StagedFile[];
  onStageFiles: (files: StagedFile[]) => void;
}

const SUPABASE_STORAGE_BASE = "https://bznswadiiqulyzpkajqp.supabase.co/storage/v1/object/public/media/";
const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "\u2026" : str;
}

function getFileDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });
}

export default function MediaBrowser({ clips, stagedFiles, onStageFiles }: MediaBrowserProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  /** Stage files locally (no upload) */
  const stageFiles = useCallback(
    async (files: File[]) => {
      const videoFiles = files.filter((f) => ACCEPTED_TYPES.includes(f.type));
      if (videoFiles.length === 0) {
        toast.error("No supported video files (MP4, MOV, WebM)");
        return;
      }

      const oversized = videoFiles.find((f) => f.size > MAX_FILE_SIZE);
      if (oversized) {
        toast.error(`File too large: ${oversized.name} (max 50MB)`);
        return;
      }

      const durations = await Promise.all(videoFiles.map(getFileDuration));
      const staged: StagedFile[] = videoFiles.map((file, i) => ({
        file,
        objectUrl: URL.createObjectURL(file),
        duration: durations[i],
        name: file.name,
      }));

      onStageFiles(staged);
      toast.success(`${staged.length} clip${staged.length > 1 ? "s" : ""} added to media`);
    },
    [onStageFiles]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragOver(false);

      // Ignore clip drags (from within the app)
      if (e.dataTransfer.getData("application/x-clip-id") || e.dataTransfer.getData("application/x-staged-index")) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) stageFiles(files);
    },
    [stageFiles]
  );

  /** Drag start for uploaded clips */
  const handleClipDragStart = useCallback((e: React.DragEvent, clip: Clip) => {
    e.dataTransfer.setData("application/x-clip-id", clip.id);
    e.dataTransfer.setData("text/plain", clip.filename);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  /** Drag start for staged (not-yet-uploaded) files */
  const handleStagedDragStart = useCallback((e: React.DragEvent, index: number, staged: StagedFile) => {
    e.dataTransfer.setData("application/x-staged-index", String(index));
    e.dataTransfer.setData("text/plain", staged.name);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const totalCount = clips.length + stagedFiles.length;

  return (
    <motion.div
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={`w-56 bg-background border-r flex flex-col h-full transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border"
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Media</span>
        <span className="text-[9px] text-muted-foreground ml-auto">{totalCount} clip{totalCount !== 1 ? "s" : ""}</span>
      </div>

      {/* Clips grid */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0 relative">
        {/* Upload overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg pointer-events-none">
            <div className="flex flex-col items-center gap-1">
              <Upload className="w-6 h-6 text-primary" />
              <span className="text-xs font-medium text-primary">Drop to add clips</span>
            </div>
          </div>
        )}

        {totalCount === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full text-center px-4 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Film className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">Drop clips here or click to browse</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {/* Staged files first (not yet in timeline) */}
            {stagedFiles.map((staged, idx) => (
              <motion.div
                key={`staged-${idx}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 + idx * 0.03 }}
                className="group cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e) => handleStagedDragStart(e, idx, staged)}
              >
                <div className="aspect-video rounded-lg bg-card border-2 border-dashed border-primary/30 relative overflow-hidden group-hover:border-primary/60 transition-all">
                  <video
                    src={staged.objectUrl}
                    muted
                    preload="metadata"
                    className="w-full h-full object-cover pointer-events-none"
                    onLoadedMetadata={(e) => {
                      (e.target as HTMLVideoElement).currentTime = 0.01;
                    }}
                  />
                  <div className="absolute top-1 left-1 bg-primary/80 text-primary-foreground text-[7px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <CloudUpload className="w-2 h-2" />
                    Drag to timeline
                  </div>
                  <div className="absolute bottom-1 right-1 bg-background/80 text-[9px] text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                    {formatDuration(staged.duration)}
                  </div>
                </div>
                <p className="text-[10px] text-primary/70 mt-1 truncate px-0.5">
                  {truncate(staged.name, 20)}
                </p>
              </motion.div>
            ))}

            {/* Uploaded clips (already in timeline) */}
            {clips.map((clip, idx) => (
              <motion.div
                key={clip.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + idx * 0.05 }}
                className="group cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e) => handleClipDragStart(e, clip)}
              >
                <div className="aspect-video rounded-lg bg-card border border-border relative overflow-hidden group-hover:border-primary/30 transition-all">
                  {clip.thumbnail_url ? (
                    <img
                      src={clip.thumbnail_url}
                      alt={clip.filename}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : clip.storage_path ? (
                    <video
                      src={`${SUPABASE_STORAGE_BASE}${clip.storage_path}`}
                      muted
                      preload="metadata"
                      className="w-full h-full object-cover pointer-events-none"
                      onLoadedMetadata={(e) => {
                        (e.target as HTMLVideoElement).currentTime = 0.01;
                      }}
                    />
                  ) : (
                    <Film className="w-4 h-4 text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30" />
                  )}
                  <div className="absolute bottom-1 right-1 bg-background/80 text-[9px] text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                    {formatDuration(clip.duration)}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 truncate px-0.5">
                  {truncate(clip.filename, 20)}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden file input for click-to-browse */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) stageFiles(files);
          e.target.value = "";
        }}
      />

      {/* Add clips button at bottom */}
      <div className="px-2 py-2 border-t border-border">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
        >
          <Upload className="w-3 h-3" />
          Add Clips
        </button>
      </div>
    </motion.div>
  );
}
