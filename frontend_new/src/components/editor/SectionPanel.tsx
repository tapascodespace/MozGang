import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Eye, Palette, Activity, Music, Gauge, Timer, Layers, MonitorPlay, RefreshCw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Section, Track } from "@/types";
import { SECTION_TYPES, SCENE_TYPES, EMOTIONAL_TONES, PACING_OPTIONS, SECTION_COLORS } from "@/types";

interface SectionPanelProps {
  section: Section | null;
  tracks: Track[];
  onUpdateSection: (sectionId: string, data: Record<string, unknown>) => void;
  onReanalyze: (sectionId: string) => void;
  onGenerateMusic: (sectionId: string) => void;
  onRegenerateMusic: (sectionId: string, feedback: string) => void;
  videoVolume: number;
  musicVolume: number;
  onVideoVolumeChange: (v: number) => void;
  onMusicVolumeChange: (v: number) => void;
}

function InlineSelect({ value, options, onChange }: { value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 px-2 text-[11px] bg-card border-border rounded-full w-auto min-w-[90px] gap-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-[120px]">
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="text-[11px]">{opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SectionAnalysis({
  section,
  onReanalyze,
  onFieldChange,
}: {
  section: Section;
  onReanalyze: () => void;
  onFieldChange: (field: string, value: string) => void;
}) {
  const isAnalyzing = section.analysis_status === "ANALYZING";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold text-primary uppercase tracking-[0.15em] flex items-center gap-1.5">
          <Eye className="w-3 h-3" /> Section Analysis
        </h4>
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={onReanalyze}
          disabled={isAnalyzing}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[9px] font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-2.5 h-2.5 ${isAnalyzing ? "animate-spin" : ""}`} />
          {isAnalyzing ? "Analyzing..." : "Reanalyze"}
        </motion.button>
      </div>

      <div className="grid gap-3 bg-card rounded-2xl border border-border p-4">
        {/* Section Type */}
        <div className="flex items-start gap-2.5">
          <Layers className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1">Section Type</p>
            <InlineSelect
              value={section.section_type}
              options={SECTION_TYPES}
              onChange={(v) => onFieldChange("section_type", v)}
            />
          </div>
        </div>

        {/* Scene Type */}
        <div className="flex items-start gap-2.5">
          <MonitorPlay className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1">Scene Type</p>
            <InlineSelect
              value={section.scene_type || "Vlog/Casual"}
              options={SCENE_TYPES}
              onChange={(v) => onFieldChange("scene_type", v)}
            />
          </div>
        </div>

        {/* Emotional Tone */}
        <div className="flex items-start gap-2.5">
          <Palette className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1">Emotional Tone</p>
            <InlineSelect
              value={section.emotional_tone || "Energetic"}
              options={EMOTIONAL_TONES}
              onChange={(v) => onFieldChange("emotional_tone", v)}
            />
          </div>
        </div>

        {/* Detected Theme — read only */}
        <div className="flex items-start gap-2.5">
          <Zap className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Detected Theme</p>
            <p className="text-xs text-foreground">{section.detected_theme || "—"}</p>
          </div>
        </div>

        {/* Dominant Visual — read only */}
        <div className="flex items-start gap-2.5">
          <Eye className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Dominant Visual</p>
            <p className="text-xs text-foreground">{section.dominant_visual || "—"}</p>
          </div>
        </div>

        {/* Suggested Music Style — read only */}
        <div className="flex items-start gap-2.5">
          <Music className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Suggested Music Style</p>
            <p className="text-xs text-foreground">{section.suggested_music_style || "—"}</p>
          </div>
        </div>

        {/* Energy Level — read only */}
        <div className="flex items-start gap-2.5">
          <Gauge className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1">Energy Level</p>
            <p className="text-xs text-foreground">{section.energy_level || "—"}</p>
          </div>
        </div>

        {/* Pacing */}
        <div className="flex items-start gap-2.5">
          <Timer className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1">Pacing</p>
            <InlineSelect
              value={section.pacing || "Medium"}
              options={PACING_OPTIONS}
              onChange={(v) => onFieldChange("pacing", v)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SectionPanel({
  section,
  tracks,
  onUpdateSection,
  onReanalyze,
  onGenerateMusic,
  onRegenerateMusic,
  videoVolume,
  musicVolume,
  onVideoVolumeChange,
  onMusicVolumeChange,
}: SectionPanelProps) {
  const [feedbackText, setFeedbackText] = useState("");

  const sectionTrack = section
    ? tracks.find((t) => t.section_id === section.id && !t.is_discarded)
    : null;

  const handleFieldChange = useCallback(
    (field: string, value: string) => {
      if (!section) return;
      onUpdateSection(section.id, { [field]: value });
    },
    [section, onUpdateSection]
  );

  const handleReanalyze = useCallback(() => {
    if (!section) return;
    onReanalyze(section.id);
  }, [section, onReanalyze]);

  const handleGenerate = useCallback(() => {
    if (!section) return;
    onGenerateMusic(section.id);
  }, [section, onGenerateMusic]);

  const handleRegenerate = useCallback(() => {
    if (!section || !feedbackText.trim()) return;
    onRegenerateMusic(section.id, feedbackText.trim());
    setFeedbackText("");
  }, [section, feedbackText, onRegenerateMusic]);

  const color = section ? SECTION_COLORS[section.section_type] || "hsl(var(--primary))" : "";

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="w-80 bg-background border-l border-border flex flex-col h-full"
    >
      {/* Scrollable section analysis */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">
        <AnimatePresence mode="wait">
          {section ? (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              {/* Section header */}
              <div className="flex items-center gap-3 pt-3 border-t border-border">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center border border-border bg-card"
                  style={{ borderColor: `${color}44` }}
                >
                  <span className="text-sm font-semibold" style={{ color }}>
                    {section.section_type.charAt(0)}
                  </span>
                </div>
                <div>
                  <h3 className="font-sans text-lg font-semibold text-foreground">{section.section_type}</h3>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    {(section.end_time - section.start_time).toFixed(1)}s
                  </p>
                </div>
              </div>

              <SectionAnalysis
                section={section}
                onReanalyze={handleReanalyze}
                onFieldChange={handleFieldChange}
              />

              {/* Music controls */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-semibold text-primary uppercase tracking-[0.15em] flex items-center gap-1.5">
                  <Music className="w-3 h-3" /> Music
                </h4>

                <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Status: <span className={`font-medium ${section.music_status === "FAILED" ? "text-destructive" : "text-foreground"}`}>{section.music_status}</span>
                    </span>
                    {section.music_status === "PENDING" && (
                      <button
                        onClick={handleGenerate}
                        className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 transition-colors"
                      >
                        Generate
                      </button>
                    )}
                    {section.music_status === "READY" && (
                      <button
                        onClick={handleGenerate}
                        className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-colors"
                      >
                        Regenerate
                      </button>
                    )}
                    {section.music_status === "FAILED" && (
                      <button
                        onClick={handleGenerate}
                        className="px-3 py-1 rounded-full bg-destructive/80 text-destructive-foreground text-[10px] font-semibold hover:bg-destructive/90 transition-colors"
                      >
                        Retry
                      </button>
                    )}
                  </div>

                  {section.music_status === "GENERATING" && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-primary">Generating music...</span>
                    </div>
                  )}

                  {section.music_status === "FAILED" && (
                    <p className="text-[10px] text-destructive/80">
                      Music generation failed. Click Retry or provide feedback below.
                    </p>
                  )}

                  {/* Contextual music style suggestion */}
                  {(section.music_status === "READY" || section.music_status === "FAILED") && (() => {
                    const current = section.suggested_music_style || "";
                    const alternatives: Record<string, { label: string; prompt: string }> = {
                      "Upbeat Electronic": { label: "Acoustic Folk", prompt: "Acoustic Folk with light percussion" },
                      "Lofi Hip-Hop": { label: "Ambient Piano", prompt: "Ambient Piano with soft pads" },
                      "Cinematic Orchestral": { label: "Minimal Synth", prompt: "Minimal Synth with atmospheric textures" },
                      "Pop Rock": { label: "Jazz Fusion", prompt: "Jazz Fusion with smooth guitar" },
                      "Ambient": { label: "World Music", prompt: "Rhythmic World Music" },
                      "Acoustic": { label: "Chill Electronic", prompt: "Chill Electronic with warm synths" },
                      "EDM": { label: "Organic Percussion", prompt: "Organic Percussion with live instruments" },
                      "Hip-Hop Beats": { label: "Indie Rock", prompt: "Indie Rock with driving rhythm" },
                      "Quirky Indie": { label: "Smooth Jazz", prompt: "Smooth Jazz with playful keys" },
                      "Bouncy Pop": { label: "Tropical House", prompt: "Tropical House with steel drums" },
                    };
                    const alt = alternatives[current];
                    const suggestion = alt
                      ? alt
                      : { label: `Calm ${current || "style"}`, prompt: `Calm, relaxed version of ${current || "current style"} with softer instrumentation` };
                    return (
                      <button
                        onClick={() => onRegenerateMusic(section.id, suggestion.prompt)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/10 text-[10px] text-primary hover:bg-primary/10 transition-colors"
                      >
                        Try: {suggestion.label}
                      </button>
                    );
                  })()}

                  {/* Feedback input for regeneration */}
                  {(section.music_status === "READY" || section.music_status === "FAILED") && (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRegenerate()}
                        placeholder="e.g. more upbeat lofi hiphop..."
                        className="flex-1 min-w-0 bg-background border border-border rounded-lg px-2.5 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
                        maxLength={200}
                      />
                      <button
                        onClick={handleRegenerate}
                        disabled={!feedbackText.trim()}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground/30 disabled:cursor-not-allowed transition-colors"
                      >
                        Go
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center px-4"
            >
              <Layers className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select a section to view details</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Audio Mixer — pinned to bottom */}
      <div className="shrink-0 border-t border-border px-4 py-2.5 bg-background">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5 mb-2">
          <Activity className="w-3 h-3" /> Audio Mixer
        </h4>

        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-20 shrink-0">
              <MonitorPlay className="w-3 h-3 text-muted-foreground" />
              <span className="text-[11px] text-foreground font-medium">Original</span>
            </div>
            <Slider
              value={[videoVolume]}
              onValueChange={(v) => onVideoVolumeChange(v[0])}
              max={100}
              step={1}
              className="flex-1 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border [&_.relative]:h-1"
            />
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{videoVolume}%</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-20 shrink-0">
              <Music className="w-3 h-3 text-muted-foreground" />
              <span className="text-[11px] text-foreground font-medium">Music</span>
            </div>
            <Slider
              value={[musicVolume]}
              onValueChange={(v) => onMusicVolumeChange(v[0])}
              max={100}
              step={1}
              className="flex-1 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border [&_.relative]:h-1"
            />
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{musicVolume}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
