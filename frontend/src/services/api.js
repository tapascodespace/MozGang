import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
});

export const createProject = () => api.post('/projects');

export const getProject = (id) => api.get(`/projects/${id}`);

export const uploadClips = (projectId, files, durations = []) => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  durations.forEach((duration) => formData.append('durations', String(duration)));
  return api.post(`/projects/${projectId}/clips`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  });
};

export const getClips = (projectId) => api.get(`/projects/${projectId}/clips`);

export const reorderClips = (projectId, clipIds) =>
  api.put(`/projects/${projectId}/clips/reorder`, { clip_ids: clipIds });

export const submitBrief = (projectId, brief) =>
  api.post(`/projects/${projectId}/brief`, brief);

export const updateBrief = (projectId, brief) =>
  api.put(`/projects/${projectId}/brief`, brief);

export const getSections = (projectId) =>
  api.get(`/projects/${projectId}/sections`);

export const updateSection = (projectId, sectionId, data) =>
  api.put(`/projects/${projectId}/sections/${sectionId}`, data);

export const generateMusic = (projectId, sectionId) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/generate`);

export const regenerateMusic = (projectId, sectionId, feedback) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/regenerate`, { feedback });

export const mergeSections = (projectId, sectionIds) =>
  api.post(`/projects/${projectId}/sections/merge`, { section_ids: sectionIds });

export const resizeSection = (projectId, sectionId, data) =>
  api.put(`/projects/${projectId}/sections/${sectionId}/resize`, data);

export const splitSection = (projectId, sectionId, { splitAtClipId, splitAtTime }) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/split`, {
    split_at_clip_id: splitAtClipId,
    split_at_time: splitAtTime,
  });

export const undoSection = (projectId, sectionId) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/undo`);

export const getClipStreamUrl = (projectId, clipId) =>
  api.get(`/projects/${projectId}/clips/${clipId}/stream`);

export const triggerExport = (projectId) =>
  api.post(`/projects/${projectId}/export`);

export const getTracks = (projectId) =>
  api.get(`/projects/${projectId}/tracks`);

// Pre-analysis (runs frame extraction, transcription, scene detection, auto-boundaries)
export const startPreAnalysis = (projectId, vibe = null) =>
  api.post(`/projects/${projectId}/pre-analyze`, { vibe });

// Get pre-analysis status and results
export const getPreAnalysisStatus = (projectId) =>
  api.get(`/projects/${projectId}/pre-analysis-status`);

// Set user's selected vibe and get music style recommendation
export const setVibe = (projectId, vibe) =>
  api.post(`/projects/${projectId}/vibe`, { vibe });

// Confirm music style (gold standard for all sections)
export const confirmMusicStyle = (projectId, musicStyle) =>
  api.post(`/projects/${projectId}/confirm-style`, { music_style: musicStyle });

// Re-analyze a section (after merge/split)
export const reanalyzeSection = (projectId, sectionId) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/reanalyze`);

// Import clip from YouTube URL
export const importFromUrl = (projectId, url) =>
  api.post(`/projects/${projectId}/clips/from-url`, { url }, { timeout: 300000 });

export default api;
