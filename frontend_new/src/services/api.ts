import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
});

// ── Projects ──

export const createProject = () => api.post("/projects");

export const getProject = (id: string) => api.get(`/projects/${id}`);

// ── Clips ──

export const uploadClips = (projectId: string, files: File[], durations: number[] = []) => {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  durations.forEach((duration) => formData.append("durations", String(duration)));
  return api.post(`/projects/${projectId}/clips`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
};

export const getClips = (projectId: string) => api.get(`/projects/${projectId}/clips`);

export const reorderClips = (projectId: string, clipIds: string[]) =>
  api.put(`/projects/${projectId}/clips/reorder`, { clip_ids: clipIds });

export const getClipStreamUrl = (projectId: string, clipId: string) =>
  api.get(`/projects/${projectId}/clips/${clipId}/stream`);

// ── Brief ──

export const submitBrief = (projectId: string, brief: Record<string, unknown>) =>
  api.post(`/projects/${projectId}/brief`, brief);

export const updateBrief = (projectId: string, brief: Record<string, unknown>) =>
  api.put(`/projects/${projectId}/brief`, brief);

// ── Sections ──

export const getSections = (projectId: string) =>
  api.get(`/projects/${projectId}/sections`);

export const updateSection = (projectId: string, sectionId: string, data: Record<string, unknown>) =>
  api.put(`/projects/${projectId}/sections/${sectionId}`, data);

export const generateMusic = (projectId: string, sectionId: string) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/generate`);

export const regenerateMusic = (projectId: string, sectionId: string, feedback: string) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/regenerate`, { feedback });

export const mergeSections = (projectId: string, sectionIds: string[]) =>
  api.post(`/projects/${projectId}/sections/merge`, { section_ids: sectionIds });

export const splitSection = (
  projectId: string,
  sectionId: string,
  { splitAtClipId, splitAtTime }: { splitAtClipId?: string; splitAtTime?: number }
) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/split`, {
    split_at_clip_id: splitAtClipId,
    split_at_time: splitAtTime,
  });

export const undoSection = (projectId: string, sectionId: string) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/undo`);

export const reanalyzeSection = (projectId: string, sectionId: string) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/reanalyze`);

// ── Tracks ──

export const getTracks = (projectId: string) =>
  api.get(`/projects/${projectId}/tracks`);

// ── Pre-analysis ──

export const startPreAnalysis = (projectId: string, vibe: string | null = null) =>
  api.post(`/projects/${projectId}/pre-analyze`, { vibe });

export const getPreAnalysisStatus = (projectId: string) =>
  api.get(`/projects/${projectId}/pre-analysis-status`);

// ── Onboarding ──

export const setVibe = (projectId: string, vibe: string) =>
  api.post(`/projects/${projectId}/vibe`, { vibe });

export const confirmMusicStyle = (projectId: string, musicStyle: string) =>
  api.post(`/projects/${projectId}/confirm-style`, { music_style: musicStyle });

// ── Export ──

export const triggerExport = (projectId: string) =>
  api.post(`/projects/${projectId}/export`);

export default api;
