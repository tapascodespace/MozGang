import { useState } from 'react';

/* ── design tokens ── */
const T = {
  bgCard:  '#13151a',
  stroke:  'rgba(255,255,255,0.08)',
  accent:  '#45f5c5',
  muted:   'rgba(255,255,255,0.6)',
  muted2:  'rgba(255,255,255,0.4)',
  ink:     '#ffffff',
};

/* ── shared label style ── */
const labelStyle = {
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: T.muted2,
  marginBottom: 4,
  display: 'block',
};

/* ── enums ── */
const SECTION_TYPES = [
  'Hook','Intro','Setup','Build','Anticipation','Reveal','Reaction',
  'Demonstration','Montage','Transition','Recap','Climax','Cooldown',
  'Testimonial','CTA','Outro',
];

const EMOTIONAL_TONES = [
  'Energetic','Playful','Suspenseful','Inspirational','Dramatic','Emotional',
  'Calm','Informative','Nostalgic','Mysterious','Triumphant','Melancholic',
  'Romantic','Epic','Quirky','Aggressive','Dreamy','Dark','Confident',
  'Humorous','Uplifting','Tense','Bittersweet','Rebellious','Serene',
  'Whimsical','Gritty','Hopeful','Eerie','Empowering',
];

/* ── reusable inline styles ── */
const styles = {
  root: {
    width: '22vw',
    minWidth: 280,
    maxWidth: 360,
    height: '100%',
    background: T.bgCard,
    borderLeft: `1px solid ${T.stroke}`,
    display: 'flex',
    flexDirection: 'column',
    color: T.ink,
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: T.muted,
    fontSize: 14,
    textAlign: 'center',
    padding: 24,
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${T.stroke}`,
    borderRadius: 10,
    padding: '14px 14px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none',
  },
  cardTitle: {
    ...labelStyle,
    marginBottom: 0,
    fontSize: 11,
  },
  chevron: {
    color: T.muted2,
    fontSize: 10,
    transition: 'transform 0.2s',
  },
  briefBody: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  briefRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  briefValue: {
    fontSize: 13,
    color: T.muted,
    lineHeight: 1.4,
  },
  editLink: {
    fontSize: 12,
    color: T.accent,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    alignSelf: 'flex-start',
    marginTop: 4,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  opsBody: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  opsRow: {
    display: 'flex',
    gap: 8,
  },
  splitRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  opBtn: {
    padding: '9px 12px',
    background: 'rgba(255,255,255,0.06)',
    color: T.ink,
    borderRadius: 8,
    border: `1px solid ${T.stroke}`,
    fontSize: 12,
    cursor: 'pointer',
  },
  select: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${T.stroke}`,
    borderRadius: 6,
    padding: '7px 10px',
    color: T.ink,
    fontSize: 13,
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    backgroundImage:
      `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.4)'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '10px 6px',
  },
  badge: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.08)',
    color: T.muted,
    fontSize: 12,
    padding: '3px 10px',
    borderRadius: 999,
    lineHeight: 1.4,
  },
  readOnly: {
    fontSize: 13,
    color: T.muted,
    lineHeight: 1.4,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  generateBtn: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: T.accent,
    color: '#0a0b0d',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    letterSpacing: '0.02em',
    transition: 'opacity 0.15s',
  },
  generateBtnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  regenerateBtn: {
    width: '100%',
    padding: '9px 0',
    borderRadius: 8,
    border: `1px solid ${T.stroke}`,
    background: 'rgba(255,255,255,0.06)',
    color: T.ink,
    fontWeight: 500,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  feedbackInput: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${T.stroke}`,
    borderRadius: 6,
    padding: '8px 10px',
    color: T.ink,
    fontSize: 13,
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  pill: (bg) => ({
    display: 'inline-block',
    background: bg || 'rgba(69,245,197,0.15)',
    color: T.accent,
    fontSize: 11,
    padding: '3px 9px',
    borderRadius: 999,
    marginRight: 6,
    marginBottom: 4,
    lineHeight: 1.4,
  }),
  trackInfoCard: {
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${T.stroke}`,
    borderRadius: 10,
    padding: '14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  trackRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  trackStat: {
    fontSize: 13,
    color: T.muted,
  },
  trackStatValue: {
    color: T.ink,
    fontWeight: 500,
  },
};

/* ── helpers ── */
function truncate(str, len = 80) {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

/* ── component ── */
export default function SectionPanel({
  section,
  project,
  sections,
  clips,
  onUpdateSection,
  onGenerateMusic,
  onRegenerateMusic,
  onEditBrief,
  onMergeSections,
  onSplitSection,
}) {
  const [briefOpen, setBriefOpen] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [splitClipId, setSplitClipId] = useState('');

  /* ── empty state ── */
  if (!section) {
    return (
      <aside style={styles.root}>
        <div style={styles.emptyState}>Select a section on the timeline.</div>
      </aside>
    );
  }

  const isGenerating = section.music_status === 'GENERATING';
  const isReady = section.music_status === 'READY';
  const track = section.generated_track;

  const orderedSections = sections
    ? [...sections].sort((a, b) => a.section_order - b.section_order)
    : [];
  const sectionIndex = orderedSections.findIndex((s) => s.id === section.id);
  const hasPrev = sectionIndex > 0;
  const hasNext = sectionIndex >= 0 && sectionIndex < orderedSections.length - 1;

  const clipOptions = (section.clip_ids || [])
    .map((id) => clips?.find((c) => c.id === id))
    .filter(Boolean);

  function handleFieldChange(field, value) {
    if (onUpdateSection) {
      onUpdateSection(section.id, { [field]: value });
    }
  }

  function handleGenerate() {
    if (!isGenerating && onGenerateMusic) {
      onGenerateMusic(section.id);
    }
  }

  function handleRegenerate() {
    if (onRegenerateMusic) {
      onRegenerateMusic(section.id, feedback);
      setFeedback('');
    }
  }

  return (
    <aside style={styles.root}>
      <div style={styles.scrollArea}>

        {/* ──────── 1. Creative Brief Summary ──────── */}
        {project && (
          <div style={styles.card}>
            <div
              style={styles.cardHeader}
              onClick={() => setBriefOpen((o) => !o)}
            >
              <span style={styles.cardTitle}>Creative Brief</span>
              <span
                style={{
                  ...styles.chevron,
                  transform: briefOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              >
                ▾
              </span>
            </div>

            {briefOpen && (
              <div style={styles.briefBody}>
                <div style={styles.briefRow}>
                  <span style={labelStyle}>Overall Energy</span>
                  <span style={styles.briefValue}>
                    {project.overall_energy ?? '—'}
                  </span>
                </div>
                <div style={styles.briefRow}>
                  <span style={labelStyle}>Music Style Direction</span>
                  <span style={styles.briefValue}>
                    {truncate(project.music_style_direction)}
                  </span>
                </div>
                <div style={styles.briefRow}>
                  <span style={labelStyle}>References</span>
                  <span style={styles.briefValue}>
                    {truncate(project.references_text)}
                  </span>
                </div>
                <button
                  style={styles.editLink}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditBrief?.();
                  }}
                >
                  Edit Brief
                </button>
              </div>
            )}
          </div>
        )}

        {/* ──────── 1.5 Section Operations ──────── */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>Section Operations</span>
          </div>
          <div style={styles.opsBody}>
            <div style={styles.opsRow}>
              <button
                style={{ ...styles.opBtn, opacity: hasPrev ? 1 : 0.4 }}
                onClick={() => hasPrev && onMergeSections?.(section.id, 'prev')}
                disabled={!hasPrev}
              >
                Merge Previous
              </button>
              <button
                style={{ ...styles.opBtn, opacity: hasNext ? 1 : 0.4 }}
                onClick={() => hasNext && onMergeSections?.(section.id, 'next')}
                disabled={!hasNext}
              >
                Merge Next
              </button>
            </div>
            <div style={styles.splitRow}>
              <label style={labelStyle}>Split At Clip</label>
              <select
                style={styles.select}
                value={splitClipId}
                onChange={(e) => setSplitClipId(e.target.value)}
              >
                <option value="">Select clip boundary</option>
                {clipOptions.map((clip, idx) => (
                  <option key={clip.id} value={clip.id}>
                    {idx + 1}. {truncate(clip.filename)}
                  </option>
                ))}
              </select>
              <button
                style={styles.opBtn}
                onClick={() => onSplitSection?.(section.id, splitClipId)}
                disabled={!splitClipId}
              >
                Split Section
              </button>
            </div>
          </div>
        </div>

        {/* ──────── 2. Section Details ──────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>
            Section Details
          </span>

          {/* section_type – dropdown */}
          <div style={styles.fieldGroup}>
            <label style={labelStyle}>Section Type</label>
            <select
              style={styles.select}
              value={section.section_type || ''}
              onChange={(e) => handleFieldChange('section_type', e.target.value)}
            >
              {SECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* scene_type – read-only badge */}
          <div style={styles.fieldGroup}>
            <span style={labelStyle}>Scene Type</span>
            <span style={styles.badge}>{section.scene_type ?? '—'}</span>
          </div>

          {/* emotional_tone – dropdown */}
          <div style={styles.fieldGroup}>
            <label style={labelStyle}>Emotional Tone</label>
            <select
              style={styles.select}
              value={section.emotional_tone || ''}
              onChange={(e) =>
                handleFieldChange('emotional_tone', e.target.value)
              }
            >
              {EMOTIONAL_TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* detected_theme – read-only */}
          <div style={styles.fieldGroup}>
            <span style={labelStyle}>Detected Theme</span>
            <span style={styles.readOnly}>
              {section.detected_theme ?? '—'}
            </span>
          </div>

          {/* dominant_visual – read-only */}
          <div style={styles.fieldGroup}>
            <span style={labelStyle}>Dominant Visual</span>
            <span style={styles.readOnly}>
              {section.dominant_visual ?? '—'}
            </span>
          </div>

          {/* suggested_music_style – read-only */}
          <div style={styles.fieldGroup}>
            <span style={labelStyle}>Suggested Music Style</span>
            <span style={styles.readOnly}>
              {section.suggested_music_style ?? '—'}
            </span>
          </div>

          {/* energy_level – read-only badge */}
          <div style={styles.fieldGroup}>
            <span style={labelStyle}>Energy Level</span>
            <span style={styles.badge}>{section.energy_level ?? '—'}</span>
          </div>

          {/* pacing – read-only badge */}
          <div style={styles.fieldGroup}>
            <span style={labelStyle}>Pacing</span>
            <span style={styles.badge}>{section.pacing ?? '—'}</span>
          </div>
        </div>

        {/* ──────── 3. Generate Music ──────── */}
        <button
          style={{
            ...styles.generateBtn,
            ...(isGenerating ? styles.generateBtnDisabled : {}),
          }}
          disabled={isGenerating}
          onClick={handleGenerate}
        >
          {isGenerating ? 'Generating...' : 'Generate Music'}
        </button>

        {/* ──────── 5. Feedback input ──────── */}
        <div style={styles.fieldGroup}>
          <label style={labelStyle}>Feedback</label>
          <textarea
            style={styles.feedbackInput}
            rows={3}
            placeholder="Make it more tense, add strings..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>

        {/* ──────── 4. Regenerate (visible when READY) ──────── */}
        {isReady && (
          <button style={styles.regenerateBtn} onClick={handleRegenerate}>
            Regenerate
          </button>
        )}

        {/* ──────── 6. Track info (when READY) ──────── */}
        {isReady && track && (
          <div style={styles.trackInfoCard}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Track Info</span>

            <div style={styles.trackRow}>
              {track.duration != null && (
                <span style={styles.trackStat}>
                  Duration:{' '}
                  <span style={styles.trackStatValue}>{track.duration}s</span>
                </span>
              )}
              {track.bpm != null && (
                <span style={styles.trackStat}>
                  BPM:{' '}
                  <span style={styles.trackStatValue}>{track.bpm}</span>
                </span>
              )}
            </div>

            {Array.isArray(track.mood_tags) && track.mood_tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {track.mood_tags.map((tag) => (
                  <span key={tag} style={styles.pill()}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
