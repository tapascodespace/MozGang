import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getPreAnalysisStatus, confirmMusicStyle, submitBrief } from '../services/api';

export default function AIRecommendation({
  project,
  vibe,
  videoStructure: initialVideoStructure,
  themeSummary: initialThemeSummary,
  recommendedStyle: initialRecommendedStyle,
  onComplete,
  onBack,
}) {
  const [musicStyle, setMusicStyle] = useState(initialRecommendedStyle || '');
  const [videoStructure, setVideoStructure] = useState(initialVideoStructure || null);
  const [themeSummary, setThemeSummary] = useState(initialThemeSummary || null);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pollingStatus, setPollingStatus] = useState('checking');

  // Poll for pre-analysis completion and update state when ready
  useEffect(() => {
    let pollInterval;
    let isMounted = true;

    const checkStatus = async () => {
      try {
        const { data } = await getPreAnalysisStatus(project.id);

        if (!isMounted) return;

        if (data.status === 'complete') {
          setPollingStatus('ready');

          // Update all fields from pre-analysis
          if (data.video_structure) {
            setVideoStructure(data.video_structure);
          }
          if (data.theme_summary) {
            setThemeSummary(data.theme_summary);
          }
          if (data.recommended_music_style && !musicStyle) {
            setMusicStyle(data.recommended_music_style);
          }

          clearInterval(pollInterval);
        } else if (data.status === 'failed') {
          setPollingStatus('ready');
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Status check failed:', err);
      }
    };

    // Start polling (every 1 second for faster response)
    checkStatus();
    pollInterval = setInterval(checkStatus, 1000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [project.id, musicStyle]);

  const handleConfirm = async () => {
    if (!musicStyle.trim()) {
      toast.error('Please enter a music style.');
      return;
    }

    setSubmitting(true);

    try {
      toast.loading('Setting up your project...', { id: 'confirm' });

      // Confirm the music style as gold standard
      await confirmMusicStyle(project.id, musicStyle.trim());

      // Submit the brief with the vibe as overall_energy and music_style_direction
      const brief = {
        overall_energy: vibe,
        music_style_direction: musicStyle.trim(),
        references_text: '',
      };

      const { data } = await submitBrief(project.id, brief);
      const sections = data.sections || data;

      toast.success('Ready to score!', { id: 'confirm' });
      onComplete(sections);
    } catch (err) {
      console.error('Confirmation failed:', err);
      toast.error(err?.response?.data?.detail || 'Something went wrong.', {
        id: 'confirm',
      });
      setSubmitting(false);
    }
  };

  const isLoading = pollingStatus === 'checking';

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {isLoading ? (
          <>
            <div style={styles.loadingIcon}>
              <div style={styles.spinner} />
            </div>
            <h2 style={styles.heading}>Analyzing your video...</h2>
            <p style={styles.subtext}>
              We're detecting scenes, pacing, and content type.
            </p>
          </>
        ) : (
          <>
            <h2 style={styles.heading}>Here's what we found</h2>

            <div style={styles.infoCard}>
              <p style={styles.summaryText}>
                You want a <span style={styles.highlight}>{vibe}</span> vibe
                {videoStructure && (
                  <> and your video looks like a <span style={styles.highlight}>{videoStructure}</span></>
                )}
                .
              </p>

              {themeSummary && (
                <p style={styles.themeSummary}>"{themeSummary}"</p>
              )}
            </div>

            <div style={styles.styleSection}>
              <p style={styles.recommendText}>
                We recommend going with:
              </p>

              {isEditing ? (
                <div style={styles.editContainer}>
                  <input
                    type="text"
                    value={musicStyle}
                    onChange={(e) => setMusicStyle(e.target.value)}
                    placeholder="e.g. Upbeat Lofi Hip-Hop"
                    style={styles.styleInput}
                    autoFocus
                    disabled={submitting}
                  />
                  <button
                    onClick={() => setIsEditing(false)}
                    style={styles.doneEditBtn}
                    disabled={submitting}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div style={styles.styleDisplay}>
                  <span style={styles.styleValue}>{musicStyle || '—'}</span>
                  <button
                    onClick={() => setIsEditing(true)}
                    style={styles.editIconBtn}
                    disabled={submitting}
                    title="Edit style"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>

            <p style={styles.note}>
              This style will be the default for all sections. Individual sections
              may vary slightly based on their content.
            </p>

            <div style={styles.actions}>
              <button
                onClick={onBack}
                style={styles.backBtn}
                disabled={submitting}
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting || !musicStyle.trim()}
                style={{
                  ...styles.confirmBtn,
                  opacity: submitting || !musicStyle.trim() ? 0.4 : 1,
                  cursor: submitting || !musicStyle.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Starting...' : 'Score My Video'}
              </button>
            </div>
          </>
        )}
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
    maxWidth: 500,
    background: '#13151a',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '40px 36px',
    animation: 'slideUp 0.35s ease-out',
    textAlign: 'center',
  },
  loadingIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 24,
  },
  spinner: {
    width: 48,
    height: 48,
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: '#45f5c5',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  heading: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 28,
    fontWeight: 400,
    color: '#ffffff',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.5,
    marginBottom: 24,
  },
  infoCard: {
    background: '#0b0c10',
    borderRadius: 12,
    padding: '24px',
    marginBottom: 24,
    border: '1px solid rgba(255,255,255,0.06)',
  },
  summaryText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 1.6,
    margin: 0,
    marginBottom: 12,
  },
  highlight: {
    color: '#45f5c5',
    fontWeight: 600,
  },
  themeSummary: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
    margin: 0,
  },
  styleSection: {
    marginBottom: 20,
    textAlign: 'center',
  },
  recommendText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
  },
  styleDisplay: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 20px',
    background: '#0b0c10',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
  },
  styleValue: {
    fontSize: 18,
    fontWeight: 600,
    color: '#45f5c5',
  },
  editIconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    padding: 0,
    background: 'rgba(255,255,255,0.08)',
    border: 'none',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  editContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  styleInput: {
    width: '100%',
    padding: '14px 16px',
    background: '#0b0c10',
    border: '1px solid #45f5c5',
    borderRadius: 10,
    color: '#ffffff',
    fontSize: 16,
    outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
    textAlign: 'center',
  },
  doneEditBtn: {
    padding: '10px 20px',
    background: 'rgba(69,245,197,0.15)',
    border: 'none',
    borderRadius: 8,
    color: '#45f5c5',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  note: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 24,
    textAlign: 'center',
  },
  actions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
  },
  backBtn: {
    padding: '14px 24px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 10,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  confirmBtn: {
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

// Add CSS animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);
