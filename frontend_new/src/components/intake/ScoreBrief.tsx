import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, X } from "lucide-react";
import * as api from "@/services/api";
import type { CreativeBriefData } from "@/types";

interface Props {
  projectId: string;
  brief: CreativeBriefData;
  onBriefChange: (brief: CreativeBriefData) => void;
  onContinue: (sections: unknown[]) => void;
  onBack: () => void;
}

const MUSIC_OPTIONS = [
  { label: "Hip Hop", emoji: "🎤" },
  { label: "Cinematic", emoji: "🎻" },
  { label: "Lo-Fi", emoji: "☁️" },
  { label: "Electronic", emoji: "🎛️" },
  { label: "Acoustic", emoji: "🎸" },
  { label: "Pop", emoji: "✨" },
  { label: "Jazz", emoji: "🎷" },
  { label: "Ambient", emoji: "🌊" },
];

type EditingField = "style" | null;

// Fallback heuristics when pre-analysis hasn't completed
function getFallbackTheme(energy: string): string {
  const e = energy.toLowerCase();
  if (["emotional", "romantic"].includes(e)) return "Personal Story";
  if (["cinematic", "mysterious"].includes(e)) return "Narrative Drama";
  if (["high energy", "rebellious"].includes(e)) return "Montage";
  if (["playful"].includes(e)) return "Lifestyle Vlog";
  if (["chill"].includes(e)) return "Mood Piece";
  return "Creative Project";
}

function getFallbackStyle(energy: string): string {
  const e = energy.toLowerCase();
  if (["high energy", "rebellious"].includes(e)) return "Upbeat Electronic";
  if (["cinematic", "mysterious"].includes(e)) return "Cinematic Orchestral";
  if (["emotional", "romantic"].includes(e)) return "Acoustic Ballad";
  if (["chill"].includes(e)) return "Lo-Fi Chill";
  if (["playful"].includes(e)) return "Pop Upbeat";
  return "Electronic";
}

function getVibeDescription(energy: string): string {
  const e = energy.toLowerCase();
  if (["high energy", "rebellious"].includes(e)) return "Fast-paced montage";
  if (["cinematic", "mysterious"].includes(e)) return "Dramatic narrative";
  if (["emotional", "romantic"].includes(e)) return "Intimate storytelling";
  if (["chill"].includes(e)) return "Smooth and relaxed";
  if (["playful"].includes(e)) return "Fun and lighthearted";
  return "Creative expression";
}

