import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { CreativeBriefData } from "@/types";

const ENERGY_OPTIONS = [
  { label: "High Energy", emoji: "⚡", response: "Let's go." },
  { label: "Chill", emoji: "😌", response: "Easy does it." },
  { label: "Emotional", emoji: "🥹", response: "Deep cuts." },
  { label: "Cinematic", emoji: "🎬", response: "Big screen energy." },
  { label: "Playful", emoji: "😄", response: "Keep it fun." },
  { label: "Mysterious", emoji: "🌙", response: "Intriguing." },
  { label: "Romantic", emoji: "🌹", response: "Set the mood." },
  { label: "Rebellious", emoji: "🔥", response: "Break the rules." },
];

const TOTAL_STEPS = 2;
type Step = 0 | 1;

interface Props {
  onComplete: (brief: CreativeBriefData) => void;
  onBack: () => void;
  initialStep?: number | null;
  initialData?: CreativeBriefData | null;
}

export default function CreativeBrief({ onComplete, onBack, initialStep, initialData }: Props) {
  const [step, setStep] = useState<Step>((initialStep ?? 0) as Step);
  const [selectedEnergy, setSelectedEnergy] = useState<string | null>(initialData?.overall_energy ?? null);
  const [references, setReferences] = useState(initialData?.references_text ?? "");
  const [showResponse, setShowResponse] = useState(false);
  const [responseLine, setResponseLine] = useState("");
  const [confirmedAnswers, setConfirmedAnswers] = useState<{ label: string; emoji: string }[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [flashOut, setFlashOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const advanceAfterResponse = useCallback(
    (answer: { label: string; emoji: string }, response: string, nextStep: Step) => {
      setShowResponse(true);
      setResponseLine(response);
      setTimeout(() => {
        setTransitioning(true);
        setTimeout(() => {
          setConfirmedAnswers((prev) => [...prev, answer]);
          setShowResponse(false);
          setTransitioning(false);
          setStep(nextStep);
        }, 400);
      }, 800);
    },
    []
  );

  const handleEnergySelect = useCallback(
    (opt: (typeof ENERGY_OPTIONS)[0]) => {
      setSelectedEnergy(opt.label);
      advanceAfterResponse({ label: opt.label, emoji: opt.emoji }, opt.response, 1);
    },
    [advanceAfterResponse]
  );

  const submitBrief = useCallback(
    (refText: string) => {
      setFlashOut(true);
      setTimeout(() => {
        onComplete({
          overall_energy: selectedEnergy!,
          music_style_direction: "",
          references_text: refText,
        });
      }, 500);
    },
    [selectedEnergy, onComplete]
  );

  const handleReferencesSubmit = useCallback(() => {
    submitBrief(references);
  }, [references, submitBrief]);

  const handleSkip = useCallback(() => {
    submitBrief("");
  }, [submitBrief]);

  const handleBack = useCallback(() => {
    if (showResponse || transitioning) return;
    if (step === 0) {
      onBack();
      return;
    }
    setSelectedEnergy(null);
    setConfirmedAnswers((prev) => prev.slice(0, -1));
    setStep(0);
  }, [step, onBack, showResponse, transitioning]);

  useEffect(() => {
    if (step === 1 && inputRef.current) {
      inputRef.current.focus();
    }
  }, [step]);

  const questions: Record<Step, { emoji: string; text: string }> = {
    0: { emoji: "🔥", text: "What's the energy of your video?" },
    1: { emoji: "✨", text: "Any artists or tracks for inspiration?" },
  };

  const progressPercent = (step / TOTAL_STEPS) * 100;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: flashOut ? 0 : 1 }}
      transition={{ duration: flashOut ? 0.3 : 0.4 }}
    >
      {/* Confirmed pills */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2">
        <AnimatePresence>
          {confirmedAnswers.map((a, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 0.5, y: 0 }}
              className="px-3 py-1 rounded-full bg-card border border-border text-xs text-muted-foreground flex items-center gap-1.5"
            >
              <span>{a.emoji}</span>
              <span>{a.label}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Question area */}
      <div className="w-full max-w-xl px-8">
        <AnimatePresence mode="wait">
          {!transitioning && (
            <motion.div
              key={step}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex flex-col items-center"
            >
              <motion.span className="text-5xl mb-6">{questions[step].emoji}</motion.span>

              <AnimatePresence mode="wait">
                {showResponse ? (
                  <motion.p
                    key="response"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-2xl font-bold text-primary text-center mb-10"
                  >
                    {responseLine}
                  </motion.p>
                ) : (
                  <motion.h2
                    key="question"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-2xl font-bold text-foreground text-center mb-10"
                  >
                    {questions[step].text}
                  </motion.h2>
                )}
              </AnimatePresence>

              {step === 0 && !showResponse && (
                <ChipGrid options={ENERGY_OPTIONS} selected={selectedEnergy} onSelect={handleEnergySelect} />
              )}

              {step === 1 && (
                <div className="w-full flex flex-col items-center gap-4">
                  <input
                    ref={inputRef}
                    value={references}
                    onChange={(e) => setReferences(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && references.trim() && handleReferencesSubmit()}
                    placeholder="e.g. Hans Zimmer, Kendrick Lamar..."
                    className="w-full bg-card border border-border rounded-xl px-5 py-4 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                  <div className="flex items-center gap-6">
                    {references.trim() && (
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={handleReferencesSubmit}
                        className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
                      >
                        Continue →
                      </motion.button>
                    )}
                    <button onClick={handleSkip} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      Skip →
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="flex justify-start px-8 pb-6">
          <button
            onClick={handleBack}
            disabled={showResponse || transitioning}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        </div>
        <div className="h-1 w-full bg-secondary">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>
    </motion.div>
  );
}

interface ChipGridProps {
  options: { label: string; emoji: string; response: string }[];
  selected: string | null;
  onSelect: (opt: { label: string; emoji: string; response: string }) => void;
}

function ChipGrid({ options, selected, onSelect }: ChipGridProps) {
  return (
    <motion.div className="grid grid-cols-4 gap-3 w-full">
      {options.map((opt) => {
        const isSelected = selected === opt.label;
        const isOther = selected !== null && !isSelected;
        return (
          <motion.button
            key={opt.label}
            onClick={() => !selected && onSelect(opt)}
            animate={{
              opacity: isOther ? 0 : 1,
              scale: isSelected ? 1.06 : 1,
            }}
            transition={{ duration: 0.2, type: isSelected ? "spring" : "tween", stiffness: 300, damping: 20 }}
            className={`chip justify-center text-center ${isSelected ? "chip-selected" : ""}`}
            disabled={!!selected}
          >
            <span>{opt.emoji}</span>
            <span>{opt.label}</span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
