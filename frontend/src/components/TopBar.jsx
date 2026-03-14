import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, HelpCircle, X } from 'lucide-react';
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
    cursor: 'default',
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
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  exportBtn: {
    background: '#45f5c5',
    color: '#0b0c10',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 20px',
    borderRadius: 8,
    transition: 'all 0.2s',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  exportDisabled: {
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.25)',
    cursor: 'not-allowed',
  },
  modal: {
    position: 'fixed',
    inset: 0,
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
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    background: 'rgba(255,255,255,0.06)',
    border: 'none',
    borderRadius: 8,
    padding: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

const HOW_IT_WORKS_STEPS = [
  {
    num: 1,
    title: 'Import',
    desc: 'Drop your video clips onto the screen. We accept MP4, MOV, and WebM files.',
  },
  {
    num: 2,
    title: 'Describe',
    desc: 'Tell us the energy and style you want. Our AI analyzes your video structure.',
  },
  {
    num: 3,
    title: 'Score',
    desc: 'Generate unique music for each section. Refine with feedback until it\'s perfect.',
  },
];

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
        <motion.div
          style={styles.logo}
          whileHover={{ scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          {PRODUCT_NAME}
        </motion.div>

        <div style={styles.center}>
          <motion.button
            style={styles.howItWorks}
            onClick={() => setShowHowItWorks(true)}
            whileHover={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}
            whileTap={{ scale: 0.96 }}
          >
            <HelpCircle size={14} />
            How It Works
          </motion.button>
        </div>

        <motion.button
          style={{
            ...styles.exportBtn,
            ...(hasReadyTracks ? {} : styles.exportDisabled),
          }}
          onClick={handleExport}
          whileHover={hasReadyTracks ? { scale: 1.04, brightness: 1.1 } : {}}
          whileTap={hasReadyTracks ? { scale: 0.96 } : {}}
          animate={
            hasReadyTracks
              ? {
                  boxShadow: [
                    '0 0 0px rgba(69,245,197,0)',
                    '0 0 16px rgba(69,245,197,0.4)',
                    '0 0 0px rgba(69,245,197,0)',
                  ],
                }
              : { boxShadow: '0 0 0px rgba(69,245,197,0)' }
          }
          transition={
            hasReadyTracks
              ? { boxShadow: { duration: 2, repeat: Infinity, ease: 'easeInOut' } }
              : {}
          }
        >
          <Download size={14} />
          Export
        </motion.button>
      </div>

      <AnimatePresence>
        {showHowItWorks && (
          <motion.div
            style={styles.modal}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowHowItWorks(false)}
          >
            <motion.div
              style={{ ...styles.modalCard, position: 'relative' }}
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 350, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Overlay background rendered behind modal */}
              <motion.div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.7)',
                  zIndex: -1,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />

              <motion.button
                style={styles.closeBtn}
                onClick={() => setShowHowItWorks(false)}
                whileHover={{ background: 'rgba(255,255,255,0.12)' }}
                whileTap={{ scale: 0.9 }}
              >
                <X size={16} color="rgba(255,255,255,0.5)" />
              </motion.button>

              <h2 style={{ marginBottom: 32, fontSize: 24, color: '#fff' }}>How It Works</h2>

              {HOW_IT_WORKS_STEPS.map((step, i) => (
                <motion.div
                  key={step.num}
                  style={styles.step}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.15 * (i + 1),
                    type: 'spring',
                    stiffness: 300,
                    damping: 24,
                  }}
                >
                  <motion.div
                    style={styles.stepNumber}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      delay: 0.15 * (i + 1),
                      type: 'spring',
                      stiffness: 400,
                      damping: 15,
                    }}
                  >
                    {step.num}
                  </motion.div>
                  <div style={styles.stepText}>
                    <div style={styles.stepTitle}>{step.title}</div>
                    <div style={{ color: 'rgba(255,255,255,0.6)' }}>{step.desc}</div>
                  </div>
                </motion.div>
              ))}

              <motion.button
                style={{ ...styles.exportBtn, width: '100%', marginTop: 8, justifyContent: 'center' }}
                onClick={() => setShowHowItWorks(false)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                Got it
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
