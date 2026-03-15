import { useState } from 'react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { submitBrief, updateBrief } from '../services/api';

// --- Animated Equalizer (replaces static Music icon) ---
function AnimatedEqualizer() {
  const bars = [
    { dur: 0.4, heights: [8, 22, 6, 18, 8] },
    { dur: 0.7, heights: [14, 8, 24, 10, 14] },
    { dur: 0.5, heights: [6, 20, 8, 22, 6] },
    { dur: 0.9, heights: [18, 6, 16, 8, 18] },
    { dur: 0.6, heights: [10, 24, 12, 20, 10] },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 24, marginRight: 12 }}>
      {bars.map((b, i) => (
        <motion.div
          key={i}
          style={{ width: 4, borderRadius: 2, background: '#b87aff' }}
          animate={{ height: b.heights }}
          transition={{ duration: b.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// --- Energy Visual Indicator ---
function EnergyIndicator({ text }) {
  const keywords = {
    low: ['calm', 'chill', 'ambient', 'soft', 'gentle', 'quiet', 'relaxed', 'mellow', 'peaceful'],
    med: ['moderate', 'steady', 'warm', 'light', 'smooth', 'easy', 'balanced'],
    rising: ['build', 'rising', 'growing', 'cinematic', 'uplifting', 'emotional', 'inspiring', 'hopeful'],
    high: ['intense', 'explosive', 'hype', 'aggressive', 'epic', 'powerful', 'energetic', 'fast', 'heavy', 'wild', 'peak'],
  };

  const t = text.toLowerCase();
  let level = 0;
  if (!t.trim()) level = 0;
  else if (keywords.high.some(k => t.includes(k))) level = 90;
  else if (keywords.rising.some(k => t.includes(k))) level = 65;
  else if (keywords.med.some(k => t.includes(k))) level = 40;
  else if (keywords.low.some(k => t.includes(k))) level = 20;
  else if (t.trim().length > 3) level = 35; // typed something but no keyword match

  const label = level === 0 ? '' : level <= 25 ? 'Low' : level <= 50 ? 'Medium' : level <= 75 ? 'Rising' : 'High';
  const glowIntensity = level > 70 ? 0.35 : level > 40 ? 0.15 : 0.05;

  if (level === 0) return null;

  return (
    <motion.div
      style={{ marginTop: 8 }}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.3 }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {/* Track */}
        <div style={{
          flex: 1, height: 6, borderRadius: 3,
          background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
        }}>
          <motion.div
            style={{
              height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg, #9333ea, #b87aff)',
              boxShadow: `0 0 ${level > 70 ? 12 : 6}px rgba(184,122,255,${glowIntensity})`,
            }}
            initial={{ width: '0%' }}
            animate={{ width: `${level}%` }}
            transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
          />
        </div>
        {/* Label */}
        <motion.span
          style={{
            fontSize: 11, fontWeight: 600, minWidth: 44,
            color: level > 70 ? '#b87aff' : 'rgba(184,122,255,0.6)',
            fontFamily: "'DM Sans', sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {label}
        </motion.span>
      </div>
    </motion.div>
  );
}

export default function CreativeBrief({
  project,
  clips,
  onComplete,
  mode = 'create',
  onCancel,
  onUpdate,
}) {
  const projectId = project?.id;
  const [overallEnergy, setOverallEnergy] = useState(project?.overall_energy || '');
  const [musicStyle, setMusicStyle] = useState(project?.music_style_direction || '');
  const [references, setReferences] = useState(project?.references_text || '');
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const isValid = overallEnergy.trim() !== '' && musicStyle.trim() !== '';

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isValid) {
      toast.error('Please fill in the required fields.');
      return;
    }

    setSubmitting(true);

    try {
      const brief = {
        overall_energy: overallEnergy.trim(),
        music_style_direction: musicStyle.trim(),
        references_text: references.trim() || null,
      };

      if (mode === 'edit') {
        toast.loading('Updating your brief...', { id: 'brief' });
        await updateBrief(projectId, brief);
        toast.success('Brief updated!', { id: 'brief' });
        onUpdate?.(brief);
        setSubmitting(false);
        return;
      }

      toast.loading('Analyzing your brief...', { id: 'brief' });
      const { data } = await submitBrief(projectId, brief);
      const sections = data.sections || data;

      toast.success('Brief submitted!', { id: 'brief' });
      onComplete(sections);
    } catch (err) {
      console.error('Brief submission failed:', err);
      toast.error(err?.response?.data?.detail || 'Something went wrong. Try again.', {
        id: 'brief',
      });
      setSubmitting(false);
    }
  };

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
  };

  const fieldVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  };

  return (
    <motion.div
      style={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <motion.div
        style={styles.modal}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.9 }}
      >
        <h2 style={styles.heading}>
          <AnimatedEqualizer />
          Creative Brief
        </h2>
        <p style={styles.subtext}>
          Tell us about the vibe. This shapes the music we generate for each section.
        </p>

        <motion.form
          onSubmit={handleSubmit}
          style={styles.form}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Q1 - Overall Energy */}
          <motion.div style={styles.field} variants={fieldVariants}>
            <label style={styles.label}>
              What energy should the video have overall?{' '}
              <span style={styles.required}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <AnimatePresence>
                {focusedField === 'energy' && (
                  <motion.div
                    style={styles.focusGlow}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    layoutId="focusGlow"
                  />
                )}
              </AnimatePresence>
              <input
                type="text"
                value={overallEnergy}
                onChange={(e) => setOverallEnergy(e.target.value)}
                onFocus={() => setFocusedField('energy')}
                onBlur={() => setFocusedField(null)}
                placeholder='e.g. "Cinematic and uplifting, building to a peak"'
                style={{
                  ...styles.input,
                  borderColor: focusedField === 'energy' ? '#b87aff' : 'rgba(255,255,255,0.08)',
                }}
                disabled={submitting}
              />
            </div>
            {/* Energy visual indicator */}
            <EnergyIndicator text={overallEnergy} />
          </motion.div>

          {/* Q2 - Music Style */}
          <motion.div style={styles.field} variants={fieldVariants}>
            <label style={styles.label}>
              What music style do you want?{' '}
              <span style={styles.required}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <AnimatePresence>
                {focusedField === 'style' && (
                  <motion.div
                    style={styles.focusGlow}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
              </AnimatePresence>
              <input
                type="text"
                value={musicStyle}
                onChange={(e) => setMusicStyle(e.target.value)}
                onFocus={() => setFocusedField('style')}
                onBlur={() => setFocusedField(null)}
                placeholder='e.g. "Orchestral with modern electronic elements"'
                style={{
                  ...styles.input,
                  borderColor: focusedField === 'style' ? '#b87aff' : 'rgba(255,255,255,0.08)',
                }}
                disabled={submitting}
              />
            </div>
          </motion.div>

          {/* Q3 - References */}
          <motion.div style={styles.field} variants={fieldVariants}>
            <label style={styles.label}>
              Any references or inspiration?{' '}
              <span style={styles.optional}>(optional)</span>
            </label>
            <div style={{ position: 'relative' }}>
              <AnimatePresence>
                {focusedField === 'references' && (
                  <motion.div
                    style={styles.focusGlowTextarea}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
              </AnimatePresence>
              <textarea
                value={references}
                onChange={(e) => setReferences(e.target.value)}
                onFocus={() => setFocusedField('references')}
                onBlur={() => setFocusedField(null)}
                placeholder='e.g. "Hans Zimmer, Interstellar soundtrack, lo-fi beats"'
                rows={3}
                style={{
                  ...styles.textarea,
                  borderColor: focusedField === 'references' ? '#b87aff' : 'rgba(255,255,255,0.08)',
                }}
                disabled={submitting}
              />
            </div>
          </motion.div>

          {/* Submit */}
          <motion.div style={styles.actions} variants={fieldVariants}>
            {mode === 'edit' && (
              <motion.button
                type="button"
                style={styles.cancelBtn}
                onClick={onCancel}
                disabled={submitting}
                whileHover={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  transition: { duration: 0.15 },
                }}
              >
                Cancel
              </motion.button>
            )}
            <motion.button
              type="submit"
              disabled={!isValid || submitting}
              style={{
                ...styles.submitBtn,
                opacity: !isValid || submitting ? 0.4 : 1,
                cursor: !isValid || submitting ? 'not-allowed' : 'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
              whileHover={isValid && !submitting ? { scale: 1.02 } : {}}
              whileTap={isValid && !submitting ? { scale: 0.98 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              {/* Shimmer glow when valid */}
              {isValid && !submitting && (
                <motion.div
                  style={styles.shimmer}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {submitting
                  ? (mode === 'edit' ? 'Updating...' : 'Analyzing...')
                  : (mode === 'edit' ? 'Update Brief' : (
                    <>
                      Score My Video
                      <Sparkles size={16} />
                    </>
                  ))}
              </span>
            </motion.button>
          </motion.div>
        </motion.form>
      </motion.div>
    </motion.div>
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
  },
  modal: {
    width: '100%',
    maxWidth: 500,
    background: '#13151a',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '40px 36px',
  },
  heading: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 28,
    fontWeight: 400,
    color: '#ffffff',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.5,
    marginBottom: 32,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: 500,
  },
  required: {
    color: '#f87171',
    fontWeight: 400,
  },
  optional: {
    color: 'rgba(255,255,255,0.3)',
    fontWeight: 400,
    fontSize: 13,
  },
  input: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    padding: '12px 14px',
    background: '#0b0c10',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    color: '#ffffff',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box',
  },
  textarea: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    padding: '12px 14px',
    background: '#0b0c10',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    color: '#ffffff',
    fontSize: 14,
    outline: 'none',
    resize: 'vertical',
    minHeight: 72,
    lineHeight: 1.5,
    transition: 'border-color 0.2s',
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box',
  },
  focusGlow: {
    position: 'absolute',
    inset: -2,
    borderRadius: 12,
    background: 'transparent',
    boxShadow: '0 0 12px 2px rgba(184,122,255,0.2), 0 0 4px 1px rgba(184,122,255,0.1)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  focusGlowTextarea: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 12,
    background: 'transparent',
    boxShadow: '0 0 12px 2px rgba(184,122,255,0.2), 0 0 4px 1px rgba(184,122,255,0.1)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  submitBtn: {
    marginTop: 8,
    padding: '14px 32px',
    background: 'linear-gradient(135deg, #b87aff, #9333ea)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 10,
    border: 'none',
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: '0 0 24px rgba(184,122,255,0.2)',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '50%',
    height: '100%',
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
    zIndex: 0,
    pointerEvents: 'none',
  },
  actions: {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
  },
  cancelBtn: {
    padding: '12px 16px',
    background: 'transparent',
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.2)',
    fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer',
  },
};