export default function ScoreBrief({ projectId, brief, onBriefChange, onContinue, onBack }: Props) {
  const [flashOut, setFlashOut] = useState(false);
  const [editing, setEditing] = useState<EditingField>(null);
  const [revealPhase, setRevealPhase] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Pre-analysis results from backend
  const [preAnalysisReady, setPreAnalysisReady] = useState(false);
  const [detectedTheme, setDetectedTheme] = useState<string>("");
  const [recommendedStyle, setRecommendedStyle] = useState<string>("");

  // Poll pre-analysis status
  useEffect(() => {
    if (preAnalysisReady) return;

    const poll = setInterval(async () => {
      try {
        const res = await api.getPreAnalysisStatus(projectId);
        const data = res.data;
        if (data.status === "COMPLETE" || data.status === "complete") {
          setPreAnalysisReady(true);
          if (data.theme_summary) setDetectedTheme(data.theme_summary);
          if (data.recommended_music_style) {
            setRecommendedStyle(data.recommended_music_style);
            if (!brief.music_style_direction) {
              onBriefChange({ ...brief, music_style_direction: data.recommended_music_style });
            }
          }
          clearInterval(poll);
        }
      } catch {
        // Pre-analysis not ready yet, keep polling
      }
    }, 1000);

    return () => clearInterval(poll);
  }, [projectId, preAnalysisReady, brief, onBriefChange]);

  // Use fallbacks if pre-analysis hasn't completed
  const displayTheme = detectedTheme || getFallbackTheme(brief.overall_energy);
  const displayStyle = brief.music_style_direction || recommendedStyle || getFallbackStyle(brief.overall_energy);
  const vibeDescription = getVibeDescription(brief.overall_energy);

  // Set initial recommended style if not set from polling
  useEffect(() => {
    if (!brief.music_style_direction && !preAnalysisReady) {
      const fallback = getFallbackStyle(brief.overall_energy);
      onBriefChange({ ...brief, music_style_direction: fallback });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timed reveal phases
  useEffect(() => {
    const t1 = setTimeout(() => setRevealPhase(1), 400);
    const t2 = setTimeout(() => setRevealPhase(2), 2800);
    const t3 = setTimeout(() => setRevealPhase(3), 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const handleContinue = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Confirm the music style
      await api.confirmMusicStyle(projectId, displayStyle);

      // Submit brief to trigger full analysis
      const res = await api.submitBrief(projectId, {
        overall_energy: brief.overall_energy,
        music_style_direction: displayStyle,
        references_text: brief.references_text,
      });

      setFlashOut(true);
      setTimeout(() => onContinue(res.data.sections || []), 400);
    } catch {
      setSubmitting(false);
      // TODO: show error toast
    }
  }, [projectId, brief, displayStyle, onContinue, submitting]);

  const handleSelectStyle = useCallback(
    (label: string) => {
      onBriefChange({ ...brief, music_style_direction: label });
      setEditing(null);
    },
    [brief, onBriefChange]
  );

  return (
    <>
      {/* White flash overlay */}
      <AnimatePresence>
        {flashOut && (
          <motion.div
            className="fixed inset-0 z-[100] bg-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center overflow-auto py-12 px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: flashOut ? 0 : 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="w-full max-w-[560px] flex flex-col items-center relative">
          <AnimatePresence mode="wait">
            {revealPhase === 1 && (
              <motion.p
                key="okay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="text-lg text-muted-foreground font-medium"
              >
                Okay...
              </motion.p>
            )}

            {revealPhase >= 2 && (
              <motion.div
                key="card"
                className={`w-full rounded-[20px] p-8 md:p-10 transition-colors duration-500 ${
                  revealPhase >= 3 ? "bg-card border border-border" : ""
                }`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
              >
                <div className="flex flex-col gap-6">
                  <div className="text-center">
                    <h2 className="text-2xl md:text-3xl font-bold text-foreground">Here's what we found</h2>
                  </div>

                  <AnimatePresence>
                    {revealPhase >= 3 && (
                      <motion.div
                        className="flex flex-col gap-6"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
                      >
                        <div className="bg-background border border-border rounded-xl p-6 text-center">
                          <p className="text-base md:text-lg text-foreground leading-relaxed">
                            You want a <span className="font-bold text-primary">{brief.overall_energy}</span> vibe and your
                            video looks like a <span className="font-bold text-primary">{displayTheme}</span>.
                          </p>
                          <p className="text-sm text-primary/70 italic mt-3 font-normal">"{vibeDescription}"</p>
                        </div>

                        <div className="text-center">
                          <p className="text-sm text-muted-foreground mb-4">We recommend going with:</p>

                          <motion.div
                            className="inline-flex items-center gap-3 bg-background border border-border rounded-xl px-6 py-4 cursor-pointer group"
                            whileHover={{ y: -2 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            onClick={() => setEditing("style")}
                          >
                            <span className="text-xl md:text-2xl font-bold text-foreground">{displayStyle}</span>
                            <span className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground group-hover:text-foreground transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </span>
                          </motion.div>

                          <p className="text-xs text-muted-foreground mt-4 max-w-[360px] mx-auto leading-relaxed">
                            This style will be the default for all sections. Individual sections may vary slightly based on
                            their content.
                          </p>
                        </div>

                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={onBack}
                            className="flex-1 py-3.5 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-card transition-colors"
                          >
                            Back
                          </button>
                          <button
                            onClick={handleContinue}
                            disabled={submitting}
                            className="flex-1 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {submitting ? "Analyzing..." : "Continue"}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Edit Style Overlay */}
      <AnimatePresence>
        {editing === "style" && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setEditing(null)} />
            <motion.div
              className="relative z-10 w-full max-w-md bg-card border border-border rounded-2xl p-6"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <button
                onClick={() => setEditing(null)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-bold text-foreground mb-1">Change style</h3>
              <p className="text-sm text-muted-foreground mb-5">Pick a music style for your video</p>
              <div className="grid grid-cols-2 gap-2">
                {MUSIC_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => handleSelectStyle(opt.label)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                      brief.music_style_direction === opt.label
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <span>{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
