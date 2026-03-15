import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useProjectState } from "@/hooks/useProjectState";
import { useVideoPlayer } from "@/hooks/useVideoPlayer";
import TopBar from "@/components/editor/TopBar";
import MediaBrowser from "@/components/editor/MediaBrowser";
import VideoPreview from "@/components/editor/VideoPreview";
import Timeline from "@/components/editor/Timeline";
import SectionPanel from "@/components/editor/SectionPanel";
import * as api from "@/services/api";
import { toast } from "sonner";
import type { StagedFile, Clip } from "@/types";

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [videoVolume, setVideoVolume] = useState(80);
  const [musicVolume, setMusicVolume] = useState(65);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const stagedFilesRef = useRef<StagedFile[]>([]);
  stagedFilesRef.current = stagedFiles;

  const {
    project,
    setProject,
    clips,
    sections,
    tracks,
    selectedSectionId,
    setSelectedSectionId,
    selectedSection,
    hasReadyTracks,
    loading,
    handleUpdateSection,
    handleGenerateMusic,
    handleRegenerateMusic,
    handleMergeSections,
    handleSplitAtCursor,
    handleReanalyzeSection,
    handleAddClipsComplete,
    handleExport,
  } = useProjectState(projectId);

  const {
    videoARef,
    videoBRef,
    audioRef,
    displaySlot,
    localTime,
    isPlaying,
    totalDuration,
    togglePlay,
    performSeek,
    handleTimeUpdate,
    handleEnded,
    handleLoadedMetadata,
    handleSeeked,
    handleVideoError,
    videoError,
  } = useVideoPlayer({ clips, sections, tracks });

  // Sync volume to video/audio elements
  useEffect(() => {
    if (videoARef.current) videoARef.current.volume = videoVolume / 100;
    if (videoBRef.current) videoBRef.current.volume = videoVolume / 100;
  }, [videoVolume, videoARef, videoBRef]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVolume / 100;
  }, [musicVolume, audioRef]);

  // Cleanup staged file object URLs on unmount
  useEffect(() => {
    return () => {
      for (const sf of stagedFilesRef.current) {
        URL.revokeObjectURL(sf.objectUrl);
      }
    };
  }, []);

  const handleStageFiles = useCallback((newFiles: StagedFile[]) => {
    setStagedFiles((prev) => [...prev, ...newFiles]);
  }, []);

  /** When a staged file is dropped onto the timeline between sections */
  const handleStagedFileDrop = useCallback(
    async (stagedIndex: number, insertAtTime: number) => {
      const staged = stagedFilesRef.current[stagedIndex];
      if (!staged || !project) return;

      // Remove from staged immediately
      setStagedFiles((prev) => prev.filter((_, i) => i !== stagedIndex));

      toast.info(`Uploading ${staged.name}...`);

      try {
        // Upload the file
        const res = await api.uploadClips(project.id, [staged.file], [staged.duration]);
        const newClips = res.data as Clip[];
        URL.revokeObjectURL(staged.objectUrl);

        if (newClips.length === 0) {
          toast.error("Upload returned no clips");
          return;
        }

        const newClip = newClips[0];

        // Figure out where to insert based on insertAtTime
        // Get current clip order and compute cumulative durations
        const currentClips = await api.getClips(project.id);
        const ordered = [...(currentClips.data || [])].sort(
          (a: Clip, b: Clip) => a.clip_order - b.clip_order
        );

        // Find the clip index where insertAtTime falls
        let insertIdx = ordered.length; // default: end
        let cumTime = 0;
        for (let i = 0; i < ordered.length; i++) {
          if (ordered[i].id === newClip.id) continue; // skip the newly uploaded clip
          cumTime += ordered[i].duration;
          if (cumTime >= insertAtTime) {
            insertIdx = i + 1;
            break;
          }
        }

        // Build new order: remove new clip from its current position, insert at target
        const withoutNew = ordered.filter((c: Clip) => c.id !== newClip.id);
        withoutNew.splice(insertIdx, 0, newClip);
        const newOrder = withoutNew.map((c: Clip) => c.id);

        await api.reorderClips(project.id, newOrder);

        // Refresh, trigger reanalysis, and reset cursor to beginning
        toast.success(`${staged.name} added to timeline`);
        handleAddClipsComplete(newClips);
        performSeek(0);
      } catch {
        toast.error(`Failed to add ${staged.name}`);
      }
    },
    [project, handleAddClipsComplete, performSeek]
  );

  /** When an existing clip is dragged from gallery and dropped on timeline (re-add / duplicate) */
  const handleClipReAdd = useCallback(
    async (clipId: string, insertAtTime: number) => {
      if (!project) return;

      // Find the clip in the current clips array
      const sourceClip = clips.find((c) => c.id === clipId);
      if (!sourceClip || !sourceClip.storage_path) {
        toast.error("Clip not found");
        return;
      }

      toast.info(`Duplicating ${sourceClip.filename}...`);

      try {
        // Fetch the video blob from Supabase storage
        const storageUrl = `https://bznswadiiqulyzpkajqp.supabase.co/storage/v1/object/public/media/${sourceClip.storage_path}`;
        const response = await fetch(storageUrl);
        if (!response.ok) throw new Error("Failed to fetch clip");
        const blob = await response.blob();
        const file = new File([blob], sourceClip.filename, { type: blob.type || "video/mp4" });

        // Upload as a new clip
        const res = await api.uploadClips(project.id, [file], [sourceClip.duration]);
        const newClips = res.data as Clip[];

        if (newClips.length === 0) {
          toast.error("Upload returned no clips");
          return;
        }

        const newClip = newClips[0];

        // Reorder to place at the correct position
        const currentClips = await api.getClips(project.id);
        const ordered = [...(currentClips.data || [])].sort(
          (a: Clip, b: Clip) => a.clip_order - b.clip_order
        );

        let insertIdx = ordered.length;
        let cumTime = 0;
        for (let i = 0; i < ordered.length; i++) {
          if (ordered[i].id === newClip.id) continue;
          cumTime += ordered[i].duration;
          if (cumTime >= insertAtTime) {
            insertIdx = i + 1;
            break;
          }
        }

        const withoutNew = ordered.filter((c: Clip) => c.id !== newClip.id);
        withoutNew.splice(insertIdx, 0, newClip);
        const newOrder = withoutNew.map((c: Clip) => c.id);

        await api.reorderClips(project.id, newOrder);

        toast.success(`${sourceClip.filename} duplicated into timeline`);
        handleAddClipsComplete(newClips);
        performSeek(0);
      } catch {
        toast.error(`Failed to duplicate ${sourceClip.filename}`);
      }
    },
    [project, clips, handleAddClipsComplete, performSeek]
  );

  const handleSkipPrev = useCallback(() => {
    const sorted = [...sections].sort((a, b) => a.section_order - b.section_order);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].start_time < localTime - 0.5) {
        performSeek(sorted[i].start_time);
        return;
      }
    }
    performSeek(0);
  }, [sections, localTime, performSeek]);

  const handleSkipNext = useCallback(() => {
    const sorted = [...sections].sort((a, b) => a.section_order - b.section_order);
    for (const s of sorted) {
      if (s.start_time > localTime + 0.5) {
        performSeek(s.start_time);
        return;
      }
    }
    performSeek(totalDuration);
  }, [sections, localTime, performSeek, totalDuration]);

  const handleUpdateBrief = useCallback(
    async (field: string, value: string) => {
      if (!project) return;
      try {
        await api.updateBrief(project.id, { [field]: value });
        setProject((prev) => (prev ? { ...prev, [field]: value } : prev));
        toast.success("Brief updated");

        // Auto-regenerate all sections when brief changes
        const ordered = [...sections].sort((a, b) => a.section_order - b.section_order);
        for (const sec of ordered) {
          if (sec.music_status === "READY" || sec.music_status === "FAILED") {
            api.generateMusic(project.id, sec.id).catch(() => {});
          }
        }
        if (ordered.length > 0) {
          toast.info("Regenerating music with updated brief...");
        }
      } catch {
        toast.error("Failed to update brief");
      }
    },
    [project, setProject, sections]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading project...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopBar
        project={project}
        hasReadyTracks={hasReadyTracks}
        isPlaying={isPlaying}
        onPlayPause={togglePlay}
        onSkipPrev={handleSkipPrev}
        onSkipNext={handleSkipNext}
        onExport={handleExport}
        videoVolume={videoVolume}
        onVideoVolumeChange={setVideoVolume}
        onUpdateBrief={handleUpdateBrief}
      />

      <div className="flex-1 flex overflow-hidden">
        <MediaBrowser
          clips={clips}
          stagedFiles={stagedFiles}
          onStageFiles={handleStageFiles}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <VideoPreview
            videoARef={videoARef}
            videoBRef={videoBRef}
            audioRef={audioRef}
            displaySlot={displaySlot}
            localTime={localTime}
            totalDuration={totalDuration}
            isPlaying={isPlaying}
            videoError={videoError}
            onPlayPause={togglePlay}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onLoadedMetadata={handleLoadedMetadata}
            onSeeked={handleSeeked}
            onVideoError={handleVideoError}
          />

          <Timeline
            clips={clips}
            sections={sections}
            tracks={tracks}
            currentTime={localTime}
            totalDuration={totalDuration}
            onSeek={performSeek}
            selectedSectionId={selectedSectionId}
            onSelectSection={setSelectedSectionId}
            onSplitAtTime={handleSplitAtCursor}
            onMerge={handleMergeSections}
            onGenerateMusic={handleGenerateMusic}
            onRegenerateMusic={handleRegenerateMusic}
            onStagedFileDrop={handleStagedFileDrop}
            onClipReAdd={handleClipReAdd}
          />
        </div>

        <SectionPanel
          section={selectedSection}
          tracks={tracks}
          onUpdateSection={handleUpdateSection}
          onReanalyze={handleReanalyzeSection}
          onGenerateMusic={handleGenerateMusic}
          onRegenerateMusic={handleRegenerateMusic}
          videoVolume={videoVolume}
          musicVolume={musicVolume}
          onVideoVolumeChange={setVideoVolume}
          onMusicVolumeChange={setMusicVolume}
        />
      </div>
    </div>
  );
}
