import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Scissors, Merge, Pencil, Plus } from "lucide-react";
import { ZoomIn, ZoomOut, Music, Film, Layers } from "lucide-react";
import type { Section, Track, Clip } from "@/types";
import { SECTION_COLORS } from "@/types";

const SUPABASE_STORAGE_BASE = "https://bznswadiiqulyzpkajqp.supabase.co/storage/v1/object/public/media/";

// ── Filmstrip thumbnail component ──
// Extracts multiple frames from a video and displays them as a seamless strip
const THUMB_WIDTH = 64; // px per thumbnail cell

function ClipFilmstrip({ url, clipDuration }: { url: string; clipDuration: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [containerW, setContainerW] = useState(0);

  // Observe container width so we know how many frames to extract
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerW(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    setContainerW(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // Extract frames when container width or URL changes
  useEffect(() => {
    if (!url || containerW < 10 || clipDuration <= 0) return;

    const frameCount = Math.max(1, Math.min(12, Math.ceil(containerW / THUMB_WIDTH)));
    let cancelled = false;

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cellW = Math.ceil(containerW / frameCount);
    const cellH = 48; // match track row height
    canvas.width = cellW;
    canvas.height = cellH;

    const extractedFrames: string[] = [];

    const extractFrame = (index: number) => {
      if (cancelled || index >= frameCount) {
        if (!cancelled) setFrames([...extractedFrames]);
        video.remove();
        return;
      }
      const seekTime = (clipDuration * (index + 0.5)) / frameCount;
      video.currentTime = Math.min(seekTime, clipDuration - 0.05);
    };

    video.onseeked = () => {
      if (cancelled) return;
      ctx.drawImage(video, 0, 0, cellW, cellH);
      extractedFrames.push(canvas.toDataURL("image/jpeg", 0.6));
      extractFrame(extractedFrames.length);
    };

    video.onloadedmetadata = () => {
      if (cancelled) return;
      extractFrame(0);
    };

    video.onerror = () => {
      // Fallback: show solid color
      if (!cancelled) setFrames([]);
      video.remove();
    };

    video.src = url;

    return () => {
      cancelled = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [url, containerW, clipDuration]);

  return (
    <div ref={containerRef} className="absolute inset-0 flex overflow-hidden">
      {frames.length > 0
        ? frames.map((dataUrl, i) => (
            <img
              key={i}
              src={dataUrl}
              alt=""
              className="h-full object-cover flex-1 min-w-0"
              draggable={false}
            />
          ))
        : /* Placeholder while extracting */
          <div className="w-full h-full bg-card animate-pulse" />
      }
    </div>
  );
}

interface TimelineProps {
  clips: Clip[];
  sections: Section[];
  tracks: Track[];
  currentTime: number;
  totalDuration: number;
  onSeek: (time: number) => void;
  selectedSectionId: string | null;
  onSelectSection: (id: string) => void;
  onSplitAtTime?: (time: number) => void;
  onMerge?: (sectionId: string, direction: "prev" | "next") => void;
  onGenerateMusic?: (sectionId: string) => void;
  onRegenerateMusic?: (sectionId: string, feedback: string) => void;
  onStagedFileDrop?: (stagedIndex: number, insertAtTime: number) => void;
  onClipReAdd?: (clipId: string, insertAtTime: number) => void;
}

// Drop zone between sections — accepts staged files AND existing clips from gallery
function SectionDropZone({
  leftPct,
  onStagedDrop,
  onClipDrop,
}: {
  leftPct: number;
  onStagedDrop: (stagedIndex: number) => void;
  onClipDrop: (clipId: string) => void;
}) {
  const [active, setActive] = useState(false);

  const isMediaDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("application/x-staged-index") ||
    e.dataTransfer.types.includes("application/x-clip-id");

  return (
    <div
      className={`absolute top-0 bottom-0 z-20 flex items-center justify-center transition-all ${
        active ? "w-8 bg-primary/20 border-x-2 border-dashed border-primary" : "w-4"
      }`}
      style={{ left: `${leftPct}%`, transform: "translateX(-50%)" }}
      onDragOver={(e) => {
        if (isMediaDrag(e)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setActive(true);
        }
      }}
      onDragEnter={(e) => {
        if (isMediaDrag(e)) {
          e.preventDefault();
          setActive(true);
        }
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        const stagedIdx = e.dataTransfer.getData("application/x-staged-index");
        if (stagedIdx) {
          onStagedDrop(parseInt(stagedIdx, 10));
          return;
        }
        const clipId = e.dataTransfer.getData("application/x-clip-id");
        if (clipId) onClipDrop(clipId);
      }}
    >
      {active && <Plus className="w-3 h-3 text-primary" />}
    </div>
  );
}

function TimeRuler({ totalDuration, zoom }: { totalDuration: number; zoom: number }) {
  const interval = zoom >= 1.5 ? 5 : zoom >= 1 ? 10 : 15;
  const markers = [];
  for (let t = 0; t <= totalDuration; t += interval) {
    markers.push(t);
  }
  return (
    <div className="relative h-5 border-b border-border" style={{ width: `${zoom * 100}%` }}>
      {markers.map((t) => (
        <div
          key={t}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: `${(t / totalDuration) * 100}%` }}
        >
          <div className="w-px h-2 bg-muted-foreground/30" />
          <span className="text-[8px] font-mono text-muted-foreground mt-0.5">
            {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, "0")}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrackLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="w-16 shrink-0 flex flex-col items-center justify-center px-1 border-r border-border h-full bg-card/30">
      <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="text-[8px] text-muted-foreground font-medium truncate leading-tight mt-0.5">
        {label}
      </span>
    </div>
  );
}

function WaveformBars() {
  return (
    <div className="flex items-center justify-center gap-[3px] h-full w-full">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-full bg-primary/50"
          initial={{ height: "20%" }}
          animate={{ height: ["20%", "70%", "40%", "90%", "20%"] }}
          transition={{
            duration: 0.8 + i * 0.15,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  );
}

function MusicSegment({
  section,
  idx,
  track,
  widthPct,
  onGenerate,
  onRegenerate,
}: {
  section: Section;
  idx: number;
  track: Track | undefined;
  widthPct: number;
  onGenerate?: () => void;
  onRegenerate?: (feedback: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number; width: number } | null>(null);

  const hasTrack = !!track?.stream_url;
  const color = SECTION_COLORS[section.section_type] || "hsl(var(--primary))";

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        const portal = document.getElementById(`music-panel-${section.id}`);
        if (portal && portal.contains(e.target as Node)) return;
        setOpen(false);
        setPromptText("");
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, section.id]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPanelPos({ x: rect.left, y: rect.top, width: rect.width });
    }
    if (open) setPromptText("");
    setOpen(!open);
  };

  const handlePromptSubmit = () => {
    const trimmed = promptText.trim().slice(0, 200);
    if (trimmed) {
      onRegenerate?.(trimmed);
      setOpen(false);
      setPromptText("");
    }
  };

  return (
    <div ref={ref} className="relative" style={{ width: `${widthPct}%`, height: "100%" }}>
      <motion.button
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 + idx * 0.06 }}
        onClick={handleToggle}
        className="w-full h-full flex items-center justify-center gap-1 border-r border-border/30 cursor-pointer hover:bg-card/80 transition-colors"
        style={{
          backgroundColor: hasTrack
            ? `${color}18`
            : section.music_status === "GENERATING"
            ? "hsl(var(--primary) / 0.08)"
            : "transparent",
        }}
      >
        {hasTrack ? (
          <WaveformBars />
        ) : section.music_status === "GENERATING" ? (
          <span className="text-[8px] text-primary music-pulse">Generating...</span>
        ) : section.music_status === "FAILED" ? (
          <span className="text-[8px] text-destructive/70">Failed</span>
        ) : (
          <Music className="w-2.5 h-2.5 text-muted-foreground/20" />
        )}
      </motion.button>

      {open && panelPos && ReactDOM.createPortal(
        <AnimatePresence>
          <motion.div
            id={`music-panel-${section.id}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="fixed bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden origin-bottom"
            style={{
              left: panelPos.x,
              bottom: window.innerHeight - panelPos.y + 4,
              width: Math.max(panelPos.width, 180),
              maxHeight: panelPos.y - 8,
            }}
          >
            <div className="px-3 pt-2.5 pb-1">
              <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">
                {section.music_status === "READY" ? "Music ready" : section.music_status === "GENERATING" ? "Generating..." : "No music yet"}
              </span>
            </div>

            {section.music_status === "PENDING" && (
              <button
                onClick={() => { onGenerate?.(); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[9px] font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                Generate music
              </button>
            )}

            {section.music_status === "READY" && (
              <>
                <button
                  onClick={() => { onGenerate?.(); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-[9px] font-medium text-foreground hover:bg-primary/10 transition-colors"
                >
                  Regenerate same style
                </button>
                <button
                  onClick={() => {
                    const current = section.suggested_music_style || "";
                    const alternatives: Record<string, string> = {
                      "Upbeat Electronic": "Acoustic Folk with light percussion",
                      "Lofi Hip-Hop": "Ambient Piano with soft pads",
                      "Cinematic Orchestral": "Minimal Synth with atmospheric textures",
                      "Pop Rock": "Jazz Fusion with smooth guitar",
                      "Ambient": "Rhythmic World Music",
                      "Acoustic": "Chill Electronic with warm synths",
                      "EDM": "Organic Percussion with live instruments",
                      "Hip-Hop Beats": "Indie Rock with driving rhythm",
                      "Quirky Indie": "Smooth Jazz with playful keys",
                      "Bouncy Pop": "Tropical House with steel drums",
                    };
                    const alt = alternatives[current] || `Calm, relaxed version of ${current || "current style"} with softer instrumentation`;
                    onRegenerate?.(alt);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-[9px] font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  Try: {(() => {
                    const current = section.suggested_music_style || "";
                    const alternatives: Record<string, string> = {
                      "Upbeat Electronic": "Acoustic Folk",
                      "Lofi Hip-Hop": "Ambient Piano",
                      "Cinematic Orchestral": "Minimal Synth",
                      "Pop Rock": "Jazz Fusion",
                      "Ambient": "World Music",
                      "Acoustic": "Chill Electronic",
                      "EDM": "Organic Percussion",
                      "Hip-Hop Beats": "Indie Rock",
                      "Quirky Indie": "Smooth Jazz",
                      "Bouncy Pop": "Tropical House",
                    };
                    return alternatives[current] || `Calm ${current || "style"}`;
                  })()}
                </button>
              </>
            )}

            <div className="h-px bg-border mx-2 my-1" />
            <div className="px-3 pb-2.5 pt-1 flex flex-col gap-1.5">
              <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Pencil className="w-2 h-2" />
                Custom prompt
              </span>
              <div className="flex gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value.slice(0, 200))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handlePromptSubmit();
                    if (e.key === "Escape") { setOpen(false); setPromptText(""); }
                  }}
                  placeholder="e.g. more upbeat, less bass..."
                  className="flex-1 min-w-0 bg-background border border-border rounded-md px-2 py-1 text-[9px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  maxLength={200}
                />
                <button
                  onClick={handlePromptSubmit}
                  disabled={!promptText.trim()}
                  className="shrink-0 px-2 py-1 rounded-md text-[9px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground/30 disabled:cursor-not-allowed transition-colors"
                >
                  Go
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

function MergeZone({ leftPct, onMerge }: { leftPct: number; onMerge: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="absolute top-0 bottom-0 z-20 flex items-center justify-center"
      style={{ left: `${leftPct}%`, width: "24px", transform: "translateX(-50%)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <AnimatePresence>
        {hovered && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.12 }}
            className="w-5 h-5 rounded-full flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: "hsl(142 70% 45% / 0.4)", border: "1.5px solid hsl(142 70% 45% / 0.6)" }}
            onClick={(e) => { e.stopPropagation(); onMerge(); }}
          >
            <Merge className="w-3 h-3 text-white rotate-90" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  sectionId: string;
  splitTime: number;
}

function SectionContextMenu({
  menu,
  onClose,
  onSplit,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onSplit: (time: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const timeLabel = `${Math.floor(menu.splitTime / 60)}:${String(Math.floor(menu.splitTime % 60)).padStart(2, "0")}`;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.1 }}
      className="fixed bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden min-w-[140px]"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        onClick={() => { onSplit(menu.splitTime); onClose(); }}
        className="w-full text-left px-3 py-2 text-[10px] font-medium text-foreground hover:bg-secondary transition-colors flex items-center gap-2"
      >
        <Scissors className="w-3 h-3" />
        Split here ({timeLabel})
      </button>
    </motion.div>
  );
}

export default function Timeline({
  clips,
  sections,
  tracks,
  currentTime,
  totalDuration,
  onSeek,
  selectedSectionId,
  onSelectSection,
  onSplitAtTime,
  onMerge,
  onGenerateMusic,
  onRegenerateMusic,
  onStagedFileDrop,
  onClipReAdd,
}: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [playheadHovered, setPlayheadHovered] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);

  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.section_order - b.section_order),
    [sections]
  );

  const playheadPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // Build clip filmstrip URLs
  const clipFilmstrip = useMemo(() => {
    return clips.map((clip) =>
      clip.storage_path ? `${SUPABASE_STORAGE_BASE}${clip.storage_path}` : null
    );
  }, [clips]);

  // Build derived clip positions for filmstrip
  const clipPositions = useMemo(() => {
    if (totalDuration <= 0) return [];
    let cursor = 0;
    return clips.map((clip) => {
      const start = cursor;
      cursor += clip.duration;
      return { startPct: (start / totalDuration) * 100, widthPct: (clip.duration / totalDuration) * 100 };
    });
  }, [clips, totalDuration]);

  // Click on track area to seek — computes time from click position accounting for zoom
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const trackWidth = rect.width;
    const time = (clickX / trackWidth) * totalDuration;
    onSeek(Math.max(0, Math.min(time, totalDuration)));
  };

  // Right-click to open context menu with split
  const handleContextMenu = (e: React.MouseEvent, sectionId: string) => {
    e.preventDefault();
    onSelectSection(sectionId);
    // Calculate the split time from the click position
    const trackEl = e.currentTarget.closest("[data-track-content]") as HTMLElement | null;
    let splitTime = currentTime;
    if (trackEl) {
      const rect = trackEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      splitTime = (clickX / rect.width) * totalDuration;
    }
    setContextMenu({ x: e.clientX, y: e.clientY, sectionId, splitTime });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className="bg-background border-t border-border flex flex-col relative"
      style={{ height: "220px" }}
    >
      {/* Time ruler with playhead timecode */}
      <div className="flex relative">
        <div className="w-16 shrink-0 border-r border-border" />
        <div className="flex-1 relative overflow-x-auto" ref={scrollContainerRef}>
          <TimeRuler totalDuration={totalDuration} zoom={zoom} />
          {/* Playhead timecode — vertically centered in ruler */}
          <div
            className="absolute top-0 bottom-0 flex items-center pointer-events-none z-30"
            style={{ left: `${playheadPct * zoom}%`, transform: "translateX(-50%)" }}
          >
            <span className="bg-foreground/80 text-background text-[8px] font-mono font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap">
              {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}:{String(Math.floor((currentTime % 1) * 30)).padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>

      {/* Tracks area */}
      <div className="flex-1 overflow-x-auto overflow-y-auto" ref={tracksContainerRef}>
        {/* Video Track */}
        <div className="flex h-12 border-b border-border">
          <TrackLabel icon={Film} label="V1" />
          <div className="flex-1 relative overflow-hidden" style={{ minWidth: `${zoom * 100}%` }} data-track-content>
            <div className="playhead" style={{ left: `${playheadPct}%` }} />
            <div className="flex h-full cursor-pointer" onClick={handleTrackClick}>
              {clips.length > 0 ? (
                clips.map((clip, i) => {
                  const pos = clipPositions[i];
                  const url = clipFilmstrip[i];
                  return (
                    <div
                      key={clip.id}
                      className="h-full bg-card relative overflow-hidden"
                      style={{
                        width: pos ? `${pos.widthPct}%` : undefined,
                        flex: pos ? undefined : 1,
                        borderRight: i < clips.length - 1 ? "1px solid hsl(0 0% 0% / 0.3)" : undefined,
                      }}
                    >
                      {url && <ClipFilmstrip url={url} clipDuration={clip.duration} />}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent h-5 flex items-end z-10">
                        <span className="text-[7px] font-mono text-white/70 px-1 pb-0.5 truncate">{clip.filename}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 h-full bg-card animate-pulse"
                    style={{ borderRight: i < 9 ? "1px solid hsl(0 0% 0% / 0.3)" : undefined }}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sections Track */}
        <div className="flex h-7 border-b border-border">
          <TrackLabel icon={Layers} label="Sections" />
          <div className="flex-1 relative" style={{ minWidth: `${zoom * 100}%` }} data-track-content>
            <div className="playhead" style={{ left: `${playheadPct}%` }} />
            <div className="flex h-full relative">
              {sortedSections.map((section, idx) => {
                const widthPct = totalDuration > 0 ? ((section.end_time - section.start_time) / totalDuration) * 100 : 0;
                const color = SECTION_COLORS[section.section_type] || "hsl(var(--primary))";
                return (
                  <motion.button
                    key={section.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 + idx * 0.06 }}
                    onClick={() => onSelectSection(section.id)}
                    onContextMenu={(e) => handleContextMenu(e, section.id)}
                    className={`h-full flex items-center px-2 cursor-pointer transition-all duration-150 ${
                      selectedSectionId === section.id ? "brightness-125" : "hover:brightness-110"
                    }`}
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: `color-mix(in srgb, ${color} 25%, hsl(0 0% 10%))`,
                      borderRight: idx < sortedSections.length - 1 ? "1px solid hsl(0 0% 0% / 0.4)" : undefined,
                    }}
                  >
                    <span className={`text-[8px] font-semibold truncate ${
                      selectedSectionId === section.id ? "text-foreground" : "text-foreground/70"
                    }`}>{section.section_type}</span>
                  </motion.button>
                );
              })}

              {/* Merge zones between sections */}
              {sortedSections.slice(0, -1).map((section, idx) => {
                const boundaryTime = sortedSections[idx + 1]?.start_time ?? 0;
                const leftPct = totalDuration > 0 ? (boundaryTime / totalDuration) * 100 : 0;
                return (
                  <MergeZone
                    key={`merge-${idx}`}
                    leftPct={leftPct}
                    onMerge={() => onMerge?.(sortedSections[idx + 1].id, "prev")}
                  />
                );
              })}

              {/* Drop zones for staged files / clip re-adds at section boundaries */}
              {(onStagedFileDrop || onClipReAdd) && (() => {
                const boundaries: { time: number; key: string }[] = [];
                if (sortedSections.length > 0) {
                  boundaries.push({ time: 0, key: "drop-start" });
                }
                for (let i = 0; i < sortedSections.length - 1; i++) {
                  boundaries.push({
                    time: sortedSections[i].end_time,
                    key: `drop-${i}`,
                  });
                }
                if (sortedSections.length > 0) {
                  boundaries.push({
                    time: sortedSections[sortedSections.length - 1].end_time,
                    key: "drop-end",
                  });
                }
                return boundaries.map(({ time, key }) => (
                  <SectionDropZone
                    key={key}
                    leftPct={totalDuration > 0 ? (time / totalDuration) * 100 : 0}
                    onStagedDrop={(stagedIndex) => onStagedFileDrop?.(stagedIndex, time)}
                    onClipDrop={(clipId) => onClipReAdd?.(clipId, time)}
                  />
                ));
              })()}

            </div>
          </div>
        </div>

        {/* Music Track A1 */}
        <div className="flex h-8 border-b border-border">
          <TrackLabel icon={Music} label="A1" />
          <div className="flex-1 relative" style={{ minWidth: `${zoom * 100}%` }}>
            <div className="playhead" style={{ left: `${playheadPct}%` }} />
            <div className="flex h-full">
              {sortedSections.map((section, idx) => {
                const widthPct = totalDuration > 0 ? ((section.end_time - section.start_time) / totalDuration) * 100 : 0;
                const track = tracks.find((t) => t.section_id === section.id && !t.is_discarded);
                return (
                  <MusicSegment
                    key={section.id}
                    section={section}
                    idx={idx}
                    track={track}
                    widthPct={widthPct}
                    onGenerate={() => onGenerateMusic?.(section.id)}
                    onRegenerate={(feedback) => onRegenerateMusic?.(section.id, feedback)}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Empty A2 track — with playhead + scissors */}
        <div className="flex h-8 border-b border-border">
          <TrackLabel icon={Music} label="A2" />
          <div className="flex-1 relative bg-background/50" style={{ minWidth: `${zoom * 100}%` }}>
            <div className="playhead" style={{ left: `${playheadPct}%` }} />

            {/* Scissors at playhead — bottom of audio rows */}
            <div
              className="absolute z-40 flex items-end justify-center"
              style={{
                left: `${playheadPct}%`,
                bottom: "-14px",
                transform: "translateX(-50%)",
                width: "28px",
                height: "28px",
              }}
              onMouseEnter={() => setPlayheadHovered(true)}
              onMouseLeave={() => setPlayheadHovered(false)}
            >
              <AnimatePresence>
                {playheadHovered && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.12 }}
                    onClick={() => onSplitAtTime?.(currentTime)}
                    className="w-6 h-6 rounded-md bg-primary/90 flex items-center justify-center shadow-md shadow-primary/30 hover:bg-primary transition-colors cursor-pointer"
                    title="Split at playhead"
                  >
                    <Scissors className="w-3 h-3 text-primary-foreground" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Floating zoom */}
      <div className="absolute bottom-2 right-3 z-20 flex items-center gap-1 bg-card/80 backdrop-blur-sm border border-border rounded-lg px-1.5 py-1">
        <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <ZoomOut className="w-3 h-3" />
        </button>
        <span className="text-[9px] text-muted-foreground min-w-[28px] text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <ZoomIn className="w-3 h-3" />
        </button>
      </div>

      {/* Right-click context menu — split only */}
      <AnimatePresence>
        {contextMenu && (
          <SectionContextMenu
            menu={contextMenu}
            onClose={() => setContextMenu(null)}
            onSplit={(time) => onSplitAtTime?.(time)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
