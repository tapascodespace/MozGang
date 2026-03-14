import { useState, useCallback } from 'react';

// Simple global state (no Redux needed for hackathon)
let globalState = {
  project: null,
  clips: [],
  sections: [],
  tracks: [],
  selectedSectionId: null,
  zoomLevel: 10, // px per second
  currentTime: 0,
  isPlaying: false,
  view: 'import', // 'import' | 'brief' | 'analyzing' | 'workspace'
};

const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn({ ...globalState }));
}

export function useStore() {
  const [state, setState] = useState({ ...globalState });

  const subscribe = useCallback(() => {
    const handler = (newState) => setState(newState);
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  // Subscribe on mount
  useState(() => {
    const handler = (newState) => setState(newState);
    listeners.add(handler);
    return () => listeners.delete(handler);
  });

  return state;
}

export function setProject(project) {
  globalState.project = project;
  notify();
}

export function setClips(clips) {
  globalState.clips = clips;
  notify();
}

export function setSections(sections) {
  globalState.sections = sections;
  notify();
}

export function setTracks(tracks) {
  globalState.tracks = tracks;
  notify();
}

export function setSelectedSectionId(id) {
  globalState.selectedSectionId = id;
  notify();
}

export function setZoomLevel(level) {
  globalState.zoomLevel = Math.max(2, Math.min(100, level));
  notify();
}

export function setCurrentTime(time) {
  globalState.currentTime = time;
  notify();
}

export function setIsPlaying(playing) {
  globalState.isPlaying = playing;
  notify();
}

export function setView(view) {
  globalState.view = view;
  notify();
}

export function updateSection(sectionId, data) {
  globalState.sections = globalState.sections.map((s) =>
    s.id === sectionId ? { ...s, ...data } : s
  );
  notify();
}

export function getState() {
  return { ...globalState };
}
