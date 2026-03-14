import { useState, useCallback, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
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
  const [view, setView] = useState('import'); // import | brief | analyzing | workspace
  const [project, setProject] = useState(null);
  const [clips, setClips] = useState([]);
  const [sections, setSections] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(10);
  const [currentTime, setCurrentTime] = useState(0);

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
          setSections((prev) => [...prev, payload.new].sort((a, b) => a.section_order - b.section_order));
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
      const res = await api.getProject(project.id);
      setProject(res.data);
    } catch (e) {
      // ignore
    }
  }, [project]);

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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', flex: '0 0 auto' }}>
                <PreviewPlayer
                  clips={clips}
                  currentTime={currentTime}
                  onTimeUpdate={handleTimeSeek}
                  onPlayStateChange={() => {}}
                />
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
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
                />
              </div>
            </div>
            <SectionPanel
              section={selectedSection}
              project={project}
              onUpdateSection={handleUpdateSection}
              onGenerateMusic={handleGenerateMusic}
              onRegenerateMusic={handleRegenerateMusic}
            />
          </div>
        </>
      )}
    </div>
  );
}
