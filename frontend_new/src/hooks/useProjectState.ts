import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/services/supabase";
import * as api from "@/services/api";
import type { Project, Clip, Section, Track } from "@/types";

export function useProjectState(initialProjectId?: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Track active poll timers so we can clean up
  const pollTimers = useRef<Set<ReturnType<typeof setInterval>>>(new Set());

  const selectedSection = sections.find((s) => s.id === selectedSectionId) || null;
  const hasReadyTracks = sections.some((s) => s.music_status === "READY");

  // Cleanup poll timers on unmount
  useEffect(() => {
    return () => {
      for (const t of pollTimers.current) clearInterval(t);
    };
  }, []);

  // ── Load project data ──
  const loadProject = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      const [projectRes, clipsRes, sectionsRes, tracksRes] = await Promise.all([
        api.getProject(projectId),
        api.getClips(projectId),
        api.getSections(projectId),
        api.getTracks(projectId),
      ]);
      setProject(projectRes.data);
      setClips(clipsRes.data || []);
      setSections(sectionsRes.data || []);
      setTracks(tracksRes.data || []);
    } catch {
      toast.error("Failed to load project");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialProjectId) loadProject(initialProjectId);
  }, [initialProjectId, loadProject]);

  // ── Supabase Realtime subscription ──
  useEffect(() => {
    if (!project) return;

    const channel = supabase
      .channel("project-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sections", filter: `project_id=eq.${project.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setSections((prev) => prev.map((s) => (s.id === payload.new.id ? (payload.new as Section) : s)));
          } else if (payload.eventType === "INSERT") {
            setSections((prev) => {
              if (prev.some((s) => s.id === payload.new.id)) return prev;
              return [...prev, payload.new as Section].sort((a, b) => a.section_order - b.section_order);
            });
          } else if (payload.eventType === "DELETE") {
            setSections((prev) => prev.filter((s) => s.id !== payload.old.id));
          }
        }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tracks" }, (payload) => {
        setTracks((prev) => [...prev, payload.new as Track]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project]);

  // ── Polling helpers ──

  /** Poll until a section's analysis_status is no longer ANALYZING. Returns refreshed sections. */
  const pollForAnalysis = useCallback(
    (projectId: string, sectionId: string): Promise<Section[]> => {
      return new Promise((resolve) => {
        const poll = setInterval(async () => {
          try {
            const refreshed = await api.getSections(projectId);
            const updated = refreshed.data?.find((s: Section) => s.id === sectionId);
            if (updated && updated.analysis_status !== "ANALYZING") {
              clearInterval(poll);
              pollTimers.current.delete(poll);
              setSections(refreshed.data);
              resolve(refreshed.data);
            }
          } catch {
            clearInterval(poll);
            pollTimers.current.delete(poll);
            resolve([]);
          }
        }, 2000);
        pollTimers.current.add(poll);
        setTimeout(() => { clearInterval(poll); pollTimers.current.delete(poll); resolve([]); }, 60000);
      });
    },
    []
  );

  /** Poll until a section's music_status is no longer GENERATING. */
  const pollForMusic = useCallback(
    (projectId: string, sectionId: string): Promise<void> => {
      return new Promise((resolve) => {
        const poll = setInterval(async () => {
          try {
            const [sectionsRes, tracksRes] = await Promise.all([
              api.getSections(projectId),
              api.getTracks(projectId),
            ]);
            const updated = sectionsRes.data?.find((s: Section) => s.id === sectionId);
            if (updated && updated.music_status !== "GENERATING") {
              clearInterval(poll);
              pollTimers.current.delete(poll);
              setSections(sectionsRes.data);
              setTracks(tracksRes.data || []);
              resolve();
            }
          } catch {
            clearInterval(poll);
            pollTimers.current.delete(poll);
            resolve();
          }
        }, 3000);
        pollTimers.current.add(poll);
        setTimeout(() => { clearInterval(poll); pollTimers.current.delete(poll); resolve(); }, 120000);
      });
    },
    []
  );

  /** Reanalyze a section, wait for completion, then auto-generate music. */
  const autoReanalyzeAndGenerate = useCallback(
    async (projectId: string, sectionId: string, label?: string) => {
      try {
        await api.reanalyzeSection(projectId, sectionId);
        toast.info(`Re-analyzing ${label || "section"}...`);
        await pollForAnalysis(projectId, sectionId);
        // Now auto-generate music
        await api.generateMusic(projectId, sectionId);
        toast.info(`Generating music for ${label || "section"}...`);
        await pollForMusic(projectId, sectionId);
      } catch {
        // Errors handled by individual calls
      }
    },
    [pollForAnalysis, pollForMusic]
  );

  // ── Mutation handlers ──

  const handleUpdateSection = useCallback(
    async (sectionId: string, data: Record<string, unknown>) => {
      if (!project) return;
      try {
        const res = await api.updateSection(project.id, sectionId, data);
        setSections((prev) => prev.map((s) => (s.id === sectionId ? res.data : s)));
        // Auto-regenerate music if section type or tone changed
        const musicFields = ["section_type", "scene_type", "emotional_tone", "pacing", "energy_level"];
        if (Object.keys(data).some((k) => musicFields.includes(k))) {
          toast.info("Regenerating music for updated section...");
          api.generateMusic(project.id, sectionId).then(() => {
            pollForMusic(project.id, sectionId);
          }).catch(() => {});
        }
      } catch {
        toast.error("Failed to update section");
      }
    },
    [project, pollForMusic]
  );

  const handleGenerateMusic = useCallback(
    async (sectionId: string) => {
      if (!project) return;
      try {
        const res = await api.generateMusic(project.id, sectionId);
        if (res.data.message) toast.info(res.data.message);
        pollForMusic(project.id, sectionId);
      } catch {
        toast.error("Failed to generate music");
      }
    },
    [project, pollForMusic]
  );

  const handleRegenerateMusic = useCallback(
    async (sectionId: string, feedback: string) => {
      if (!project) return;
      try {
        const res = await api.regenerateMusic(project.id, sectionId, feedback);
        if (res.data.message) toast.info(res.data.message);
        pollForMusic(project.id, sectionId);
      } catch {
        toast.error("Failed to regenerate music");
      }
    },
    [project, pollForMusic]
  );

  const handleMergeSections = useCallback(
    async (sectionId: string, direction: "prev" | "next") => {
      if (!project) return;
      const ordered = [...sections].sort((a, b) => a.section_order - b.section_order);
      const idx = ordered.findIndex((s) => s.id === sectionId);
      const neighbor = direction === "prev" ? ordered[idx - 1] : ordered[idx + 1];
      if (!neighbor) {
        toast.error("No adjacent section to merge");
        return;
      }
      try {
        const res = await api.mergeSections(project.id, [neighbor.id, sectionId]);
        const merged = res.data;
        const refreshed = await api.getSections(project.id);
        setSections(refreshed.data);
        setSelectedSectionId(merged.id);
        toast.success("Sections merged — re-analyzing...");
        // Auto reanalyze + regenerate the merged section
        autoReanalyzeAndGenerate(project.id, merged.id, "merged section");
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Merge failed";
        toast.error(msg);
      }
    },
    [project, sections, autoReanalyzeAndGenerate]
  );

  const handleSplitAtCursor = useCallback(
    async (time: number) => {
      if (!project) return;
      const orderedSections = [...sections].sort((a, b) => a.section_order - b.section_order);
      let targetSection: Section | null = null;

      for (const sec of orderedSections) {
        if (time >= sec.start_time && time < sec.end_time) {
          targetSection = sec;
          break;
        }
      }

      if (!targetSection) {
        toast.error("No section at cursor position");
        return;
      }
      if (time - targetSection.start_time < 0.1) {
        toast.error("Split point too close to section start");
        return;
      }
      if (targetSection.end_time - time < 0.1) {
        toast.error("Split point too close to section end");
        return;
      }

      try {
        await api.splitSection(project.id, targetSection.id, { splitAtTime: time });
        const refreshed = await api.getSections(project.id);
        setSections(refreshed.data);
        toast.success(`Section split — re-analyzing...`);

        // Find the two new sections that replaced the original
        const newSections = refreshed.data.filter(
          (s: Section) => s.start_time >= targetSection!.start_time && s.end_time <= targetSection!.end_time
        );
        // Auto reanalyze + regenerate both new sections
        for (const s of newSections) {
          autoReanalyzeAndGenerate(project.id, s.id, s.section_type);
        }
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Split failed";
        toast.error(msg);
      }
    },
    [project, sections, autoReanalyzeAndGenerate]
  );

  const handleReanalyzeSection = useCallback(
    async (sectionId: string) => {
      if (!project) return;
      try {
        await api.reanalyzeSection(project.id, sectionId);
        toast.info("Re-analyzing section...");
        const refreshedSections = await pollForAnalysis(project.id, sectionId);
        if (refreshedSections.length > 0) {
          toast.success("Re-analysis complete");
          // Auto-generate music after reanalysis
          toast.info("Auto-generating music...");
          api.generateMusic(project.id, sectionId).then(() => {
            pollForMusic(project.id, sectionId);
          }).catch(() => {});
        }
      } catch {
        toast.error("Failed to start re-analysis");
      }
    },
    [project, pollForAnalysis, pollForMusic]
  );

  const handleAddClipsComplete = useCallback(
    async (newClips: Clip[]) => {
      setClips((prev) => [...prev, ...newClips]);
      if (!project) return;
      try {
        const [sectionsRes, clipsRes] = await Promise.all([
          api.getSections(project.id),
          api.getClips(project.id),
        ]);
        setSections(sectionsRes.data || []);
        setClips(clipsRes.data || []);

        // Find the last section (which was extended to cover new clips)
        const ordered = [...(sectionsRes.data || [])].sort(
          (a: Section, b: Section) => a.section_order - b.section_order
        );
        const lastSection = ordered[ordered.length - 1];
        if (lastSection) {
          toast.info("Re-analyzing extended section...");
          autoReanalyzeAndGenerate(project.id, lastSection.id, "extended section");
        }
      } catch {
        // ignore
      }
    },
    [project, autoReanalyzeAndGenerate]
  );

  const handleExport = useCallback(async () => {
    if (!project) return;
    try {
      await api.triggerExport(project.id);
      toast.success("Export started");
    } catch {
      toast.error("Export failed");
    }
  }, [project]);

  return {
    project,
    setProject,
    clips,
    setClips,
    sections,
    setSections,
    tracks,
    selectedSectionId,
    setSelectedSectionId,
    selectedSection,
    hasReadyTracks,
    loading,
    loadProject,
    handleUpdateSection,
    handleGenerateMusic,
    handleRegenerateMusic,
    handleMergeSections,
    handleSplitAtCursor,
    handleReanalyzeSection,
    handleAddClipsComplete,
    handleExport,
  };
}
