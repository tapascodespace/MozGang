const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  },
  card: {
    background: '#13151a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 48,
    maxWidth: 420,
    width: '90%',
    textAlign: 'center',
  },
  title: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 24,
    marginBottom: 32,
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    textAlign: 'left',
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  spinner: {
    width: 48,
    height: 48,
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: '#45f5c5',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 24px',
  },
};

const STEPS = [
  { key: 'upload', label: 'Uploading clips...' },
  { key: 'frames', label: 'Extracting frames...' },
  { key: 'transcribe', label: 'Transcribing audio...' },
  { key: 'analyze', label: 'Analysing video structure...' },
];

export default function ProgressOverlay({ currentStep = 'analyze' }) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div style={styles.overlay}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.card} className="slide-up">
        <div style={styles.spinner} />
        <h2 style={styles.title}>Analyzing your video</h2>
        <div style={styles.steps}>
          {STEPS.map((step, i) => {
            let color;
            if (i < currentIdx) color = '#45f5c5';
            else if (i === currentIdx) color = '#F5A623';
            else color = 'rgba(255,255,255,0.15)';

            return (
              <div key={step.key} style={styles.step}>
                <div
                  style={{
                    ...styles.dot,
                    background: color,
                    ...(i === currentIdx ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
                  }}
                />
                <span style={{ color: i <= currentIdx ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                  {i < currentIdx ? '✓ ' : ''}{step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
