import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Sparkles, RefreshCw, Music, Pencil, Zap, Eye, Palette, Gauge, Activity } from 'lucide-react';

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
    flexDirection: 'column',
    height: '100%',
    color: T.muted,
    fontSize: 14,
    textAlign: 'center',
    padding: 24,
    gap: 12,
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${T.stroke}`,
    borderRadius: 10,
    padding: '14px 14px',
    overflow: 'hidden',
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
  briefBody: {
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
    display: 'flex',
    alignItems: 'center',
    gap: 4,
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
    transition: 'border-color 0.2s',
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
    padding: '12px 0',
    borderRadius: 10,
    border: 'none',
    background: T.accent,
    color: '#0a0b0d',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    letterSpacing: '0.02em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  regenerateBtn: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 8,
    border: `1px solid ${T.stroke}`,
    background: 'rgba(255,255,255,0.06)',
    color: T.ink,
    fontWeight: 500,
    fontSize: 13,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
    transition: 'border-color 0.2s',
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

/* ── sub-components ── */
function GeneratingWaveform() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }}>
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            background: '#0a0b0d',
          }}
          animate={{
            height: [4, 14, 6, 12, 4],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.12,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/* ── component ── */
export default function SectionPanel({
  section,
  project,
  onUpdateSection,
  onGenerateMusic,
  onRegenerateMusic,
  onEditBrief,
}) {
  const [briefOpen, setBriefOpen] = useState(true);
  const [feedback, setFeedback] = useState('');

  /* ── empty state ── */
  if (!section) {
    return (
      <aside style={styles.root}>
        <motion.div
          style={styles.emptyState}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Music size={32} color={T.muted2} />
          </motion.div>
          <span>Select a section on the timeline</span>
        </motion.div>
      </aside>
    );
  }

  const isGenerating = section.music_status === 'GENERATING';
  const isReady = section.music_status === 'READY';
  const track = section.generated_track;

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

  const fieldVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: (i) => ({
      opacity: 1,
      x: 0,
      transition: { delay: i * 0.05, duration: 0.3 },
    }),
  };

  return (
    <aside style={styles.root}>
      <AnimatePresence mode="wait">
        <motion.div
          key={section.id}
          style={styles.scrollArea}
          initial={{ opacity: 0, x: 15 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -15 }}
          transition={{ duration: 0.25 }}
        >

          {/* ──────── 1. Creative Brief Summary ──────── */}
          {project && (
            <div style={styles.card}>
              <div
                style={styles.cardHeader}
                onClick={() => setBriefOpen((o) => !o)}
              >
                <span style={styles.cardTitle}>Creative Brief</span>
                <motion.div
                  animate={{ rotate: briefOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={14} color={T.muted2} />
                </motion.div>
              </div>

              <AnimatePresence initial={false}>
                {briefOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden', marginTop: 12 }}
                  >
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
                      <motion.button
                        style={styles.editLink}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditBrief?.();
                        }}
                      >
                        <Pencil size={11} /> Edit Brief
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ──────── 2. Section Details ──────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>
              Section Details
            </span>

            {/* section_type */}
            <motion.div style={styles.fieldGroup} custom={0} variants={fieldVariants} initial="hidden" animate="visible">
              <label style={labelStyle}>Section Type</label>
              <select
                style={styles.select}
                value={section.section_type || ''}
                onChange={(e) => handleFieldChange('section_type', e.target.value)}
              >
                {SECTION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </motion.div>

            {/* scene_type */}
            <motion.div style={styles.fieldGroup} custom={1} variants={fieldVariants} initial="hidden" animate="visible">
              <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Eye size={10} /> Scene Type
              </span>
              <span style={styles.badge}>{section.scene_type ?? '—'}</span>
            </motion.div>

            {/* emotional_tone */}
            <motion.div style={styles.fieldGroup} custom={2} variants={fieldVariants} initial="hidden" animate="visible">
              <label style={labelStyle}>Emotional Tone</label>
              <select
                style={styles.select}
                value={section.emotional_tone || ''}
                onChange={(e) => handleFieldChange('emotional_tone', e.target.value)}
              >
                {EMOTIONAL_TONES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </motion.div>

            {/* detected_theme */}
            <motion.div style={styles.fieldGroup} custom={3} variants={fieldVariants} initial="hidden" animate="visible">
              <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Palette size={10} /> Detected Theme
              </span>
              <span style={styles.readOnly}>{section.detected_theme ?? '—'}</span>
            </motion.div>

            {/* dominant_visual */}
            <motion.div style={styles.fieldGroup} custom={4} variants={fieldVariants} initial="hidden" animate="visible">
              <span style={labelStyle}>Dominant Visual</span>
              <span style={styles.readOnly}>{section.dominant_visual ?? '—'}</span>
            </motion.div>

            {/* suggested_music_style */}
            <motion.div style={styles.fieldGroup} custom={5} variants={fieldVariants} initial="hidden" animate="visible">
              <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Music size={10} /> Suggested Music Style
              </span>
              <span style={styles.readOnly}>{section.suggested_music_style ?? '—'}</span>
            </motion.div>

            {/* energy_level */}
            <motion.div style={styles.fieldGroup} custom={6} variants={fieldVariants} initial="hidden" animate="visible">
              <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Zap size={10} /> Energy Level
              </span>
              <span style={styles.badge}>{section.energy_level ?? '—'}</span>
            </motion.div>

            {/* pacing */}
            <motion.div style={styles.fieldGroup} custom={7} variants={fieldVariants} initial="hidden" animate="visible">
              <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Activity size={10} /> Pacing
              </span>
              <span style={styles.badge}>{section.pacing ?? '—'}</span>
            </motion.div>
          </div>

          {/* ──────── 3. Generate Music ──────── */}
          <motion.button
            style={{
              ...styles.generateBtn,
              ...(isGenerating ? { opacity: 0.7, cursor: 'wait' } : {}),
            }}
            disabled={isGenerating}
            onClick={handleGenerate}
            whileHover={!isGenerating ? { scale: 1.02, boxShadow: '0 0 20px rgba(69,245,197,0.3)' } : {}}
            whileTap={!isGenerating ? { scale: 0.98 } : {}}
          >
            {isGenerating ? (
              <>
                <GeneratingWaveform />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Generate Music</span>
              </>
            )}
          </motion.button>

          {/* ──────── 5. Feedback input ──────── */}
          <div style={styles.fieldGroup}>
            <label style={labelStyle}>Feedback</label>
            <textarea
              style={styles.feedbackInput}
              rows={3}
              placeholder="Make it more tense, add strings..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onFocus={(e) => { e.target.style.borderColor = T.accent; }}
              onBlur={(e) => { e.target.style.borderColor = T.stroke; }}
            />
          </div>

          {/* ──────── 4. Regenerate (visible when READY) ──────── */}
          <AnimatePresence>
            {isReady && (
              <motion.button
                style={styles.regenerateBtn}
                onClick={handleRegenerate}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                whileHover={{ scale: 1.02, background: 'rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.98 }}
              >
                <RefreshCw size={14} />
                Regenerate
              </motion.button>
            )}
          </AnimatePresence>

          {/* ──────── 6. Track info (when READY) ──────── */}
          <AnimatePresence>
            {isReady && track && (
              <motion.div
                style={styles.trackInfoCard}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <span style={{ ...labelStyle, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Music size={10} /> Track Info
                </span>

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
                    {track.mood_tags.map((tag, i) => (
                      <motion.span
                        key={tag}
                        style={styles.pill()}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        {tag}
                      </motion.span>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
