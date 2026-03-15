import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, Upload } from "lucide-react";
import AmadeusLogo from "@/components/AmadeusLogo";
import { useClipUpload } from "@/hooks/useClipUpload";
import type { VideoClip } from "@/types";

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB (matches backend limit)

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

interface Props {
  onComplete: (projectId: string, clips: unknown[]) => void;
}

export default function UploadDropZone({ onComplete }: Props) {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFiles, isUploading } = useClipUpload();

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const validFiles: File[] = [];
      const newClips: VideoClip[] = [];

      Array.from(files).forEach((file) => {
        if (!ACCEPTED_TYPES.includes(file.type)) return;
        if (file.size > MAX_SIZE) return;
        validFiles.push(file);
        newClips.push({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          duration: 0,
          objectUrl: URL.createObjectURL(file),
          status: "uploading",
          progress: 0,
        });
      });

      if (newClips.length === 0) return;

      // Show clips in UI with simulated progress
      setClips((prev) => [...prev, ...newClips]);

      // Simulate visual progress while real upload happens
      newClips.forEach((clip) => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 25 + 10;
          if (progress >= 95) {
            progress = 95; // Hold at 95% until real upload completes
            clearInterval(interval);
          }
          setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, progress } : c)));
        }, 200);
      });

      // Real upload
      const result = await uploadFiles(validFiles);
      if (result) {
        // Mark all clips as ready
        setClips((prev) =>
          prev.map((c) => ({ ...c, progress: 100, status: "ready" as const }))
        );
        setTimeout(() => onComplete(result.projectId, result.clips), 400);
      } else {
        // Upload failed — mark clips as error
        setClips((prev) =>
          prev.map((c) =>
            newClips.some((nc) => nc.id === c.id) ? { ...c, status: "error" as const } : c
          )
        );
      }
    },
    [uploadFiles, onComplete]
  );

  const removeClip = useCallback((id: string) => {
    setClips((prev) => {
      const clip = prev.find((c) => c.id === id);
      if (clip) URL.revokeObjectURL(clip.objectUrl);
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (!isUploading) processFiles(e.dataTransfer.files);
    },
    [processFiles, isUploading]
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-8 py-6">
        <AmadeusLogo />
        <span className="text-lg font-bold tracking-tight text-foreground">amadeus</span>
      </header>

      {/* Drop Zone */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-12">
        <div
          className={`drop-zone-border w-full max-w-3xl min-h-[360px] flex flex-col items-center justify-center p-8 relative ${
            dragOver ? "drop-zone-active" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => clips.length === 0 && !isUploading && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,.mov,.webm"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && processFiles(e.target.files)}
          />

          {clips.length === 0 ? (
            <div className="flex flex-col items-center gap-4 cursor-pointer select-none">
              <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
                <Upload className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-foreground font-semibold text-lg">Drop your video clips here</p>
                <p className="text-muted-foreground text-sm mt-1">MP4, MOV, or WebM · up to 50 MB each</p>
              </div>
            </div>
          ) : (
            <div className="w-full">
              <div className="flex flex-wrap gap-4 justify-center">
                <AnimatePresence mode="popLayout">
                  {clips.map((clip, i) => (
                    <ClipCard key={clip.id} clip={clip} index={i} onRemove={removeClip} />
                  ))}
                </AnimatePresence>
              </div>
              {!isUploading && (
                <button
                  className="mt-6 mx-auto block text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                >
                  + Add more clips
                </button>
              )}
            </div>
          )}
        </div>

        {/* URL input — disabled placeholder */}
        <div className="mt-6 w-full max-w-3xl">
          <div className="relative group" title="Coming soon">
            <input
              disabled
              placeholder="Paste YouTube / TikTok URL"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-muted-foreground opacity-50 cursor-not-allowed"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground opacity-60">
              Coming soon
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClipCard({
  clip,
  index,
  onRemove,
}: {
  clip: VideoClip;
  index: number;
  onRemove: (id: string) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <motion.div
      layout
      initial={{ y: -200, opacity: 0 }}
      animate={{
        y: 0,
        opacity: 1,
        transition: { type: "spring", stiffness: 250, damping: 15, delay: index * 0.08 },
      }}
      exit={{ scale: 0, opacity: 0, filter: "blur(8px)", transition: { duration: 0.4 } }}
      className="w-44 bg-card border border-border rounded-xl overflow-hidden group relative"
    >
      <div className="relative aspect-video bg-secondary">
        <video
          ref={videoRef}
          src={clip.objectUrl}
          muted
          playsInline
          className="w-full h-full object-cover"
          onLoadedMetadata={() => {
            if (videoRef.current) videoRef.current.currentTime = 0.01;
          }}
          onEnded={() => setPlaying(false)}
        />
        {clip.status === "ready" && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {playing ? <Pause className="w-6 h-6 text-foreground" /> : <Play className="w-6 h-6 text-foreground" />}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(clip.id);
          }}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-background/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
        >
          <X className="w-3.5 h-3.5 text-foreground" />
        </button>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs text-foreground truncate">{truncate(clip.name, 30)}</p>
        {clip.status === "uploading" && (
          <div className="mt-1.5 h-1 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${clip.progress}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
