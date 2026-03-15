import { useState } from 'react';
import toast from 'react-hot-toast';
import { setVibe, startPreAnalysis } from '../services/api';

const VIBE_OPTIONS = [
  { id: 'Energetic', label: 'Energetic', emoji: '', desc: 'High energy, upbeat, exciting' },
  { id: 'Chill', label: 'Chill', emoji: '', desc: 'Relaxed, lofi, laid-back' },
  { id: 'Dramatic', label: 'Dramatic', emoji: '', desc: 'Cinematic, intense, powerful' },
  { id: 'Playful', label: 'Playful', emoji: '', desc: 'Fun, quirky, lighthearted' },
  { id: 'Inspirational', label: 'Inspirational', emoji: '', desc: 'Uplifting, motivational' },
  { id: 'Mysterious', label: 'Mysterious', emoji: '', desc: 'Suspenseful, intriguing, dark' },
  { id: 'Romantic', label: 'Romantic', emoji: '', desc: 'Soft, emotional, intimate' },
  { id: 'Epic', label: 'Epic', emoji: '', desc: 'Grand, orchestral, powerful' },
  { id: 'Nostalgic', label: 'Nostalgic', emoji: '', desc: 'Retro, vintage, warm' },
  { id: 'Confident', label: 'Confident', emoji: '', desc: 'Bold, assertive, modern' },
];

export default function VibeSelector({ project, onVibeSelected }) {
  const [selectedVibe, setSelectedVibe] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSelect = async (vibe) => {
    setSelectedVibe(vibe);
  };

  const handleContinue = async () => {
    if (!selectedVibe) {
      toast.error('Please select a vibe for your video.');
      return;
    }

    setSubmitting(true);

    try {
      toast.loading('Analyzing your video...', { id: 'vibe' });

      // Set the vibe and start/continue pre-analysis
      const { data } = await setVibe(project.id, selectedVibe);

      toast.success('Got it!', { id: 'vibe' });

      // Pass the vibe and any recommendation data to parent
      onVibeSelected({
        vibe: selectedVibe,
        video_structure: data.video_structure,
        theme_summary: data.theme_summary,
        recommended_music_style: data.recommended_music_style,
      });
    } catch (err) {
      console.error('Vibe selection failed:', err);
      toast.error('Something went wrong. Try again.', { id: 'vibe' });
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.heading}>What vibe should your video have?</h2>
        <p style={styles.subtext}>
          Select the overall feel. We'll recommend music that matches.
        </p>

        <div style={styles.grid}>
          {VIBE_OPTIONS.map((vibe) => (
            <button
              key={vibe.id}
              onClick={() => handleSelect(vibe.id)}
              disabled={submitting}
              style={{
                ...styles.vibeCard,
                borderColor: selectedVibe === vibe.id ? '#45f5c5' : 'rgba(255,255,255,0.08)',
                background: selectedVibe === vibe.id ? 'rgba(69,245,197,0.08)' : '#0b0c10',
                opacity: submitting ? 0.5 : 1,
              }}
            >
              <span style={styles.vibeEmoji}>{vibe.emoji}</span>
              <span style={styles.vibeLabel}>{vibe.label}</span>
              <span style={styles.vibeDesc}>{vibe.desc}</span>
            </button>
          ))}
        </div>

        <button
          onClick={handleContinue}
          disabled={!selectedVibe || submitting}
          style={{
            ...styles.continueBtn,
            opacity: !selectedVibe || submitting ? 0.4 : 1,
            cursor: !selectedVibe || submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Analyzing...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: "'DM Sans', sans-serif",
    animation: 'fadeIn 0.25s ease-out',
  },
  modal: {
    width: '100%',
    maxWidth: 600,
    background: '#13151a',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '40px 36px',
    animation: 'slideUp 0.35s ease-out',
  },
  heading: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 28,
    fontWeight: 400,
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.5,
    marginBottom: 32,
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
    marginBottom: 32,
  },
  vibeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '16px 18px',
    background: '#0b0c10',
    border: '2px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left',
    fontFamily: "'DM Sans', sans-serif",
  },
  vibeEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  vibeLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: '#ffffff',
    marginBottom: 4,
  },
  vibeDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  continueBtn: {
    width: '100%',
    padding: '14px 32px',
    background: '#45f5c5',
    color: '#0b0c10',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 10,
    border: 'none',
    transition: 'opacity 0.2s, transform 0.15s',
    fontFamily: "'DM Sans', sans-serif",
  },
};
