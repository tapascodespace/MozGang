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

export const splitSection = (projectId, sectionId, splitAtClipId) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/split`, { split_at_clip_id: splitAtClipId });

export const undoSection = (projectId, sectionId) =>
  api.post(`/projects/${projectId}/sections/${sectionId}/undo`);

export const getClipStreamUrl = (projectId, clipId) =>
  api.get(`/projects/${projectId}/clips/${clipId}/stream`);

export const triggerExport = (projectId) =>
  api.post(`/projects/${projectId}/export`);

export const getTracks = (projectId) =>
  api.get(`/projects/${projectId}/tracks`);

export default api;
