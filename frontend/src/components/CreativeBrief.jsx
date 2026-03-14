import { useState } from 'react';
import toast from 'react-hot-toast';
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

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.heading}>Creative Brief</h2>
        <p style={styles.subtext}>
          Tell us about the vibe. This shapes the music we generate for each section.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Q1 - Overall Energy */}
          <div style={styles.field}>
            <label style={styles.label}>
              What energy should the video have overall?{' '}
              <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              value={overallEnergy}
              onChange={(e) => setOverallEnergy(e.target.value)}
              placeholder='e.g. "Cinematic and uplifting, building to a peak"'
              style={styles.input}
              disabled={submitting}
            />
          </div>

          {/* Q2 - Music Style */}
          <div style={styles.field}>
            <label style={styles.label}>
              What music style do you want?{' '}
              <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              value={musicStyle}
              onChange={(e) => setMusicStyle(e.target.value)}
              placeholder='e.g. "Orchestral with modern electronic elements"'
              style={styles.input}
              disabled={submitting}
            />
          </div>

          {/* Q3 - References */}
          <div style={styles.field}>
            <label style={styles.label}>
              Any references or inspiration?{' '}
              <span style={styles.optional}>(optional)</span>
            </label>
            <textarea
              value={references}
              onChange={(e) => setReferences(e.target.value)}
              placeholder='e.g. "Hans Zimmer, Interstellar soundtrack, lo-fi beats"'
              rows={3}
              style={styles.textarea}
              disabled={submitting}
            />
          </div>

          {/* Submit */}
          <div style={styles.actions}>
            {mode === 'edit' && (
              <button
                type="button"
                style={styles.cancelBtn}
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!isValid || submitting}
              style={{
                ...styles.submitBtn,
                opacity: !isValid || submitting ? 0.4 : 1,
                cursor: !isValid || submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting
                ? (mode === 'edit' ? 'Updating...' : 'Analyzing...')
                : (mode === 'edit' ? 'Update Brief' : 'Score My Video \u2192')}
            </button>
          </div>
        </form>
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
  },
  textarea: {
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
    transition: 'opacity 0.2s, transform 0.15s',
    fontFamily: "'DM Sans', sans-serif",
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
