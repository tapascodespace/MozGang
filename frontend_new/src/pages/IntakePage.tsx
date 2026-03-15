import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import AmbientBackground from "@/components/AmbientBackground";
import UploadDropZone from "@/components/intake/UploadDropZone";
import CreativeBrief from "@/components/intake/CreativeBrief";
import ScoreBrief from "@/components/intake/ScoreBrief";
import type { CreativeBriefData } from "@/types";

type Phase = "upload" | "brief" | "score";

export default function IntakePage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("upload");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [briefData, setBriefData] = useState<CreativeBriefData | null>(null);

  const handleUploadComplete = useCallback((pid: string, _clips: unknown[]) => {
    setProjectId(pid);
    setPhase("brief");
  }, []);

  const handleBriefComplete = useCallback((brief: CreativeBriefData) => {
    setBriefData(brief);
    setPhase("score");
  }, []);

  const handleScoreContinue = useCallback(
    (_sections: unknown[]) => {
      if (projectId) {
        navigate(`/workspace/${projectId}`);
      }
    },
    [projectId, navigate]
  );

  const handleStartOver = useCallback(() => {
    setProjectId(null);
    setBriefData(null);
    setPhase("upload");
  }, []);

  return (
    <div className="min-h-screen bg-background relative">
      <AmbientBackground />

      {phase !== "upload" && (
        <button
          onClick={handleStartOver}
          className="fixed top-6 right-8 z-[60] flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card/80 backdrop-blur-sm text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Start over
        </button>
      )}

      <div className="relative z-10">
        {phase === "upload" && <UploadDropZone onComplete={handleUploadComplete} />}

        {phase === "brief" && (
          <CreativeBrief
            onComplete={handleBriefComplete}
            onBack={() => setPhase("upload")}
            initialData={briefData}
          />
        )}

        {phase === "score" && briefData && projectId && (
          <ScoreBrief
            projectId={projectId}
            brief={briefData}
            onBriefChange={setBriefData}
            onContinue={handleScoreContinue}
            onBack={() => setPhase("brief")}
          />
        )}
      </div>
    </div>
  );
}
