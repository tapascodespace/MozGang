import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { HelpCircle, Download, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import AmadeusLogo from "@/components/AmadeusLogo";
import type { Project } from "@/types";

interface TopBarProps {
  project: Project | null;
  hasReadyTracks?: boolean;
  isPlaying?: boolean;
  onPlayPause?: () => void;
  onSkipNext?: () => void;
  onSkipPrev?: () => void;
  onExport?: () => void;
  videoVolume: number;
  onVideoVolumeChange: (v: number) => void;
  onUpdateBrief?: (field: string, value: string) => void;
}

const WORKFLOW_STEPS = [
  { step: 1, title: "Import your video", desc: "Drag & drop or browse media to add your footage to the timeline." },
  { step: 2, title: "Review sections", desc: "Amadeus auto-detects sections. Adjust types, tones, and energy in the right panel." },
  { step: 3, title: "Choose music", desc: "Click on the A1 track to pick AI-generated music for each section." },
  { step: 4, title: "Fine-tune", desc: "Use the audio mixer to balance original audio and music levels." },
  { step: 5, title: "Split & merge", desc: "Right-click sections to split. Hover section boundaries to merge." },
  { step: 6, title: "Export", desc: "When tracks are ready, hit Export to render your final video with music." },
];

interface BriefCardDef {
  label: string;
  subtitle: string;
  field: string;
}

function EditableBriefCard({
  card,
  onSave,
}: {
  card: BriefCardDef;
  onSave: (field: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.label);

  const handleSave = () => {
    if (draft.trim() && draft !== card.label) {
      onSave(card.field, draft.trim());
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(card.label);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="relative px-2 py-1 flex items-center gap-1 min-w-[100px]">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          className="w-20 bg-background border border-primary/50 rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
        />
        <button onClick={handleSave} className="p-0.5 text-primary hover:text-foreground transition-colors">
          <Check className="w-3 h-3" />
        </button>
        <button onClick={handleCancel} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        setDraft(card.label === "—" ? "" : card.label);
        setEditing(true);
      }}
      className="relative px-4 py-1.5 flex flex-col items-center min-w-[100px] group hover:bg-secondary/50 transition-colors cursor-pointer"
    >
      <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">{card.label}</span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-widest">{card.subtitle}</span>
      <Pencil className="w-2.5 h-2.5 text-muted-foreground absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

export default function TopBar({
  project,
  hasReadyTracks = false,
  isPlaying = false,
  onPlayPause,
  onSkipNext,
  onSkipPrev,
  onExport,
  videoVolume,
  onVideoVolumeChange,
  onUpdateBrief,
}: TopBarProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shouldPulse, setShouldPulse] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("amadeus_help_clicked")) {
      setShouldPulse(true);
    }
  }, []);

  const handleHelpClick = () => {
    setHelpOpen(true);
    if (shouldPulse) {
      setShouldPulse(false);
      localStorage.setItem("amadeus_help_clicked", "1");
    }
  };

  const briefCards: BriefCardDef[] = [
    { label: project?.overall_energy || "—", subtitle: "YOUR ENERGY", field: "overall_energy" },
    { label: project?.confirmed_music_style || project?.recommended_music_style || "—", subtitle: "YOUR STYLE", field: "music_style_direction" },
    { label: project?.references_text || "—", subtitle: "INSPIRATION", field: "references_text" },
  ];

  return (
    <>
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="h-14 border-b border-border bg-background/80 backdrop-blur-md flex items-center px-4 z-50 relative"
      >
        {/* Left: Logo */}
        <div className="flex items-center gap-2.5 shrink-0 w-48">
          <AmadeusLogo />
          <span className="font-display text-xl text-primary tracking-wide">amadeus</span>
        </div>

        {/* Center: Unified toolbar strip */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center bg-card border border-border rounded-xl overflow-hidden divide-x divide-border">
            {/* Transport controls */}
            <div className="flex items-center gap-0.5 px-2 py-1.5">
              <button onClick={onSkipPrev} className="w-7 h-7 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button onClick={onPlayPause} className="w-7 h-7 flex items-center justify-center rounded hover:bg-secondary text-foreground transition-colors">
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <button onClick={onSkipNext} className="w-7 h-7 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Brief Cards — editable */}
            {briefCards.map((card) => (
              <EditableBriefCard
                key={card.field}
                card={card}
                onSave={(field, value) => onUpdateBrief?.(field, value)}
              />
            ))}

            {/* Volume */}
            <div className="flex items-center gap-1 px-2.5 py-1.5">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </button>
              <Slider
                value={isMuted ? [0] : [videoVolume]}
                onValueChange={(v) => { onVideoVolumeChange(v[0]); if (isMuted) setIsMuted(false); }}
                max={100}
                step={1}
                className="w-16 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border [&_.relative]:h-1"
              />
            </div>
          </div>
        </div>

        {/* Right: Export + Help */}
        <div className="flex items-center gap-1.5 shrink-0 w-48 justify-end">
          <Button size="sm" disabled={!hasReadyTracks} onClick={onExport}>
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
          <Button variant="ghost" size="sm" onClick={handleHelpClick} className="relative">
            <HelpCircle className={`w-4 h-4 ${shouldPulse ? "animate-pulse text-foreground" : ""}`} />
            {shouldPulse && (
              <span className="absolute inset-0 rounded-md animate-pulse ring-1 ring-foreground/30 pointer-events-none" />
            )}
          </Button>
        </div>
      </motion.header>

      {/* Help Dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">How to use Amadeus</DialogTitle>
            <DialogDescription>Follow these steps to create your video soundtrack.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 mt-2">
            {WORKFLOW_STEPS.map((item) => (
              <li key={item.step} className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {item.step}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
