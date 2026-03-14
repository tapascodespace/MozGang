import { useState } from 'react';
import toast from 'react-hot-toast';

const PRODUCT_NAME = 'ScoreFlow';

const styles = {
  topbar: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: 56,
    background: 'rgba(11,12,16,0.85)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  logo: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 22,
    color: '#45f5c5',
    letterSpacing: '-0.02em',
  },
  center: {
    display: 'flex',
    gap: 8,
  },
  howItWorks: {
    background: 'none',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    padding: '6px 14px',
    borderRadius: 8,
    transition: 'all 0.2s',
    fontFamily: "'DM Sans', sans-serif",
  },
  exportBtn: {
    background: '#45f5c5',
    color: '#0b0c10',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 20px',
    borderRadius: 8,
    transition: 'all 0.2s',
  },
  exportDisabled: {
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.25)',
    cursor: 'not-allowed',
  },
  modal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  modalCard: {
    background: '#13151a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 40,
    maxWidth: 480,
    width: '90%',
  },
  step: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 24,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'rgba(69,245,197,0.12)',
    color: '#45f5c5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: 14,
    flexShrink: 0,
  },
  stepText: {
    fontSize: 15,
    lineHeight: 1.5,
  },
  stepTitle: {
    fontWeight: 600,
    marginBottom: 4,
  },
};

export default function TopBar({ hasReadyTracks, onExport }) {
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const handleExport = () => {
    if (!hasReadyTracks) {
      toast('Export is available when at least one section has music generated.', { icon: 'ℹ️' });
      return;
    }
    onExport?.();
  };

  return (
    <>
      <div style={styles.topbar}>
        <div style={styles.logo}>{PRODUCT_NAME}</div>
        <div style={styles.center}>
          <button
            style={styles.howItWorks}
            onClick={() => setShowHowItWorks(true)}
            onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={(e) => { e.target.style.background = 'none'; }}
          >
            How It Works
          </button>
        </div>
        <button
          style={{ ...styles.exportBtn, ...(hasReadyTracks ? {} : styles.exportDisabled) }}
          onClick={handleExport}
        >
          Export
        </button>
      </div>

      {showHowItWorks && (
        <div style={styles.modal} onClick={() => setShowHowItWorks(false)}>
          <div style={styles.modalCard} className="slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: 32, fontSize: 24 }}>How It Works</h2>
            <div style={styles.step}>
              <div style={styles.stepNumber}>1</div>
              <div style={styles.stepText}>
                <div style={styles.stepTitle}>Import</div>
                <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Drop your video clips onto the screen. We accept MP4, MOV, and WebM files.
                </div>
              </div>
            </div>
            <div style={styles.step}>
              <div style={styles.stepNumber}>2</div>
              <div style={styles.stepText}>
                <div style={styles.stepTitle}>Describe</div>
                <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Tell us the energy and style you want. Our AI analyzes your video structure.
                </div>
              </div>
            </div>
            <div style={styles.step}>
              <div style={styles.stepNumber}>3</div>
              <div style={styles.stepText}>
                <div style={styles.stepTitle}>Score</div>
                <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Generate unique music for each section. Refine with feedback until it's perfect.
                </div>
              </div>
            </div>
            <button
              style={{ ...styles.exportBtn, width: '100%', marginTop: 8 }}
              onClick={() => setShowHowItWorks(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
