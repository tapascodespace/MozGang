import { useState } from 'react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Music } from 'lucide-react';
import { submitBrief, updateBrief } from '../services/api';

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

  // Stagger children variants
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const fieldVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: 'easeOut' },
    },
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
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 28,
          mass: 0.9,
        }}
      >
        <h2 style={styles.heading}>
          <Music size={24} style={{ marginRight: 10, verticalAlign: 'middle', color: '#45f5c5' }} />
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
                  borderColor: focusedField === 'energy' ? '#45f5c5' : 'rgba(255,255,255,0.08)',
                }}
                disabled={submitting}
              />
            </div>
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
                  borderColor: focusedField === 'style' ? '#45f5c5' : 'rgba(255,255,255,0.08)',
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
                  borderColor: focusedField === 'references' ? '#45f5c5' : 'rgba(255,255,255,0.08)',
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
                  animate={{
                    x: ['-100%', '200%'],
                  }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    repeatDelay: 1.5,
                    ease: 'easeInOut',
                  }}
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
    boxShadow: '0 0 12px 2px rgba(69,245,197,0.2), 0 0 4px 1px rgba(69,245,197,0.1)',
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
    boxShadow: '0 0 12px 2px rgba(69,245,197,0.2), 0 0 4px 1px rgba(69,245,197,0.1)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  submitBtn: {
    marginTop: 8,
    padding: '14px 32px',
    background: '#45f5c5',
    color: '#0b0c10',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 10,
    border: 'none',
    fontFamily: "'DM Sans', sans-serif",
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '50%',
    height: '100%',
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
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
