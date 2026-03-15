import { useState, useCallback, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import LandingPage from './components/LandingPage';
import ImportScreen from './components/ImportScreen';
import CreativeBrief from './components/CreativeBrief';
import ProgressOverlay from './components/ProgressOverlay';
import TopBar from './components/TopBar';
import PreviewPlayer from './components/PreviewPlayer';
import Timeline from './components/Timeline';
import SectionPanel from './components/SectionPanel';
import { supabase } from './services/supabase';
import * as api from './services/api';

export default function App() {
  const [view, setView] = useState('landing'); // landing | import | brief | analyzing | workspace
  const [project, setProject] = useState(null);
  const [clips, setClips] = useState([]);
  const [sections, setSections] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(10);
  const [currentTime, setCurrentTime] = useState(0);
  const [editingBrief, setEditingBrief] = useState(false);

  const selectedSection = sections.find((s) => s.id === selectedSectionId) || null;
  const hasReadyTracks = sections.some((s) => s.music_status === 'READY');

  // Subscribe to Supabase Realtime for sections/tracks updates
  useEffect(() => {
    if (!project) return;

    const channel = supabase
      .channel('project-updates')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'sections',
        filter: `project_id=eq.${project.id}`
      }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setSections((prev) => prev.map((s) => s.id === payload.new.id ? payload.new : s));
        } else if (payload.eventType === 'INSERT') {
          setSections((prev) => {
            if (prev.some((s) => s.id === payload.new.id)) return prev;
            return [...prev, payload.new].sort((a, b) => a.section_order - b.section_order);
          });
        } else if (payload.eventType === 'DELETE') {
          setSections((prev) => prev.filter((s) => s.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tracks' }, (payload) => {
        setTracks((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project]);

  const handleImportComplete = useCallback((projectData, clipsData) => {
    setProject(projectData);
    setClips(clipsData);
    setView('brief');
  }, []);

  const handleBriefComplete = useCallback(async (sectionsData) => {
    setSections(sectionsData);
    setView('workspace');
    try {
      const [projectRes, tracksRes] = await Promise.all([
        api.getProject(project.id),
        api.getTracks(project.id),
      ]);
      setProject(projectRes.data);
      setTracks(tracksRes.data || []);
    } catch (e) {
      // ignore
    }
  }, [project]);

  const handleBriefUpdate = useCallback((brief) => {
    // CreativeBrief already called api.updateBrief and showed toast
    // Just update local state and close the modal
    setProject((prev) => prev ? { ...prev, ...brief } : prev);
    setEditingBrief(false);
  }, []);

  const handleSelectSection = useCallback((sectionId) => {
    setSelectedSectionId(sectionId);
  }, []);

  const handleTimeSeek = useCallback((time) => {
    setCurrentTime(time);
  }, []);

  const handleUpdateSection = useCallback(async (sectionId, data) => {
    try {
      const res = await api.updateSection(project.id, sectionId, data);
      setSections((prev) => prev.map((s) => s.id === sectionId ? res.data : s));
    } catch (e) {
      toast.error('Failed to update section');
    }
  }, [project]);

  const handleGenerateMusic = useCallback(async (sectionId) => {
    try {
      const res = await api.generateMusic(project.id, sectionId);
      if (res.data.message) {
        toast(res.data.message, { icon: 'ℹ️' });
      }
    } catch (e) {
      toast.error('Failed to generate music');
    }
  }, [project]);

  const handleMergeSections = useCallback(async (sectionId, direction) => {
    const ordered = [...sections].sort((a, b) => a.section_order - b.section_order);
    const idx = ordered.findIndex((s) => s.id === sectionId);
    const neighbor = direction === 'prev' ? ordered[idx - 1] : ordered[idx + 1];
    if (!neighbor) {
      toast.error('No adjacent section to merge');
      return;
    }
    try {
      const res = await api.mergeSections(project.id, [neighbor.id, sectionId]);
      const merged = res.data;
      const refreshed = await api.getSections(project.id);
      setSections(refreshed.data);
      setSelectedSectionId(merged.id);
      toast.success('Sections merged');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Merge failed');
    }
  }, [project, sections]);

  // Split at exact cursor position (ms precise)
  const handleSplitAtCursor = useCallback(async (time) => {
    // Find which section contains this time
    const orderedSections = [...sections].sort((a, b) => a.section_order - b.section_order);
    let targetSection = null;

    for (const sec of orderedSections) {
      if (time >= sec.start_time && time < sec.end_time) {
        targetSection = sec;
        break;
      }
    }

    if (!targetSection) {
      toast.error('No section at cursor position');
      return;
    }

    // Check if split point is too close to section boundaries (within 0.1s)
    if (time - targetSection.start_time < 0.1) {
      toast.error('Split point too close to section start');
      return;
    }
    if (targetSection.end_time - time < 0.1) {
      toast.error('Split point too close to section end');
      return;
    }

    try {
      await api.splitSection(project.id, targetSection.id, { splitAtTime: time });
      const refreshed = await api.getSections(project.id);
      setSections(refreshed.data);
      toast.success(`Section split at ${time.toFixed(2)}s`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Split failed');
    }
  }, [project, sections]);

  const handleRegenerateMusic = useCallback(async (sectionId, feedback) => {
    try {
      const res = await api.regenerateMusic(project.id, sectionId, feedback);
      if (res.data.message) {
        toast(res.data.message, { icon: 'ℹ️' });
      }
    } catch (e) {
      toast.error('Failed to regenerate music');
    }
  }, [project]);

  const handleExport = useCallback(async () => {
    toast('Export available in Phase 2', { icon: 'ℹ️' });
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: view === 'landing' ? 'auto' : 'hidden' }}>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#13151a',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.08)',
            fontFamily: "'DM Sans', sans-serif",
          },
        }}
      />

      {view === 'landing' && (
        <LandingPage onEnter={() => setView('import')} />
      )}

      {view === 'import' && (
        <ImportScreen onComplete={handleImportComplete} />
      )}

      {view === 'brief' && (
        <CreativeBrief
          project={project}
          clips={clips}
          onComplete={handleBriefComplete}
        />
      )}

      {view === 'analyzing' && (
        <ProgressOverlay currentStep="analyze" />
      )}

      {view === 'workspace' && (
        <>
          <TopBar hasReadyTracks={hasReadyTracks} onExport={handleExport} />
          {editingBrief && (
            <CreativeBrief
              project={project}
              clips={clips}
              mode="edit"
              onCancel={() => setEditingBrief(false)}
              onUpdate={handleBriefUpdate}
              onComplete={handleBriefComplete}
            />
          )}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              <div style={{ padding: '12px 16px', flex: '0 0 auto', maxHeight: '50vh' }}>
                <PreviewPlayer
                  clips={clips}
                  sections={sections}
                  tracks={tracks}
                  currentTime={currentTime}
                  onTimeUpdate={handleTimeSeek}
                  onPlayStateChange={() => {}}
                />
              </div>
              <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <Timeline
                  clips={clips}
                  sections={sections}
                  tracks={tracks}
                  zoomLevel={zoomLevel}
                  currentTime={currentTime}
                  selectedSectionId={selectedSectionId}
                  onSelectSection={handleSelectSection}
                  onTimeSeek={handleTimeSeek}
                  onZoomChange={setZoomLevel}
                  onMergeSections={handleMergeSections}
                  onSplitAtCursor={handleSplitAtCursor}
                />
              </div>
            </div>
            <SectionPanel
              section={selectedSection}
              project={project}
              onUpdateSection={handleUpdateSection}
              onGenerateMusic={handleGenerateMusic}
              onRegenerateMusic={handleRegenerateMusic}
              onEditBrief={() => setEditingBrief(true)}
            />
          </div>
        </>
      )}
    </div>
  );
}
