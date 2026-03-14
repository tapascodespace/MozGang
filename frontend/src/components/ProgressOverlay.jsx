import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

const STEPS = [
  { key: 'upload', label: 'Uploading clips...' },
  { key: 'frames', label: 'Extracting frames...' },
  { key: 'transcribe', label: 'Transcribing audio...' },
  { key: 'analyze', label: 'Analysing video structure...' },
];

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
    color: '#fff',
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
  visualizerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 48,
    margin: '0 auto 24px',
  },
  visualizerBar: {
    width: 4,
    borderRadius: 2,
    background: '#45f5c5',
  },
  iconContainer: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  typingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 28,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.3)',
  },
  typingLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    marginRight: 4,
  },
};

function AudioVisualizer() {
  const BAR_COUNT = 16;
  return (
    <div style={styles.visualizerContainer}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <motion.div
          key={i}
          style={styles.visualizerBar}
          animate={{
            height: [8, Math.random() * 32 + 12, 6, Math.random() * 28 + 14, 8],
          }}
          transition={{
            duration: 1.0 + Math.random() * 0.6,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.05,
          }}
        />
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <div style={styles.typingContainer}>
      <span style={styles.typingLabel}>Thinking</span>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          style={styles.typingDot}
          animate={{
            opacity: [0.3, 1, 0.3],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  );
}

function CompletedIcon() {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      style={{
        ...styles.iconContainer,
        background: 'rgba(69,245,197,0.15)',
      }}
    >
      <Check size={14} color="#45f5c5" strokeWidth={3} />
    </motion.div>
  );
}

function ActiveIcon() {
  return (
    <motion.div
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.8, 1, 0.8],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      style={{
        ...styles.iconContainer,
        background: 'rgba(245,166,35,0.15)',
      }}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      >
        <Loader2 size={14} color="#F5A623" strokeWidth={2.5} />
      </motion.div>
    </motion.div>
  );
}

function PendingDot() {
  return (
    <div
      style={{
        ...styles.dot,
        background: 'rgba(255,255,255,0.15)',
      }}
    />
  );
}

export default function ProgressOverlay({ currentStep = 'analyze' }) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div style={styles.overlay}>
      <motion.div
        style={styles.card}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      >
        <AudioVisualizer />
        <h2 style={styles.title}>Analyzing your video</h2>
        <div style={styles.steps}>
          <AnimatePresence mode="popLayout">
            {STEPS.map((step, i) => {
              const isCompleted = i < currentIdx;
              const isActive = i === currentIdx;

              return (
                <motion.div
                  key={step.key}
                  style={styles.step}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 25,
                    delay: i * 0.08,
                  }}
                >
                  {isCompleted && <CompletedIcon />}
                  {isActive && <ActiveIcon />}
                  {!isCompleted && !isActive && <PendingDot />}
                  <span
                    style={{
                      color: i <= currentIdx ? '#fff' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {step.label}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <TypingDots />
      </motion.div>
    </div>
  );
}
